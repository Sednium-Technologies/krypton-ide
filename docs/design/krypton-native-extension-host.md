# Krypton Native Extension Host (QuickJS + Rust + Kotlin)

**Status:** Design accepted — Phase 0 complete (dynamic UI); Phase 1 not started
**Scope:** Hybrid Krypton IDE (Capacitor + React + Rust + Kotlin)
**Primary target:** Android (Termux userland available)
**Secondary target:** Web dev preview (declarative fallback only)

---

## 1. Understanding Summary

Krypton currently installs `.vsix` packages but never executes extension code. It
extracts themes, icon themes, snippets, CSS, and webview HTML, then renders a
partly hardcoded UI. This design replaces that with a real, native extension host:

- Execute VSIX `extension/main.js` through a `vscode` API shim inside an embedded
  QuickJS runtime in Rust.
- Drive all extension UI (activity bar, views, commands, menus, keybindings,
  settings, status bar, webviews) from each package's `package.json` contributions.
- Provide a real LSP client so language servers launched from the Termux userland
  work offline.
- Delete the hardcoded extension catalog, theme tables, theme→icon maps, and the
  fake webview state.
- Preserve Krypton's existing visual design; do not embed a VS Code workbench.

**Why:** "Install any VSIX and it actually works" — no predetermined mock data.

**Who:** Android power users with Termux; web preview for development only.

---

## 2. Assumptions

1. Node is available in the Termux userland (installer already probes `node`).
2. Language servers are installed by the user (or via extension-provided commands)
   and executable from the Termux prefix.
3. `rquickjs` cross-compiles for Android ABIs via `cargo-ndk`.
4. Android permits executing binaries unpacked into the app's files directory
   (already true for the native PTY bootstrap).
5. Most community extensions are bundled JS and only need the `vscode` API plus a
   Node-compat subset. Native Node addons are out of scope.

## 3. Non-Goals

- VS Code Marketplace auth, telemetry, or proprietary Microsoft extensions.
- Running native Node addons (`node-gyp` `.node` binaries).
- Reimplementing the VS Code workbench renderer.
- Replacing the existing Krypton React chrome, layout, or design tokens.
- Duplicating the separate full-Kotlin native track.

---

## 4. Decision Log

| # | Decision | Alternatives | Rationale |
|---|----------|--------------|-----------|
| D1 | Android is the real runtime; web preview is declarative-only | Full parity on web | Native host needs process exec and FS access |
| D2 | Native host in Rust (`rquickjs`) inside a Capacitor plugin | CodinGame monaco-vscode-api; custom browser shim | User chose native; aligns with Rust direction; offline |
| D3 | JS executed in-process via QuickJS | Node in Termux; Web Worker | No Node dependency for extension code; truly native |
| D4 | Keep Krypton UI; map contributions into existing panels | Embed VS Code workbench | Maintain current design and mobile layout |
| D5 | LSP over JSON-RPC bridge: Rust ⇄ server (stdio), Rust ⇄ TS (Capacitor), TS ⇄ Monaco (monaco-languageclient) | WebSocket server; Node CLI | Reuses native process control and existing PTY model |
| D6 | Source of truth for installed extensions is native storage | IndexedDB/localStorage | Survives webview reloads; supports native assets |
| D7 | VS Code workspace trust model for capability gating | Always-allow; per-command prompts | Matches user expectation and VS Code behavior |
| D8 | Extension-driven LSP via shimmed `vscode-languageclient` + built-in server table | Only one path | Covers both declarative servers and agent harnesses |
| D9 | Keep the JS install pipeline only as an explicitly labeled web fallback | Delete outright | Web dev preview still needs something |
| D10 | Remove `EXTENSIONS_CATALOG`; marketplace list stays dynamic from Open VSX | Keep curated list | No hardcoded fake data |

---

## 5. Architecture

### 5.1 Rust host — `crates/krypton-core-rs/src/ext_host/`

```
ext_host/
├── mod.rs               # Public API: install, activate, deactivate, command, state
├── runtime.rs           # rquickjs Runtime/Context per extension, module loader, microtask pump
├── contributions.rs     # package.json parsing, activation events, views/menus/keybindings/config
├── vscode_api/
│   ├── mod.rs           # Registration of the `vscode` module
│   ├── commands.rs
│   ├── window.rs        # showMessage, status bar, webview, TreeView
│   ├── workspace.rs     # getConfiguration, fs, workspace folders, events
│   ├── languages.rs     # registerCompletionItemProvider, diagnostics, Hover, Definition
│   ├── extensions.rs    # getExtension, all, extensionPath
│   ├── env.rs, uri.rs, events.rs, types.rs
├── node_compat/
│   ├── require.rs       # CommonJS resolution + `vscode` injection
│   ├── path.rs, fs.rs, process.rs, buffer.rs, events.rs, util.rs, os.rs, timers.rs
│   └── child_process.rs # capability-gated spawn
├── lsp.rs               # Server registry, spawn, Content-Length framing, lifecycle
├── trust.rs             # Workspace trust + capability checks
└── jni_bridge.rs        # JNI exports -> Kotlin
```

- One QuickJS runtime per activated extension; activation is lazy by event.
- All shim calls that need UI/IO are queued as JSON messages and drained on a
  dedicated host thread, then delivered to Kotlin via a callback interface.
- Panics are contained with `catch_unwind` at every JNI boundary.
- Install: Rust unzips the VSIX into
  `<app files>/extensions/<publisher>.<name>/<version>/` and writes an index.
- Themes/icon themes/snippets are parsed natively and published as contribution
  payloads; TS applies them (existing converters are kept).

### 5.2 Kotlin bridge — `android/app/src/main/java/com/sednium/kryptonide/extensions/ExtensionHostPlugin.kt`

- Capacitor plugin wrapping `libkrypton-core-rs.so` (registered in `MainActivity`).
- Methods: `installVsix`, `uninstall`, `list`, `activate`, `deactivate`,
  `executeCommand`, `getContributions`, `readAsset`, `openWorkspace`,
  `setTrust`, `lspStart`, `lspSend`, `lspStop`.
- Emits events: `hostOutput`, `contributionsChanged`, `webviewMessage`,
  `lspNotification`, `lspRequest`, `log`, `trustPrompt`.
- Owns workspace-trust prompts and capability denials.

### 5.3 TypeScript bridge and consumers

- `src/lib/extensions/nativeExtensionHost.ts` — typed Capacitor wrapper.
- `src/store/useExtensionHostStore.ts` — installed extensions, contribution
  payloads, activation state, view data, status bar items, dynamic config.
- `src/lib/extensions/contributions.ts` — maps payloads to registries.
- `src/lib/extensions/lspClient.ts` — `MessageTransports` implementation for
  `monaco-languageclient`.
- Existing components become pure consumers: `ActivityBar`, `ExtensionViewPanel`,
  `ExtensionWebviewHost`, `CommandPalette`, `StatusBar`, `SettingsPanel`.

### 5.4 Data flow

```
Install:  UI -> nativeExtensionHost.installVsix(path)
          -> Kotlin plugin -> Rust unzip + manifest parse
          -> index file -> contributionsChanged event -> stores

Activate: activation event (onStartupFinished, onView, onCommand, onLanguage)
          -> Kotlin -> Rust runtime -> QuickJS executes main.js
          -> vscode shim -> JSON messages -> Kotlin -> TS stores / UI

Webview:  extension webview.postMessage -> Rust -> Kotlin -> TS
          -> iframe postMessage -> extension listener
          and the reverse path.

LSP:      Rust spawns server with workspace cwd + Termux env
          Rust <-> server: JSON-RPC over stdio (Content-Length)
          Rust <-> TS: Capacitor event + method calls
          TS <-> Monaco: monaco-languageclient providers
```

### 5.5 Contribution mapping (Krypton UI)

| Package contribution | Krypton surface |
|---|---|
| `viewsContainers.activitybar` | Activity rail buttons, icons from VSIX assets, `weight` order |
| `views[containerId]` | Sidebar panel: `webview` -> iframe; `tree` -> native TreeDataProvider shim; `terminal` -> terminal panel |
| `commands` + `menus` | `useCommandRegistry`; palette, editor context, view title |
| `keybindings` | `useKeyboardShortcuts` with a `when`-clause subset |
| `configuration` | Dynamic Settings sections + `workspace.getConfiguration` |
| `themes` / `iconThemes` | Existing converters, driven only by installed packages |
| `snippets` | Existing dynamic snippet registry |
| `languages` | Monaco language registration |
| `window.createStatusBarItem` | Status bar |

---

## 6. Hardcoded Removal Inventory

| File | Remove / replace |
|---|---|
| `src/store/useExtensionsStore.ts` | Delete `EXTENSIONS_CATALOG` (line 65) and `MONACO_THEMES` (line 418); delete the theme→icon map in `setActiveThemeExtension` (line 1713); reduce install pipeline to a labeled web fallback |
| `src/store/useNavbarStore.ts` | Remove catalog lookups in `syncExtensionTools`; source from host contributions |
| `src/components/extensions/ExtensionWebviewHost.tsx` | Delete fake user/quota/task state (line 32) and the per-extension command switch (lines 214–329); use generic message forwarding |
| `src/components/sidebar/ExtensionViewPanel.tsx` | Remove fake "Active Service / Launch CLI / Sync State" fallback; render real view data or an honest empty state |
| `src/components/sidebar/ActivityBar.tsx` | Keep built-ins; extension entries come from contributions (already the pattern) |
| `src/components/layout/StatusBar.tsx` | Add host-contributed status items, remove any static extension claims |
| `src/hooks/useTerminalScanner.ts` | Remove "simulated installed tools"; report real detection only on native, explicit web fallback label |

Static built-ins (Explorer, Search, Git, AI, Extensions, Settings) remain; they are
IDE features, not extension mocks.

---

## 7. LSP Design

1. **Built-in server table** by language, resolved from the Termux prefix:
   `typescript-language-server`, `pyright-langserver`, `rust-analyzer`, `clangd`,
   `gopls`, plus user overrides in settings.
2. **Extension-declared servers**: shim `vscode-languageclient` to register a
   descriptor with the host instead of spawning Node.
3. Rust spawns with workspace cwd and Termux environment; supports restart with
   backoff, cancellation, and clean shutdown.
4. TS implements `MessageTransports` over the Capacitor bridge; monaco-languageclient
   wires diagnostics, completion, hover, definition, references, symbols, rename,
   formatting, code actions, signature help.
5. Missing binary shows a real error and a one-tap `pkg install ...` action that
   writes into the terminal.

---

## 8. Security & Trust

- Workspace Trust states: `trusted`, `restricted`, `untrusted`.
- Untrusted: read-only workspace, no `child_process`, no network, no terminal writes.
- Capability checks native-side before: FS outside workspace, spawn, network,
  clipboard, destructive commands.
- Consent sheet on install when the package declares capabilities beyond defaults.
- Command execution from extensions is logged in the output channel.

---

## 9. Phased Delivery

| Phase | Deliverable | Exit criteria |
|---|---|---|
| 0 | Remove hardcoded catalog/themes/mock UI; declarative path is VSIX-driven ✅ Complete | No fake data in extension surfaces; web fallback labeled |
| 1 | Rust `ext_host` skeleton, JNI, Kotlin plugin, install/list/activate, manifest parse | A VSIX installs and its manifest appears in the UI on device |
| 2 | QuickJS runtime + core `vscode` shim + lifecycle | A sample extension activates and runs a command |
| 3 | Dynamic activity bar, views, commands, status bar, settings | Contributions render in Krypton UI |
| 4 | LSP manager + `lspClient` + terminal install UX | TypeScript/Python diagnostics and completion on device |
| 5 | Node compat + `child_process` + trust gates | Trusted extension can spawn a process; untrusted is blocked |
| 6 | Tests, fixtures, docs, hardening | Rust/TS unit tests + device E2E on sample VSIXs |

### Phase 0 outcome

- Hardcoded `EXTENSIONS_CATALOG` removed; installed extensions are the only source.
- `extensionRegistry.ts` provides extension lookup helpers only; the Monaco theme registry lives in `src/lib/monacoThemes.ts`, and editor/file/folder icons flow through the dynamic icon engine and icon-theme storage.
- Generic webview bridge (`webviewBridge.ts`) routes safe built-ins and forwards the rest.
- Extension panel is honest: no fake built-in service entries or mock install state.
- Terminal reports real tool availability (`toolScanner.ts`); web preview never claims tools are installed.
- New tests cover the registry, bridge routing, absence of the catalog, and tool detection.

---

## 10. Testing Strategy

- **Rust**: manifest parsing, URI handling, module resolution, LSP framing,
  activation event matching, capability checks.
- **TypeScript**: contribution mapping, store reducers, command/menu registration,
  LSP transport framing.
- **Device E2E**: sample fixtures — theme, snippet pack, tree-view extension,
  webview extension, LSP extension, and one agent-harness-style extension.
- **Regression**: existing `npm test`, `npm run type-check`, Rust tests.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| QuickJS lacks many Node APIs | Grow `node_compat` incrementally; document unsupported native addons |
| Android exec/permission restrictions | Phase 1 device spike before deeper work |
| `cargo-ndk` build complexity for `rquickjs` | Validate build matrix early; pin toolchain |
| Extensions with dynamic chunk loading | Bundle loader support; fall back to honest error |
| LSP binaries missing on device | Detect + one-tap install; never fake readiness |
| UI regressions during catalog removal | Phase 0 isolated; keep Krypton tokens |

---

## 12. Open Items

- Exact trust UX copy and where the prompt appears (folder open vs extension install).
- Whether `contributes.grammars` (TextMate) is in phase 3 or deferred.
- Web fallback boundary: which surfaces keep the JS pipeline.
- Final list of built-in LSP server mappings.
