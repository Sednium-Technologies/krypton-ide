package com.sednium.kryptonide.core

import java.nio.ByteBuffer

/**
 * Interface implemented by Kotlin listeners to receive streaming search matches from Rust.
 */
fun interface KryptonSearchCallback {
    fun onBatchFound(jsonBatch: String)
}

/**
 * JNI bindings to `libkrypton_core_rs.so` (built via cargo-ndk).
 *
 * All operations cross the FFI boundary safely using `catch_unwind` in Rust,
 * preventing SIGSEGV or uncaught panics in the JVM.
 */
object KryptonCoreNative {

    private var isLoaded = false

    init {
        try {
            System.loadLibrary("krypton_core_rs")
            isLoaded = true
        } catch (e: UnsatisfiedLinkError) {
            android.util.Log.w("KryptonCoreNative", "Native library libkrypton_core_rs.so not loaded: ${e.message}")
        }
    }

    fun isAvailable(): Boolean = isLoaded

    @JvmStatic
    external fun nativeCreateCancelToken(): Long

    @JvmStatic
    external fun nativeCancelOperation(tokenId: Long): Boolean

    @JvmStatic
    external fun nativeUnregisterCancelToken(tokenId: Long)

    @JvmStatic
    external fun nativeSearchDisk(
        dirPath: String,
        query: String,
        isRegex: Boolean,
        matchCase: Boolean,
        maxMatches: Int,
        tokenId: Long,
        callback: KryptonSearchCallback
    ): Int

    @JvmStatic
    external fun nativeComputeDiff(
        oldText: String,
        newText: String
    ): String?

    @JvmStatic
    external fun nativeAifPrune(
        directBuffer: ByteBuffer,
        maxTokens: Int
    ): ByteArray?
}
