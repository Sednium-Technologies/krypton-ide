#![cfg(not(target_arch = "wasm32"))]

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use krypton_core_rs::ext_host::{
    install_vsix, ExtensionLifecycleManager, ExtensionManifest, ExtensionState, InstalledExtension,
    TrustManager, WorkspaceTrustState,
};

static TEST_COUNTER: AtomicUsize = AtomicUsize::new(0);

struct HardeningEnv {
    root: PathBuf,
}

impl HardeningEnv {
    fn new(test_name: &str) -> Self {
        let count = TEST_COUNTER.fetch_add(1, Ordering::SeqCst);
        let pid = std::process::id();
        let path = std::env::temp_dir().join(format!("krypton_harden_{}_{}_{}", test_name, pid, count));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        HardeningEnv { root: path }
    }

    fn extensions_dir(&self) -> PathBuf {
        self.root.join("extensions")
    }

    fn vsix_path(&self, name: &str) -> PathBuf {
        self.root.join(format!("{}.vsix", name))
    }
}

impl Drop for HardeningEnv {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn create_zip_archive(vsix_path: &Path, files: &[(&str, &[u8])]) {
    if let Some(parent) = vsix_path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    let file = File::create(vsix_path).unwrap();
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    for (name, content) in files {
        zip.start_file(*name, options).unwrap();
        zip.write_all(content).unwrap();
    }

    zip.finish().unwrap();
}

#[test]
fn test_hardening_corrupted_zip_archive() {
    let env = HardeningEnv::new("corrupt_zip");
    let corrupt_vsix = env.vsix_path("truncated");

    // 1. Truncated arbitrary bytes (not a valid zip)
    fs::write(&corrupt_vsix, b"PK\x03\x04corrupted_payload_without_central_directory").unwrap();
    let res = install_vsix(&corrupt_vsix, &env.extensions_dir());
    assert!(res.is_err(), "Installing corrupted zip must fail");
    let err = res.unwrap_err();
    assert!(err.contains("Failed to open VSIX") || err.contains("archive") || err.contains("zip"));

    // 2. Empty file
    let empty_vsix = env.vsix_path("empty");
    fs::write(&empty_vsix, b"").unwrap();
    let res_empty = install_vsix(&empty_vsix, &env.extensions_dir());
    assert!(res_empty.is_err(), "Installing empty file must fail");
}

#[test]
fn test_hardening_missing_manifest_in_vsix() {
    let env = HardeningEnv::new("missing_manifest");
    let vsix = env.vsix_path("no_pkg_json");

    create_zip_archive(&vsix, &[
        ("[Content_Types].xml", b"<Types/>"),
        ("extension/readme.txt", b"Hello without package.json"),
    ]);

    let res = install_vsix(&vsix, &env.extensions_dir());
    assert!(res.is_err(), "VSIX without extension/package.json must fail");
    let err = res.unwrap_err();
    assert!(err.contains("package.json"), "Error must mention missing package.json, got: {err}");
}

#[test]
fn test_hardening_malformed_manifest_json() {
    let env = HardeningEnv::new("malformed_json");
    let vsix = env.vsix_path("bad_json");

    create_zip_archive(&vsix, &[
        ("extension/package.json", b"{ \"name\": \"broken\", \"version\": "),
    ]);

    let res = install_vsix(&vsix, &env.extensions_dir());
    assert!(res.is_err(), "VSIX with unparseable package.json must fail");
    let err = res.unwrap_err();
    assert!(err.contains("Failed to parse") || err.contains("manifest"), "Error must mention parse failure, got: {err}");
}

#[test]
fn test_hardening_missing_mandatory_identity_fields() {
    let env = HardeningEnv::new("missing_id");
    let vsix = env.vsix_path("no_publisher");

    create_zip_archive(&vsix, &[
        ("extension/package.json", b"{ \"name\": \"valid-name\", \"version\": \"1.0.0\" }"),
    ]);

    let res = install_vsix(&vsix, &env.extensions_dir());
    assert!(res.is_err(), "VSIX without publisher must fail");
}

#[test]
fn test_hardening_zip_slip_traversal_attack() {
    let env = HardeningEnv::new("zip_slip");
    let vsix = env.vsix_path("traversal");

    create_zip_archive(&vsix, &[
        ("extension/package.json", b"{ \"name\": \"evil\", \"publisher\": \"hacker\", \"version\": \"1.0.0\" }"),
        ("extension/../../../../tmp/evil_exploit.txt", b"malicious content"),
    ]);

    let res = install_vsix(&vsix, &env.extensions_dir());
    assert!(res.is_err(), "VSIX with path traversal must be rejected");
    let err = res.unwrap_err();
    assert!(err.to_lowercase().contains("zip-slip") || err.to_lowercase().contains("invalid path"), "Error: {err}");

    // Ensure escaped file was not written to disk
    assert!(!Path::new("/tmp/evil_exploit.txt").exists());
}

#[test]
fn test_hardening_quickjs_syntax_error_containment() {
    let env = HardeningEnv::new("syntax_err");
    let ext_dir = env.root.join("broken_syntax_ext");
    let js_dir = ext_dir.join("extension");
    fs::create_dir_all(&js_dir).unwrap();

    let manifest_json = r#"{
        "name": "syntax-broken",
        "publisher": "krypton",
        "version": "1.0.0",
        "main": "extension/main.js"
    }"#;
    let manifest: ExtensionManifest = serde_json::from_str(manifest_json).unwrap();

    // Intentional JavaScript syntax error
    fs::write(js_dir.join("main.js"), b"const a = ;").unwrap();

    let installed_ext = InstalledExtension::new(ext_dir, manifest);
    let manager = ExtensionLifecycleManager::new(env.root.join("storage"), env.root.join("logs"));
    manager.register_extension(installed_ext);

    let act_res = manager.activate_extension("krypton.syntax-broken");
    assert!(act_res.is_err(), "Activation of script with syntax error must fail gracefully");
    let state = manager.get_extension_state("krypton.syntax-broken");
    match state {
        ExtensionState::Failed(msg) => {
            assert!(msg.contains("syntax") || msg.contains("eval") || msg.contains("error") || msg.contains("Failed"), "Failed state message: {msg}");
        }
        other => panic!("Expected ExtensionState::Failed, got {other:?}"),
    }
}

#[test]
fn test_hardening_quickjs_runtime_error_containment() {
    let env = HardeningEnv::new("runtime_err");
    let ext_dir = env.root.join("runtime_broken_ext");
    let js_dir = ext_dir.join("extension");
    fs::create_dir_all(&js_dir).unwrap();

    let manifest_json = r#"{
        "name": "runtime-broken",
        "publisher": "krypton",
        "version": "1.0.0",
        "main": "extension/main.js"
    }"#;
    let manifest: ExtensionManifest = serde_json::from_str(manifest_json).unwrap();

    // Valid syntax, but throws unhandled exception on activate()
    let main_js = r#"
        function activate() {
            throw new Error("Explicit activation crash");
        }
        module.exports = { activate };
    "#;
    fs::write(js_dir.join("main.js"), main_js).unwrap();

    let installed_ext = InstalledExtension::new(ext_dir, manifest);
    let manager = ExtensionLifecycleManager::new(env.root.join("storage"), env.root.join("logs"));
    manager.register_extension(installed_ext);

    let act_res = manager.activate_extension("krypton.runtime-broken");
    assert!(act_res.is_err(), "Activation that throws must return Err");
    let state = manager.get_extension_state("krypton.runtime-broken");
    assert!(matches!(state, ExtensionState::Failed(_)));
}

#[test]
fn test_hardening_rapid_activation_deactivation_cycles() {
    let env = HardeningEnv::new("rapid_cycles");
    let ext_dir = env.root.join("sample_cycler");
    let js_dir = ext_dir.join("extension");
    fs::create_dir_all(&js_dir).unwrap();

    let manifest_json = r#"{
        "name": "cycler",
        "publisher": "krypton",
        "version": "1.0.0",
        "main": "extension/main.js"
    }"#;
    let manifest: ExtensionManifest = serde_json::from_str(manifest_json).unwrap();

    let main_js = r#"
        const vscode = require('vscode');
        let counter = 0;
        function activate(context) {
            const d = vscode.commands.registerCommand('cycle.ping', () => ++counter);
            context.subscriptions.push(d);
        }
        function deactivate() {
            counter = 0;
        }
        module.exports = { activate, deactivate };
    "#;
    fs::write(js_dir.join("main.js"), main_js).unwrap();

    let installed_ext = InstalledExtension::new(ext_dir, manifest);
    let manager = ExtensionLifecycleManager::new(env.root.join("storage"), env.root.join("logs"));
    manager.register_extension(installed_ext);

    // Run 50 rapid activation/deactivation cycles
    for i in 0..50 {
        let act = manager.activate_extension("krypton.cycler");
        assert!(act.is_ok(), "Cycle {i} activation failed: {:?}", act.err());
        assert_eq!(manager.get_extension_state("krypton.cycler"), ExtensionState::Active);

        let exec = manager.execute_command("cycle.ping", "[]");
        assert!(exec.is_ok(), "Cycle {i} command execution failed");

        let deact = manager.deactivate_extension("krypton.cycler");
        assert!(deact.is_ok(), "Cycle {i} deactivation failed: {:?}", deact.err());
        assert_eq!(manager.get_extension_state("krypton.cycler"), ExtensionState::Deactivated);
    }
}

#[test]
fn test_hardening_restricted_fs_traversal_boundaries() {
    let env = HardeningEnv::new("fs_boundaries");
    let ws_root = env.root.join("workspace");
    fs::create_dir_all(&ws_root).unwrap();

    let trust = TrustManager::new();
    trust.set_workspace_root(&ws_root);
    trust.set_state(WorkspaceTrustState::Restricted);

    // Deep traversal escaping root
    let attack_1 = ws_root.join("a").join("b").join("..").join("..").join("..").join("etc").join("passwd");
    assert!(trust.check_fs_access(&attack_1, false).is_err());
    assert!(trust.check_fs_access(&attack_1, true).is_err());

    // Absolute path on different root
    let attack_2 = PathBuf::from("/etc/hosts");
    assert!(trust.check_fs_access(&attack_2, false).is_err());
    assert!(trust.check_fs_access(&attack_2, true).is_err());

    // Clean internal path succeeds
    let valid_path = ws_root.join("src").join("utils").join("..").join("app.ts");
    assert!(trust.check_fs_access(&valid_path, false).is_ok());
    assert!(trust.check_fs_access(&valid_path, true).is_ok());
}
