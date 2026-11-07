use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, RwLock};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceTrustState {
    Trusted,
    Restricted,
    Untrusted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Capability {
    SpawnProcess,
    FsOutsideWorkspace,
    FsWrite,
    Network,
    TerminalWrite,
}

/// Lexically normalizes a path without requiring the path to exist on disk.
/// Resolves '.' and '..' components cleanly while respecting root boundaries.
pub fn normalize_path(path: &Path) -> PathBuf {
    let mut components = Vec::new();
    for comp in path.components() {
        match comp {
            Component::CurDir => {}
            Component::ParentDir => {
                match components.last() {
                    Some(Component::Normal(_)) => {
                        components.pop();
                    }
                    Some(Component::RootDir) | Some(Component::Prefix(_)) => {
                        // At root or prefix, cannot navigate above root
                    }
                    _ => {
                        components.push(comp);
                    }
                }
            }
            _ => components.push(comp),
        }
    }
    components.into_iter().collect()
}

#[derive(Debug, Clone)]
pub struct TrustManager {
    state: Arc<RwLock<WorkspaceTrustState>>,
    workspace_root: Arc<RwLock<Option<PathBuf>>>,
}

impl Default for TrustManager {
    fn default() -> Self {
        Self::new()
    }
}

impl TrustManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(RwLock::new(WorkspaceTrustState::Restricted)),
            workspace_root: Arc::new(RwLock::new(None)),
        }
    }

    pub fn with_state(state: WorkspaceTrustState) -> Self {
        Self {
            state: Arc::new(RwLock::new(state)),
            workspace_root: Arc::new(RwLock::new(None)),
        }
    }

    pub fn set_state(&self, state: WorkspaceTrustState) {
        if let Ok(mut lock) = self.state.write() {
            *lock = state;
        }
    }

    pub fn get_state(&self) -> WorkspaceTrustState {
        self.state
            .read()
            .map(|s| *s)
            .unwrap_or(WorkspaceTrustState::Restricted)
    }

    pub fn set_workspace_root<P: Into<PathBuf>>(&self, root: P) {
        if let Ok(mut lock) = self.workspace_root.write() {
            *lock = Some(root.into());
        }
    }

    pub fn get_workspace_root(&self) -> Option<PathBuf> {
        self.workspace_root.read().ok().and_then(|r| r.clone())
    }

    pub fn is_trusted(&self) -> bool {
        self.get_state() == WorkspaceTrustState::Trusted
    }

    pub fn check_capability(&self, cap: Capability) -> Result<(), String> {
        let state = self.get_state();
        match state {
            WorkspaceTrustState::Trusted => Ok(()),
            WorkspaceTrustState::Restricted => match cap {
                Capability::FsWrite => Ok(()),
                Capability::SpawnProcess
                | Capability::FsOutsideWorkspace
                | Capability::Network
                | Capability::TerminalWrite => Err(format!(
                    "SecurityError: Capability '{cap:?}' is not permitted in Restricted workspace"
                )),
            },
            WorkspaceTrustState::Untrusted => Err(format!(
                "SecurityError: Capability '{cap:?}' is not permitted in Untrusted workspace"
            )),
        }
    }

    pub fn check_fs_access(&self, target_path: &Path, is_write: bool) -> Result<(), String> {
        let state = self.get_state();
        match state {
            WorkspaceTrustState::Trusted => Ok(()),
            WorkspaceTrustState::Untrusted => {
                if is_write {
                    return Err(
                        "SecurityError: File write access is forbidden in Untrusted workspace"
                            .into(),
                    );
                }
                let root_opt = self.get_workspace_root();
                if let Some(root) = root_opt {
                    let norm_root = normalize_path(&root);
                    let resolved = if target_path.is_relative() {
                        norm_root.join(target_path)
                    } else {
                        target_path.to_path_buf()
                    };
                    let norm_target = normalize_path(&resolved);
                    if !norm_target.starts_with(&norm_root) {
                        return Err("SecurityError: Filesystem access outside workspace is forbidden in Untrusted workspace".into());
                    }
                } else if target_path.is_absolute() {
                    if let Ok(cwd) = std::env::current_dir() {
                        let norm_cwd = normalize_path(&cwd);
                        let norm_target = normalize_path(target_path);
                        if !norm_target.starts_with(&norm_cwd) {
                            return Err("SecurityError: Filesystem access outside workspace is forbidden in Untrusted workspace".into());
                        }
                    }
                }
                Ok(())
            }
            WorkspaceTrustState::Restricted => {
                let root_opt = self.get_workspace_root();
                if let Some(root) = root_opt {
                    let norm_root = normalize_path(&root);
                    let resolved = if target_path.is_relative() {
                        norm_root.join(target_path)
                    } else {
                        target_path.to_path_buf()
                    };
                    let norm_target = normalize_path(&resolved);
                    if !norm_target.starts_with(&norm_root) {
                        return Err(format!(
                            "SecurityError: Path '{}' is outside workspace root '{}' in Restricted workspace",
                            target_path.display(),
                            root.display()
                        ));
                    }
                } else {
                    if target_path.is_absolute() {
                        if let Ok(cwd) = std::env::current_dir() {
                            let norm_cwd = normalize_path(&cwd);
                            let norm_target = normalize_path(target_path);
                            if !norm_target.starts_with(&norm_cwd) {
                                return Err(format!(
                                    "SecurityError: Path '{}' is outside workspace root in Restricted workspace",
                                    target_path.display()
                                ));
                            }
                        }
                    } else {
                        let norm = normalize_path(target_path);
                        if norm.starts_with("..") {
                            return Err(format!(
                                "SecurityError: Relative path '{}' escapes working directory in Restricted workspace",
                                target_path.display()
                            ));
                        }
                    }
                }
                Ok(())
            }
        }
    }
}
