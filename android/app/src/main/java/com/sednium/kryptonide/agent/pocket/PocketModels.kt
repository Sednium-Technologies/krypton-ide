package com.sednium.kryptonide.agent.pocket

import java.io.File

/** A model the Pocket Server can route turns to. */
data class PocketModelSpec(
    val id: String,
    val name: String,
    val type: String,
    val quantization: String,
    val contextLength: Int,
    val sizeBytes: Long,
    val description: String,
    val huggingFaceId: String? = null,
    val sectors: List<String> = emptyList(),
) {
    val sizeLabel: String
        get() = when {
            sizeBytes >= 1024L * 1024L * 1024L -> String.format("%.1f GB", sizeBytes / 1073741824.0)
            sizeBytes >= 1024L * 1024L -> "${sizeBytes / (1024L * 1024L)} MB"
            else -> "${sizeBytes / 1024L} KB"
        }
}

/** A model found on disk by [StorageModelScanner]. */
data class ScannedModel(
    val name: String,
    val path: String,
    val format: String,
    val sizeBytes: Long,
    val modifiedAt: Long,
) {
    fun asSpec(): PocketModelSpec = PocketModelSpec(
        id = "disk:${File(path).name}",
        name = name,
        type = format,
        quantization = format.uppercase(),
        contextLength = 4096,
        sizeBytes = sizeBytes,
        description = path,
    )
}

/**
 * Built-in model catalog. IDs intentionally mirror the WebView
 * `BUILTIN_POCKET_MODELS` so the React UI and native server agree on routes.
 */
object PocketModels {

    val catalog: List<PocketModelSpec> = listOf(
        PocketModelSpec(
            id = "laya-multilingual-fp16",
            name = "Laya Multilingual FP16",
            type = "local",
            quantization = "FP16",
            contextLength = 4096,
            sizeBytes = 250L * 1024L * 1024L,
            description = "Sub-35ms non-autoregressive decision and safety evaluator (Sector 1: System 1).",
            huggingFaceId = "convaiinnovations/laya-multilingual",
            sectors = listOf("system1"),
        ),
        PocketModelSpec(
            id = "laya-multilingual-q4",
            name = "Laya Multilingual Q4",
            type = "local",
            quantization = "Q4_K_M",
            contextLength = 4096,
            sizeBytes = 140L * 1024L * 1024L,
            description = "Low-memory System 1 model tuned for mobile RAM limits.",
            huggingFaceId = "convaiinnovations/laya-typed-decisions",
            sectors = listOf("system1"),
        ),
        PocketModelSpec(
            id = "polycoder-160m-q4",
            name = "PolyCoder 160M (FIM Autocomplete)",
            type = "onnx",
            quantization = "Q4_K_M",
            contextLength = 2048,
            sizeBytes = 95L * 1024L * 1024L,
            description = "Sub-20ms keystroke ghost-text autocomplete model (Sector 2).",
            sectors = listOf("autocomplete"),
        ),
        PocketModelSpec(
            id = "embedding-gemma-2",
            name = "EmbeddingGemma 2 (Dense RAG)",
            type = "onnx",
            quantization = "INT8",
            contextLength = 8192,
            sizeBytes = 191L * 1024L * 1024L,
            description = "768d Matryoshka embedding model for workspace and database RAG (Sector 3).",
            sectors = listOf("rag"),
        ),
        PocketModelSpec(
            id = "needle-3-cactus",
            name = "Needle 3 (Cactus Compute)",
            type = "local",
            quantization = "CQ2",
            contextLength = 4096,
            sizeBytes = 18L * 1024L * 1024L,
            description = "Ultra-compact grammar-constrained tool caller and structured extractor (Sector 4).",
            sectors = listOf("tools"),
        ),
    )

    val defaultModelId: String = "laya-multilingual-q4"

    fun find(id: String): PocketModelSpec? = catalog.firstOrNull { it.id == id }
}
