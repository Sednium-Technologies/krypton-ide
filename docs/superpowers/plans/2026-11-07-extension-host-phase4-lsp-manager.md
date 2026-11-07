# Implementation Plan: Native Extension Host Phase 4 (LSP Manager & Monaco Language Client)

**Branch:** `feat/extension-host-phase4`  
**Spec Reference:** [`docs/design/krypton-native-extension-host.md`](file:///run/media/bhoid/StorageVault/WEbs/krypton-ide/docs/design/krypton-native-extension-host.md)  
**Discipline:** `/no-shortcuts` — Empirical verification, end-to-end execution tracing, zero synthetic facades.

---

## 1. Objectives

Phase 4 delivers the Language Server Protocol (LSP) manager for Krypton IDE:
1. **Rust Core Process Spawner & JSON-RPC Framing:** Manage language server subprocesses via stdio pipes in the Termux userland environment (`/data/data/com.sednium.kryptonide.legacy/files/usr/bin`), parse LSP `Content-Length` headers, and provide thread-safe message exchange.
2. **QuickJS Extension Host Shim:** Provide `vscode-languageclient` shim so VS Code extensions declaring language servers can register descriptors instead of attempting unsupported Node.js child_process spawns.
3. **JNI & Android Capacitor Bridge:** Expose server lifecycle, message sending, and message draining to TypeScript.
4. **TypeScript LSP Client & State Management:** Implement standards-compliant JSON-RPC 2.0 client (`initialize`, `didOpen`, `didChange`, `publishDiagnostics`, `completion`, `hover`, `definition`, `shutdown`).
5. **Monaco Language Client Adapter:** Wire LSP diagnostics to `monaco.editor.setModelMarkers` and `useProblemsStore`, and register Monaco completion, hover, and definition providers.
6. **Missing Binary & Terminal UX:** Detect missing binaries honestly and provide a one-tap action that executes the package manager command (`pkg install` / `npm install -g`) in the native terminal.
7. **End-to-End Test Suite:** Comprehensive automated tests covering all gates across Rust and TypeScript.

---

## 2. Proposed Changes & Task Breakdown

### Task 1: Rust Core LSP Process Spawner & JSON-RPC Framing
- Create: `crates/krypton-core-rs/src/ext_host/lsp.rs`
- Modify: `crates/krypton-core-rs/src/ext_host/mod.rs`
- Test: `crates/krypton-core-rs/tests/ext_lsp_test.rs`

- [x] **Step 1: Write failing Rust test for LSP framing reader and built-in server resolution**
- [x] **Step 2: Run `cargo test` to verify failure**
- [x] **Step 3: Implement `LspFraming`, `LspServerConfig`, `LspProcess`, and `LspManager` in `lsp.rs`**
- [x] **Step 4: Run `cargo test` to verify pass**
- [x] **Step 5: Commit task**

---

### Task 2: QuickJS Extension Host `vscode-languageclient` Shim
- Modify: `crates/krypton-core-rs/src/ext_host/vscode_api/mod.rs`
- Test: `crates/krypton-core-rs/tests/ext_lsp_test.rs`

- [x] **Step 1: Write failing test in `ext_lsp_test.rs` for `require('vscode-languageclient')` in QuickJS**
- [x] **Step 2: Run `cargo test` to verify failure**
- [x] **Step 3: Implement `vscode-languageclient` CommonJS module shim in `vscode_api/mod.rs`**
- [x] **Step 4: Run `cargo test` to verify pass**
- [x] **Step 5: Commit task**

---

### Task 3: JNI & Kotlin Capacitor LSP Plugin Bridge
- Modify: `crates/krypton-core-rs/src/ext_host/jni_bridge.rs`
- Modify: `android/app/src/main/java/com/sednium/kryptonide/extensions/ExtensionHostNative.kt`
- Modify: `android/app/src/main/java/com/sednium/kryptonide/extensions/ExtensionHostPlugin.kt`
- Test: `crates/krypton-core-rs/tests/ext_lsp_test.rs` (JNI export compilation check)

- [x] **Step 1: Implement JNI functions for start, send, drain, stop, and binary check in `jni_bridge.rs`**
- [x] **Step 2: Add JNI external bindings in `ExtensionHostNative.kt`**
- [x] **Step 3: Add `@PluginMethod` handlers in `ExtensionHostPlugin.kt`**
- [x] **Step 4: Run `cargo test` and verify clean Rust compilation**
- [x] **Step 5: Commit task**

---

### Task 4: TypeScript LSP Client Transport & Store
- Create: `src/lib/lsp/lspClient.ts`
- Create: `src/store/useLspStore.ts`
- Modify: `src/lib/nativeExtensionHost.ts`
- Test: `tests/lspClient.test.ts`

- [x] **Step 1: Write failing test in `tests/lspClient.test.ts` for JSON-RPC client requests and document sync**
- [x] **Step 2: Run `npm test` to verify failure**
- [x] **Step 3: Implement `LspClient` class and `useLspStore` Zustand store with web mock fallback**
- [x] **Step 4: Run `npm test` to verify pass**
- [x] **Step 5: Commit task**

---

### Task 5: Monaco Language Client Adapter & Diagnostics Integration
- Create: `src/lib/lsp/monacoLspAdapter.ts`
- Modify: `src/components/editor/CodeEditor.tsx`
- Test: `tests/monacoLspAdapter.test.ts`

- [x] **Step 1: Write failing test in `tests/monacoLspAdapter.test.ts` for diagnostic mapping and completion providers**
- [x] **Step 2: Run `npm test` to verify failure**
- [x] **Step 3: Implement `monacoLspAdapter.ts` and connect Monaco model change listeners in `CodeEditor.tsx`**
- [x] **Step 4: Run `npm test` to verify pass**
- [x] **Step 5: Commit task**

---

### Task 6: Terminal One-Tap Install UX & Status Bar Indicator
- Modify: `src/components/layout/StatusBar.tsx`
- Modify: `src/components/sidebar/TerminalPanel.tsx` (or terminal store integration)
- Test: `tests/lspTerminalInstall.test.ts`

- [x] **Step 1: Write failing test in `tests/lspTerminalInstall.test.ts` for missing binary prompt and command dispatch**
- [x] **Step 2: Run `npm test` to verify failure**
- [x] **Step 3: Wire LSP status indicator in `StatusBar.tsx` and terminal install action**
- [x] **Step 4: Run `npm test` to verify pass**
- [x] **Step 5: Commit task**

---

### Task 7: End-to-End Integration Suite & Verification
- Create: `tests/extensionHostPhase4E2e.test.ts`

- [x] **Step 1: Implement full Phase 4 E2E test exercising server start, handshake, sync, diagnostics, completion, and shutdown**
- [x] **Step 2: Run `cargo test` in `crates/krypton-core-rs`**
- [x] **Step 3: Run `npm test` across all TypeScript test suites**
- [x] **Step 4: Run `npx tsc --noEmit` to verify type safety**
- [x] **Step 5: Commit task and create Walkthrough artifact**

---

## 3. Verification Commands

1. **Rust Core:**
   `cd crates/krypton-core-rs && cargo test`
2. **TypeScript & IDE:**
   `npm test`
3. **Type Checking:**
   `npx tsc --noEmit`
