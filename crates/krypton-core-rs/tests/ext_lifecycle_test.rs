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
    dir.push(format!("krypton_test_lifecycle_{}_{}", name, nonce));
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn test_lifecycle_registration_and_activation() {
    let test_dir = create_temp_dir("reg_act");
    let ext_dir = test_dir.join("sample-extension");
    let ext_js_dir = ext_dir.join("extension");
    fs::create_dir_all(&ext_js_dir).unwrap();

    let manifest_json = r#"{
        "name": "sample",
        "publisher": "krypton",
        "version": "1.0.0",
        "main": "extension/main.js",
        "activationEvents": ["*"]
    }"#;
    let manifest: ExtensionManifest = serde_json::from_str(manifest_json).unwrap();

    let main_js = r#"
        const vscode = require('vscode');

        function activate(context) {
            vscode.window.showInformationMessage('Sample activated!');
            const disp = vscode.commands.registerCommand('sample.sayHello', (name) => {
                return 'Hello ' + (name || 'World');
            });
            context.subscriptions.push(disp);
        }

        function deactivate() {
        }

        module.exports = { activate, deactivate };
    "#;
    fs::write(ext_js_dir.join("main.js"), main_js).unwrap();

    let installed_ext = InstalledExtension::new(ext_dir, manifest);

    let storage_dir = test_dir.join("storage");
    let log_dir = test_dir.join("logs");
    let manager = ExtensionLifecycleManager::new(storage_dir, log_dir);

    // Register extension
    manager.register_extension(installed_ext);
    assert_eq!(
        manager.get_extension_state("krypton.sample"),
        ExtensionState::Installed
    );

    // Explicit activation
    manager
        .activate_extension("krypton.sample")
        .expect("activation should succeed");
    assert_eq!(
        manager.get_extension_state("krypton.sample"),
        ExtensionState::Active
    );

    // Verify notification was recorded
    let notes = manager.drain_notifications();
    assert_eq!(notes.len(), 1);
    assert_eq!(notes[0].message, "Sample activated!");

    // Verify command execution
    let res = manager
        .execute_command("sample.sayHello", r#"["Developer"]"#)
        .expect("command should execute");
    assert_eq!(res, serde_json::json!("Hello Developer"));

    let _ = fs::remove_dir_all(test_dir);
}

#[test]
fn test_lazy_activation_via_event_and_command() {
    let test_dir = create_temp_dir("lazy_act");
    let ext_dir = test_dir.join("lazy-extension");
    let ext_js_dir = ext_dir.join("extension");
    fs::create_dir_all(&ext_js_dir).unwrap();

    let manifest_json = r#"{
        "name": "lazy",
        "publisher": "acme",
        "version": "0.1.0",
        "main": "extension/main.js",
        "activationEvents": ["onCommand:acme.compute"]
    }"#;
    let manifest: ExtensionManifest = serde_json::from_str(manifest_json).unwrap();

    let main_js = r#"
        const vscode = require('vscode');

        exports.activate = function(context) {
            vscode.commands.registerCommand('acme.compute', (x, y) => {
                return (x || 0) * (y || 0);
            });
        };
    "#;
    fs::write(ext_js_dir.join("main.js"), main_js).unwrap();

    let installed_ext = InstalledExtension::new(ext_dir, manifest);

    let manager = ExtensionLifecycleManager::new(test_dir.join("storage"), test_dir.join("logs"));
    manager.register_extension(installed_ext);

    assert_eq!(
        manager.get_extension_state("acme.lazy"),
        ExtensionState::Installed
    );
    assert!(!manager.list_active().contains(&"acme.lazy".to_string()));

    // Execute command triggers lazy activation
    let res = manager
        .execute_command("acme.compute", "[6, 7]")
        .expect("lazy command execution should succeed");
    assert_eq!(res, serde_json::json!(42));

    assert_eq!(
        manager.get_extension_state("acme.lazy"),
        ExtensionState::Active
    );
    assert!(manager.list_active().contains(&"acme.lazy".to_string()));

    let _ = fs::remove_dir_all(test_dir);
}

#[test]
fn test_deactivation_disposes_resources() {
    let test_dir = create_temp_dir("deact");
    let ext_dir = test_dir.join("deact-extension");
    let ext_js_dir = ext_dir.join("extension");
    fs::create_dir_all(&ext_js_dir).unwrap();

    let manifest_json = r#"{
        "name": "disposable-ext",
        "publisher": "krypton",
        "version": "1.0.0",
        "main": "extension/main.js"
    }"#;
    let manifest: ExtensionManifest = serde_json::from_str(manifest_json).unwrap();

    let main_js = r#"
        const vscode = require('vscode');

        exports.activate = function(context) {
            const cmd = vscode.commands.registerCommand('disposable.ping', () => 'pong');
            context.subscriptions.push(cmd);
        };

        exports.deactivate = function() {
            vscode.window.showInformationMessage('Cleaned up!');
        };
    "#;
    fs::write(ext_js_dir.join("main.js"), main_js).unwrap();

    let installed_ext = InstalledExtension::new(ext_dir, manifest);

    let manager = ExtensionLifecycleManager::new(test_dir.join("storage"), test_dir.join("logs"));
    manager.register_extension(installed_ext);

    manager
        .activate_extension("krypton.disposable-ext")
        .expect("activation should succeed");
    assert_eq!(
        manager
            .execute_command("disposable.ping", "[]")
            .expect("ping should succeed"),
        serde_json::json!("pong")
    );

    // Deactivate
    manager
        .deactivate_extension("krypton.disposable-ext")
        .expect("deactivation should succeed");
    assert_eq!(
        manager.get_extension_state("krypton.disposable-ext"),
        ExtensionState::Deactivated
    );

    // Command should no longer be registered
    let err = manager.execute_command("disposable.ping", "[]");
    assert!(err.is_err(), "command execution should fail after deactivation");

    let _ = fs::remove_dir_all(test_dir);
}
