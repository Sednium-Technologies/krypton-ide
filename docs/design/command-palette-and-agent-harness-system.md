# Design Document: Command Palette Expansion & Multi-Agent Harness System

## 1. Executive Summary

This specification defines the architecture, component design, and execution models for:
1. **VS Code-Grade Command Palette**: Upgrading Krypton's command palette into a prefix-aware switcher supporting `>` (commands), `:` (go to line), `@` (go to symbol), and fuzzy file searching.
2. **Multi-Agent Harness System**: Allowing users to choose their Default Agent Harness (Oorty Lite built-in, Claude Code, Antigravity CLI, Roo Code/Cline) strictly from installed agents, routing editor & palette AI triggers to the active harness.
3. **Native Terminal Tool Scanner**: A dedicated section in Terminal Settings that probes the Termux/Linux environment for installed agent binaries and developer runtimes.
4. **Oorty Lite Agentic Terminal Loop**: Equipping Oorty Lite with a native PTY tool-use engine for autonomous shell command execution across three permission tiers: Supervised, Autonomous, and Unbound (YOLO).

---

## 2. Decision Log

| # | Decision | Alternatives Considered | Rationale |
|---|---|---|---|
| **D1** | **Unified Command Palette as Shortcut Gateway** | Separate palettes for editor vs. AI agents | A single, unified `Ctrl+P` / `⌘` palette is clean, familiar, and acts as the universal entry point. |
| **D2** | **Respective Harness Execution** | Forcing all agents into a single chat window or raw terminal | Oorty Lite executes in the Oorty Lite chat drawer; CLI agents (Claude Code, Antigravity) execute in dedicated Terminal tabs; extension agents execute in their extension panels. |
| **D3** | **Strict Installed-Only Harness Selection** | Allowing selection of missing tools with install prompts | Users can **only** pick from harnesses currently installed and verified on the system, preventing broken states. |
| **D4** | **3-Tier Execution Permission Model** | Only supervised or only autonomous | Provides complete user sovereignty: Supervised (default approval cards), Autonomous (safe dev routines), and Unbound (full YOLO agentic freedom). |
| **D5** | **Native POSIX PTY Engine for Automation** | Simulated JavaScript shell execution | Uses real Linux kernel master/slave pseudo-terminals (`libkrypton-pty.so`) with real exit codes, pipes, and signals. |

---

## 3. System Architecture

```mermaid
graph TD
    User([User Action]) -->|Keyboard / Mobile ⌘| CP[Command Palette Modal]
    User -->|Editor Context Menu| EditorCtx[Editor Context / Quick Fix]
    User -->|Oorty Lite Panel Input| OortyLitePanel[Oorty Lite Chat Drawer]

    CP -->|Prefix Routing| ModeRouter{Input Mode}
    ModeRouter -->|Text / Default| FuzzyFiles[Fuzzy File Search & Filter]
    ModeRouter -->|'>'| CmdRegistry[Command Registry: Editor, Git, Terminal, AI]
    ModeRouter -->|':'| MonacoLine[Monaco Go to Line]
    ModeRouter -->|'@'| MonacoSymbol[Monaco Go to Symbol]

    CmdRegistry -->|AI Action Triggered| HarnessRouter{Default Harness Router}
    
    HarnessRouter -->|Default: Oorty Lite| OortyLiteHarness[Oorty Lite Window / Agentic Engine]
    HarnessRouter -->|Claude Code / Antigravity| TermHarness[Launch in Dedicated Terminal Session]
    HarnessRouter -->|Roo Code / Extension| ExtHarness[Focus Extension Panel]

    OortyLitePanel --> OortyLiteHarness
    EditorCtx --> HarnessRouter
```

---

## 4. Component Specifications

### 4.1. Command Palette Engine (`CommandPalette.tsx` + `useCommandRegistry.ts`)
- **Prefix Router**:
  - `>`: Shows filtered IDE commands grouped by category (`Editor`, `Git`, `Terminal`, `AI`, `View`, `Project`).
  - `:`: Real-time line jump in Monaco editor (`editor.revealLineInCenter(line)`).
  - `@`: Real-time symbol jump in Monaco editor (`editor.getAction('editor.action.quickOutline')` or DocumentSymbolProvider).
  - Plain Text: Fuzzy match across project filenames (top) and common commands (bottom).
- **Extensibility**: Core IDE components, extensions, and AI providers can register commands dynamically via `useCommandRegistry.getState().registerCommand(...)`.

### 4.2. Terminal & Agent Tools Scanner (`useTerminalScanner.ts`)
- **Location**: Settings → *Terminal & Agent Tools*.
- **Scan Targets**:
  - `/data/data/com.sednium.kryptonide.legacy/files/usr/bin/` (Termux internal prefix)
  - `/system/bin/` and active `$PATH`
- **Cataloged Tools**:
  - **Agents**: `claude`, `antigravity`, `agy`, `gemini`, `aider`, `roo`
  - **Runtimes & Compilers**: `node`, `python3`, `git`, `rustc`, `cargo`, `clang`, `g++`, `make`
- **Output**: Returns `{ name, binaryPath, version, isInstalled, category }`.
- **Harness Dropdown**: Feeds directly into the "Default AI Harness" selector. Uninstalled harnesses are omitted from the selection list.

### 4.3. Multi-Agent Harness Router (`useHarnessStore.ts`)
- Manages active harness ID (`oorty-lite` by default, or an installed CLI/extension).
- Persisted in Krypton configuration.
- Delegates incoming AI actions:
  - **`oorty-lite`**: Opens Oorty Lite sidebar/drawer, focuses session, sends task prompt with file context.
  - **CLI Harness (`claude-code`, `antigravity`)**: Opens a dedicated terminal tab named after the agent, executes the CLI binary with the current project directory as working directory.
  - **Extension Harness**: Activates the extension's registered sidebar view.

### 4.4. Oorty Lite Agentic Terminal Tool Loop (`execute_terminal_command`)
- **Tool Schema**:
  ```json
  {
    "name": "run_terminal_command",
    "description": "Executes a shell command in the project directory using the native Linux userland terminal.",
    "parameters": {
      "type": "object",
      "properties": {
        "command": { "type": "string" },
        "timeoutMs": { "type": "number", "default": 60000 }
      },
      "required": ["command"]
    }
  }
  ```
- **Permission Tiers**:
  1. **Supervised Mode (Default)**: Renders a preview card in Oorty Lite's chat with command syntax highlighting and an explicit *Run* button.
  2. **Autonomous Mode**: Executes automatically; warns/prompts only if command matches destructive patterns (e.g. `rm -rf /`).
  3. **Unbound Mode (YOLO)**: Bypasses all confirmation prompts and safety filters, executing continuously until the task is complete.
- **Execution & Feedback**:
  - Executes in project working directory via `NativeTerminalPlugin` / `TerminalSession.kt`.
  - Captures `stdout`, `stderr`, and `exitCode`.
  - Injects result into the LLM context so Oorty Lite can inspect failures, self-correct, and re-run.

---

## 5. Error Handling & Edge Cases

1. **Persistent Daemons / Watchers (`npm run dev`, `python -m http.server`)**:  
   If a command is flagged as a long-running service, Oorty Lite spawns it in a visible background terminal tab and reports the listening port, rather than waiting indefinitely.
2. **Missing Binary on Selection**:  
   Enforced at the UI layer: only harnesses with verified `isInstalled: true` are selectable in settings and the command palette.
3. **Terminal Signal / Interruption**:  
   Users can tap a "Stop / Ctrl+C" button in the Oorty Lite execution card to dispatch `SIGINT` (signal 2) to the running subprocess.

---

## 6. Verification Plan

1. **Command Palette**: Verify `>` shows commands, `:` jumps lines in Monaco, `@` lists functions/symbols, and arrow key navigation works smoothly.
2. **Scanner Accuracy**: Verify detection of installed binaries in `/data/data/com.sednium.kryptonide.legacy/files/usr/bin/`.
3. **Harness Routing**: Verify triggering an AI command routes to the selected installed harness.
4. **Oorty Lite Execution Tiers**: Test Supervised (approval card), Autonomous (safe commands run automatically), and Unbound (runs unrestricted).
