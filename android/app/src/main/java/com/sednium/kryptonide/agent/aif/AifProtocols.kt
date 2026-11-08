package com.sednium.kryptonide.agent.aif

/** Binary block kinds stored inside a `.ai` memory file. */
enum class AifBlockType(val code: Int) {
    INT16_CORE(1),
    VOLATILE_SCRATCH(2),
    EPISODIC(3),
    SYNAPTIC_POINTER(4),
    ;

    companion object {
        fun fromCode(code: Int): AifBlockType =
            entries.firstOrNull { it.code == code } ?: EPISODIC
    }
}

data class AifBlock(
    val type: AifBlockType,
    val timestamp: Long,
    val importance: Float,
    val summary: String,
    val tags: List<String> = emptyList(),
)

/** Semantic metadata extracted by the Laya System 1 tagger. */
data class AifMetadata(
    val tags: List<String>,
    val importance: Float,
    val summary: String,
)

/**
 * Shared AIF lifecycle helpers. The on-disk format is implemented by
 * [AifMemoryManager]; this object only owns the protocol text and defaults.
 */
object AifProtocols {

    const val MAGIC = "AIF1"
    const val FORMAT_VERSION = 1
    const val SCRATCH_FILE = ".scratch_state.tmp"
    const val MAX_SUMMARY_CHARS = 240
    const val MAX_TAGS = 8

    const val RED_CORE = "red_core"
    const val BRIDGE_NEXUS = "bridge_nexus"

    fun normalizeSummary(summary: String): String {
        val singleLine = summary.replace(Regex("\\s+"), " ").trim()
        return if (singleLine.length <= MAX_SUMMARY_CHARS) singleLine else singleLine.take(MAX_SUMMARY_CHARS - 1) + "…"
    }

    fun normalizeImportance(value: Float): Float = value.coerceIn(0f, 1f)

    fun bootRecallPrompt(projectId: String, recent: List<AifBlock>): String {
        if (recent.isEmpty()) return ""
        return buildString {
            append("AIF boot recall for project \"")
            append(projectId)
            append("\":\n")
            recent.takeLast(8).forEach { block ->
                append("- [")
                append(block.type.name.lowercase())
                append(" | importance ")
                append(String.format("%.2f", block.importance))
                append("] ")
                append(block.summary)
                if (block.tags.isNotEmpty()) {
                    append(" (")
                    append(block.tags.joinToString(", "))
                    append(")")
                }
                append('\n')
            }
        }.trimEnd()
    }

    fun scratchPrompt(intent: String): String =
        "Volatile scratch: ${normalizeSummary(intent)}. Resume this task after interruptions."

    fun commitBlock(summary: String, importance: Float, tags: List<String> = emptyList()): AifBlock =
        AifBlock(
            type = AifBlockType.EPISODIC,
            timestamp = System.currentTimeMillis(),
            importance = normalizeImportance(importance),
            summary = normalizeSummary(summary),
            tags = tags.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.distinct().take(MAX_TAGS),
        )
}
