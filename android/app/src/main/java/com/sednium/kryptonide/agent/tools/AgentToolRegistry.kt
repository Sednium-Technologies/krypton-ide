package com.sednium.kryptonide.agent.tools

import android.content.Context
import com.sednium.kryptonide.agent.aif.AifMemoryManager
import com.sednium.kryptonide.agent.pocket.ExecutionTier
import com.sednium.kryptonide.agent.pocket.LayaSystemOneEngine
import com.sednium.kryptonide.agent.pocket.RiskLevel
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * Typed tool registry for Oorty Lite. Replaces ad-hoc `when (toolName)` chains
 * with a single source of truth that can emit Gemini and OpenAI function
 * declarations and enforce the active execution tier.
 */
class AgentToolRegistry(
    context: Context?,
    private val projectId: String?,
    rootOverride: String? = null,
    private val executionTierProvider: () -> ExecutionTier = { ExecutionTier.SUPERVISED },
    private val mcpServersProvider: () -> List<McpServerConfig> = { emptyList() },
) {

    data class ToolSpec(
        val name: String,
        val description: String,
        val parameters: JSONObject,
        val handler: (JSONObject) -> ToolResult,
    )

    val fs = FsToolSet(context, projectId)
    val terminal = TerminalToolSet(rootOverride ?: fs.root.absolutePath)
    val lsp = LspToolSet(fs, terminal)
    val aif = AifMemoryManager(context)
    val mcp = McpToolBridge()

    private val tools = ConcurrentHashMap<String, ToolSpec>()
    private val mcpTools = ConcurrentHashMap<String, McpToolDefinition>()
    private val mcpConfigs = ConcurrentHashMap<String, McpServerConfig>()

    val executionTier: ExecutionTier get() = executionTierProvider()

    init {
        registerBuiltins()
        refreshMcpTools()
    }

    fun list(): List<ToolSpec> = tools.values.sortedBy { it.name }

    fun listMcpTools(): List<McpToolDefinition> = mcpTools.values.sortedBy { it.qualifiedName }

    fun execute(name: String, args: JSONObject): ToolResult {
        mcpTools[name]?.let { definition ->
            val config = mcpConfigs[definition.serverId]
                ?: return ToolResult.failure("Unknown MCP server for $name")
            return mcp.callTool(config, definition.name, args)
        }

        val spec = tools[name] ?: return ToolResult.failure("Unknown tool: $name")
        if (name == "execute_terminal_command") {
            val command = args.optString("command")
            val risk = LayaSystemOneEngine.risk(command)
            val tier = executionTier
            val confirmed = args.optBoolean("confirm", false)
            val allowed = when {
                tier == ExecutionTier.UNBOUND -> true
                risk.level == RiskLevel.LOW -> true
                risk.level == RiskLevel.MEDIUM -> tier == ExecutionTier.AUTONOMOUS || confirmed
                else -> false
            }
            if (!allowed) {
                return ToolResult.failure(
                    "Blocked by ${tier.name.lowercase()} tier: risk=${risk.level.name.lowercase()} " +
                        "reasons=${risk.reasons.joinToString("; ").ifBlank { "none" }}",
                )
            }
        }
        return try {
            spec.handler(args)
        } catch (e: Exception) {
            ToolResult.failure(e.message ?: "$name failed")
        }
    }

    fun schemas(format: String = "gemini"): JSONArray {
        val array = JSONArray()
        tools.values.sortedBy { it.name }.forEach { spec ->
            val function = JSONObject().apply {
                put("name", spec.name)
                put("description", spec.description)
                put("parameters", spec.parameters)
            }
            if (format.equals("openai", ignoreCase = true)) {
                array.put(JSONObject().apply {
                    put("type", "function")
                    put("function", function)
                })
            } else {
                array.put(function)
            }
        }
        return array
    }

    fun refreshMcpTools(): List<McpToolDefinition> {
        mcpConfigs.clear()
        mcpTools.clear()
        mcpServersProvider().filter { it.enabled }.forEach { config ->
            mcpConfigs[config.id] = config
            mcp.listTools(config).forEach { definition ->
                mcpTools[definition.qualifiedName] = definition
            }
        }
        return listMcpTools()
    }

    private fun registerBuiltins() {
        register(
            "read_file",
            "Read a UTF-8 file from the project. Line numbers are 1-based and the result is prefixed with them.",
            params {
                string("path", "Project-relative file path", required = true)
                integer("start_line", "First line to read (1-based)")
                integer("end_line", "Last line to read (inclusive)")
            },
        ) { args ->
            fs.readFile(args.optString("path"), args.optIntOrNull("start_line"), args.optIntOrNull("end_line"))
        }

        register(
            "write_file",
            "Create or replace a UTF-8 file inside the project.",
            params {
                string("path", "Project-relative file path", required = true)
                string("content", "Complete file content", required = true)
            },
        ) { args -> fs.writeFile(args.optString("path"), args.optString("content")) }

        register(
            "edit_lines",
            "Replace an inclusive line range with new content.",
            params {
                string("path", "Project-relative file path", required = true)
                integer("start_line", "First line to replace (1-based)", required = true)
                integer("end_line", "Last line to replace (inclusive)", required = true)
                string("new_content", "Replacement content", required = true)
            },
        ) { args ->
            fs.editLines(
                args.optString("path"),
                args.optInt("start_line"),
                args.optInt("end_line"),
                args.optString("new_content"),
            )
        }

        register(
            "insert_lines",
            "Insert content before a 1-based line number.",
            params {
                string("path", "Project-relative file path", required = true)
                integer("at_line", "Line to insert before (1-based)", required = true)
                string("content", "Content to insert", required = true)
            },
        ) { args -> fs.insertLines(args.optString("path"), args.optInt("at_line"), args.optString("content")) }

        register(
            "patch_file",
            "Replace the first (or every) occurrence of a search string.",
            params {
                string("path", "Project-relative file path", required = true)
                string("search", "Exact text to find", required = true)
                string("replace", "Replacement text", required = true)
                boolean("replace_all", "Replace every occurrence")
            },
        ) { args ->
            fs.patchFile(
                args.optString("path"),
                args.optString("search"),
                args.optString("replace"),
                args.optBoolean("replace_all", false),
            )
        }

        register(
            "list_dir",
            "List files and directories inside the project.",
            params { string("path", "Project-relative directory (default '.')") },
        ) { args -> fs.listDir(args.optString("path", ".")) }

        register(
            "execute_terminal_command",
            "Run a shell command in the project PTY and return stdout/stderr with the exit code.",
            params {
                string("command", "Shell command to execute", required = true)
                integer("timeout_ms", "Timeout in milliseconds (default 30000)")
                boolean("confirm", "Set when the user explicitly approved a medium-risk command")
            },
        ) { args ->
            terminal.execute(args.optString("command"), args.optLong("timeout_ms", 30_000L))
        }

        register(
            "lsp_get_diagnostics",
            "Run the project compiler or linter for a file and return its diagnostics.",
            params { string("file_path", "Project-relative file path", required = true) },
        ) { args -> lsp.getDiagnostics(args.optString("file_path")) }

        register(
            "lsp_get_symbols",
            "List classes, functions and other symbols declared in a file.",
            params { string("file_path", "Project-relative file path", required = true) },
        ) { args -> lsp.getSymbols(args.optString("file_path")) }

        register(
            "aif_recall",
            "Load durable project memory blocks for boot recall.",
            params {
                string("project_id", "Project id (defaults to the active project)")
                integer("limit", "Maximum blocks to return")
            },
        ) { args ->
            val id = args.optString("project_id").ifBlank { projectId ?: "default" }
            val blocks = aif.recall(id, args.optInt("limit", 12))
            ToolResult.success(
                blocks.joinToString("\n") { "${it.type.name.lowercase()}\t${it.importance}\t${it.summary}" },
                mapOf("count" to blocks.size),
            )
        }

        register(
            "aif_scratch",
            "Write volatile task state before multi-file edits or terminal commands.",
            params { string("intent", "Short description of the in-flight task", required = true) },
        ) { args ->
            val id = projectId ?: "default"
            val file = aif.writeScratch(id, args.optString("intent"))
            ToolResult.success("Scratch state written to ${file.absolutePath}")
        }

        register(
            "aif_note",
            "Commit a durable memory block with an importance rating between 0.0 and 1.0.",
            params {
                string("summary", "Concise durable summary", required = true)
                number("importance", "Importance rating 0.0-1.0", required = true)
                string("tags", "Comma-separated tags")
            },
        ) { args ->
            val id = projectId ?: "default"
            val tags = args.optString("tags").split(',').map { it.trim() }.filter { it.isNotEmpty() }
            val block = aif.commit(id, args.optString("summary"), args.optDouble("importance", 0.5).toFloat(), tags)
            ToolResult.success("Committed AIF block at ${block.timestamp}")
        }

        register(
            "aif_query",
            "Search durable memory for a keyword.",
            params { string("keyword", "Keyword or tag to search for", required = true) },
        ) { args ->
            val id = projectId ?: "default"
            val blocks = aif.query(id, args.optString("keyword"))
            ToolResult.success(
                blocks.joinToString("\n") { "${it.type.name.lowercase()}\t${it.summary}" },
                mapOf("count" to blocks.size),
            )
        }
    }

    private fun register(name: String, description: String, parameters: JSONObject, handler: (JSONObject) -> ToolResult) {
        tools[name] = ToolSpec(name, description, parameters, handler)
    }

    private class SchemaBuilder {
        private val properties = JSONObject()
        private val required = JSONArray()

        fun string(name: String, description: String, required: Boolean = false) {
            properties.put(name, JSONObject().apply {
                put("type", "string")
                put("description", description)
            })
            markRequired(name, required)
        }

        fun integer(name: String, description: String, required: Boolean = false) {
            properties.put(name, JSONObject().apply {
                put("type", "integer")
                put("description", description)
            })
            markRequired(name, required)
        }

        fun number(name: String, description: String, required: Boolean = false) {
            properties.put(name, JSONObject().apply {
                put("type", "number")
                put("description", description)
            })
            markRequired(name, required)
        }

        fun boolean(name: String, description: String, required: Boolean = false) {
            properties.put(name, JSONObject().apply {
                put("type", "boolean")
                put("description", description)
            })
            markRequired(name, required)
        }

        private fun markRequired(name: String, required: Boolean) {
            if (required) this.required.put(name)
        }

        fun build(): JSONObject = JSONObject().apply {
            put("type", "object")
            put("properties", properties)
            put("required", required)
        }
    }

    private fun params(block: SchemaBuilder.() -> Unit): JSONObject = SchemaBuilder().apply(block).build()

    private fun JSONObject.optIntOrNull(key: String): Int? =
        if (has(key) && !isNull(key)) optInt(key) else null
}
