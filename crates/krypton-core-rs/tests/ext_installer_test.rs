use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use krypton_core_rs::ext_host::{
    get_installed_manifest, install_vsix, list_installed, uninstall_extension, ExtensionCatalog,
};

static TEST_COUNTER: AtomicUsize = AtomicUsize::new(0);

struct TestEnv {
    root: PathBuf,
}

impl TestEnv {
    fn new(test_name: &str) -> Self {
        let count = TEST_COUNTER.fetch_add(1, Ordering::SeqCst);
        let pid = std::process::id();
        let path = std::env::temp_dir().join(format!("krypton_test_{}_{}_{}", test_name, pid, count));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        TestEnv { root: path }
    }

    fn extensions_dir(&self) -> PathBuf {
        self.root.join("extensions")
    }

    fn vsix_path(&self, name: &str) -> PathBuf {
        self.root.join(format!("{}.vsix", name))
    }
}

impl Drop for TestEnv {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn create_mock_vsix(vsix_path: &Path, files: &[(&str, &[u8])]) {
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

fn create_extension_vsix(
    vsix_path: &Path,
    publisher: &str,
    name: &str,
    version: &str,
    extra_files: &[(&str, &[u8])],
) {
    let pkg_json = format!(
        r#"{{
            "name": "{}",
            "publisher": "{}",
            "version": "{}",
            "displayName": "Test Extension",
            "description": "Test extension description",
            "main": "./dist/index.js"
        }}"#,
        name, publisher, version
    );

    let mut files: Vec<(&str, &[u8])> = vec![
        ("[Content_Types].xml", b"<?xml version=\"1.0\" encoding=\"utf-8\"?><Types></Types>"),
        ("extension.vsixmanifest", b"<?xml version=\"1.0\" encoding=\"utf-8\"?><PackageManifest></PackageManifest>"),
        ("extension/package.json", pkg_json.as_bytes()),
        ("extension/dist/index.js", b"console.log('hello extension');"),
        ("extension/README.md", b"# Extension Readme"),
    ];

    files.extend_from_slice(extra_files);
    create_mock_vsix(vsix_path, &files);
}

#[test]
fn test_install_valid_vsix() {
    let env = TestEnv::new("install_valid");
    let vsix = env.vsix_path("valid_ext");
    let ext_dir = env.extensions_dir();

    create_extension_vsix(&vsix, "krypton", "core-tools", "1.0.0", &[("extension/extra.txt", b"extra data")]);

    let installed = install_vsix(&vsix, &ext_dir).expect("installation should succeed");

    assert_eq!(installed.id, "krypton.core-tools");
    assert_eq!(installed.version, "1.0.0");
    assert_eq!(installed.location, ext_dir.join("krypton.core-tools-1.0.0"));
    assert_eq!(installed.manifest.name, "core-tools");
    assert_eq!(installed.manifest.publisher, "krypton");

    // Verify unpacked files
    assert!(installed.location.join("package.json").exists());
    assert_eq!(
        fs::read_to_string(installed.location.join("dist/index.js")).unwrap(),
        "console.log('hello extension');"
    );
    assert_eq!(
        fs::read_to_string(installed.location.join("extra.txt")).unwrap(),
        "extra data"
    );

    // Verify non-extension files are NOT extracted
    assert!(!installed.location.join("[Content_Types].xml").exists());
    assert!(!installed.location.join("extension.vsixmanifest").exists());

    // Verify extensions.json catalog
    let catalog_path = ext_dir.join("extensions.json");
    assert!(catalog_path.exists());
    let catalog = ExtensionCatalog::load(&catalog_path).expect("should load catalog");
    assert_eq!(catalog.extensions.len(), 1);
    assert_eq!(catalog.extensions[0].id, "krypton.core-tools");
    assert_eq!(catalog.extensions[0].version, "1.0.0");
    assert_eq!(catalog.extensions[0].location, installed.location);
}

#[test]
fn test_list_installed() {
    let env = TestEnv::new("list_installed");
    let ext_dir = env.extensions_dir();

    // Empty initially
    assert_eq!(list_installed(&ext_dir).unwrap().len(), 0);

    // Install first extension
    let vsix_a = env.vsix_path("ext_a");
    create_extension_vsix(&vsix_a, "author-a", "extension-a", "0.5.0", &[]);
    let inst_a = install_vsix(&vsix_a, &ext_dir).unwrap();

    // Install second extension
    let vsix_b = env.vsix_path("ext_b");
    create_extension_vsix(&vsix_b, "author-b", "extension-b", "1.2.0", &[]);
    let inst_b = install_vsix(&vsix_b, &ext_dir).unwrap();

    let list = list_installed(&ext_dir).unwrap();
    assert_eq!(list.len(), 2);
    assert!(list.iter().any(|e| e.id == "author-a.extension-a" && e.location == inst_a.location));
    assert!(list.iter().any(|e| e.id == "author-b.extension-b" && e.location == inst_b.location));

    // Test get_installed_manifest
    let manifest_a = get_installed_manifest("author-a.extension-a", &ext_dir)
        .unwrap()
        .expect("manifest should exist");
    assert_eq!(manifest_a.name, "extension-a");
    assert_eq!(manifest_a.version, "0.5.0");

    assert!(get_installed_manifest("nonexistent.ext", &ext_dir).unwrap().is_none());
}

#[test]
fn test_upgrade_extension() {
    let env = TestEnv::new("upgrade_extension");
    let ext_dir = env.extensions_dir();

    // Install initial version 1.0.0
    let vsix_v1 = env.vsix_path("ext_v1");
    create_extension_vsix(&vsix_v1, "krypton", "rust-tools", "1.0.0", &[("extension/v1.txt", b"v1")]);
    let inst_v1 = install_vsix(&vsix_v1, &ext_dir).unwrap();
    assert!(inst_v1.location.exists());
    assert!(inst_v1.location.join("v1.txt").exists());

    // Install upgraded version 2.0.0
    let vsix_v2 = env.vsix_path("ext_v2");
    create_extension_vsix(&vsix_v2, "krypton", "rust-tools", "2.0.0", &[("extension/v2.txt", b"v2")]);
    let inst_v2 = install_vsix(&vsix_v2, &ext_dir).unwrap();

    // Old version directory removed, new version directory exists
    assert!(!inst_v1.location.exists(), "Old directory must be removed on upgrade");
    assert!(inst_v2.location.exists(), "New directory must exist");
    assert!(inst_v2.location.join("v2.txt").exists());

    // Catalog must contain replaced entry
    let list = list_installed(&ext_dir).unwrap();
    assert_eq!(list.len(), 1, "Catalog should have exactly 1 entry after upgrade");
    assert_eq!(list[0].id, "krypton.rust-tools");
    assert_eq!(list[0].version, "2.0.0");
    assert_eq!(list[0].location, inst_v2.location);

    let manifest = get_installed_manifest("krypton.rust-tools", &ext_dir).unwrap().unwrap();
    assert_eq!(manifest.version, "2.0.0");
}

#[test]
fn test_uninstall_extension() {
    let env = TestEnv::new("uninstall_extension");
    let ext_dir = env.extensions_dir();

    let vsix = env.vsix_path("to_uninstall");
    create_extension_vsix(&vsix, "vendor", "test-plugin", "1.0.0", &[]);
    let inst = install_vsix(&vsix, &ext_dir).unwrap();

    assert!(inst.location.exists());
    assert_eq!(list_installed(&ext_dir).unwrap().len(), 1);

    // Uninstall
    let result = uninstall_extension("vendor.test-plugin", &ext_dir).unwrap();
    assert!(result, "Uninstall should return true for existing extension");

    // Verify directory is deleted
    assert!(!inst.location.exists(), "Extension directory should be removed");

    // Verify catalog is empty
    assert_eq!(list_installed(&ext_dir).unwrap().len(), 0);
    assert!(get_installed_manifest("vendor.test-plugin", &ext_dir).unwrap().is_none());

    // Uninstall again should return false
    let result_again = uninstall_extension("vendor.test-plugin", &ext_dir).unwrap();
    assert!(!result_again, "Uninstall should return false for already uninstalled extension");
}

#[test]
fn test_zip_slip_rejection() {
    let env = TestEnv::new("zip_slip_rejection");
    let ext_dir = env.extensions_dir();

    let evil_target_file = env.root.join("evil.txt");
    assert!(!evil_target_file.exists());

    let pkg_json = r#"{"name": "evil-ext", "publisher": "bad-actor", "version": "0.0.1"}"#;

    // Test entry with ..
    let evil_vsix1 = env.vsix_path("evil1");
    create_mock_vsix(&evil_vsix1, &[
        ("extension/package.json", pkg_json.as_bytes()),
        ("../evil.txt", b"PWNED"),
    ]);

    let res1 = install_vsix(&evil_vsix1, &ext_dir);
    assert!(res1.is_err(), "Zip entry with '../evil.txt' must fail installation");
    let err_msg = res1.unwrap_err();
    assert!(
        err_msg.contains("Zip-slip") || err_msg.contains(".."),
        "Error message should mention zip-slip: {}",
        err_msg
    );
    assert!(!evil_target_file.exists(), "File outside target directory must never be written");

    // Test entry with nested traversal
    let evil_vsix2 = env.vsix_path("evil2");
    create_mock_vsix(&evil_vsix2, &[
        ("extension/package.json", pkg_json.as_bytes()),
        ("extension/../../evil2.txt", b"PWNED2"),
    ]);
    let res2 = install_vsix(&evil_vsix2, &ext_dir);
    assert!(res2.is_err(), "Zip entry with 'extension/../../evil2.txt' must fail");
    assert!(!env.root.join("evil2.txt").exists());

    // Test entry with leading slash
    let evil_vsix3 = env.vsix_path("evil3");
    create_mock_vsix(&evil_vsix3, &[
        ("extension/package.json", pkg_json.as_bytes()),
        ("/evil3.txt", b"PWNED3"),
    ]);
    let res3 = install_vsix(&evil_vsix3, &ext_dir);
    assert!(res3.is_err(), "Zip entry with leading slash must fail");

    // Test entry with Windows drive colon
    let evil_vsix4 = env.vsix_path("evil4");
    create_mock_vsix(&evil_vsix4, &[
        ("extension/package.json", pkg_json.as_bytes()),
        ("C:evil4.txt", b"PWNED4"),
    ]);
    let res4 = install_vsix(&evil_vsix4, &ext_dir);
    assert!(res4.is_err(), "Zip entry with drive colon must fail");
}
