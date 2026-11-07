#[cfg(not(target_arch = "wasm32"))]
pub mod node_compat_impl {
    use std::path::Path;
    use std::sync::Arc;
    use rquickjs::Function;
    use crate::ext_host::runtime::ExtensionRuntime;
    use crate::ext_host::trust::{Capability, TrustManager};

    pub struct NodeCompatHost {
        pub trust: Arc<TrustManager>,
    }

    impl NodeCompatHost {
        pub fn new(trust: Arc<TrustManager>) -> Self {
            Self { trust }
        }

        pub fn fs_read_file(&self, path: &str) -> Result<String, String> {
            let p = Path::new(path);
            self.trust.check_fs_access(p, false)?;
            std::fs::read_to_string(p).map_err(|e| e.to_string())
        }

        pub fn fs_write_file(&self, path: &str, content: &str) -> Result<(), String> {
            let p = Path::new(path);
            self.trust.check_fs_access(p, true)?;
            if let Some(parent) = p.parent() {
                if !parent.as_os_str().is_empty() {
                    let _ = std::fs::create_dir_all(parent);
                }
            }
            std::fs::write(p, content).map_err(|e| e.to_string())
        }

        pub fn fs_exists(&self, path: &str) -> Result<bool, String> {
            let p = Path::new(path);
            self.trust.check_fs_access(p, false)?;
            Ok(p.exists())
        }

        pub fn fs_stat(&self, path: &str) -> Result<String, String> {
            let p = Path::new(path);
            self.trust.check_fs_access(p, false)?;
            let meta = std::fs::metadata(p).map_err(|e| e.to_string())?;
            let mtime_ms = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            let stat_info = serde_json::json!({
                "isFile": meta.is_file(),
                "isDirectory": meta.is_dir(),
                "size": meta.len(),
                "mtimeMs": mtime_ms,
            });
            Ok(stat_info.to_string())
        }

        pub fn fs_mkdir(&self, path: &str, recursive: bool) -> Result<(), String> {
            let p = Path::new(path);
            self.trust.check_fs_access(p, true)?;
            if recursive {
                std::fs::create_dir_all(p).map_err(|e| e.to_string())
            } else {
                std::fs::create_dir(p).map_err(|e| e.to_string())
            }
        }

        pub fn fs_readdir(&self, path: &str) -> Result<Vec<String>, String> {
            let p = Path::new(path);
            self.trust.check_fs_access(p, false)?;
            let entries = std::fs::read_dir(p).map_err(|e| e.to_string())?;
            let mut names = Vec::new();
            for entry in entries {
                if let Ok(entry) = entry {
                    names.push(entry.file_name().to_string_lossy().to_string());
                }
            }
            Ok(names)
        }

        pub fn child_process_spawn(
            &self,
            cmd: &str,
            args_json: &str,
            _opts_json: &str,
        ) -> Result<u32, String> {
            self.trust.check_capability(Capability::SpawnProcess)?;
            let args: Vec<String> = if args_json.trim().is_empty() {
                Vec::new()
            } else {
                serde_json::from_str(args_json).unwrap_or_default()
            };
            let mut command = std::process::Command::new(cmd);
            command.args(&args);
            let child = command
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| e.to_string())?;
            Ok(child.id())
        }

        pub fn child_process_exec(&self, cmd: &str) -> Result<String, String> {
            self.trust.check_capability(Capability::SpawnProcess)?;
            let output = std::process::Command::new("sh")
                .arg("-c")
                .arg(cmd)
                .output()
                .map_err(|e| e.to_string())?;
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                return Err(format!(
                    "Command failed with exit code {:?}: {}",
                    output.status.code(),
                    stderr
                ));
            }
            Ok(stdout)
        }
    }

    pub fn inject_node_compat(
        runtime: &ExtensionRuntime,
        trust: Arc<TrustManager>,
        base_dir: &str,
    ) -> Result<(), String> {
        let host = Arc::new(NodeCompatHost::new(trust));

        // 1. Register raw native hooks
        let h_read = host.clone();
        let h_write = host.clone();
        let h_exists = host.clone();
        let h_stat = host.clone();
        let h_mkdir = host.clone();
        let h_readdir = host.clone();
        let h_spawn = host.clone();
        let h_exec = host.clone();

        runtime
            .context()
            .with(|ctx| -> Result<(), rquickjs::Error> {
                let globals = ctx.globals();

                let r_read = h_read.clone();
                let fn_read = Function::new(ctx.clone(), move |path: String| -> String {
                    match r_read.fs_read_file(&path) {
                        Ok(data) => serde_json::json!({ "ok": true, "data": data }).to_string(),
                        Err(err) => serde_json::json!({ "ok": false, "error": err }).to_string(),
                    }
                })?;
                globals.set("__krypton_raw_fs_read_file", fn_read)?;

                let r_write = h_write.clone();
                let fn_write = Function::new(ctx.clone(), move |path: String, content: String| -> String {
                    match r_write.fs_write_file(&path, &content) {
                        Ok(()) => serde_json::json!({ "ok": true }).to_string(),
                        Err(err) => serde_json::json!({ "ok": false, "error": err }).to_string(),
                    }
                })?;
                globals.set("__krypton_raw_fs_write_file", fn_write)?;

                let r_exists = h_exists.clone();
                let fn_exists = Function::new(ctx.clone(), move |path: String| -> String {
                    match r_exists.fs_exists(&path) {
                        Ok(exists) => serde_json::json!({ "ok": true, "data": exists }).to_string(),
                        Err(err) => serde_json::json!({ "ok": false, "error": err }).to_string(),
                    }
                })?;
                globals.set("__krypton_raw_fs_exists", fn_exists)?;

                let r_stat = h_stat.clone();
                let fn_stat = Function::new(ctx.clone(), move |path: String| -> String {
                    match r_stat.fs_stat(&path) {
                        Ok(stat_json) => serde_json::json!({ "ok": true, "data": stat_json }).to_string(),
                        Err(err) => serde_json::json!({ "ok": false, "error": err }).to_string(),
                    }
                })?;
                globals.set("__krypton_raw_fs_stat", fn_stat)?;

                let r_mkdir = h_mkdir.clone();
                let fn_mkdir = Function::new(ctx.clone(), move |path: String, recursive: bool| -> String {
                    match r_mkdir.fs_mkdir(&path, recursive) {
                        Ok(()) => serde_json::json!({ "ok": true }).to_string(),
                        Err(err) => serde_json::json!({ "ok": false, "error": err }).to_string(),
                    }
                })?;
                globals.set("__krypton_raw_fs_mkdir", fn_mkdir)?;

                let r_readdir = h_readdir.clone();
                let fn_readdir = Function::new(ctx.clone(), move |path: String| -> String {
                    match r_readdir.fs_readdir(&path) {
                        Ok(names) => serde_json::json!({ "ok": true, "data": names }).to_string(),
                        Err(err) => serde_json::json!({ "ok": false, "error": err }).to_string(),
                    }
                })?;
                globals.set("__krypton_raw_fs_readdir", fn_readdir)?;

                let r_spawn = h_spawn.clone();
                let fn_spawn = Function::new(ctx.clone(), move |cmd: String, args_json: String, opts_json: String| -> String {
                    match r_spawn.child_process_spawn(&cmd, &args_json, &opts_json) {
                        Ok(pid) => serde_json::json!({ "ok": true, "pid": pid }).to_string(),
                        Err(err) => serde_json::json!({ "ok": false, "error": err }).to_string(),
                    }
                })?;
                globals.set("__krypton_raw_child_process_spawn", fn_spawn)?;

                let r_exec = h_exec.clone();
                let fn_exec = Function::new(ctx.clone(), move |cmd: String| -> String {
                    match r_exec.child_process_exec(&cmd) {
                        Ok(stdout) => serde_json::json!({ "ok": true, "stdout": stdout }).to_string(),
                        Err(err) => serde_json::json!({ "ok": false, "error": err }).to_string(),
                    }
                })?;
                globals.set("__krypton_raw_child_process_exec", fn_exec)?;

                Ok(())
            })
            .map_err(|e| format!("Failed to register Node compatibility raw hooks: {e}"))?;

        // 2. Inject JavaScript polyfill
        let base_dir_json = serde_json::to_string(base_dir).unwrap_or_else(|_| "\"\"".to_string());
        let js_shim = format!(
            r#"
            (function() {{
                function _throwSecurityOrError(errStr) {{
                    var err = new Error(errStr);
                    if (errStr && errStr.indexOf('SecurityError') !== -1) {{
                        err.name = 'SecurityError';
                    }}
                    throw err;
                }}

                globalThis.__krypton_native_fs_read_file = function(path) {{
                    var res = JSON.parse(globalThis.__krypton_raw_fs_read_file(path));
                    if (!res.ok) _throwSecurityOrError(res.error);
                    return res.data;
                }};

                globalThis.__krypton_native_fs_write_file = function(path, content) {{
                    var res = JSON.parse(globalThis.__krypton_raw_fs_write_file(path, content));
                    if (!res.ok) _throwSecurityOrError(res.error);
                }};

                globalThis.__krypton_native_fs_exists = function(path) {{
                    var res = JSON.parse(globalThis.__krypton_raw_fs_exists(path));
                    if (!res.ok) _throwSecurityOrError(res.error);
                    return res.data;
                }};

                globalThis.__krypton_native_fs_stat = function(path) {{
                    var res = JSON.parse(globalThis.__krypton_raw_fs_stat(path));
                    if (!res.ok) _throwSecurityOrError(res.error);
                    return res.data;
                }};

                globalThis.__krypton_native_fs_mkdir = function(path, recursive) {{
                    var res = JSON.parse(globalThis.__krypton_raw_fs_mkdir(path, !!recursive));
                    if (!res.ok) _throwSecurityOrError(res.error);
                }};

                globalThis.__krypton_native_fs_readdir = function(path) {{
                    var res = JSON.parse(globalThis.__krypton_raw_fs_readdir(path));
                    if (!res.ok) _throwSecurityOrError(res.error);
                    return res.data;
                }};

                globalThis.__krypton_native_child_process_spawn = function(cmd, argsJson, optsJson) {{
                    var res = JSON.parse(globalThis.__krypton_raw_child_process_spawn(cmd, argsJson || "[]", optsJson || "{{}}"));
                    if (!res.ok) _throwSecurityOrError(res.error);
                    return res.pid;
                }};

                globalThis.__krypton_native_child_process_exec = function(cmd) {{
                    var res = JSON.parse(globalThis.__krypton_raw_child_process_exec(cmd));
                    if (!res.ok) _throwSecurityOrError(res.error);
                    return res.stdout;
                }};

                // 1. events
                function EventEmitter() {{
                    this._events = {{}};
                }}
                EventEmitter.prototype.on = function(event, listener) {{
                    if (!this._events[event]) this._events[event] = [];
                    this._events[event].push(listener);
                    return this;
                }};
                EventEmitter.prototype.addListener = EventEmitter.prototype.on;
                EventEmitter.prototype.once = function(event, listener) {{
                    var self = this;
                    function g(...args) {{
                        self.removeListener(event, g);
                        listener.apply(self, args);
                    }}
                    g.listener = listener;
                    return this.on(event, g);
                }};
                EventEmitter.prototype.emit = function(event, ...args) {{
                    var list = this._events[event];
                    if (!list || list.length === 0) return false;
                    var copy = list.slice(0);
                    for (var i = 0; i < copy.length; i++) {{
                        copy[i].apply(this, args);
                    }}
                    return true;
                }};
                EventEmitter.prototype.removeListener = function(event, listener) {{
                    var list = this._events[event];
                    if (!list) return this;
                    for (var i = list.length - 1; i >= 0; i--) {{
                        if (list[i] === listener || list[i].listener === listener) {{
                            list.splice(i, 1);
                            break;
                        }}
                    }}
                    return this;
                }};
                EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
                EventEmitter.prototype.removeAllListeners = function(event) {{
                    if (event) {{
                        delete this._events[event];
                    }} else {{
                        this._events = {{}};
                    }}
                    return this;
                }};
                globalThis.__krypton_events = {{
                    EventEmitter: EventEmitter,
                    default: EventEmitter
                }};

                // 2. path
                function normalizePathString(path) {{
                    if (typeof path !== 'string') return '';
                    var isAbs = path.charAt(0) === '/';
                    var segments = path.split('/').filter(Boolean);
                    var stack = [];
                    for (var i = 0; i < segments.length; i++) {{
                        var seg = segments[i];
                        if (seg === '.') continue;
                        if (seg === '..') {{
                            if (stack.length > 0 && stack[stack.length - 1] !== '..') {{
                                stack.pop();
                            }} else if (!isAbs) {{
                                stack.push('..');
                            }}
                        }} else {{
                            stack.push(seg);
                        }}
                    }}
                    var res = stack.join('/');
                    if (isAbs) res = '/' + res;
                    return res || (isAbs ? '/' : '.');
                }}

                var pathModule = {{
                    sep: '/',
                    delimiter: ':',
                    join: function(...args) {{
                        var joined = args.filter(function(a) {{ return typeof a === 'string' && a.length > 0; }}).join('/');
                        return normalizePathString(joined);
                    }},
                    normalize: function(p) {{
                        return normalizePathString(p);
                    }},
                    isAbsolute: function(p) {{
                        return typeof p === 'string' && p.startsWith('/');
                    }},
                    resolve: function(...args) {{
                        var resolvedPath = '';
                        var resolvedAbsolute = false;
                        for (var i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {{
                            var path = i >= 0 ? args[i] : {base_dir_json};
                            if (typeof path !== 'string' || path.length === 0) continue;
                            resolvedPath = path + '/' + resolvedPath;
                            resolvedAbsolute = path.charAt(0) === '/';
                        }}
                        return normalizePathString(resolvedPath);
                    }},
                    dirname: function(p) {{
                        if (typeof p !== 'string' || p.length === 0) return '.';
                        var norm = normalizePathString(p);
                        var idx = norm.lastIndexOf('/');
                        if (idx === -1) return '.';
                        if (idx === 0) return '/';
                        return norm.substring(0, idx);
                    }},
                    basename: function(p, ext) {{
                        if (typeof p !== 'string' || p.length === 0) return '';
                        var norm = normalizePathString(p);
                        var idx = norm.lastIndexOf('/');
                        var base = idx === -1 ? norm : norm.substring(idx + 1);
                        if (ext && typeof ext === 'string' && base.endsWith(ext)) {{
                            base = base.substring(0, base.length - ext.length);
                        }}
                        return base;
                    }},
                    extname: function(p) {{
                        if (typeof p !== 'string') return '';
                        var base = pathModule.basename(p);
                        var idx = base.lastIndexOf('.');
                        if (idx <= 0) return '';
                        return base.substring(idx);
                    }}
                }};
                globalThis.__krypton_path = pathModule;

                // 3. os
                var osModule = {{
                    platform: function() {{ return 'linux'; }},
                    arch: function() {{ return 'arm64'; }},
                    homedir: function() {{ return '/home/krypton'; }},
                    tmpdir: function() {{ return '/tmp'; }},
                    type: function() {{ return 'Linux'; }},
                    release: function() {{ return '5.10.0'; }},
                    EOL: '\n',
                    cpus: function() {{
                        return [
                            {{ model: 'Cortex-A78', speed: 2800 }},
                            {{ model: 'Cortex-A78', speed: 2800 }},
                            {{ model: 'Cortex-A55', speed: 2000 }},
                            {{ model: 'Cortex-A55', speed: 2000 }}
                        ];
                    }}
                }};
                globalThis.__krypton_os = osModule;

                // 4. fs
                var fsModule = {{
                    existsSync: function(path) {{
                        try {{
                            return globalThis.__krypton_native_fs_exists(String(path));
                        }} catch (e) {{
                            if (e && e.name === 'SecurityError') throw e;
                            return false;
                        }}
                    }},
                    readFileSync: function(path, encoding) {{
                        return globalThis.__krypton_native_fs_read_file(String(path));
                    }},
                    writeFileSync: function(path, data) {{
                        globalThis.__krypton_native_fs_write_file(String(path), String(data));
                    }},
                    statSync: function(path) {{
                        var raw = globalThis.__krypton_native_fs_stat(String(path));
                        var stat = typeof raw === 'string' ? JSON.parse(raw) : raw;
                        return {{
                            isFile: function() {{ return !!stat.isFile; }},
                            isDirectory: function() {{ return !!stat.isDirectory; }},
                            size: stat.size || 0,
                            mtimeMs: stat.mtimeMs || 0,
                            mtime: new Date(stat.mtimeMs || 0)
                        }};
                    }},
                    mkdirSync: function(path, options) {{
                        var recursive = false;
                        if (typeof options === 'boolean') recursive = options;
                        else if (options && typeof options === 'object') recursive = !!options.recursive;
                        globalThis.__krypton_native_fs_mkdir(String(path), recursive);
                    }},
                    readdirSync: function(path) {{
                        return globalThis.__krypton_native_fs_readdir(String(path));
                    }},
                    promises: {{
                        readFile: function(path, encoding) {{
                            return Promise.resolve().then(function() {{
                                return fsModule.readFileSync(path, encoding);
                            }});
                        }},
                        writeFile: function(path, data) {{
                            return Promise.resolve().then(function() {{
                                return fsModule.writeFileSync(path, data);
                            }});
                        }},
                        stat: function(path) {{
                            return Promise.resolve().then(function() {{
                                return fsModule.statSync(path);
                            }});
                        }},
                        mkdir: function(path, options) {{
                            return Promise.resolve().then(function() {{
                                return fsModule.mkdirSync(path, options);
                            }});
                        }},
                        readdir: function(path) {{
                            return Promise.resolve().then(function() {{
                                return fsModule.readdirSync(path);
                            }});
                        }}
                    }}
                }};
                globalThis.__krypton_fs = fsModule;

                // 5. child_process
                var childProcessModule = {{
                    spawn: function(command, args, options) {{
                        var argsList = Array.isArray(args) ? args : [];
                        var opts = (typeof args === 'object' && !Array.isArray(args)) ? args : (options || {{}});
                        var pid = globalThis.__krypton_native_child_process_spawn(
                            String(command),
                            JSON.stringify(argsList),
                            JSON.stringify(opts)
                        );
                        var proc = new EventEmitter();
                        proc.pid = pid;
                        proc.stdin = {{
                            write: function(data) {{}},
                            end: function() {{}}
                        }};
                        proc.stdout = new EventEmitter();
                        proc.stderr = new EventEmitter();
                        proc.kill = function(sig) {{}};
                        return proc;
                    }},
                    exec: function(command, options, callback) {{
                        var cb = typeof options === 'function' ? options : callback;
                        try {{
                            var stdout = globalThis.__krypton_native_child_process_exec(String(command));
                            if (typeof cb === 'function') {{
                                cb(null, stdout, '');
                            }}
                            return stdout;
                        }} catch (e) {{
                            if (typeof cb === 'function') {{
                                cb(e, '', e.message);
                            }} else {{
                                throw e;
                            }}
                        }}
                    }},
                    execSync: function(command, options) {{
                        return globalThis.__krypton_native_child_process_exec(String(command));
                    }}
                }};
                globalThis.__krypton_child_process = childProcessModule;
            }})();
            "#
        );

        runtime
            .eval_string(&js_shim)
            .map_err(|e| format!("Failed to inject Node compatibility JS shims: {e}"))?;

        Ok(())
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub use node_compat_impl::*;
