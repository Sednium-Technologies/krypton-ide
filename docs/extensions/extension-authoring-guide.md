# Kryptonide Native Extension Authoring Guide

Welcome to the **Kryptonide Native Extension Host**. Krypton allows you to author, package, and execute genuine `.vsix` extensions natively on Android mobile devices and desktop workstations without running a heavy Node.js runtime or embedded Chromium desktop container.

---

## 1. Architectural Overview

Krypton's extension architecture separates execution across three coordinated layers:

```
┌────────────────────────────────────────────────────────┐
│               Krypton UI / React Shell                 │
│      Monaco Editor • Activity Bar • Status Bar         │
│          Command Palette • Trust Banner & Pill         │
└───────────────────────────▲────────────────────────────┘
                            │ Capacitor Plugin Bridge
┌───────────────────────────▼────────────────────────────┐
│                  Kotlin / JNI Bridge                   │
│        libkrypton_core_rs.so (catch_unwind safe)       │
└───────────────────────────▲────────────────────────────┘
                            │ Native C Foreign Interface
┌───────────────────────────▼────────────────────────────┐
│             Rust Core & QuickJS Host Engine            │
│   • VSIX Unpacker & Manifest Validator                 │
│   • QuickJS Embedded JavaScript Runtime                │
│   • VS Code API Shim (`vscode`, `vscode-languageclient`)│
│   • Node.js Polyfills (`path`, `os`, `fs`, `events`)   │
│   • Stdio LSP Spawner (Termux userland integration)    │
│   • Workspace Trust & Capability Gatekeeper            │
└────────────────────────────────────────────────────────┘
```

---

## 2. Supported VS Code API Subset

Krypton provides an authentic CommonJS `require('vscode')` shim. You do not need special build tools or custom SDKs; standard VS Code extension code runs directly.

### Commands (`vscode.commands`)
```javascript
const vscode = require('vscode');

// Register a command (invoked from Command Palette, keybindings, or code)
const disposable = vscode.commands.registerCommand('myExtension.greet', (name) => {
  return `Hello, ${name || 'World'}!`;
});
context.subscriptions.push(disposable);

// Execute any registered command
const result = await vscode.commands.executeCommand('myExtension.greet', 'Krypton');
```

### Notifications & Window (`vscode.window`)
```javascript
// Display notifications in Krypton's floating HUD
vscode.window.showInformationMessage('Project indexed successfully');
vscode.window.showWarningMessage('High memory usage detected');
vscode.window.showErrorMessage('Failed to connect to language server');

// Create dynamic Status Bar items
const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
item.text = '$(zap) Active';
item.tooltip = 'Click to open dashboard';
item.command = 'myExtension.openDashboard';
item.show();
```

### Workspace Configuration (`vscode.workspace`)
```javascript
// Read extension settings from package.json configuration schema
const config = vscode.workspace.getConfiguration('myExtension');
const maxItems = config.get('maxItems', 50);
const enabled = config.get('enabled', true);
```

### Disposables & URIs
```javascript
const uri = vscode.Uri.file('/path/to/project/main.ts');
const sub = new vscode.Disposable(() => {
  // Teardown resources
});
context.subscriptions.push(sub);
```

---

## 3. Node.js Compatibility Layer

Krypton's QuickJS engine injects polyfills for core Node.js modules:

| Module | Available APIs |
|---|---|
| `path` | `join`, `resolve`, `dirname`, `basename`, `extname`, `isAbsolute`, `sep: '/'`, `delimiter: ':'`, `normalize` |
| `os` | `platform()`, `arch()`, `homedir()`, `tmpdir()`, `type()`, `release()`, `EOL`, `cpus()` |
| `events` | `EventEmitter` (`on`, `once`, `emit`, `removeListener`, `off`, `removeAllListeners`) |
| `fs` | `existsSync`, `readFileSync`, `writeFileSync`, `statSync`, `mkdirSync`, `readdirSync`, `promises.*` |
| `child_process` | `spawn`, `exec`, `execSync` *(Subject to Workspace Trust)* |

---

## 4. Workspace Trust & Security Gates

Krypton implements VS Code-standard **Workspace Trust**:

1. **Restricted Mode (Default):**
   - Extensions run with confined permissions.
   - `child_process.spawn` and `child_process.exec` are blocked and throw descriptive `SecurityError`s.
   - Filesystem writes outside the project root are rejected natively.
2. **Trusted Mode:**
   - Enabled when the user taps **[Trust Workspace]** in the warning banner or status bar pill.
   - Grants full process execution and terminal access.

### Declaring Trust Requirements in `package.json`
If your extension requires process execution, declare it explicitly:
```json
{
  "name": "my-debugger",
  "capabilities": {
    "untrustedWorkspaces": {
      "supported": false,
      "description": "Requires process spawning to run debug adapters"
    }
  }
}
```
Krypton will prompt the user with a permission consent sheet prior to installation.

---

## 5. Language Server Protocol (LSP) Integration

Krypton extensions can bootstrap language servers via `vscode-languageclient/node`:

```javascript
const { LanguageClient, TransportKind } = require('vscode-languageclient/node');

function activate(context) {
  const serverOptions = {
    command: 'pyright-langserver',
    args: ['--stdio'],
    transport: TransportKind.stdio,
  };

  const clientOptions = {
    documentSelector: [{ scheme: 'file', language: 'python' }],
  };

  const client = new LanguageClient('pyright', 'Python Language Server', serverOptions, clientOptions);
  context.subscriptions.push(client.start());
}
```

Krypton launches the server process in the Termux userland environment (`/data/data/com.sednium.kryptonide.legacy/files/usr/bin`), streams stdio JSON-RPC packets with `Content-Length` framing, and connects diagnostics, hover, and completions directly to Monaco Editor.

---

## 6. Declaring UI Contributions in `package.json`

### Dynamic Activity Bar & Views
```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "my-sidebar",
          "title": "Database",
          "icon": "$(database)"
        }
      ]
    },
    "views": {
      "my-sidebar": [
        {
          "id": "my.tableList",
          "name": "Tables"
        }
      ]
    }
  }
}
```
Contributions appear dynamically in Krypton's **More** drawer and can be pinned to the primary navigation bar.

### Color Themes & Snippets
```json
{
  "contributes": {
    "themes": [
      {
        "label": "My Dark Neon",
        "uiTheme": "vs-dark",
        "path": "./themes/neon.json"
      }
    ],
    "snippets": [
      {
        "language": "rust",
        "path": "./snippets/rust.json"
      }
    ]
  }
}
```

---

## 7. Packaging Your Extension (`.vsix`)

Krypton uses standard Open Packaging Conventions (OPC) `.vsix` packages.

### Option 1: Official VS Code CLI (`vsce`)
```bash
npm install -g @vscode/vsce
vsce package
```

### Option 2: Deterministic VSIX Packager
You can also package extensions programmatically using Krypton's packager:
```typescript
import { buildVsix } from './tests/fixtures/packVsix';

buildVsix('./my-extension', './dist/my-extension.vsix');
```

---

## 8. Verification & Debugging

1. **Install VSIX on Device:**
   Open Kryptonide > **More** > **Extensions** > **Install from VSIX** > Select file.
2. **Review Logs:**
   Diagnostics and extension console messages stream to Krypton's native logging channel at `.logs/` and the Debug console.
