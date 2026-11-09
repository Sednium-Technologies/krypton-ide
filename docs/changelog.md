# Changelog

## v4.0.0 — 2026-11-09

Kryptonide 4.0 is the Rust + TypeScript + Kotlin Android IDE release. This changelog covers the release-blocking fixes and repository cleanup completed for the v4.0.0 build. The older September 2026 porting notes are preserved in [`docs/archive/legacy-v4-porting-notes-2026-09-13.md`](archive/legacy-v4-porting-notes-2026-09-13.md).

### Highlights

- Fixed Android AI provider requests that failed because of WebView CORS restrictions.
- Fixed provider-specific reasoning parameters being sent to models that do not support them.
- Fixed Google Sign-In failing with the vague `10: check your internet connection` message.
- Fixed the workspace crash caused by opening **Settings → Extensions**.
- Corrected the README, product name, and stale documentation for the Android-only v4 release.
- Removed stale audits, planning files, scratch tests, and tracked local agent skills from the repository history.

### Comparison with v3.0.0 (Legacy)

| Capability | v3.0.0 (Legacy) | v4.0.0 (Current) |
|---|---|---|
| **Core Architecture** | Pure frontend / webview shell | Rust Core Engine + TypeScript + Kotlin Native Host |
| **Terminal & PTY** | Emulated basic shell | Real Termux POSIX backend & NDK native PTY |
| **AI Assistant** | Larry AI with hardcoded legacy models | Oorty Lite AI Engine with live endpoint model discovery & native CORS bridge |
| **Reasoning Support** | None | Model-aware reasoning controls for OpenAI o-series, Claude thinking, Gemini thinking, and DeepSeek |
| **Extensions** | Static simulated catalog | Real Native Extension Host executing OPC VSIX packages & webview contributions |
| **File Tree & UI** | Boxed icons, straight indentation lines | Aesthetic vector silhouette icons, continuous curved Bézier guides, Ivory default theme |
| **Google Sign-In** | Legacy auth prone to error 10 / developer error | Modern Android Credential Manager with actionable error diagnostics |
| **Security & Trust** | Unrestricted execution | Workspace Trust system with restricted mode, permission audits, and user consent gates |

### AI providers

- Added a native `CapacitorHttp` fallback for AI completion requests when Android WebView `fetch` is blocked by CORS. The non-streaming native response is converted back into the existing SSE parser, so tool calls and message handling keep working.
- NVIDIA NIM now avoids the WebView CORS failure that produced `Could not reach NVIDIA NIM`.
- Provider requests now use model-aware token fields:
  - OpenAI `o`-series, `gpt-5`, `gpt-6`, and Codex models use `max_completion_tokens`.
  - Other OpenAI-compatible providers use `max_tokens`.
- Reasoning controls are now sent only to models that support them:
  - Gemini 2.5 uses `thinkingConfig.thinkingBudget`.
  - Gemini 3 uses `thinkingConfig.thinkingLevel`.
  - Supported Claude models use `thinking.budget_tokens`, clamped below `max_tokens`.
  - Supported OpenAI reasoning models use `reasoning_effort`.
  - Supported OpenRouter reasoning models use `reasoning.effort`.
  - NVIDIA NIM, Groq, DeepSeek, Moonshot, and custom providers no longer receive unrecognised reasoning fields.
- Anthropic thinking budgets are clamped to valid limits. Models that do not support thinking no longer receive a thinking block.
- Added clear errors for missing model selection and missing API keys.
- HTTP failures now include the provider name, HTTP status, and the provider's response body instead of a generic connection message.

### Google Sign-In

- Removed the forced legacy Google Sign-In path and now use the plugin's default Credential Manager flow.
- Added provider-specific sign-in error descriptions:
  - `10` / `DEVELOPER_ERROR` reports a package, SHA-1, or Web client configuration mismatch instead of blaming the network.
  - Cancellation codes are handled without an error alert.
  - `12500`, `12502`, network errors, missing device accounts, disabled Firebase providers, and invalid API keys receive actionable messages.
- The welcome screen, permission consent modal, and Settings panel now use the same error mapping.

### Extensions and settings

- Fixed the infinite render loop when opening **Settings → Extensions**. The panel no longer returns a new array from a Zustand selector under React 19; contributed configurations are derived with `useMemo`.
- Contributed extension configurations now support both single-object and array manifest formats.
- Extension configuration values still persist through the existing extension host store.

### Documentation and repository

- Renamed user-facing references from **Krypton IDE** and **Krypton-ide** to **Kryptonide**.
- Corrected the README to describe Kryptonide as an Android app. The Vite build is the Capacitor frontend for development and UI verification, not a PWA or hosted web product.
- Removed stale PWA wording from the architecture documentation.
- Removed stale audit reports, planning documents, scratch tests, generated files, and the old project structure dump.
- Added `.agents/`, `/scratch/`, and `/default_project.ai` to `.gitignore`.
- Kept the local `.agents/skills/verify-krypton-ide` workflow while removing tracked local agent skills from Git history.

### Verification

- Frontend test suite: 145 tests passing.
- Rust test suite: 73 tests passing.
- Targeted TypeScript compile check: passing.
- Android release APK: built and signed with `android/app/release.keystore`.

### Upgrade notes

- No project data or API keys were migrated or removed.
- Android builds should use the release keystore whose SHA-1 is registered in `android/app/google-services.json`.
- NVIDIA NIM and other providers without permissive CORS headers are expected to work through the native Android bridge. Browser-only development builds may still be blocked by provider CORS policy.
- Full `tsc --noEmit` on this workspace is slow on low-memory machines; use the targeted test and compile commands documented in the README when validating a change.
