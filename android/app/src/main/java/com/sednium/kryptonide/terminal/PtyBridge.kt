package com.sednium.kryptonide.terminal

import android.util.Log

/**
 * JNI Bridge to libkrypton-pty.so for POSIX pseudo-terminal (PTY) lifecycle management.
 */
object PtyBridge {
    private const val TAG = "PtyBridge"

    init {
        try {
            System.loadLibrary("krypton-pty")
            Log.i(TAG, "Successfully loaded libkrypton-pty.so")
        } catch (e: UnsatisfiedLinkError) {
            Log.e(TAG, "Failed to load libkrypton-pty.so", e)
        }
    }

    /**
     * Forks and executes a subprocess attached to a newly created PTY master/slave pair.
     *
     * @param cmd Command/executable path to run (or null for bash/sh fallback).
     * @param cwd Initial working directory for the child process.
     * @param envVars Array of "KEY=VALUE" environment strings.
     * @param processId Output array of size >= 1 to receive the child PID.
     * @param rows Initial terminal rows.
     * @param cols Initial terminal columns.
     * @return Master PTY file descriptor (>= 0), or -1 on failure.
     */
    @JvmStatic
    external fun createSubprocess(
        cmd: String?,
        cwd: String?,
        envVars: Array<String>?,
        processId: IntArray,
        rows: Int,
        cols: Int
    ): Int

    /**
     * Updates the terminal window dimensions (rows and columns) via ioctl(TIOCSWINSZ).
     */
    @JvmStatic
    external fun setPtyWindowSize(masterFd: Int, rows: Int, cols: Int)

    /**
     * Sends a POSIX signal (e.g. SIGHUP=1, SIGINT=2, SIGTERM=15, SIGKILL=9) to the subprocess.
     */
    @JvmStatic
    external fun sendSignal(pid: Int, signal: Int)

    /**
     * Closes the master PTY file descriptor.
     */
    @JvmStatic
    external fun closePty(masterFd: Int)
}
