#![cfg(not(target_arch = "wasm32"))]

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use krypton_core_rs::ext_host::{
    runtime::ExtensionRuntime,
    trust::{TrustManager, WorkspaceTrustState},
    vscode_api::VscodeApiHost,
};

fn create_temp_dir(name: &str) -> PathBuf {
    let mut dir = std::env::temp_dir();
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    dir.push(format!("krypton_test_node_compat_{}_{}", name, nonce));
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn test_node_compat_path_module() {
    let runtime = ExtensionRuntime::new().expect("runtime new");
    let trust = Arc::new(TrustManager::new());
    let api = VscodeApiHost::with_lsp_and_trust(Arc::new(Default::default()), trust);
    api.inject_into_runtime(&runtime, "/workspace").expect("inject api");

    let js = r#"
        var path = require('path');
        if (!path) throw new Error("path is null");
        if (path.join('foo', 'bar') !== 'foo/bar') {
            throw new Error("join failed: " + path.join('foo', 'bar'));
        }
        if (path.basename('/a/b/c.txt') !== 'c.txt') {
            throw new Error("basename failed: " + path.basename('/a/b/c.txt'));
        }
        if (path.basename('/a/b/c.txt', '.txt') !== 'c') {
            throw new Error("basename with ext failed");
        }
        if (path.extname('index.js') !== '.js') {
            throw new Error("extname failed");
        }
        if (path.dirname('/a/b/c.txt') !== '/a/b') {
            throw new Error("dirname failed: " + path.dirname('/a/b/c.txt'));
        }
        if (!path.isAbsolute('/a/b')) {
            throw new Error("isAbsolute failed");
        }
        "OK"
    "#;

    let res = runtime.eval_string(js).expect("path eval");
    assert_eq!(res, "OK");
}

#[test]
fn test_node_compat_os_module() {
    let runtime = ExtensionRuntime::new().expect("runtime new");
    let trust = Arc::new(TrustManager::new());
    let api = VscodeApiHost::with_lsp_and_trust(Arc::new(Default::default()), trust);
    api.inject_into_runtime(&runtime, "/workspace").expect("inject api");

    let js = r#"
        var os = require('os');
        if (os.platform() !== 'linux') throw new Error("os.platform failed: " + os.platform());
        if (os.arch() !== 'arm64') throw new Error("os.arch failed: " + os.arch());
        if (!os.tmpdir()) throw new Error("os.tmpdir missing");
        if (os.EOL !== '\n') throw new Error("os.EOL missing");
        if (!Array.isArray(os.cpus()) || os.cpus().length === 0) throw new Error("os.cpus missing");
        "OK"
    "#;

    let res = runtime.eval_string(js).expect("os eval");
    assert_eq!(res, "OK");
}

#[test]
fn test_node_compat_events_module() {
    let runtime = ExtensionRuntime::new().expect("runtime new");
    let trust = Arc::new(TrustManager::new());
    let api = VscodeApiHost::with_lsp_and_trust(Arc::new(Default::default()), trust);
    api.inject_into_runtime(&runtime, "/workspace").expect("inject api");

    let js = r#"
        var events = require('events');
        var ee = new events.EventEmitter();
        var count = 0;
        ee.on('test', function(val) {
            count += val;
        });
        ee.emit('test', 10);
        ee.emit('test', 5);
        if (count !== 15) throw new Error("count was: " + count);

        var onceCount = 0;
        ee.once('single', function() { onceCount++; });
        ee.emit('single');
        ee.emit('single');
        if (onceCount !== 1) throw new Error("onceCount was: " + onceCount);
        "OK"
    "#;

    let res = runtime.eval_string(js).expect("events eval");
    assert_eq!(res, "OK");
}

#[test]
fn test_node_compat_fs_workspace_boundaries() {
    let test_dir = create_temp_dir("node_fs");
    let ws_dir = test_dir.join("workspace");
    fs::create_dir_all(&ws_dir).unwrap();

    let inside_path = ws_dir.join("hello.txt");
    let outside_path = test_dir.join("forbidden.txt");

    let runtime = ExtensionRuntime::new().expect("runtime new");
    let trust = Arc::new(TrustManager::new());
    trust.set_workspace_root(&ws_dir);
    trust.set_state(WorkspaceTrustState::Restricted);

    let api = VscodeApiHost::with_lsp_and_trust(Arc::new(Default::default()), trust);
    api.inject_into_runtime(&runtime, &ws_dir.to_string_lossy()).expect("inject api");

    let in_json = serde_json::to_string(&inside_path.to_string_lossy()).unwrap();
    let out_json = serde_json::to_string(&outside_path.to_string_lossy()).unwrap();

    // 1. Inside workspace: read and write succeed
    let write_in_js = format!(
        r#"
        var fs = require('fs');
        fs.writeFileSync({in_json}, 'Hello From QuickJS');
        var content = fs.readFileSync({in_json});
        if (content !== 'Hello From QuickJS') throw new Error("Content mismatch: " + content);
        if (!fs.existsSync({in_json})) throw new Error("existsSync inside workspace failed");
        var stat = fs.statSync({in_json});
        if (!stat.isFile()) throw new Error("stat.isFile() failed");
        "OK"
        "#
    );
    let res = runtime.eval_string(&write_in_js).expect("write inside workspace");
    assert_eq!(res, "OK");

    // 2. Outside workspace in Restricted mode: writing throws SecurityError
    let write_out_js = format!(
        r#"
        var fs = require('fs');
        fs.writeFileSync({out_json}, 'Should Fail');
        "#
    );
    let err = runtime.eval_string(&write_out_js);
    assert!(err.is_err(), "Writing outside workspace in Restricted mode must fail");
    assert!(
        err.unwrap_err().contains("SecurityError"),
        "Error must contain SecurityError"
    );

    let _ = fs::remove_dir_all(test_dir);
}

#[test]
fn test_node_compat_child_process_trust_gating() {
    let runtime = ExtensionRuntime::new().expect("runtime new");
    let trust = Arc::new(TrustManager::new());
    trust.set_state(WorkspaceTrustState::Restricted);

    let api = VscodeApiHost::with_lsp_and_trust(Arc::new(Default::default()), trust.clone());
    api.inject_into_runtime(&runtime, "/tmp").expect("inject api");

    // 1. In Restricted mode: child_process.spawn throws SecurityError
    let spawn_js = "require('child_process').spawn('echo', ['hi'])";
    let res_restricted = runtime.eval_string(spawn_js);
    assert!(
        res_restricted.is_err(),
        "spawn must fail in Restricted workspace"
    );
    assert!(
        res_restricted.unwrap_err().contains("SecurityError"),
        "spawn error must mention SecurityError"
    );

    // 2. In Trusted mode: child_process.spawn succeeds
    trust.set_state(WorkspaceTrustState::Trusted);
    let js_trusted = r#"
        var cp = require('child_process').spawn('echo', ['hi']);
        if (typeof cp.pid !== 'number' || cp.pid <= 0) {
            throw new Error("Invalid pid: " + cp.pid);
        }
        "OK"
    "#;
    let res_trusted = runtime.eval_string(js_trusted).expect("spawn in Trusted mode");
    assert_eq!(res_trusted, "OK");
}
