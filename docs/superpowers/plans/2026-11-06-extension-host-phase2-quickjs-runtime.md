# Extension Host Phase 2 — QuickJS Runtime & Core vscode API Shim

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute extension JS (`extension/main.js`) in an embedded QuickJS engine in Rust, provide a core `vscode` module shim (`vscode.commands`, `vscode.window`, `vscode.workspace`), manage extension activation lifecycle (`activate()` / `deactivate()`), and bridge command execution to Android / TypeScript.

**Architecture:** Each activated extension gets an isolated `rquickjs::Context` inside an `rquickjs::Runtime`. The runtime exposes an in-memory `vscode` module shim and global `require` function. Registered commands and window messages are buffered and dispatched across the JNI bridge to Kotlin and TypeScript.

**Tech Stack:** Rust 2021 (rquickjs 0.14, serde, serde_json), Kotlin (Capacitor 7), TypeScript, React 19, Zustand 5, `node:test` + `tsx`.

**Spec:** `docs/design/krypton-native-extension-host.md`

## Global Constraints

- Do not crash or block the UI thread during extension execution (run on dedicated host thread).
- Wrap all JS execution with try/catch and catch_unwind.
- QuickJS execution must be sandboxed: no native OS access from untrusted JS except through the capability-gated host APIs.
- Keep `cargo check`, `cargo test`, `npm test`, and `npx tsc --noEmit` green.

---

### Task 1: QuickJS Runtime Engine (`ext_host/runtime.rs`)

**Files:**
- Create: `crates/krypton-core-rs/src/ext_host/runtime.rs`
- Modify: `crates/krypton-core-rs/src/ext_host/mod.rs`
- Test: `crates/krypton-core-rs/tests/ext_runtime_test.rs`

- [x] **Step 1: Write failing Rust integration test for ExtensionRuntime**
- [x] **Step 2: Run `cargo test --test ext_runtime_test` to verify failure**
- [x] **Step 3: Implement `ExtensionRuntime` with memory limits and eval**
- [x] **Step 4: Run `cargo test --test ext_runtime_test` to verify pass**
- [x] **Step 5: Commit task**

---

### Task 2: Core `vscode` Module & CJS Require Shim (`ext_host/vscode_api/`)

**Files:**
- Create: `crates/krypton-core-rs/src/ext_host/vscode_api/mod.rs`
- Create: `crates/krypton-core-rs/src/ext_host/vscode_api/commands.rs`
- Create: `crates/krypton-core-rs/src/ext_host/vscode_api/window.rs`
- Create: `crates/krypton-core-rs/src/ext_host/vscode_api/workspace.rs`
- Modify: `crates/krypton-core-rs/src/ext_host/mod.rs`
- Test: `crates/krypton-core-rs/tests/ext_vscode_api_test.rs`

- [x] **Step 1: Write failing integration test for `require('vscode')` and `commands.registerCommand`**
- [x] **Step 2: Run `cargo test --test ext_vscode_api_test` to verify failure**
- [x] **Step 3: Implement `vscode` module bindings and CJS require injection**
- [x] **Step 4: Run `cargo test --test ext_vscode_api_test` to verify pass**
- [x] **Step 5: Commit task**

---

### Task 3: Extension Lifecycle Manager & Context (`ext_host/lifecycle.rs`)

**Files:**
- Create: `crates/krypton-core-rs/src/ext_host/lifecycle.rs`
- Modify: `crates/krypton-core-rs/src/ext_host/mod.rs`
- Test: `crates/krypton-core-rs/tests/ext_lifecycle_test.rs`

- [x] **Step 1: Write failing integration test for extension activation events and activate() call**
- [x] **Step 2: Run `cargo test --test ext_lifecycle_test` to verify failure**
- [x] **Step 3: Implement `ExtensionLifecycleManager` with lazy activation**
- [x] **Step 4: Run `cargo test --test ext_lifecycle_test` to verify pass**
- [x] **Step 5: Commit task**

---

### Task 4: JNI Command Execution & Event Dispatch (`ext_host/jni_bridge.rs`)

**Files:**
- Modify: `crates/krypton-core-rs/src/ext_host/jni_bridge.rs`
- Modify: `android/app/src/main/java/com/sednium/kryptonide/extensions/ExtensionHostNative.kt`
- Modify: `android/app/src/main/java/com/sednium/kryptonide/extensions/ExtensionHostPlugin.kt`

- [x] **Step 1: Add JNI methods: `nativeActivateExtension`, `nativeExecuteExtensionCommand`, `nativeListRegisteredCommands`**
- [x] **Step 2: Add Kotlin plugin methods: `activate`, `executeCommand`, `listCommands`**
- [x] **Step 3: Run `cargo check` to verify JNI exports**
- [x] **Step 4: Commit task**

---

### Task 5: TypeScript Extension Host Store Command Integration

**Files:**
- Modify: `src/lib/extensions/nativeExtensionHost.ts`
- Modify: `src/store/useExtensionHostStore.ts`
- Test: `tests/extensionHostPhase2Command.test.ts`

- [x] **Step 1: Add command execution types and web fallback to `nativeExtensionHost.ts`**
- [x] **Step 2: Extend `useExtensionHostStore.ts` with `executeCommand` and `activateExtension`**
- [x] **Step 3: Verify with unit tests**
- [x] **Step 4: Commit task**

---

### Task 6: End-to-End Command Execution Fixture & Verification

**Files:**
- Create: `tests/fixtures/sample-command-ext/package.json`
- Create: `tests/fixtures/sample-command-ext/main.js`
- Test: `tests/extensionHostPhase2E2e.test.ts`

- [x] **Step 1: Create sample VSIX fixture with command registration**
- [x] **Step 2: Write E2E test verifying install -> activate -> execute command -> response**
- [x] **Step 3: Run full verification: `cargo test` and `npm test`**
- [x] **Step 4: Commit task**
