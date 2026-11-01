# KryptonIDE Comprehensive Project Structure & AI Subsystems Architecture

```
krypton-ide/
├── .github/
│   └── workflows/                       // CI/CD pipelines, release packaging, APK builds
├── crates/                              // High-performance Native Rust Subsystems
│   └── krypton-core-rs/
│       ├── Cargo.toml                   // Dependencies: serde, byteorder, regex, memmap2, rayon
│       ├── src/
│       │   ├── lib.rs                   // Native entry point and feature exports
│       │   ├── jni_bridge.rs            // JNI bindings for Android Kotlin runtime
│       │   ├── hardware_topology.rs     // Sysfs CPU frequency & big-core detector, affinity pinning
│       │   ├── aif/                     // AIF V4 Persistent Cognitive Memory Engine
│       │   │   └── mod.rs               // AIF4 binary format, orbital rings (RedCore/Middle/Crust), token pruner
│       │   ├── fs_walk/                 // Parallel file traversal with gitignore respect
│       │   ├── search/                  // SIMD-accelerated regex/ripgrep text search
│       │   ├── diff/                    // Myers diff and unified patch engine
│       │   ├── zip/                     // High-speed archive extraction & compression
│       │   └── cancel.rs                // Atomic cancellation tokens for background tasks
│       └── tests/
│           └── hardware_tests.rs        // Core affinity and sysfs mock unit tests
├── docs/                                // Architectural specs, audits, and design blueprints
│   ├── AUDIT_REPORT.md                  // Security audits (shell risk classifier, sandboxing)
│   ├── design/                          // Architecture decision records (ADRs)
│   │   ├── command-palette-and-agent-harness-system.md
│   │   └── krypton-core-rust-architecture.md
│   └── prompts/
│       └── KOTLIN_NATIVE_OORTY_LITE_HANDOVER.md // Turnkey Kotlin Native Track 2 agent specification
├── projectstructure.md                  // Root documentation of codebase and AI architecture (This File)
├── src/                                 // TypeScript / React / Monaco Webview & Agent Frontend
│   ├── App.tsx                          // Main UI host and root state initializer
│   ├── index.css                        // Tailwind & CSS custom variable design tokens
│   ├── main.tsx                         // React DOM mounting and service worker bootstrap
│   ├── components/                      // Visual Components & UI Panels
│   │   ├── CommandPalette.tsx           // Quick open, action dispatch, and slash commands
│   │   ├── ai/                          // Agent Chat UI & Inline Controls
│   │   │   ├── AtMentionPicker.tsx      // File, symbol, and context @-mentions
│   │   │   ├── MentionChip.tsx          // Interactive chip rendering for active references
│   │   │   └── SlashCommandPicker.tsx   // Slash commands (/plan, /goal, /laya, /reset)
│   │   ├── editor/                      // Monaco Editor Host & Code Surfaces
│   │   │   ├── CodeEditor.tsx           // Monaco mount, custom themes, inline completion provider
│   │   │   ├── FloatingContextMenu.tsx  // Right-click code actions & quick refactor menu
│   │   │   ├── MarkdownPreview.tsx      // Live markdown, KaTeX math, and mermaid visualizer
│   │   │   └── OpenFilesDropdown.tsx    // Multi-tab file management dropdown
│   │   ├── layout/                      // IDE Chrome & Framing
│   │   │   ├── IdeLayout.tsx            // Split panes, activity bar, sidebars, bottom panels
│   │   │   ├── NavbarOverflowDrawer.tsx // Overflow action drawer for mobile touchscreens
│   │   │   └── StatusBar.tsx            // Branch status, Laya/AI engine indicator, LSP state
│   │   ├── projects/                    // Workspace & File Management
│   │   │   ├── FolderPicker.tsx         // Native SAF / directory selector
│   │   │   ├── PermissionConsentModal.tsx // Android storage permission gatekeeper
│   │   │   └── ProjectsDashboard.tsx    // Project switcher and Git repo cloning
│   │   ├── settings/                    // System & AI Configuration
│   │   │   ├── AgentSettingsPanel.tsx   // Oorty Lite agent settings, model tiers, and prompt flags
│   │   │   └── NavbarSettingsPanel.tsx  // Layout, keybindings, and editor visual settings
│   │   ├── sidebar/                     // Left Navigation Surfaces
│   │   │   ├── ActivityBar.tsx          // Primary mode switcher (Explorer, Search, Git, AI, Pocket)
│   │   │   ├── AiAssistant.tsx          // Real-time agent chat surface with streaming cards
│   │   │   ├── ExtensionsPanel.tsx      // VS Code VSIX & Plugin Marketplace
│   │   │   ├── FileExplorer.tsx         // Tree view with fast CRUD and drag-drop
│   │   │   ├── GitPanel.tsx             // Git staging, commit authoring, and diff review
│   │   │   └── SearchPanel.tsx          // Global search (lexical ripgrep + semantic vector search)
│   │   ├── terminal/                    // Userland Linux Terminal Bridge
│   │   │   ├── BottomPanel.tsx          // Collapsible bottom dock (Terminal, Output, Problems)
│   │   │   ├── TerminalAccessoryBar.tsx // Mobile touch bar for ESC, TAB, CTRL, PIPE, ARROWS
│   │   │   ├── TerminalPanel.tsx        // Xterm.js terminal emulator with PTY integration
│   │   │   └── TermuxBootstrapModal.tsx // Linux environment bootstrap installer
│   │   └── ui/                          // Atomic Design Tokens & Common Controls
│   │       ├── BottomSheet.tsx          // Touch-friendly swipeable drawer
│   │       ├── ConfirmationSheet.tsx    // Destructive command safety confirmation modal
│   │       ├── ErrorBoundary.tsx        // React render failure trap
│   │       ├── Modal.tsx                // Accessible modal dialog
│   │       ├── OortyLiteIcon.tsx        // Hardware-accelerated agent emblem
│   │       └── ToastContainer.tsx       // Status and notification toast stack
│   ├── config/                          // Configuration Schemas & Base Prompts
│   │   ├── aiProviders.ts               // Model definitions for local Pocket & API providers
│   │   └── prompts/
│   │       └── oorty_lite.txt           // Deterministic Oorty Lite agent system prompt
│   ├── hooks/                           // Reusable Lifecycle & State Hooks
│   │   ├── useDynamicModels.ts          // Queries available models from Pocket Server & APIs
│   │   ├── useEditorCompletions.ts      // Connects Monaco to inline ghost text engine
│   │   ├── useFileWatcher.ts            // Real-time filesystem change listener
│   │   └── useKeyboardShortcuts.ts      // Desktop keybinding router
│   ├── lib/                             // Core Services & AI Engine Implementations
│   │   ├── ai/                          // Agent Orchestration, Tools & Memory
│   │   │   ├── AgentToolRegistry.ts     // Unified tool execution dispatcher
│   │   │   ├── AifManager.ts            // TypeScript bridge to AIF V4 binary format & memory
│   │   │   ├── inlineCompletionService.ts // PolyCoder-160M local FIM & heuristic autocomplete
│   │   │   ├── modelAdapters.ts         // Streaming adapters for Gemini, Claude, OpenAI, Ollama
│   │   │   ├── toolActions.ts           // Execution handlers for read, write, edit, terminal, tools
│   │   │   └── toolDefinitions.ts       // OpenAI/Gemini JSON schemas (includes laya_contrastive_decision)
│   │   ├── pocket/                      // Local Pocket Server & On-Device Micro-Models
│   │   │   ├── LayaSystem1.ts           // Laya non-autoregressive decision engine & risk evaluator
│   │   │   └── PocketRouter.ts          // Directs requests to System 1 reflex or System 2 reasoner
│   │   ├── terminal/                    // Native Linux PTY Bridge
│   │   │   └── nativeTerminalBridge.ts  // PTY spawn, stdout reader, exit sentinel detector
│   │   ├── fileSystemStorage.ts         // Capacitor Filesystem + IndexedDB storage layer
│   │   ├── nativePlugins.ts             // Capacitor plugin interfaces (SAF, FastSearch, KryptonCore)
│   │   └── storagePermission.ts         // Android MANAGE_EXTERNAL_STORAGE permission probe
│   ├── store/                           // Global State Management (Zustand)
│   │   ├── useAiStore.ts                // Chat sessions, tool execution loop, prompt synthesis
│   │   ├── useCommandRegistry.ts        // Command palette action registration
│   │   ├── useExtensionsStore.ts        // Installed themes, extensions, and downloadable sectors
│   │   ├── useIdeStore.ts               // Open tabs, active file, active sidebar panel
│   │   ├── useMcpStore.ts               // Model Context Protocol clients & dynamic tools
│   │   ├── usePocketStore.ts            // Local model catalog (Laya, PolyCoder, EmbeddingGemma, GGUFs)
│   │   └── useProjectsStore.ts          // Project workspace roots and recents
│   └── workers/                         // Background Web Workers (Off-Main-Thread Compute)
│       ├── fsWorker.ts                  // Large directory scanning and file indexing
│       ├── lintWorker.ts                // Monaco diagnostics and syntax verification
│       └── searchWorker.ts              // Fast wasm regex search engine
└── tests/                               // Test Suites
    ├── AgentToolRegistry.test.ts        // Tool execution, safety gates, and Laya risk rules
    └── PocketServer.test.ts             // Pocket model discovery, engine mode switching
```

---

## AI Subsystems Division of Labor & Downloadable Sectors

| Sector / Tier | Model / Technology | Parameters & Footprint | Primary Responsibilities | Installation Status |
| :--- | :--- | :--- | :--- | :--- |
| **Sector 1: System 1 Reflex & Triage** | **`convaiinnovations/laya`** (ModernBERT / mmBERT backbone) | ~300M (ONNX/SafeTensors) ~250MB | • Non-autoregressive sub-35ms choice scoring<br>• Terminal command risk classification<br>• Intent routing (Fast Path vs Deep Reasoning)<br>• Triage (Local Code vs DB vs Web Search)<br>• Exposed to API LLMs via `laya_contrastive_decision` | **Downloadable Sector** (Optional, falls back to deterministic heuristics) |
| **Sector 2: Keystroke Ghost Text** | **`NinedayWang/PolyCoder-160M`** | 160M parameters (~90MB at Q4) | • Monaco Editor inline ghost text<br>• Native Fill-in-the-Middle (FIM) infilling<br>• 12 programming languages (TS, Python, C++, Rust)<br>• Sub-20ms latency on CPU big cores | **Downloadable Sector** (Optional, falls back to heuristic predictor) |
| **Sector 3: Semantic RAG & Vectors** | **`google/embeddinggemma-2`** (or `embeddinggemma-300m`) | 740M / 300M (~191MB-400MB) | • 8K token context window<br>• 768-d Matryoshka Representation Learning (MRL)<br>• Semantic search across all workspace files<br>• User database schema & record vectorization<br>• Dense vector indexing inside `.ai` files | **Downloadable Sector** (Recommended, falls back to lexical ripgrep) |
| **Sector 4: Edge Tool Caller** | **Needle 3** (Cactus Compute) | 8 MB – 29 MB (2-bit CQ2) | • On-device grammar-constrained tool calling<br>• Guaranteed 100% syntactically valid JSON<br>• Parameter grounding against prompt text spans<br>• Zero argument hallucination | **Downloadable Sector** (Optional micro-tool caller) |
| **Sector 5: System 2 Reasoner** | **Frontier API LLM** (Gemini / Claude / Custom API) | Cloud Frontier / Multi-billion | • Deep multi-file planning and refactoring<br>• Architectural decision making<br>• Receives dynamic Laya availability in system prompt<br>• Calls `laya_contrastive_decision` for fast validation | **API Configured** (via user API key or local runner) |

---

## How Frontier LLMs Interact with Laya System 1

1. **System Prompt Injection (`useAiStore.ts` & `oorty_lite.txt`)**:
   ```
   [SYSTEM 1 RUNTIME STATUS]:
   Laya Engine: READY (convaiinnovations/laya ONNX/SafeTensors loaded on-device)
   Available Tool: laya_contrastive_decision
   ```
2. **Tool Definition (`toolDefinitions.ts`)**:
   ```json
   {
     "name": "laya_contrastive_decision",
     "description": "Execute an ultra-fast (<35ms) non-autoregressive forward pass on the local Laya System 1 engine to score candidate options or hypotheses without hallucination.",
     "parameters": {
       "type": "object",
       "properties": {
         "state": { "type": "string", "description": "The current context, code snippet, or command to evaluate." },
         "choices": { "type": "array", "items": { "type": "string" }, "description": "The candidate options or classifications to score." }
       },
       "required": ["state", "choices"]
     }
   }
   ```
3. **Execution Flow (`toolActions.ts`)**:
   When the API model calls `laya_contrastive_decision`, the app queries the local Laya engine directly, returning calibrated confidence percentages for each candidate option in ~33ms without making another network roundtrip.
