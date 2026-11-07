#[cfg(not(target_arch = "wasm32"))]
pub mod ext_jni_impl {
    use crate::ext_host::{
        get_installed_manifest, install_vsix, list_installed, uninstall_extension,
        ExtensionLifecycleManager,
    };
    use jni::objects::{JClass, JString};
    use jni::sys::{jboolean, jstring};
    use jni::JNIEnv;
    use serde::Serialize;
    use std::path::Path;
    use std::sync::OnceLock;

    static MANAGER: OnceLock<ExtensionLifecycleManager> = OnceLock::new();

    fn get_manager(extensions_dir: &Path) -> &'static ExtensionLifecycleManager {
        MANAGER.get_or_init(|| {
            let storage_dir = extensions_dir.join(".storage");
            let log_dir = extensions_dir.join(".logs");
            let mgr = ExtensionLifecycleManager::new(storage_dir, log_dir);

            if let Ok(installed) = list_installed(extensions_dir) {
                for ext in installed {
                    mgr.register_extension(ext);
                }
            }
            mgr
        })
    }

    fn to_json_jstring<T: Serialize>(env: &mut JNIEnv, result: Result<T, String>) -> jstring {
        let json = match result {
            Ok(data) => serde_json::to_string(&serde_json::json!({
                "success": true,
                "data": data,
            })),
            Err(err) => serde_json::to_string(&serde_json::json!({
                "success": false,
                "error": err,
            })),
        }
        .unwrap_or_else(|_| r#"{"success":false,"error":"Serialization failed"}"#.to_string());

        env.new_string(&json)
            .map(|s| s.as_raw())
            .unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeInstallVsix(
        mut env: JNIEnv,
        _class: JClass,
        vsix_path: JString,
        extensions_dir: JString,
    ) -> jstring {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let vsix_str: String = match env.get_string(&vsix_path) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid vsix_path JString: {}", e)),
                    )
                }
            };

            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid extensions_dir JString: {}", e)),
                    )
                }
            };

            let res = install_vsix(Path::new(&vsix_str), Path::new(&dir_str));
            if let Ok(ref ext) = res {
                let mgr = get_manager(Path::new(&dir_str));
                mgr.register_extension(ext.clone());
            }

            to_json_jstring(&mut env, res)
        }));

        result.unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeListInstalled(
        mut env: JNIEnv,
        _class: JClass,
        extensions_dir: JString,
    ) -> jstring {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid extensions_dir JString: {}", e)),
                    )
                }
            };

            let res = list_installed(Path::new(&dir_str));
            to_json_jstring(&mut env, res)
        }));

        result.unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeUninstall(
        mut env: JNIEnv,
        _class: JClass,
        extension_id: JString,
        extensions_dir: JString,
    ) -> jboolean {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let id_str: String = match env.get_string(&extension_id) {
                Ok(s) => s.into(),
                Err(_) => return 0,
            };

            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(_) => return 0,
            };

            let mgr = get_manager(Path::new(&dir_str));
            let _ = mgr.unregister_extension(&id_str);

            match uninstall_extension(&id_str, Path::new(&dir_str)) {
                Ok(true) => 1,
                _ => 0,
            }
        }));

        result.unwrap_or(0)
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeGetManifest(
        mut env: JNIEnv,
        _class: JClass,
        extension_id: JString,
        extensions_dir: JString,
    ) -> jstring {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let id_str: String = match env.get_string(&extension_id) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid extension_id JString: {}", e)),
                    )
                }
            };

            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid extensions_dir JString: {}", e)),
                    )
                }
            };

            let res = get_installed_manifest(&id_str, Path::new(&dir_str));
            to_json_jstring(&mut env, res)
        }));

        result.unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeActivateExtension(
        mut env: JNIEnv,
        _class: JClass,
        extension_id: JString,
        extensions_dir: JString,
    ) -> jstring {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let id_str: String = match env.get_string(&extension_id) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid extension_id JString: {}", e)),
                    )
                }
            };

            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid extensions_dir JString: {}", e)),
                    )
                }
            };

            let mgr = get_manager(Path::new(&dir_str));
            let res = mgr
                .activate_extension(&id_str)
                .map(|_| serde_json::json!({ "id": id_str, "state": "active" }));
            to_json_jstring(&mut env, res)
        }));

        result.unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeExecuteExtensionCommand(
        mut env: JNIEnv,
        _class: JClass,
        command_id: JString,
        args_json: JString,
        extensions_dir: JString,
    ) -> jstring {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let cmd_str: String = match env.get_string(&command_id) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid command_id JString: {}", e)),
                    )
                }
            };

            let args_str: String = match env.get_string(&args_json) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid args_json JString: {}", e)),
                    )
                }
            };

            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid extensions_dir JString: {}", e)),
                    )
                }
            };

            let mgr = get_manager(Path::new(&dir_str));
            let res = mgr.execute_command(&cmd_str, &args_str);
            to_json_jstring(&mut env, res)
        }));

        result.unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeListRegisteredCommands(
        mut env: JNIEnv,
        _class: JClass,
        extensions_dir: JString,
    ) -> jstring {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid extensions_dir JString: {}", e)),
                    )
                }
            };

            let mgr = get_manager(Path::new(&dir_str));
            let cmds = mgr.list_commands();
            to_json_jstring(&mut env, Ok(cmds))
        }));

        result.unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeDrainNotifications(
        mut env: JNIEnv,
        _class: JClass,
        extensions_dir: JString,
    ) -> jstring {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid extensions_dir JString: {}", e)),
                    )
                }
            };

            let mgr = get_manager(Path::new(&dir_str));
            let notes = mgr.drain_notifications();
            to_json_jstring(&mut env, Ok(notes))
        }));

        result.unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeListStatusBarItems(
        mut env: JNIEnv,
        _class: JClass,
        extensions_dir: JString,
    ) -> jstring {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid extensions_dir JString: {}", e)),
                    )
                }
            };

            let mgr = get_manager(Path::new(&dir_str));
            let items = mgr.list_status_bar_items();
            to_json_jstring(&mut env, Ok(items))
        }));

        result.unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeStartLspServer(
        mut env: JNIEnv,
        _class: JClass,
        config_json: JString,
        extensions_dir: JString,
    ) -> jstring {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let conf_str: String = match env.get_string(&config_json) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid config_json JString: {}", e)),
                    )
                }
            };

            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid extensions_dir JString: {}", e)),
                    )
                }
            };

            let config: crate::ext_host::lsp::LspServerConfig = match serde_json::from_str(&conf_str) {
                Ok(c) => c,
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Malformed LspServerConfig JSON: {}", e)),
                    )
                }
            };

            let mgr = get_manager(Path::new(&dir_str));
            let res = mgr.lsp.start_server(config);
            to_json_jstring(&mut env, res)
        }));

        result.unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeSendLspMessage(
        mut env: JNIEnv,
        _class: JClass,
        session_id: JString,
        message_json: JString,
        extensions_dir: JString,
    ) -> jboolean {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let session_str: String = match env.get_string(&session_id) {
                Ok(s) => s.into(),
                Err(_) => return 0,
            };

            let msg_str: String = match env.get_string(&message_json) {
                Ok(s) => s.into(),
                Err(_) => return 0,
            };

            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(_) => return 0,
            };

            let mgr = get_manager(Path::new(&dir_str));
            if mgr.lsp.send_message(&session_str, &msg_str).is_ok() {
                1
            } else {
                0
            }
        }));

        result.unwrap_or(0)
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeDrainLspMessages(
        mut env: JNIEnv,
        _class: JClass,
        session_id: JString,
        extensions_dir: JString,
    ) -> jstring {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let session_str: String = match env.get_string(&session_id) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid session_id JString: {}", e)),
                    )
                }
            };

            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid extensions_dir JString: {}", e)),
                    )
                }
            };

            let mgr = get_manager(Path::new(&dir_str));
            let res = mgr.lsp.drain_messages(&session_str);
            to_json_jstring(&mut env, res)
        }));

        result.unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeStopLspServer(
        mut env: JNIEnv,
        _class: JClass,
        session_id: JString,
        extensions_dir: JString,
    ) -> jboolean {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let session_str: String = match env.get_string(&session_id) {
                Ok(s) => s.into(),
                Err(_) => return 0,
            };

            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(_) => return 0,
            };

            let mgr = get_manager(Path::new(&dir_str));
            if mgr.lsp.stop_server(&session_str).is_ok() {
                1
            } else {
                0
            }
        }));

        result.unwrap_or(0)
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeCheckLspBinary(
        mut env: JNIEnv,
        _class: JClass,
        binary_name: JString,
        custom_prefix: JString,
        extensions_dir: JString,
    ) -> jstring {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let name_str: String = match env.get_string(&binary_name) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid binary_name JString: {}", e)),
                    )
                }
            };

            let prefix_opt: Option<String> = env
                .get_string(&custom_prefix)
                .ok()
                .map(|s| s.into())
                .filter(|s: &String| !s.is_empty());

            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid extensions_dir JString: {}", e)),
                    )
                }
            };

            let mgr = get_manager(Path::new(&dir_str));
            let check = mgr.lsp.check_binary(&name_str, prefix_opt.as_deref());
            to_json_jstring(&mut env, Ok(check))
        }));

        result.unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeGetBuiltinLspServers(
        mut env: JNIEnv,
        _class: JClass,
        extensions_dir: JString,
    ) -> jstring {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid extensions_dir JString: {}", e)),
                    )
                }
            };

            let mgr = get_manager(Path::new(&dir_str));
            let servers = mgr.lsp.get_builtin_servers();
            to_json_jstring(&mut env, Ok(servers))
        }));

        result.unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeSetWorkspaceTrust(
        mut env: JNIEnv,
        _class: JClass,
        state: JString,
        workspace_root: JString,
        extensions_dir: JString,
    ) -> jstring {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let state_str: String = match env.get_string(&state) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid state JString: {}", e)),
                    )
                }
            };

            let root_str: String = env
                .get_string(&workspace_root)
                .ok()
                .map(|s| s.into())
                .unwrap_or_default();

            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid extensions_dir JString: {}", e)),
                    )
                }
            };

            let mgr = get_manager(Path::new(&dir_str));
            let parsed_state = match state_str.to_lowercase().as_str() {
                "trusted" => crate::ext_host::trust::WorkspaceTrustState::Trusted,
                "untrusted" => crate::ext_host::trust::WorkspaceTrustState::Untrusted,
                _ => crate::ext_host::trust::WorkspaceTrustState::Restricted,
            };

            mgr.trust.set_state(parsed_state);
            if !root_str.trim().is_empty() {
                mgr.trust.set_workspace_root(Path::new(&root_str));
            }

            let ret_data = serde_json::json!({
                "state": mgr.trust.get_state(),
                "workspaceRoot": mgr.trust.get_workspace_root().map(|p| p.to_string_lossy().to_string()),
                "isTrusted": mgr.trust.is_trusted(),
            });

            to_json_jstring(&mut env, Ok(ret_data))
        }));

        result.unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeGetWorkspaceTrust(
        mut env: JNIEnv,
        _class: JClass,
        extensions_dir: JString,
    ) -> jstring {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid extensions_dir JString: {}", e)),
                    )
                }
            };

            let mgr = get_manager(Path::new(&dir_str));
            let ret_data = serde_json::json!({
                "state": mgr.trust.get_state(),
                "workspaceRoot": mgr.trust.get_workspace_root().map(|p| p.to_string_lossy().to_string()),
                "isTrusted": mgr.trust.is_trusted(),
            });

            to_json_jstring(&mut env, Ok(ret_data))
        }));

        result.unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeCheckCapability(
        mut env: JNIEnv,
        _class: JClass,
        capability: JString,
        extensions_dir: JString,
    ) -> jstring {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let cap_str: String = match env.get_string(&capability) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid capability JString: {}", e)),
                    )
                }
            };

            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(e) => {
                    return to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Invalid extensions_dir JString: {}", e)),
                    )
                }
            };

            let mgr = get_manager(Path::new(&dir_str));
            let parsed_cap = match cap_str.as_str() {
                "spawnProcess" | "SpawnProcess" => Some(crate::ext_host::trust::Capability::SpawnProcess),
                "fsOutsideWorkspace" | "FsOutsideWorkspace" => Some(crate::ext_host::trust::Capability::FsOutsideWorkspace),
                "fsWrite" | "FsWrite" => Some(crate::ext_host::trust::Capability::FsWrite),
                "network" | "Network" => Some(crate::ext_host::trust::Capability::Network),
                "terminalWrite" | "TerminalWrite" => Some(crate::ext_host::trust::Capability::TerminalWrite),
                _ => None,
            };

            match parsed_cap {
                Some(cap) => {
                    let check = mgr.trust.check_capability(cap);
                    let ret_data = serde_json::json!({
                        "capability": cap_str,
                        "allowed": check.is_ok(),
                        "error": check.err(),
                    });
                    to_json_jstring(&mut env, Ok(ret_data))
                }
                None => {
                    to_json_jstring::<()>(
                        &mut env,
                        Err(format!("Unknown capability: {}", cap_str)),
                    )
                }
            }
        }));

        result.unwrap_or(std::ptr::null_mut())
    }
}
