# Kryptonide: Hybrid Native-Core Architecture & Mobile Performance Plan

## 🎯 Architecture Summary
* **Platform Target:** Cross-Platform Mobile (Android & iOS) — every native phase below has a matched pair of tasks for both platforms. If a task only lists one platform, that is intentional (noted inline), not an oversight.
* **Frontend / UI Shell:** React (TSX) + Capacitor
* **Editor Engine:** Monaco Editor (embedded in WebView)
* **Native Systems Core:** Custom Capacitor plugins — Kotlin for Android, Swift for iOS
* **Type System & Tooling:** TypeScript 7.0 (GA, Go-native compiler) for build/CLI + Monaco's bundled `ts.worker` for on-device IntelliSense

---

## ⚠️ Known Constraints — Read Before Implementing
These were flagged during review of the original plan. They change *how* certain tasks below should be built, so read this before writing code against Phase 2, 3, 5, or 6.

1. **SAF folders cannot be watched with `FileObserver`.** `FileObserver` requires a real filesystem path. A user-picked SAF tree only gives you a `content://` URI — there is generally no real path behind it under scoped storage. Phase 2.2 as originally written (native `FileObserver` watching an SAF tree) will silently fail to fire events on most devices. See the revised 2.2 for the actual approach (poll/diff via `DocumentsContract`, not a live OS watcher).
2. **`DocumentFile`/`ContentResolver` access is slow.** Community benchmarks report roughly 100x slower directory listing versus raw filesystem access. Search (2.3) and the file plugin (2.1) need an in-memory/cached file-tree layer on top of raw SAF calls, not a naive "re-list from SAF on every keystroke" approach.
3. **"100% offline" and AI features are in tension.** Ghost-text and "Send to Oorty Lite" require network access by definition. Phase 7's offline target should apply to the core editor, file I/O, and type-checking — not to AI features, which should degrade gracefully (disable, don't crash) when offline.
4. **iOS had no native-plugin phase.** The architecture summary promises Swift plugins, but the original Phase 2 was Android-only. Added 2.4–2.6 below for parity.
5. **API key storage was unspecified.** An AI API key must go in platform secure storage (iOS Keychain / Android Keystore-backed encrypted store), not Capacitor `Preferences` or any WebView storage. See Phase 6.
6. **Debounced sync can lose the last edit on kill.** A 300ms debounce (1.3) means up to 300ms of edits can be lost if the process is killed before the timer fires (e.g., OS backgrounds and reclaims memory). Add an immediate flush on the app's `pause`/background lifecycle event.
7. **TypeScript 7.0 is GA, not upcoming.** It shipped July 8, 2026, with Microsoft reporting typically 8–12x full-build speedups from the Go-native compiler. It intentionally ships **without a stable programmatic/API surface** — that's expected in 7.1. Phase 3 was already correct to defer a custom TS7-worker integration; the note below just tightens the reasoning so the agent doesn't try to build against 7.0's API.

---

## Phase 0: Environment & Compatibility Baseline
- [ ] Pin and record exact versions in the repo (package.json / gradle / podfile): Capacitor core + CLI, Monaco Editor, React, `typescript` (7.0 GA).
- [ ] Confirm `minSdkVersion` and the expected Android System WebView (Chromium) baseline. `backdrop-filter` (used in Phase 4) needs a modern Chromium WebView; devices on older, non-evergreen WebView builds may not render it. Decide on a solid-color fallback for those devices rather than assuming universal support.
- [ ] Confirm iOS deployment target for WKWebView (backdrop-filter has been reliably supported for a long time on iOS, so this is a lighter check than the Android one).
- [ ] Define a device test matrix: a low-RAM/"Go edition"-class Android device, a mid-tier device, a flagship, plus an older and a current iPhone. Every Phase 7 metric should be measured against this matrix, not just a dev's flagship phone.

---

## Phase 1: Monaco Editor Mobile Performance Overhaul ("Monaco Diet")

### 1.1 Strip Desktop Rendering Overhead
- [ ] Configure `monaco.editor.create()` options to strip desktop-only rendering passes and reduce DOM nodes by >60%:
  ```javascript
  {
    minimap: { enabled: false },
    folding: false,
    glyphMargin: false,
    lineDecorationsWidth: 0,
    smoothScrolling: false,
    cursorSmoothCaretAnimation: 'off',
    cursorBlinking: 'solid',
    renderValidationDecorations: 'editable',
    contextmenu: false, // disables desktop right-click menu — required so it doesn't fight with the custom menu in 5.2
    hideCursorInOverviewRuler: true,
    overviewRulerBorder: false,
    scrollbar: {
      verticalScrollbarSize: 4,
      horizontalScrollbarSize: 4,
      useShadows: false
    }
  }
  ```
- [ ] Sanity-check the 4px scrollbar width against real-finger tap targets on the device matrix from Phase 0; if it's unreliably small to grab, consider a wider invisible hit-area layered over the visual 4px track rather than widening the visible scrollbar itself.

### 1.2 Implement Zero-ReMount Model Architecture
- [ ] Maintain a single persistent Monaco WebView instance. Never unmount or destroy the editor during file navigation.
- [ ] Implement in-memory model swapping using `monaco.editor.createModel()` and `editor.setModel(newModel)` for sub-5ms file switching.
- [ ] Implement explicit memory cleanup: call `model.dispose()` when closing editor tabs to prevent memory leaks.
- [ ] Note (intentional benefit, not a bug): each `ITextModel` keeps its own undo/redo stack, so this pattern gives you correct per-file undo history for free as long as models aren't disposed while still "open" in a tab.

### 1.3 Debounce State & Bridge Communication
- [ ] Remove per-keystroke serialization over the Capacitor JavaScript bridge.
- [ ] Maintain the editor text buffer locally inside the WebView runtime.
- [ ] Debounce document state sync (e.g., 300ms) to notify the React UI container only on edit pauses, dirty-state changes, or explicit autosave triggers.
- [ ] **Flush the debounce immediately on backgrounding.** Listen for the Capacitor `App` plugin's `pause` event (and `beforeunload`/`visibilitychange` in the WebView) and force an immediate sync + autosave, so the last <300ms of typing survives an OS-initiated kill.

### 1.4 Viewport & Hardware Acceleration Lock
- [ ] Inject static viewport metadata to lock touch zooming and layout shifts.
- [ ] Apply GPU composition layer locking in global CSS (`transform: translateZ(0)`) on the editor's scroll container.
- [ ] Cross-reference Phase 0: if `backdrop-filter` (Phase 4) is used near the editor, verify it doesn't force extra compositing passes on the scrolling canvas on the low-tier test device — Phase 4.1 already restricts blur away from the live canvas for this reason, keep that constraint intact here too.

---

## Phase 2: Native Systems Core (Custom Capacitor Plugins)

### 2.1 Android — Storage Access Framework (SAF) File Plugin
- [ ] Create `SAFFileSystemPlugin.kt` extending `com.getcapacitor.Plugin`.
- [ ] Implement native asynchronous file reading/writing using Kotlin Coroutines and SAF URIs (`ContentResolver`).
- [ ] Expose `@PluginMethod` hooks to return raw file strings directly to TSX without web file-API overhead.
- [ ] Add an in-memory (or lightweight on-disk) cache of the directory tree (name, URI, size, `lastModified`) so the file explorer and search don't re-walk `DocumentFile`/`ContentResolver` on every UI interaction — this is the mitigation for the ~100x SAF listing overhead noted above.
- [ ] Persist the picked tree's URI permission with `ContentResolver.takePersistableUriPermission()` so access survives app restarts.

### 2.2 Android — Folder Change Detection (revised from "FolderWatcherPlugin")
- [ ] Do **not** rely on `FileObserver` against SAF `content://` trees — it needs a real path and generally won't fire for user-picked external folders under scoped storage.
- [ ] For paths genuinely inside the app's own sandbox (e.g., a local cache/mirror of open files), `FileObserver` on a native background thread is fine and can push events via `notifyListeners()` as originally planned.
- [ ] For SAF-backed user folders, implement change detection as a **diff-on-demand** poll: on app foreground, on pull-to-refresh, and on a coarse interval (e.g., every 30–60s while the app is active), call `DocumentsContract.queryChildDocuments()` against the cached tree from 2.1 and diff `lastModified`/document IDs to synthesize `fileCreated`/`fileModified`/`fileDeleted` events.
- [ ] Document this as a known OS-level limitation in the app's UI/help text if users expect instant external-editor-save detection — it will be near-instant on foreground/refresh, not truly push-based, for anything outside the app sandbox.

### 2.3 Android — High-Speed Multi-Threaded Text Search Plugin
- [ ] Create `FastSearchPlugin.kt` using a Kotlin thread pool (`Dispatchers.Default` or a dedicated `ExecutorService`).
- [ ] Implement parallel regex and text searching across the cached file tree from 2.1, not by re-opening every file via `ContentResolver` on each keystroke of the search box — debounce the search input and search against already-read/cached file contents where available, falling back to `ContentResolver.openInputStream()` only for files not yet cached.
- [ ] Return formatted search results and line coordinates directly to the frontend.

### 2.4 iOS — File System Plugin (parity with 2.1)
- [ ] Create a Swift Capacitor plugin (e.g., `FileSystemPlugin.swift`) using `UIDocumentPickerViewController` for folder/file selection and `FileManager` for reads/writes.
- [ ] Use security-scoped bookmarks (`URL.bookmarkData(options: .withSecurityScope, ...)`) to persist access to a user-picked folder across launches; call `startAccessingSecurityScopedResource()` / `stopAccessingSecurityScopedResource()` around each access.
- [ ] Mirror the caching layer from 2.1 so the file tree isn't re-enumerated on every UI interaction.

### 2.5 iOS — Folder Change Detection (parity with 2.2)
- [ ] Within the app sandbox, use `DispatchSource.makeFileSystemObjectSource` on a background `DispatchQueue` for live change events.
- [ ] For security-scoped external folders, apply the same diff-on-foreground/pull-to-refresh/interval-poll pattern as 2.2 — iOS has an analogous limitation watching arbitrary externally-scoped folders in the background.

### 2.6 iOS — Multi-Threaded Text Search Plugin (parity with 2.3)
- [ ] Create a Swift plugin using `DispatchQueue.concurrentPerform` or an `OperationQueue` with a bounded `maxConcurrentOperationCount` for parallel search across the cached tree from 2.4.
- [ ] Return results in the same shape as the Android plugin (2.3) so the TSX search UI is platform-agnostic.

---

## Phase 3: TypeScript 7 Tooling & Compiler Strategy
TypeScript 7.0 reached general availability on July 8, 2026 as a full native port of the compiler and language service to Go (Microsoft reports typically 8–12x speedups on full builds). It intentionally shipped **without a stable public/programmatic API** — that's targeted for 7.1. This governs both tasks below.

### 3.1 Project Build & Lint Pipeline Integration
- [ ] Upgrade project build, CLI, and linter dependencies to `typescript@7` to use the native Go compiler for CI and local build/type-check.
- [ ] Expect roughly 8–12x speedups on full project type-checks/builds (Microsoft's own figures); validate against this project's actual codebase size rather than assuming the headline number, since independent benchmarks on type-heavy codebases have landed lower (roughly 4–7x in some reports).
- [ ] Check any lint/type-aware tooling for TS7 compatibility before flipping CI over — tools that depend on the compiler's programmatic API (some `typescript-eslint` configurations, template type-checking in other frameworks) may not yet support 7.0 and might need to stay pinned or wait for 7.1.

### 3.2 In-Editor IntelliSense Stability
- [ ] Retain Monaco's bundled `ts.worker` running locally inside the WebView for on-device AST parsing, error squiggles, and autocompletion — do not attempt to wire the in-editor experience to the new Go compiler yet.
- [ ] Defer any custom TS7-based in-editor worker until TypeScript 7.1 ships its stable programmatic API; re-evaluate this task once that API is available rather than on a fixed date.

---

## Phase 4: UI/DX, Glassmorphism, & Touch Overlay Architecture

### 4.1 Native-Friendly Glassmorphism Execution
- [ ] Restrict CSS `backdrop-filter: blur(...)` strictly to static UI overlays (floating header bar, command palette, drawer menus, modal dialogs).
- [ ] **Strict constraint:** keep glassmorphism layers away from the live-scrolling Monaco canvas to avoid GPU framebuffer recalculations during 60fps text scrolling.
- [ ] Per Phase 0: ship a solid-color fallback style for Android WebView builds below the Chromium version where `backdrop-filter` is unreliable, so the UI doesn't render as flat/broken glass on older devices.

### 4.2 Custom Mobile Input & Keyboard Toolbar
- [ ] Implement an extra native/Capacitor keyboard accessory toolbar attached above the soft keyboard.
- [ ] Add touch quick-action keys for `{ }`, `( )`, `;`, `=>`, Tab, and directional arrows.
- [ ] Route key taps directly into Monaco via `editor.trigger('touchToolbar', 'type', { text: '...' })` (the `source` argument is just a label for telemetry/debugging — use something identifiable rather than the generic `'keyboard'`).

### 4.3 Command Palette FAB (Floating Action Button)
- [ ] Design a glassmorphic Android Material-styled Floating Action Button (or pinned header icon) to trigger the Command Palette.
- [ ] Use the app's theme (e.g., a frosted-glass terminal or search icon with subtle borders).
- [ ] Map the tap gesture to open a custom React-based Command Palette, overriding Monaco's default desktop F1 popup.

---

## Phase 5: Gestures, "Oorty Lite" AI Integration, & Context Menus

### 5.1 Custom Native Text Selection Gestures
- [ ] Intercept default browser text-selection using React/Capacitor gesture handlers.
- [ ] Implement native-style long-press-to-select on a word.
- [ ] Implement smooth, custom drag-handles (styled to match the app theme) to expand selection bounds, avoiding standard WebView text-selection clunkiness.
- [ ] **Accessibility:** detect when a screen reader (TalkBack/VoiceOver) is active and fall back to the platform's native text-selection behavior in that case — fully custom gesture-based selection tends to break screen-reader text navigation.

### 5.2 Unified Context Menu (Copy/Paste & Send to Oorty Lite)
- [ ] Disable Monaco's default context menu and the native OS clipboard popup (consistent with `contextmenu: false` in 1.1).
- [ ] Render a custom floating glassmorphic tooltip directly above the text selection coordinates via `editor.getScrolledVisiblePosition()`.
- [ ] Populate the context menu with:
  - **Copy** (writes to the Capacitor Clipboard plugin)
  - **Paste** (reads from clipboard, inserts at cursor)
  - **Send to Oorty Lite 🤖** (custom AI action)

### 5.3 "Send to Oorty Lite" Context-Aware Payload
- [ ] On tap, extract `selectedText`, ~20 lines of `surroundingContext`, and file metadata.
- [ ] Cap the total payload size (e.g., truncate `surroundingContext` further for very long lines/minified files) before sending, to avoid oversized requests on large files.
- [ ] Slide open the Oorty Lite AI drawer with the payload pre-filled for instant prompt submission or refactoring.

### 5.4 Inline Ghost Text Autocomplete
- [ ] Enable inline suggestions: `inlineSuggest: { enabled: true, mode: 'subword' }`.
- [ ] Register the completion provider via `languages.registerInlineCompletionsProvider`, triggered only when an Oorty Lite API key is present (read from secure storage — see Phase 6).
- [ ] Debounce API requests (400–600ms) to avoid firing a request on every keystroke.
- [ ] **Cancel in-flight requests** when the user keeps typing (e.g., `AbortController` per request), so a slow, stale completion can't land after a newer one and overwrite what the user is currently typing.
- [ ] Map Tab (or a dedicated toolbar button) to accept ghost text.

---

## Phase 6: Security & Compliance
- [ ] Store the Oorty Lite API key in platform secure storage — iOS Keychain, Android Keystore-backed encrypted storage (e.g., `EncryptedSharedPreferences` or an equivalent secure-storage Capacitor plugin). Never store it in Capacitor `Preferences`, `localStorage`, or any WebView-accessible storage.
- [ ] iOS: add the required `Info.plist` usage description(s) for document picker/file access, and the appropriate file-access entitlement if the app uses the App Sandbox.
- [ ] Android: rely on SAF only for arbitrary file access — do not request `MANAGE_EXTERNAL_STORAGE`, which draws extra Play Store review scrutiny and is discouraged for apps that don't strictly need it.
- [ ] All calls to the Oorty Lite backend go over TLS; surface a clear, non-crashing UI state when the device is offline or the request fails.

---

## Phase 7: Verification & Performance Metrics
- [ ] **App launch:** cold start to editable editor state under 1.5s — measured across the full Phase 0 device matrix, not just a flagship device.
- [ ] **Typing latency:** sub-16ms input response time (60fps continuous rendering) on the mid-tier reference device.
- [ ] **Memory:** RAM footprint stabilized below 120MB during active editing on the low-tier reference device.
- [ ] **Offline execution:** 100% of *core* editor features — local SAF/security-scoped file operations, editing, and type-checking — work with no network. AI features (5.3, 5.4) are explicitly exempt: they should disable gracefully and say so, not count against this target.
- [ ] **Crash-free sessions:** track and set a target rate (e.g., >99.5%) once basic telemetry/crash reporting is wired up.
- [ ] Spot-check battery/thermal behavior during a sustained editing + search session on the low-tier device, since GPU compositing locks (1.4) and background polling (2.2/2.5) both have power cost.

---

## Phase 8: Testing, Rollout & Rollback
- [ ] Unit tests per native plugin: JUnit for Kotlin plugins, XCTest for Swift plugins.
- [ ] Feature-flag the riskier changes (zero-remount model swapping, the native file/search/watcher plugins) so they can be disabled remotely without an app-store release if they misbehave in production.
- [ ] End-to-end smoke tests (e.g., Appium or Maestro over the Capacitor app) covering: open a file, edit it, save it, run a search, trigger an AI ghost-text completion, and confirm offline core-editor behavior.
- [ ] Stage the rollout: internal build → limited beta track → general production release, with the Phase 7 metrics gating each promotion.
