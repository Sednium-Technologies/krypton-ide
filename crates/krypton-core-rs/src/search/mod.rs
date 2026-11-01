use crate::cancel::CancellationToken;
use regex::RegexBuilder;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct SearchFileEntry {
    pub path: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct SearchMatch {
    pub path: String,
    pub line_number: usize,
    pub line_content: String,
    pub match_start: usize,
    pub match_end: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct SearchStats {
    pub files_scanned: usize,
    pub lines_scanned: usize,
    pub matches_found: usize,
    pub was_cancelled: bool,
}

#[derive(Debug, Clone)]
pub struct SearchOptions {
    pub query: String,
    pub is_regex: bool,
    pub match_case: bool,
    pub max_matches: usize,
}

pub struct SearchEngine;

impl SearchEngine {
    /// Searches in-memory file buffers with cooperative cancellation and streaming match callback.
    ///
    /// The callback `on_match` receives each `SearchMatch`. If it returns `false`, the search is
    /// stopped early without error.
    pub fn search_buffers<F>(
        files: &[SearchFileEntry],
        options: &SearchOptions,
        cancel_token: Option<&CancellationToken>,
        mut on_match: F,
    ) -> Result<SearchStats, String>
    where
        F: FnMut(SearchMatch) -> bool,
    {
        let mut stats = SearchStats::default();

        if options.query.is_empty() {
            return Ok(stats);
        }

        let pattern = if options.is_regex {
            options.query.clone()
        } else {
            regex::escape(&options.query)
        };

        let re = RegexBuilder::new(&pattern)
            .case_insensitive(!options.match_case)
            .build()
            .map_err(|e| format!("Invalid regex pattern: {e}"))?;

        for file in files {
            if let Some(token) = cancel_token {
                if token.is_cancelled() {
                    stats.was_cancelled = true;
                    return Ok(stats);
                }
            }

            stats.files_scanned += 1;

            for (line_idx, line) in file.content.lines().enumerate() {
                stats.lines_scanned += 1;

                for mat in re.find_iter(line) {
                    stats.matches_found += 1;

                    let match_item = SearchMatch {
                        path: file.path.clone(),
                        line_number: line_idx + 1,
                        line_content: line.to_string(),
                        match_start: mat.start(),
                        match_end: mat.end(),
                    };

                    let keep_going = on_match(match_item);
                    if !keep_going || stats.matches_found >= options.max_matches {
                        return Ok(stats);
                    }
                }
            }
        }

        Ok(stats)
    }

    #[cfg(not(target_arch = "wasm32"))]
    /// Fast direct filesystem search using memory-mapped files or streaming buffers on native targets.
    pub fn search_disk_directory<F>(
        dir_path: &std::path::Path,
        options: &SearchOptions,
        cancel_token: Option<&CancellationToken>,
        mut on_match: F,
    ) -> Result<SearchStats, String>
    where
        F: FnMut(SearchMatch) -> bool,
    {
        use std::fs;
        use std::io::{BufRead, BufReader};

        let mut stats = SearchStats::default();
        if options.query.is_empty() {
            return Ok(stats);
        }

        let pattern = if options.is_regex {
            options.query.clone()
        } else {
            regex::escape(&options.query)
        };

        let re = RegexBuilder::new(&pattern)
            .case_insensitive(!options.match_case)
            .build()
            .map_err(|e| format!("Invalid regex pattern: {e}"))?;

        let mut stack = vec![dir_path.to_path_buf()];

        while let Some(current_dir) = stack.pop() {
            if let Some(token) = cancel_token {
                if token.is_cancelled() {
                    stats.was_cancelled = true;
                    return Ok(stats);
                }
            }

            let entries = match fs::read_dir(&current_dir) {
                Ok(entries) => entries,
                Err(_) => continue,
            };

            for entry in entries.flatten() {
                let path = entry.path();
                let file_name = entry.file_name().to_string_lossy().to_string();

                // Skip common heavy directories and hidden VCS directories
                if file_name == ".git" || file_name == "node_modules" || file_name == "target" || file_name == "dist" {
                    continue;
                }

                if path.is_dir() {
                    stack.push(path);
                } else if path.is_file() {
                    stats.files_scanned += 1;
                    let display_path = path.to_string_lossy().to_string();

                    // Read file line-by-line
                    if let Ok(file) = fs::File::open(&path) {
                        let reader = BufReader::new(file);
                        for (line_idx, line_res) in reader.lines().enumerate() {
                            let line = match line_res {
                                Ok(l) => l,
                                Err(_) => break, // binary file or encoding error, skip rest of file
                            };

                            stats.lines_scanned += 1;

                            for mat in re.find_iter(&line) {
                                stats.matches_found += 1;
                                let match_item = SearchMatch {
                                    path: display_path.clone(),
                                    line_number: line_idx + 1,
                                    line_content: line.clone(),
                                    match_start: mat.start(),
                                    match_end: mat.end(),
                                };

                                let keep_going = on_match(match_item);
                                if !keep_going || stats.matches_found >= options.max_matches {
                                    return Ok(stats);
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(stats)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_search_streaming_and_cancellation() {
        let files = vec![
            SearchFileEntry {
                path: "src/main.rs".to_string(),
                content: "fn main() {\n    println!(\"Hello Krypton\");\n}\n".to_string(),
            },
            SearchFileEntry {
                path: "src/lib.rs".to_string(),
                content: "pub const APP: &str = \"Krypton\";\n".to_string(),
            },
        ];

        let options = SearchOptions {
            query: "krypton".to_string(),
            is_regex: false,
            match_case: false,
            max_matches: 10,
        };

        let mut matches = Vec::new();
        let stats = SearchEngine::search_buffers(&files, &options, None, |m| {
            matches.push(m);
            true
        })
        .unwrap();

        assert_eq!(stats.matches_found, 2);
        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].path, "src/main.rs");
        assert_eq!(matches[0].line_number, 2);
        assert_eq!(matches[1].path, "src/lib.rs");
        assert_eq!(matches[1].line_number, 1);

        // Test cancellation
        let cancel = CancellationToken::new(99);
        cancel.cancel();

        let mut cancelled_matches = Vec::new();
        let stats_cancelled = SearchEngine::search_buffers(&files, &options, Some(&cancel), |m| {
            cancelled_matches.push(m);
            true
        })
        .unwrap();

        assert!(stats_cancelled.was_cancelled);
        assert_eq!(cancelled_matches.len(), 0);
    }
}
