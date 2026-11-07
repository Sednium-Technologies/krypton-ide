# Implementation Plan: Native Extension Host Phase 6 (Tests, Fixtures, Docs, Hardening)

**Branch:** `feat/extension-host-phase6`  
**Spec Reference:** [`docs/design/krypton-native-extension-host.md`](file:///run/media/bhoid/StorageVault/WEbs/krypton-ide/docs/design/krypton-native-extension-host.md)  
**Discipline:** `/no-shortcuts` — Empirical verification, real OPC VSIX packages, multi-fixture matrix, zero synthetic facades.

---

## 1. Objectives

Phase 6 completes the Native Extension Host roadmap by delivering comprehensive test coverage, authentic fixture extensions across all supported contribution types, robustness/security hardening, and production developer documentation:

1. **Complete VSIX Fixture Matrix (`tests/fixtures/`):**
   - `sample-theme-ext`: Authentic theme extension with real VS Code color tokens.
   - `sample-snippets-ext`: Code snippets pack extension.
   - `sample-treeview-ext`: Dynamic activity bar and custom view container extension.
   - `sample-webview-ext`: Interactive webview panel extension with bidirectional message routing.
   - `sample-lsp-ext`: Language server client extension bootstrapping `LanguageClient`.
   - `sample-agent-ext`: Agent harness extension exposing custom tools and automated commands.
   - `packVsix.ts`: Deterministic OPC VSIX packaging script generating valid `.vsix` archives.
2. **Rust Core Robustness & Stress Hardening (`crates/krypton-core-rs/tests/ext_hardening_test.rs`):**
   - Corrupted/truncated VSIX archives, malformed manifests, path traversal attacks, rapid activation/deactivation cycles, QuickJS error boundaries.
3. **End-to-End Test Matrix (`tests/extensionHostPhase6E2e.test.ts`):**
   - End-to-end installation, contribution registration, activation, execution, and uninstallation of all 6 fixture VSIXs.
4. **Developer Documentation & Design Spec Update:**
   - Create `docs/extensions/extension-authoring-guide.md` (VS Code API subset, Node compat, packaging, Workspace Trust).
   - Update `docs/design/krypton-native-extension-host.md` status to Complete (Phases 0-6 complete).
   - Update root `README.md` highlighting the native QuickJS extension host.

---

## 2. Proposed Changes & Task Breakdown

### Task 1: Complete VSIX Sample Extension Fixture Matrix & Packager
- Create: `tests/fixtures/sample-theme-ext/package.json` & `syntaxes/theme.json`
- Create: `tests/fixtures/sample-snippets-ext/package.json` & `snippets/typescript.json`
- Create: `tests/fixtures/sample-treeview-ext/package.json` & `main.js`
- Create: `tests/fixtures/sample-webview-ext/package.json` & `main.js`
- Create: `tests/fixtures/sample-lsp-ext/package.json` & `main.js`
- Create: `tests/fixtures/sample-agent-ext/package.json` & `main.js`
- Create: `tests/fixtures/packVsix.ts` (OPC zip builder with `[Content_Types].xml`, `extension.vsixmanifest`)
- Test: `tests/vsixPackager.test.ts`

- [x] **Step 1: Implement VSIX packager in `tests/fixtures/packVsix.ts`**
- [x] **Step 2: Create authentic fixtures across all 6 categories**
- [x] **Step 3: Write test `tests/vsixPackager.test.ts` verifying VSIX archive generation and CRC/structure**
- [x] **Step 4: Run `npm test tests/vsixPackager.test.ts`**
- [x] **Step 5: Commit task**

---

### Task 2: Rust Core Hardening & Stress Matrix
- Create: `crates/krypton-core-rs/tests/ext_hardening_test.rs`
- Modify: `crates/krypton-core-rs/src/ext_host/installer.rs` (if error handling needs additional guards)

- [x] **Step 1: Write stress tests in `ext_hardening_test.rs` (corrupted zip, missing manifest, directory traversal, syntax errors)**
- [x] **Step 2: Run `cargo test --test ext_hardening_test`**
- [x] **Step 3: Verify clean error handling without panics**
- [x] **Step 4: Commit task**

---

### Task 3: Full Device E2E Integration Test Suite
- Create: `tests/extensionHostPhase6E2e.test.ts`

- [x] **Step 1: Implement Phase 6 E2E test exercising all 6 fixtures end-to-end**
- [x] **Step 2: Verify theme registration, snippet availability, tree view rendering, webview communication, LSP start, and agent commands**
- [x] **Step 3: Verify clean uninstallation and contribution cleanup for all 6 extensions**
- [x] **Step 4: Run `npm test tests/extensionHostPhase6E2e.test.ts`**
- [x] **Step 5: Commit task**

---

### Task 4: Extension Authoring Documentation & Architecture Guide
- Create: `docs/extensions/extension-authoring-guide.md`
- Modify: `docs/design/krypton-native-extension-host.md`
- Modify: `README.md`

- [x] **Step 1: Author `docs/extensions/extension-authoring-guide.md` with complete API reference and packaging guides**
- [x] **Step 2: Update `docs/design/krypton-native-extension-host.md` status to Complete (Phases 0-6 delivered)**
- [x] **Step 3: Update `README.md` with Extension Host overview**
- [x] **Step 4: Commit task**

---

### Task 5: Final Multi-Gate Verification Across Entire Codebase
- [x] **Step 1: Run full Rust test suite `cd crates/krypton-core-rs && cargo test` (67/67 passed)**
- [x] **Step 2: Run full TypeScript test suite `npm test` (127/127 passed)**
- [x] **Step 3: Run full type check `npx tsc --noEmit` (0 errors, clean exit 0)**
- [x] **Step 4: Generate final Walkthrough artifact**

---

## 3. Verification Commands

1. **Rust Core:** `cd crates/krypton-core-rs && cargo test` (67/67 passed)
2. **TypeScript & IDE:** `npm test` (127/127 passed)
3. **Type Checking:** `npx tsc --noEmit` (0 errors)
