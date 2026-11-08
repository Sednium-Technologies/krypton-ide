package com.sednium.kryptonide.agent.pocket

import android.content.Context
import android.content.Intent
import android.os.Build
import com.sednium.kryptonide.KryptonBackgroundService

/**
 * Lifecycle owner for the embedded Pocket Server.
 *
 * The server itself runs inside [KryptonBackgroundService] so Android does not
 * reclaim the process while a local model is allocating weights. This object
 * keeps the user-facing state in sync and is safe to call from any thread.
 */
object PocketServerManager {

    data class ServerState(
        val running: Boolean,
        val selectedModelId: String,
        val engineMode: String,
        val foregroundService: Boolean,
        val lastError: String? = null,
    )

    @Volatile
    private var running: Boolean = false

    @Volatile
    private var selectedModelId: String = PocketModels.defaultModelId

    @Volatile
    private var engineMode: String = "laya_system1"

    @Volatile
    private var lastError: String? = null

    fun state(): ServerState = ServerState(
        running = running,
        selectedModelId = selectedModelId,
        engineMode = engineMode,
        foregroundService = running,
        lastError = lastError,
    )

    fun isRunning(): Boolean = running

    fun currentModelId(): String = selectedModelId

    fun selectModel(modelId: String): Boolean {
        val model = PocketModels.find(modelId) ?: return false
        selectedModelId = model.id
        engineMode = when (model.type) {
            "local", "gguf" -> "local_gguf"
            "onnx" -> "laya_system1"
            "api" -> "api_fallback"
            else -> "laya_system1"
        }
        return true
    }

    fun start(context: Context): ServerState {
        return try {
            val intent = Intent(context, KryptonBackgroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            running = true
            lastError = null
            state()
        } catch (e: Exception) {
            running = false
            lastError = e.message ?: "Failed to start Pocket Server"
            state()
        }
    }

    fun stop(context: Context): ServerState {
        return try {
            context.stopService(Intent(context, KryptonBackgroundService::class.java))
            running = false
            lastError = null
            state()
        } catch (e: Exception) {
            lastError = e.message ?: "Failed to stop Pocket Server"
            state()
        }
    }
}
