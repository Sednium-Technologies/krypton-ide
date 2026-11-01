package com.sednium.kryptonide.terminal

import android.os.ParcelFileDescriptor
import android.system.Os
import android.system.OsConstants
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.FileDescriptor
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Represents a running terminal session connected to a native PTY master descriptor.
 * Manages asynchronous reading on Dispatchers.IO and thread-safe writes.
 */
class TerminalSession(
    val sessionId: String,
    val masterFd: Int,
    val processId: Int,
    var onOutput: ((ByteArray) -> Unit)? = null,
    var onExit: ((Int) -> Unit)? = null
) {
    companion object {
        private const val TAG = "TerminalSession"
        private const val BUFFER_SIZE = 4096
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val isRunning = AtomicBoolean(true)
    private val writeLock = Any()

    private val pfd: ParcelFileDescriptor?
    private val fileDescriptor: FileDescriptor
    private val inputStream: FileInputStream
    private val outputStream: FileOutputStream

    init {
        val (adoptedPfd, fd) = createFileDescriptor(masterFd)
        pfd = adoptedPfd
        fileDescriptor = fd

        // Ensure master PTY descriptor is in blocking mode for the coroutine IO reader thread
        try {
            val flags = Os.fcntlInt(fileDescriptor, OsConstants.F_GETFL, 0)
            if ((flags and OsConstants.O_NONBLOCK) != 0) {
                Os.fcntlInt(fileDescriptor, OsConstants.F_SETFL, flags and OsConstants.O_NONBLOCK.inv())
            }
        } catch (e: Throwable) {
            Log.w(TAG, "Could not adjust fcntl flags for fd $masterFd: ${e.message}")
        }

        inputStream = FileInputStream(fileDescriptor)
        outputStream = FileOutputStream(fileDescriptor)

        startReaderLoop()
    }

    private fun createFileDescriptor(fdInt: Int): Pair<ParcelFileDescriptor?, FileDescriptor> {
        return try {
            val adopted = ParcelFileDescriptor.adoptFd(fdInt)
            Pair(adopted, adopted.fileDescriptor)
        } catch (e: Exception) {
            Log.w(TAG, "ParcelFileDescriptor.adoptFd failed, using reflection fallback", e)
            val fd = FileDescriptor()
            try {
                val field = FileDescriptor::class.java.getDeclaredField("descriptor")
                field.isAccessible = true
                field.setInt(fd, fdInt)
            } catch (ex: Exception) {
                val field = FileDescriptor::class.java.getDeclaredField("fd")
                field.isAccessible = true
                field.setInt(fd, fdInt)
            }
            Pair(null, fd)
        }
    }

    private fun startReaderLoop() {
        scope.launch {
            val buffer = ByteArray(BUFFER_SIZE)
            while (isActive && isRunning.get()) {
                try {
                    val bytesRead = inputStream.read(buffer)
                    if (bytesRead < 0) {
                        // EOF reached (subprocess exited and slave closed)
                        break
                    }
                    if (bytesRead > 0) {
                        val chunk = buffer.copyOf(bytesRead)
                        onOutput?.invoke(chunk)
                    }
                } catch (e: IOException) {
                    val msg = e.message ?: ""
                    // If descriptor was non-blocking and no bytes are ready yet
                    if (msg.contains("EAGAIN") || msg.contains("Resource temporarily unavailable")) {
                        delay(10)
                        continue
                    }
                    // Linux PTY returns EIO when slave closes on process termination
                    if (isRunning.get() && !msg.contains("EIO") && !msg.contains("Bad file descriptor")) {
                        Log.d(TAG, "Session $sessionId I/O finished: ${e.message}")
                    }
                    break
                } catch (e: Exception) {
                    if (isRunning.get()) {
                        Log.w(TAG, "Error reading from session $sessionId: ${e.message}")
                    }
                    break
                }
            }
            destroy()
        }
    }

    /**
     * Thread-safe write of UTF-8 string to PTY master descriptor.
     */
    fun write(data: String) {
        write(data.toByteArray(Charsets.UTF_8))
    }

    /**
     * Thread-safe write of raw byte array to PTY master descriptor.
     */
    fun write(bytes: ByteArray) {
        if (!isRunning.get()) return
        synchronized(writeLock) {
            try {
                outputStream.write(bytes)
                outputStream.flush()
            } catch (e: Exception) {
                if (isRunning.get()) {
                    Log.e(TAG, "Error writing to session $sessionId", e)
                }
            }
        }
    }

    /**
     * Resizes the PTY window dimensions.
     */
    fun resize(rows: Int, cols: Int) {
        if (!isRunning.get() || masterFd < 0) return
        try {
            PtyBridge.setPtyWindowSize(masterFd, rows, cols)
        } catch (e: Exception) {
            Log.e(TAG, "Error resizing PTY for session $sessionId", e)
        }
    }

    /**
     * Terminates the session, cancels coroutines, sends SIGHUP/SIGTERM to subprocess,
     * and closes the master descriptor.
     */
    fun destroy() {
        if (!isRunning.compareAndSet(true, false)) return

        try {
            if (processId > 0) {
                PtyBridge.sendSignal(processId, 1)  // SIGHUP
                PtyBridge.sendSignal(processId, 15) // SIGTERM
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error sending signal to process $processId", e)
        }

        scope.cancel()

        try {
            inputStream.close()
        } catch (_: Exception) {}

        try {
            outputStream.close()
        } catch (_: Exception) {}

        try {
            pfd?.close()
        } catch (_: Exception) {}

        try {
            if (masterFd >= 0) {
                PtyBridge.closePty(masterFd)
            }
        } catch (_: Exception) {}

        onExit?.invoke(0)
    }
}
