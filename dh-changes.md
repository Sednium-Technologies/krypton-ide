# Handoff: Audit Fixes Applied

Working tree has **uncommitted** changes. Nothing was staged or committed.

## Verification

| Check | Command | Result |
|---|---|---|
| Tests | `npm test` | **74/74 pass** |
| Typecheck | `npx tsc --noEmit` | **exit 0** (slow: ~10 min in this repo) |
| Production build | `npm run build` | **Not verified**: Vite transform hits Node's ~2 GB heap limit (`JavaScript heap out of memory`) on this 3.7 GB machine. Likely environmental (large `@huggingface/transformers` bundle); retry on a machine with more RAM or `NODE_OPTIONS=--max-old-space-size=4096`. |

Tests and typecheck were run after all code edits. No runtime/device testing was performed.

## Changed Files

### Security

- `src/lib/ai/toolActions.ts`
  - Replaced broken ESM `require('../../store/useProjectsStore')` with a static import.
  - `getProjectBasePath()` now uses `getProjectPath(projectId)`.
  - All disk operations now use `defaultDir()` instead of hardcoded `Directory.Documents`, so AI tools and the IDE read/write the same location.
- `src/lib/fileSystemStorage.ts`
  - `getProjectPath()` now returns `${base}/projects/${projectId}` (removed the stray `project_` prefix). Matches every other path builder in the file.
- `src/components/extensions/ExtensionWebviewHost.tsx`
  - Removed `allow-same-origin` from the extension iframe sandbox.
  - Existing source + `extensionId` validation on incoming `postMessage` remains.
- `src/lib/dynamicIconEngine.ts`
  - Added `sanitizeSvg()` (DOMPurify SVG profile, forbids scripts/`foreignObject`/event attrs; conservative regex fallback for non-DOM test environments).
  - `registerCustomSvg()` stores only sanitized markup, closing stored XSS via `LanguageIcon`.
- `src/components/extensions/ExtensionDetailModal.tsx`
  - Repository link only renders when the URL matches `^https?://`.
- `src/components/preview/LivePreview.tsx`
  - Markdown preview is sanitized with DOMPurify before embedding; removed the CDN `marked` script and now imports `marked` locally.
  - Console `message` handler validates `e.source`, event type, level, and argument type/size.
  - `package.json` dependency names/versions are validated before being interpolated into the importmap/HTML (prevents markup breakout).
  - Added `useObjectUrl()` so blob URLs are revoked on change/unmount (was leaking one per keystroke). HTML/React/Markdown/SVG previews now share it.
- `src/lib/googleDriveSync.ts`
  - Native restore validates zip entry paths and skips absolute paths, Windows drive paths, and `..` segments (zip-slip).
  - Web restore only writes `kfs:`-prefixed keys from the backup.
- `src/lib/ai/inlineCompletionService.ts`
  - Gemini API key moved from the URL query string to the `x-goog-api-key` header.

### Bugs

- `src/components/editor/CodeEditor.tsx`
  - Monaco model URIs now use the file node id (`fileModelUri()`), not just the file name. Two same-named files no longer share one buffer.
  - Pending 300 ms debounced edits are flushed when switching files or unmounting.
  - Inline-completion cleanup now clears its timer and aborts in-flight requests.
- `src/store/useIdeStore.ts`
  - Added `sanitizeFileName()` and applied it in `createFile()` / `renameFile()` (blocks separators and `..` path traversal).
  - Deleting a folder now clears `activeFileId` when the active file was a deleted descendant.
- `src/components/sidebar/FileExplorer.tsx`
  - Folder/file deletion is persisted immediately with `writeProjectFiles()` instead of waiting for the debounced autosave.
  - Long-press timer is cleared on unmount.
- `src/components/sidebar/AiAssistant.tsx`
  - No longer overwrites a custom/self-hosted `baseUrl`; it still updates when switching between known provider defaults.
- `src/components/layout/IdeLayout.tsx`
  - Fixed missing `visualViewport` `'resize'` listener removal.
- `src/components/sidebar/GitPanel.tsx`
  - Auto-push `setTimeout` is tracked and cleared on unmount.
- `src/components/build/BuildPanel.tsx`
  - `getStatusState()` now actually returns `'error'` for failed states (previously left a dead `if` block).

### Performance

- `src/store/useAiStore.ts`
  - Streaming text updates are coalesced to one state write per animation frame (fallback 16 ms timer), with a final flush on completion/abort.
- `src/lib/githubService.ts`
  - Pull fetches blobs with a bounded worker pool (6) instead of sequentially.
  - Base64 decoding now uses `TextDecoder` (correct UTF-8, no deprecated `escape`), and non-string content is skipped.
- `src/store/useNativeTerminalStore.ts`
  - Terminal `buffer` changed from a chunk array to a single string; trims to ~200k chars only after 400k, so no array copy per output chunk.
- Deleted now-unused `shell` manual chunk from `vite.config.ts`.

### Removed Dead Code

These had no references (verified with grep across `src`, `tests`, `vite.config.ts`):

- `src/lib/shellEngine.ts`
- `src/lib/ai/toolDefinitions.ts`
- `src/store/useCommandRegistry.ts`
- `src/components/editor/OpenFilesDropdown.tsx`
- `src/components/sidebar/SearchPanel.tsx`
- `src/lib/folderPickerPlugin.ts`

Kept intentionally: `src/lib/pocket/PocketRouter.ts` (used by `tests/PocketServer.test.ts`) and `src/lib/nativePlugins.ts` (Rust bridge).

### Repo Hygiene

- `.gitignore`: `build/` -> `/build/`. The unanchored pattern was ignoring **`src/components/build/`**, so `BuildPanel.tsx` was never tracked in git.

## Action Required

`src/components/build/BuildPanel.tsx` is now visible as **untracked** because of the `.gitignore` fix (it was previously hidden). It contains the `BuildPanel` error-state fix, so add it before committing:

```bash
git add src/components/build/BuildPanel.tsx
```

## Suggested Next Steps

1. Review the diff (`git diff`) and run `npm test` + `npx tsc --noEmit`.
2. Device-test extension webviews after removing `allow-same-origin`: extensions that rely on `localStorage`, cookies, or service-worker origin checks may need a compatibility fallback.
3. Verify Gemini inline completion on web (custom header triggers a CORS preflight; endpoint supports it, but confirm on device).
4. Remaining known low-priority items (not changed):
   - `AUDIT_REPORT.md` BUG-AUTH-01 / SEC-SIGN-01 (keystore alias + real Firebase `google-services.json`) needs real credentials/config, not code-only changes.
   - CSP in `index.html` is still permissive (`unsafe-eval`, broad `https:`); required by Monaco/`esm.sh`, so tighten only with build-specific testing.
   - `FileExplorer` exports to `Directory.Documents` on purpose (user-visible export/share); don't migrate those to `defaultDir()`.
5. Commit only when the user asks; no commits were made.
