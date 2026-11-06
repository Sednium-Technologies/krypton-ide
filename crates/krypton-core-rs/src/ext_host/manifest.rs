use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionManifest {
    pub name: String,
    pub publisher: String,
    pub version: String,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub main: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub activation_events: Vec<String>,
    #[serde(default)]
    pub contributes: ExtensionContributions,
    #[serde(default)]
    pub engines: HashMap<String, String>,
}

impl ExtensionManifest {
    pub fn extension_id(&self) -> String {
        format!("{}.{}", self.publisher, self.name)
    }

    pub fn parse(json_str: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json_str)
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionContributions {
    #[serde(default)]
    pub commands: Vec<ContributedCommand>,
    #[serde(default)]
    pub menus: HashMap<String, Vec<ContributedMenuItem>>,
    #[serde(default)]
    pub views_containers: Option<ContributedViewsContainers>,
    #[serde(default)]
    pub views: HashMap<String, Vec<ContributedView>>,
    #[serde(default)]
    pub configuration: Option<serde_json::Value>,
    #[serde(default)]
    pub themes: Vec<ContributedTheme>,
    #[serde(default)]
    pub icon_themes: Vec<ContributedIconTheme>,
    #[serde(default)]
    pub snippets: Vec<ContributedSnippet>,
    #[serde(default)]
    pub languages: Vec<ContributedLanguage>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContributedCommand {
    pub command: String,
    pub title: String,
    #[serde(default)]
    pub category: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContributedMenuItem {
    pub command: String,
    #[serde(default)]
    pub when: Option<String>,
    #[serde(default)]
    pub group: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContributedViewsContainers {
    #[serde(default)]
    pub activitybar: Vec<ContributedContainer>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContributedContainer {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContributedView {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub when: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContributedTheme {
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub ui_theme: Option<String>,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContributedIconTheme {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub label: Option<String>,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContributedSnippet {
    #[serde(default)]
    pub language: Option<String>,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContributedLanguage {
    pub id: String,
    #[serde(default)]
    pub aliases: Option<Vec<String>>,
    #[serde(default)]
    pub extensions: Option<Vec<String>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_manifest_parse_minimal() {
        let json = r#"{"name": "test-pkg", "publisher": "krypton", "version": "0.1.0"}"#;
        let manifest = ExtensionManifest::parse(json).unwrap();
        assert_eq!(manifest.extension_id(), "krypton.test-pkg");
        assert!(manifest.contributes.commands.is_empty());
        assert!(manifest.activation_events.is_empty());
    }
}
