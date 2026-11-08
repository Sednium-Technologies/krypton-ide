package com.sednium.kryptonide.agent.hardware

import android.util.Log
import java.io.File

/**
 * JNI bindings to liboorty_engine.so.
 *
 * Every call is guarded by [isAvailable] so the app still runs on builds where
 * the native library was not packaged (for example x86 emulators or unit tests).
 */
object OortyNativeBridge {

    private const val TAG = "OortyNativeBridge"

    @Volatile
    private var loaded: Boolean = false

    init {
        loaded = try {
            System.loadLibrary("oorty_engine")
            Log.i(TAG, "Loaded liboorty_engine.so")
            true
        } catch (e: UnsatisfiedLinkError) {
            Log.w(TAG, "liboorty_engine.so unavailable; using Kotlin fallbacks")
            false
        }
    }

    val isAvailable: Boolean get() = loaded

    @JvmStatic
    external fun nativeGetOptimalThreadCount(): Int

    @JvmStatic
    external fun nativeBindThreadToBigCores(threadIdx: Int): Boolean

    @JvmStatic
    external fun nativeDetectGpuVendor(): Int

    @JvmStatic
    external fun nativeGetPerformanceCoreCount(): Int

    fun optimalThreadCount(fallback: Int): Int {
        if (!loaded) return fallback.coerceAtLeast(1)
        return runCatching { nativeGetOptimalThreadCount() }
            .getOrElse { fallback }
            .coerceAtLeast(1)
    }

    fun bindThreadToBigCore(threadIdx: Int): Boolean {
        if (!loaded) return false
        return runCatching { nativeBindThreadToBigCores(threadIdx) }.getOrDefault(false)
    }

    fun detectGpuVendor(): Int {
        if (loaded) {
            runCatching { nativeDetectGpuVendor() }.getOrNull()?.let { return it }
        }
        return fallbackGpuVendor()
    }

    fun performanceCoreCount(fallback: Int): Int {
        if (!loaded) return fallback.coerceAtLeast(1)
        return runCatching { nativeGetPerformanceCoreCount() }
            .getOrElse { fallback }
            .coerceAtLeast(1)
    }

    private fun fallbackGpuVendor(): Int = when {
        File("/dev/kgsl-3d0").exists() -> 2
        File("/dev/mali0").exists() -> 1
        else -> 0
    }
}
