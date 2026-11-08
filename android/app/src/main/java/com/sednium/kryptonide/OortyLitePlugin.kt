package com.sednium.kryptonide

import android.content.Intent
import android.net.Uri
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.sednium.kryptonide.agent.aif.AifBlock
import com.sednium.kryptonide.agent.aif.AifMemoryManager
import com.sednium.kryptonide.agent.hardware.HardwareTopology
import com.sednium.kryptonide.agent.hardware.HardwareSnapshot
import com.sednium.kryptonide.agent.oorty.SystemPrompt
import com.sednium.kryptonide.agent.pocket.ExecutionTier
import com.sednium.kryptonide.agent.pocket.LayaSystemOneEngine
import com.sednium.kryptonide.agent.pocket.PocketModels
import com.sednium.kryptonide.agent.pocket.PocketServerManager
import com.sednium.kryptonide.agent.pocket.StorageModelScanner
import com.sednium.kryptonide.agent.tools.AgentToolRegistry
import com.sednium.kryptonide.agent.tools.McpServerConfig
import com.sednium.kryptonide.agent.ui.PocketServerActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * Capacitor bridge for the native Oorty Lite agent, Pocket Server, AIF memory
 * and hardware topology. The WebView can use this plugin to execute the same
 * typed tools as the native Compose UI.
 */
@CapacitorPlugin(name = "OortyLite")
class OortyLitePlugin : Plugin() {

    private val pluginScope = CoroutineScope(Dispatchers.IO)
    private val registries = ConcurrentHashMap<String, AgentToolRegistry>()

    @Volatile
    private var executionTier: ExecutionTier = ExecutionTier.SUPERVISED

    @Volatile
    private var mcpConfigs: List<McpServerConfig> = emptyList()

    private fun registry(projectId: String?): AgentToolRegistry {
        val key = projectId ?: "default"
        return registries.getOrPut(key) {
            AgentToolRegistry(
                context = context,
                projectId = projectId,
                executionTierProvider = { executionTier },
                mcpServersProvider = { mcpConfigs },
            )
        }
    }

    @PluginMethod
    fun getSystemPrompt(call: PluginCall) {
        call.resolve(JSObject().apply {
            put("version", SystemPrompt.VERSION)
            put("upstream", SystemPrompt.UPSTREAM_URL)
            put("label", SystemPrompt.UPSTREAM_LABEL)
            put("prompt", SystemPrompt.IMMUTABLE)
        })
    }

    @PluginMethod
    fun route(call: PluginCall) {
        val query = call.getString("query") ?: ""
        val decision = LayaSystemOneEngine.route(query)
        call.resolve(JSObject().apply {
            put("route", decision.route.name.lowercase())
            put("confidence", decision.confidence)
            put("reason", decision.reason)
        })
    }

    @PluginMethod
    fun assessRisk(call: PluginCall) {
        val command = call.getString("command") ?: ""
        val risk = LayaSystemOneEngine.risk(command)
        call.resolve(JSObject().apply {
            put("level", risk.level.name.lowercase())
            put("score", risk.score)
            put("requiresConfirmation", risk.requiresConfirmation)
            put("reasons", JSArray(risk.reasons))
        })
    }

    @PluginMethod
    fun pruneOutput(call: PluginCall) {
        val output = call.getString("output") ?: ""
        val maxLines = call.getInt("maxLines", 80) ?: 80
        call.resolve(JSObject().apply {
            put("output", LayaSystemOneEngine.prune(output, maxLines))
        })
    }

    @PluginMethod
    fun hardware(call: PluginCall) {
        call.resolve(hardwareJson(HardwareTopology.scan(context)))
    }

    @PluginMethod
    fun listModels(call: PluginCall) {
        val array = JSArray()
        PocketModels.catalog.forEach { model ->
            array.put(JSONObject().apply {
                put("id", model.id)
                put("name", model.name)
                put("type", model.type)
                put("quantization", model.quantization)
                put("contextLength", model.contextLength)
                put("sizeBytes", model.sizeBytes)
                put("sizeLabel", model.sizeLabel)
                put("description", model.description)
                put("huggingFaceId", model.huggingFaceId)
                put("sectors", JSArray(model.sectors))
            })
        }
        call.resolve(JSObject().apply { put("models", array) })
    }

    @PluginMethod
    fun scanModels(call: PluginCall) {
        pluginScope.launch {
            val scanned = StorageModelScanner.scan(context)
            val array = JSArray()
            scanned.forEach { model ->
                array.put(JSONObject().apply {
                    put("name", model.name)
                    put("path", model.path)
                    put("format", model.format)
                    put("sizeBytes", model.sizeBytes)
                    put("modifiedAt", model.modifiedAt)
                })
            }
            call.resolve(JSObject().apply { put("models", array) })
        }
    }

    @PluginMethod
    fun aifRecall(call: PluginCall) {
        val projectId = call.getString("projectId") ?: "default"
        val limit = call.getInt("limit", 12) ?: 12
        val memory = AifMemoryManager(context)
        val blocks = memory.recall(projectId, limit)
        call.resolve(JSObject().apply {
            put("context", memory.bootRecallContext(projectId, limit))
            put("blocks", blocksJson(blocks))
        })
    }

    @PluginMethod
    fun aifCommit(call: PluginCall) {
        val projectId = call.getString("projectId") ?: "default"
        val summary = call.getString("summary") ?: run {
            call.reject("summary is required")
            return
        }
        val importance = (call.getDouble("importance") ?: 0.5).toFloat()
        val tagsArray = call.getArray("tags")
        val tags = buildList {
            if (tagsArray != null) {
                for (index in 0 until tagsArray.length()) {
                    tagsArray.getString(index)?.let { add(it) }
                }
            }
        }
        val block = AifMemoryManager(context).commit(projectId, summary, importance, tags)
        call.resolve(JSObject().apply { put("block", blockJson(block)) })
    }

    @PluginMethod
    fun aifScratch(call: PluginCall) {
        val projectId = call.getString("projectId") ?: "default"
        val intent = call.getString("intent") ?: run {
            call.reject("intent is required")
            return
        }
        val file = AifMemoryManager(context).writeScratch(projectId, intent)
        call.resolve(JSObject().apply { put("path", file.absolutePath) })
    }

    @PluginMethod
    fun aifQuery(call: PluginCall) {
        val projectId = call.getString("projectId") ?: "default"
        val keyword = call.getString("keyword") ?: run {
            call.reject("keyword is required")
            return
        }
        val blocks = AifMemoryManager(context).query(projectId, keyword)
        call.resolve(JSObject().apply { put("blocks", blocksJson(blocks)) })
    }

    @PluginMethod
    fun listTools(call: PluginCall) {
        val projectId = call.getString("projectId")
        val format = call.getString("format") ?: "gemini"
        val registry = registry(projectId)
        call.resolve(JSObject().apply {
            put("tools", registry.schemas(format))
            put("mcpTools", registry.listMcpTools().size)
        })
    }

    @PluginMethod
    fun executeTool(call: PluginCall) {
        val projectId = call.getString("projectId")
        val name = call.getString("name") ?: run {
            call.reject("name is required")
            return
        }
        val args = call.getObject("arguments") ?: JSObject()
        pluginScope.launch {
            val result = registry(projectId).execute(name, args)
            call.resolve(JSObject(result.toJson().toString()))
        }
    }

    @PluginMethod
    fun configure(call: PluginCall) {
        val tier = call.getString("executionTier")
        if (!tier.isNullOrBlank()) {
            executionTier = runCatching { ExecutionTier.valueOf(tier.uppercase()) }
                .getOrDefault(ExecutionTier.SUPERVISED)
        }

        val servers = call.getArray("servers")
        if (servers != null) {
            val configs = ArrayList<McpServerConfig>()
            for (index in 0 until servers.length()) {
                val item = servers.optJSONObject(index) ?: continue
                val argsArray = item.optJSONArray("args")
                val args = buildList {
                    if (argsArray != null) {
                        for (argIndex in 0 until argsArray.length()) {
                            argsArray.optString(argIndex)?.let { add(it) }
                        }
                    }
                }
                val headersObject = item.optJSONObject("headers")
                val headers = buildMap {
                    headersObject?.keys()?.forEach { key ->
                        headersObject.optString(key)?.let { put(key, it) }
                    }
                }
                configs += McpServerConfig(
                    id = item.optString("id", "server-$index"),
                    transport = item.optString("transport", "http"),
                    url = item.optString("url").takeIf { it.isNotBlank() },
                    command = item.optString("command").takeIf { it.isNotBlank() },
                    args = args,
                    headers = headers,
                    enabled = item.optBoolean("enabled", true),
                )
            }
            mcpConfigs = configs
        }
        registries.clear()
        call.resolve(JSObject().apply {
            put("executionTier", executionTier.name.lowercase())
            put("mcpServers", mcpConfigs.size)
        })
    }

    @PluginMethod
    fun serverState(call: PluginCall) {
        call.resolve(PocketServerManager.state().toJson())
    }

    @PluginMethod
    fun startServer(call: PluginCall) {
        call.resolve(PocketServerManager.start(context).toJson())
    }

    @PluginMethod
    fun stopServer(call: PluginCall) {
        call.resolve(PocketServerManager.stop(context).toJson())
    }

    @PluginMethod
    fun selectModel(call: PluginCall) {
        val modelId = call.getString("modelId") ?: run {
            call.reject("modelId is required")
            return
        }
        if (!PocketServerManager.selectModel(modelId)) {
            call.reject("Unknown model: $modelId")
            return
        }
        call.resolve(PocketServerManager.state().toJson())
    }

    @PluginMethod
    fun openPocketServer(call: PluginCall) {
        try {
            val intent = Intent(context, PocketServerActivity::class.java)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Unable to open Pocket Server: ${e.message}")
        }
    }

    @PluginMethod
    fun openUpstream(call: PluginCall) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(SystemPrompt.UPSTREAM_URL))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Unable to open upstream URL: ${e.message}")
        }
    }

    private fun hardwareJson(hardware: HardwareSnapshot): JSObject {
        val cores = JSArray()
        hardware.cores.forEach { core ->
            cores.put(JSONObject().apply {
                put("index", core.index)
                put("maxFreqKhz", core.maxFreqKhz)
                put("performance", core.isPerformanceCore)
            })
        }
        return JSObject().apply {
            put("cores", cores)
            put("performanceCoreCount", hardware.performanceCoreCount)
            put("peakFrequencyKhz", hardware.peakFrequencyKhz)
            put("totalRamMb", hardware.totalRamMb)
            put("availableRamMb", hardware.availableRamMb)
            put("gpuVendor", hardware.gpuVendor)
            put("thermalCelsius", hardware.thermalCelsius)
            put("optimalThreadCount", hardware.optimalThreadCount)
            put("thermalWarning", hardware.thermalWarning())
        }
    }

    private fun blocksJson(blocks: List<AifBlock>): JSArray {
        val array = JSArray()
        blocks.forEach { array.put(blockJson(it)) }
        return array
    }

    private fun blockJson(block: AifBlock): JSONObject = JSONObject().apply {
        put("type", block.type.name.lowercase())
        put("timestamp", block.timestamp)
        put("importance", block.importance.toDouble())
        put("summary", block.summary)
        put("tags", JSArray(block.tags))
    }

    private fun PocketServerManager.ServerState.toJson(): JSObject = JSObject().apply {
        put("running", running)
        put("selectedModelId", selectedModelId)
        put("engineMode", engineMode)
        put("foregroundService", foregroundService)
        put("lastError", lastError)
    }

}
