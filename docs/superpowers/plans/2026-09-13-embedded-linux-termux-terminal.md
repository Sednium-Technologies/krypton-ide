# Embedded Linux / Termux Terminal Subsystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed a native Linux/Termux userland terminal subsystem inside Krypton IDE on Android, allowing offline local compilation and execution of Python, Rust, C/C++, Node.js, and any CLI package via a dual-shell (Project + System) xterm.js interface.

**Architecture:** A native C/POSIX PTY bridge (`libterminal-pty.so`) compiled with Android NDK interfaces with Android Bionic libc (`openpty`, `forkpty`). A Kotlin Capacitor plugin (`NativeTerminalPlugin`) uses Kotlin Coroutines (`Dispatchers.IO`) to stream asynchronous terminal I/O to/from the webview without blocking the main UI thread. A TypeScript bridge connects xterm.js to dual-session PTY instances (Project Shell rooted in user project directory, System Shell rooted in Termux `$HOME`), with a mobile-first touch accessory bar and an on-demand Termux bootstrap installer.

**Tech Stack:** C (POSIX PTY/Bionic), Android NDK (CMake), Kotlin Coroutines (`SharedFlow`, `CoroutineScope`), Capacitor 6 Android Plugin API, TypeScript, React 18, xterm.js, Tailwind CSS (Krypton Warm Palette: `#231e22`, `#2a2529`, `#342f33`, `#f3f0e7`).

**Spec:** [docs/superpowers/specs/2026-09-13-embedded-linux-termux-terminal.md](file:///run/media/bhoid/StorageVault/WEbs/krypton-ide/docs/superpowers/specs/2026-09-13-embedded-linux-termux-terminal.md)

## Global Constraints

- **Platform Target:** Android 8.0+ (API 26+) through Android 15, primary ABI `arm64-v8a` with `armeabi-v7a` and `x86_64` support.
- **Rootless Execution:** Must run 100% in userland without root privileges or SELinux bypasses.
- **Android W^X Compliance:** Linux executable binaries (`bash`, `python3`, `rustc`) must reside inside internal executable app storage (`/data/data/com.sednium.kryptonide.legacy/files/usr/bin`), never on FAT/fuse `/sdcard`.
- **UI & Aesthetic Integrity:** Adhere strictly to Krypton's design system: deep warm charcoal backgrounds (`#231e22`, `#2a2529`), elevated cards (`#342f33`), cream text (`#f3f0e7`), emerald live badges (`#34d399`), 44px+ mobile touch targets, tactile haptics.
- **Webview Fallback:** Must cleanly fall back to simulated `ShellEngine` when running in web browser development mode.

---

### Task 1: Native POSIX PTY Engine & Android CMake Build Configuration

**Files:**
- Create: `android/app/src/main/cpp/pty_bridge.c`
- Create: `android/app/src/main/cpp/pty_bridge.h`
- Create: `android/app/src/main/cpp/CMakeLists.txt`
- Modify: `android/app/build.gradle`

**Interfaces:**
- Consumes: Android Bionic `<pty.h>`, `<termios.h>`, `<unistd.h>`, `<sys/ioctl.h>`
- Produces: JNI exported functions:
  - `Java_com_sednium_kryptonide_terminal_PtyBridge_createSubprocess(JNIEnv*, jobject, jstring cmd, jstring cwd, jobjectArray env, jintArray processId, jint rows, jint cols)` -> `jint` (masterFd)
  - `Java_com_sednium_kryptonide_terminal_PtyBridge_setPtyWindowSize(JNIEnv*, jobject, jint masterFd, jint rows, jint cols)` -> `void`
  - `Java_com_sednium_kryptonide_terminal_PtyBridge_sendSignal(JNIEnv*, jobject, jint pid, jint signal)` -> `void`
  - `Java_com_sednium_kryptonide_terminal_PtyBridge_closePty(JNIEnv*, jobject, jint masterFd)` -> `void`

- [x] **Step 1: Write the C POSIX PTY header and implementation**

Create `android/app/src/main/cpp/pty_bridge.h` and `android/app/src/main/cpp/pty_bridge.c` implementing:
- `openpty()` creation with termios raw mode configuration.
- `fork()` and child process setup using `login_tty()`.
- Child environment population (`HOME`, `PREFIX`, `PATH`, `LD_LIBRARY_PATH`, `TERM=xterm-256color`, `LANG=en_US.UTF-8`, `TMPDIR`).
- Executing `/data/data/com.sednium.kryptonide.legacy/files/usr/bin/bash` or fallback `/system/bin/sh`.
- Window size resizing using `ioctl(fd, TIOCSWINSZ, &ws)`.
- Non-blocking I/O configuration for parent master descriptor.

- [x] **Step 2: Create CMakeLists.txt**

Create `android/app/src/main/cpp/CMakeLists.txt`:
```cmake
cmake_minimum_required(VERSION 3.22.1)
project("krypton-pty")

add_library(
    krypton-pty
    SHARED
    pty_bridge.c
)

find_library(log-lib log)

target_link_libraries(
    krypton-pty
    ${log-lib}
)
```

- [x] **Step 3: Update `android/app/build.gradle` for NDK compilation**

Configure `externalNativeBuild` in `android/app/build.gradle`:
```groovy
android {
    ...
    defaultConfig {
        ...
        ndk {
            abiFilters 'arm64-v8a', 'armeabi-v7a', 'x86_64'
        }
    }
    externalNativeBuild {
        cmake {
            path "src/main/cpp/CMakeLists.txt"
            version "3.22.1"
        }
    }
}
```

- [x] **Step 4: Verify native compilation with Gradle**

Run: `cd android && ./gradlew :app:compileDebugSources`
Expected: PASS with `libkrypton-pty.so` compiled for all target ABIs.

---

### Task 2: Kotlin Coroutines Native Terminal Plugin (`NativeTerminalPlugin`)

**Files:**
- Create: `android/app/src/main/java/com/sednium/kryptonide/terminal/PtyBridge.kt`
- Create: `android/app/src/main/java/com/sednium/kryptonide/terminal/TerminalSession.kt`
- Create: `android/app/src/main/java/com/sednium/kryptonide/terminal/TermuxBootstrapInstaller.kt`
- Create: `android/app/src/main/java/com/sednium/kryptonide/NativeTerminalPlugin.kt`
- Modify: `android/app/src/main/java/com/sednium/krypton/MainActivity.java`

**Interfaces:**
- Consumes: `libkrypton-pty.so`, Android Context files directory, Kotlin Coroutines (`Dispatchers.IO`, `SupervisorJob`)
- Produces: Capacitor Plugin `NativeTerminal` with methods:
  - `createSession(call: PluginCall)`: returns `{ sessionId, pid }`
  - `write(call: PluginCall)`: receives `{ sessionId, data }`
  - `resize(call: PluginCall)`: receives `{ sessionId, rows, cols }`
  - `killSession(call: PluginCall)`: receives `{ sessionId, signal }`
  - `installTermuxBootstrap(call: PluginCall)`: downloads and unpacks bootstrap tar.xz with progress events
  - `getBootstrapStatus(call: PluginCall)`: returns `{ installed, prefixPath, hasPython, hasRust }`
  - Events:
    - `terminalOutput`: `{ sessionId, data }`
    - `terminalExit`: `{ sessionId, exitCode }`
    - `bootstrapProgress`: `{ status, progress, message }`

- [x] **Step 1: Implement JNI wrapper `PtyBridge.kt`**

Define Kotlin `object PtyBridge` loading `System.loadLibrary("krypton-pty")` with native external methods.

- [x] **Step 2: Implement `TerminalSession.kt` with Kotlin Coroutines**

Implement `TerminalSession`:
- Holds `sessionId`, `masterFd`, `processId`.
- Starts a background reader coroutine on `Dispatchers.IO` reading a 4096-byte buffer from `masterFd` and emitting via a callback.
- Thread-safe write method writing UTF-8 or raw bytes into `masterFd`.
- `resize(rows, cols)` calling `PtyBridge.setPtyWindowSize`.
- `destroy()` closing file descriptor and sending `SIGTERM`/`SIGHUP`.

- [x] **Step 3: Implement `TermuxBootstrapInstaller.kt`**

Implement bootstrap extraction and verification:
- Computes device architecture (`aarch64`, `arm`, `x86_64`).
- Downloads official Termux bootstrap archive into app cache directory using streaming HTTP via `Dispatchers.IO`.
- Extracts archive into `/data/data/com.sednium.kryptonide.legacy/files/usr/`.
- Sets executable permissions (`chmod 755`) on `/usr/bin/*`.
- Creates standard symlinks (`/bin/sh -> /usr/bin/bash`).
- Emits real-time percentage progress.

- [x] **Step 4: Implement `NativeTerminalPlugin.kt`**

Annotate `@CapacitorPlugin(name = "NativeTerminal")`.
Manage active `ConcurrentHashMap<String, TerminalSession>`.
Expose plugin methods and emit `notifyListeners("terminalOutput", ...)` on I/O.

- [x] **Step 5: Register plugin in `MainActivity.java`**

Add `registerPlugin(NativeTerminalPlugin.class);` in `MainActivity.onCreate`.

- [x] **Step 6: Verify build**

Run: `cd android && ./gradlew compileDebugJavaWithJavac`
Expected: PASS with zero compiler errors.

---

### Task 3: TypeScript Bridge & Multi-Session Terminal Store

**Files:**
- Create: `src/lib/terminal/nativeTerminalBridge.ts`
- Create: `src/store/useNativeTerminalStore.ts`

**Interfaces:**
- Consumes: `@capacitor/core` Plugin register, `useIdeStore` (active project path)
- Produces: `useNativeTerminalStore`:
  - `activeTab`: `'project' | 'system'`
  - `sessions`: `Record<'project' | 'system', TerminalSessionState>`
  - `bootstrapStatus`: `BootstrapStatus`
  - `sendInput(tab, text)`
  - `resize(tab, rows, cols)`
  - `switchTab(tab)`
  - `installBootstrap()`

- [x] **Step 1: Write `src/lib/terminal/nativeTerminalBridge.ts`**

Define TypeScript interface for Capacitor `NativeTerminal` plugin:
- Detect if running on native Android (`Capacitor.isNativePlatform()`).
- Provide clean async methods: `createSession()`, `write()`, `resize()`, `killSession()`, `installBootstrap()`, `getBootstrapStatus()`.
- Listen to `terminalOutput` and route chunks to subscribers.

- [x] **Step 2: Implement `src/store/useNativeTerminalStore.ts` with Zustand**

Manage state for both terminal tabs:
- Project session (starts in current project folder `~/storage/shared/Documents/KryptonIDE/<project>`).
- System session (starts in `$HOME`).
- Output buffering per session so switching tabs preserves full scrollback history.
- Real-time bootstrap installation state (downloading, extracting, ready, failed).

- [x] **Step 3: Add unit tests for store and bridge mocks**

Test tab switching, input dispatching, and output listener routing.

---

### Task 4: Mobile Terminal UI & Touch Accessory Bar

**Files:**
- Create: `src/components/terminal/TerminalAccessoryBar.tsx`
- Create: `src/components/terminal/TermuxBootstrapModal.tsx`
- Modify: `src/components/terminal/TerminalPanel.tsx`

**Interfaces:**
- Consumes: `useNativeTerminalStore`, `xterm.js`, `@capacitor/haptics`
- Produces: Enhanced dual-tab mobile terminal interface

- [x] **Step 1: Build `TerminalAccessoryBar.tsx`**

Implement touch row positioned right above mobile keyboard:
- Keys: `ESC`, `TAB`, `CTRL`, `ALT`, `|`, `~`, `/`, `-`, `▲`, `▼`, `◄`, `►`.
- Modifier locking: Tapping `CTRL` highlights key in cream `#f3f0e7` and sets state so the next key press (e.g., `c`) sends `\x03` (SIGINT).
- Subtle haptic click using `Haptics.impact({ style: ImpactStyle.Light })`.
- Touch styling: `#342f33` background, `#f3f0e7` text, 40px height, `active:scale-90`.

- [x] **Step 2: Build `TermuxBootstrapModal.tsx`**

Dialog card matching Krypton Warm theme:
- Header with Termux / Linux icon and "Install Native Linux Ecosystem".
- Features list: Python 3 & Pip, Rust & Cargo, Clang C/C++, Git, Node.js, `pkg install`.
- Animated progress bar during download/extract with live speed and status text.
- 1-tap "Install Now" button with spring animation.

- [x] **Step 3: Update `TerminalPanel.tsx` with Dual Tabs**

Add dual tabs in terminal header:
- Tab 1: `📁 Project Shell` (with badge showing active project name).
- Tab 2: `⚡ System Shell` (with badge showing Termux status: "Ready" or "Minimal BusyBox").
- "Install Full Ecosystem" button in header when Termux bootstrap is not yet installed.
- Attach `TerminalAccessoryBar` at the bottom of the terminal view.
- Connect xterm.js instance to `useNativeTerminalStore` for two-way native PTY streaming.

---

### Task 5: Editor "Run in Native Terminal" Routing & End-to-End Verification

**Files:**
- Modify: `src/lib/codeRunner.ts`
- Modify: `src/components/editor/CodeEditor.tsx`

**Interfaces:**
- Consumes: `useNativeTerminalStore`, current open file path & language
- Produces: Direct on-device offline execution

- [ ] **Step 1: Update `codeRunner.ts`**

Check if running on native Android with native terminal available:
- When running Python: Send `python3 "<relative_path>"\n` directly to Project Shell!
- When running Rust: Send `cargo run\n` or `rustc "<file>" && ./main\n` to Project Shell!
- When running C/C++: Send `clang++ "<file>" -o output && ./output\n` to Project Shell!
- When running Node/JS: Send `node "<file>"\n` to Project Shell!
- Automatically open bottom panel to the Project Terminal tab on run!

- [ ] **Step 2: Update `CodeEditor.tsx` toolbar**

Ensure the "Run" play button displays "Run Locally (Native Shell)" when on Android and switches to Terminal tab smoothly.

- [ ] **Step 3: Build and verify end-to-end**

Run: `npm run build && npx cap sync android && cd android && ./gradlew assembleDebug`
Verify:
1. `npm run build` exits 0 with no TypeScript errors.
2. `./gradlew assembleDebug` compiles NDK PTY library, Kotlin plugins, and produces working APK.
3. Verify dual tabs, accessory bar, and shell creation.
