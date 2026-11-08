package com.sednium.kryptonide

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.sednium.kryptonide.core.KryptonCoreNative
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import java.io.File
import java.nio.ByteBuffer

@CapacitorPlugin(name = "KryptonCore")
class KryptonCorePlugin : Plugin() {

    private val pluginScope = CoroutineScope(Dispatchers.IO)

    @PluginMethod
    fun searchFiles(call: PluginCall) {
        val query = call.getString("query")
        val dirPath = call.getString("dirPath") ?: context.filesDir.absolutePath
        val isRegex = call.getBoolean("isRegex", false) ?: false
        val matchCase = call.getBoolean("matchCase", false) ?: false
        val maxMatches = call.getInt("maxMatches", 500) ?: 500

        if (query.isNullOrEmpty()) {
            val ret = JSObject()
            ret.put("results", JSArray())
            ret.put("wasCancelled", false)
            call.resolve(ret)
            return
        }

        if (!KryptonCoreNative.isAvailable()) {
            call.reject("Native krypton-core engine is not loaded")
            return
        }

        pluginScope.launch {
            val tokenId = KryptonCoreNative.nativeCreateCancelToken()
            val allMatches = JSArray()

            try {
                val statusCode = KryptonCoreNative.nativeSearchDisk(
                    dirPath,
                    query,
                    isRegex,
                    matchCase,
                    maxMatches,
                    tokenId
                ) { jsonBatch ->
                    try {
                        val batchArray = JSONArray(jsonBatch)
                        for (i in 0 until batchArray.length()) {
                            allMatches.put(batchArray.getJSONObject(i))
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("KryptonCorePlugin", "Failed to parse batch JSON: ${e.message}")
                    }
                }

                val ret = JSObject()
                ret.put("results", allMatches)
                ret.put("wasCancelled", statusCode == -2)
                ret.put("statusCode", statusCode)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Search failed: ${e.message}")
            } finally {
                KryptonCoreNative.nativeUnregisterCancelToken(tokenId)
            }
        }
    }

    @PluginMethod
    fun computeDiff(call: PluginCall) {
        val oldText = call.getString("oldText") ?: ""
        val newText = call.getString("newText") ?: ""

        if (!KryptonCoreNative.isAvailable()) {
            call.reject("Native krypton-core engine is not loaded")
            return
        }

        pluginScope.launch {
            try {
                val diffJson = KryptonCoreNative.nativeComputeDiff(oldText, newText)
                if (diffJson != null) {
                    val ret = JSObject(diffJson)
                    call.resolve(ret)
                } else {
                    call.reject("Diff computation returned null")
                }
            } catch (e: Exception) {
                call.reject("Diff failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun pruneAifContext(call: PluginCall) {
        val base64Input = call.getString("aifBinaryBase64")
        val maxTokens = call.getInt("maxTokens", 4096) ?: 4096

        if (base64Input.isNullOrEmpty()) {
            call.reject("Missing binary input")
            return
        }

        if (!KryptonCoreNative.isAvailable()) {
            call.reject("Native krypton-core engine is not loaded")
            return
        }

        pluginScope.launch {
            try {
                val rawBytes = android.util.Base64.decode(base64Input, android.util.Base64.NO_WRAP)
                val directBuffer = ByteBuffer.allocateDirect(rawBytes.size)
                directBuffer.put(rawBytes)
                directBuffer.flip()

                val prunedBytes = KryptonCoreNative.nativeAifPrune(directBuffer, maxTokens)
                if (prunedBytes != null) {
                    val encoded = android.util.Base64.encodeToString(prunedBytes, android.util.Base64.NO_WRAP)
                    val ret = JSObject()
                    ret.put("prunedBinaryBase64", encoded)
                    call.resolve(ret)
                } else {
                    call.reject("Pruning returned null")
                }
            } catch (e: Exception) {
                call.reject("Pruning failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun triggerHaptic(call: PluginCall) {
        val type = call.getString("type") ?: "click"
        try {
            val vibrator = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                val vibratorManager = context.getSystemService(android.content.Context.VIBRATOR_MANAGER_SERVICE) as? android.os.VibratorManager
                vibratorManager?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(android.content.Context.VIBRATOR_SERVICE) as? android.os.Vibrator
            }

            if (vibrator != null && vibrator.hasVibrator()) {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                    val effectId = when (type) {
                        "heavy" -> android.os.VibrationEffect.EFFECT_HEAVY_CLICK
                        "double_click" -> android.os.VibrationEffect.EFFECT_DOUBLE_CLICK
                        "tick" -> android.os.VibrationEffect.EFFECT_TICK
                        else -> android.os.VibrationEffect.EFFECT_CLICK
                    }
                    vibrator.vibrate(android.os.VibrationEffect.createPredefined(effectId))
                } else if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    val duration = when (type) {
                        "heavy" -> 35L
                        "tick" -> 10L
                        else -> 20L
                    }
                    vibrator.vibrate(android.os.VibrationEffect.createOneShot(duration, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION")
                    vibrator.vibrate(20L)
                }
            }
            call.resolve()
        } catch (e: Exception) {
            call.resolve()
        }
    }

    @PluginMethod
    fun openExternalUrl(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrEmpty()) {
            call.reject("URL missing")
            return
        }
        try {
            val intent = android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to open URL: ${e.message}")
        }
    }

    @PluginMethod
    fun deleteDirectory(call: PluginCall) {
        val path = call.getString("path")
        if (path.isNullOrEmpty()) {
            call.reject("Path missing")
            return
        }
        pluginScope.launch {
            try {
                val file = File(path)
                if (file.exists()) {
                    val success = file.deleteRecursively()
                    val ret = JSObject()
                    ret.put("success", success)
                    call.resolve(ret)
                } else {
                    val ret = JSObject()
                    ret.put("success", true)
                    call.resolve(ret)
                }
            } catch (e: Exception) {
                call.reject("Failed to delete directory: ${e.message}")
            }
        }
    }
}
