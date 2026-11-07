#[cfg(not(target_arch = "wasm32"))]
mod tests {
    use krypton_core_rs::ext_host::lsp::*;
    use krypton_core_rs::ext_host::runtime::ExtensionRuntime;
    use krypton_core_rs::ext_host::vscode_api::VscodeApiHost;
    use std::collections::HashMap;
    use std::thread::sleep;
    use std::time::Duration;

    #[test]
    fn test_lsp_framing_encode_decode_roundtrip() {
        let msg = r#"{"jsonrpc":"2.0","method":"initialize","params":{"processId":123}}"#;
        let encoded = LspFraming::encode_message(msg);
        let header_prefix = format!("Content-Length: {}\r\n\r\n", msg.as_bytes().len());
        assert!(encoded.starts_with(header_prefix.as_bytes()));

        let mut buf = encoded.clone();
        let decoded = LspFraming::decode_messages(&mut buf).expect("decode should succeed");
        assert_eq!(decoded.len(), 1);
        assert_eq!(decoded[0], msg);
        assert!(buf.is_empty(), "buffer must be drained completely");

        // Multibyte UTF-8 verification
        let unicode_msg = r#"{"message":"Hello 🦀 Rocket 🚀 and Accents: éàç"}"#;
        let mut u_encoded = LspFraming::encode_message(unicode_msg);
        let u_decoded = LspFraming::decode_messages(&mut u_encoded).expect("unicode decode");
        assert_eq!(u_decoded.len(), 1);
        assert_eq!(u_decoded[0], unicode_msg);
        assert!(u_encoded.is_empty());
    }

    #[test]
    fn test_lsp_framing_chunked_fragmented_arrival() {
        let mut buf = Vec::new();

        // 1. Send incomplete header
        buf.extend_from_slice(b"Content-Leng");
        let res1 = LspFraming::decode_messages(&mut buf).unwrap();
        assert!(res1.is_empty());
        assert_eq!(buf.len(), 12);

        // 2. Send rest of header and partial body
        buf.extend_from_slice(b"th: 17\r\n\r\n{\"json");
        let res2 = LspFraming::decode_messages(&mut buf).unwrap();
        assert!(res2.is_empty());
        assert!(!buf.is_empty());

        // 3. Send final body chunk
        buf.extend_from_slice(b"rpc\":\"2.0\"}");
        let res3 = LspFraming::decode_messages(&mut buf).unwrap();
        assert_eq!(res3.len(), 1);
        assert_eq!(res3[0], r#"{"jsonrpc":"2.0"}"#);
        assert!(buf.is_empty());
    }

    #[test]
    fn test_lsp_framing_multi_message_packets() {
        let msg1 = r#"{"id":1,"method":"textDocument/didOpen"}"#;
        let msg2 = r#"{"id":2,"method":"textDocument/definition"}"#;
        let msg3 = r#"{"id":3,"result":null}"#;

        let mut packet = Vec::new();
        packet.extend(LspFraming::encode_message(msg1));
        packet.extend(LspFraming::encode_message(msg2));
        packet.extend(LspFraming::encode_message(msg3));

        // Also append trailing fragmented 4th message
        packet.extend_from_slice(b"Content-Length: 15\r\n\r\n{\"trailing\":");

        let decoded = LspFraming::decode_messages(&mut packet).unwrap();
        assert_eq!(decoded.len(), 3);
        assert_eq!(decoded[0], msg1);
        assert_eq!(decoded[1], msg2);
        assert_eq!(decoded[2], msg3);
        assert!(!packet.is_empty());

        // Complete 4th message
        packet.extend_from_slice(b"12}");
        let decoded2 = LspFraming::decode_messages(&mut packet).unwrap();
        assert_eq!(decoded2.len(), 1);
        assert_eq!(decoded2[0], r#"{"trailing":12}"#);
        assert!(packet.is_empty());
    }

    #[test]
    fn test_lsp_framing_malformed_header_handling() {
        // Missing Content-Length header
        let mut malformed1 = b"Content-Type: application/json\r\n\r\n{}".to_vec();
        let err1 = LspFraming::decode_messages(&mut malformed1);
        assert!(err1.is_err());
        assert!(err1.unwrap_err().contains("missing Content-Length"));

        // Invalid Content-Length number
        let mut malformed2 = b"Content-Length: abc\r\n\r\n{}".to_vec();
        let err2 = LspFraming::decode_messages(&mut malformed2);
        assert!(err2.is_err());
        assert!(err2.unwrap_err().contains("Malformed Content-Length"));
    }

    #[test]
    fn test_builtin_servers_registry() {
        let servers = get_builtin_servers();
        assert_eq!(servers.len(), 10);

        let langs: Vec<&str> = servers.iter().map(|s| s.language_id.as_str()).collect();
        assert!(langs.contains(&"typescript"));
        assert!(langs.contains(&"javascript"));
        assert!(langs.contains(&"python"));
        assert!(langs.contains(&"rust"));
        assert!(langs.contains(&"cpp"));
        assert!(langs.contains(&"c"));
        assert!(langs.contains(&"go"));
        assert!(langs.contains(&"json"));
        assert!(langs.contains(&"html"));
        assert!(langs.contains(&"css"));

        let py = servers.iter().find(|s| s.language_id == "python").unwrap();
        assert_eq!(py.command, "pyright-langserver");
        assert_eq!(py.args, vec!["--stdio"]);
        assert_eq!(py.binary, "pyright-langserver");
        assert_eq!(py.install_command, "npm install -g pyright");

        let rust = servers.iter().find(|s| s.language_id == "rust").unwrap();
        assert_eq!(rust.command, "rust-analyzer");
        assert!(rust.args.is_empty());
        assert_eq!(rust.install_command, "pkg install -y rust-analyzer");

        let ts = servers.iter().find(|s| s.language_id == "typescript").unwrap();
        assert_eq!(ts.command, "typescript-language-server");
        assert_eq!(ts.args, vec!["--stdio"]);
        assert_eq!(ts.install_command, "npm install -g typescript-language-server typescript");

        let cpp = servers.iter().find(|s| s.language_id == "cpp").unwrap();
        assert_eq!(cpp.command, "clangd");
        assert_eq!(cpp.install_command, "pkg install -y clang");

        let go = servers.iter().find(|s| s.language_id == "go").unwrap();
        assert_eq!(go.command, "gopls");
        assert_eq!(go.install_command, "pkg install -y gopls");

        let json = servers.iter().find(|s| s.language_id == "json").unwrap();
        assert_eq!(json.command, "vscode-json-language-server");
        assert_eq!(json.install_command, "npm install -g vscode-langservers-extracted");
    }

    #[test]
    fn test_binary_existence_check() {
        // System binary check (sh exists on any unix system)
        let sh_check = check_binary("sh", None);
        assert!(sh_check.exists, "sh should be present on Linux system");
        assert!(sh_check.path.is_some());

        // Non-existent binary check
        let fake_check = check_binary("krypton_non_existent_server_9999", None);
        assert!(!fake_check.exists);
        assert!(fake_check.path.is_none());

        // Install command mapping for known language servers
        let py_check = check_binary("pyright-langserver", None);
        assert_eq!(py_check.install_command, "npm install -g pyright");

        let rust_check = check_binary("rust-analyzer", None);
        assert_eq!(rust_check.install_command, "pkg install -y rust-analyzer");
    }

    #[test]
    fn test_lsp_process_lifecycle_real_stdio() {
        // Use `cat` as a true stdio echo server on Linux
        let config = LspServerConfig {
            id: "echo-session".to_string(),
            language_id: "test".to_string(),
            command: "cat".to_string(),
            args: vec![],
            env: HashMap::new(),
            cwd: None,
        };

        let mut proc = LspProcess::spawn(config).expect("failed to spawn cat");

        let test_payload1 = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#;
        proc.send_message(test_payload1).expect("send_message 1");

        // Wait for background thread to read and decode the echoed message
        let mut received = Vec::new();
        for _ in 0..50 {
            received.extend(proc.drain_messages());
            if !received.is_empty() {
                break;
            }
            sleep(Duration::from_millis(20));
        }

        assert_eq!(received.len(), 1, "Expected 1 echoed message from cat");
        assert_eq!(received[0], test_payload1);

        // Send a second message
        let test_payload2 = r#"{"jsonrpc":"2.0","id":2,"method":"shutdown"}"#;
        proc.send_message(test_payload2).expect("send_message 2");

        let mut received2 = Vec::new();
        for _ in 0..50 {
            received2.extend(proc.drain_messages());
            if !received2.is_empty() {
                break;
            }
            sleep(Duration::from_millis(20));
        }

        assert_eq!(received2.len(), 1, "Expected 2nd echoed message from cat");
        assert_eq!(received2[0], test_payload2);

        // Terminate process cleanly
        proc.stop();
    }

    #[test]
    fn test_lsp_manager_lifecycle() {
        let mgr = LspManager::new();

        let config = LspServerConfig {
            id: "mgr-echo".to_string(),
            language_id: "test".to_string(),
            command: "cat".to_string(),
            args: vec![],
            env: HashMap::new(),
            cwd: None,
        };

        let session_id = mgr.start_server(config).expect("start_server");
        assert_eq!(session_id, "mgr-echo");
        assert!(mgr.is_server_running("mgr-echo"));

        let msg = r#"{"jsonrpc":"2.0","method":"ping"}"#;
        mgr.send_message("mgr-echo", msg).expect("send_message");

        let mut received = Vec::new();
        for _ in 0..50 {
            if let Ok(msgs) = mgr.drain_messages("mgr-echo") {
                received.extend(msgs);
                if !received.is_empty() {
                    break;
                }
            }
            sleep(Duration::from_millis(20));
        }

        assert_eq!(received.len(), 1);
        assert_eq!(received[0], msg);

        // Register extension client descriptor
        let descriptor_json = r#"{
            "id": "my-lsp-client",
            "name": "My Language Client",
            "serverOptions": {
                "command": "cat",
                "args": []
            },
            "clientOptions": {
                "documentSelector": ["typescript"]
            }
        }"#;

        let reg_id = mgr.register_extension_client(descriptor_json).expect("register client");
        assert_eq!(reg_id, "my-lsp-client");

        let fetched = mgr.get_extension_client("my-lsp-client").expect("fetched descriptor");
        assert_eq!(fetched.id, "my-lsp-client");
        assert_eq!(fetched.name.as_deref(), Some("My Language Client"));

        mgr.stop_server("mgr-echo").expect("stop_server");
        assert!(!mgr.is_server_running("mgr-echo"));
    }

    #[test]
    fn test_quickjs_vscode_languageclient_shim() {
        let runtime = ExtensionRuntime::new().expect("runtime new");
        let api = VscodeApiHost::new();
        api.inject_into_runtime(&runtime, "/tmp").expect("inject api");

        let js_code = r#"
            var nodeClient = require('vscode-languageclient/node');
            var baseClient = require('vscode-languageclient');

            if (!nodeClient.LanguageClient || !baseClient.LanguageClient) {
                throw new Error("Missing LanguageClient in module exports");
            }
            if (nodeClient.TransportKind.stdio !== 0) {
                throw new Error("Invalid TransportKind.stdio: " + nodeClient.TransportKind.stdio);
            }

            var client = new nodeClient.LanguageClient(
                'test-client-id',
                'Test Client Name',
                { command: 'rust-analyzer' },
                { documentSelector: ['rust'] }
            );

            var startDisposable = client.start();
            if (!startDisposable || typeof startDisposable.dispose !== 'function') {
                throw new Error("client.start() did not return a Disposable");
            }

            var readyPromise = client.onReady();
            var stopPromise = client.stop();

            startDisposable.dispose();
            "OK"
        "#;

        let res = runtime.eval_string(js_code).expect("eval language client script");
        assert_eq!(res, "OK");

        // Verify native registry captured the descriptor
        let desc = api.lsp.get_extension_client("test-client-id").expect("descriptor registered");
        assert_eq!(desc.id, "test-client-id");
        assert_eq!(desc.name.as_deref(), Some("Test Client Name"));
    }
}
