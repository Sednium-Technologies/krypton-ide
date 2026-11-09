package com.sednium.kryptonide.agent.tools

import java.io.File

/**
 * Lightweight language-service tools. Symbol extraction is pure Kotlin and
 * works offline; diagnostics delegate to the project's real toolchain through
 * the PTY when one is available.
 */
class LspToolSet(
    private val fs: FsToolSet,
    private val terminal: TerminalToolSet? = null,
) {

    private data class SymbolPattern(val regex: Regex, val kindGroup: Int, val nameGroup: Int)

    private val patterns = listOf(
        SymbolPattern(Regex("""^\s*(?:@\w+\s+)*(class|interface|object|enum class|data class|fun|val|var)\s+([A-Za-z_]\w*)"""), 1, 2),
        SymbolPattern(Regex("""^\s*(?:export\s+)?(?:async\s+)?(function|class|interface|const|let|var|type|enum)\s+([A-Za-z_$][\w$]*)"""), 1, 2),
        SymbolPattern(Regex("""^\s*(def|class)\s+([A-Za-z_]\w*)"""), 1, 2),
        SymbolPattern(Regex("""^\s*(?:pub\s+)?(fn|struct|enum|trait|impl|mod)\s+([A-Za-z_]\w*)"""), 1, 2),
        SymbolPattern(Regex("""^\s*(func|type)\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)"""), 1, 2),
    )

    fun getSymbols(path: String): ToolResult {
        return try {
            val file = fs.resolve(path)
            if (!file.isFile) return ToolResult.failure("Not a file: $path")
            val symbols = file.readLines().mapIndexedNotNull { index, line ->
                patterns.firstNotNullOfOrNull { pattern ->
                    pattern.regex.find(line)?.let { match ->
                        "${index + 1}\t${match.groupValues[pattern.kindGroup]}\t${match.groupValues[pattern.nameGroup]}"
                    }
                }
            }
            ToolResult.success(
                if (symbols.isEmpty()) "No symbols found in $path" else symbols.joinToString("\n"),
                mapOf("path" to file.absolutePath, "count" to symbols.size),
            )
        } catch (e: Exception) {
            ToolResult.failure(e.message ?: "lsp_get_symbols failed")
        }
    }

    fun getDiagnostics(path: String): ToolResult {
        val file = try {
            fs.resolve(path)
        } catch (e: Exception) {
            return ToolResult.failure(e.message ?: "Invalid path")
        }
        if (!file.isFile) return ToolResult.failure("Not a file: $path")
        if (terminal == null) {
            return ToolResult.success("No diagnostics runner configured for ${file.name}")
        }

        val command = diagnosticCommand(file) ?: return ToolResult.success(
            "No compiler/linter configured for .${file.extension}",
        )

        val result = terminal.execute(command, 90_000L)
        val trimmed = result.output.trim()
        return ToolResult(
            ok = result.ok,
            output = if (trimmed.isEmpty()) "No diagnostics reported for ${file.name}" else trimmed,
            error = result.error,
            metadata = result.metadata + mapOf("path" to file.absolutePath, "command" to command),
        )
    }

    private fun diagnosticCommand(file: File): String? {
        val name = file.name
        return when (file.extension.lowercase()) {
            "ts", "tsx" -> "npx --no-install tsc --noEmit --pretty false \"$name\""
            "js", "jsx" -> "npx --no-install eslint \"$name\""
            "kt", "kts" -> "kotlinc -nowarn \"$name\" -d /tmp/krypton-agent-out"
            "rs" -> "cargo check --message-format short"
            "go" -> "go vet ./..."
            "py" -> "python3 -m py_compile \"$name\""
            else -> null
        }
    }
}
