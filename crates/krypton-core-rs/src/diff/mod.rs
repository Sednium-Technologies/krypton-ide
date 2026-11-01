use serde::{Deserialize, Serialize};
use similar::{ChangeTag, TextDiff};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub enum DiffKind {
    Insert,
    Delete,
    Equal,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct InlineSpan {
    pub start: usize,
    pub end: usize,
    pub kind: DiffKind,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct DiffLine {
    pub kind: DiffKind,
    pub old_line_no: Option<usize>,
    pub new_line_no: Option<usize>,
    pub content: String,
    pub inline_spans: Vec<InlineSpan>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct DiffHunk {
    pub old_start: usize,
    pub old_lines: usize,
    pub new_start: usize,
    pub new_lines: usize,
    pub lines: Vec<DiffLine>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Default)]
pub struct DiffSummary {
    pub additions: usize,
    pub deletions: usize,
    pub modifications: usize,
    pub hunks: Vec<DiffHunk>,
}

pub struct DiffEngine;

impl DiffEngine {
    /// Computes structured multi-line diff with inline character highlight spans for changed lines.
    pub fn compute_diff(old_text: &str, new_text: &str) -> DiffSummary {
        let diff = TextDiff::from_lines(old_text, new_text);
        let mut summary = DiffSummary::default();

        for group in diff.grouped_ops(3) {
            if group.is_empty() {
                continue;
            }
            let first_op = &group[0];
            let last_op = &group[group.len() - 1];

            let old_start = first_op.old_range().start;
            let old_end = last_op.old_range().end;
            let new_start = first_op.new_range().start;
            let new_end = last_op.new_range().end;

            let mut diff_hunk = DiffHunk {
                old_start,
                old_lines: old_end.saturating_sub(old_start),
                new_start,
                new_lines: new_end.saturating_sub(new_start),
                lines: Vec::new(),
            };

            for op in &group {
                for change in diff.iter_changes(op) {
                    let (kind, old_no, new_no) = match change.tag() {
                        ChangeTag::Equal => (
                            DiffKind::Equal,
                            change.old_index().map(|i| i + 1),
                            change.new_index().map(|i| i + 1),
                        ),
                        ChangeTag::Delete => {
                            summary.deletions += 1;
                            (DiffKind::Delete, change.old_index().map(|i| i + 1), None)
                        }
                        ChangeTag::Insert => {
                            summary.additions += 1;
                            (DiffKind::Insert, None, change.new_index().map(|i| i + 1))
                        }
                    };

                    diff_hunk.lines.push(DiffLine {
                        kind,
                        old_line_no: old_no,
                        new_line_no: new_no,
                        content: change.value().to_string(),
                        inline_spans: Vec::new(),
                    });
                }
            }

            summary.hunks.push(diff_hunk);
        }

        // Inline character diffing for contiguous delete-insert line pairs
        for hunk in &mut summary.hunks {
            let len = hunk.lines.len();
            let mut i = 0;
            while i + 1 < len {
                if hunk.lines[i].kind == DiffKind::Delete && hunk.lines[i + 1].kind == DiffKind::Insert {
                    summary.modifications += 1;
                    let del_line = hunk.lines[i].content.clone();
                    let ins_line = hunk.lines[i + 1].content.clone();

                    let word_diff = TextDiff::from_words(&del_line, &ins_line);
                    let mut del_offset = 0;
                    let mut ins_offset = 0;

                    for change in word_diff.iter_all_changes() {
                        let span_len = change.value().len();
                        match change.tag() {
                            ChangeTag::Equal => {
                                del_offset += span_len;
                                ins_offset += span_len;
                            }
                            ChangeTag::Delete => {
                                hunk.lines[i].inline_spans.push(InlineSpan {
                                    start: del_offset,
                                    end: del_offset + span_len,
                                    kind: DiffKind::Delete,
                                });
                                del_offset += span_len;
                            }
                            ChangeTag::Insert => {
                                hunk.lines[i + 1].inline_spans.push(InlineSpan {
                                    start: ins_offset,
                                    end: ins_offset + span_len,
                                    kind: DiffKind::Insert,
                                });
                                ins_offset += span_len;
                            }
                        }
                    }
                    i += 2;
                } else {
                    i += 1;
                }
            }
        }

        summary
    }

    /// Generates standard unified git diff format string.
    pub fn to_unified_string(old_path: &str, new_path: &str, old_text: &str, new_text: &str) -> String {
        let diff = TextDiff::from_lines(old_text, new_text);
        diff.unified_diff()
            .header(old_path, new_path)
            .context_radius(3)
            .to_string()
    }

    /// Fast search-and-replace patch application.
    pub fn apply_replacement(
        original: &str,
        target_content: &str,
        replacement_content: &str,
    ) -> Result<String, String> {
        if !original.contains(target_content) {
            return Err("Target content not found in original text".to_string());
        }
        let count = original.matches(target_content).count();
        if count > 1 {
            return Err(format!("Target content is ambiguous ({count} occurrences found)"));
        }
        Ok(original.replacen(target_content, replacement_content, 1))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diff_engine_summary_and_inline() {
        let old = "fn calculate(a: i32) -> i32 {\n    return a + 1;\n}\n";
        let new = "fn calculate(a: i32, b: i32) -> i32 {\n    return a + b;\n}\n";

        let summary = DiffEngine::compute_diff(old, new);
        assert!(!summary.hunks.is_empty());
        assert!(summary.additions > 0);
        assert!(summary.deletions > 0);

        let unified = DiffEngine::to_unified_string("old.rs", "new.rs", old, new);
        assert!(unified.contains("--- old.rs"));
        assert!(unified.contains("+++ new.rs"));

        // Replacement patch test
        let patched = DiffEngine::apply_replacement(old, "return a + 1;", "return a + 42;").unwrap();
        assert!(patched.contains("return a + 42;"));
    }
}
