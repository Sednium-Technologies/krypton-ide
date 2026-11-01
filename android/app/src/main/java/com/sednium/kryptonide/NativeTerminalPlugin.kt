package com.sednium.kryptonide

import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.sednium.kryptonide.terminal.PtyBridge
import com.sednium.kryptonide.terminal.TerminalSession
import com.sednium.kryptonide.terminal.TermuxBootstrapInstaller
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * NativeTerminal Capacitor plugin bridging xterm.js frontends to the native
 * POSIX PTY engine (libkrypton-pty.so) and managing Termux bootstrap lifecycle.
 */
@CapacitorPlugin(name = "NativeTerminal")
class NativeTerminalPlugin : Plugin() {

    companion object {
        private const val TAG = "NativeTerminalPlugin"
    }

    private val sessions = ConcurrentHashMap<String, TerminalSession>()
    private val pluginScope = CoroutineScope(Dispatchers.IO)
    private lateinit var installer: TermuxBootstrapInstaller

    override fun load() {
        super.load()
        installer = TermuxBootstrapInstaller(context)
        installer.ensureDirectories()
        Log.i(TAG, "NativeTerminalPlugin initialized. Termux installed: ${installer.isInstalled()}")
    }

    @PluginMethod
    fun createSession(call: PluginCall) {
        val sessionId = call.getString("sessionId") ?: UUID.randomUUID().toString()
        val requestedCwd = call.getString("cwd")
        val cmd = call.getString("cmd")
        val rows = call.getInt("rows") ?: 24
        val cols = call.getInt("cols") ?: 80

        // Ensure default directories exist before spawning shell
        installer.ensureDirectories()

        // Normalize cwd: fallback to HOME or filesDir if not provided or doesn't exist
        val cwd = when {
            !requestedCwd.isNullOrBlank() && File(requestedCwd).exists() -> requestedCwd
            installer.homeDir.exists() -> installer.homeDir.absolutePath
            else -> context.filesDir.absolutePath
        }

        // Parse custom environment variables
        val envList = mutableListOf<String>()
        val envObj = call.getObject("env")
        if (envObj != null) {
            val keys = envObj.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val value = envObj.getString(key) ?: ""
                envList.add("$key=$value")
            }
        } else {
            val envArr = call.getArray("env")
            if (envArr != null) {
                for (i in 0 until envArr.length()) {
                    envList.add(envArr.getString(i))
                }
            }
        }

        // Add default environment indicators
        envList.add("TERM_PROGRAM=KryptonIDE")
        envList.add("COLORTERM=truecolor")

        val pidArray = IntArray(1)
        val masterFd = PtyBridge.createSubprocess(
            cmd,
            cwd,
            if (envList.isNotEmpty()) envList.toTypedArray() else null,
            pidArray,
            rows,
            cols
        )

        if (masterFd < 0) {
            call.reject("Failed to create PTY subprocess")
            return
        }

        val pid = pidArray[0]
        Log.i(TAG, "Created PTY session $sessionId with pid $pid on masterFd $masterFd")

        val session = TerminalSession(
            sessionId = sessionId,
            masterFd = masterFd,
            processId = pid,
            onOutput = { chunk ->
                val text = String(chunk, Charsets.UTF_8)
                val jsData = JSObject().apply {
                    put("sessionId", sessionId)
                    put("data", text)
                }
                notifyListeners("terminalOutput", jsData)
            },
            onExit = { exitCode ->
                Log.i(TAG, "Session $sessionId exited with code $exitCode")
                sessions.remove(sessionId)
                val jsExit = JSObject().apply {
                    put("sessionId", sessionId)
                    put("exitCode", exitCode)
                }
                notifyListeners("terminalExit", jsExit)
            }
        )

        sessions[sessionId] = session

        val response = JSObject().apply {
            put("sessionId", sessionId)
            put("pid", pid)
        }
        call.resolve(response)
    }

    @PluginMethod
    fun write(call: PluginCall) {
        val sessionId = call.getString("sessionId")
        if (sessionId == null) {
            call.reject("sessionId is required")
            return
        }

        val data = call.getString("data")
        if (data == null) {
            call.reject("data is required")
            return
        }

        val session = sessions[sessionId]
        if (session == null) {
            call.reject("Session $sessionId not found")
            return
        }

        session.write(data)
        call.resolve()
    }

    @PluginMethod
    fun resize(call: PluginCall) {
        val sessionId = call.getString("sessionId")
        if (sessionId == null) {
            call.reject("sessionId is required")
            return
        }

        val rows = call.getInt("rows") ?: 24
        val cols = call.getInt("cols") ?: 80

        val session = sessions[sessionId]
        if (session != null) {
            session.resize(rows, cols)
        }
        call.resolve()
    }

    @PluginMethod
    fun killSession(call: PluginCall) {
        val sessionId = call.getString("sessionId")
        if (sessionId == null) {
            call.reject("sessionId is required")
            return
        }

        val session = sessions.remove(sessionId)
        session?.destroy()
        call.resolve()
    }

    @PluginMethod
    fun getBootstrapStatus(call: PluginCall) {
        val installed = installer.isInstalled()
        val response = JSObject().apply {
            put("installed", installed)
            put("prefixPath", TermuxBootstrapInstaller.PREFIX_PATH)
            put("homePath", TermuxBootstrapInstaller.HOME_PATH)
            put("hasBash", installer.hasBash())
            put("hasPython", installer.hasPython())
            put("hasRust", installer.hasRust())
            put("hasNode", installer.hasNode())
            put("hasClang", installer.hasClang())
            put("arch", installer.determineArch())
        }
        call.resolve(response)
    }

    @PluginMethod
    fun installTermuxBootstrap(call: PluginCall) {
        pluginScope.launch {
            try {
                val success = installer.installBootstrap { status, progress, message ->
                    val jsProgress = JSObject().apply {
                        put("status", status)
                        put("progress", progress)
                        put("message", message)
                    }
                    notifyListeners("bootstrapProgress", jsProgress)
                }
                val response = JSObject().apply {
                    put("success", success)
                }
                call.resolve(response)
            } catch (e: Exception) {
                Log.e(TAG, "Exception during installTermuxBootstrap", e)
                call.reject("Installation failed: ${e.message}")
            }
        }
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        for (session in sessions.values) {
            session.destroy()
        }
        sessions.clear()
    }
}
