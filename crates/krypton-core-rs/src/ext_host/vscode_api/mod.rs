pub mod commands;
pub mod window;
pub mod workspace;

pub use commands::CommandRegistry;
pub use window::{NotificationMessage, WindowHost};
pub use workspace::WorkspaceHost;

use rquickjs::Function;

#[derive(Debug, Clone, Default)]
pub struct VscodeApiHost {
    pub commands: CommandRegistry,
    pub window: WindowHost,
    pub workspace: WorkspaceHost,
}

impl VscodeApiHost {
    pub fn new() -> Self {
        Self {
            commands: CommandRegistry::new(),
            window: WindowHost::new(),
            workspace: WorkspaceHost::new(),
        }
    }

    pub fn list_commands(&self) -> Vec<String> {
        self.commands.list()
    }

    pub fn drain_notifications(&self) -> Vec<NotificationMessage> {
        self.window.drain_notifications()
    }

    pub fn execute_command(
        &self,
        runtime: &super::runtime::ExtensionRuntime,
        command_id: &str,
        args_json: &str,
    ) -> Result<serde_json::Value, String> {
        let cmd_id_json = serde_json::to_string(command_id).map_err(|e| e.to_string())?;
        let safe_args = if args_json.trim().is_empty() {
            "[]"
        } else {
            args_json.trim()
        };

        let _: serde_json::Value =
            serde_json::from_str(safe_args).map_err(|e| format!("Invalid args_json: {e}"))?;

        let script = format!(
            r#"(function() {{
                var cmdId = {cmd_id_json};
                var fn = globalThis.__krypton_commands && globalThis.__krypton_commands[cmdId];
                if (!fn) {{
                    throw new Error("Command not found: " + cmdId);
                }}
                var args = {safe_args};
                var res = fn.apply(null, args);
                return res !== undefined ? res : null;
            }})()"#
        );

        let res = runtime.eval_json(&script)?;
        runtime.pump_jobs()?;
        Ok(res)
    }

    pub fn inject_into_runtime(
        &self,
        runtime: &super::runtime::ExtensionRuntime,
        base_dir: &str,
    ) -> Result<(), String> {
        let commands = self.commands.clone();
        let window = self.window.clone();
        let workspace = self.workspace.clone();

        runtime
            .context()
            .with(|ctx| -> Result<(), rquickjs::Error> {
                let globals = ctx.globals();

                let cmd_reg = commands.clone();
                let fn_register = Function::new(ctx.clone(), move |id: String| {
                    cmd_reg.register(&id);
                })?;
                globals.set("__krypton_native_register_command", fn_register)?;

                let cmd_unreg = commands.clone();
                let fn_unregister = Function::new(ctx.clone(), move |id: String| {
                    cmd_unreg.unregister(&id);
                })?;
                globals.set("__krypton_native_unregister_command", fn_unregister)?;

                let win = window.clone();
                let fn_notify = Function::new(
                    ctx.clone(),
                    move |level: String, msg: String, items_json: Option<String>| {
                        let items_str = items_json.unwrap_or_else(|| "[]".to_string());
                        let items: Vec<String> =
                            serde_json::from_str(&items_str).unwrap_or_default();
                        win.push_notification(NotificationMessage {
                            level,
                            message: msg,
                            items,
                        });
                    },
                )?;
                globals.set("__krypton_native_notify", fn_notify)?;

                let ws = workspace.clone();
                let fn_get_config =
                    Function::new(ctx.clone(), move |section: Option<String>| -> String {
                        let sec = section.unwrap_or_default();
                        let val = ws.get_configuration(&sec);
                        serde_json::to_string(&val).unwrap_or_else(|_| "null".to_string())
                    })?;
                globals.set("__krypton_native_get_config", fn_get_config)?;

                Ok(())
            })
            .map_err(|e| format!("Failed to register native hooks in QuickJS: {e}"))?;

        let base_dir_json = serde_json::to_string(base_dir).unwrap_or_else(|_| "\"\"".to_string());
        let shim_code = format!(
            r#"
            (function() {{
                globalThis.__krypton_base_dir = {base_dir_json};

                if (typeof globalThis.module === 'undefined') {{
                    globalThis.module = {{ exports: {{}} }};
                }}
                if (typeof globalThis.exports === 'undefined') {{
                    globalThis.exports = globalThis.module.exports;
                }}
                if (typeof globalThis.process === 'undefined') {{
                    globalThis.process = {{
                        env: {{}},
                        platform: "linux",
                        cwd: function() {{ return globalThis.__krypton_base_dir; }}
                    }};
                }}
                if (typeof globalThis.__krypton_commands === 'undefined') {{
                    globalThis.__krypton_commands = {{}};
                }}

                function Disposable(callOnDispose) {{
                    this._disposed = false;
                    this._callOnDispose = callOnDispose;
                }}
                Disposable.prototype.dispose = function() {{
                    if (!this._disposed) {{
                        this._disposed = true;
                        if (typeof this._callOnDispose === 'function') {{
                            this._callOnDispose();
                        }}
                    }}
                }};
                Disposable.from = function(...items) {{
                    return new Disposable(function() {{
                        for (var i = 0; i < items.length; i++) {{
                            if (items[i] && typeof items[i].dispose === 'function') {{
                                items[i].dispose();
                            }}
                        }}
                    }});
                }};

                function Uri(scheme, authority, path, query, fragment) {{
                    this.scheme = scheme || '';
                    this.authority = authority || '';
                    this.path = path || '';
                    this.query = query || '';
                    this.fragment = fragment || '';
                    this.fsPath = path || '';
                }}
                Uri.prototype.toString = function() {{
                    var s = this.scheme ? this.scheme + '://' : '';
                    if (this.authority) s += this.authority;
                    s += this.path;
                    if (this.query) s += '?' + this.query;
                    if (this.fragment) s += '#' + this.fragment;
                    return s;
                }};
                Uri.file = function(path) {{
                    return new Uri('file', '', path);
                }};
                Uri.parse = function(val) {{
                    if (!val) return new Uri('file', '', '');
                    var scheme = 'file';
                    var path = val;
                    var colonIdx = val.indexOf(':');
                    if (colonIdx > 0 && colonIdx < 10) {{
                        scheme = val.substring(0, colonIdx);
                        path = val.substring(colonIdx + 1);
                        if (path.indexOf('//') === 0) {{
                            path = path.substring(2);
                        }}
                    }}
                    return new Uri(scheme, '', path);
                }};

                var commands = {{
                    registerCommand: function(id, callback) {{
                        globalThis.__krypton_commands[id] = callback;
                        if (typeof __krypton_native_register_command === 'function') {{
                            __krypton_native_register_command(id);
                        }}
                        return new Disposable(function() {{
                            delete globalThis.__krypton_commands[id];
                            if (typeof __krypton_native_unregister_command === 'function') {{
                                __krypton_native_unregister_command(id);
                            }}
                        }});
                    }},
                    executeCommand: function(id, ...args) {{
                        var fn = globalThis.__krypton_commands[id];
                        if (fn) {{
                            try {{
                                return Promise.resolve(fn.apply(null, args));
                            }} catch (e) {{
                                return Promise.reject(e);
                            }}
                        }}
                        return Promise.reject(new Error("Command not found: " + id));
                    }}
                }};

                var window = {{
                    showInformationMessage: function(msg, ...items) {{
                        if (typeof __krypton_native_notify === 'function') {{
                            __krypton_native_notify("info", msg, JSON.stringify(items));
                        }}
                        return Promise.resolve(items.length > 0 ? items[0] : undefined);
                    }},
                    showWarningMessage: function(msg, ...items) {{
                        if (typeof __krypton_native_notify === 'function') {{
                            __krypton_native_notify("warn", msg, JSON.stringify(items));
                        }}
                        return Promise.resolve(items.length > 0 ? items[0] : undefined);
                    }},
                    showErrorMessage: function(msg, ...items) {{
                        if (typeof __krypton_native_notify === 'function') {{
                            __krypton_native_notify("error", msg, JSON.stringify(items));
                        }}
                        return Promise.resolve(items.length > 0 ? items[0] : undefined);
                    }}
                }};

                var workspace = {{
                    getConfiguration: function(section) {{
                        var raw = '{{}}';
                        if (typeof __krypton_native_get_config === 'function') {{
                            raw = __krypton_native_get_config(section || '');
                        }}
                        var parsed = {{}};
                        try {{
                            parsed = JSON.parse(raw);
                        }} catch (e) {{}}

                        return {{
                            get: function(key, defaultValue) {{
                                if (!key) return parsed;
                                if (parsed && typeof parsed === 'object') {{
                                    if (key in parsed && parsed[key] !== undefined) {{
                                        return parsed[key];
                                    }}
                                    var parts = key.split('.');
                                    var cur = parsed;
                                    var found = true;
                                    for (var i = 0; i < parts.length; i++) {{
                                        if (cur && typeof cur === 'object' && parts[i] in cur) {{
                                            cur = cur[parts[i]];
                                        }} else {{
                                            found = false;
                                            break;
                                        }}
                                    }}
                                    if (found && cur !== undefined) {{
                                        return cur;
                                    }}
                                }}
                                return defaultValue;
                            }},
                            has: function(key) {{
                                if (!key) return false;
                                if (parsed && typeof parsed === 'object') {{
                                    if (key in parsed) return true;
                                    var parts = key.split('.');
                                    var cur = parsed;
                                    for (var i = 0; i < parts.length; i++) {{
                                        if (cur && typeof cur === 'object' && parts[i] in cur) {{
                                            cur = cur[parts[i]];
                                        }} else {{
                                            return false;
                                        }}
                                    }}
                                    return true;
                                }}
                                return false;
                            }}
                        }};
                    }}
                }};

                var vscode = {{
                    commands: commands,
                    window: window,
                    workspace: workspace,
                    Disposable: Disposable,
                    Uri: Uri
                }};

                globalThis.vscode = vscode;

                globalThis.require = function(id) {{
                    if (id === 'vscode') {{
                        return globalThis.vscode;
                    }}
                    throw new Error("Cannot find module '" + id + "'");
                }};
            }})();
            "#
        );

        runtime
            .eval_string(&shim_code)
            .map_err(|e| format!("Failed to inject vscode shim: {e}"))?;
        Ok(())
    }
}
