# Extension Host Phase 3 — Dynamic Activity Bar, Views, Commands, Status Bar & Settings

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect extension manifest contributions (`viewsContainers.activitybar`, `views`, `commands`, `configuration`) and runtime APIs (`vscode.window.createStatusBarItem`) directly into the Krypton IDE UI with full control-to-effect execution under `/no-shortcuts`.

**Architecture:**
1. Extension view containers (`viewsContainers.activitybar`) register as unpinned custom tools in `useNavbarStore`, appearing in the "More" overflow modal by default and pinnable to the activity bar / navbar rail.
2. Contributed views (`views[containerId]`) render inside `ExtensionViewPanel.tsx` (webviews to `ExtensionWebviewHost`, honest tree/empty state).
3. Contributed commands (`contributes.commands`) merge into the Command Palette and execute via `useExtensionHostStore.executeCommand()`, auto-activating the extension on invocation.
4. QuickJS `vscode.window.createStatusBarItem` bridges to `StatusBar.tsx` via JNI/Capacitor/TypeScript store with click-to-command dispatch.
5. Contributed configurations (`contributes.configuration`) render dynamically in Settings and sync to `workspace.getConfiguration()`.

**Tech Stack:** Rust 2021 (rquickjs 0.14), Android Kotlin (Capacitor 7), TypeScript, React 19, Zustand 5, `node:test` + `tsx`.

**Spec:** `docs/design/krypton-native-extension-host.md`

## Global Constraints

- `/no-shortcuts`: Every UI element must trace end-to-end to an actual execution or mutation. No synthetic placeholder buttons or dead state counters.
- Dynamic purity: Fail visibly, no hardcoded catalog fallbacks.
- Keep `cargo test`, `npm test`, and `npx tsc --noEmit` green.

---

### Task 1: Activity Bar / More Section Contributions (`useNavbarStore.ts`)

**Files:**
- Modify: `src/store/useNavbarStore.ts`
- Test: `tests/extensionNavbarContributions.test.ts`

- [x] **Step 1: Write failing test in `tests/extensionNavbarContributions.test.ts` for host extension activity bar syncing**
- [x] **Step 2: Run `npm test` to verify failure**
- [x] **Step 3: Update `useNavbarStore.ts` to source from `useExtensionHostStore.installedExtensions` (unpinned in More section by default)**
- [x] **Step 4: Run `npm test` to verify pass**
- [x] **Step 5: Commit task**

---

### Task 2: Dynamic Extension View Container & Panel Rendering (`ExtensionViewPanel.tsx`)

**Files:**
- Modify: `src/components/sidebar/ExtensionViewPanel.tsx`
- Modify: `src/store/useIdeStore.ts` (if view state requires alignment)
- Test: `tests/extensionViewPanel.test.ts`

- [x] **Step 1: Write failing test for dynamic view container resolution and webview container mounting**
- [x] **Step 2: Run `npm test` to verify failure**
- [x] **Step 3: Implement dynamic view lookup and rendering in `ExtensionViewPanel.tsx`**
- [x] **Step 4: Run `npm test` to verify pass**
- [x] **Step 5: Commit task**

---

### Task 3: Command Palette Dynamic Integration & Execution Bridge

**Files:**
- Modify: `src/store/useExtensionHostStore.ts`
- Modify: `src/components/command-palette/CommandPalette.tsx` (or command palette store)
- Test: `tests/extensionCommandPalette.test.ts`

- [x] **Step 1: Write failing test for palette contributed commands aggregation and execution**
- [x] **Step 2: Run `npm test` to verify failure**
- [x] **Step 3: Connect contributed commands into Command Palette with auto-activation**
- [x] **Step 4: Run `npm test` to verify pass**
- [x] **Step 5: Commit task**

---

### Task 4: Runtime Status Bar Items (`vscode.window.createStatusBarItem`)

**Files:**
- Modify: `crates/krypton-core-rs/src/ext_host/vscode_api/window.rs`
- Modify: `crates/krypton-core-rs/src/ext_host/jni_bridge.rs`
- Modify: `android/app/src/main/java/com/sednium/kryptonide/extensions/ExtensionHostPlugin.kt`
- Modify: `src/lib/extensions/nativeExtensionHost.ts`
- Modify: `src/store/useExtensionHostStore.ts`
- Modify: `src/components/layout/StatusBar.tsx`
- Test: `crates/krypton-core-rs/tests/ext_statusbar_test.rs` & `tests/extensionStatusBar.test.ts`

- [x] **Step 1: Write failing Rust test for `createStatusBarItem` object model**
- [x] **Step 2: Implement Rust `createStatusBarItem` in `window.rs` and JNI drain/query**
- [x] **Step 3: Bridge to TypeScript store and render contributed items in `StatusBar.tsx`**
- [x] **Step 4: Run `cargo test` and `npm test` to verify pass**
- [x] **Step 5: Commit task**

---

### Task 5: Dynamic Extension Configuration & Settings

**Files:**
- Modify: `src/components/settings/SettingsModal.tsx`
- Modify: `src/store/useExtensionHostStore.ts`
- Test: `tests/extensionConfiguration.test.ts`

- [x] **Step 1: Write failing test for dynamic configuration schema parsing and value persistence**
- [x] **Step 2: Run `npm test` to verify failure**
- [x] **Step 3: Implement dynamic Extensions settings section and workspace configuration sync**
- [x] **Step 4: Run `npm test` to verify pass**
- [x] **Step 5: Commit task**

---

### Task 6: Phase 3 End-to-End UI Integration Suite

**Files:**
- Create: `tests/fixtures/sample-ui-ext/package.json`
- Create: `tests/fixtures/sample-ui-ext/main.js`
- Test: `tests/extensionHostPhase3E2e.test.ts`

- [x] **Step 1: Create fixture extension exercising activity bar, views, commands, status bar, and settings**
- [x] **Step 2: Implement full E2E test suite in `tests/extensionHostPhase3E2e.test.ts`**
- [x] **Step 3: Verify all test gates: `cargo test`, `npm test`, and `npx tsc --noEmit`**
- [x] **Step 4: Commit task**
