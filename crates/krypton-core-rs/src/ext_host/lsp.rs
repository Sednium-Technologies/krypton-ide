use std::collections::HashMap;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[cfg(not(target_arch = "wasm32"))]
use std::io::{Read, Write};
#[cfg(not(target_arch = "wasm32"))]
use std::sync::{Arc, Mutex};

/// Configuration for starting an LSP server process.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LspServerConfig {
    pub id: String,
    pub language_id: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default)]
    pub cwd: Option<String>,
}

/// Result of checking whether a language server binary is installed on the host.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LspBinaryCheck {
    pub name: String,
    pub exists: bool,
    pub path: Option<String>,
    pub install_command: String,
}

/// Metadata describing a built-in language server.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BuiltinLspServer {
    pub language_id: String,
    pub command: String,
    pub args: Vec<String>,
    pub binary: String,
    pub install_command: String,
}

/// Descriptor registered by an extension declaring an LSP client.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionLspDescriptor {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    pub server_options: serde_json::Value,
    #[serde(default)]
    pub client_options: Option<serde_json::Value>,
}

/// Returns the registry of built-in language servers supported by Krypton IDE.
pub fn get_builtin_servers() -> Vec<BuiltinLspServer> {
    vec![
        BuiltinLspServer {
            language_id: "typescript".to_string(),
            command: "typescript-language-server".to_string(),
            args: vec!["--stdio".to_string()],
            binary: "typescript-language-server".to_string(),
            install_command: "npm install -g typescript-language-server typescript".to_string(),
        },
        BuiltinLspServer {
            language_id: "javascript".to_string(),
            command: "typescript-language-server".to_string(),
            args: vec!["--stdio".to_string()],
            binary: "typescript-language-server".to_string(),
            install_command: "npm install -g typescript-language-server typescript".to_string(),
        },
        BuiltinLspServer {
            language_id: "python".to_string(),
            command: "pyright-langserver".to_string(),
            args: vec!["--stdio".to_string()],
            binary: "pyright-langserver".to_string(),
            install_command: "npm install -g pyright".to_string(),
        },
        BuiltinLspServer {
            language_id: "rust".to_string(),
            command: "rust-analyzer".to_string(),
            args: vec![],
            binary: "rust-analyzer".to_string(),
            install_command: "pkg install -y rust-analyzer".to_string(),
        },
        BuiltinLspServer {
            language_id: "cpp".to_string(),
            command: "clangd".to_string(),
            args: vec![],
            binary: "clangd".to_string(),
            install_command: "pkg install -y clang".to_string(),
        },
        BuiltinLspServer {
            language_id: "c".to_string(),
            command: "clangd".to_string(),
            args: vec![],
            binary: "clangd".to_string(),
            install_command: "pkg install -y clang".to_string(),
        },
        BuiltinLspServer {
            language_id: "go".to_string(),
            command: "gopls".to_string(),
            args: vec![],
            binary: "gopls".to_string(),
            install_command: "pkg install -y gopls".to_string(),
        },
        BuiltinLspServer {
            language_id: "json".to_string(),
            command: "vscode-json-language-server".to_string(),
            args: vec!["--stdio".to_string()],
            binary: "vscode-json-language-server".to_string(),
            install_command: "npm install -g vscode-langservers-extracted".to_string(),
        },
        BuiltinLspServer {
            language_id: "html".to_string(),
            command: "vscode-html-language-server".to_string(),
            args: vec!["--stdio".to_string()],
            binary: "vscode-html-language-server".to_string(),
            install_command: "npm install -g vscode-langservers-extracted".to_string(),
        },
        BuiltinLspServer {
            language_id: "css".to_string(),
            command: "vscode-css-language-server".to_string(),
            args: vec!["--stdio".to_string()],
            binary: "vscode-css-language-server".to_string(),
            install_command: "npm install -g vscode-langservers-extracted".to_string(),
        },
    ]
}

/// Checks whether a binary exists on the system, in a custom prefix, in Termux, or on PATH.
pub fn check_binary(name: &str, custom_prefix: Option<&str>) -> LspBinaryCheck {
    let builtin_servers = get_builtin_servers();
    let default_install = builtin_servers
        .iter()
        .find(|s| s.binary == name || s.command == name || s.language_id == name)
        .map(|s| s.install_command.clone())
        .unwrap_or_else(|| format!("pkg install -y {}", name));

    // 1. Direct path check if `name` is already an absolute/relative path
    let direct_path = Path::new(name);
    if direct_path.is_file() {
        return LspBinaryCheck {
            name: name.to_string(),
            exists: true,
            path: Some(direct_path.to_string_lossy().to_string()),
            install_command: default_install,
        };
    }

    // 2. Custom prefix check
    if let Some(prefix) = custom_prefix {
        let p = Path::new(prefix);
        let candidate_bin = p.join("bin").join(name);
        if candidate_bin.is_file() {
            return LspBinaryCheck {
                name: name.to_string(),
                exists: true,
                path: Some(candidate_bin.to_string_lossy().to_string()),
                install_command: default_install,
            };
        }
        let candidate_direct = p.join(name);
        if candidate_direct.is_file() {
            return LspBinaryCheck {
                name: name.to_string(),
                exists: true,
                path: Some(candidate_direct.to_string_lossy().to_string()),
                install_command: default_install,
            };
        }
    }

    // 3. Termux prefix check
    let termux_path = Path::new("/data/data/com.sednium.kryptonide.legacy/files/usr/bin").join(name);
    if termux_path.is_file() {
        return LspBinaryCheck {
            name: name.to_string(),
            exists: true,
            path: Some(termux_path.to_string_lossy().to_string()),
            install_command: default_install,
        };
    }

    // 4. System PATH check
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return LspBinaryCheck {
                    name: name.to_string(),
                    exists: true,
                    path: Some(candidate.to_string_lossy().to_string()),
                    install_command: default_install,
                };
            }
        }
    }

    LspBinaryCheck {
        name: name.to_string(),
        exists: false,
        path: None,
        install_command: default_install,
    }
}

/// LSP JSON-RPC framing engine (`Content-Length: <len>\r\n\r\n<body_bytes>`).
pub struct LspFraming;

impl LspFraming {
    /// Encodes a JSON payload into standard LSP framed wire bytes.
    pub fn encode_message(json: &str) -> Vec<u8> {
        let content_bytes = json.as_bytes();
        let header = format!("Content-Length: {}\r\n\r\n", content_bytes.len());
        let mut out = Vec::with_capacity(header.len() + content_bytes.len());
        out.extend_from_slice(header.as_bytes());
        out.extend_from_slice(content_bytes);
        out
    }

    /// Decodes complete JSON-RPC messages from a mutable buffer.
    /// Incomplete messages remain in the buffer for subsequent chunks.
    pub fn decode_messages(buffer: &mut Vec<u8>) -> Result<Vec<String>, String> {
        let mut messages = Vec::new();
        let header_sep = b"\r\n\r\n";

        loop {
            let sep_pos = buffer
                .windows(header_sep.len())
                .position(|w| w == header_sep);

            let (sep_idx, sep_len) = match sep_pos {
                Some(idx) => (idx, header_sep.len()),
                None => break,
            };

            let header_slice = &buffer[..sep_idx];
            let header_text = match std::str::from_utf8(header_slice) {
                Ok(s) => s,
                Err(e) => return Err(format!("Invalid UTF-8 in LSP headers: {e}")),
            };

            let mut content_length: Option<usize> = None;
            for line in header_text.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                if let Some(colon_pos) = line.find(':') {
                    let name = line[..colon_pos].trim();
                    let value = line[colon_pos + 1..].trim();
                    if name.eq_ignore_ascii_case("Content-Length") {
                        match value.parse::<usize>() {
                            Ok(len) => content_length = Some(len),
                            Err(e) => return Err(format!("Malformed Content-Length '{value}': {e}")),
                        }
                    }
                }
            }

            let content_len = match content_length {
                Some(len) => len,
                None => return Err("Malformed LSP header: missing Content-Length".to_string()),
            };

            let body_start = sep_idx + sep_len;
            let body_end = body_start + content_len;

            if buffer.len() < body_end {
                // Incomplete body; wait for more data
                break;
            }

            let body_bytes = &buffer[body_start..body_end];
            let message = match String::from_utf8(body_bytes.to_vec()) {
                Ok(s) => s,
                Err(_) => String::from_utf8_lossy(body_bytes).into_owned(),
            };
            messages.push(message);

            buffer.drain(..body_end);
        }

        Ok(messages)
    }
}

/// Handle to a running native LSP child process communicating over stdio.
#[cfg(not(target_arch = "wasm32"))]
pub struct LspProcess {
    config: LspServerConfig,
    child: Option<std::process::Child>,
    stdin: Option<std::process::ChildStdin>,
    incoming_messages: Arc<Mutex<Vec<String>>>,
    stdout_thread: Option<std::thread::JoinHandle<()>>,
    stderr_thread: Option<std::thread::JoinHandle<()>>,
}

#[cfg(not(target_arch = "wasm32"))]
impl std::fmt::Debug for LspProcess {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LspProcess")
            .field("config", &self.config)
            .finish()
    }
}

#[cfg(not(target_arch = "wasm32"))]
impl LspProcess {
    /// Spawns a new LSP server process and starts the stdio reader threads.
    pub fn spawn(config: LspServerConfig) -> Result<Self, String> {
        let mut cmd = std::process::Command::new(&config.command);
        cmd.args(&config.args);

        // Prepend Termux bin dir to PATH so Android/Termux environments locate binaries
        let mut path_dirs: Vec<PathBuf> = std::env::var_os("PATH")
            .map(|p| std::env::split_paths(&p).collect())
            .unwrap_or_default();
        let termux_bin = PathBuf::from("/data/data/com.sednium.kryptonide.legacy/files/usr/bin");
        if !path_dirs.contains(&termux_bin) {
            path_dirs.insert(0, termux_bin);
        }
        if let Ok(new_path) = std::env::join_paths(&path_dirs) {
            cmd.env("PATH", new_path);
        }

        // Apply custom env
        for (k, v) in &config.env {
            cmd.env(k, v);
        }

        // Apply working directory
        if let Some(ref cwd) = config.cwd {
            cmd.current_dir(cwd);
        }

        cmd.stdin(std::process::Stdio::piped());
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn LSP server '{}': {e}", config.command))?;

        let stdin = child.stdin.take();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let incoming_messages = Arc::new(Mutex::new(Vec::new()));

        let in_msgs = incoming_messages.clone();
        let stdout_thread = stdout.and_then(|mut out| {
            std::thread::Builder::new()
                .name("lsp-stdout-reader".to_string())
                .spawn(move || {
                    let mut buffer = Vec::new();
                    let mut chunk = [0u8; 4096];
                    loop {
                        match out.read(&mut chunk) {
                            Ok(0) => break, // EOF
                            Ok(n) => {
                                buffer.extend_from_slice(&chunk[..n]);
                                if let Ok(messages) = LspFraming::decode_messages(&mut buffer) {
                                    if !messages.is_empty() {
                                        if let Ok(mut lock) = in_msgs.lock() {
                                            lock.extend(messages);
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                if e.kind() != std::io::ErrorKind::Interrupted {
                                    break;
                                }
                            }
                        }
                    }
                })
                .ok()
        });

        let stderr_thread = stderr.and_then(|mut err| {
            std::thread::Builder::new()
                .name("lsp-stderr-reader".to_string())
                .spawn(move || {
                    let mut chunk = [0u8; 1024];
                    loop {
                        match err.read(&mut chunk) {
                            Ok(0) => break,
                            Ok(_) => {}
                            Err(_) => break,
                        }
                    }
                })
                .ok()
        });

        Ok(Self {
            config,
            child: Some(child),
            stdin,
            incoming_messages,
            stdout_thread,
            stderr_thread,
        })
    }

    /// Sends a framed JSON-RPC message to the child process stdin.
    pub fn send_message(&mut self, json: &str) -> Result<(), String> {
        let bytes = LspFraming::encode_message(json);
        if let Some(ref mut stdin) = self.stdin {
            stdin
                .write_all(&bytes)
                .map_err(|e| format!("Failed to write to LSP stdin: {e}"))?;
            stdin
                .flush()
                .map_err(|e| format!("Failed to flush LSP stdin: {e}"))?;
            Ok(())
        } else {
            Err("LSP stdin is closed or process not running".to_string())
        }
    }

    /// Drains all received messages from the stdout background reader.
    pub fn drain_messages(&mut self) -> Vec<String> {
        self.incoming_messages
            .lock()
            .map(|mut l| std::mem::take(&mut *l))
            .unwrap_or_default()
    }

    /// Terminates the child process and joins the reader threads.
    pub fn stop(&mut self) {
        drop(self.stdin.take());

        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }

        if let Some(h) = self.stdout_thread.take() {
            let _ = h.join();
        }
        if let Some(h) = self.stderr_thread.take() {
            let _ = h.join();
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
impl Drop for LspProcess {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Thread-safe manager holding running LSP processes and extension-declared descriptors.
#[cfg(not(target_arch = "wasm32"))]
#[derive(Default)]
pub struct LspManager {
    processes: Arc<Mutex<HashMap<String, LspProcess>>>,
    extension_clients: Arc<Mutex<HashMap<String, ExtensionLspDescriptor>>>,
}

#[cfg(not(target_arch = "wasm32"))]
impl std::fmt::Debug for LspManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let running: Vec<String> = self
            .processes
            .lock()
            .map(|p| p.keys().cloned().collect())
            .unwrap_or_default();
        f.debug_struct("LspManager")
            .field("running_sessions", &running)
            .finish()
    }
}

#[cfg(not(target_arch = "wasm32"))]
impl LspManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Spawns an LSP server process from config and registers it by config.id.
    pub fn start_server(&self, config: LspServerConfig) -> Result<String, String> {
        let id = config.id.clone();
        let process = LspProcess::spawn(config)?;
        let mut lock = self.processes.lock().map_err(|e| e.to_string())?;
        if let Some(mut old) = lock.insert(id.clone(), process) {
            old.stop();
        }
        Ok(id)
    }

    /// Sends a JSON-RPC message to an active LSP session.
    pub fn send_message(&self, session_id: &str, json: &str) -> Result<(), String> {
        let mut lock = self.processes.lock().map_err(|e| e.to_string())?;
        let proc = lock
            .get_mut(session_id)
            .ok_or_else(|| format!("LSP session '{session_id}' not found"))?;
        proc.send_message(json)
    }

    /// Drains all incoming messages received from an active LSP session.
    pub fn drain_messages(&self, session_id: &str) -> Result<Vec<String>, String> {
        let mut lock = self.processes.lock().map_err(|e| e.to_string())?;
        let proc = lock
            .get_mut(session_id)
            .ok_or_else(|| format!("LSP session '{session_id}' not found"))?;
        Ok(proc.drain_messages())
    }

    /// Stops an LSP session and terminates its child process.
    pub fn stop_server(&self, session_id: &str) -> Result<(), String> {
        let mut lock = self.processes.lock().map_err(|e| e.to_string())?;
        if let Some(mut proc) = lock.remove(session_id) {
            proc.stop();
            Ok(())
        } else {
            Err(format!("LSP session '{session_id}' not found"))
        }
    }

    /// Stops all running LSP servers.
    pub fn stop_all(&self) {
        if let Ok(mut lock) = self.processes.lock() {
            for (_, mut proc) in lock.drain() {
                proc.stop();
            }
        }
    }

    /// Checks if a session is currently running.
    pub fn is_server_running(&self, session_id: &str) -> bool {
        self.processes
            .lock()
            .map(|l| l.contains_key(session_id))
            .unwrap_or(false)
    }

    /// Checks for binary existence on system/Termux.
    pub fn check_binary(&self, name: &str, prefix: Option<&str>) -> LspBinaryCheck {
        check_binary(name, prefix)
    }

    /// Gets the list of built-in server definitions.
    pub fn get_builtin_servers(&self) -> Vec<BuiltinLspServer> {
        get_builtin_servers()
    }

    /// Registers an extension-declared LSP client descriptor JSON.
    pub fn register_extension_client(&self, descriptor_json: &str) -> Result<String, String> {
        let desc: ExtensionLspDescriptor = serde_json::from_str(descriptor_json)
            .map_err(|e| format!("Invalid extension LSP descriptor JSON: {e}"))?;
        let id = desc.id.clone();
        let mut lock = self.extension_clients.lock().map_err(|e| e.to_string())?;
        lock.insert(id.clone(), desc);
        Ok(id)
    }

    /// Retrieves an extension-declared LSP client descriptor.
    pub fn get_extension_client(&self, id: &str) -> Option<ExtensionLspDescriptor> {
        self.extension_clients.lock().ok()?.get(id).cloned()
    }

    /// Lists all extension-declared LSP client descriptors.
    pub fn list_extension_clients(&self) -> Vec<ExtensionLspDescriptor> {
        self.extension_clients
            .lock()
            .map(|l| l.values().cloned().collect())
            .unwrap_or_default()
    }
}

#[cfg(not(target_arch = "wasm32"))]
impl Drop for LspManager {
    fn drop(&mut self) {
        self.stop_all();
    }
}
