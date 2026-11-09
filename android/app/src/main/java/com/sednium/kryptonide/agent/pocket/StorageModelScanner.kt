package com.sednium.kryptonide.agent.pocket

import android.content.Context
import android.util.Log
import java.io.File

/**
 * Scans the canonical model folders and Android's public Downloads directory.
 *
 * No `FileObserver` is used: SAF/Downloads trees are not reliably watchable, so
 * the UI calls this on demand and on foreground.
 */
object StorageModelScanner {

    private const val TAG = "StorageModelScanner"
    private val EXTENSIONS = setOf("gguf", "onnx", "bin", "tflite", "litertlm", "task")

    fun scan(context: Context? = null, extraRoots: List<String> = emptyList()): List<ScannedModel> {
        val roots = buildList {
            add("/storage/emulated/0/KryptonIDE/models")
            add("/storage/emulated/0/Download")
            add("/storage/emulated/0/Downloads")
            context?.let { add(File(it.filesDir, "models").absolutePath) }
            addAll(extraRoots)
        }.distinct()

        val found = LinkedHashMap<String, ScannedModel>()
        roots.forEach { root ->
            val dir = File(root)
            if (!dir.isDirectory || !dir.canRead()) return@forEach
            walk(dir, depth = 0, output = found)
        }
        return found.values.sortedByDescending { it.modifiedAt }
    }

    private fun walk(dir: File, depth: Int, output: MutableMap<String, ScannedModel>) {
        if (depth > 3) return
        val children = try {
            dir.listFiles() ?: return
        } catch (e: Exception) {
            Log.w(TAG, "Cannot list ${dir.absolutePath}: ${e.message}")
            return
        }
        children.forEach { file ->
            when {
                file.isDirectory -> walk(file, depth + 1, output)
                file.isFile && file.extension.lowercase() in EXTENSIONS -> {
                    val absolute = file.absolutePath
                    output[absolute] = ScannedModel(
                        name = file.nameWithoutExtension,
                        path = absolute,
                        format = file.extension.lowercase(),
                        sizeBytes = file.length(),
                        modifiedAt = file.lastModified(),
                    )
                }
            }
        }
    }
}
