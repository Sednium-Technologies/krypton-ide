#![cfg(not(target_arch = "wasm32"))]

use krypton_core_rs::ext_host::{ExtensionRuntime, NotificationMessage, VscodeApiHost};

#[test]
fn test_vscode_require_and_objects() {
    let rt = ExtensionRuntime::new().expect("should create runtime");
    let api = VscodeApiHost::new();
    api.inject_into_runtime(&rt, "/workspace").expect("should inject vscode API");

    let res = rt.eval_string(r#"
        const vscode = require('vscode');
        typeof vscode === 'object' &&
        typeof vscode.commands === 'object' &&
        typeof vscode.commands.registerCommand === 'function' &&
        typeof vscode.commands.executeCommand === 'function' &&
        typeof vscode.window === 'object' &&
        typeof vscode.window.showInformationMessage === 'function' &&
        typeof vscode.workspace === 'object' &&
        typeof vscode.workspace.getConfiguration === 'function' &&
        typeof vscode.Disposable === 'function' &&
        typeof vscode.Uri === 'function'
    "#).expect("eval require('vscode') should succeed");
    assert_eq!(res, "true");

    let err = rt.eval_string("require('nonexistent')");
    assert!(err.is_err(), "require of unknown module should throw");
    let err_msg = err.unwrap_err();
    assert!(err_msg.contains("Cannot find module 'nonexistent'"));

    let uri_res = rt.eval_string(r#"
        (() => {
            const vscode = require('vscode');
            const u = vscode.Uri.file('/foo/bar.txt');
            return u.scheme === 'file' && u.path === '/foo/bar.txt' && u.fsPath === '/foo/bar.txt';
        })()
    "#).expect("Uri test should succeed");
    assert_eq!(uri_res, "true");

    let disp_res = rt.eval_string(r#"
        (() => {
            const vscode = require('vscode');
            let disposed = false;
            const d = new vscode.Disposable(() => { disposed = true; });
            d.dispose();
            return disposed;
        })()
    "#).expect("Disposable test should succeed");
    assert_eq!(disp_res, "true");
}

#[test]
fn test_commands_registration_and_execution() {
    let rt = ExtensionRuntime::new().expect("should create runtime");
    let api = VscodeApiHost::new();
    api.inject_into_runtime(&rt, "/workspace").expect("should inject vscode API");

    rt.eval_string(r#"
        const vscode = require('vscode');
        globalThis.testDisposable = vscode.commands.registerCommand('test.greet', (name) => 'Hello ' + name);
    "#).expect("registerCommand should succeed");

    assert!(api.commands.has("test.greet"));
    assert!(api.list_commands().contains(&"test.greet".to_string()));

    let val = api.execute_command(&rt, "test.greet", r#"["Rust"]"#)
        .expect("execute_command should succeed");
    assert_eq!(val, serde_json::json!("Hello Rust"));

    rt.eval_string("globalThis.testDisposable.dispose();")
        .expect("dispose should succeed");

    assert!(!api.commands.has("test.greet"));
    assert!(!api.list_commands().contains(&"test.greet".to_string()));

    let err = api.execute_command(&rt, "test.greet", r#"["Rust"]"#);
    assert!(err.is_err());
}

#[test]
fn test_window_notifications() {
    let rt = ExtensionRuntime::new().expect("should create runtime");
    let api = VscodeApiHost::new();
    api.inject_into_runtime(&rt, "/workspace").expect("should inject vscode API");

    rt.eval_string(r#"
        const vscode = require('vscode');
        vscode.window.showInformationMessage('System ready', 'OK', 'Cancel');
        vscode.window.showErrorMessage('Error occurred');
    "#).expect("show message calls should succeed");

    let notifications = api.drain_notifications();
    assert_eq!(notifications.len(), 2);

    assert_eq!(notifications[0], NotificationMessage {
        level: "info".to_string(),
        message: "System ready".to_string(),
        items: vec!["OK".to_string(), "Cancel".to_string()],
    });

    assert_eq!(notifications[1], NotificationMessage {
        level: "error".to_string(),
        message: "Error occurred".to_string(),
        items: vec![],
    });

    assert!(api.drain_notifications().is_empty());
}

#[test]
fn test_workspace_configuration() {
    let rt = ExtensionRuntime::new().expect("should create runtime");
    let api = VscodeApiHost::new();
    api.inject_into_runtime(&rt, "/workspace").expect("should inject vscode API");

    api.workspace.set_configuration("editor", serde_json::json!({ "tabSize": 2 }));

    rt.eval_string(r#"
        const vscode = require('vscode');
        globalThis.val = vscode.workspace.getConfiguration('editor').get('tabSize', 4);
    "#).expect("eval string should succeed");

    let val = rt.eval_json("globalThis.val").expect("read tabSize");
    assert_eq!(val, serde_json::json!(2));

    let default_val = rt.eval_json(r#"
        vscode.workspace.getConfiguration('editor').get('fontSize', 14)
    "#).expect("fallback eval should succeed");
    assert_eq!(default_val, serde_json::json!(14));
}
