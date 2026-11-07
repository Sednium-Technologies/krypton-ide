# Implementation Plan: Native Extension Host Phase 5 (Node.js Compatibility & Workspace Trust Gates)

**Branch:** `feat/extension-host-phase5`  
**Spec Reference:** [`docs/design/krypton-native-extension-host.md`](file:///run/media/bhoid/StorageVault/WEbs/krypton-ide/docs/design/krypton-native-extension-host.md)  
**Discipline:** `/no-shortcuts` — Empirical verification, end-to-end execution tracing, zero synthetic facades.

---

## 1. Objectives

Phase 5 implements Node.js compatibility APIs in QuickJS and enforces VS Code-standard Workspace Trust security boundaries:
1. **Workspace Trust & Capability Gating (Rust Core):**
   - States: `Trusted`, `Restricted`, `Untrusted`.
   - Native capability checks gating `child_process.spawn`, external filesystem access outside the workspace, and terminal/network access.
2. **Node.js Compatibility Polyfills (QuickJS Runtime):**
   - Implements `path`, `os`, `events`, `fs`, and `child_process` modules in CommonJS loader.
   - `child_process.spawn` and `exec` communicate through native process handles when `Trusted`, and throw visible `SecurityError`s when `Restricted` or `Untrusted`.
   - `fs` enforces workspace boundaries (read-only in `Untrusted`; confined to workspace root in `Restricted`).
3. **JNI & Android Capacitor Bridge:**
   - Exposes workspace trust state management (`setWorkspaceTrust`, `getWorkspaceTrust`, `checkCapability`) across JNI and Kotlin.
4. **TypeScript Trust State Management:**
   - `useTrustStore.ts` tracks project trust, integrates with native host, and inspects extension manifests for elevated permission requirements.
5. **UI Trust Banner, Status Bar Pill, & Consent Modal:**
   - Persistent Restricted Mode banner in editor, Status Bar trust indicator (`🔒 Restricted` / `🛡️ Trusted`), and extension installation permission consent modal.
6. **End-to-End Test Suite:**
   - Comprehensive test suite validating security boundaries and execution across Rust and TypeScript.

---

## 2. Proposed Changes & Task Breakdown

### Task 1: Rust Core Trust Manager & Capability Gating
- Create: `crates/krypton-core-rs/src/ext_host/trust.rs`
- Modify: `crates/krypton-core-rs/src/ext_host/mod.rs`
- Modify: `crates/krypton-core-rs/src/ext_host/lifecycle.rs`
- Test: `crates/krypton-core-rs/tests/ext_trust_test.rs`

- [x] **Step 1: Write failing Rust test for TrustManager capability gating**
- [x] **Step 2: Run `cargo test` to verify failure**
- [x] **Step 3: Implement `TrustManager`, `WorkspaceTrustState`, and `Capability` in `trust.rs`**
- [x] **Step 4: Run `cargo test` to verify pass**
- [x] **Step 5: Commit task**

---

### Task 2: QuickJS Node Compatibility Layer (`path`, `os`, `events`, `fs`, `child_process`)
- Create: `crates/krypton-core-rs/src/ext_host/node_compat.rs`
- Modify: `crates/krypton-core-rs/src/ext_host/vscode_api/mod.rs`
- Test: `crates/krypton-core-rs/tests/ext_node_compat_test.rs`

- [x] **Step 1: Write failing test in `ext_node_compat_test.rs` for `path`, `os`, `events`, `fs`, and `child_process`**
- [x] **Step 2: Run `cargo test` to verify failure**
- [x] **Step 3: Implement Node compatibility CJS modules with trust capability checks**
- [x] **Step 4: Run `cargo test` to verify pass**
- [x] **Step 5: Commit task**

---

### Task 3: JNI & Kotlin Plugin Workspace Trust Bridge
- Modify: `crates/krypton-core-rs/src/ext_host/jni_bridge.rs`
- Modify: `android/app/src/main/java/com/sednium/kryptonide/extensions/ExtensionHostNative.kt`
- Modify: `android/app/src/main/java/com/sednium/kryptonide/extensions/ExtensionHostPlugin.kt`
- Test: `crates/krypton-core-rs/tests/ext_trust_test.rs`

- [x] **Step 1: Implement JNI functions for `nativeSetWorkspaceTrust`, `nativeGetWorkspaceTrust`, `nativeCheckCapability`**
- [x] **Step 2: Add external bindings in `ExtensionHostNative.kt`**
- [x] **Step 3: Add `@PluginMethod`s in `ExtensionHostPlugin.kt`**
- [x] **Step 4: Run `cargo test` and verify compilation**
- [x] **Step 5: Commit task**

---

### Task 4: TypeScript Trust Store & Permission Inspector
- Create: `src/store/useTrustStore.ts`
- Modify: `src/lib/extensions/nativeExtensionHost.ts`
- Test: `tests/trustStore.test.ts`

- [x] **Step 1: Write failing test in `tests/trustStore.test.ts` for trust state and permission extraction**
- [x] **Step 2: Run `npm test` to verify failure**
- [x] **Step 3: Implement `useTrustStore.ts` and update `nativeExtensionHost.ts` with trust methods and web mock**
- [x] **Step 4: Run `npm test` to verify pass**
- [x] **Step 5: Commit task**

---

### Task 5: UI Workspace Trust Banner, Status Bar Pill, & Consent Modal
- Create: `src/components/trust/WorkspaceTrustBanner.tsx`
- Create: `src/components/trust/ExtensionConsentModal.tsx`
- Modify: `src/components/layout/StatusBar.tsx`
- Modify: `src/components/editor/CodeEditor.tsx`
- Test: `tests/trustUi.test.ts`

- [x] **Step 1: Write failing test in `tests/trustUi.test.ts` for trust banner and modal triggers**
- [x] **Step 2: Run `npm test` to verify failure**
- [x] **Step 3: Implement `WorkspaceTrustBanner`, `ExtensionConsentModal`, and wire into editor and status bar**
- [x] **Step 4: Run `npm test` to verify pass**
- [x] **Step 5: Commit task**

---

### Task 6: Phase 5 End-to-End Integration Suite & Verification
- Create: `tests/extensionHostPhase5E2e.test.ts`

- [x] **Step 1: Implement full Phase 5 E2E test verifying child_process block in Restricted mode, execution in Trusted mode, FS gating, and consent dialog**
- [x] **Step 2: Run `cargo test` in `crates/krypton-core-rs`**
- [x] **Step 3: Run `npm test` across all TypeScript test suites**
- [x] **Step 4: Run `npx tsc --noEmit` to verify type safety**
- [x] **Step 5: Commit task and create Walkthrough artifact**

---

## 3. Verification Commands

1. **Rust Core:**
   `cd crates/krypton-core-rs && cargo test` (58/58 passed)
2. **TypeScript & IDE:**
   `npm test` (116/116 passed)
3. **Type Checking:**
   `npx tsc --noEmit` (exit code 0, 0 errors)
