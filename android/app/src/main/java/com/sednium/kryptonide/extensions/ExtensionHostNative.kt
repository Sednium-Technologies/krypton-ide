package com.sednium.kryptonide.extensions

/**
 * JNI bindings to the native extension host in `libkrypton_core_rs.so`.
 *
 * All operations cross foreign boundaries safely via Rust's `catch_unwind`.
 */
object ExtensionHostNative {

    private var isLoaded = false

    init {
        try {
            System.loadLibrary("krypton_core_rs")
            isLoaded = true
        } catch (e: UnsatisfiedLinkError) {
            android.util.Log.w("ExtensionHostNative", "Native library libkrypton_core_rs.so not loaded: ${e.message}")
        }
    }

    fun isAvailable(): Boolean = isLoaded

    @JvmStatic
    external fun nativeInstallVsix(vsixPath: String, extensionsDir: String): String

    @JvmStatic
    external fun nativeListInstalled(extensionsDir: String): String

    @JvmStatic
    external fun nativeUninstall(extensionId: String, extensionsDir: String): Boolean

    @JvmStatic
    external fun nativeGetManifest(extensionId: String, extensionsDir: String): String

    @JvmStatic
    external fun nativeActivateExtension(extensionId: String, extensionsDir: String): String

    @JvmStatic
    external fun nativeExecuteExtensionCommand(commandId: String, argsJson: String, extensionsDir: String): String

    @JvmStatic
    external fun nativeListRegisteredCommands(extensionsDir: String): String

    @JvmStatic
    external fun nativeDrainNotifications(extensionsDir: String): String

    @JvmStatic
    external fun nativeListStatusBarItems(extensionsDir: String): String

    @JvmStatic
    external fun nativeStartLspServer(configJson: String, extensionsDir: String): String

    @JvmStatic
    external fun nativeSendLspMessage(sessionId: String, messageJson: String, extensionsDir: String): Boolean

    @JvmStatic
    external fun nativeDrainLspMessages(sessionId: String, extensionsDir: String): String

    @JvmStatic
    external fun nativeStopLspServer(sessionId: String, extensionsDir: String): Boolean

    @JvmStatic
    external fun nativeCheckLspBinary(binaryName: String, customPrefix: String, extensionsDir: String): String

    @JvmStatic
    external fun nativeGetBuiltinLspServers(extensionsDir: String): String

    @JvmStatic
    external fun nativeSetWorkspaceTrust(state: String, workspaceRoot: String, extensionsDir: String): String

    @JvmStatic
    external fun nativeGetWorkspaceTrust(extensionsDir: String): String

    @JvmStatic
    external fun nativeCheckCapability(capability: String, extensionsDir: String): String
}
