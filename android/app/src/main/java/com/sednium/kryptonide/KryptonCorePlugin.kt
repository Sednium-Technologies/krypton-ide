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
}
