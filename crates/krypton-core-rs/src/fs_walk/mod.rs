use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct IndexedFile {
    pub path: String,
    pub size_bytes: u64,
    pub is_dir: bool,
}

pub struct FsWalker;

impl FsWalker {
    /// In-memory tree walk filter with gitignore-like patterns.
    pub fn filter_ignored_paths(paths: &[String], ignore_patterns: &[String]) -> Vec<String> {
        let default_ignores = [".git", "node_modules", "target", "dist", ".DS_Store"];

        paths
            .iter()
            .filter(|p| {
                for default_ign in &default_ignores {
                    if p.starts_with(default_ign) || p.contains(&format!("/{default_ign}/")) || p.ends_with(default_ign) {
                        return false;
                    }
                }
                for user_ign in ignore_patterns {
                    if p.contains(user_ign) {
                        return false;
                    }
                }
                true
            })
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_filter_ignored_paths() {
        let paths = vec![
            "src/main.rs".to_string(),
            "node_modules/react/index.js".to_string(),
            ".git/config".to_string(),
            "target/debug/app".to_string(),
            "dist/index.html".to_string(),
        ];

        let filtered = FsWalker::filter_ignored_paths(&paths, &[]);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0], "src/main.rs");
    }
}
