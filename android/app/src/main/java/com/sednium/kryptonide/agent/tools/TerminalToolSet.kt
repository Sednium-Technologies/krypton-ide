package com.sednium.kryptonide.agent.tools

import com.sednium.kryptonide.agent.pocket.LayaSystemOneEngine
import com.sednium.kryptonide.terminal.PtyBridge
import com.sednium.kryptonide.terminal.TerminalSession
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Executes shell commands through the same native PTY used by the terminal UI.
 * Commands are wrapped in nonce sentinels so the exit code cannot be spoofed by
 * model output, and ANSI escapes are stripped before returning to the agent.
 */
class TerminalToolSet(
    private val cwd: String,
    private val homeDir: String? = null,
) {

    fun execute(command: String, timeoutMs: Long = 120_000L): ToolResult {
        if (command.isBlank()) return ToolResult.failure("Command is empty")

        val nonce = UUID.randomUUID().toString().replace("-", "").take(16)
        val startTag = "__KRYPTON_START_${nonce}__"
        val exitPrefix = "__KRYPTON_EXIT_${nonce}_"
        val exitRegex = Regex("__KRYPTON_EXIT_${nonce}_(\\d+)__")
        val wrapped = "echo $startTag; $command; echo ${exitPrefix}\$?__"

        val pid = IntArray(1)
        val prefix = "/data/data/com.sednium.kryptonide.legacy/files/usr"
        val termuxHome = homeDir ?: "/data/data/com.sednium.kryptonide.legacy/files/home"
        val env = mutableListOf(
            "TERM=xterm-256color",
            "COLORTERM=truecolor",
            "KRYPTON_AGENT=1",
            "PREFIX=$prefix",
            "HOME=$termuxHome",
            "TMPDIR=$prefix/tmp",
            "PATH=$prefix/bin:/system/bin:/system/xbin",
            "LD_LIBRARY_PATH=$prefix/lib",
            "TERMUX__ROOTFS=/data/data/com.sednium.kryptonide.legacy/files",
            "TERMUX__PREFIX=$prefix",
            "TERMUX__HOME=$termuxHome",
            "TERMUX_APP__DATA_DIR=/data/data/com.sednium.kryptonide.legacy",
            "TERMUX_APP__LEGACY_DATA_DIR=/data/data/com.sednium.kryptonide.legacy",
            "TERMUX_APP__BUILD_DATA_DIR=/data/data/com.termux",
            "TERMUX_EXEC__EXECVE_CALL__INTERCEPT=enable",
        )
        val termuxExecLib = File(prefix, "lib/libtermux-exec-ld-preload.so")
        if (termuxExecLib.exists()) env += "LD_PRELOAD=${termuxExecLib.absolutePath}"
        val shell = File(prefix, "bin/bash").takeIf { it.canExecute() }?.absolutePath ?: "/system/bin/sh"

        val fd = try {
            PtyBridge.createSubprocess(shell, cwd, env.toTypedArray(), pid, 60, 200)
        } catch (e: Exception) {
            return ToolResult.failure("Failed to start PTY: ${e.message}")
        }
        if (fd < 0) return ToolResult.failure("Failed to start PTY (native bridge unavailable)")

        val buffer = StringBuilder()
        val latch = CountDownLatch(1)
        val exitCode = AtomicInteger(-1)
        val lock = Any()

        val session = TerminalSession(
            sessionId = "agent-$nonce",
            masterFd = fd,
            processId = pid[0],
            onOutput = { bytes ->
                val text = String(bytes, Charsets.UTF_8)
                val complete = synchronized(lock) {
                    buffer.append(text)
                    val match = exitRegex.find(buffer)
                    if (match != null) {
                        exitCode.set(match.groupValues[1].toIntOrNull() ?: -1)
                        true
                    } else {
                        false
                    }
                }
                if (complete) latch.countDown()
            },
            onExit = { latch.countDown() },
        )

        return try {
            Thread.sleep(40)
            session.write(wrapped + "\n")
            val finished = latch.await(timeoutMs, TimeUnit.MILLISECONDS)
            Thread.sleep(20)
            session.destroy()

            val raw = synchronized(lock) { buffer.toString() }
            val cleaned = stripAnsi(raw)
                .replace(startTag, "")
                .replace(exitRegex, "")
                .replace(wrapped, "")
                .trim()

            val code = exitCode.get()
            val pruned = LayaSystemOneEngine.prune(cleaned, 160)
            val risk = LayaSystemOneEngine.risk(command)

            if (!finished) {
                ToolResult(
                    ok = false,
                    output = pruned,
                    error = "Command timed out after ${timeoutMs}ms",
                    metadata = mapOf(
                        "exitCode" to -1,
                        "timedOut" to true,
                        "risk" to risk.level.name.lowercase(),
                    ),
                )
            } else {
                ToolResult(
                    ok = code == 0,
                    output = pruned,
                    error = if (code == 0) null else "Command exited with code $code",
                    metadata = mapOf(
                        "exitCode" to code,
                        "timedOut" to false,
                        "risk" to risk.level.name.lowercase(),
                    ),
                )
            }
        } catch (e: Exception) {
            session.destroy()
            ToolResult.failure(e.message ?: "Terminal execution failed")
        }
    }

    private fun stripAnsi(value: String): String {
        return value
            .replace(Regex("\u001B\\][^\u0007]*\u0007"), "")
            .replace(Regex("\u001B\\[[0-9;?]*[ -/]*[@-~]"), "")
            .replace(Regex("\u001B[@-Z\\\\-_]"), "")
            .replace("\r\n", "\n")
            .replace('\r', '\n')
    }
}
