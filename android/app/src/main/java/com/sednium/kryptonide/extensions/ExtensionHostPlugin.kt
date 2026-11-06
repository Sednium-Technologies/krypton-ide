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
}
