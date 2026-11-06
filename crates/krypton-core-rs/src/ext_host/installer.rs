use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use serde::{Deserialize, Serialize};

use crate::ext_host::manifest::ExtensionManifest;

static TEMP_COUNTER: AtomicUsize = AtomicUsize::new(0);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InstalledExtension {
    pub id: String,
    pub version: String,
    pub location: PathBuf,
    pub manifest: ExtensionManifest,
}

impl InstalledExtension {
    pub fn new(location: PathBuf, manifest: ExtensionManifest) -> Self {
        Self {
            id: manifest.extension_id(),
            version: manifest.version.clone(),
            location,
            manifest,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionCatalog {
    pub extensions: Vec<InstalledExtension>,
}

impl ExtensionCatalog {
    pub fn new() -> Self {
        Self {
            extensions: Vec::new(),
        }
    }

    pub fn load(catalog_path: &Path) -> Result<Self, String> {
        if !catalog_path.exists() {
            return Ok(Self::default());
        }

        let content = fs::read_to_string(catalog_path)
            .map_err(|e| format!("Failed to read catalog file {}: {}", catalog_path.display(), e))?;

        if content.trim().is_empty() {
            return Ok(Self::default());
        }

        if let Ok(catalog) = serde_json::from_str::<ExtensionCatalog>(&content) {
            return Ok(catalog);
        }

        if let Ok(extensions) = serde_json::from_str::<Vec<InstalledExtension>>(&content) {
            return Ok(ExtensionCatalog { extensions });
        }

        Err(format!(
            "Failed to parse catalog JSON in {}",
            catalog_path.display()
        ))
    }

    pub fn save(&self, catalog_path: &Path) -> Result<(), String> {
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize extension catalog: {}", e))?;
        atomic_write(catalog_path, &json)
    }
}

fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent)
        .map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;

    let count = TEMP_COUNTER.fetch_add(1, Ordering::SeqCst);
    let tmp_path = parent.join(format!(
        ".{}.tmp.{}.{}",
        path.file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("file"),
        std::process::id(),
        count
    ));

    {
        let mut file = fs::File::create(&tmp_path)
            .map_err(|e| format!("Failed to create temporary file {}: {}", tmp_path.display(), e))?;
        file.write_all(content.as_bytes())
            .map_err(|e| format!("Failed to write to temporary file: {}", e))?;
        file.flush()
            .map_err(|e| format!("Failed to flush temporary file: {}", e))?;
    }

    if let Err(_) = fs::rename(&tmp_path, path) {
        let _ = fs::remove_file(path);
        fs::rename(&tmp_path, path).map_err(|e| {
            let _ = fs::remove_file(&tmp_path);
            format!("Failed to rename temporary file to {}: {}", path.display(), e)
        })?;
    }

    Ok(())
}

fn validate_zip_entry_path(name: &str) -> Result<(), String> {
    if name.starts_with('/') || name.starts_with('\\') {
        return Err(format!("Zip-slip detected: entry '{}' has leading slash", name));
    }
    if name.contains("..") {
        return Err(format!("Zip-slip detected: entry '{}' contains '..'", name));
    }
    if name.contains(':') {
        return Err(format!("Zip-slip detected: entry '{}' contains colon", name));
    }
    Ok(())
}

pub fn install_vsix(vsix_path: &Path, extensions_dir: &Path) -> Result<InstalledExtension, String> {
    if !vsix_path.exists() {
        return Err(format!("VSIX file does not exist: {}", vsix_path.display()));
    }

    let file = fs::File::open(vsix_path)
        .map_err(|e| format!("Failed to open VSIX file {}: {}", vsix_path.display(), e))?;

    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Failed to read VSIX archive: {}", e))?;

    // Step 1: Pre-validation of all zip entries for Zip-slip vulnerabilities
    for i in 0..archive.len() {
        let entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to inspect zip entry index {}: {}", i, e))?;
        let entry_name = entry.name();

        validate_zip_entry_path(entry_name)?;

        if entry.enclosed_name().is_none() {
            return Err(format!(
                "Zip-slip detected: entry '{}' attempts directory traversal outside destination",
                entry_name
            ));
        }
    }

    // Step 2: Read and parse extension/package.json
    let mut package_json_str = None;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read zip entry index {}: {}", i, e))?;
        let norm_name = entry.name().replace('\\', "/");
        if norm_name == "extension/package.json" {
            let mut content = String::new();
            entry
                .read_to_string(&mut content)
                .map_err(|e| format!("Failed to read extension/package.json: {}", e))?;
            package_json_str = Some(content);
            break;
        }
    }

    let package_json = package_json_str
        .ok_or_else(|| "Missing required 'extension/package.json' in VSIX archive".to_string())?;

    let manifest = ExtensionManifest::parse(&package_json)
        .map_err(|e| format!("Failed to parse extension manifest: {}", e))?;

    if manifest.publisher.is_empty() || manifest.name.is_empty() || manifest.version.is_empty() {
        return Err("Manifest must contain non-empty publisher, name, and version".to_string());
    }

    let ext_id = manifest.extension_id();
    let folder_name = format!("{}.{}-{}", manifest.publisher, manifest.name, manifest.version);
    let target_dir = extensions_dir.join(&folder_name);

    fs::create_dir_all(extensions_dir)
        .map_err(|e| format!("Failed to create extensions directory {}: {}", extensions_dir.display(), e))?;

    if target_dir.exists() {
        fs::remove_dir_all(&target_dir)
            .map_err(|e| format!("Failed to clean existing directory {}: {}", target_dir.display(), e))?;
    }
    fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create target directory {}: {}", target_dir.display(), e))?;

    // Step 3: Extract files strictly within extension/ directory, stripping 'extension/' prefix
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to extract zip entry {}: {}", i, e))?;

        let raw_name = entry.name().to_string();
        let norm_name = raw_name.replace('\\', "/");

        if !norm_name.starts_with("extension/") {
            // Skip files outside the extension/ directory (e.g., [Content_Types].xml, extension.vsixmanifest)
            continue;
        }

        let relative_path = &norm_name["extension/".len()..];
        if relative_path.is_empty() {
            continue;
        }

        let mut out_path = target_dir.clone();
        for comp in relative_path.split('/') {
            if !comp.is_empty() {
                out_path.push(comp);
            }
        }

        if !out_path.starts_with(&target_dir) {
            return Err(format!(
                "Zip-slip detected: extracted path '{}' escapes target directory",
                out_path.display()
            ));
        }

        if entry.is_dir() || norm_name.ends_with('/') {
            fs::create_dir_all(&out_path)
                .map_err(|e| format!("Failed to create directory {}: {}", out_path.display(), e))?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| {
                    format!("Failed to create parent directory {}: {}", parent.display(), e)
                })?;
            }
            let mut outfile = fs::File::create(&out_path)
                .map_err(|e| format!("Failed to create file {}: {}", out_path.display(), e))?;
            std::io::copy(&mut entry, &mut outfile)
                .map_err(|e| format!("Failed to write file {}: {}", out_path.display(), e))?;

            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Some(mode) = entry.unix_mode() {
                    let _ = fs::set_permissions(&out_path, fs::Permissions::from_mode(mode));
                }
            }
        }
    }

    let installed_ext = InstalledExtension::new(target_dir.clone(), manifest);

    // Step 4: Atomically update or write <extensions_dir>/extensions.json
    let catalog_path = extensions_dir.join("extensions.json");
    let mut catalog = ExtensionCatalog::load(&catalog_path).unwrap_or_default();

    // If an older version of the same extension id exists, remove the old directory and replace its catalog entry.
    let mut to_remove_locations = Vec::new();
    for existing in &catalog.extensions {
        if existing.id == ext_id && existing.location != target_dir && existing.location.exists() {
            to_remove_locations.push(existing.location.clone());
        }
    }

    for old_loc in to_remove_locations {
        let _ = fs::remove_dir_all(&old_loc);
    }

    let mut replaced = false;
    for existing in catalog.extensions.iter_mut() {
        if existing.id == ext_id {
            *existing = installed_ext.clone();
            replaced = true;
            break;
        }
    }

    // Clean up any other duplicates if present
    catalog.extensions.retain(|e| e.id != ext_id || e.location == target_dir);

    if !replaced {
        catalog.extensions.push(installed_ext.clone());
    }

    catalog.save(&catalog_path)?;

    Ok(installed_ext)
}

pub fn list_installed(extensions_dir: &Path) -> Result<Vec<InstalledExtension>, String> {
    let catalog_path = extensions_dir.join("extensions.json");
    if !catalog_path.exists() {
        return Ok(Vec::new());
    }

    let catalog = ExtensionCatalog::load(&catalog_path)?;
    Ok(catalog.extensions)
}

pub fn uninstall_extension(id: &str, extensions_dir: &Path) -> Result<bool, String> {
    let catalog_path = extensions_dir.join("extensions.json");
    if !catalog_path.exists() {
        return Ok(false);
    }

    let mut catalog = ExtensionCatalog::load(&catalog_path)?;
    let mut to_remove_dirs = Vec::new();
    let mut found = false;

    for ext in &catalog.extensions {
        if ext.id == id {
            to_remove_dirs.push(ext.location.clone());
            found = true;
        }
    }

    if !found {
        return Ok(false);
    }

    for dir in to_remove_dirs {
        if dir.exists() {
            fs::remove_dir_all(&dir)
                .map_err(|e| format!("Failed to remove directory {}: {}", dir.display(), e))?;
        }
    }

    catalog.extensions.retain(|e| e.id != id);
    catalog.save(&catalog_path)?;

    Ok(true)
}

pub fn get_installed_manifest(id: &str, extensions_dir: &Path) -> Result<Option<ExtensionManifest>, String> {
    let catalog_path = extensions_dir.join("extensions.json");
    if catalog_path.exists() {
        let catalog = ExtensionCatalog::load(&catalog_path)?;
        if let Some(ext) = catalog.extensions.iter().find(|e| e.id == id) {
            return Ok(Some(ext.manifest.clone()));
        }
    }

    // Fallback: scan disk directories under extensions_dir
    if extensions_dir.exists() {
        if let Ok(entries) = fs::read_dir(extensions_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let pkg_json = path.join("package.json");
                    if pkg_json.is_file() {
                        if let Ok(content) = fs::read_to_string(&pkg_json) {
                            if let Ok(manifest) = ExtensionManifest::parse(&content) {
                                if manifest.extension_id() == id {
                                    return Ok(Some(manifest));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(None)
}
