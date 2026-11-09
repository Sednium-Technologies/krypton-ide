package com.sednium.kryptonide.agent.tools

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

data class McpServerConfig(
    val id: String,
    val transport: String,
    val url: String? = null,
    val command: String? = null,
    val args: List<String> = emptyList(),
    val headers: Map<String, String> = emptyMap(),
    val enabled: Boolean = true,
)

data class McpToolDefinition(
    val serverId: String,
    val name: String,
    val description: String,
    val inputSchema: JSONObject?,
) {
    val qualifiedName: String get() = "mcp_${serverId}_$name"
}

/**
 * Minimal JSON-RPC 2.0 MCP client supporting HTTP, SSE and stdio transports.
 * Every call is bounded by a timeout so a misbehaving server cannot stall the
 * agent loop.
 */
class McpToolBridge(
    private val connectTimeoutMs: Int = 8_000,
    private val readTimeoutMs: Int = 30_000,
) {

    private val requestIds = AtomicLong(1)

    fun listTools(config: McpServerConfig): List<McpToolDefinition> {
        if (!config.enabled) return emptyList()
        val response = request(config, "tools/list", JSONObject()) ?: return emptyList()
        val tools = response.optJSONObject("result")?.optJSONArray("tools") ?: return emptyList()
        return (0 until tools.length()).mapNotNull { index ->
            val tool = tools.optJSONObject(index) ?: return@mapNotNull null
            McpToolDefinition(
                serverId = config.id,
                name = tool.optString("name"),
                description = tool.optString("description"),
                inputSchema = tool.optJSONObject("inputSchema"),
            )
        }.filter { it.name.isNotBlank() }
    }

    fun callTool(config: McpServerConfig, toolName: String, arguments: JSONObject): ToolResult {
        val params = JSONObject().apply {
            put("name", toolName)
            put("arguments", arguments)
        }
        val response = request(config, "tools/call", params)
            ?: return ToolResult.failure("MCP server ${config.id} did not respond")
        val error = response.optJSONObject("error")
        if (error != null) {
            return ToolResult.failure(error.optString("message", "MCP error"))
        }
        val result = response.optJSONObject("result")
            ?: return ToolResult.failure("MCP response missing result")
        return ToolResult.success(result.toString(), mapOf("serverId" to config.id, "tool" to toolName))
    }

    private fun request(config: McpServerConfig, method: String, params: JSONObject): JSONObject? {
        return when (config.transport.lowercase()) {
            "stdio" -> stdioRequest(config, method, params)
            "sse" -> httpRequest(config, method, params, expectSse = true)
            else -> httpRequest(config, method, params, expectSse = false)
        }
    }

    private fun httpRequest(
        config: McpServerConfig,
        method: String,
        params: JSONObject,
        expectSse: Boolean,
    ): JSONObject? {
        val endpoint = config.url ?: return null
        val id = requestIds.getAndIncrement()
        val payload = JSONObject().apply {
            put("jsonrpc", "2.0")
            put("id", id)
            put("method", method)
            put("params", params)
        }

        return try {
            val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                connectTimeout = connectTimeoutMs
                readTimeout = readTimeoutMs
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", if (expectSse) "text/event-stream, application/json" else "application/json")
                config.headers.forEach { (key, value) -> setRequestProperty(key, value) }
            }
            connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }

            val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use { reader ->
                if (expectSse) readSse(reader, id) else reader.readText()
            } ?: return null
            connection.disconnect()
            JSONObject(body)
        } catch (e: Exception) {
            null
        }
    }

    private fun readSse(reader: BufferedReader, id: Long): String? {
        var line: String?
        while (true) {
            line = reader.readLine() ?: return null
            if (!line.startsWith("data:")) continue
            val data = line.removePrefix("data:").trim()
            if (!data.startsWith("{")) continue
            val json = runCatching { JSONObject(data) }.getOrNull() ?: continue
            if (json.optLong("id", -1L) == id) return data
        }
    }

    private fun stdioRequest(config: McpServerConfig, method: String, params: JSONObject): JSONObject? {
        val command = config.command ?: return null
        val id = requestIds.getAndIncrement()
        val payload = JSONObject().apply {
            put("jsonrpc", "2.0")
            put("id", id)
            put("method", method)
            put("params", params)
        }

        var process: Process? = null
        return try {
            process = ProcessBuilder(listOf(command) + config.args)
                .redirectErrorStream(false)
                .start()
            process.outputStream.bufferedWriter(Charsets.UTF_8).use { writer ->
                writer.write(payload.toString())
                writer.newLine()
                writer.flush()
            }
            if (!process.waitFor(readTimeoutMs.toLong(), TimeUnit.MILLISECONDS)) return null
            val text = process.inputStream.bufferedReader(Charsets.UTF_8).readText().trim()
            val line = text.lineSequence().lastOrNull { it.startsWith("{") } ?: return null
            JSONObject(line)
        } catch (e: Exception) {
            null
        } finally {
            process?.destroy()
        }
    }

    fun summarize(result: JSONObject): String {
        val content = result.optJSONArray("content") ?: return result.toString()
        return buildString {
            for (index in 0 until content.length()) {
                val item = content.optJSONObject(index) ?: continue
                if (item.optString("type") == "text") {
                    appendLine(item.optString("text"))
                }
            }
        }.trim()
    }

    fun emptySchema(): JSONObject = JSONObject().apply {
        put("type", "object")
        put("properties", JSONObject())
        put("required", JSONArray())
    }
}
