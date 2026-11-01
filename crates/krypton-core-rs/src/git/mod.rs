use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileGitStatus {
    Unmodified,
    Modified,
    Added,
    Deleted,
    Untracked,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct GitStatusMatrixEntry {
    pub filepath: String,
    pub head_status: u32,
    pub workdir_status: u32,
    pub stage_status: u32,
    pub status_label: FileGitStatus,
}

pub struct FastGitOps;

impl FastGitOps {
    /// Computes rapid tree diff between head tree hashmap and current worktree hashmap.
    ///
    /// Matches isomorphic-git status matrix semantics at native speed:
    /// [filepath, headStatus, workdirStatus, stageStatus]
    pub fn compute_status_matrix(
        head_tree: &HashMap<String, String>,
        worktree: &HashMap<String, String>,
        staged_tree: &HashMap<String, String>,
    ) -> Vec<GitStatusMatrixEntry> {
        let mut entries = Vec::new();
        let mut all_paths: Vec<&String> = head_tree
            .keys()
            .chain(worktree.keys())
            .chain(staged_tree.keys())
            .collect();
        all_paths.sort();
        all_paths.dedup();

        for path in all_paths {
            let in_head = head_tree.contains_key(path);
            let in_work = worktree.contains_key(path);
            let in_stage = staged_tree.contains_key(path);

            let head_hash = head_tree.get(path);
            let work_hash = worktree.get(path);
            let stage_hash = staged_tree.get(path);

            let head_val = if in_head { 1 } else { 0 };
            let work_val = if !in_work {
                0
            } else if head_hash == work_hash {
                1
            } else {
                2
            };
            let stage_val = if !in_stage {
                0
            } else if head_hash == stage_hash {
                1
            } else if work_hash == stage_hash {
                2
            } else {
                3
            };

            let status_label = if in_head && !in_work {
                FileGitStatus::Deleted
            } else if !in_head && in_work {
                if in_stage {
                    FileGitStatus::Added
                } else {
                    FileGitStatus::Untracked
                }
            } else if head_hash != work_hash {
                FileGitStatus::Modified
            } else {
                FileGitStatus::Unmodified
            };

            entries.push(GitStatusMatrixEntry {
                filepath: path.clone(),
                head_status: head_val,
                workdir_status: work_val,
                stage_status: stage_val,
                status_label,
            });
        }

        entries
    }

    /// Fast SHA-256 or Git blob SHA-1 hash for delta detection.
    pub fn compute_blob_hash(content: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(content);
        format!("{:x}", hasher.finalize())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_git_status_matrix() {
        let mut head = HashMap::new();
        head.insert("src/lib.rs".to_string(), "h1".to_string());
        head.insert("README.md".to_string(), "h2".to_string());

        let mut work = HashMap::new();
        work.insert("src/lib.rs".to_string(), "h1_mod".to_string()); // Modified
        work.insert("new_file.ts".to_string(), "h3".to_string());    // Untracked/Added

        let mut staged = HashMap::new();
        staged.insert("src/lib.rs".to_string(), "h1".to_string());

        let matrix = FastGitOps::compute_status_matrix(&head, &work, &staged);
        assert_eq!(matrix.len(), 3);

        let lib_entry = matrix.iter().find(|e| e.filepath == "src/lib.rs").unwrap();
        assert_eq!(lib_entry.status_label, FileGitStatus::Modified);

        let readme_entry = matrix.iter().find(|e| e.filepath == "README.md").unwrap();
        assert_eq!(readme_entry.status_label, FileGitStatus::Deleted);
    }
}
