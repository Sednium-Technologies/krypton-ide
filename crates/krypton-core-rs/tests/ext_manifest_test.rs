use krypton_core_rs::ext_host::ExtensionManifest;

#[test]
fn test_extension_id() {
    let json = r#"{
        "name": "super-rust",
        "publisher": "krypton",
        "version": "1.0.0"
    }"#;
    let manifest = ExtensionManifest::parse(json).expect("should parse minimal manifest");
    assert_eq!(manifest.extension_id(), "krypton.super-rust");
}

#[test]
fn test_minimal_manifest() {
    let json = r#"{
        "name": "minimal-extension",
        "publisher": "test-pub",
        "version": "0.1.0"
    }"#;
    let manifest = ExtensionManifest::parse(json).expect("should parse minimal manifest");
    assert_eq!(manifest.name, "minimal-extension");
    assert_eq!(manifest.publisher, "test-pub");
    assert_eq!(manifest.version, "0.1.0");
    assert_eq!(manifest.display_name, None);
    assert_eq!(manifest.description, None);
    assert_eq!(manifest.main, None);
    assert_eq!(manifest.icon, None);
    assert!(manifest.activation_events.is_empty());
    assert!(manifest.engines.is_empty());
    assert!(manifest.contributes.commands.is_empty());
    assert!(manifest.contributes.menus.is_empty());
    assert!(manifest.contributes.views_containers.is_none());
    assert!(manifest.contributes.views.is_empty());
    assert!(manifest.contributes.configuration.is_none());
    assert!(manifest.contributes.themes.is_empty());
    assert!(manifest.contributes.icon_themes.is_empty());
    assert!(manifest.contributes.snippets.is_empty());
    assert!(manifest.contributes.languages.is_empty());
}

#[test]
fn test_complete_manifest() {
    let json = r#"{
        "name": "full-tooling",
        "publisher": "krypton-org",
        "version": "2.4.1",
        "displayName": "Full Tooling Suite",
        "description": "Comprehensive development tools for Kryptonide",
        "main": "./dist/extension.js",
        "icon": "media/icon.png",
        "activationEvents": [
            "onLanguage:rust",
            "onCommand:krypton.buildProject",
            "workspaceContains:Cargo.toml",
            "*"
        ],
        "engines": {
            "vscode": "^1.85.0",
            "node": ">=18.0.0"
        },
        "contributes": {
            "commands": [
                {
                    "command": "krypton.buildProject",
                    "title": "Build Project",
                    "category": "Krypton"
                },
                {
                    "command": "krypton.cleanProject",
                    "title": "Clean Project"
                }
            ],
            "menus": {
                "editor/title": [
                    {
                        "command": "krypton.buildProject",
                        "when": "resourceExtname == .rs",
                        "group": "navigation"
                    }
                ]
            },
            "viewsContainers": {
                "activitybar": [
                    {
                        "id": "krypton-explorer",
                        "title": "Krypton Explorer",
                        "icon": "resources/explorer.svg"
                    }
                ]
            },
            "views": {
                "krypton-explorer": [
                    {
                        "id": "krypton.symbolsView",
                        "name": "Symbols",
                        "when": "krypton:active"
                    }
                ]
            },
            "configuration": {
                "title": "Krypton Tooling Settings",
                "properties": {
                    "krypton.enableLSP": {
                        "type": "boolean",
                        "default": true,
                        "description": "Enable Language Server Protocol"
                    }
                }
            },
            "themes": [
                {
                    "label": "Krypton Dark Modern",
                    "uiTheme": "vs-dark",
                    "path": "./themes/krypton-dark.json"
                }
            ],
            "iconThemes": [
                {
                    "id": "krypton-icons",
                    "label": "Krypton File Icons",
                    "path": "./icons/krypton-icons.json"
                }
            ],
            "snippets": [
                {
                    "language": "rust",
                    "path": "./snippets/rust.json"
                }
            ],
            "languages": [
                {
                    "id": "rust",
                    "aliases": ["Rust", "rs"],
                    "extensions": [".rs"]
                }
            ]
        }
    }"#;

    let manifest = ExtensionManifest::parse(json).expect("should parse complete manifest");
    assert_eq!(manifest.name, "full-tooling");
    assert_eq!(manifest.publisher, "krypton-org");
    assert_eq!(manifest.version, "2.4.1");
    assert_eq!(manifest.display_name.as_deref(), Some("Full Tooling Suite"));
    assert_eq!(manifest.description.as_deref(), Some("Comprehensive development tools for Kryptonide"));
    assert_eq!(manifest.main.as_deref(), Some("./dist/extension.js"));
    assert_eq!(manifest.icon.as_deref(), Some("media/icon.png"));
    assert_eq!(manifest.extension_id(), "krypton-org.full-tooling");

    // Activation events
    assert_eq!(manifest.activation_events.len(), 4);
    assert_eq!(manifest.activation_events[0], "onLanguage:rust");
    assert_eq!(manifest.activation_events[3], "*");

    // Engines
    assert_eq!(manifest.engines.get("vscode").unwrap(), "^1.85.0");
    assert_eq!(manifest.engines.get("node").unwrap(), ">=18.0.0");

    // Commands
    assert_eq!(manifest.contributes.commands.len(), 2);
    assert_eq!(manifest.contributes.commands[0].command, "krypton.buildProject");
    assert_eq!(manifest.contributes.commands[0].title, "Build Project");
    assert_eq!(manifest.contributes.commands[0].category.as_deref(), Some("Krypton"));
    assert_eq!(manifest.contributes.commands[1].category, None);

    // Menus
    assert!(manifest.contributes.menus.contains_key("editor/title"));
    let menu_items = &manifest.contributes.menus["editor/title"];
    assert_eq!(menu_items.len(), 1);
    assert_eq!(menu_items[0].command, "krypton.buildProject");
    assert_eq!(menu_items[0].when.as_deref(), Some("resourceExtname == .rs"));
    assert_eq!(menu_items[0].group.as_deref(), Some("navigation"));

    // Views containers
    let containers = manifest.contributes.views_containers.as_ref().unwrap();
    assert_eq!(containers.activitybar.len(), 1);
    assert_eq!(containers.activitybar[0].id, "krypton-explorer");
    assert_eq!(containers.activitybar[0].title, "Krypton Explorer");
    assert_eq!(containers.activitybar[0].icon.as_deref(), Some("resources/explorer.svg"));

    // Views
    assert!(manifest.contributes.views.contains_key("krypton-explorer"));
    let views = &manifest.contributes.views["krypton-explorer"];
    assert_eq!(views.len(), 1);
    assert_eq!(views[0].id, "krypton.symbolsView");
    assert_eq!(views[0].name, "Symbols");
    assert_eq!(views[0].when.as_deref(), Some("krypton:active"));

    // Configuration
    assert!(manifest.contributes.configuration.is_some());
    let config = manifest.contributes.configuration.as_ref().unwrap();
    assert_eq!(config["title"], "Krypton Tooling Settings");
    assert_eq!(config["properties"]["krypton.enableLSP"]["type"], "boolean");

    // Themes
    assert_eq!(manifest.contributes.themes.len(), 1);
    assert_eq!(manifest.contributes.themes[0].label.as_deref(), Some("Krypton Dark Modern"));
    assert_eq!(manifest.contributes.themes[0].ui_theme.as_deref(), Some("vs-dark"));
    assert_eq!(manifest.contributes.themes[0].path, "./themes/krypton-dark.json");

    // Icon Themes
    assert_eq!(manifest.contributes.icon_themes.len(), 1);
    assert_eq!(manifest.contributes.icon_themes[0].id.as_deref(), Some("krypton-icons"));
    assert_eq!(manifest.contributes.icon_themes[0].label.as_deref(), Some("Krypton File Icons"));
    assert_eq!(manifest.contributes.icon_themes[0].path, "./icons/krypton-icons.json");

    // Snippets
    assert_eq!(manifest.contributes.snippets.len(), 1);
    assert_eq!(manifest.contributes.snippets[0].language.as_deref(), Some("rust"));
    assert_eq!(manifest.contributes.snippets[0].path, "./snippets/rust.json");

    // Languages
    assert_eq!(manifest.contributes.languages.len(), 1);
    assert_eq!(manifest.contributes.languages[0].id, "rust");
    assert_eq!(manifest.contributes.languages[0].aliases.as_deref(), Some(&vec!["Rust".to_string(), "rs".to_string()][..]));
    assert_eq!(manifest.contributes.languages[0].extensions.as_deref(), Some(&vec![".rs".to_string()][..]));
}

#[test]
fn test_malformed_json() {
    let invalid_json = "{ invalid: json, ";
    let result = ExtensionManifest::parse(invalid_json);
    assert!(result.is_err(), "Malformed JSON should fail to parse");

    // Missing required field 'publisher'
    let missing_field = r#"{"name": "test", "version": "1.0.0"}"#;
    let result2 = ExtensionManifest::parse(missing_field);
    assert!(result2.is_err(), "Missing required field 'publisher' should fail");

    // Missing required field 'name'
    let missing_name = r#"{"publisher": "test", "version": "1.0.0"}"#;
    let result3 = ExtensionManifest::parse(missing_name);
    assert!(result3.is_err(), "Missing required field 'name' should fail");

    // Missing required field 'version'
    let missing_version = r#"{"name": "test", "publisher": "test"}"#;
    let result4 = ExtensionManifest::parse(missing_version);
    assert!(result4.is_err(), "Missing required field 'version' should fail");
}

#[test]
fn test_roundtrip_serialization() {
    let json = r#"{
        "name": "roundtrip-ext",
        "publisher": "test-publisher",
        "version": "1.2.3",
        "displayName": "Roundtrip Extension",
        "description": "Test extension for roundtrip serialization",
        "main": "./out/main.js",
        "activationEvents": ["*"],
        "engines": {
            "vscode": "^1.75.0"
        },
        "contributes": {
            "commands": [
                {
                    "command": "test.doSomething",
                    "title": "Do Something",
                    "category": "Test"
                }
            ],
            "themes": [
                {
                    "label": "Dark",
                    "uiTheme": "vs-dark",
                    "path": "themes/dark.json"
                }
            ]
        }
    }"#;

    let manifest = ExtensionManifest::parse(json).expect("Initial parse should succeed");
    let serialized = serde_json::to_string(&manifest).expect("Serialization should succeed");
    let deserialized: ExtensionManifest = serde_json::from_str(&serialized).expect("Deserialization should succeed");

    assert_eq!(manifest, deserialized);
    assert_eq!(deserialized.extension_id(), "test-publisher.roundtrip-ext");
    assert_eq!(deserialized.contributes.commands.len(), 1);
    assert_eq!(deserialized.contributes.commands[0].command, "test.doSomething");
}
