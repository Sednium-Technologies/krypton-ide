package com.sednium.kryptonide.agent.tools

import org.json.JSONObject

/** Structured result returned by every native agent tool. */
data class ToolResult(
    val ok: Boolean,
    val output: String,
    val error: String? = null,
    val metadata: Map<String, Any?> = emptyMap(),
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("ok", ok)
        put("output", output)
        if (error != null) put("error", error)
        if (metadata.isNotEmpty()) put("metadata", JSONObject(metadata))
    }

    companion object {
        fun success(output: String, metadata: Map<String, Any?> = emptyMap()): ToolResult =
            ToolResult(true, output, null, metadata)

        fun failure(message: String): ToolResult =
            ToolResult(false, "", message)
    }
}
