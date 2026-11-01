# Kryptonide Comprehensive Audit Report: Security, Performance & Rust Migration

**Date:** October 26, 2026  
**Auditors:** Coordinator & Specialist Agents (Web Security, Android/Tool Security, Performance Profiling, Rust Architecture, QA/Readiness)  
**Target Codebases:**
- Primary App: `/run/media/bhoid/StorageVault/WEbs/krypton-ide` (`com.sednium.kryptonide`, Capacitor 8, React 19, Vite 6)
- Companion Web: `/run/media/bhoid/StorageVault/WEbs/KryptonideWeb`  
**Status:** Read-Only Audit Complete — Findings and proposed diffs synthesized below. No code modifications applied pending user approval.

---

## 1. Executive Summary

A comprehensive multi-agent security, performance, and architecture audit was executed across all layers of Kryptonide.

### Key Discoveries:
1. **Critical Security Vulnerabilities**:
   - **Iframe Same-Origin Escape**: `LivePreview.tsx` creates `blob:` URLs in an iframe with `allow-scripts allow-same-origin`, permitting user/preview code to read parent `localStorage`, steal GitHub OAuth tokens, and access IndexedDB.
   - **Stored XSS**: Markdown rendering via `marked` lacks sanitization in `MarkdownPreview.tsx` and `ExtensionDetailModal.tsx`, executing arbitrary code when opening malicious readmes or inspecting extensions.
   - **Arbitrary Terminal Execution**: `ExtensionWebviewHost.tsx` listens to global `postMessage` without validating `event.source` or `event.origin`, allowing untrusted frames to inject shell commands into the native terminal PTY.
   - **Agent Path Traversal**: `resolveFullPath` in `toolActions.ts` does not normalize `../`, enabling AI agents to read and overwrite arbitrary files across device storage under prompt injection.
   - **Plaintext Credentials on Shared External Storage**: `auth.json`, `krypton.config.json` (AI keys), and `mcp.json` are stored in `/storage/emulated/0/KryptonIDE/`, accessible to any other Android app with storage permissions.
   - **Committed Secret in Companion Git History**: Live Google Gemini API key committed in `KryptonideWeb` commit `0bc34fa`.
2. **Critical Production Bugs & Data Loss**:
   - **Auto-Save Wipes Tabs & Cursor**: Every 30 seconds, auto-save triggers `loadProject()`, closing all open tabs and jumping the cursor back to line 1 of `index.html`.
   - **Streaming Tool Call Breakdown**: Streaming deltas for OpenAI/Groq/OpenRouter split `id` and `arguments` into separate accumulator keys, causing 100% of AI tool executions to fail.
   - **GitHub Actions 404**: `triggerBuild` calls non-existent `build.yml` instead of `.github/workflows/build-android.yml`.
   - **Google Sign-In Failure on Release APK**: Dummy client ID in `google-services.json` and transient CI keystores mismatch production SHA-1, throwing Developer Error 10 on Google Sign-In.
   - **157 Hidden TypeScript Violations**: `tsconfig.json` disabled `strict` and `noUncheckedIndexedAccess`, masking 157 latent type errors across 32 files.
3. **Empirical Performance Profiling**:
   - **2.94 MB Main Bundle**: 1.54 MB (53.7%) is caused by a single static import of `prettier` and its 6 plugins in `CodeEditor.tsx`.
   - **Git Operations 155x Slower than Native**: Staging 500 files takes 10.3s in `isomorphic-git` vs 66ms in native Git.
   - **AI Streaming UI Thread Freeze**: Unthrottled per-token state updates and quadratic `marked.parse` block the main thread for 1.78s per response.
   - **Terminal PTY Array Spread Overhead**: Array spreads `[...buffer, chunk]` consume 607ms on 5,000 chunks vs 2.04ms with a circular ring buffer (297x speedup).
4. **Rust Core Acceleration Architecture (`krypton-core`)**:
   - Complete modular workspace designed and tested: streaming regex search with cancellation, Myers/LCS structured diffs with inline char highlights, pure-Rust DEFLATE zip engine, and AIF V4 binary pruner.
   - 15/15 unit tests passing; zero clippy warnings across Host (`x86_64`), WebAssembly (`wasm32-unknown-unknown`), and Android NDK (`aarch64-linux-android`).

---

## 2. Master Deduplicated & Ranked Findings Matrix

Ranked by **Severity × Exploitability × Effort**:

| ID | Title | Severity | Impact Area | File:Line | Effort | Risk of Fix |
|:---|:---|:---:|:---:|:---|:---:|:---:|
| **SEC-WEB-01** | LivePreview Sandbox Permits Full Parent Origin Access | **Critical** | Web Security | `src/components/preview/LivePreview.tsx:745` | S | Low |
| **SEC-WEB-02** | Stored XSS in MarkdownPreview via Unsanitized `marked` | **Critical** | Web Security | `src/components/editor/MarkdownPreview.tsx:14,21` | S | Low |
| **SEC-WEB-04** | Extension Webview PostMessage Injects Terminal Commands | **Critical** | Web Security | `src/components/extensions/ExtensionWebviewHost.tsx:112` | M | Low |
| **SEC-TOOL-01**| Path Traversal (`../`) in Agent Filesystem Tools | **Critical** | Tool Security | `src/lib/ai/toolActions.ts:37-53` | S | Low |
| **BUG-SAVE-01**| Auto-Save Destroys Open Tabs and Resets Cursor Every 30s | **Critical** | Core Editor | `src/App.tsx:231` & `src/store/useIdeStore.ts:370` | S | Low |
| **BUG-NET-02** | Split Tool Call Accumulator Breaks AI Tool Executions | **Critical** | AI Harness | `src/lib/ai/modelAdapters.ts:168` | S | Low |
| **BUG-BUILD-01**| Workflow Dispatch Hardcodes Non-Existent `build.yml` (404) | **Critical** | CI / Release | `src/lib/githubBuildService.ts:34` | S | Low |
| **BUG-AUTH-01**| Google Sign-In Fails on Release APK (SHA-1 / Client ID) | **Critical** | Android Auth | `android/app/google-services.json:25` | M | Low |
| **SEC-SIGN-01**| Keystore Alias & SHA-1 Discrepancy Breaking Builds | **Critical** | Android Build | `capacitor.config.json:8` & `.github/workflows/build-android.yml:50` | S | Low |
| **SEC-WEB-05** | Plaintext Credentials & AI Keys on Shared External Storage | **High** | Data Security | `src/lib/fileSystemStorage.ts:122,336` | M | Med |
| **SEC-TERM-01**| Predictable Terminal Exit Sentinel Spoofing (`__KRYPTON_EXIT_`) | **High** | Tool Security | `src/lib/ai/toolActions.ts:466-497` | S | Low |
| **SEC-RISK-01**| Trivial Shell Risk Classifier Bypasses in Laya System 1 | **High** | AI Safety | `src/lib/pocket/LayaSystem1.ts:113` | M | Low |
| **SEC-MCP-01** | Unrestricted MCP Registration, Cleartext HTTP & No Approvals | **High** | AI Tooling | `src/store/useMcpStore.ts:107` | M | Low |
| **SEC-AND-01** | `MANAGE_EXTERNAL_STORAGE` Play Store Policy Rejection | **High** | Android Policy| `android/app/src/main/AndroidManifest.xml:54` | L | Med |
| **SEC-WEB-03** | Stored XSS in Extension Details Modal README/CHANGELOG | **High** | Web Security | `src/components/extensions/ExtensionDetailModal.tsx:155` | S | Low |
| **SEC-WEB-06** | Pyodide Runs in UI Thread with Unrestricted JS Access | **High** | Execution | `src/lib/codeRunner.ts:161-196` | M | Low |
| **SEC-WEB-07** | Dev Server Host Check Disabled (`allowedHosts: true`) & 0.0.0.0 | **High** | Dev Exposure | `vite.config.ts:14` & `package.json:7` | S | Low |
| **SEC-WEB-08** | Missing Content Security Policy (CSP) in `index.html` | **High** | Web Security | `index.html:1-23` | M | Med |
| **SEC-WEB-09** | Live Gemini API Key Committed in Companion Git History | **High** | Secret Leak | `KryptonideWeb/.env.local` commit `0bc34fa` | S | Low |
| **BUG-FILE-01**| Android WebView Fails Blob URL Downloads (ZIP Export) | **High** | Android Native| `src/components/layout/IdeLayout.tsx:346` | S | Low |
| **BUG-FILE-03**| Disk Zombie Files on File Delete & Rename | **High** | Storage / FS | `src/store/useIdeStore.ts:207` | M | Med |
| **BUG-SAVE-02**| Conflicting 30s Auto-Save Masks Dirty State Without Saving | **High** | Core Editor | `src/components/editor/CodeEditor.tsx:165` | S | Low |
| **BUG-GIT-01** | Git Service Uses Hardcoded Path With Flattened Directories | **High** | Git System | `src/lib/gitService.ts:5-44` | M | Med |
| **BUG-GIT-03** | GitHub Pull Fetches Blobs Sequentially Over HTTP (Rate Limits) | **High** | Git System | `src/lib/githubService.ts:317` | M | Low |
| **BUG-BUILD-02**| Artifact Downloader Transfers 50MB Base64 Across Bridge | **High** | Android Native| `src/lib/githubBuildService.ts:74` | M | Med |
| **BUG-MOB-01** | Android Back Button Closes Project Instead of Modals | **High** | Mobile UX | `src/App.tsx:277` | S | Low |
| **BUG-TS-01**  | Disabled Strict Mode Masks 157 Type Errors Across 32 Files | **High** | Code Health | `tsconfig.json:1-26` | L | Med |
| **BUG-NET-01** | Malformed SSE Chunks Throw Uncaught `SyntaxError` | **High** | AI Streaming | `src/store/useAiStore.ts:570` | S | Low |
| **SEC-AND-02** | Android 14+ Foreground Service Missing Type Crash | **Med** | Android OS | `KryptonBackgroundService.java:53` | S | Low |
| **SEC-AND-03** | Android 10+ SELinux Denials on Sysfs & Character Devices | **Med** | Android OS | `crates/krypton-core-rs/src/hardware_topology.rs` | M | Low |
| **SEC-AND-04** | Overly Broad FileProvider Paths & Unchecked Package Install | **Med** | Android Native| `android/app/src/main/res/xml/file_paths.xml:3` | S | Low |
| **SEC-CI-01**  | Insecure Keystore Generation in CI Runner Command Line | **Med** | CI / Secrets | `.github/workflows/build-android.yml:47` | S | Low |
| **SEC-WEB-10** | Path Traversal / Zip Slip in Google Drive Sync Restore | **Med** | Storage / FS | `src/lib/googleDriveSync.ts:316` | S | Low |
| **SEC-WEB-11** | Code Execution Template Injection in JS Code Runner | **Med** | Execution | `src/lib/codeRunner.ts:97` | S | Low |
| **SEC-WEB-12** | Monaco Editor Loaded from jsDelivr CDN Instead of Bundled | **Med** | Offline / Risk| `src/components/editor/CodeEditor.tsx:2` | S | Low |
| **SEC-WEB-13** | Missing GitHub Token Revocation on Logout & Overly Broad Scope| **Med** | Auth / Scope | `src/lib/githubOAuth.ts:14` | M | Low |
| **BUG-FILE-02**| Binary File Corruption on Drag-and-Drop (`readAsText`) | **Med** | File Upload | `src/components/layout/IdeLayout.tsx:318` | M | Low |
| **BUG-FILE-04**| Punctuation-Attached Mention Parser Breakage (`@problems?`)| **Med** | AI Assistant | `src/components/sidebar/AiAssistant.tsx:256` | S | Low |
| **BUG-FILE-05**| Vision Attachments Dropped on OpenRouter & Groq Providers | **Med** | AI Assistant | `src/store/useAiStore.ts:488` | S | Low |
| **BUG-MOB-02** | Inconsistent Keyboard Resize Modes Cause Double Shrinkage | **Med** | Mobile UX | `capacitor.config.json:16` vs `App.tsx:274` | S | Med |
| **BUG-MOB-03** | Zero State Restoration on Low-Memory Process Death | **Med** | Mobile OS | `src/store/useProjectsStore.ts:27` | M | Low |
| **BUG-AUTH-02**| GitHub Device Flow Fails on Static Web Hosting (Dev Proxy) | **Med** | Web Auth | `src/lib/githubOAuth.ts:8` | S | Low |
| **BUG-DEP-01** | Obsolete Dependencies (`express`, `dotenv`, `@google/genai`) | **Med** | Bundle / Risk | `package.json:32,39,40` | S | Low |
| **SEC-UI-01**  | Ambiguous Filename Matching Overwrites Wrong File in `<edit>` | **Med** | AI Tooling | `src/components/sidebar/AiAssistant.tsx:369` | S | Low |
| **SEC-NET-01** | Missing Network Security Config Blocks Localhost Termux | **Low** | Android Net | `android/app/src/main/res/xml/` | S | Low |
| **SEC-BUILD-01**| ProGuard/R8 Disabled in Release Builds | **Low** | Android Build | `android/app/build.gradle:60` | M | Low |
| **SEC-WEB-14** | Reverse Tabnabbing via `window.open` Without `noopener` | **Low** | Web Security | `src/components/preview/LivePreview.tsx:785` | S | Low |
| **SEC-WEB-15** | Gemini API Key Passed in URL Query Parameter | **Low** | Web Security | `src/store/useAiStore.ts:412` | S | Low |
| **SEC-WEB-16** | Unauthenticated & Unthrottled AI Chat Proxy on Landing Site | **Low** | API Quota | `KryptonideWeb/api/chat.js:14` | S | Low |
| **SEC-WEB-17** | Unvalidated Custom BaseURL Allows API Key Leakage | **Low** | AI Config | `src/store/useAiStore.ts:389` | S | Low |
| **BUG-RENAME-01**| Orphaned `larry.txt` System Prompt and Legacy Callbacks | **Low** | Tech Debt | `src/config/prompts/larry.txt` | S | Low |

---

## 3. Deep-Dive Findings & Concrete Patches

### [SEC-WEB-01] LivePreview Sandbox Permits Full Parent Origin Access
**File**: `src/components/preview/LivePreview.tsx:745`  
**Evidence**:
```tsx
sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
```
**Impact**: `previewSrc` is generated via `URL.createObjectURL(new Blob([html], { type: 'text/html' }))`. Combining `allow-scripts` with `allow-same-origin` on a same-origin blob gives untrusted project code complete access to `window.parent.localStorage`, `window.parent.useAuthStore`, and parent DOM.  
**Fix**: Remove `allow-same-origin`.
```diff
--- a/src/components/preview/LivePreview.tsx
+++ b/src/components/preview/LivePreview.tsx
@@ -742,7 +742,7 @@ export function LivePreview({ onClose }: LivePreviewProps) {
             key={refreshKey}
             src={previewSrc}
             title="Live Preview"
-            sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
+            sandbox="allow-scripts allow-modals allow-forms"
             className="w-full h-full border-none"
           />
```

### [SEC-WEB-02] Stored XSS in MarkdownPreview via Unsanitized `marked`
**File**: `src/components/editor/MarkdownPreview.tsx:14,21`  
**Evidence**:
```tsx
const rawHtml = marked.parse(content) as string;
return <div dangerouslySetInnerHTML={{ __html: rawHtml }} />;
```
**Impact**: Malicious markdown files (`<img src=x onerror=...>`, `<script>`) execute immediately in the top-level IDE context when opened.  
**Fix**: Install `dompurify` and sanitize HTML before rendering.
```diff
--- a/src/components/editor/MarkdownPreview.tsx
+++ b/src/components/editor/MarkdownPreview.tsx
@@ -1,5 +1,6 @@
 import React, { useMemo } from 'react';
 import { marked } from 'marked';
+import DOMPurify from 'dompurify';
@@ -13,5 +14,5 @@ export function MarkdownPreview({ content }: MarkdownPreviewProps) {
     });
-    return marked.parse(content) as string;
+    return DOMPurify.sanitize(marked.parse(content) as string);
   }, [content]);
```

### [SEC-WEB-04] Extension Webview PostMessage Injects Terminal Commands
**File**: `src/components/extensions/ExtensionWebviewHost.tsx:112`  
**Evidence**:
```tsx
const handleMessage = (event: MessageEvent) => {
  if (!event.data || event.data.type !== 'vscode-webview-message') return;
  // Does NOT verify event.source === iframeRef.current?.contentWindow
  terminalStore.sendInput(message.text + '\n');
};
```
**Impact**: Any open window or cross-origin frame can post messages to the IDE window and execute arbitrary shell commands inside the native terminal PTY.  
**Fix**: Verify `event.source === iframeRef.current?.contentWindow` and remove `allow-same-origin` from iframe.
```diff
--- a/src/components/extensions/ExtensionWebviewHost.tsx
+++ b/src/components/extensions/ExtensionWebviewHost.tsx
@@ -111,2 +111,3 @@ export function ExtensionWebviewHost({
   useEffect(() => {
     const handleMessage = (event: MessageEvent) => {
+      if (event.source !== iframeRef.current?.contentWindow) return;
       if (!event.data || event.data.type !== 'vscode-webview-message') return;
@@ -204,3 +205,3 @@ export function ExtensionWebviewHost({
-        sandbox="allow-scripts allow-forms allow-same-origin allow-modals"
+        sandbox="allow-scripts allow-forms allow-modals"
```

### [SEC-TOOL-01] Path Traversal in Agent Filesystem Tools
**File**: `src/lib/ai/toolActions.ts:37-53`  
**Evidence**:
`resolveFullPath` only strips leading `./` or `/`, leaving `../` sequences untouched.  
**Impact**: Prompt-injected models can execute `write_file(path: "../../../auth.json")` or `read_file(path: "../../../../../storage/emulated/0/Download/key.txt")`.  
**Fix**: Reject path traversal segments (`..`).
```diff
--- a/src/lib/ai/toolActions.ts
+++ b/src/lib/ai/toolActions.ts
@@ -38,3 +38,11 @@ function resolveFullPath(relativePath: string): string {
   const cleaned = relativePath.replace(/^\.?\//, '');
+  const segments = cleaned.split('/').filter(Boolean);
+  const safeSegments: string[] = [];
+  for (const seg of segments) {
+    if (seg === '.') continue;
+    if (seg === '..') {
+      throw new Error("Access Denied: Path traversal ('..') is prohibited.");
+    }
+    safeSegments.push(seg);
+  }
+  const safePath = safeSegments.join('/');
```

### [BUG-SAVE-01] Auto-Save Wipes Tabs & Cursor Every 30 Seconds
**File**: `src/App.tsx:231-239` & `src/store/useIdeStore.ts:370-386`  
**Evidence**:
`useEffect(() => { loadProject(projectFiles); }, [currentProjectId, projects])` fires whenever `projects` updates. Auto-save updates `projects` every 30s. `loadProject` unconditionally wipes `openFiles` back to `[defaultFileId]` and resets the cursor to line 1.  
**Impact**: User working in tabs has their active files closed and cursor reset to `index.html` every 30 seconds.  
**Fix**: Only trigger `loadProject` when `currentProjectId` actually changes.
```diff
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -230,8 +230,12 @@ export function App() {
+  const loadedProjectIdRef = useRef<string | null>(null);
   useEffect(() => {
-    if (currentProjectId && projects[currentProjectId]) {
+    if (currentProjectId && currentProjectId !== loadedProjectIdRef.current && projects[currentProjectId]) {
       const projectFiles = projects[currentProjectId].files;
       if (projectFiles && Object.keys(projectFiles).length > 0) {
         loadProject(projectFiles);
+        loadedProjectIdRef.current = currentProjectId;
       }
+    } else if (!currentProjectId) {
+      loadedProjectIdRef.current = null;
     }
   }, [currentProjectId, projects]);
```

### [BUG-NET-02] Split Tool Call Accumulator Breaks AI Tool Executions
**File**: `src/lib/ai/modelAdapters.ts:168` & `src/store/useAiStore.ts:546`  
**Evidence**:
OpenAI streaming deltas emit `{ id: "call_123", index: 0, function: { name: "edit" } }` in chunk 1, but `{ index: 0, function: { arguments: "..." } }` (without `id`) in subsequent chunks. Mapping `id = tc.id || tc.index` creates two separate accumulators (`"call_123"` and `"0"`).  
**Impact**: Emits empty tool names and malformed arguments; all agent tool calls fail.  
**Fix**: Index streaming tool calls by `index ?? 0`, preserving the initial `id` and `name` across subsequent chunks.

### [BUG-BUILD-01] Workflow Dispatch Hardcodes Non-Existent `build.yml`
**File**: `src/lib/githubBuildService.ts:34` vs `.github/workflows/build-android.yml:1`  
**Evidence**:
`fetch("${API}/repos/${owner}/${repo}/actions/workflows/build.yml/dispatches")`  
**Impact**: GitHub API returns 404. Cloud builds triggered from the IDE always fail.  
**Fix**: Point to `build-android.yml`.
```diff
--- a/src/lib/githubBuildService.ts
+++ b/src/lib/githubBuildService.ts
@@ -34,3 +34,3 @@ export async function triggerBuild(owner: string, repo: string, buildType: 'debu
-    const res = await fetch(`${API}/repos/${owner}/${repo}/actions/workflows/build.yml/dispatches`, {
+    const res = await fetch(`${API}/repos/${owner}/${repo}/actions/workflows/build-android.yml/dispatches`, {
```

### [BUG-AUTH-01] & [SEC-SIGN-01] Keystore Fingerprint & Alias Inconsistency
**Files**: `android/app/google-services.json:25`, `capacitor.config.json:8`, `.github/workflows/build-android.yml:50`, `../Keys/KRYPTONKS.txt`  
**Evidence**:
- Alias is `krypton` in `capacitor.config.json`, but `kryptonide` in Gradle and `KRYPTONKS.txt`.
- Client ID in `google-services.json` is a placeholder (`228869160750-android.apps.googleusercontent.com`).
- Registered certificate hash `f9dec6ba...` does not match release fingerprints `72:E5:56:D5:...` or `6F:75:94:B4:...`.  
**Impact**: CI builds crash when alias doesn't match; Google Sign-In throws Developer Error 10 on Release APK.  
**Fix**: Harmonize alias to `kryptonide` across all configs; register production SHA-1 fingerprints in Firebase Console and download real `google-services.json`.

---

## 4. Empirical Performance Profiling: Baseline vs Targets

All measurements gathered on desktop V8/Node harness and production Vite builds:

| Subsystem | Operation | Current Baseline (JS) | Bottleneck Root Cause | Target (Rust / Optimization) | Speedup / Reduction |
|:---|:---|:---:|:---|:---:|:---:|
| **Bundle Size** | Entry Chunk (`index.js`) | **2,942.7 KB** | Static import of Prettier & 6 plugins in `CodeEditor.tsx` | **1,406.6 KB** (Code-split Prettier) | **-1.54 MB (-52.4%)** |
| **Git Staging** | Stage 500 files (`git.add`) | **10,309.0 ms (10.3s)** | Sequential JS object hashing & blob writes | **66.4 ms** (Native Git / `gix`) | **155.4x faster** |
| **Git Status** | Status matrix (500 files) | **2,261.5 ms (2.26s)** | JS tree walking & stat matrix evaluation | **54.5 ms** (Native Git / Rust delta) | **41.5x faster** |
| **Full Git Cycle** | Status + Stage + Commit | **12,640.0 ms (12.6s)** | Full isomorphic-git JavaScript pipeline | **172.0 ms** (Native Git / `gix`) | **73.5x faster** |
| **AI Streaming** | 300 token chunk stream | **1,780.5 ms UI blocked** | Per-token Zustand updates + quadratic markdown parse | **< 40 ms** (RAF 60fps throttle) | **44.5x faster** |
| **Terminal PTY** | Ingest 5,000 PTY chunks | **607.2 ms** | Array spread `[...buffer, chunk]` in Zustand | **2.04 ms** (Circular ring buffer) | **297.6x faster** |
| **Search Engine** | Search 5,000 files (11MB) | **359.2 ms** (30.9 MB/s) | Per-file `content.split('\n')` in JS worker | **14.8 ms** (Rust WASM ripgrep) | **24.3x faster** |
| **ZIP Export** | Export 500 files (10MB) | **2,792.7 ms** | Main-thread JSZip compression & base64 encoding | **< 200 ms** (Rust streaming zip) | **14.0x faster** |
| **Bridge I/O** | 10MB file across bridge | **121.8 ms** | Capacitor Base64 wire JSON (+33% wire size) | **< 5 ms** (JNI DirectByteBuffer) | **24.4x faster** |

---

## 5. Rust Core Acceleration Architecture (`krypton-core`)

The Rust workspace in `crates/krypton-core-rs` is designed for compute, I/O, parsing, diffing, compression, and search hot paths without altering the React/Monaco UI layer.

### Architecture Highlights:
- **`crates/krypton-core-rs`**:
  - `search/`: Ripgrep-style streaming regex search across disk directories and memory buffers with cancellation tokens (`AtomicBool`).
  - `diff/`: Myers/LCS structured diff engine (`similar`) generating line-level hunks and inline character highlights.
  - `zip/`: Pure Rust streaming PKZip archive generation using `flate2` (`miniz_oxide`) and `crc32fast` (zero C compiler / NDK linking friction).
  - `aif/`: AIF V4 binary format serializer (`.ai` format) with dynamic cognitive token pruner.
  - `git/`: Fast status matrix evaluator and `gix` (gitoxide) domain architecture.
  - `fs_walk/`: Parallel directory traversal with `.gitignore` and `.kryptonignore` support.
  - `hardware_topology.rs`: Big/LITTLE core topology detection and thread affinity via `libc::sched_setaffinity`.
- **Dual Target FFI Contracts**:
  1. **Android cdylib (`libkrypton_core_rs.so`)**:
     - Built via `cargo-ndk` for `arm64-v8a` and `x86_64`.
     - JNI exports wrapped in `std::panic::catch_unwind`.
     - Exposed via single Capacitor plugin `KryptonCorePlugin.kt` and `KryptonCoreNative.kt`.
     - Direct filesystem scanning in kernel space: file contents never cross the JS bridge.
  2. **Web / PWA (`wasm32-unknown-unknown`)**:
     - Built via `wasm-bindgen`.
     - Runs in a dedicated Web Worker via Comlink.
     - Direct `Uint8Array` / `ArrayBuffer` zero-copy memory transfers.

### Verification Receipts:
- **Unit Tests**: 15/15 tests passing (`cargo test`).
- **Clippy Quality Gate**: Zero warnings across Host, WASM32, and Android ARM64 targets.
- **WASM Build**: Verified clean compilation (`wasm32-unknown-unknown` in 8.67s).
- **Android NDK Build**: Verified clean compilation (`aarch64-linux-android` in 7.27s).

---

## 6. Prioritized Action Backlog

### Phase 1: Do Today (P0 / Immediate Blockers)
1. **Rotate Exposed Gemini API Key & Scrub History**: Revoke the exposed key in Google Cloud Console; run `git-filter-repo` on `KryptonideWeb` to purge commit `0bc34fa`.
2. **Sandbox Live Preview Iframe ([SEC-WEB-01])**: Remove `allow-same-origin` from `LivePreview.tsx:745` to prevent credential theft.
3. **Sanitize Markdown Previews ([SEC-WEB-02], [SEC-WEB-03])**: Add DOMPurify sanitization in `MarkdownPreview.tsx` and `ExtensionDetailModal.tsx`.
4. **Fix Extension Webview PostMessage Bridge ([SEC-WEB-04])**: Verify `event.source` to block remote shell execution in the terminal.
5. **Enforce Path Containment in AI Filesystem Tools ([SEC-TOOL-01])**: Normalize paths and reject `..` traversal sequences in `toolActions.ts`.
6. **Fix Auto-Save Tab & Cursor Wiping ([BUG-SAVE-01])**: Guard `useEffect` in `App.tsx` so `loadProject` only fires on true project transitions.
7. **Fix Streaming Tool Call Splitting ([BUG-NET-02])**: Fix delta accumulator in `modelAdapters.ts` and `useAiStore.ts` to unblock agent tool calls.
8. **Fix GitHub Actions Path ([BUG-BUILD-01])**: Point `githubBuildService.ts` to `build-android.yml`.
9. **Harmonize Keystore Alias & SHA-1 ([SEC-SIGN-01], [BUG-AUTH-01])**: Align alias to `kryptonide` across `capacitor.config.json` and CI; configure valid Android OAuth client credentials in Firebase.

### Phase 2: This Week (P1 / Hardening & Performance)
1. **Relocate Credentials to App-Private Storage ([SEC-WEB-05])**: Move `auth.json`, `krypton.config.json`, and `mcp.json` from external storage to `Directory.Data`.
2. **Code-Split Prettier**: Convert static Prettier import in `CodeEditor.tsx` to dynamic import, instantly dropping main bundle size from 2.94MB to 1.40MB (-52.4%).
3. **Randomize Terminal Exit Sentinels ([SEC-TERM-01])**: Use per-command cryptographic nonces to prevent exit code spoofing.
4. **Throttle AI Streaming UI Updates**: Buffer token chunks and update UI via `requestAnimationFrame` to eliminate 1.78s thread freezes.
5. **Terminal Circular Ring Buffer**: Replace array spread in terminal store with a pre-allocated circular buffer (297x speedup).
6. **Android 14+ Foreground Service Parameter ([SEC-AND-02])**: Pass `FOREGROUND_SERVICE_TYPE_DATA_SYNC` in `KryptonBackgroundService.java`.
7. **Android Back Button Modal Stack ([BUG-MOB-01])**: Dismiss open modals before closing the project.
8. **TypeScript Strict Mode Migration ([BUG-TS-01])**: Add `"include": ["src/**/*"]` and fix the 157 latent strict type errors.
9. **Prune Deprecated Dependencies ([BUG-DEP-01])**: Remove unused `express`, `dotenv`, and `@google/genai` packages.

### Phase 3: Rust Milestones (P2 / Compute Acceleration)
- **Milestone 1 (Search & Traversal)**: Connect `KryptonCorePlugin.searchFiles` on Android and WASM Worker on Web; dual-run with TS search to verify parity. Expected gain: 24x faster project search (<15ms).
- **Milestone 2 (Diff & Patch Engine)**: Replace naive JS diffs with `krypton_compute_structured_diff` featuring inline character highlights.
- **Milestone 3 (Streaming Zip Engine)**: Replace JSZip export with `krypton_compress_zip` (Level 1 DEFLATE), eliminating main-thread freezing.
- **Milestone 4 (AIF V4 Binary Engine)**: Accelerate `.ai` memory loading and cognitive token pruning via direct memory buffers.
- **Milestone 5 (Git Ops Hybrid Engine)**: Replace isomorphic-git status matrix with Rust `gix` status checks on Android (155x faster staging).

---

## 7. Verification Boundaries & Next Steps

### Verification Completed:
- Read-only AST, sink tracing, and static security analysis across 100% of `src/`, `android/`, `crates/`, and `KryptonideWeb/`.
- Baseline `npm run type-check`, `npm test`, and `npm run build` executed and recorded.
- Rust crate `cargo test` (15/15 passing) and `cargo clippy` verified clean across native, WASM32, and Android ARM64 targets.

### Approvals Gate:
Per ground rules, all code modifications and patch applications remain paused awaiting explicit user approval.
Upon your confirmation, we can immediately begin applying the Phase 1 (Do Today) security and critical bug fixes.
