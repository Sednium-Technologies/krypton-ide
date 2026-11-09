#![cfg(not(target_arch = "wasm32"))]

use std::fs;
use std::path::PathBuf;
use krypton_core_rs::ext_host::{
    ExtensionLifecycleManager, ExtensionManifest, ExtensionState, InstalledExtension,
};

fn create_temp_dir(name: &str) -> PathBuf {
    let mut dir = std::env::temp_dir();
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    dir.push(format!("krypton_test_webview_{}_{}", name, nonce));
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn register_webview_extension(test_dir: &PathBuf, throws_after_register: bool) -> ExtensionLifecycleManager {
    let ext_dir = test_dir.join("runtime-webview-extension");
    let ext_js_dir = ext_dir.join("extension");
    fs::create_dir_all(&ext_js_dir).unwrap();

    let manifest_json = r#"{
        "name": "runtime-webview",
        "publisher": "krypton",
        "version": "1.0.0",
        "main": "extension/main.js",
        "activationEvents": ["*"]
    }"#;
    let manifest: ExtensionManifest = serde_json::from_str(manifest_json).unwrap();

    let throw_line = if throws_after_register {
        "throw new Error('Unsupported desktop API after provider registration');"
    } else {
        ""
    };

    let main_js = format!(
        r#"
        const vscode = require('vscode');

        exports.activate = function(context) {{
            const provider = {{
                resolveWebviewView: function(webviewView) {{
                    webviewView.webview.options = {{ enableScripts: true }};
                    webviewView.webview.html = '<html><head></head><body>Runtime OK</body></html>';
                    webviewView.webview.onDidReceiveMessage(function(message) {{
                        webviewView.webview.postMessage({{ type: 'echo', payload: message }});
                    }});
                }}
            }};
            vscode.window.registerWebviewViewProvider('krypton.sample.runtimeView', provider);
            {throw_line}
        }};
        "#
    );
    fs::write(ext_js_dir.join("main.js"), main_js).unwrap();

    let manager = ExtensionLifecycleManager::new(test_dir.join("storage"), test_dir.join("logs"));
    manager.register_extension(InstalledExtension::new(ext_dir, manifest));
    manager
}

#[test]
fn resolves_webview_provider_and_routes_messages() {
    let test_dir = create_temp_dir("resolve");
    let manager = register_webview_extension(&test_dir, false);

    manager
        .activate_extension("krypton.runtime-webview")
        .expect("activation should succeed");
    assert_eq!(
        manager.get_extension_state("krypton.runtime-webview"),
        ExtensionState::Active
    );

    let snapshot = manager
        .resolve_webview_view("krypton.runtime-webview", "krypton.sample.runtimeView")
        .expect("resolve should succeed")
        .expect("provider should produce a webview");
    assert!(snapshot.html.contains("Runtime OK"));
    assert_eq!(snapshot.view_type, "krypton.sample.runtimeView");
    assert!(snapshot.visible);

    assert!(manager
        .send_webview_message(&snapshot.id, r#"{"type":"ping"}"#)
        .expect("send should succeed"));

    let drained = manager.drain_webviews("krypton.runtime-webview");
    let webview = drained
        .iter()
        .find(|item| item.id == snapshot.id)
        .expect("drained webview");
    assert_eq!(webview.messages.len(), 1);
    assert_eq!(webview.messages[0]["type"], "echo");

    let _ = fs::remove_dir_all(test_dir);
}

#[test]
fn keeps_partially_activated_webviews_available() {
    let test_dir = create_temp_dir("partial");
    let manager = register_webview_extension(&test_dir, true);

    let activation = manager.activate_extension("krypton.runtime-webview");
    assert!(activation.is_err(), "late unsupported API should surface an activation error");
    assert_eq!(
        manager.get_extension_state("krypton.runtime-webview"),
        ExtensionState::Failed("Failed during activation of extension 'krypton.runtime-webview': JS Exception: Unsupported desktop API after provider registration".to_string())
    );

    let snapshot = manager
        .resolve_webview_view("krypton.runtime-webview", "krypton.sample.runtimeView")
        .expect("resolve should tolerate partial activation")
        .expect("provider registered before failure should resolve");
    assert!(snapshot.html.contains("Runtime OK"));

    let _ = fs::remove_dir_all(test_dir);
}
