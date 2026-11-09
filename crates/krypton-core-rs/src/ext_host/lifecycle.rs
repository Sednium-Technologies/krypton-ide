#[cfg(not(target_arch = "wasm32"))]
pub mod lifecycle_impl {
    use std::collections::HashMap;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex};
    use serde::{Deserialize, Serialize};

    use crate::ext_host::installer::InstalledExtension;
    use crate::ext_host::runtime::ExtensionRuntime;
    use crate::ext_host::vscode_api::{window::StatusBarItemState, NotificationMessage, VscodeApiHost, WebviewSnapshot};

    #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub enum ExtensionState {
        Installed,
        Activating,
        Active,
        Deactivated,
        Failed(String),
    }

    pub struct ActiveExtensionInstance {
        pub extension: InstalledExtension,
        pub runtime: ExtensionRuntime,
        pub api: VscodeApiHost,
    }

    #[derive(Clone)]
    pub struct ExtensionLifecycleManager {
        registry: Arc<Mutex<HashMap<String, InstalledExtension>>>,
        active: Arc<Mutex<HashMap<String, ActiveExtensionInstance>>>,
        states: Arc<Mutex<HashMap<String, ExtensionState>>>,
        pub lsp: Arc<crate::ext_host::lsp::LspManager>,
        pub trust: Arc<crate::ext_host::trust::TrustManager>,
        global_storage_dir: PathBuf,
        log_dir: PathBuf,
    }

    impl ExtensionLifecycleManager {
        pub fn new(global_storage_dir: PathBuf, log_dir: PathBuf) -> Self {
            let _ = fs::create_dir_all(&global_storage_dir);
            let _ = fs::create_dir_all(&log_dir);

            Self {
                registry: Arc::new(Mutex::new(HashMap::new())),
                active: Arc::new(Mutex::new(HashMap::new())),
                states: Arc::new(Mutex::new(HashMap::new())),
                lsp: Arc::new(crate::ext_host::lsp::LspManager::new()),
                trust: Arc::new(crate::ext_host::trust::TrustManager::new()),
                global_storage_dir,
                log_dir,
            }
        }

        pub fn register_extension(&self, ext: InstalledExtension) {
            let id = ext.id.clone();
            if let Ok(mut reg) = self.registry.lock() {
                reg.insert(id.clone(), ext);
            }
            if let Ok(mut states) = self.states.lock() {
                states.entry(id).or_insert(ExtensionState::Installed);
            }
        }

        pub fn unregister_extension(&self, id: &str) -> Result<(), String> {
            let _ = self.deactivate_extension(id);
            if let Ok(mut reg) = self.registry.lock() {
                reg.remove(id);
            }
            if let Ok(mut states) = self.states.lock() {
                states.remove(id);
            }
            Ok(())
        }

        pub fn get_extension_state(&self, id: &str) -> ExtensionState {
            if let Ok(states) = self.states.lock() {
                if let Some(s) = states.get(id) {
                    return s.clone();
                }
            }
            ExtensionState::Installed
        }

        pub fn list_registered(&self) -> Vec<InstalledExtension> {
            self.registry
                .lock()
                .map(|r| r.values().cloned().collect())
                .unwrap_or_default()
        }

        pub fn list_active(&self) -> Vec<String> {
            self.active
                .lock()
                .map(|a| a.keys().cloned().collect())
                .unwrap_or_default()
        }

        pub fn activate_extension(&self, id: &str) -> Result<(), String> {
            // Check if already active
            if let Ok(active) = self.active.lock() {
                if active.contains_key(id) {
                    return Ok(());
                }
            }

            // Get extension metadata
            let ext = {
                let reg = self.registry.lock().map_err(|e| e.to_string())?;
                match reg.get(id) {
                    Some(e) => e.clone(),
                    None => return Err(format!("Extension '{id}' is not registered")),
                }
            };

            // Set state to activating
            if let Ok(mut states) = self.states.lock() {
                states.insert(id.to_string(), ExtensionState::Activating);
            }

            // Find entry point script
            let main_rel = ext
                .manifest
                .main
                .as_deref()
                .unwrap_or("extension/main.js");

            let mut script_path = ext.location.join(main_rel);
            if !script_path.exists() {
                let fallback = ext.location.join("extension").join(main_rel);
                if fallback.exists() {
                    script_path = fallback;
                }
            }

            if !script_path.exists() {
                let err_msg = format!("Main script not found at {}", script_path.display());
                if let Ok(mut states) = self.states.lock() {
                    states.insert(id.to_string(), ExtensionState::Failed(err_msg.clone()));
                }
                return Err(err_msg);
            }

            let script_code = match fs::read_to_string(&script_path) {
                Ok(c) => c,
                Err(e) => {
                    let err_msg = format!("Failed to read script {}: {e}", script_path.display());
                    if let Ok(mut states) = self.states.lock() {
                        states.insert(id.to_string(), ExtensionState::Failed(err_msg.clone()));
                    }
                    return Err(err_msg);
                }
            };

            // Create QuickJS runtime & inject vscode API
            let runtime = ExtensionRuntime::new()?;
            let api = VscodeApiHost::with_lsp_and_trust(self.lsp.clone(), self.trust.clone());
            api.inject_into_runtime_with_id(
                &runtime,
                &ext.location.to_string_lossy(),
                id,
            )?;

            let location_json = serde_json::to_string(&ext.location.to_string_lossy())
                .unwrap_or_else(|_| "\"\"".to_string());
            let storage_json = serde_json::to_string(&self.global_storage_dir.to_string_lossy())
                .unwrap_or_else(|_| "\"\"".to_string());
            let log_json = serde_json::to_string(&self.log_dir.to_string_lossy())
                .unwrap_or_else(|_| "\"\"".to_string());
            let filename_json = serde_json::to_string(&script_path.to_string_lossy())
                .unwrap_or_else(|_| "\"\"".to_string());
            let dirname_json = serde_json::to_string(
                &script_path
                    .parent()
                    .unwrap_or(&ext.location)
                    .to_string_lossy(),
            )
            .unwrap_or_else(|_| "\"\"".to_string());

            // Build Context and execute CJS wrapper
            let wrapped_cjs = format!(
                r#"
                (function() {{
                    globalThis.__krypton_context = {{
                        subscriptions: [],
                        extensionPath: {location_json},
                        extensionUri: vscode.Uri.file({location_json}),
                        globalStorageUri: vscode.Uri.file({storage_json}),
                        storageUri: vscode.Uri.file({storage_json}),
                        globalStoragePath: {storage_json},
                        logUri: vscode.Uri.file({log_json}),
                        logPath: {log_json},
                        extensionMode: 1,
                        globalState: vscode.workspace.globalState,
                        workspaceState: vscode.workspace.workspaceState,
                        secrets: {{
                            get: function() {{ return Promise.resolve(undefined); }},
                            store: function() {{ return Promise.resolve(); }},
                            delete: function() {{ return Promise.resolve(); }},
                            onDidChange: function() {{ return new Disposable(function() {{}}); }}
                        }},
                        environmentVariableCollection: {{
                            replace: function() {{}},
                            append: function() {{}},
                            prepend: function() {{}},
                            clear: function() {{}},
                            delete: function() {{}},
                            get: function() {{ return undefined; }},
                            forEach: function() {{}}
                        }},
                        asAbsolutePath: function(rel) {{
                            return {location_json} + '/' + rel.replace(/^\.?\//, '');
                        }}
                    }};

                    (function(exports, require, module, __filename, __dirname) {{
                        {script_code}
                    }})(globalThis.module.exports, globalThis.require, globalThis.module, {filename_json}, {dirname_json});

                    if (globalThis.module && globalThis.module.exports && typeof globalThis.module.exports.activate === 'function') {{
                        return globalThis.module.exports.activate(globalThis.__krypton_context);
                    }}
                    return null;
                }})();
                "#
            );

            let activation_result = runtime
                .eval_string(&wrapped_cjs)
                .and(runtime.pump_jobs());

            // Keep the runtime alive even when activation throws. Many desktop
            // extensions register commands, providers, or webviews before a late
            // unsupported API call fails, and those partial contributions remain
            // usable through the native host.
            if let Ok(mut active) = self.active.lock() {
                active.insert(
                    id.to_string(),
                    ActiveExtensionInstance {
                        extension: ext,
                        runtime,
                        api,
                    },
                );
            }

            match activation_result {
                Ok(_) => {
                    if let Ok(mut states) = self.states.lock() {
                        states.insert(id.to_string(), ExtensionState::Active);
                    }
                    Ok(())
                }
                Err(e) => {
                    let err_msg = format!("Failed during activation of extension '{id}': {e}");
                    if let Ok(mut states) = self.states.lock() {
                        states.insert(id.to_string(), ExtensionState::Failed(err_msg.clone()));
                    }
                    Err(err_msg)
                }
            }
        }

        pub fn deactivate_extension(&self, id: &str) -> Result<(), String> {
            let instance = {
                let mut active = self.active.lock().map_err(|e| e.to_string())?;
                active.remove(id)
            };

            if let Some(inst) = instance {
                inst.api.webviews.clear_extension(id);
                let deact_code = r#"
                    (function() {
                        if (globalThis.__krypton_context && Array.isArray(globalThis.__krypton_context.subscriptions)) {
                            for (var i = 0; i < globalThis.__krypton_context.subscriptions.length; i++) {
                                var item = globalThis.__krypton_context.subscriptions[i];
                                if (item && typeof item.dispose === 'function') {
                                    try { item.dispose(); } catch (e) {}
                                }
                            }
                        }
                        if (globalThis.module && globalThis.module.exports && typeof globalThis.module.exports.deactivate === 'function') {
                            try { globalThis.module.exports.deactivate(); } catch (e) {}
                        }
                    })();
                "#;
                let _ = inst.runtime.eval_string(deact_code);
                let _ = inst.runtime.pump_jobs();
            }

            if let Ok(mut states) = self.states.lock() {
                states.insert(id.to_string(), ExtensionState::Deactivated);
            }

            Ok(())
        }

        pub fn emit_activation_event(&self, event: &str) -> Vec<String> {
            let pending: Vec<(String, Vec<String>)> = {
                let reg = match self.registry.lock() {
                    Ok(r) => r,
                    Err(_) => return Vec::new(),
                };
                let active = match self.active.lock() {
                    Ok(a) => a,
                    Err(_) => return Vec::new(),
                };

                reg.iter()
                    .filter(|(id, _)| !active.contains_key(*id))
                    .map(|(id, ext)| (id.clone(), ext.manifest.activation_events.clone()))
                    .collect()
            };

            let mut activated = Vec::new();
            for (id, events) in pending {
                let should_activate = events.iter().any(|ev| {
                    ev == "*"
                        || ev == event
                        || (event.starts_with("onCommand:") && ev == event)
                        || (event == "onStartupFinished" && ev == "onStartupFinished")
                });

                if should_activate && self.activate_extension(&id).is_ok() {
                    activated.push(id);
                }
            }

            activated
        }

        pub fn execute_command(
            &self,
            command_id: &str,
            args_json: &str,
        ) -> Result<serde_json::Value, String> {
            // Lazy activation for onCommand
            let event = format!("onCommand:{command_id}");
            self.emit_activation_event(&event);

            let active = self.active.lock().map_err(|e| e.to_string())?;
            for inst in active.values() {
                if inst.api.commands.has(command_id) {
                    return inst.api.execute_command(&inst.runtime, command_id, args_json);
                }
            }

            Err(format!("Command '{command_id}' not found"))
        }

        pub fn list_commands(&self) -> Vec<String> {
            let active = match self.active.lock() {
                Ok(a) => a,
                Err(_) => return Vec::new(),
            };

            let mut all_commands = Vec::new();
            for inst in active.values() {
                for cmd in inst.api.list_commands() {
                    if !all_commands.contains(&cmd) {
                        all_commands.push(cmd);
                    }
                }
            }
            all_commands
        }

        pub fn drain_notifications(&self) -> Vec<NotificationMessage> {
            let active = match self.active.lock() {
                Ok(a) => a,
                Err(_) => return Vec::new(),
            };

            let mut all_notes = Vec::new();
            for inst in active.values() {
                all_notes.extend(inst.api.drain_notifications());
            }
            all_notes
        }

        pub fn list_status_bar_items(&self) -> Vec<StatusBarItemState> {
            let active = match self.active.lock() {
                Ok(a) => a,
                Err(_) => return Vec::new(),
            };

            let mut all_items = Vec::new();
            for inst in active.values() {
                all_items.extend(inst.api.list_status_bar_items());
            }
            all_items.sort_by(|a, b| b.priority.cmp(&a.priority));
            all_items
        }

        /// Activates (if necessary) and resolves a runtime webview view provider.
        pub fn resolve_webview_view(
            &self,
            extension_id: &str,
            view_id: &str,
        ) -> Result<Option<WebviewSnapshot>, String> {
            // Partial activation is intentionally tolerated: desktop extensions
            // often register their webview provider before a later unsupported
            // API call fails.
            let _ = self.activate_extension(extension_id);

            let active = self.active.lock().map_err(|e| e.to_string())?;
            let instance = active
                .get(extension_id)
                .ok_or_else(|| format!("Extension '{extension_id}' is not active"))?;
            instance
                .api
                .resolve_webview_view(&instance.runtime, extension_id, view_id)
        }

        /// Drains queued extension -> webview messages for a running extension.
        pub fn drain_webviews(&self, extension_id: &str) -> Vec<WebviewSnapshot> {
            let active = match self.active.lock() {
                Ok(active) => active,
                Err(_) => return Vec::new(),
            };
            let mut result = Vec::new();
            for (id, instance) in active.iter() {
                if id == extension_id {
                    result.extend(instance.api.webviews.drain(extension_id));
                }
            }
            result
        }

        /// Delivers a message from a sandboxed iframe to the owning extension.
        pub fn send_webview_message(
            &self,
            webview_id: &str,
            message_json: &str,
        ) -> Result<bool, String> {
            let active = self.active.lock().map_err(|e| e.to_string())?;
            for instance in active.values() {
                if instance.api.webviews.contains(webview_id) {
                    instance
                        .api
                        .send_webview_message(&instance.runtime, webview_id, message_json)?;
                    return Ok(true);
                }
            }
            Ok(false)
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub use lifecycle_impl::*;
