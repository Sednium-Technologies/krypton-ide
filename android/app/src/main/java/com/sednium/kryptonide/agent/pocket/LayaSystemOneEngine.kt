package com.sednium.kryptonide.agent.pocket

import com.sednium.kryptonide.agent.aif.AifMetadata
import com.sednium.kryptonide.agent.aif.AifProtocols

/** Which reasoning path Oorty Lite should take for a turn. */
enum class ReasoningRoute { FAST_PATH, DEEP_REASONING }

enum class RiskLevel { LOW, MEDIUM, HIGH }

enum class ExecutionTier { SUPERVISED, AUTONOMOUS, UNBOUND }

data class RouteDecision(
    val route: ReasoningRoute,
    val confidence: Double,
    val reason: String,
)

data class RiskAssessment(
    val level: RiskLevel,
    val score: Double,
    val reasons: List<String>,
    val requiresConfirmation: Boolean,
) {
    fun allowedIn(tier: ExecutionTier): Boolean = when (level) {
        RiskLevel.LOW -> true
        RiskLevel.MEDIUM -> tier != ExecutionTier.SUPERVISED || requiresConfirmation
        RiskLevel.HIGH -> tier == ExecutionTier.UNBOUND
    }
}

/**
 * Laya System 1: a deterministic, sub-millisecond reflex engine that runs
 * before the large language model. It routes prompts, classifies shell risk,
 * prunes noisy tool output and tags durable memory.
 */
object LayaSystemOneEngine {

    private val FAST_PATH_HINTS = listOf(
        "hi", "hello", "hey", "thanks", "thank you", "status", "what time",
        "who are you", "what can you do", "help me understand", "explain",
        "what is", "define", "syntax", "shortcut",
    )

    private val DEEP_REASONING_HINTS = listOf(
        "implement", "refactor", "migrate", "architecture", "plan", "debug",
        "stack trace", "exception", "multi-file", "add feature", "fix bug",
        "write tests", "optimize", "performance", "security review", "upgrade",
        "rewrite", "generate", "scaffold", "analyze the repository",
    )

    private val DESTRUCTIVE_PATTERNS: List<Pair<Regex, String>> = listOf(
        Regex("""rm\s+(-[a-zA-Z]*\s+)*-?[rRfF]{1,3}\s+/(\s|$)""") to "Recursive delete of root",
        Regex("""rm\s+(-[a-zA-Z]*\s+)*-?[rRfF]{1,3}\s+~""") to "Recursive delete of home",
        Regex("""\bmkfs(\.[a-z0-9]+)?\b""", RegexOption.IGNORE_CASE) to "Filesystem format",
        Regex("""\bdd\s+if=.*\bof=/dev/""", RegexOption.IGNORE_CASE) to "Raw block device write",
        Regex(""">\s*/dev/(sd|block|mmcblk)""", RegexOption.IGNORE_CASE) to "Raw block device redirect",
        Regex(""":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:""") to "Fork bomb",
        Regex("""\bchmod\s+(-[a-zA-Z]+\s+)*777\s+/(\s|$)""") to "Global permission widening",
        Regex("""\b(curl|wget)\s+[^|]+\|\s*(sh|bash|zsh)\b""", RegexOption.IGNORE_CASE) to "Remote pipe-to-shell",
        Regex("""\b(sudo|su\s+-)""", RegexOption.IGNORE_CASE) to "Privilege escalation",
        Regex("""\b(reboot|shutdown|poweroff)\b""", RegexOption.IGNORE_CASE) to "Device power state change",
        Regex("""\b(format|wipe)\s+(/|/data|/system)\b""", RegexOption.IGNORE_CASE) to "Destructive wipe",
        Regex("""\bgit\s+push\s+.*--force""", RegexOption.IGNORE_CASE) to "Force push",
    )

    private val MEDIUM_PATTERNS: List<Pair<Regex, String>> = listOf(
        Regex("""\brm\b""") to "File removal",
        Regex("""\bgit\s+(reset\s+--hard|clean\s+-[a-zA-Z]*f)""", RegexOption.IGNORE_CASE) to "Discards working tree",
        Regex("""\bnpm\s+(publish|unpublish)\b""", RegexOption.IGNORE_CASE) to "Package registry write",
        Regex("""\bkill\s+-9\b""") to "Forced process termination",
        Regex("""\bchmod\s+(-[a-zA-Z]+\s+)*777\b""") to "Broad permission change",
        Regex(""">\s*[^|&;]+""") to "Shell redirection overwrites files",
        Regex("""\bmv\s+.*\s+/(\s|$)""") to "Move into root",
    )

    private val DOMAIN_TAGS = linkedMapOf(
        "frontend" to listOf("react", "tsx", "jsx", "css", "tailwind", "vite", "ui"),
        "backend" to listOf("api", "server", "express", "fastapi", "database", "sql"),
        "android" to listOf("kotlin", "gradle", "android", "capacitor", "java"),
        "rust" to listOf("rust", "cargo", "crate", ".rs", "wasm"),
        "ai" to listOf("model", "llm", "prompt", "agent", "embedding", "inference"),
        "performance" to listOf("slow", "performance", "memory", "leak", "latency", "optimize"),
        "security" to listOf("security", "vulnerability", "injection", "xss", "secret", "auth"),
        "testing" to listOf("test", "spec", "coverage", "assert", "mock"),
        "docs" to listOf("readme", "documentation", "docs", "comment", "guide"),
    )

    fun route(query: String): RouteDecision {
        val normalized = query.trim().lowercase()
        if (normalized.isEmpty()) {
            return RouteDecision(ReasoningRoute.FAST_PATH, 0.99, "Empty prompt")
        }

        val deepHits = DEEP_REASONING_HINTS.count { normalized.contains(it) }
        val fastHits = FAST_PATH_HINTS.count { normalized.contains(it) }
        val wordCount = normalized.split(Regex("\\s+")).size
        val hasCodeFence = query.contains("```") || query.contains("<edit")
        val hasPath = Regex("""[\w.-]+/[\w./-]+""").containsMatchIn(query)

        val deepScore = deepHits * 0.28 + (if (wordCount > 60) 0.18 else 0.0) +
            (if (hasCodeFence) 0.22 else 0.0) + (if (hasPath && wordCount > 18) 0.14 else 0.0)
        val fastScore = fastHits * 0.30 + (if (wordCount <= 12 && deepHits == 0) 0.34 else 0.0)

        return if (deepScore >= fastScore && deepScore >= 0.28) {
            RouteDecision(
                route = ReasoningRoute.DEEP_REASONING,
                confidence = (0.55 + deepScore).coerceAtMost(0.99),
                reason = "Action/planning signals detected",
            )
        } else {
            RouteDecision(
                route = ReasoningRoute.FAST_PATH,
                confidence = (0.55 + fastScore).coerceAtMost(0.99),
                reason = "Conversational or short informational prompt",
            )
        }
    }

    fun risk(command: String): RiskAssessment {
        val trimmed = command.trim()
        if (trimmed.isEmpty()) {
            return RiskAssessment(RiskLevel.LOW, 0.0, emptyList(), requiresConfirmation = false)
        }

        val destructive = DESTRUCTIVE_PATTERNS.filter { it.first.containsMatchIn(trimmed) }
        if (destructive.isNotEmpty()) {
            return RiskAssessment(
                level = RiskLevel.HIGH,
                score = 1.0,
                reasons = destructive.map { it.second },
                requiresConfirmation = true,
            )
        }

        val medium = MEDIUM_PATTERNS.filter { it.first.containsMatchIn(trimmed) }
        if (medium.isNotEmpty()) {
            return RiskAssessment(
                level = RiskLevel.MEDIUM,
                score = (0.45 + medium.size * 0.08).coerceAtMost(0.9),
                reasons = medium.map { it.second },
                requiresConfirmation = true,
            )
        }

        return RiskAssessment(RiskLevel.LOW, 0.05, emptyList(), requiresConfirmation = false)
    }

    /**
     * Keeps the head (context), any error-shaped middle lines and the tail
     * (final result) while dropping repetitive log noise.
     */
    fun prune(output: String, maxLines: Int = 80): String {
        if (maxLines <= 0) return ""
        val lines = output.split('\n')
        if (lines.size <= maxLines) return output

        val headCount = maxOf(1, (maxLines * 0.20).toInt())
        val tailCount = maxOf(1, (maxLines * 0.30).toInt())
        val middleBudget = maxOf(0, maxLines - headCount - tailCount)
        val errorRegex = Regex("""(?i)(error|fatal|exception|failed|failure|traceback|line \d+|cannot|undefined)""")

        val head = lines.take(headCount)
        val tail = lines.takeLast(tailCount)
        val middle = lines.subList(headCount, lines.size - tailCount)
        val salient = middle.filter { errorRegex.containsMatchIn(it) }.take(middleBudget)

        val omitted = lines.size - head.size - tail.size - salient.size
        return buildString {
            head.forEach { appendLine(it) }
            if (salient.isNotEmpty()) {
                appendLine("… $omitted lines omitted …")
                salient.forEach { appendLine(it) }
            } else if (omitted > 0) {
                appendLine("… $omitted lines omitted …")
            }
            tail.forEach { appendLine(it) }
        }.trimEnd()
    }

    fun extractAifMetadata(prompt: String, diff: String): AifMetadata {
        val corpus = (prompt + "\n" + diff).lowercase()
        val tags = DOMAIN_TAGS.entries
            .filter { (_, keywords) -> keywords.any { corpus.contains(it) } }
            .map { it.key }
            .take(AifProtocols.MAX_TAGS)

        val changedLines = diff.count { it == '\n' } + if (diff.isBlank()) 0 else 1
        val riskBoost = if (risk(diff).level != RiskLevel.LOW) 0.2 else 0.0
        val sizeBoost = (changedLines / 400.0).coerceAtMost(0.35)
        val tagBoost = tags.size * 0.04
        val importance = (0.25 + sizeBoost + riskBoost + tagBoost).coerceIn(0.05, 1.0).toFloat()

        val summary = AifProtocols.normalizeSummary(
            prompt.lineSequence().firstOrNull { it.isNotBlank() } ?: "Oorty Lite turn",
        )

        return AifMetadata(tags, importance, summary)
    }
}
