use wasm_bindgen::prelude::*;
use regex::RegexBuilder;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

pub mod aif;
pub mod cancel;
pub mod diff;
pub mod fs_walk;
pub mod git;
pub mod hardware_topology;
pub mod jni_bridge;
pub mod search;
pub mod zip;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SearchFile {
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

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct DiffChange {
    pub change_type: String, // "insert", "delete", "equal"
    pub value: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct TreeDelta {
    pub created: Vec<String>,
    pub modified: Vec<String>,
    pub deleted: Vec<String>,
}

#[wasm_bindgen]
pub struct FastSearchEngine {
    files: Vec<SearchFile>,
}

#[wasm_bindgen]
impl FastSearchEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        FastSearchEngine { files: Vec::new() }
    }
}

impl Default for FastSearchEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl FastSearchEngine {

    #[wasm_bindgen(js_name = indexFiles)]
    pub fn index_files(&mut self, files_json: &str) -> Result<(), JsValue> {
        let files: Vec<SearchFile> = serde_json::from_str(files_json)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        self.files = files;
        Ok(())
    }

    #[wasm_bindgen(js_name = updateFile)]
    pub fn update_file(&mut self, path: &str, content: &str) {
        if let Some(existing) = self.files.iter_mut().find(|f| f.path == path) {
            existing.content = content.to_string();
        } else {
            self.files.push(SearchFile {
                path: path.to_string(),
                content: content.to_string(),
            });
        }
    }

    #[wasm_bindgen(js_name = removeFile)]
    pub fn remove_file(&mut self, path: &str) {
        self.files.retain(|f| f.path != path);
    }

    #[wasm_bindgen(js_name = search)]
    pub fn search(
        &self,
        query: &str,
        is_regex: bool,
        match_case: bool,
        max_matches: usize,
    ) -> Result<String, JsValue> {
        if query.is_empty() {
            return Ok("[]".to_string());
        }

        let pattern = if is_regex {
            query.to_string()
        } else {
            regex::escape(query)
        };

        let re = RegexBuilder::new(&pattern)
            .case_insensitive(!match_case)
            .build()
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        let mut matches: Vec<SearchMatch> = Vec::new();

        for file in &self.files {
            for (line_idx, line) in file.content.lines().enumerate() {
                for mat in re.find_iter(line) {
                    matches.push(SearchMatch {
                        path: file.path.clone(),
                        line_number: line_idx + 1,
                        line_content: line.to_string(),
                        match_start: mat.start(),
                        match_end: mat.end(),
                    });

                    if matches.len() >= max_matches {
                        return serde_json::to_string(&matches)
                            .map_err(|e| JsValue::from_str(&e.to_string()));
                    }
                }
            }
        }

        serde_json::to_string(&matches).map_err(|e| JsValue::from_str(&e.to_string()))
    }
}

#[wasm_bindgen(js_name = fastDiff)]
pub fn fast_diff(old_text: &str, new_text: &str) -> Result<String, JsValue> {
    let diff = similar::TextDiff::from_lines(old_text, new_text);
    let mut changes: Vec<DiffChange> = Vec::new();

    for change in diff.iter_all_changes() {
        let change_type = match change.tag() {
            similar::ChangeTag::Delete => "delete",
            similar::ChangeTag::Insert => "insert",
            similar::ChangeTag::Equal => "equal",
        };
        changes.push(DiffChange {
            change_type: change_type.to_string(),
            value: change.value().to_string(),
        });
    }

    serde_json::to_string(&changes).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen(js_name = fastSha256)]
pub fn fast_sha256(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[wasm_bindgen(js_name = diffFileTree)]
pub fn diff_file_tree(old_tree_json: &str, new_tree_json: &str) -> Result<String, JsValue> {
    let old_map: HashMap<String, String> = serde_json::from_str(old_tree_json)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    let new_map: HashMap<String, String> = serde_json::from_str(new_tree_json)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    let mut created = Vec::new();
    let mut modified = Vec::new();
    let mut deleted = Vec::new();

    for (path, new_hash) in &new_map {
        match old_map.get(path) {
            None => created.push(path.clone()),
            Some(old_hash) => {
                if old_hash != new_hash {
                    modified.push(path.clone());
                }
            }
        }
    }

    for path in old_map.keys() {
        if !new_map.contains_key(path) {
            deleted.push(path.clone());
        }
    }

    let delta = TreeDelta {
        created,
        modified,
        deleted,
    };

    serde_json::to_string(&delta).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen(js_name = kryptonDetectHardware)]
pub fn krypton_detect_hardware() -> String {
    let topo = hardware_topology::detect_cpu_topology();
    serde_json::to_string(&topo).unwrap_or_else(|_| "{}".to_string())
}

#[wasm_bindgen(js_name = kryptonGetOptimalThreads)]
pub fn krypton_get_optimal_threads() -> u32 {
    let topo = hardware_topology::detect_cpu_topology();
    topo.optimal_thread_count as u32
}

#[wasm_bindgen(js_name = kryptonBindBigCores)]
pub fn krypton_bind_big_cores(_thread_idx: u32) -> bool {
    let topo = hardware_topology::detect_cpu_topology();
    hardware_topology::bind_thread_to_big_cores(&topo.big_cores).is_ok()
}

#[wasm_bindgen(js_name = kryptonInspectGguf)]
pub fn krypton_inspect_gguf(path: &str) -> String {
    match hardware_topology::inspect_gguf_header(path) {
        Ok(info) => serde_json::to_string(&info).unwrap_or_else(|_| "{}".to_string()),
        Err(e) => format!(r#"{{"error": "{}"}}"#, e),
    }
}

#[wasm_bindgen(js_name = kryptonNewCancelToken)]
pub fn krypton_new_cancel_token() -> u64 {
    let token = cancel::create_token();
    token.id()
}

#[wasm_bindgen(js_name = kryptonCancelOperation)]
pub fn krypton_cancel_operation(token_id: u64) -> bool {
    cancel::cancel_token(token_id)
}

#[wasm_bindgen(js_name = kryptonUnregisterCancelToken)]
pub fn krypton_unregister_cancel_token(token_id: u64) {
    cancel::unregister_token(token_id);
}

#[wasm_bindgen(js_name = kryptonComputeStructuredDiff)]
pub fn krypton_compute_structured_diff(old_text: &str, new_text: &str) -> Result<String, JsValue> {
    let diff = diff::DiffEngine::compute_diff(old_text, new_text);
    serde_json::to_string(&diff).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen(js_name = kryptonApplyPatch)]
pub fn krypton_apply_patch(original: &str, target: &str, replacement: &str) -> Result<String, JsValue> {
    diff::DiffEngine::apply_replacement(original, target, replacement)
        .map_err(|e| JsValue::from_str(&e))
}

#[wasm_bindgen(js_name = kryptonCompressZip)]
pub fn krypton_compress_zip(files_json: &str, compression_level: u32) -> Result<Vec<u8>, JsValue> {
    let files: Vec<SearchFile> = serde_json::from_str(files_json)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    let entries: Vec<zip::ZipEntry> = files
        .into_iter()
        .map(|f| zip::ZipEntry {
            name: f.path,
            data: f.content.into_bytes(),
        })
        .collect();

    zip::ZipEngine::create_archive(&entries, compression_level)
        .map_err(|e| JsValue::from_str(&e))
}

#[wasm_bindgen(js_name = kryptonPruneAifContext)]
pub fn krypton_prune_aif_context(aif_binary: &[u8], max_tokens: usize) -> Result<Vec<u8>, JsValue> {
    let doc = aif::AifEngine::deserialize_binary(aif_binary)
        .map_err(|e| JsValue::from_str(&e))?;
    let pruned_blocks = aif::AifEngine::prune_to_token_budget(&doc, max_tokens);
    let pruned_doc = aif::AifDocument {
        project_name: doc.project_name,
        blocks: pruned_blocks,
    };
    aif::AifEngine::serialize_binary(&pruned_doc)
        .map_err(|e| JsValue::from_str(&e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_search_engine() {
        let mut engine = FastSearchEngine::new();
        engine.update_file("src/main.rs", "fn main() {\n    println!(\"Hello Kryptonide\");\n}");
        engine.update_file("src/lib.rs", "pub fn helper() -> bool { true }");

        let res = engine.search("Kryptonide", false, true, 100).unwrap();
        let matches: Vec<SearchMatch> = serde_json::from_str(&res).unwrap();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].path, "src/main.rs");
        assert_eq!(matches[0].line_number, 2);
    }

    #[test]
    fn test_diff_engine() {
        let old = "line 1\nline 2\n";
        let new = "line 1\nmodified line 2\nline 3\n";
        let diff_json = fast_diff(old, new).unwrap();
        let changes: Vec<DiffChange> = serde_json::from_str(&diff_json).unwrap();
        assert!(!changes.is_empty());
    }

    #[test]
    fn test_fast_sha256() {
        let hash = fast_sha256("Hello Kryptonide");
        assert_eq!(hash.len(), 64);
    }

    #[test]
    fn test_tree_diff() {
        let old_json = r#"{"src/a.ts": "hash1", "src/b.ts": "hash2"}"#;
        let new_json = r#"{"src/a.ts": "hash1", "src/b.ts": "hash2_modified", "src/c.ts": "hash3"}"#;
        let res = diff_file_tree(old_json, new_json).unwrap();
        let delta: TreeDelta = serde_json::from_str(&res).unwrap();
        assert_eq!(delta.created, vec!["src/c.ts"]);
        assert_eq!(delta.modified, vec!["src/b.ts"]);
        assert!(delta.deleted.is_empty());
    }
}
