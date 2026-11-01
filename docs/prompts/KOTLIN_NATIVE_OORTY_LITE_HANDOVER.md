# Oorty Lite Agent Harness & Pocket Server — Kotlin Native Handover Prompt

This document provides the turnkey prompt and specification for implementing **Oorty Lite** in Kryptonide's pure Android / Kotlin Native codebase (Track 2).

---

```markdown
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
Laya is the ultra-low latency System 1 reflex engine operating in Q4 / FP16 (sub-50ms):
1. **Fast-Path vs Deep-Reasoning Router (`route(query)`)**:
   - Classifies incoming prompt into `fast_path` (local immediate answers, greetings, status) vs `deep_reasoning` (planning, multi-file code writes, refactoring, stack traces).
2. **Deterministic Risk Classifier (`risk(command)`)**:
   - Flags shell commands into `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` (e.g., `rm -rf`, `chmod -R 777`, raw block writes).
3. **Surgical Token Pruner (`prune(context)`)**:
   - Strips redundant compiler lines, ANSI reset junk, and keeps stack trace roots + head/tail context.
4. **Semantic AIF Tag Extractor (`extractTags(text)`)**:
   - Identifies architectural decisions, bug fixes, or key variables for cognitive indexing.

### B. Hardware Optimization Engine & Core Affinity (`HardwareTopology.kt` + C++/JNI)
1. **Sysfs Big-Core Classifier**:
   - Reads `/sys/devices/system/cpu/cpu*/cpufreq/cpuinfo_max_freq`.
   - Normalizes frequencies and classifies cores with freq >= 85% of peak as big cores.
   - Computes optimal thread count for local inference.
2. **Thread Affinity Pinning**:
   - Calls `sched_setaffinity()` via JNI to bind compute-heavy worker threads to big cores.
3. **Hardware Acceleration Detection**:
   - Probes `/dev/kgsl-3d0` (Adreno), `/dev/mali0` (Mali), `/dev/pvrsrvkm` (PowerVR).
   - Detects NPU devices (`/dev/vertex*`, `/dev/edgetpu*`, `/dev/npu*`).
4. **GGUF Fast Header Parser**:
   - Inspects GGUF files in under 1ms via direct buffer/mmap to read magic, architecture, and context length without loading weights.

### C. Unified Agent Harness (`AgentToolRegistry.kt`)
1. **Filesystem Tools**:
   - `read_file(path, offset, limit)`
   - `write_file(path, content, overwrite)`
   - `edit_lines(path, start_line, end_line, new_lines)`
   - `insert_lines(path, after_line, lines)`
   - `patch_file(path, patch_content)`
   - `list_dir(path, recursive)`
2. **Terminal PTY Tool with Exit Sentinels**:
   - Executes commands inside active PTY session.
   - Appends exit sentinel: ` ; echo "__KRYPTON_EXIT_$?__"`.
   - Parses stdout until sentinel is encountered to extract exit code.
3. **LSP Monaco Diagnostics / Symbol Tools**:
   - Queries file diagnostics (errors, warnings).
   - Resolves symbol definitions and references.
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
```
