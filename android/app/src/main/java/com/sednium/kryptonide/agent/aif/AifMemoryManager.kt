package com.sednium.kryptonide.agent.aif

import android.content.Context
import android.util.Log
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

/**
 * Persistent cognitive memory for Oorty Lite.
 *
 * Files are binary `.ai` documents stored under
 * `/storage/emulated/0/KryptonIDE/aif/`, falling back to app-private storage
 * when external storage is unavailable or not writable.
 *
 * Layout:
 *   magic "AIF1" | int version | int blockCount | block*
 *   block: byte type | long timestamp | float importance | UTF tags | UTF summary
 */
class AifMemoryManager(
    private val context: Context? = null,
    rootOverride: String? = null,
) {

    companion object {
        private const val TAG = "AifMemoryManager"
        private const val EXTERNAL_ROOT = "/storage/emulated/0/KryptonIDE/aif"
        private const val MAX_BLOCKS_PER_FILE = 4096
    }

    val root: File = resolveRoot(rootOverride)

    private fun resolveRoot(override: String?): File {
        if (!override.isNullOrBlank()) {
            return File(override).also { it.mkdirs() }
        }
        val external = File(EXTERNAL_ROOT)
        if (ensureWritable(external)) return external
        val fallback = context?.let { File(it.filesDir, "aif") } ?: File(EXTERNAL_ROOT)
        ensureWritable(fallback)
        return fallback
    }

    private fun ensureWritable(dir: File): Boolean = try {
        if (!dir.exists()) dir.mkdirs()
        dir.isDirectory && (dir.canWrite() || dir.setWritable(true))
    } catch (e: Exception) {
        Log.w(TAG, "AIF directory not writable: ${dir.absolutePath}", e)
        false
    }

    fun projectFile(projectId: String): File {
        val safe = projectId.replace(Regex("[^A-Za-z0-9._-]"), "_").ifBlank { "default" }
        return File(root, "$safe.ai")
    }

    fun bridgeFile(): File = File(root, "bridge_nexus.ai")

    @Synchronized
    fun readBlocks(file: File): List<AifBlock> {
        if (!file.exists() || file.length() == 0L) return emptyList()
        return try {
            DataInputStream(FileInputStream(file).buffered()).use { input ->
                val magic = ByteArray(4)
                input.readFully(magic)
                if (String(magic, Charsets.UTF_8) != AifProtocols.MAGIC) {
                    Log.w(TAG, "Ignoring ${file.name}: bad magic")
                    return emptyList()
                }
                val version = input.readInt()
                if (version > AifProtocols.FORMAT_VERSION) {
                    Log.w(TAG, "Ignoring ${file.name}: unsupported version $version")
                    return emptyList()
                }
                val count = input.readInt().coerceIn(0, MAX_BLOCKS_PER_FILE)
                val blocks = ArrayList<AifBlock>(count)
                repeat(count) {
                    val type = AifBlockType.fromCode(input.readUnsignedByte())
                    val timestamp = input.readLong()
                    val importance = input.readFloat()
                    val tags = input.readUTF().split(',').map { it.trim() }.filter { it.isNotEmpty() }
                    val summary = input.readUTF()
                    blocks += AifBlock(type, timestamp, importance, summary, tags)
                }
                blocks
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read ${file.name}", e)
            emptyList()
        }
    }

    @Synchronized
    fun writeBlocks(file: File, blocks: List<AifBlock>) {
        try {
            file.parentFile?.mkdirs()
            val trimmed = blocks.takeLast(MAX_BLOCKS_PER_FILE)
            DataOutputStream(FileOutputStream(file).buffered()).use { output ->
                output.write(AifProtocols.MAGIC.toByteArray(Charsets.UTF_8))
                output.writeInt(AifProtocols.FORMAT_VERSION)
                output.writeInt(trimmed.size)
                trimmed.forEach { block ->
                    output.writeByte(block.type.code)
                    output.writeLong(block.timestamp)
                    output.writeFloat(block.importance.coerceIn(0f, 1f))
                    output.writeUTF(encodeTags(block.tags))
                    output.writeUTF(safeUtf(block.summary))
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to write ${file.name}", e)
        }
    }

    private fun encodeTags(tags: List<String>): String =
        safeUtf(tags.joinToString(","))

    private fun safeUtf(value: String): String {
        if (value.length <= 60000) return value
        return value.take(59999)
    }

    @Synchronized
    fun appendBlock(file: File, block: AifBlock) {
        val existing = readBlocks(file)
        writeBlocks(file, existing + block)
    }

    fun recall(projectId: String, limit: Int = 12): List<AifBlock> {
        val blocks = readBlocks(projectFile(projectId))
        return blocks
            .sortedWith(compareByDescending<AifBlock> { it.type == AifBlockType.INT16_CORE }.thenByDescending { it.timestamp })
            .take(limit.coerceAtLeast(1))
            .sortedBy { it.timestamp }
    }

    fun bootRecallContext(projectId: String, limit: Int = 8): String =
        AifProtocols.bootRecallPrompt(projectId, recall(projectId, limit))

    @Synchronized
    fun commit(
        projectId: String,
        summary: String,
        importance: Float,
        tags: List<String> = emptyList(),
    ): AifBlock {
        val block = AifProtocols.commitBlock(summary, importance, tags)
        appendBlock(projectFile(projectId), block)
        appendBlock(
            bridgeFile(),
            block.copy(
                type = AifBlockType.SYNAPTIC_POINTER,
                tags = (block.tags + projectId).distinct(),
            ),
        )
        return block
    }

    @Synchronized
    fun promoteToCore(projectId: String, summary: String, tags: List<String> = emptyList()) {
        val block = AifBlock(
            type = AifBlockType.INT16_CORE,
            timestamp = System.currentTimeMillis(),
            importance = 1f,
            summary = AifProtocols.normalizeSummary(summary),
            tags = tags,
        )
        appendBlock(projectFile(projectId), block)
    }

    fun writeScratch(projectId: String, intent: String): File {
        val file = File(root, "${safeProjectId(projectId)}-${AifProtocols.SCRATCH_FILE}")
        try {
            file.parentFile?.mkdirs()
            file.writeText(AifProtocols.scratchPrompt(intent), Charsets.UTF_8)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to write scratch state", e)
        }
        return file
    }

    fun readScratch(projectId: String): String? {
        val file = File(root, "${safeProjectId(projectId)}-${AifProtocols.SCRATCH_FILE}")
        return try {
            if (file.exists()) file.readText(Charsets.UTF_8) else null
        } catch (e: Exception) {
            null
        }
    }

    fun clearScratch(projectId: String) {
        try {
            File(root, "${safeProjectId(projectId)}-${AifProtocols.SCRATCH_FILE}").delete()
        } catch (_: Exception) {
        }
    }

    fun query(projectId: String, keyword: String): List<AifBlock> {
        val needle = keyword.trim().lowercase()
        if (needle.isEmpty()) return emptyList()
        return (readBlocks(projectFile(projectId)) + readBlocks(bridgeFile()))
            .filter { block ->
                block.summary.lowercase().contains(needle) ||
                    block.tags.any { it.contains(needle) }
            }
            .distinctBy { it.timestamp to it.summary }
            .sortedByDescending { it.timestamp }
            .take(50)
    }

    private fun safeProjectId(projectId: String): String =
        projectId.replace(Regex("[^A-Za-z0-9._-]"), "_").ifBlank { "default" }
}
