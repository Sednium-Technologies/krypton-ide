package com.sednium.kryptonide.extensions

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

@CapacitorPlugin(name = "ExtensionHost")
class ExtensionHostPlugin : Plugin() {

    private val pluginScope = CoroutineScope(Dispatchers.IO)

    private fun getExtensionsDir(): String {
        val dir = File(context.filesDir, "extensions")
        if (!dir.exists()) {
            dir.mkdirs()
        }
        return dir.absolutePath
    }

    @PluginMethod
    fun installVsix(call: PluginCall) {
        val vsixPath = call.getString("path")
        if (vsixPath.isNullOrEmpty()) {
            call.reject("Missing required parameter 'path'")
            return
        }

        if (!ExtensionHostNative.isAvailable()) {
            call.reject("Native krypton-core extension host is not loaded")
            return
        }

        pluginScope.launch {
            try {
                val jsonResponse = ExtensionHostNative.nativeInstallVsix(vsixPath, getExtensionsDir())
                val parsed = JSONObject(jsonResponse)
                if (parsed.optBoolean("success", false)) {
                    val ret = JSObject()
                    ret.put("success", true)
                    if (parsed.has("data")) {
                        ret.put("extension", JSObject(parsed.getJSONObject("data").toString()))
                    }
                    notifyListeners("contributionsChanged", ret)
                    call.resolve(ret)
                } else {
                    val err = parsed.optString("error", "Failed to install VSIX")
                    call.reject(err)
                }
            } catch (e: Exception) {
                call.reject("Extension install error: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun listInstalled(call: PluginCall) {
        if (!ExtensionHostNative.isAvailable()) {
            val ret = JSObject()
            ret.put("extensions", JSArray())
            call.resolve(ret)
            return
        }

        pluginScope.launch {
            try {
                val jsonResponse = ExtensionHostNative.nativeListInstalled(getExtensionsDir())
                val parsed = JSONObject(jsonResponse)
                if (parsed.optBoolean("success", false)) {
                    val ret = JSObject()
                    if (parsed.has("data")) {
                        val dataArray = parsed.getJSONArray("data")
                        val jsArray = JSArray()
                        for (i in 0 until dataArray.length()) {
                            jsArray.put(JSObject(dataArray.getJSONObject(i).toString()))
                        }
                        ret.put("extensions", jsArray)
                    } else {
                        ret.put("extensions", JSArray())
                    }
                    call.resolve(ret)
                } else {
                    val err = parsed.optString("error", "Failed to list extensions")
                    call.reject(err)
                }
            } catch (e: Exception) {
                call.reject("Extension list error: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun uninstall(call: PluginCall) {
        val extensionId = call.getString("id")
        if (extensionId.isNullOrEmpty()) {
            call.reject("Missing required parameter 'id'")
            return
        }

        if (!ExtensionHostNative.isAvailable()) {
            call.reject("Native krypton-core extension host is not loaded")
            return
        }

        pluginScope.launch {
            try {
                val success = ExtensionHostNative.nativeUninstall(extensionId, getExtensionsDir())
                val ret = JSObject()
                ret.put("success", success)
                ret.put("id", extensionId)
                if (success) {
                    notifyListeners("contributionsChanged", ret)
                }
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Extension uninstall error: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun getManifest(call: PluginCall) {
        val extensionId = call.getString("id")
        if (extensionId.isNullOrEmpty()) {
            call.reject("Missing required parameter 'id'")
            return
        }

        if (!ExtensionHostNative.isAvailable()) {
            call.reject("Native krypton-core extension host is not loaded")
            return
        }

        pluginScope.launch {
            try {
                val jsonResponse = ExtensionHostNative.nativeGetManifest(extensionId, getExtensionsDir())
                val parsed = JSONObject(jsonResponse)
                if (parsed.optBoolean("success", false)) {
                    val ret = JSObject()
                    if (parsed.has("data") && !parsed.isNull("data")) {
                        ret.put("manifest", JSObject(parsed.getJSONObject("data").toString()))
                    } else {
                        ret.put("manifest", null)
                    }
                    call.resolve(ret)
                } else {
                    val err = parsed.optString("error", "Failed to get manifest")
                    call.reject(err)
                }
            } catch (e: Exception) {
                call.reject("Extension manifest query error: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun activate(call: PluginCall) {
        val extensionId = call.getString("id")
        if (extensionId.isNullOrEmpty()) {
            call.reject("Missing required parameter 'id'")
            return
        }

        if (!ExtensionHostNative.isAvailable()) {
            call.reject("Native krypton-core extension host is not loaded")
            return
        }

        pluginScope.launch {
            try {
                val jsonResponse = ExtensionHostNative.nativeActivateExtension(extensionId, getExtensionsDir())
                val parsed = JSONObject(jsonResponse)
                if (parsed.optBoolean("success", false)) {
                    val ret = JSObject()
                    ret.put("success", true)
                    ret.put("id", extensionId)
                    ret.put("state", "active")
                    call.resolve(ret)
                } else {
                    val err = parsed.optString("error", "Failed to activate extension")
                    call.reject(err)
                }
            } catch (e: Exception) {
                call.reject("Extension activation error: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun executeCommand(call: PluginCall) {
        val commandId = call.getString("command")
        if (commandId.isNullOrEmpty()) {
            call.reject("Missing required parameter 'command'")
            return
        }

        val argsObj = call.getArray("arguments")
        val argsJson = argsObj?.toString() ?: "[]"

        if (!ExtensionHostNative.isAvailable()) {
            call.reject("Native krypton-core extension host is not loaded")
            return
        }

        pluginScope.launch {
            try {
                val jsonResponse = ExtensionHostNative.nativeExecuteExtensionCommand(commandId, argsJson, getExtensionsDir())
                val parsed = JSONObject(jsonResponse)
                if (parsed.optBoolean("success", false)) {
                    val ret = JSObject()
                    ret.put("success", true)
                    if (parsed.has("data")) {
                        ret.put("result", parsed.get("data"))
                    } else {
                        ret.put("result", null)
                    }
                    call.resolve(ret)
                } else {
                    val err = parsed.optString("error", "Command execution failed")
                    call.reject(err)
                }
            } catch (e: Exception) {
                call.reject("Command execution error: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun listCommands(call: PluginCall) {
        if (!ExtensionHostNative.isAvailable()) {
            val ret = JSObject()
            ret.put("commands", JSArray())
            call.resolve(ret)
            return
        }

        pluginScope.launch {
            try {
                val jsonResponse = ExtensionHostNative.nativeListRegisteredCommands(getExtensionsDir())
                val parsed = JSONObject(jsonResponse)
                if (parsed.optBoolean("success", false)) {
                    val ret = JSObject()
                    if (parsed.has("data")) {
                        val arr = parsed.getJSONArray("data")
                        val jsArray = JSArray()
                        for (i in 0 until arr.length()) {
                            jsArray.put(arr.getString(i))
                        }
                        ret.put("commands", jsArray)
                    } else {
                        ret.put("commands", JSArray())
                    }
                    call.resolve(ret)
                } else {
                    val err = parsed.optString("error", "Failed to list commands")
                    call.reject(err)
                }
            } catch (e: Exception) {
                call.reject("Command listing error: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun drainNotifications(call: PluginCall) {
        if (!ExtensionHostNative.isAvailable()) {
            val ret = JSObject()
            ret.put("notifications", JSArray())
            call.resolve(ret)
            return
        }

        pluginScope.launch {
            try {
                val jsonResponse = ExtensionHostNative.nativeDrainNotifications(getExtensionsDir())
                val parsed = JSONObject(jsonResponse)
                if (parsed.optBoolean("success", false)) {
                    val ret = JSObject()
                    if (parsed.has("data")) {
                        val arr = parsed.getJSONArray("data")
                        val jsArray = JSArray()
                        for (i in 0 until arr.length()) {
                            jsArray.put(JSObject(arr.getJSONObject(i).toString()))
                        }
                        ret.put("notifications", jsArray)
                    } else {
                        ret.put("notifications", JSArray())
                    }
                    call.resolve(ret)
                } else {
                    val err = parsed.optString("error", "Failed to drain notifications")
                    call.reject(err)
                }
            } catch (e: Exception) {
                call.reject("Notification drain error: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun listStatusBarItems(call: PluginCall) {
        if (!ExtensionHostNative.isAvailable()) {
            val ret = JSObject()
            ret.put("items", JSArray())
            call.resolve(ret)
            return
        }

        pluginScope.launch {
            try {
                val jsonResponse = ExtensionHostNative.nativeListStatusBarItems(getExtensionsDir())
                val parsed = JSONObject(jsonResponse)
                if (parsed.optBoolean("success", false)) {
                    val ret = JSObject()
                    if (parsed.has("data")) {
                        val arr = parsed.getJSONArray("data")
                        val jsArray = JSArray()
                        for (i in 0 until arr.length()) {
                            jsArray.put(JSObject(arr.getJSONObject(i).toString()))
                        }
                        ret.put("items", jsArray)
                    } else {
                        ret.put("items", JSArray())
                    }
                    call.resolve(ret)
                } else {
                    val err = parsed.optString("error", "Failed to list status bar items")
                    call.reject(err)
                }
            } catch (e: Exception) {
                call.reject("Status bar list error: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun startLspServer(call: PluginCall) {
        val configObj = call.getObject("config")
        val configJson = configObj?.toString() ?: JSONObject().apply {
            put("id", call.getString("id") ?: "")
            put("languageId", call.getString("languageId") ?: "")
            put("command", call.getString("command") ?: "")
            put("args", call.getArray("args") ?: JSONArray())
            put("cwd", call.getString("cwd"))
        }.toString()

        if (!ExtensionHostNative.isAvailable()) {
            call.reject("Native extension host is not loaded")
            return
        }

        pluginScope.launch {
            try {
                val jsonResponse = ExtensionHostNative.nativeStartLspServer(configJson, getExtensionsDir())
                val parsed = JSONObject(jsonResponse)
                if (parsed.optBoolean("success", false)) {
                    val ret = JSObject()
                    ret.put("success", true)
                    ret.put("sessionId", parsed.optString("data"))
                    call.resolve(ret)
                } else {
                    val err = parsed.optString("error", "Failed to start LSP server")
                    call.reject(err)
                }
            } catch (e: Exception) {
                call.reject("Start LSP error: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun sendLspMessage(call: PluginCall) {
        val sessionId = call.getString("sessionId")
        val message = call.getString("message")

        if (sessionId.isNullOrEmpty() || message.isNullOrEmpty()) {
            call.reject("Missing required parameters 'sessionId' or 'message'")
            return
        }

        if (!ExtensionHostNative.isAvailable()) {
            call.reject("Native extension host is not loaded")
            return
        }

        pluginScope.launch {
            try {
                val ok = ExtensionHostNative.nativeSendLspMessage(sessionId, message, getExtensionsDir())
                val ret = JSObject()
                ret.put("success", ok)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Send LSP message error: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun drainLspMessages(call: PluginCall) {
        val sessionId = call.getString("sessionId")
        if (sessionId.isNullOrEmpty()) {
            call.reject("Missing required parameter 'sessionId'")
            return
        }

        if (!ExtensionHostNative.isAvailable()) {
            val ret = JSObject()
            ret.put("messages", JSArray())
            call.resolve(ret)
            return
        }

        pluginScope.launch {
            try {
                val jsonResponse = ExtensionHostNative.nativeDrainLspMessages(sessionId, getExtensionsDir())
                val parsed = JSONObject(jsonResponse)
                if (parsed.optBoolean("success", false)) {
                    val ret = JSObject()
                    val arr = parsed.optJSONArray("data") ?: JSONArray()
                    val jsArr = JSArray()
                    for (i in 0 until arr.length()) {
                        jsArr.put(arr.getString(i))
                    }
                    ret.put("messages", jsArr)
                    call.resolve(ret)
                } else {
                    val err = parsed.optString("error", "Failed to drain LSP messages")
                    call.reject(err)
                }
            } catch (e: Exception) {
                call.reject("Drain LSP messages error: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun stopLspServer(call: PluginCall) {
        val sessionId = call.getString("sessionId")
        if (sessionId.isNullOrEmpty()) {
            call.reject("Missing required parameter 'sessionId'")
            return
        }

        if (!ExtensionHostNative.isAvailable()) {
            val ret = JSObject()
            ret.put("success", true)
            call.resolve(ret)
            return
        }

        pluginScope.launch {
            try {
                val ok = ExtensionHostNative.nativeStopLspServer(sessionId, getExtensionsDir())
                val ret = JSObject()
                ret.put("success", ok)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Stop LSP server error: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun checkLspBinary(call: PluginCall) {
        val binary = call.getString("binary") ?: ""
        val prefix = call.getString("prefix") ?: ""

        if (!ExtensionHostNative.isAvailable()) {
            val ret = JSObject()
            ret.put("exists", false)
            ret.put("name", binary)
            ret.put("installCommand", "pkg install -y $binary")
            call.resolve(ret)
            return
        }

        pluginScope.launch {
            try {
                val jsonResponse = ExtensionHostNative.nativeCheckLspBinary(binary, prefix, getExtensionsDir())
                val parsed = JSONObject(jsonResponse)
                if (parsed.optBoolean("success", false) && parsed.has("data")) {
                    val data = parsed.getJSONObject("data")
                    call.resolve(JSObject(data.toString()))
                } else {
                    val err = parsed.optString("error", "Failed to check LSP binary")
                    call.reject(err)
                }
            } catch (e: Exception) {
                call.reject("Check LSP binary error: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun getBuiltinLspServers(call: PluginCall) {
        if (!ExtensionHostNative.isAvailable()) {
            val ret = JSObject()
            ret.put("servers", JSArray())
            call.resolve(ret)
            return
        }

        pluginScope.launch {
            try {
                val jsonResponse = ExtensionHostNative.nativeGetBuiltinLspServers(getExtensionsDir())
                val parsed = JSONObject(jsonResponse)
                if (parsed.optBoolean("success", false) && parsed.has("data")) {
                    val arr = parsed.getJSONArray("data")
                    val jsArr = JSArray()
                    for (i in 0 until arr.length()) {
                        jsArr.put(JSObject(arr.getJSONObject(i).toString()))
                    }
                    val ret = JSObject()
                    ret.put("servers", jsArr)
                    call.resolve(ret)
                } else {
                    val err = parsed.optString("error", "Failed to get builtin LSP servers")
                    call.reject(err)
                }
            } catch (e: Exception) {
                call.reject("Get builtin LSP servers error: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun setWorkspaceTrust(call: PluginCall) {
        val state = call.getString("state") ?: "restricted"
        val root = call.getString("workspaceRoot") ?: ""

        if (!ExtensionHostNative.isAvailable()) {
            val ret = JSObject()
            ret.put("state", state)
            ret.put("workspaceRoot", root)
            ret.put("isTrusted", state.equals("trusted", ignoreCase = true))
            call.resolve(ret)
            return
        }

        pluginScope.launch {
            try {
                val jsonResponse = ExtensionHostNative.nativeSetWorkspaceTrust(state, root, getExtensionsDir())
                val parsed = JSONObject(jsonResponse)
                if (parsed.optBoolean("success", false) && parsed.has("data")) {
                    val data = parsed.getJSONObject("data")
                    call.resolve(JSObject(data.toString()))
                } else {
                    val err = parsed.optString("error", "Failed to set workspace trust")
                    call.reject(err)
                }
            } catch (e: Exception) {
                call.reject("Set workspace trust error: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun getWorkspaceTrust(call: PluginCall) {
        if (!ExtensionHostNative.isAvailable()) {
            val ret = JSObject()
            ret.put("state", "restricted")
            ret.put("workspaceRoot", "")
            ret.put("isTrusted", false)
            call.resolve(ret)
            return
        }

        pluginScope.launch {
            try {
                val jsonResponse = ExtensionHostNative.nativeGetWorkspaceTrust(getExtensionsDir())
                val parsed = JSONObject(jsonResponse)
                if (parsed.optBoolean("success", false) && parsed.has("data")) {
                    val data = parsed.getJSONObject("data")
                    call.resolve(JSObject(data.toString()))
                } else {
                    val err = parsed.optString("error", "Failed to get workspace trust")
                    call.reject(err)
                }
            } catch (e: Exception) {
                call.reject("Get workspace trust error: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun checkCapability(call: PluginCall) {
        val capability = call.getString("capability") ?: ""

        if (!ExtensionHostNative.isAvailable()) {
            val ret = JSObject()
            ret.put("capability", capability)
            ret.put("allowed", false)
            ret.put("error", "Native extension host unavailable")
            call.resolve(ret)
            return
        }

        pluginScope.launch {
            try {
                val jsonResponse = ExtensionHostNative.nativeCheckCapability(capability, getExtensionsDir())
                val parsed = JSONObject(jsonResponse)
                if (parsed.optBoolean("success", false) && parsed.has("data")) {
                    val data = parsed.getJSONObject("data")
                    call.resolve(JSObject(data.toString()))
                } else {
                    val err = parsed.optString("error", "Failed to check capability")
                    call.reject(err)
                }
            } catch (e: Exception) {
                call.reject("Check capability error: ${e.message}", e)
            }
        }
    }
}
