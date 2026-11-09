pub mod commands;
pub mod webview;
pub mod window;
pub mod workspace;

pub use commands::CommandRegistry;
pub use webview::{WebviewHost, WebviewSnapshot};
pub use window::{NotificationMessage, WindowHost};
pub use workspace::WorkspaceHost;

use std::sync::Arc;
use rquickjs::Function;
use crate::ext_host::lsp::LspManager;

#[derive(Debug, Clone)]
pub struct VscodeApiHost {
    pub commands: CommandRegistry,
    pub window: WindowHost,
    pub workspace: WorkspaceHost,
    pub webviews: WebviewHost,
    pub lsp: Arc<LspManager>,
    pub trust: Arc<crate::ext_host::trust::TrustManager>,
}

impl Default for VscodeApiHost {
    fn default() -> Self {
        Self::new()
    }
}

impl VscodeApiHost {
    pub fn new() -> Self {
        Self {
            commands: CommandRegistry::new(),
            window: WindowHost::new(),
            workspace: WorkspaceHost::new(),
            webviews: WebviewHost::new(),
            lsp: Arc::new(LspManager::new()),
            trust: Arc::new(crate::ext_host::trust::TrustManager::new()),
        }
    }

    pub fn with_lsp(lsp: Arc<LspManager>) -> Self {
        Self {
            commands: CommandRegistry::new(),
            window: WindowHost::new(),
            workspace: WorkspaceHost::new(),
            webviews: WebviewHost::new(),
            lsp,
            trust: Arc::new(crate::ext_host::trust::TrustManager::new()),
        }
    }

    pub fn with_lsp_and_trust(
        lsp: Arc<LspManager>,
        trust: Arc<crate::ext_host::trust::TrustManager>,
    ) -> Self {
        Self {
            commands: CommandRegistry::new(),
            window: WindowHost::new(),
            workspace: WorkspaceHost::new(),
            webviews: WebviewHost::new(),
            lsp,
            trust,
        }
    }

    pub fn list_commands(&self) -> Vec<String> {
        self.commands.list()
    }

    pub fn drain_notifications(&self) -> Vec<NotificationMessage> {
        self.window.drain_notifications()
    }

    pub fn list_status_bar_items(&self) -> Vec<window::StatusBarItemState> {
        self.window.list_status_bar_items()
    }

    /// Resolves a runtime webview view provider and captures the HTML it builds.
    pub fn resolve_webview_view(
        &self,
        runtime: &super::runtime::ExtensionRuntime,
        extension_id: &str,
        view_id: &str,
    ) -> Result<Option<WebviewSnapshot>, String> {
        let view_id_json = serde_json::to_string(view_id).map_err(|e| e.to_string())?;
        let script = format!(
            r#"(function() {{
                var viewId = {view_id_json};
                var providers = globalThis.__krypton_webview_providers || {{}};
                var provider = providers[viewId];
                if (!provider) return null;
                var resolved = globalThis.__krypton_webview_resolved || (globalThis.__krypton_webview_resolved = {{}});
                if (resolved[viewId] && globalThis.__krypton_webviews && globalThis.__krypton_webviews[resolved[viewId]]) {{
                    return resolved[viewId];
                }}
                var panelId = __krypton_native_webview_register("view", viewId, provider.__krypton_title || viewId);
                resolved[viewId] = panelId;
                var view = __krypton_create_webview_view(panelId, viewId, provider.__krypton_title || viewId);
                try {{
                    var result = provider.resolveWebviewView(
                        view,
                        {{ state: undefined }},
                        {{ isCancellationRequested: false, onCancellationRequested: function() {{ return new Disposable(function() {{}}); }} }}
                    );
                    if (result && typeof result.then === 'function') {{
                        result.catch(function(err) {{
                            if (typeof __krypton_native_notify === 'function') {{
                                __krypton_native_notify("error", "Webview resolve failed: " + (err && err.message ? err.message : err), "[]");
                            }}
                        }});
                    }}
                    return panelId;
                }} catch (err) {{
                    if (typeof __krypton_native_notify === 'function') {{
                        __krypton_native_notify("error", "Webview resolve failed: " + (err && err.message ? err.message : err), "[]");
                    }}
                    return panelId;
                }}
            }})()"#
        );

        let _ = runtime.eval_string(&script)?;
        runtime.pump_jobs()?;
        Ok(self.webviews.snapshot_for(extension_id, view_id))
    }

    /// Delivers a message from the iframe to the extension. Replies are queued
    /// by `webview.postMessage` and drained by the UI polling loop.
    pub fn send_webview_message(
        &self,
        runtime: &super::runtime::ExtensionRuntime,
        webview_id: &str,
        message_json: &str,
    ) -> Result<(), String> {
        let parsed: serde_json::Value = serde_json::from_str(message_json)
            .map_err(|e| format!("Invalid webview message JSON: {e}"))?;
        let id_json = serde_json::to_string(webview_id).map_err(|e| e.to_string())?;
        let msg_json = serde_json::to_string(&parsed).map_err(|e| e.to_string())?;
        let script = format!(
            r#"(function() {{
                var panelId = {id_json};
                var state = globalThis.__krypton_webviews && globalThis.__krypton_webviews[panelId];
                if (!state) return false;
                var message = {msg_json};
                var handlers = state._listeners ? state._listeners.slice() : [];
                for (var i = 0; i < handlers.length; i++) {{
                    try {{
                        handlers[i](message);
                    }} catch (err) {{
                        if (typeof __krypton_native_notify === 'function') {{
                            __krypton_native_notify("error", "Webview message handler failed: " + (err && err.message ? err.message : err), "[]");
                        }}
                    }}
                }}
                return true;
            }})()"#
        );
        let _ = runtime.eval_string(&script)?;
        runtime.pump_jobs()?;
        Ok(())
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
        self.inject_into_runtime_with_id(runtime, base_dir, "")
    }

    pub fn inject_into_runtime_with_id(
        &self,
        runtime: &super::runtime::ExtensionRuntime,
        base_dir: &str,
        extension_id: &str,
    ) -> Result<(), String> {
        // Inject Node compatibility polyfills and native hooks first
        crate::ext_host::node_compat::inject_node_compat(
            runtime,
            self.trust.clone(),
            base_dir,
        )?;

        let commands = self.commands.clone();
        let window = self.window.clone();
        let workspace = self.workspace.clone();
        let lsp = self.lsp.clone();
        let webviews = self.webviews.clone();

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

                let win_sb = window.clone();
                let fn_update_sb = Function::new(ctx.clone(), move |json_str: String| {
                    if let Ok(item) = serde_json::from_str::<window::StatusBarItemState>(&json_str) {
                        win_sb.update_status_bar_item(item);
                    }
                })?;
                globals.set("__krypton_native_update_status_bar", fn_update_sb)?;

                let win_sb_dispose = window.clone();
                let fn_dispose_sb = Function::new(ctx.clone(), move |id: String| {
                    win_sb_dispose.dispose_status_bar_item(&id);
                })?;
                globals.set("__krypton_native_dispose_status_bar", fn_dispose_sb)?;

                let lsp_reg = lsp.clone();
                let fn_register_lsp = Function::new(ctx.clone(), move |desc_json: String| -> bool {
                    lsp_reg.register_extension_client(&desc_json).is_ok()
                })?;
                globals.set("__krypton_native_register_lsp_client", fn_register_lsp)?;

                let wv_register = webviews.clone();
                let wv_extension_id = extension_id.to_string();
                let fn_webview_register = Function::new(
                    ctx.clone(),
                    move |kind: String, view_type: String, title: String| -> String {
                        wv_register.register(&wv_extension_id, &kind, &view_type, &title)
                    },
                )?;
                globals.set("__krypton_native_webview_register", fn_webview_register)?;

                let wv_html = webviews.clone();
                let fn_webview_html = Function::new(ctx.clone(), move |id: String, html: String| {
                    wv_html.set_html(&id, &html);
                })?;
                globals.set("__krypton_native_webview_set_html", fn_webview_html)?;

                let wv_title = webviews.clone();
                let fn_webview_title = Function::new(ctx.clone(), move |id: String, title: String| {
                    wv_title.set_title(&id, &title);
                })?;
                globals.set("__krypton_native_webview_set_title", fn_webview_title)?;

                let wv_post = webviews.clone();
                let fn_webview_post = Function::new(
                    ctx.clone(),
                    move |id: String, message_json: String| -> bool {
                        match serde_json::from_str::<serde_json::Value>(&message_json) {
                            Ok(value) => wv_post.post_message(&id, value),
                            Err(_) => false,
                        }
                    },
                )?;
                globals.set("__krypton_native_webview_post_message", fn_webview_post)?;

                let wv_visible = webviews.clone();
                let fn_webview_visible = Function::new(
                    ctx.clone(),
                    move |id: String, visible: bool| {
                        wv_visible.set_visible(&id, visible);
                    },
                )?;
                globals.set("__krypton_native_webview_set_visible", fn_webview_visible)?;

                let wv_dispose = webviews.clone();
                let fn_webview_dispose = Function::new(ctx.clone(), move |id: String| {
                    wv_dispose.dispose(&id);
                })?;
                globals.set("__krypton_native_webview_dispose", fn_webview_dispose)?;

                Ok(())
            })
            .map_err(|e| format!("Failed to register native hooks in QuickJS: {e}"))?;

        let base_dir_json = serde_json::to_string(base_dir).unwrap_or_else(|_| "\"\"".to_string());
        let extension_id_json =
            serde_json::to_string(extension_id).unwrap_or_else(|_| "\"\"".to_string());
        let shim_code = format!(
            r#"
            (function() {{
                globalThis.__krypton_base_dir = {base_dir_json};
                globalThis.__krypton_extension_id = {extension_id_json};

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
                Uri.joinPath = function(base, ...parts) {{
                    var basePath = (base && (base.path || base.fsPath)) || '';
                    var pieces = [basePath.replace(/\/+$/, '')];
                    for (var i = 0; i < parts.length; i++) {{
                        pieces.push(String(parts[i] || '').replace(/^\/+|\/+$/g, ''));
                    }}
                    return new Uri(
                        (base && base.scheme) || 'file',
                        (base && base.authority) || '',
                        pieces.filter(function(piece) {{ return piece.length > 0; }}).join('/')
                    );
                }};
                Uri.prototype.with = function(change) {{
                    change = change || {{}};
                    return new Uri(
                        change.scheme !== undefined ? change.scheme : this.scheme,
                        change.authority !== undefined ? change.authority : this.authority,
                        change.path !== undefined ? change.path : this.path,
                        change.query !== undefined ? change.query : this.query,
                        change.fragment !== undefined ? change.fragment : this.fragment
                    );
                }};

                var ViewColumn = {{ Active: -1, Beside: -2, One: 1, Two: 2, Three: 3 }};
                var ConfigurationTarget = {{ Global: 1, Workspace: 2, WorkspaceFolder: 3 }};
                var ExtensionMode = {{ Production: 1, Development: 2, Test: 3 }};

                globalThis.__krypton_webviews = {{}};
                globalThis.__krypton_webview_panels = {{}};
                globalThis.__krypton_webview_providers = {{}};
                globalThis.__krypton_webview_resolved = {{}};
                var __krypton_webviews = globalThis.__krypton_webviews;

                function __krypton_asset_uri(uri) {{
                    if (!uri) return new Uri('krypton-webview', '', '');
                    var assetPath = uri.path || uri.fsPath || '';
                    var base = globalThis.__krypton_base_dir || '';
                    if (base && assetPath.indexOf(base) === 0) {{
                        assetPath = assetPath.substring(base.length);
                    }}
                    assetPath = assetPath.replace(/\\/g, '/').replace(/^\/+/, '');
                    return new Uri('krypton-webview', '', '/' + assetPath);
                }}

                function __krypton_create_webview(panelId, kind, viewType, title) {{
                    var listeners = [];
                    var visibilityListeners = [];
                    var disposeListeners = [];
                    var webview = {{
                        _listeners: listeners,
                        _visibilityListeners: visibilityListeners,
                        _disposeListeners: disposeListeners,
                        _html: '',
                        options: {{}},
                        visible: true,
                        cspSource: "https://*.vscode-cdn.net http://localhost:* blob: data:"
                    }};
                    Object.defineProperty(webview, 'html', {{
                        get: function() {{ return webview._html; }},
                        set: function(value) {{
                            webview._html = value === undefined || value === null ? '' : String(value);
                            if (typeof __krypton_native_webview_set_html === 'function') {{
                                __krypton_native_webview_set_html(panelId, webview._html);
                            }}
                        }}
                    }});
                    webview.postMessage = function(message) {{
                        if (typeof __krypton_native_webview_post_message === 'function') {{
                            __krypton_native_webview_post_message(panelId, JSON.stringify(message));
                        }}
                        return Promise.resolve(true);
                    }};
                    webview.onDidReceiveMessage = function(handler) {{
                        if (typeof handler === 'function') listeners.push(handler);
                        return new Disposable(function() {{
                            var idx = listeners.indexOf(handler);
                            if (idx >= 0) listeners.splice(idx, 1);
                        }});
                    }};
                    webview.onDidChangeVisibility = function(handler) {{
                        if (typeof handler === 'function') visibilityListeners.push(handler);
                        return new Disposable(function() {{
                            var idx = visibilityListeners.indexOf(handler);
                            if (idx >= 0) visibilityListeners.splice(idx, 1);
                        }});
                    }};
                    webview.onDidDispose = function(handler) {{
                        if (typeof handler === 'function') disposeListeners.push(handler);
                        return new Disposable(function() {{
                            var idx = disposeListeners.indexOf(handler);
                            if (idx >= 0) disposeListeners.splice(idx, 1);
                        }});
                    }};
                    webview.asWebviewUri = function(uri) {{ return __krypton_asset_uri(uri); }};
                    webview.show = function() {{
                        webview.visible = true;
                        if (typeof __krypton_native_webview_set_visible === 'function') {{
                            __krypton_native_webview_set_visible(panelId, true);
                        }}
                    }};
                    webview.hide = function() {{
                        webview.visible = false;
                        if (typeof __krypton_native_webview_set_visible === 'function') {{
                            __krypton_native_webview_set_visible(panelId, false);
                        }}
                    }};
                    webview.dispose = function() {{
                        for (var i = 0; i < disposeListeners.length; i++) {{
                            try {{ disposeListeners[i](); }} catch (e) {{}}
                        }}
                        if (typeof __krypton_native_webview_dispose === 'function') {{
                            __krypton_native_webview_dispose(panelId);
                        }}
                        delete globalThis.__krypton_webviews[panelId];
                    }};
                    globalThis.__krypton_webviews[panelId] = webview;
                    return webview;
                }}

                function __krypton_create_webview_view(panelId, viewId, title) {{
                    var webview = __krypton_create_webview(panelId, 'view', viewId, title);
                    return {{
                        viewType: 'webview',
                        title: title || viewId,
                        webview: webview,
                        visible: true,
                        description: undefined,
                        badge: undefined,
                        onDidChangeVisibility: webview.onDidChangeVisibility,
                        onDidDispose: webview.onDidDispose,
                        show: function() {{ webview.show(); }},
                        dispose: function() {{ webview.dispose(); }}
                    }};
                }}

                function __krypton_create_webview_panel(viewType, title, showOptions, options) {{
                    var panelId = typeof __krypton_native_webview_register === 'function'
                        ? __krypton_native_webview_register('panel', String(viewType), String(title || viewType))
                        : 'wv_local_' + Date.now();
                    var webview = __krypton_create_webview(panelId, 'panel', String(viewType), String(title || viewType));
                    if (options && typeof options === 'object') webview.options = options;
                    var panel = {{
                        viewType: String(viewType),
                        title: String(title || viewType),
                        webview: webview,
                        visible: true,
                        active: true,
                        viewColumn: showOptions && showOptions.viewColumn,
                        onDidDispose: webview.onDidDispose,
                        onDidChangeViewState: function() {{ return new Disposable(function() {{}}); }},
                        reveal: function() {{ webview.show(); }},
                        dispose: function() {{ webview.dispose(); }}
                    }};
                    globalThis.__krypton_webview_panels[panelId] = panel;
                    return panel;
                }}

                globalThis.__krypton_create_webview_view = __krypton_create_webview_view;

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

                var StatusBarAlignment = {{
                    Left: 1,
                    Right: 2
                }};

                var _sbItemSeq = 0;
                function StatusBarItem(alignment, priority) {{
                    this.id = 'sb_' + (++_sbItemSeq);
                    this.alignment = alignment || 1;
                    this.priority = priority || 0;
                    this.text = '';
                    this.tooltip = '';
                    this.command = '';
                    this._visible = false;
                }}
                StatusBarItem.prototype.show = function() {{
                    this._visible = true;
                    this._sync();
                }};
                StatusBarItem.prototype.hide = function() {{
                    this._visible = false;
                    this._sync();
                }};
                StatusBarItem.prototype.dispose = function() {{
                    this._visible = false;
                    if (typeof __krypton_native_dispose_status_bar === 'function') {{
                        __krypton_native_dispose_status_bar(this.id);
                    }}
                }};
                StatusBarItem.prototype._sync = function() {{
                    if (typeof __krypton_native_update_status_bar === 'function') {{
                        __krypton_native_update_status_bar(JSON.stringify({{
                            id: this.id,
                            alignment: this.alignment,
                            priority: this.priority,
                            text: this.text || '',
                            tooltip: this.tooltip || '',
                            command: this.command || '',
                            visible: this._visible
                        }}));
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
                    }},
                    createStatusBarItem: function(alignment, priority) {{
                        return new StatusBarItem(alignment, priority);
                    }},
                    createWebviewPanel: function(viewType, title, showOptions, options) {{
                        return __krypton_create_webview_panel(viewType, title, showOptions, options);
                    }},
                    registerWebviewViewProvider: function(viewId, provider, options) {{
                        if (provider && typeof provider === 'object' && !provider.__krypton_title) {{
                            provider.__krypton_title = viewId;
                        }}
                        globalThis.__krypton_webview_providers[viewId] = provider;
                        delete globalThis.__krypton_webview_resolved[viewId];
                        return new Disposable(function() {{
                            if (globalThis.__krypton_webview_providers[viewId] === provider) {{
                                delete globalThis.__krypton_webview_providers[viewId];
                            }}
                        }});
                    }},
                    registerWebviewPanelSerializer: function() {{
                        return new Disposable(function() {{}});
                    }},
                    createOutputChannel: function(name) {{
                        return {{
                            name: name,
                            append: function() {{}},
                            appendLine: function() {{}},
                            replace: function() {{}},
                            clear: function() {{}},
                            show: function() {{}},
                            hide: function() {{}},
                            dispose: function() {{}}
                        }};
                    }},
                    createTerminal: function(name) {{
                        return {{
                            name: name || 'Terminal',
                            show: function() {{}},
                            hide: function() {{}},
                            sendText: function() {{}},
                            dispose: function() {{}},
                            onDidClose: function() {{ return new Disposable(function() {{}}); }}
                        }};
                    }},
                    showQuickPick: function() {{ return Promise.resolve(undefined); }},
                    showInputBox: function() {{ return Promise.resolve(undefined); }},
                    showOpenDialog: function() {{ return Promise.resolve(undefined); }},
                    showSaveDialog: function() {{ return Promise.resolve(undefined); }},
                    showTextDocument: function() {{ return Promise.resolve(undefined); }},
                    withProgress: function(_options, task) {{ return Promise.resolve(task({{ report: function() {{}} }}, {{ isCancellationRequested: false, onCancellationRequested: function() {{ return new Disposable(function() {{}}); }} }})); }},
                    createTextEditorDecorationType: function() {{ return {{ dispose: function() {{}} }}; }},
                    setStatusBarMessage: function() {{ return new Disposable(function() {{}}); }},
                    activeTextEditor: undefined,
                    visibleTextEditors: [],
                    tabGroups: {{
                        all: [],
                        activeTabGroup: {{ viewColumn: 1, isActive: true, tabs: [], activeTab: undefined }},
                        onDidChangeTabs: function() {{ return new Disposable(function() {{}}); }},
                        onDidChangeTabGroups: function() {{ return new Disposable(function() {{}}); }},
                        close: function() {{ return Promise.resolve(true); }}
                    }},
                    onDidChangeActiveTextEditor: function() {{ return new Disposable(function() {{}}); }},
                    onDidChangeTextEditorSelection: function() {{ return new Disposable(function() {{}}); }},
                    onDidChangeTextEditorVisibleRanges: function() {{ return new Disposable(function() {{}}); }},
                    onDidChangeVisibleTextEditors: function() {{ return new Disposable(function() {{}}); }},
                    onDidChangeWindowState: function() {{ return new Disposable(function() {{}}); }},
                    onDidChangeActiveColorTheme: function() {{ return new Disposable(function() {{}}); }}
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
                            }},
                            inspect: function() {{ return undefined; }},
                            update: function() {{ return Promise.resolve(); }}
                        }};
                    }}
                }};

                var __krypton_state_store = {{}};
                function __krypton_memento(prefix) {{
                    return {{
                        get: function(key, defaultValue) {{
                            var stored = __krypton_state_store[prefix + key];
                            return stored === undefined ? defaultValue : stored;
                        }},
                        update: function(key, value) {{
                            __krypton_state_store[prefix + key] = value;
                            return Promise.resolve();
                        }},
                        keys: function() {{
                            return Object.keys(__krypton_state_store)
                                .filter(function(key) {{ return key.indexOf(prefix) === 0; }})
                                .map(function(key) {{ return key.substring(prefix.length); }});
                        }},
                        setKeysForSync: function() {{}}
                    }};
                }}

                workspace.workspaceFolders = [];
                workspace.name = undefined;
                workspace.workspaceFile = undefined;
                workspace.rootPath = undefined;
                workspace.workspaceState = __krypton_memento('workspace:');
                workspace.globalState = __krypton_memento('global:');
                workspace.onDidChangeConfiguration = function() {{ return new Disposable(function() {{}}); }};
                workspace.onDidChangeWorkspaceFolders = function() {{ return new Disposable(function() {{}}); }};
                workspace.onDidSaveTextDocument = function() {{ return new Disposable(function() {{}}); }};
                workspace.onDidOpenTextDocument = function() {{ return new Disposable(function() {{}}); }};
                workspace.onDidCloseTextDocument = function() {{ return new Disposable(function() {{}}); }};
                workspace.onDidChangeTextDocument = function() {{ return new Disposable(function() {{}}); }};
                workspace.onWillSaveTextDocument = function() {{ return new Disposable(function() {{}}); }};
                workspace.findFiles = function() {{ return Promise.resolve([]); }};
                workspace.asRelativePath = function(uri) {{
                    return typeof uri === 'string' ? uri : ((uri && (uri.fsPath || uri.path)) || '');
                }};
                workspace.getWorkspaceFolder = function() {{ return undefined; }};
                workspace.createFileSystemWatcher = function() {{
                    return {{
                        onDidChange: function() {{ return new Disposable(function() {{}}); }},
                        onDidCreate: function() {{ return new Disposable(function() {{}}); }},
                        onDidDelete: function() {{ return new Disposable(function() {{}}); }},
                        dispose: function() {{}}
                    }};
                }};
                workspace.registerTextDocumentContentProvider = function() {{ return new Disposable(function() {{}}); }};
                workspace.openTextDocument = function() {{
                    return Promise.resolve({{
                        uri: Uri.file(''),
                        fileName: '',
                        languageId: 'plaintext',
                        getText: function() {{ return ''; }},
                        lineCount: 0,
                        save: function() {{ return Promise.resolve(true); }}
                    }});
                }};
                workspace.applyEdit = function() {{ return Promise.resolve(false); }};
                workspace.fs = {{
                    readFile: function() {{ return Promise.reject(new Error('Not available')); }},
                    writeFile: function() {{ return Promise.reject(new Error('Not available')); }},
                    stat: function() {{ return Promise.reject(new Error('Not available')); }},
                    readDirectory: function() {{ return Promise.reject(new Error('Not available')); }},
                    createDirectory: function() {{ return Promise.reject(new Error('Not available')); }},
                    delete: function() {{ return Promise.reject(new Error('Not available')); }},
                    rename: function() {{ return Promise.reject(new Error('Not available')); }},
                    copy: function() {{ return Promise.reject(new Error('Not available')); }}
                }};

                function EventEmitter() {{
                    this._listeners = [];
                }}
                EventEmitter.prototype.event = function(listener) {{
                    var listeners = this._listeners;
                    listeners.push(listener);
                    return new Disposable(function() {{
                        var idx = listeners.indexOf(listener);
                        if (idx >= 0) listeners.splice(idx, 1);
                    }});
                }};
                EventEmitter.prototype.fire = function(value) {{
                    var listeners = this._listeners.slice();
                    for (var i = 0; i < listeners.length; i++) {{
                        try {{ listeners[i](value); }} catch (e) {{}}
                    }}
                }};
                EventEmitter.prototype.dispose = function() {{ this._listeners.length = 0; }};

                var vscode = {{
                    commands: commands,
                    window: window,
                    workspace: workspace,
                    Disposable: Disposable,
                    Uri: Uri,
                    StatusBarAlignment: StatusBarAlignment,
                    ViewColumn: ViewColumn,
                    ConfigurationTarget: ConfigurationTarget,
                    ExtensionMode: ExtensionMode,
                    EventEmitter: EventEmitter,
                    version: '1.106.0',
                    env: {{
                        appName: 'Krypton IDE',
                        appRoot: globalThis.__krypton_base_dir || '',
                        appHost: 'desktop',
                        language: 'en',
                        machineId: 'krypton-android',
                        sessionId: 'krypton-session',
                        uriScheme: 'krypton',
                        remoteName: undefined,
                        clipboard: {{
                            readText: function() {{ return Promise.resolve(''); }},
                            writeText: function() {{ return Promise.resolve(); }}
                        }},
                        openExternal: function() {{ return Promise.resolve(true); }},
                        onDidChangeConfiguration: function() {{ return new Disposable(function() {{}}); }}
                    }},
                    extensions: {{
                        all: [],
                        getExtension: function() {{ return undefined; }},
                        onDidChange: function() {{ return new Disposable(function() {{}}); }}
                    }},
                    languages: {{
                        getLanguages: function() {{ return []; }},
                        match: function() {{ return 0; }},
                        setLanguageConfiguration: function() {{ return new Disposable(function() {{}}); }},
                        registerCompletionItemProvider: function() {{ return new Disposable(function() {{}}); }},
                        registerHoverProvider: function() {{ return new Disposable(function() {{}}); }},
                        registerDefinitionProvider: function() {{ return new Disposable(function() {{}}); }},
                        registerCodeActionsProvider: function() {{ return new Disposable(function() {{}}); }},
                        registerDocumentFormattingEditProvider: function() {{ return new Disposable(function() {{}}); }},
                        registerDocumentSymbolProvider: function() {{ return new Disposable(function() {{}}); }},
                        createDiagnosticCollection: function() {{
                            return {{ set: function() {{}}, delete: function() {{}}, clear: function() {{}}, dispose: function() {{}} }};
                        }}
                    }},
                    ThemeColor: function(id) {{ this.id = id; }},
                    Color: function(red, green, blue, alpha) {{
                        this.red = red; this.green = green; this.blue = blue; this.alpha = alpha;
                    }},
                    TreeItem: function(label, collapsibleState) {{
                        this.label = label; this.collapsibleState = collapsibleState;
                    }},
                    TreeItemCollapsibleState: {{ None: 0, Collapsed: 1, Expanded: 2 }},
                    Diagnostic: function(range, message, severity) {{
                        this.range = range; this.message = message; this.severity = severity;
                    }},
                    DiagnosticSeverity: {{ Error: 0, Warning: 1, Information: 2, Hint: 3 }},
                    Range: function(start, end) {{ this.start = start; this.end = end; }},
                    Position: function(line, character) {{ this.line = line; this.character = character; }}
                }};

                globalThis.vscode = vscode;

                var TransportKind = {{
                    stdio: 0,
                    ipc: 1,
                    pipe: 2,
                    socket: 3
                }};

                function LanguageClient(id, name, serverOptions, clientOptions) {{
                    this.id = id || 'lsp-client';
                    this.name = name || 'Language Client';
                    this.serverOptions = serverOptions || {{}};
                    this.clientOptions = clientOptions || {{}};
                    this._disposed = false;
                    this.outputChannel = {{
                        name: this.name,
                        append: function() {{}},
                        appendLine: function() {{}},
                        clear: function() {{}},
                        show: function() {{}},
                        hide: function() {{}},
                        dispose: function() {{}}
                    }};
                }}
                LanguageClient.prototype.start = function() {{
                    var self = this;
                    if (typeof __krypton_native_register_lsp_client === 'function') {{
                        try {{
                            __krypton_native_register_lsp_client(JSON.stringify({{
                                id: self.id,
                                name: self.name,
                                serverOptions: self.serverOptions,
                                clientOptions: self.clientOptions
                            }}));
                        }} catch (e) {{}}
                    }}
                    var disposable = {{
                        dispose: function() {{
                            self.stop();
                        }},
                        then: function(onFulfilled, onRejected) {{
                            return Promise.resolve().then(onFulfilled, onRejected);
                        }},
                        catch: function(onRejected) {{
                            return Promise.resolve().catch(onRejected);
                        }}
                    }};
                    return disposable;
                }};
                LanguageClient.prototype.stop = function() {{
                    this._disposed = true;
                    return Promise.resolve();
                }};
                LanguageClient.prototype.onReady = function() {{
                    return Promise.resolve();
                }};
                LanguageClient.prototype.sendRequest = function(type, params) {{
                    return Promise.resolve(null);
                }};
                LanguageClient.prototype.sendNotification = function(type, params) {{}};
                LanguageClient.prototype.onRequest = function(type, handler) {{
                    return new Disposable(function() {{}});
                }};
                LanguageClient.prototype.onNotification = function(type, handler) {{
                    return new Disposable(function() {{}});
                }};

                var vscodeLanguageClient = {{
                    LanguageClient: LanguageClient,
                    TransportKind: TransportKind,
                    State: {{ Stopped: 1, Starting: 2, Running: 3 }}
                }};

                globalThis.vscodeLanguageClient = vscodeLanguageClient;

                globalThis.require = function(id) {{
                    if (id === 'vscode') {{
                        return globalThis.vscode;
                    }}
                    if (id === 'vscode-languageclient' || id === 'vscode-languageclient/node') {{
                        return globalThis.vscodeLanguageClient;
                    }}
                    if (id === 'path') {{
                        return globalThis.__krypton_path;
                    }}
                    if (id === 'os') {{
                        return globalThis.__krypton_os;
                    }}
                    if (id === 'events') {{
                        return globalThis.__krypton_events;
                    }}
                    if (id === 'fs') {{
                        return globalThis.__krypton_fs;
                    }}
                    if (id === 'child_process') {{
                        return globalThis.__krypton_child_process;
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
