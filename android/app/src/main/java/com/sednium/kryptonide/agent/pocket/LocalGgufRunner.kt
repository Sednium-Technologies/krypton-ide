package com.sednium.kryptonide.agent.pocket

import android.util.Log
import com.sednium.kryptonide.agent.hardware.HardwareTopology
import com.sednium.kryptonide.agent.hardware.OortyNativeBridge
import java.io.File

/**
 * JNI wrapper for a llama.cpp-compatible runner.
 *
 * The optional `oorty_llama` library is loaded lazily. When it is not packaged
 * the runner reports [isAvailable] = false and callers fall back to the hosted
 * endpoint configured in the WebView, so the app never hard-crashes on devices
 * or emulators without the native inference build.
 */
object LocalGgufRunner {

    private const val TAG = "LocalGgufRunner"

    @Volatile
    private var loaded: Boolean = false

    @Volatile
    private var handle: Long = 0L

    init {
        loaded = try {
            System.loadLibrary("oorty_llama")
            true
        } catch (e: UnsatisfiedLinkError) {
            Log.w(TAG, "liboorty_llama.so unavailable; local GGUF inference disabled")
            false
        }
    }

    val isAvailable: Boolean get() = loaded

    @JvmStatic
    private external fun nativeLoadModel(path: String, threads: Int, contextLength: Int): Long

    @JvmStatic
    private external fun nativeGenerate(handle: Long, prompt: String, maxTokens: Int): String

    @JvmStatic
    private external fun nativeFreeModel(handle: Long)

    @Synchronized
    fun load(model: ScannedModel, contextLength: Int = 4096): Boolean {
        if (!loaded) return false
        val file = File(model.path)
        if (!file.exists()) return false
        val threads = OortyNativeBridge.optimalThreadCount(
            HardwareTopology.scan().performanceCoreCount,
        )
        return try {
            unload()
            handle = nativeLoadModel(file.absolutePath, threads, contextLength)
            // Pin worker threads to performance cores when the native engine supports it.
            repeat(threads) { index -> OortyNativeBridge.bindThreadToBigCore(index) }
            handle > 0L
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load ${model.path}", e)
            handle = 0L
            false
        }
    }

    @Synchronized
    fun generate(prompt: String, maxTokens: Int = 512): String? {
        if (!loaded || handle <= 0L) return null
        return try {
            nativeGenerate(handle, prompt, maxTokens)
        } catch (e: Exception) {
            Log.e(TAG, "Generation failed", e)
            null
        }
    }

    @Synchronized
    fun unload() {
        if (!loaded || handle <= 0L) return
        try {
            nativeFreeModel(handle)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to free model", e)
        } finally {
            handle = 0L
        }
    }

    fun currentHandle(): Long = handle
}
