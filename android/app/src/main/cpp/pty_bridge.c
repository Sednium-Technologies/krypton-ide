#include "pty_bridge.h"

#include <jni.h>
#include <pty.h>
#include <utmp.h>
#include <termios.h>
#include <unistd.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <sys/ioctl.h>
#include <sys/wait.h>
#include <signal.h>
#include <errno.h>
#include <android/log.h>

#define TAG "KryptonPty"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

JNIEXPORT jint JNICALL
Java_com_sednium_kryptonide_terminal_PtyBridge_createSubprocess(
    JNIEnv *env,
    jobject thiz,
    jstring cmd,
    jstring cwd,
    jobjectArray envVars,
    jintArray processId,
    jint rows,
    jint cols
) {
    char *cmd_str = NULL;
    if (cmd != NULL) {
        const char *chars = (*env)->GetStringUTFChars(env, cmd, NULL);
        if (chars != NULL) {
            cmd_str = strdup(chars);
            (*env)->ReleaseStringUTFChars(env, cmd, chars);
        }
    }

    char *cwd_str = NULL;
    if (cwd != NULL) {
        const char *chars = (*env)->GetStringUTFChars(env, cwd, NULL);
        if (chars != NULL) {
            cwd_str = strdup(chars);
            (*env)->ReleaseStringUTFChars(env, cwd, chars);
        }
    }

    int env_count = 0;
    char **env_list = NULL;
    if (envVars != NULL) {
        jsize len = (*env)->GetArrayLength(env, envVars);
        if (len > 0) {
            env_list = (char **)calloc((size_t)len, sizeof(char *));
            if (env_list != NULL) {
                for (jsize i = 0; i < len; i++) {
                    jstring env_jstr = (jstring)(*env)->GetObjectArrayElement(env, envVars, i);
                    if (env_jstr != NULL) {
                        const char *chars = (*env)->GetStringUTFChars(env, env_jstr, NULL);
                        if (chars != NULL) {
                            env_list[env_count++] = strdup(chars);
                            (*env)->ReleaseStringUTFChars(env, env_jstr, chars);
                        }
                        (*env)->DeleteLocalRef(env, env_jstr);
                    }
                }
            }
        }
    }

    struct winsize ws;
    memset(&ws, 0, sizeof(ws));
    ws.ws_row = (unsigned short)rows;
    ws.ws_col = (unsigned short)cols;

    int masterFd = -1;
    int slaveFd = -1;

    if (openpty(&masterFd, &slaveFd, NULL, NULL, &ws) < 0) {
        LOGE("openpty failed: %s", strerror(errno));
        if (cmd_str != NULL) free(cmd_str);
        if (cwd_str != NULL) free(cwd_str);
        if (env_list != NULL) {
            for (int i = 0; i < env_count; i++) {
                if (env_list[i] != NULL) free(env_list[i]);
            }
            free(env_list);
        }
        return -1;
    }

    int flags = fcntl(masterFd, F_GETFL, 0);
    if (flags >= 0) {
        fcntl(masterFd, F_SETFL, flags | O_NONBLOCK);
    } else {
        fcntl(masterFd, F_SETFL, O_NONBLOCK);
    }

    pid_t pid = fork();
    if (pid < 0) {
        LOGE("fork failed: %s", strerror(errno));
        close(masterFd);
        close(slaveFd);
        if (cmd_str != NULL) free(cmd_str);
        if (cwd_str != NULL) free(cwd_str);
        if (env_list != NULL) {
            for (int i = 0; i < env_count; i++) {
                if (env_list[i] != NULL) free(env_list[i]);
            }
            free(env_list);
        }
        return -1;
    }

    if (pid == 0) {
        // Child process
        close(masterFd);

        if (login_tty(slaveFd) < 0) {
            LOGE("login_tty failed: %s", strerror(errno));
            setsid();
            ioctl(slaveFd, TIOCSCTTY, 0);
            dup2(slaveFd, STDIN_FILENO);
            dup2(slaveFd, STDOUT_FILENO);
            dup2(slaveFd, STDERR_FILENO);
            if (slaveFd > STDERR_FILENO) {
                close(slaveFd);
            }
        }

        // Set default environment variables
        setenv("TERM", "xterm-256color", 1);
        setenv("LANG", "en_US.UTF-8", 1);
        setenv("PREFIX", "/data/data/com.sednium.kryptonide.legacy/files/usr", 1);
        setenv("HOME", "/data/data/com.sednium.kryptonide.legacy/files/home", 1);
        setenv("TMPDIR", "/data/data/com.sednium.kryptonide.legacy/files/usr/tmp", 1);
        setenv("LD_LIBRARY_PATH", "/data/data/com.sednium.kryptonide.legacy/files/usr/lib", 1);

        // Termux path metadata. Packages are built with /data/data/com.termux
        // prefixes, so termux-exec uses these values to remap exec/open paths
        // into this app's sandbox. Without them, ELF binaries such as dpkg,
        // apt and pkg still look under the com.termux package data dir.
        setenv("TERMUX__ROOTFS", "/data/data/com.sednium.kryptonide.legacy/files", 1);
        setenv("TERMUX__PREFIX", "/data/data/com.sednium.kryptonide.legacy/files/usr", 1);
        setenv("TERMUX__HOME", "/data/data/com.sednium.kryptonide.legacy/files/home", 1);
        setenv("TERMUX_APP__DATA_DIR", "/data/data/com.sednium.kryptonide.legacy", 1);
        setenv("TERMUX_APP__LEGACY_DATA_DIR", "/data/data/com.sednium.kryptonide.legacy", 1);
        setenv("TERMUX_APP__BUILD_DATA_DIR", "/data/data/com.termux", 1);
        setenv("TERMUX_EXEC__EXECVE_CALL__INTERCEPT", "enable", 1);

        const char *termux_exec_lib = "/data/data/com.sednium.kryptonide.legacy/files/usr/lib/libtermux-exec-ld-preload.so";
        if (access(termux_exec_lib, R_OK) == 0) {
            setenv("LD_PRELOAD", termux_exec_lib, 1);
        }

        // Prepend /data/data/com.sednium.kryptonide.legacy/files/usr/bin to PATH
        const char *termux_bin = "/data/data/com.sednium.kryptonide.legacy/files/usr/bin";
        const char *curr_path = getenv("PATH");
        char new_path[4096];
        if (curr_path != NULL && strlen(curr_path) > 0) {
            snprintf(new_path, sizeof(new_path), "%s:%s", termux_bin, curr_path);
        } else {
            snprintf(new_path, sizeof(new_path), "%s:/system/bin:/system/xbin", termux_bin);
        }
        setenv("PATH", new_path, 1);

        // User-supplied env variables via setenv()
        if (env_list != NULL) {
            for (int i = 0; i < env_count; i++) {
                if (env_list[i] != NULL) {
                    char *eq = strchr(env_list[i], '=');
                    if (eq != NULL) {
                        *eq = '\0';
                        setenv(env_list[i], eq + 1, 1);
                    } else {
                        setenv(env_list[i], "", 1);
                    }
                }
            }
        }

        // Change directory to cwd if specified
        if (cwd_str != NULL && strlen(cwd_str) > 0) {
            if (chdir(cwd_str) != 0) {
                LOGE("chdir(%s) failed: %s; falling back to HOME", cwd_str, strerror(errno));
                if (chdir("/data/data/com.sednium.kryptonide.legacy/files/home") != 0) {
                    chdir("/data/data/com.sednium.kryptonide.legacy/files");
                }
            }
        } else {
            if (chdir("/data/data/com.sednium.kryptonide.legacy/files/home") != 0) {
                chdir("/data/data/com.sednium.kryptonide.legacy/files");
            }
        }

        // Execute shell with fallback
        if (cmd_str != NULL && strlen(cmd_str) > 0) {
            execl(cmd_str, cmd_str, "-l", (char *)NULL);
            execl(cmd_str, cmd_str, (char *)NULL);
        }
        execl("/data/data/com.sednium.kryptonide.legacy/files/usr/bin/bash", "bash", "-l", (char *)NULL);
        execl("/system/bin/sh", "sh", (char *)NULL);

        LOGE("execl failed: %s", strerror(errno));
        _exit(127);
    }

    // Parent process
    if (processId != NULL && (*env)->GetArrayLength(env, processId) > 0) {
        jint jpid = (jint)pid;
        (*env)->SetIntArrayRegion(env, processId, 0, 1, &jpid);
    }

    close(slaveFd);

    if (cmd_str != NULL) free(cmd_str);
    if (cwd_str != NULL) free(cwd_str);
    if (env_list != NULL) {
        for (int i = 0; i < env_count; i++) {
            if (env_list[i] != NULL) free(env_list[i]);
        }
        free(env_list);
    }

    return (jint)masterFd;
}

JNIEXPORT void JNICALL
Java_com_sednium_kryptonide_terminal_PtyBridge_setPtyWindowSize(
    JNIEnv *env,
    jobject thiz,
    jint masterFd,
    jint rows,
    jint cols
) {
    struct winsize ws;
    memset(&ws, 0, sizeof(ws));
    ws.ws_row = (unsigned short)rows;
    ws.ws_col = (unsigned short)cols;

    if (ioctl(masterFd, TIOCSWINSZ, &ws) < 0) {
        LOGE("ioctl TIOCSWINSZ failed on fd %d: %s", masterFd, strerror(errno));
    }
}

JNIEXPORT void JNICALL
Java_com_sednium_kryptonide_terminal_PtyBridge_sendSignal(
    JNIEnv *env,
    jobject thiz,
    jint pid,
    jint signal
) {
    if (kill((pid_t)pid, (int)signal) < 0) {
        LOGE("kill(pid=%d, signal=%d) failed: %s", pid, signal, strerror(errno));
    }
}

JNIEXPORT void JNICALL
Java_com_sednium_kryptonide_terminal_PtyBridge_closePty(
    JNIEnv *env,
    jobject thiz,
    jint masterFd
) {
    if (masterFd >= 0) {
        close(masterFd);
    }
}
