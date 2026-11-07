#![cfg(not(target_arch = "wasm32"))]

use std::fs;
use std::path::{Path, PathBuf};
use krypton_core_rs::ext_host::trust::{
    Capability, TrustManager, WorkspaceTrustState, normalize_path,
};

fn create_temp_dir(name: &str) -> PathBuf {
    let mut dir = std::env::temp_dir();
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    dir.push(format!("krypton_test_trust_{}_{}", name, nonce));
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn test_trust_state_transitions() {
    let trust = TrustManager::new();
    assert_eq!(trust.get_state(), WorkspaceTrustState::Restricted);
    assert!(!trust.is_trusted());

    trust.set_state(WorkspaceTrustState::Trusted);
    assert_eq!(trust.get_state(), WorkspaceTrustState::Trusted);
    assert!(trust.is_trusted());

    trust.set_state(WorkspaceTrustState::Untrusted);
    assert_eq!(trust.get_state(), WorkspaceTrustState::Untrusted);
    assert!(!trust.is_trusted());
}

#[test]
fn test_capability_gating() {
    let trust = TrustManager::new();

    // Restricted mode: FsWrite permitted; others throw SecurityError
    assert!(trust.check_capability(Capability::FsWrite).is_ok());

    for cap in [
        Capability::SpawnProcess,
        Capability::FsOutsideWorkspace,
        Capability::Network,
        Capability::TerminalWrite,
    ] {
        let res = trust.check_capability(cap);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("SecurityError"));
    }

    // Trusted mode: all capabilities permitted
    trust.set_state(WorkspaceTrustState::Trusted);
    for cap in [
        Capability::FsWrite,
        Capability::SpawnProcess,
        Capability::FsOutsideWorkspace,
        Capability::Network,
        Capability::TerminalWrite,
    ] {
        assert!(trust.check_capability(cap).is_ok());
    }

    // Untrusted mode: all capabilities blocked
    trust.set_state(WorkspaceTrustState::Untrusted);
    for cap in [
        Capability::FsWrite,
        Capability::SpawnProcess,
        Capability::FsOutsideWorkspace,
        Capability::Network,
        Capability::TerminalWrite,
    ] {
        let res = trust.check_capability(cap);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("SecurityError"));
    }
}

#[test]
fn test_fs_access_boundaries() {
    let test_dir = create_temp_dir("fs_access");
    let ws_root = test_dir.join("workspace");
    fs::create_dir_all(&ws_root).unwrap();

    let inside_file = ws_root.join("src").join("main.rs");
    let outside_file = test_dir.join("outside.txt");

    let trust = TrustManager::new();
    trust.set_workspace_root(&ws_root);

    // 1. Restricted mode
    assert!(trust.check_fs_access(&inside_file, false).is_ok());
    assert!(trust.check_fs_access(&inside_file, true).is_ok());

    let err_read = trust.check_fs_access(&outside_file, false);
    assert!(err_read.is_err());
    assert!(err_read.unwrap_err().contains("SecurityError"));

    let err_write = trust.check_fs_access(&outside_file, true);
    assert!(err_write.is_err());
    assert!(err_write.unwrap_err().contains("SecurityError"));

    // Traversal attack escaping workspace
    let escape_path = ws_root.join("..").join("outside.txt");
    let err_escape = trust.check_fs_access(&escape_path, false);
    assert!(err_escape.is_err());
    assert!(err_escape.unwrap_err().contains("SecurityError"));

    // 2. Untrusted mode
    trust.set_state(WorkspaceTrustState::Untrusted);
    let untrusted_write = trust.check_fs_access(&inside_file, true);
    assert!(untrusted_write.is_err());
    assert!(untrusted_write.unwrap_err().contains("SecurityError"));

    assert!(trust.check_fs_access(&inside_file, false).is_ok());

    let untrusted_read_out = trust.check_fs_access(&outside_file, false);
    assert!(untrusted_read_out.is_err());
    assert!(untrusted_read_out.unwrap_err().contains("SecurityError"));

    // 3. Trusted mode
    trust.set_state(WorkspaceTrustState::Trusted);
    assert!(trust.check_fs_access(&inside_file, false).is_ok());
    assert!(trust.check_fs_access(&inside_file, true).is_ok());
    assert!(trust.check_fs_access(&outside_file, false).is_ok());
    assert!(trust.check_fs_access(&outside_file, true).is_ok());

    let _ = fs::remove_dir_all(test_dir);
}

#[test]
fn test_normalize_path() {
    assert_eq!(
        normalize_path(Path::new("/a/b/../c")),
        PathBuf::from("/a/c")
    );
    assert_eq!(
        normalize_path(Path::new("/a/./b/../../c")),
        PathBuf::from("/c")
    );
    assert_eq!(
        normalize_path(Path::new("foo/bar/../baz")),
        PathBuf::from("foo/baz")
    );
}
