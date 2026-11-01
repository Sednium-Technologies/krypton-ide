# Oorty Lite Agent Harness & Pocket Server — Kotlin Native Implementation Spec

## Mission Directive
You are tasked with implementing **Oorty Lite** — Kryptonide's default agentic coding harness and embedded **Pocket Server** — in pure Kotlin Native / Android (`com.sednium.kryptonide.*`). 

Oorty Lite replaces the legacy "Larry" assistant with a hardware-accelerated, model-agnostic agentic system distilled from **Oorty** ([Sednium-Technologies/OORTY](https://github.com/Sednium-Technologies/OORTY)).

---

## 1. Architectural Blueprint

```
com.sednium.kryptonide.agent/
├── oorty/
│   ├── OortyLiteEngine.kt             // Core agent lifecycle, tag protocol parser, streaming loop
│   ├── OortyLiteIcon.kt               // Jetpack Compose vector emblem & raster loader
│   └── SystemPrompt.kt                // Immutable deterministic Oorty Lite system prompt with .ai protocols
├── pocket/
│   ├── PocketServerManager.kt         // Multi-engine daemon lifecycle & foreground LMK immunity
│   ├── PocketModels.kt                // Predefined catalog (Laya Q4/FP16, GGUF, LiteRT, Embeddings)
│   ├── LayaSystemOneEngine.kt         // Fast System 1 router, risk classifier, token pruner, AIF tagger
│   ├── LocalGgufRunner.kt             // JNI wrapper to llama.cpp with hardware core pinning
│   └── StorageModelScanner.kt         // Scans /storage/emulated/0/KryptonIDE/models/ & Downloads
├── hardware/
│   ├── HardwareTopology.kt            // Sysfs CPU frequency scanner & Big-Core classifier
│   └── OortyNativeBridge.kt           // JNI bindings to liboorty_engine.so (sched_setaffinity, GPU node check)
├── tools/
│   ├── AgentToolRegistry.kt           // Unified tool dispatcher conforming to OpenAI / Gemini schemas
│   ├── FsToolSet.kt                   // Filesystem tools (read, write, edit_lines, insert_lines, patch)
│   ├── TerminalToolSet.kt             // PTY bridge integration with NativeTerminalPlugin & exit code sentinels
│   ├── LspToolSet.kt                  // Language Server diagnostics, symbol queries, definition lookups
│   └── McpToolBridge.kt               // Live JSON-RPC 2.0 MCP client (tools/list, tools/call)
├── aif/
│   ├── AifMemoryManager.kt            // Persistent cognitive memory (.ai binary format in KryptonIDE/aif/)
│   └── AifProtocols.kt                // Boot recall, volatile scratch signal traps, end-of-turn commits
└── ui/
    ├── PocketServerScreen.kt          // Model picker, telemetry counters, hardware acceleration toggle
    ├── HardwareWarningDialog.kt       // Dynamic thermal & RAM capacity advisory
    └── OortySettingsSection.kt        // Real Oorty GitHub card, model selector, locked system prompt
```

---

## 2. Core Components to Implement

### A. Laya System 1 Engine (`LayaSystemOneEngine.kt`)
Laya is the ultra-low latency System 1 reflex engine operating in Q4 / FP16 (under 50ms):
1. **Fast-Path vs Deep-Reasoning Router (`route(query)`)**:
   - Classifies incoming prompt into `fast_path` (local immediate answers, greetings, status) vs `deep_reasoning` (planning, multi-file code writes, refactoring, stack traces).
2. **Deterministic Risk Classifier (`risk(command)`)**:
   - Inspects shell commands before execution in the terminal PTY.
   - Detects destructive patterns (`rm -rf /`, `mkfs`, fork bombs, raw block writes).
   - Returns security levels (`low`, `medium`, `high`) and enforces permissions according to active execution tier (Supervised, Autonomous, Unbound).
3. **Context Token Pruner (`prune(output, maxLines)`)**:
   - Prunes verbose compiler build outputs and logs. Retains the top 20% head, critical error middle lines (matching regex `(?i)(error|fatal|exception|failed|line \d+)`), and bottom 30% tail.
4. **AIF Semantic Tagger (`extractAifMetadata(prompt, diff)`)**:
   - Extracts semantic domain tags and suggests cognitive importance rating (`0.0` to `1.0`).

### B. Hardware Optimization Engine (`OortyNativeBridge.kt` & `oorty_engine.cpp`)
Peak performance on mobile SoCs (MediaTek Dimensity, Qualcomm Snapdragon) requires direct hardware topology awareness:
1. **Sysfs CPU Frequency Scanning**:
   - Read `/sys/devices/system/cpu/cpu[0-9]*/cpufreq/cpuinfo_max_freq`.
   - Identify peak frequency `max_freq`.
   - Classify cores with frequency `>= 0.85 * max_freq` as **Performance / Prime Cores**.
2. **Big-Core Thread Pinning (`sched_setaffinity`)**:
   - Bind inference worker threads (`threadIdx = 0..N-1`) strictly to performance cores in round-robin.
   - Exclude Cortex-A55 / efficiency cores to eliminate scheduling thrashing and pipeline stalls.
3. **GPU Compute Device Node Detection**:
   - Check `/dev/kgsl-3d0` (Qualcomm Adreno) and `/dev/mali0` (ARM Mali).
4. **Memory & Context Clamping**:
   - Calculate safe context length (`n_ctx`) based on free RAM from `ActivityManager.MemoryInfo`.
   - Enforce memory-mapped zero-copy file streaming (`mmap`).

```kotlin
// Example JNI Bridge Signature
package com.sednium.kryptonide.agent.hardware

object OortyNativeBridge {
    init {
        System.loadLibrary("oorty_engine")
    }

    external fun nativeGetOptimalThreadCount(): Int
    external fun nativeBindThreadToBigCores(threadIdx: Int): Boolean
    external fun nativeDetectGpuVendor(): Int // 1=Mali, 2=Adreno, 0=Unknown
    external fun nativeGetPerformanceCoreCount(): Int
}
```

### C. Unified Agent Tool Registry (`AgentToolRegistry.kt`)
Replace all ad-hoc string comparisons with a typed registry supporting function declarations for Gemini and OpenAI schemas:
1. **Filesystem Tools**: `read_file(path, start_line, end_line)`, `write_file(path, content)`, `edit_lines(path, start_line, end_line, new_content)`, `insert_lines(path, at_line, content)`, `patch_file(path, search, replace)`, `list_dir(path)`.
2. **Terminal Execution Tool**: `execute_terminal_command(command, timeout_ms)`:
   - Uses `NativeTerminalPlugin.kt` / `PtyBridge.kt`.
   - Wraps commands with exit code sentinels: `echo "__KRYPTON_START__"; <command>; echo "__KRYPTON_EXIT_$?__"`.
   - Strips ANSI color codes and returns structured `{ stdout, stderr, exitCode }`.
3. **LSP Diagnostics & Symbol Tools**:
   - `lsp_get_diagnostics(file_path)`: Queries current compiler / linter diagnostics.
   - `lsp_get_symbols(file_path)`: Returns classes, methods, and interface definitions.
4. **Live MCP Bridge**:
   - Connects to configured MCP servers (HTTP / SSE / stdio).
   - Dynamically calls `tools/list` and registers them into the active tool set.
   - Dispatches `tools/call` via JSON-RPC 2.0.
5. **AIF Tools**:
   - `aif_recall()`, `aif_scratch(intent)`, `aif_note(importance, summary)`, `aif_query(keyword)`.

### D. AIF Cognitive Memory Persistence (`AifMemoryManager.kt`)
1. **Data Directory Location**:
   - Root: `/storage/emulated/0/KryptonIDE/aif/`
   - Active Project: `/storage/emulated/0/KryptonIDE/aif/${projectId}.ai`
   - Cross-Project Bridge: `/storage/emulated/0/KryptonIDE/aif/bridge_nexus.ai`
2. **Lifecycle Protocols**:
   - **Boot Recall**: When a chat session opens, load the project's Red Core (`INT16_CORE`) blocks and cross-project synaptic pointers into the agent context.
   - **Pre-Task Volatile Scratch**: Before executing multi-file edits or terminal commands, write the active task state to `.scratch_state.tmp`.
   - **End-of-Turn Cognitive Commit**: At the conclusion of every productive turn, commit an AIF block with importance rating (`0.0` to `1.0`) and concise summary.

### E. Deterministic System Prompt & UI Guidelines
1. **Immutable System Prompt**:
   - Remove the user system prompt editor from settings. The prompt is immutable and enforces the structured tag protocol: `<ans>`, `<plan>`, `<edit file="...">`, `<status>`, `<aif_note>`.
2. **Settings Upstream Attribution**:
   - Add a prominent card in Settings with Oorty's logo and link: `https://github.com/Sednium-Technologies/OORTY`.
   - Label: "Oorty Lite — Distilled from Oorty v3.14 for Kryptonide".
3. **Branding & Icons**:
   - Completely eradicate all "Larry" strings.
   - Use `oorty_icon.webp` / `oorty_icon.png` in Jetpack Compose UI.

---

## 3. Implementation Checklist for the Agent

- [ ] Add `com.sednium.kryptonide.agent` package hierarchy.
- [ ] Implement `LayaSystemOneEngine.kt` with fast intent routing, risk scoring, and context pruning.
- [ ] Connect `OortyNativeBridge.kt` to `oorty_engine.cpp` in `app/src/main/cpp/`.
- [ ] Build `AgentToolRegistry.kt` and integrate with `NativeTerminalPlugin` and SAF filesystem.
- [ ] Create `AifMemoryManager.kt` storing binary `.ai` files in `/storage/emulated/0/KryptonIDE/aif/`.
- [ ] Build Compose UI: Pocket Server screen, model selector, hardware warning dialog, and Settings link to `https://github.com/Sednium-Technologies/OORTY`.
- [ ] Lock down system prompt in UI and verify all "Larry" occurrences are replaced with "Oorty Lite".
