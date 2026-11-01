#ifndef PTY_BRIDGE_H
#define PTY_BRIDGE_H

#include <jni.h>

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Class:     com_sednium_kryptonide_terminal_PtyBridge
 * Method:    createSubprocess
 * Signature: (Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;[III)I
 */
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
);

/*
 * Class:     com_sednium_kryptonide_terminal_PtyBridge
 * Method:    setPtyWindowSize
 * Signature: (III)V
 */
JNIEXPORT void JNICALL
Java_com_sednium_kryptonide_terminal_PtyBridge_setPtyWindowSize(
    JNIEnv *env,
    jobject thiz,
    jint masterFd,
    jint rows,
    jint cols
);

/*
 * Class:     com_sednium_kryptonide_terminal_PtyBridge
 * Method:    sendSignal
 * Signature: (II)V
 */
JNIEXPORT void JNICALL
Java_com_sednium_kryptonide_terminal_PtyBridge_sendSignal(
    JNIEnv *env,
    jobject thiz,
    jint pid,
    jint signal
);

/*
 * Class:     com_sednium_kryptonide_terminal_PtyBridge
 * Method:    closePty
 * Signature: (I)V
 */
JNIEXPORT void JNICALL
Java_com_sednium_kryptonide_terminal_PtyBridge_closePty(
    JNIEnv *env,
    jobject thiz,
    jint masterFd
);

#ifdef __cplusplus
}
#endif

#endif /* PTY_BRIDGE_H */
