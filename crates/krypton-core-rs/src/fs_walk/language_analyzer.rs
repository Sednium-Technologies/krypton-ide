use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct LanguageStat {
    pub language_id: String,
    pub name: String,
    pub color: String,
    pub byte_count: u64,
    pub line_count: u64,
    pub file_count: usize,
    pub percentage: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct LanguageAnalysisResult {
    pub dominant_language: String,
    pub dominant_color: String,
    pub languages: Vec<LanguageStat>,
    pub total_bytes: u64,
    pub total_lines: u64,
    pub total_files: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileVolumeEntry {
    pub path: String,
    pub byte_count: u64,
    pub line_count: Option<u64>,
}

pub struct LanguageAnalyzer;

impl LanguageAnalyzer {
    pub fn detect_language(path: &str) -> Option<(&'static str, &'static str, &'static str)> {
        let lower = path.to_lowercase();
        let extension = lower.rsplit('.').next().unwrap_or("");

        match extension {
            "rs" => Some(("rust", "Rust", "#ce422b")),
            "ts" => Some(("typescript", "TypeScript", "#3178c6")),
            "tsx" => Some(("typescript", "TypeScript", "#61dafb")),
            "js" | "mjs" | "cjs" => Some(("javascript", "JavaScript", "#f7df1e")),
            "jsx" => Some(("javascript", "JavaScript", "#61dafb")),
            "py" | "pyw" => Some(("python", "Python", "#3776ab")),
            "kt" | "kts" => Some(("kotlin", "Kotlin", "#7f52ff")),
            "java" => Some(("java", "Java", "#b07219")),
            "c" | "h" => Some(("c", "C", "#555555")),
            "cpp" | "cc" | "cxx" | "hpp" | "hxx" => Some(("cpp", "C++", "#f34b7d")),
            "go" => Some(("go", "Go", "#00add8")),
            "html" | "htm" => Some(("html", "HTML", "#e34c26")),
            "css" | "scss" | "sass" | "less" => Some(("css", "CSS", "#563d7c")),
            "json" => Some(("json", "JSON", "#cb171e")),
            "md" | "markdown" => Some(("markdown", "Markdown", "#083fa1")),
            "sh" | "bash" | "zsh" => Some(("shell", "Shell", "#89e051")),
            "xml" | "svg" => Some(("xml", "XML", "#e34c26")),
            "sql" => Some(("sql", "SQL", "#e38c00")),
            _ => None,
        }
    }

    pub fn analyze(files: &[FileVolumeEntry]) -> LanguageAnalysisResult {
        let mut lang_map: HashMap<&'static str, (&'static str, &'static str, u64, u64, usize)> =
            HashMap::new();

        let mut total_bytes: u64 = 0;
        let mut total_lines: u64 = 0;
        let mut total_files: usize = 0;

        for file in files {
            if let Some((lang_id, name, color)) = Self::detect_language(&file.path) {
                let lines = file.line_count.unwrap_or_else(|| {
                    // Estimate line count ~ 35 bytes per line if not provided
                    (file.byte_count / 35).max(1)
                });

                total_bytes += file.byte_count;
                total_lines += lines;
                total_files += 1;

                let entry = lang_map
                    .entry(lang_id)
                    .or_insert((name, color, 0, 0, 0));
                entry.2 += file.byte_count;
                entry.3 += lines;
                entry.4 += 1;
            }
        }

        let mut stats: Vec<LanguageStat> = lang_map
            .into_iter()
            .map(|(lang_id, (name, color, bytes, lines, count))| {
                let percentage = if total_bytes > 0 {
                    (bytes as f32 / total_bytes as f32) * 100.0
                } else {
                    0.0
                };
                LanguageStat {
                    language_id: lang_id.to_string(),
                    name: name.to_string(),
                    color: color.to_string(),
                    byte_count: bytes,
                    line_count: lines,
                    file_count: count,
                    percentage,
                }
            })
            .collect();

        // Sort descending by byte volume, then line count
        stats.sort_by(|a, b| {
            b.byte_count
                .cmp(&a.byte_count)
                .then_with(|| b.line_count.cmp(&a.line_count))
        });

        let (dominant_lang, dominant_color) = if let Some(top) = stats.first() {
            (top.language_id.clone(), top.color.clone())
        } else {
            ("unknown".to_string(), "#7c9b79".to_string())
        };

        LanguageAnalysisResult {
            dominant_language: dominant_lang,
            dominant_color,
            languages: stats,
            total_bytes,
            total_lines,
            total_files,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_language_detection() {
        assert_eq!(
            LanguageAnalyzer::detect_language("src/main.rs"),
            Some(("rust", "Rust", "#ce422b"))
        );
        assert_eq!(
            LanguageAnalyzer::detect_language("app/index.tsx"),
            Some(("typescript", "TypeScript", "#61dafb"))
        );
        assert_eq!(
            LanguageAnalyzer::detect_language("script.py"),
            Some(("python", "Python", "#3776ab"))
        );
        assert_eq!(
            LanguageAnalyzer::detect_language("MainActivity.kt"),
            Some(("kotlin", "Kotlin", "#7f52ff"))
        );
    }

    #[test]
    fn test_language_volume_analysis() {
        let entries = vec![
            FileVolumeEntry {
                path: "src/main.rs".to_string(),
                byte_count: 5000,
                line_count: Some(200),
            },
            FileVolumeEntry {
                path: "src/lib.rs".to_string(),
                byte_count: 8000,
                line_count: Some(350),
            },
            FileVolumeEntry {
                path: "scripts/build.py".to_string(),
                byte_count: 1200,
                line_count: Some(40),
            },
        ];

        let result = LanguageAnalyzer::analyze(&entries);
        assert_eq!(result.dominant_language, "rust");
        assert_eq!(result.dominant_color, "#ce422b");
        assert_eq!(result.total_bytes, 14200);
        assert_eq!(result.total_lines, 590);
        assert_eq!(result.languages.len(), 2);
        assert_eq!(result.languages[0].language_id, "rust");
        assert!(result.languages[0].percentage > 90.0);
    }
}
