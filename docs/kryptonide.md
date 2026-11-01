# Kryptonide: The Architecture of True Mobile Software Engineering

> **Platform Invariant:** Kryptonide runs **exclusively on Android**. It is **NOT a website**, not a cloud web playground, not an online remote editor, and not an in-browser simulator. It is an autonomous, on-device native Integrated Development Environment engineered to deliver desktop-grade programming capabilities on mobile hardware.

---

## 1. Executive Summary & Core Manifesto

For decades, the software engineering industry has operated under an unchallenged dogma: *real development requires a desktop workstation*. Mobile devices—despite packing multi-core 64-bit ARM processors, gigabytes of high-bandwidth unified RAM, and high-DPI OLED screens—were relegated to passive content consumption, basic code viewers, or clunky text editors.

**Kryptonide was created to shatter this limitation.**

Kryptonide is an uncompromising, mobile-native IDE designed specifically for Android. It is built from the metal up to provide complete developer sovereignty:
- **Zero Cloud Dependence:** Offline compiling, local code execution, offline AI (via local/on-device or BYOK endpoints), and local git repositories.
- **Zero Proprietary Sandboxes:** Real files on real storage (`/storage/emulated/0/KryptonIDE/`) accessible by any standard Android file manager.
- **Full POSIX Userland:** Embedded Linux terminal subsystem running rootless Bionic-linked binaries (`bash`, `python3`, `rustc`, `clang`, `node`, `git`).
- **Autonomous AI Agent:** Deeply integrated agentic coding assistant ("Oorty Lite") equipped with POSIX PTY tool-use and multi-file code synthesis.

---

## 2. The Dual-Track Development Engine Architecture

The Kryptonide ecosystem is engineered around a **Dual-Track Development Strategy**—two distinct architectural implementations developed to conquer different facets of mobile programming:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        KRYPTONIDE DUAL-TRACK ECOSYSTEM                 │
├───────────────────────────────────┬────────────────────────────────────┤
│   TRACK 1: HYBRID CORE (LEGACY)   │  TRACK 2: PURE ANDROID KOTLIN      │
│   [Present on this Machine]       │  [Separate Standalone APK/Repo]    │
├───────────────────────────────────┼────────────────────────────────────┤
│ • React 19 + TypeScript 7 GA      │ • 100% Pure Kotlin Codebase        │
│ • Full Monaco Editor (VS Code)    │ • Separate Android Package & APK   │
│ • Rust Engine (krypton-core-rs)   │ • Pure Native Android UI / Compose │
│ • Prefix-Aware Command Palette    │ • Zero WebView Overhead            │
│ • Oorty Lite Agentic UI & Stream  │ • Direct OS & Bionic Bindings      │
│ • NDK POSIX PTY & JNI Plugins     │ • Autonomous Kotlin Daemon         │
│ • Live React/Vite Containers      │ • Independent Release Pipeline     │
└───────────────────────────────────┴────────────────────────────────────┘
                               ▲
                               │ Architectural Synergy
                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        ANDROID OS & HARDWARE                           │
│  Linux Kernel 4.14 - 6.x | ARM64-v8a | Real Storage | Hardware Haptics │
└────────────────────────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **Track Separation Invariant:**  
> - **Track 1 (Hybrid Core / Legacy Build):** This is the codebase **present on this workstation** in the `krypton-ide` workspace. It leverages Capacitor v8, React 19, Monaco Editor, TypeScript 7, a compiled Rust acceleration engine (`krypton-core-rs`), and custom Android NDK/JNI POSIX plugins.  
> - **Track 2 (Pure Android Native Kotlin Build):** This is an **entirely separate application, distributed as its own distinct APK under an independent Android package name**, written **100% in pure Kotlin**. **It is NOT stored or hosted on this machine**—it lives and evolves in its own dedicated, standalone repository.

---

### Track 1: The High-Performance Hybrid Core (Legacy Build on this Machine)
The architecture present in the local `krypton-ide` workspace represents our high-productivity frontend track:
1. **Monaco Editor Engine (`@monaco-editor/react`):** Rather than settling for lightweight mobile text areas or the dated Ace editor, this build embeds Microsoft’s Monaco Editor—the exact engine powering VS Code:
   - Full bracket pair colorization and auto-closing.
   - Code folding, minimap navigation, multi-cursor editing, and inline diff views.
   - Complete Monaco Language Server features, hover diagnostics, and IntelliSense.
2. **Rust-Powered Search & Diff Engine (`krypton-core-rs`):**
   - High-performance Rust engine compiled for multi-file regex scanning, Sha-256 content tree hashing, and Myers diffing.
   - Indexes project trees and executes lightning-fast searches across thousands of files without stuttering or UI frame drops.
3. **Prefix-Aware Command Palette (`CommandPalette.tsx`):**
   - Real-time command discovery via `>` (editor commands), `:` (go to line), `@` (go to symbol), and fuzzy file matching.
4. **Agentic UI Layer:**
   - Real-time token streaming with animated glowing shaders, Markdown rendering, and one-tap diff application.
5. **Client-Side Live Web Runtimes:**
   - In-memory Babel/Vite bundlers that compile React, TypeScript, and Tailwind projects on the fly without demanding a resource-heavy Node server.
6. **Native Android JNI & PTY Plugins:**
   - In-repo Android subsystem (`android/app/src/main/`) hosting C POSIX PTY bindings (`pty_bridge.c`), Termux bootstrap installers (`TermuxBootstrapInstaller.kt`), and background keep-alive services (`KryptonBackgroundService.java`).

---

### Track 2: The Pure Android Native Kotlin Build (Separate APK & Independent Repository)
Track 2 is Kryptonide's bare-metal native implementation, architected as a separate product stream:
1. **100% Kotlin Native Architecture:**
   - Built completely in idiomatic Kotlin with zero JavaScript/WebView UI dependencies.
   - Distinct Android application ID and independent APK artifact distribution.
2. **Zero-Overhead Memory Footprint:**
   - Runs directly on the Android Runtime (ART) with hardware-accelerated native Android views/Jetpack Compose.
   - Instantaneous cold boot with minimal RAM consumption, ideal for resource-constrained Android devices.
3. **Direct OS & Process Lifecycle Control:**
   - Direct Kotlin Coroutines integration with system process daemons, low-level Linux sockets, and hardware peripherals.
4. **Independent Release Cycle:**
   - Developed in its own separate repository and built via dedicated native Gradle/Android CI pipelines.

---

### The Synergy: Why Kryptonide Maintains Both Tracks
- **Track 1 (The Hybrid Build on this machine)** delivers the rich, desktop-class VS Code ecosystem—Monaco IntelliSense, language extensions, visual AI agent drawers, in-browser React/Vite hot-reloading, and Rust-accelerated diffing.
- **Track 2 (The Separate Pure Kotlin APK)** delivers pure native Android minimalism, ultra-low battery consumption, and raw ART runtime execution.

Together, the dual-track strategy ensures that Kryptonide developers have the ultimate choice between desktop-grade visual editing power and ultra-lean pure native execution.

---

## 3. Why Kryptonide Decimates the Competition

Most mobile coding solutions on Android fall into one of two traps: they are either glorified text editors without compilation power, or clunky terminal tools without modern IDE ergonomics.

| Feature / Dimension | **Kryptonide** | **Acode** | **Termux + code-server** | **Spck Editor** | **Dcoder / Cxxdroid** | **AndroidIDE** |
|---|---|---|---|---|---|---|
| **Platform Target** | **100% Android Native** | Android App | Web Browser running in Termux | Android App | Android App | Android App |
| **Editor Engine** | **Monaco Editor (VS Code)** | Ace Editor (dated) | Monaco in Mobile Browser | Ace / Custom | Proprietary Webview | Custom TextMate |
| **Dual-Track Ecosystem** | **Yes (Hybrid + Pure Kotlin APK)** | No (Webview only) | No (Headless Node + Browser) | No (Hybrid only) | No (Native wrappers) | No (Pure Android View) |
| **Terminal Subsystem** | **True POSIX PTY (`libkrypton-pty.so`)** | Fake CLI / Limited plugin | Raw Termux CLI | Simulated JS Console | Sandboxed process | Basic Android Terminal |
| **Offline Toolchains** | **Full (Python, Rust, C/C++, Node)** | None (Requires Termux app) | Full (Manual CLI config) | Limited JS/Node only | Cloud-dependent or proprietary | Java / Gradle only |
| **Rust Acceleration** | **Yes (`krypton-core-rs`)** | None | None | None | None | None |
| **Storage Model** | **Real Files (`/sdcard/KryptonIDE/`)** | Real Files / SAF | Termux internal storage | App sandbox / Cloud | Cloud / Sandbox | Project Directory |
| **AI Integration** | **Oorty Lite (Agentic PTY, BYOK, Stream)** | Basic 3rd party plugins | None (Manual CLI tools) | Basic assistant | Paywalled generic AI | None |
| **Multi-Agent Harness** | **Yes (Oorty Lite, Claude Code, AGY)** | No | No | No | No | No |
| **GitHub Workflow** | **Device Flow OAuth + Actions CI/CD** | Basic Git plugin | Manual Git CLI | Basic Git | Basic Git | Git client |
| **Mobile UX / Haptics** | **Tactile Mobile Bar, Keyboard-Aware** | Basic shortcuts | Poor (Desktop UI in browser)| Basic bar | Ad-cluttered interface | Clunky Android UI |
| **Cloud Sync** | **Two-Way Google Drive AppData** | Manual export | Manual rsync / git | Proprietary cloud sync | Cloud database | Manual Git |
| **Live Web Preview** | **Zero-Server React + Vite Bundler** | Static HTML only | Port-forwarded localhost | Static HTML | Static preview | None |

### Detailed Breakdown vs. Competitors

#### 1. Kryptonide vs. Acode
- *The Problem with Acode:* Acode relies on the aging Ace editor, which lacks Monaco’s language intelligence, bracket management, and modern TypeScript features. For running code, Acode forces users to install Termux separately and juggle server ports.
- *The Kryptonide Advantage:* Monaco out of the box, an embedded native POSIX PTY terminal running Termux userland internally, Rust-accelerated multi-file search, and an autonomous AI agent capable of editing files directly.

#### 2. Kryptonide vs. Termux + code-server
- *The Problem with Termux + code-server:* Running VS Code Server inside Termux turns your phone into an oven. It chews battery, frequently gets terminated by Android's background memory killer, and the mobile browser interface is agonizing to use with virtual touch keyboards.
- *The Kryptonide Advantage:* Native Android lifecycle handling, foreground keep-alive service, mobile-first keyboard-aware viewport resizing, dedicated haptic touch accessory bar, and instant cold-boot startup.

#### 3. Kryptonide vs. Spck Editor
- *The Problem with Spck Editor:* Spck is essentially a lightweight web editor trapped in a proprietary storage model. It cannot compile systems languages (C, C++, Rust), lacks a true Linux terminal, and pushes users toward proprietary cloud ecosystems.
- *The Kryptonide Advantage:* 100% open storage sovereignty (`/storage/emulated/0/KryptonIDE/`), embedded Linux compilers, BYOK AI model freedom, and full terminal tooling.

#### 4. Kryptonide vs. Dcoder & Cxxdroid
- *The Problem with Dcoder / Cxxdroid:* Dcoder relies heavily on remote server queues to compile code, forcing constant internet connectivity and charging subscriptions. Cxxdroid is ad-ridden and uses outdated compiler packages.
- *The Kryptonide Advantage:* Free, open, privacy-first, 100% offline-capable, zero advertisements, and running modern upstream Termux packages.

#### 5. Kryptonide vs. AndroidIDE
- *The Problem with AndroidIDE:* AndroidIDE is hyper-focused on compiling native Android Gradle projects. It is excessively heavy, struggles on devices with less than 8GB of RAM, and is awkward for web, Python, Rust, or general polyglot development.
- *The Kryptonide Advantage:* Polyglot flexibility (React, Next.js, Python, Rust, Go, C++, Kotlin), fast startup, lightweight footprint, and modern AI agent collaboration.

---

## 4. Comprehensive Feature Inventory

### 4.1. Desktop-Grade Monaco Code Editor
- **Full VS Code Core:** Powered by `@monaco-editor/react`, providing syntax highlighting, tokenization, bracket matching, and code folding for 50+ languages.
- **IntelliSense & Autocompletion:** Language server protocols, parameter hints, hover definitions, and error squiggles.
- **Pro Command Palette:** Unified modal triggered via `Ctrl+Shift+P`, hardware keyboard shortcuts, or mobile touch buttons. Features prefix routing:
  - `>` : Access all editor, git, terminal, and AI commands.
  - `:` : Instant line jumping (`editor.revealLineInCenter`).
  - `@` : Symbol and outline jumping.
  - Plain Text : Fuzzy file searching across the entire workspace.
- **Visual Customization:**
  - Premium Themes: `krypton-warm` (deep obsidian with warm amber), `vs-dark`, `light`, and `hc-black`.
  - Custom Fonts: Upload and activate `.ttf`, `.otf`, and `.woff2` files (Fira Code, JetBrains Mono, Cascadia Code) with full ligature support.
  - Per-file font size overrides for fine-grained readability.
- **Mobile Touch Productivity:** Floating context menu, quick navigation drawer, and haptic feedback on code operations.

### 4.2. Embedded Linux & Native POSIX Terminal
- **Dual-Session Architecture:**
  - **Project Shell:** Automatically sets working directory to the active project folder. Run `npm test`, `python script.py`, or `cargo run` instantly.
  - **System Shell:** Rooted in Termux `$HOME` (`/data/data/com.sednium.kryptonide/files/home`). Install packages via `pkg install`, configure dotfiles, or manage runtimes.
- **Termux Rootfs Bootstrap:** On-demand downloader and extractor that sets up a full Linux CLI environment in internal app storage.
- **Mobile Terminal Accessory Bar:** Dedicated touch row floating above the virtual keyboard providing quick access to:
  - `Ctrl`, `Alt`, `Tab`, `Esc`, `|` (pipe), `~` (tilde), `-` (dash), `/` (slash), and directional arrow keys.
- **True POSIX PTY Signals:** Full support for `SIGINT` (Ctrl+C), `SIGTSTP` (Ctrl+Z), terminal resizing (`TIOCSWINSZ`), and ANSI 256-color / Truecolor output.

### 4.3. High-Performance Rust Core (`krypton-core-rs`)
- **Native/WASM Accelerated Indexing:** Compiled Rust module using `similar`, `regex`, and `sha2` crates.
- **Multi-File Search Engine:** High-speed parallel searching across tens of thousands of lines of code with regex and case-matching support.
- **Differential Patch Engine:** Myers diff algorithm for calculating precise line additions, modifications, and deletions for AI code suggestions and Git status.

### 4.4. Oorty Lite: Autonomous Agent & BYOK Ecosystem
- **Agentic Tool Calling:** Oorty Lite does not merely generate text; it actively executes engineering operations:
  - `create_file`: Generates new files and handles recursive directory trees.
  - `edit_file`: Applies precise patches to existing files.
  - `run_terminal_command`: Executes shell commands directly in the native Linux userland.
- **Context-Aware Multi-Modal Context:**
  - Mention files with `@filename` to inject source code directly into context.
  - Mention `@problems` to feed active Monaco linter errors to Oorty Lite for instant debugging.
  - Attach screenshots or UI mockups for visual code generation.
- **Multi-Tier Execution Permission Model:**
  - **Supervised Mode:** Oorty Lite presents syntax-highlighted command proposals with an explicit *Run* confirmation card.
  - **Autonomous Mode:** Safe developer routines execute automatically; destructive operations prompt for confirmation.
  - **Unbound Mode (YOLO):** Continuous autonomous agent execution for complex multi-step migrations and automated debugging loops.
- **Bring Your Own Key (BYOK) Freedom:**
  - No subscriptions or artificial tokens. Connect your own API keys for:
    - Google Gemini (Gemini 1.5 Pro, 2.0 Flash, 3.8 Flash)
    - Anthropic Claude (Claude 3.5 Sonnet, Haiku)
    - OpenAI (GPT-4o, o1, o3-mini)
    - Groq, Mistral, and OpenRouter
- **Universal Multi-Agent CLI Harness:**
  - Use the built-in Terminal Scanner to detect installed CLI agents (Claude Code, Antigravity CLI, Roo Code, Aider) in the Termux environment and route editor triggers directly to them.

### 4.5. True Storage Sovereignty & File Management
- **Direct Filesystem Path:** All projects reside at:
  ```txt
  /storage/emulated/0/KryptonIDE/projects/
  ```
- **External File Manager Friendly:** Open, edit, copy, or zip projects using ZArchiver, Material Files, or USB connection to a PC.
- **SAF (Storage Access Framework) Integration:** Mount and edit external folders from SD cards or USB OTG drives.
- **Safety Auto-Save:** Debounced auto-save engine triggers on 30-second intervals, window blur, and application visibility changes.
- **Archive Operations:** One-tap `.zip` project export and archive extraction directly into the workspace.

### 4.6. Integrated Git & GitHub Actions CI/CD
- **Native Git Engine:** Powered by `isomorphic-git` for local operations (init, clone, commit, branch, diff, checkout).
- **GitHub Device Flow Authentication:** Secure OAuth login via `github.com/login/device`. No insecure embedded webviews; authentication completes in your real browser.
- **GitHub Actions Integration:**
  - Trigger remote CI/CD workflows (`build.yml`, `release.yml`) directly from the IDE.
  - Inspect workflow run status in real time.
  - Directly download compiled Android APK release artifacts to your device upon workflow completion.

### 4.7. Cloud Backup & Sync
- **Google Drive AppData Sync:** Secure two-way synchronization to an isolated Google Drive AppData folder.
- **Automated Backup:** Periodic background backups protect your intellectual property without requiring public cloud repositories.

### 4.8. Zero-Server Web Live Previews
- **Instant Live Reload:** Edit HTML, CSS, JavaScript, TypeScript, or React components and watch live preview updates instantly.
- **CDN-Powered Babel Transforms:** Previews render using browser-level JSX and TypeScript compilation, completely bypassing the need for a local Node.js daemon.

---

## 5. Design System, Color Schemes & Visual Identity

Kryptonide deliberately rejects the cold, sterile blue-grays of standard desktop ports and the harsh, eye-straining pitch-black AMOLED schemes common in mobile tools. Instead, it introduces a custom-crafted visual language engineered specifically for high-DPI mobile OLED screens: **Warm Obsidian & Pale Ivory**.

### 5.1. The Signature Krypton Warm Palette
The flagship interface identity balances earthy, organic dark charcoal backdrops with soft ivory typography, creating an aesthetic akin to high-grade archival paper and matte slate.

```
┌────────────────────────────────────────────────────────────────────────┐
│               KRYPTON WARM SIGNATURE PALETTE (DARK MODE)               │
├─────────────────────┬─────────────┬────────────────────────────────────┤
│ Token               │ Hex Value   │ Role & Semantic Purpose            │
├─────────────────────┼─────────────┼────────────────────────────────────┤
│ --krypton-bg        │ #2a2529     │ Base Canvas / Main Workspace       │
│ --krypton-ground    │ #231e22     │ Deep Framing, Status & Bottom Bars │
│ --krypton-deep      │ #1c181b     │ Recessed Views & Outer Margins     │
│ --krypton-surface   │ #342f33     │ Elevated Cards, Explorer, Drawers  │
│ --krypton-elevated  │ #3d373c     │ Floating Modals, Toolbars & Menus  │
│ --krypton-selection │ #453d43     │ Editor Line Selection & Focus Rings│
│ --krypton-border    │ rgba(...,12)│ rgba(243, 240, 231, 0.12) Borders │
│ --krypton-text      │ #f3f0e7     │ Primary Pale Ivory Typography      │
│ --krypton-muted     │ rgba(...,60)│ rgba(243, 240, 231, 0.6) Subtext   │
│ --krypton-gutter    │ #6b6369     │ Inactive Editor Line Numbers       │
└─────────────────────┴─────────────┴────────────────────────────────────┘
```

### 5.2. Adaptive Light Mode & High Contrast
- **Ivory Light Mode (`data-theme="light"`):**
  - **Base Workspace Canvas:** `#f3f0e7` (Warm Pale Ivory)
  - **Elevated Surfaces & Headers:** `#e8e4d9` and `#dfdacd`
  - **Floating Cards & Modals:** Pure `#ffffff` with subtle warm drop shadows
  - **Typography:** `#2a2529` (Charcoal Slate) with 60% opacity subtext
  - **Borders:** `rgba(42, 37, 41, 0.14)`
- **High-Contrast Dark (`hc-black`):**
  - Pure `#000000` canvas with `#ffffff` text and bright yellow/white focus indicators for accessibility and outdoor direct-sunlight readability.

### 5.3. Curated Monaco Syntax Highlighting Themes
Kryptonide comes pre-loaded with authentic syntax mappings tailored for readability on mobile displays:
1. **Krypton Warm (`krypton-warm`):** The signature theme engineered to blend seamlessly with the app chrome.
   - **Background:** `#2a2529` | **Foreground:** `#f3f0e7`
   - **Keywords:** `#f3f0e7` (bold, authoritative)
   - **Strings:** `#a3be8c` (calming sage green)
   - **Numbers & Constants:** `#d08770` (warm terra-cotta orange)
   - **Types & Interfaces:** `#b8aedc` (soft lilac lavender)
   - **Functions & Methods:** `#88c0d0` (frost teal)
   - **Comments:** `#8c828a` (warm stone gray, italicized)
2. **One Dark Pro (`one-dark-pro`):** Iconic Atom-style balanced palette (`#282c34`).
3. **Dracula Official (`dracula`):** High-energy neon pinks (`#ff79c6`), greens (`#50fa7b`), and purples (`#bd93f9`).
4. **GitHub Dark (`github-dark`):** The familiar, crisp GitHub primer canvas (`#0d1117`).
5. **Monokai Pro (`monokai`):** High-contrast vibrant yellow, green, and magenta on dark olive (`#272822`).
6. **Nord (`nord`):** Arctic, cold-climate blues and snow storm grays (`#2e3440`).
7. **Catppuccin Mocha (`catppuccin`):** Soothing pastel dark palette with lavender accents (`#1e1e2e`).

### 5.4. Typography & Geometry Standards
- **Sans-Serif Engine (`--font-sans`):** **Urbanist** paired with **Inter** for ultra-clean, legible UI labels, tabs, and menus on high-density mobile screens.
- **Monospace Code Engine (`--font-mono`):** **JetBrains Mono** with full programming ligature support. Users can upload custom `.ttf`/`.otf`/`.woff2` files (Fira Code, Cascadia Code) with instant `@font-face` injection.
- **Corner Radii Hierarchy:**
  - Soft Controls: `--radius-soft: 16px` (buttons, inputs, chips)
  - Card Containers: `--radius-card: 20px` (modal sheets, bento panels)
  - Pill Elements: `rounded-full` (floating action badges, status pills)

### 5.5. Web Presence & Showcase Aesthetics (`KryptonideWeb`)
The official web and showcase portal features a complementary cosmic glassmorphic aesthetic:
- **Canvas:** Pitch black `#000000` void backdrop.
- **Glassmorphic Panels:** `bg-white/5 backdrop-blur-xl border border-white/10` with subtle internal reflection glows.
- **Animated Border Gradients:** Continuous four-corner linear gradients:
  `linear-gradient(90deg, #a855f7, #ec4899, #3b82f6, #a855f7)`
- **Dynamic Glow Spheres:** Diffused 100px blur radial aura gradients (`bg-purple-600/20`) creating immersive depth behind device mockups.
- **Oorty Lite Persistent Glow:** Glowing neon blue/violet animated message aura that persists throughout interaction, providing immediate visual feedback during token generation.

---

## 6. Mobile Ergonomics & Developer Experience

Engineering an IDE for touchscreens requires solving unique ergonomic challenges that desktop IDEs ignore:

1. **Virtual Keyboard Awareness:**
   - On mobile, soft keyboards consume 40% to 50% of screen height. Kryptonide dynamically listens to Android keyboard insets, automatically hiding bottom navigation bars and floating toolbars to preserve maximum vertical code view.
2. **Tactile Haptic Feedback:**
   - High-precision Android haptics accompany file creations, git commits, terminal command submissions, and toolbar buttons, providing physical confirmation for developer actions.
3. **Responsive Split Views:**
   - Tablet and foldable devices automatically adapt to dual-pane split layouts, allowing code and terminal or live preview to run side-by-side.

---

## 7. Project Directory Hierarchy (Track 1: Legacy / Hybrid Core on this Machine)

> **Repository Scope Note:**  
> The directory structure below represents the **Track 1 (Legacy / Hybrid Core)** repository stored on this machine (`krypton-ide`).  
> **Track 2 (Pure Android Native Kotlin Build)** is an independent application with its own separate repository and APK build pipeline; it is **not present on this machine**.

```
krypton-ide/                         # Track 1 Codebase (Present on this Machine)
├── android/                         # Android Hybrid Subsystem & Native Plugins
│   ├── app/
│   │   ├── src/main/cpp/            # Bionic POSIX PTY Bridge (C/NDK)
│   │   │   ├── CMakeLists.txt
│   │   │   ├── pty_bridge.c
│   │   │   └── pty_bridge.h
│   │   └── src/main/java/com/sednium/kryptonide/
│   │       ├── NativeTerminalPlugin.kt   # Terminal IPC & Coroutine Scope
│   │       ├── FolderPickerPlugin.java   # Native Folder Chooser
│   │       ├── KryptonBackgroundService.java # LMK Prevention Service
│   │       ├── SAFFileSystemPlugin.java  # Scoped Storage Access
│   │       ├── StoragePermissionPlugin.java
│   │       └── terminal/
│   │           ├── PtyBridge.kt          # JNI PTY Binding
│   │           ├── TerminalSession.kt    # Terminal Session Instance
│   │           └── TermuxBootstrapInstaller.kt # Rootfs Setup
├── crates/                          # Rust Acceleration Layer
│   └── krypton-core-rs/             # Bare-Metal Search & Myers Diff Crate
│       ├── Cargo.toml
│       └── src/lib.rs
├── src/                             # High-Performance UI (Track 1)
│   ├── components/
│   │   ├── CommandPalette.tsx       # Prefix-Aware VS Code Palette
│   │   ├── editor/CodeEditor.tsx    # Monaco Editor Integration
│   │   ├── sidebar/AiAssistant.tsx  # Oorty Lite Streaming Drawer
│   │   └── terminal/TerminalPanel.tsx # Dual-Session xterm.js UI
│   ├── lib/
│   │   ├── ai/                      # Agentic Tool Loop & Multi-Model
│   │   ├── fileSystemStorage.ts     # Real Storage Access Engine
│   │   ├── gitService.ts            # isomorphic-git & GitHub Device Flow
│   │   └── terminal/nativeTerminalBridge.ts # Webview-to-Native IPC
│   └── store/
│       ├── useIdeStore.ts           # Editor State & Open Tabs
│       ├── useNativeTerminalStore.ts# PTY State & Termux Status
│       └── useHarnessStore.ts       # Multi-Agent Routing Engine
└── docs/
    └── kryptonide.md                # This Master Architectural Document
```

---

## 8. Conclusion & Vision

Kryptonide is not a toy, a website, or a compromised mobile port. It is a full-fledged, autonomous software engineering workstation engineered for the device that never leaves your side.

By maintaining both the **high-productivity visual power of our hybrid Monaco/Rust core (Track 1)** and the **uncompromising bare-metal efficiency of our pure Kotlin native application (Track 2)**, Kryptonide delivers what no other tool in the ecosystem can:

> **True, unbound software engineering—directly on Android, anytime, anywhere.**

---
*Authored with passion by Sednium & Bhoid.*  
*Kryptonide Architecture Reference — 2026.*
