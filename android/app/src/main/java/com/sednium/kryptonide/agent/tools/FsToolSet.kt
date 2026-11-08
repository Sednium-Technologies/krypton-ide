package com.sednium.kryptonide.agent.tools

import android.content.Context
import java.io.File

/**
 * Filesystem tools rooted at the active project directory. Every path is
 * canonicalised and must remain inside the root, which blocks `..` traversal
 * and absolute-path escapes.
 */
class FsToolSet(
    private val context: Context?,
    private val projectId: String?,
) {

    val root: File = resolveRoot()

    private fun resolveRoot(): File {
        val external = projectId?.let { File("/storage/emulated/0/KryptonIDE/projects/$it") }
        if (external != null && external.isDirectory) return external
        val base = context?.filesDir ?: File("/data/local/tmp")
        val safe = projectId?.replace(Regex("[^A-Za-z0-9._-]"), "_") ?: "default"
        return File(base, "projects/$safe").also { it.mkdirs() }
    }

    fun resolve(relativePath: String): File {
        val cleaned = relativePath.replace('\\', '/').removePrefix("./").trimStart('/')
        val candidate = File(root, cleaned)
        val canonicalRoot = root.canonicalFile
        val canonicalTarget = candidate.canonicalFile
        if (canonicalTarget != canonicalRoot && !canonicalTarget.path.startsWith(canonicalRoot.path + File.separator)) {
            throw SecurityException("Path escapes project root: $relativePath")
        }
        return canonicalTarget
    }

    fun readFile(path: String, startLine: Int?, endLine: Int?): ToolResult {
        return try {
            val file = resolve(path)
            if (!file.isFile) return ToolResult.failure("Not a file: $path")
            val lines = file.readLines()
            val from = ((startLine ?: 1) - 1).coerceIn(0, lines.size)
            val to = (endLine ?: lines.size).coerceIn(from, lines.size)
            val slice = lines.subList(from, to)
            ToolResult.success(
                slice.mapIndexed { index, line -> "${from + index + 1}\t$line" }.joinToString("\n"),
                mapOf("path" to file.absolutePath, "lines" to slice.size, "totalLines" to lines.size),
            )
        } catch (e: Exception) {
            ToolResult.failure(e.message ?: "read_file failed")
        }
    }

    fun writeFile(path: String, content: String): ToolResult {
        return try {
            val file = resolve(path)
            file.parentFile?.mkdirs()
            file.writeText(content, Charsets.UTF_8)
            ToolResult.success(
                "Wrote ${content.length} bytes to $path",
                mapOf("path" to file.absolutePath, "bytes" to content.toByteArray().size),
            )
        } catch (e: Exception) {
            ToolResult.failure(e.message ?: "write_file failed")
        }
    }

    fun editLines(path: String, startLine: Int, endLine: Int, newContent: String): ToolResult {
        return try {
            val file = resolve(path)
            if (!file.isFile) return ToolResult.failure("Not a file: $path")
            val lines = file.readLines().toMutableList()
            val from = (startLine - 1).coerceIn(0, lines.size)
            val to = endLine.coerceIn(from, lines.size)
            val replacement = newContent.split('\n')
            repeat(to - from) { lines.removeAt(from) }
            lines.addAll(from, replacement)
            file.writeText(lines.joinToString("\n"), Charsets.UTF_8)
            ToolResult.success(
                "Replaced lines $startLine-$endLine in $path",
                mapOf("path" to file.absolutePath, "replaced" to (to - from), "inserted" to replacement.size),
            )
        } catch (e: Exception) {
            ToolResult.failure(e.message ?: "edit_lines failed")
        }
    }

    fun insertLines(path: String, atLine: Int, content: String): ToolResult {
        return try {
            val file = resolve(path)
            if (!file.isFile) return ToolResult.failure("Not a file: $path")
            val lines = file.readLines().toMutableList()
            val index = (atLine - 1).coerceIn(0, lines.size)
            lines.addAll(index, content.split('\n'))
            file.writeText(lines.joinToString("\n"), Charsets.UTF_8)
            ToolResult.success(
                "Inserted ${content.count { it == '\n' } + 1} lines at $atLine in $path",
                mapOf("path" to file.absolutePath, "atLine" to atLine),
            )
        } catch (e: Exception) {
            ToolResult.failure(e.message ?: "insert_lines failed")
        }
    }

    fun patchFile(path: String, search: String, replace: String, replaceAll: Boolean = false): ToolResult {
        return try {
            val file = resolve(path)
            if (!file.isFile) return ToolResult.failure("Not a file: $path")
            if (search.isEmpty()) return ToolResult.failure("Search string is empty")
            val original = file.readText(Charsets.UTF_8)
            if (!original.contains(search)) {
                return ToolResult.failure("Search string not found in $path")
            }
            val updated = if (replaceAll) original.replace(search, replace) else original.replaceFirst(search, replace)
            file.writeText(updated, Charsets.UTF_8)
            ToolResult.success(
                "Patched $path",
                mapOf("path" to file.absolutePath, "replacements" to if (replaceAll) "all" else "first"),
            )
        } catch (e: Exception) {
            ToolResult.failure(e.message ?: "patch_file failed")
        }
    }

    fun listDir(path: String = "."): ToolResult {
        return try {
            val dir = resolve(path)
            if (!dir.isDirectory) return ToolResult.failure("Not a directory: $path")
            val entries = (dir.listFiles() ?: emptyArray())
                .sortedWith(compareBy({ !it.isDirectory }, { it.name.lowercase() }))
                .joinToString("\n") { file ->
                    val kind = if (file.isDirectory) "dir " else "file"
                    "$kind\t${file.length()}\t${file.name}"
                }
            ToolResult.success(entries, mapOf("path" to dir.absolutePath, "count" to (dir.list()?.size ?: 0)))
        } catch (e: Exception) {
            ToolResult.failure(e.message ?: "list_dir failed")
        }
    }
}
