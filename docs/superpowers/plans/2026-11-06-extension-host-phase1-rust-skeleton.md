# Extension Host Phase 1 — Rust ext_host Skeleton, JNI & Kotlin Plugin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the native extension host foundation so that a `.vsix` archive is installed natively into application storage, its manifest (`package.json`) and contributions are parsed natively in Rust, indexed in native storage, exposed via JNI to Android Kotlin (`ExtensionHostPlugin`), bridged to TypeScript (`nativeExtensionHost.ts`), and reflected in the IDE store (`useExtensionHostStore.ts`).

**Architecture:** Native storage `<app_files>/extensions/` is the single source of truth on native devices. Unpacking and manifest analysis run directly in Rust (`crates/krypton-core-rs`). Android Kotlin acts as the Capacitor plugin bridge, exposing clean async methods and contribution change events to the React frontend.

**Tech Stack:** Rust 2021 (serde, serde_json, zip, jni), Kotlin (Capacitor 7 Plugin), React 19, TypeScript, Zustand 5, Vite 6, `node:test` + `tsx`.

**Spec:** `docs/design/krypton-native-extension-host.md`

## Global Constraints

- Do not break existing web declarative install pipeline (`useExtensionsStore.ts`).
- Rust panics must never cross the foreign ABI into the JVM (wrap in `catch_unwind`).
- Path traversal / zip-slip must be strictly blocked on all VSIX extractions.
- Keep `cargo check`, `cargo test`, `npm test`, and `npx tsc --noEmit` green.

---

### Task 1: Rust `ext_host` Manifest Model & Parser

**Files:**
- Create: `crates/krypton-core-rs/src/ext_host/manifest.rs`
- Create: `crates/krypton-core-rs/src/ext_host/mod.rs`
- Modify: `crates/krypton-core-rs/src/lib.rs`
- Test: `crates/krypton-core-rs/tests/ext_manifest_test.rs`

- [x] **Step 1: Write the failing Rust integration test**
- [x] **Step 2: Run `cargo test --test ext_manifest_test` to verify failure**
- [x] **Step 3: Implement `ExtensionManifest` and serde models**
- [x] **Step 4: Run `cargo test --test ext_manifest_test` to verify pass**
- [x] **Step 5: Commit task**

---

### Task 2: Rust VSIX Unpacker & Catalog Indexer

**Files:**
- Modify: `crates/krypton-core-rs/Cargo.toml`
- Create: `crates/krypton-core-rs/src/ext_host/installer.rs`
- Modify: `crates/krypton-core-rs/src/ext_host/mod.rs`
- Test: `crates/krypton-core-rs/tests/ext_installer_test.rs`

- [x] **Step 1: Write failing unpacker test with mock VSIX**
- [x] **Step 2: Run `cargo test --test ext_installer_test` to verify failure**
- [x] **Step 3: Implement zip-safe extraction and catalog indexing**
- [x] **Step 4: Run `cargo test --test ext_installer_test` to verify pass**
- [x] **Step 5: Commit task**

---

### Task 3: JNI Foreign Function Interface

**Files:**
- Create: `crates/krypton-core-rs/src/ext_host/jni_bridge.rs`
- Modify: `crates/krypton-core-rs/src/jni_bridge.rs`

- [x] **Step 1: Write JNI extern C methods with catch_unwind**
- [x] **Step 2: Run `cargo check` to verify compilation on desktop and Android target**
- [x] **Step 3: Commit task**

---

### Task 4: Android Kotlin Capacitor Plugin

**Files:**
- Create: `android/app/src/main/java/com/sednium/kryptonide/extensions/ExtensionHostNative.kt`
- Create: `android/app/src/main/java/com/sednium/kryptonide/extensions/ExtensionHostPlugin.kt`
- Modify: `android/app/src/main/java/com/sednium/kryptonide/MainActivity.java`

- [ ] **Step 1: Define Kotlin external bindings in `ExtensionHostNative.kt`**
- [ ] **Step 2: Implement `@CapacitorPlugin(name = "ExtensionHost")`**
- [ ] **Step 3: Register in `MainActivity.java`**
- [ ] **Step 4: Commit task**

---

### Task 5: TypeScript Native Extension Host Bridge & Store

**Files:**
- Create: `src/lib/extensions/nativeExtensionHost.ts`
- Create: `src/store/useExtensionHostStore.ts`
- Test: `tests/nativeExtensionHost.test.ts`

- [ ] **Step 1: Write unit tests for TypeScript bridge & store**
- [ ] **Step 2: Run `npx tsx --test tests/nativeExtensionHost.test.ts` to verify failure**
- [ ] **Step 3: Implement `nativeExtensionHost.ts` and `useExtensionHostStore.ts`**
- [ ] **Step 4: Verify test passes**
- [ ] **Step 5: Commit task**

---

### Task 6: UI Surfacing & Regression Verification

**Files:**
- Modify: `src/components/extensions/ExtensionDetailModal.tsx`
- Modify: `src/components/layout/IdeLayout.tsx`
- Test: `tests/extensionHostPhase1E2e.test.ts`

- [ ] **Step 1: Initialize host store on IDE layout mount**
- [ ] **Step 2: Surface native manifest metadata in detail modal**
- [ ] **Step 3: Run full verification: `cargo test`, `npm test`, `npx tsc --noEmit`**
- [ ] **Step 4: Commit task**
