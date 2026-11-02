# Extension Host Phase 0 — Remove Hardcoded Extension Data

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every extension surface in Krypton VSIX-driven, deleting the fake catalog, hardcoded theme tables, mock webview state, and simulated tool detection, without changing the Krypton visual design.

**Architecture:** Keep the existing declarative install pipeline as the explicit web fallback, but the source of truth becomes installed package metadata (`customExtensions`). Theme selection moves to a single dynamic registry keyed by Monaco theme id. The webview host becomes a generic message bridge. Native execution arrives in Phases 1–6 of `docs/design/krypton-native-extension-host.md`.

**Tech Stack:** React 19, TypeScript, Zustand 5, Vite 6, Node `node:test` + `tsx`, JSZip, Open VSX.

**Spec:** `docs/design/krypton-native-extension-host.md`

## Global Constraints

- Do not change Krypton design tokens, layout, spacing, or color palette.
- No new runtime dependencies in Phase 0.
- Do not remove built-in IDE features (Explorer, Search, Git, AI, Extensions, Settings).
- Keep `npm test`, `npm run type-check`, and `npm run build` green.
- Web mode may keep a fallback, but it must be explicitly labeled and must never claim simulated tools are installed.
- Do not add comments unless required to explain non-obvious behavior.

---

### Task 1: Pure extension lookup helpers

**Files:**
- Create: `src/lib/extensions/extensionRegistry.ts`
- Test: `tests/extensionRegistry.test.ts`

**Interfaces:**
- Consumes: `Extension` from `src/store/useExtensionsStore.ts` (type-only import).
- Produces:
  - `interface ExtensionLookupState { customExtensions: Extension[]; installedExtensions: string[] }`
  - `getInstalledExtensions(state: ExtensionLookupState): Extension[]`
  - `findExtension(state: ExtensionLookupState, id: string): Extension | undefined`

- [ ] **Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { getInstalledExtensions, findExtension } from '../src/lib/extensions/extensionRegistry';

const state = {
  customExtensions: [
    { id: 'a.one', name: 'One', publisher: 'a', description: '', icon: 'package', category: 'productivity' as const, installed: true },
    { id: 'b.two', name: 'Two', publisher: 'b', description: '', icon: 'package', category: 'productivity' as const, installed: true },
  ],
  installedExtensions: ['a.one'],
};

test('getInstalledExtensions returns only installed custom extensions', () => {
  const result = getInstalledExtensions(state);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'a.one');
  assert.equal(result[0].installed, true);
});

test('findExtension resolves only from installed packages', () => {
  assert.equal(findExtension(state, 'b.two')?.name, 'Two');
  assert.equal(findExtension(state, 'theme-dracula'), undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/extensionRegistry.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/extensions/extensionRegistry'`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Extension } from '../../store/useExtensionsStore';

export interface ExtensionLookupState {
  customExtensions: Extension[];
  installedExtensions: string[];
}

export function getInstalledExtensions(state: ExtensionLookupState): Extension[] {
  const installed = new Set(state.installedExtensions);
  return state.customExtensions
    .filter((ext) => installed.has(ext.id))
    .map((ext) => ({ ...ext, installed: true }));
}

export function findExtension(state: ExtensionLookupState, id: string): Extension | undefined {
  return state.customExtensions.find((ext) => ext.id === id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/extensionRegistry.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/extensions/extensionRegistry.ts tests/extensionRegistry.test.ts
git commit -m "feat(extensions): add pure extension lookup helpers"
```

---

### Task 2: Delete the hardcoded extension catalog

**Files:**
- Modify: `src/store/useExtensionsStore.ts:65-415` (delete `EXTENSIONS_CATALOG`)
- Modify: `src/store/useExtensionsStore.ts` (`installExtension`, `uninstallExtension`)
- Modify: `src/components/sidebar/ExtensionsPanel.tsx` (catalog references)
- Modify: `src/components/sidebar/ExtensionViewPanel.tsx` (catalog references)
- Modify: `src/store/useNavbarStore.ts` (catalog references)
- Test: `tests/noHardcodedExtensionData.test.ts`

**Interfaces:**
- Consumes: `findExtension` from Task 1.
- Produces: the store no longer exports `EXTENSIONS_CATALOG`; installed lookups use `customExtensions`.

- [ ] **Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as storeModule from '../src/store/useExtensionsStore';

test('store no longer exports the hardcoded catalog', () => {
  assert.equal('EXTENSIONS_CATALOG' in storeModule, false);
});

test('no source file references EXTENSIONS_CATALOG', () => {
  const files = [
    'src/store/useExtensionsStore.ts',
    'src/store/useNavbarStore.ts',
    'src/components/sidebar/ExtensionsPanel.tsx',
    'src/components/sidebar/ExtensionViewPanel.tsx',
  ];
  for (const file of files) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.equal(source.includes('EXTENSIONS_CATALOG'), false, `${file} still references EXTENSIONS_CATALOG`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/noHardcodedExtensionData.test.ts`
Expected: FAIL on both tests.

- [ ] **Step 3: Delete the catalog and rewire store lookups**

Delete the entire `export const EXTENSIONS_CATALOG: Extension[] = [ ... ];` block.

In `installExtension`, replace:

```ts
const ext = EXTENSIONS_CATALOG.find((e) => e.id === id);
```

with:

```ts
const ext = get().customExtensions.find((e) => e.id === id);
```

In `uninstallExtension`, replace:

```ts
const ext = [...EXTENSIONS_CATALOG, ...state.customExtensions].find(e => e.id === id);
```

with:

```ts
const ext = state.customExtensions.find((e) => e.id === id);
```

Update the three consumers so the build still compiles after the catalog deletion:

`src/components/sidebar/ExtensionsPanel.tsx`:

```ts
const combined = [...(customExtensions || [])];
```

(apply to both `allInstalledList` and `fallbackCuratedList`)

`src/components/sidebar/ExtensionViewPanel.tsx`:

```ts
const allInstalled = [...customExtensions].filter((e) => installedExtensions.includes(e.id));
```

and delete the final `EXTENSIONS_CATALOG.find(...)` branch from the `extension` lookup.

`src/store/useNavbarStore.ts`:

```ts
const allInstalled = custom.filter((e) => installed.includes(e.id));
```

Then remove every `EXTENSIONS_CATALOG` import from those three files. Task 3 replaces these minimal substitutions with the pure helpers and removes the curated fallback UI.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/noHardcodedExtensionData.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/useExtensionsStore.ts src/store/useNavbarStore.ts src/components/sidebar/ExtensionsPanel.tsx src/components/sidebar/ExtensionViewPanel.tsx tests/noHardcodedExtensionData.test.ts
git commit -m "refactor(extensions): remove hardcoded extension catalog"
```

---

### Task 3: Extensions panel uses installed packages only

**Files:**
- Modify: `src/components/sidebar/ExtensionsPanel.tsx:23-35,182-215,246-290`
- Modify: `src/components/sidebar/ExtensionViewPanel.tsx:17,31-49`
- Modify: `src/store/useNavbarStore.ts:15,314-375`

**Interfaces:**
- Consumes: `getInstalledExtensions`, `findExtension` from Task 1.
- Produces: no offline curated fallback; an explicit error card with retry.

- [ ] **Step 1: Replace installed list derivation**

```ts
const installedList = useMemo(
  () => getInstalledExtensions({ customExtensions, installedExtensions }),
  [customExtensions, installedExtensions]
);

const allInstalledList = useMemo(() => {
  if (!debouncedQuery.trim()) return installedList;
  const q = debouncedQuery.toLowerCase();
  return installedList.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.publisher.toLowerCase().includes(q)
  );
}, [installedList, debouncedQuery]);
```

- [ ] **Step 2: Remove the curated fallback**

Delete `fallbackCuratedList`. Add a retry nonce:

```ts
const [retryNonce, setRetryNonce] = useState(0);
```

Include `retryNonce` in the Open VSX search effect dependency array. In the marketplace results area, when `searchError` is set, render:

```tsx
<div className="p-4 m-3 rounded-2xl border border-red-500/30 bg-red-500/10 text-xs text-red-300">
  <p className="font-semibold mb-1">Open VSX is unreachable</p>
  <p className="opacity-80">Connect to the internet or retry. Krypton no longer ships a curated fallback catalog.</p>
  <button
    onClick={() => setRetryNonce((n) => n + 1)}
    className="mt-2 px-3 py-1.5 rounded-xl bg-red-500/20 border border-red-400/30 font-semibold"
  >
    Retry
  </button>
</div>
```

Render `marketplaceResults` directly; never render `fallbackCuratedList`.

- [ ] **Step 3: Replace local extension lookup in the detail/apply path**

In `ExtensionViewPanel`, replace the `allInstalled` + triple `.find` chain with:

```ts
const extension = findExtension(
  { customExtensions, installedExtensions },
  activeExtensionView?.extensionId || ''
);
```

Remove the `EXTENSIONS_CATALOG` import and the `customExtensions.find` fallback.

- [ ] **Step 4: Replace catalog lookups in `useNavbarStore`**

```ts
const extState = useExtensionsStore.getState();
const installed = new Set(extState.installedExtensions || []);
const allInstalled = extState.customExtensions.filter((e) => installed.has(e.id));
```

Remove the `EXTENSIONS_CATALOG` import.

- [ ] **Step 5: Run type-check**

Run: `npm run type-check`
Expected: PASS with no `EXTENSIONS_CATALOG` references.

- [ ] **Step 6: Commit**

```bash
git add src/components/sidebar/ExtensionsPanel.tsx src/components/sidebar/ExtensionViewPanel.tsx src/store/useNavbarStore.ts
git commit -m "refactor(extensions): drive installed UI from VSIX metadata"
```

---

### Task 4: Single dynamic Monaco theme registry

**Files:**
- Modify: `src/lib/monacoThemes.ts:14-224`
- Modify: `src/store/useExtensionsStore.ts:43-62,417-558,633-672,1014-1060,1128-1150,1180-1210,1440-1520,1640-1660,1760-1800`
- Modify: `src/store/useIdeStore.ts` consumers (no field change)
- Modify: `src/components/editor/CodeEditor.tsx:130,236-242,617-621,933`
- Modify: `src/components/sidebar/ExtensionsPanel.tsx:240-290`
- Modify: `src/components/extensions/ExtensionDetailModal.tsx:31,234-245`
- Test: `tests/monacoThemes.test.ts`

**Interfaces:**
- Consumes: installed `Extension.monacoThemeId`.
- Produces:
  - `registerMonacoTheme(themeId: string, definition: MonacoThemeDefinition): void`
  - `resolveActiveMonacoTheme(storeTheme: string, activeMonacoThemeId: string | null): string`
  - Store field `activeMonacoThemeId: string | null`
  - Store action `setActiveThemeExtension(id: string | null)` resolves the extension's `monacoThemeId`.

- [ ] **Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { MONACO_THEMES, registerMonacoTheme, resolveActiveMonacoTheme } from '../src/lib/monacoThemes';

test('built-in registry contains only the Krypton default', () => {
  assert.deepEqual(Object.keys(MONACO_THEMES), ['krypton-warm']);
});

test('registerMonacoTheme adds a package theme', () => {
  registerMonacoTheme('acme-ocean', {
    id: 'acme-ocean',
    name: 'Ocean',
    base: 'vs-dark',
    colors: { 'editor.background': '#001122' },
    rules: [],
  });
  assert.equal(MONACO_THEMES['acme-ocean'].name, 'Ocean');
});

test('resolveActiveMonacoTheme returns the active installed theme id', () => {
  assert.equal(resolveActiveMonacoTheme('vs-dark', 'acme-ocean'), 'acme-ocean');
  assert.equal(resolveActiveMonacoTheme('light', 'acme-ocean'), 'vs');
  assert.equal(resolveActiveMonacoTheme('vs-dark', null), 'krypton-warm');
  assert.equal(resolveActiveMonacoTheme('vs-dark', 'missing-theme'), 'krypton-warm');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/monacoThemes.test.ts`
Expected: FAIL (registry has more keys; resolver returns hardcoded id; `registerMonacoTheme` missing).

- [ ] **Step 3: Trim `src/lib/monacoThemes.ts` to Krypton built-ins**

Keep only the `krypton-warm` entry in `MONACO_THEMES`. Delete `one-dark-pro`, `dracula`, `github-dark`, `monokai`, `nord`, and `catppuccin` definitions. Replace the resolver:

```ts
export function registerMonacoTheme(themeId: string, definition: MonacoThemeDefinition): void {
  MONACO_THEMES[themeId] = definition;
}

export function resolveActiveMonacoTheme(
  storeTheme: string,
  activeMonacoThemeId: string | null
): string {
  if (storeTheme === 'light') return 'vs';
  if (storeTheme === 'hc-black') return 'hc-black';
  return activeMonacoThemeId && MONACO_THEMES[activeMonacoThemeId]
    ? activeMonacoThemeId
    : 'krypton-warm';
}
```

- [ ] **Step 4: Delete the duplicate store theme table and add the id field**

In `src/store/useExtensionsStore.ts`:
- Delete `export const MONACO_THEMES: Record<string, any> = { ... };` (the block starting at line 418).
- Import `MONACO_THEMES`, `registerMonacoTheme` from `../lib/monacoThemes`.
- Delete the fallback rule block in `convertVsCodeThemeToMonaco` that hardcodes Dracula colors; return an empty `rules` array when the package has no `tokenColors`.
- Add `activeMonacoThemeId: string | null` to `ExtensionsState`, initial value `null`, persist in `persistExtensions`, and restore in `loadFromDisk`.
- Change:

```ts
export function applyMonacoTheme(themeId: string, themeDef?: any): void {
  const tDef = themeDef || MONACO_THEMES[themeId];
  if (!tDef) return;
  ...
}
```

to use `registerMonacoTheme` when `themeDef` is supplied, then apply.

- [ ] **Step 5: Resolve themes dynamically on install and apply**

In `installFromFile` and `installFromOpenVsx`, when a theme is parsed:

```ts
registerMonacoTheme(safeThemeId, monacoThemeDef);
set((s) => ({
  customThemes: { ...s.customThemes, [safeThemeId]: monacoThemeDef },
  activeMonacoThemeId: safeThemeId,
  activeThemeExtension: extId,
}));
```

Replace `setActiveThemeExtension` with:

```ts
setActiveThemeExtension: (id) => {
  if (!id) {
    set({ activeThemeExtension: null, activeMonacoThemeId: null });
    persistExtensions(get());
    return;
  }
  const ext = get().customExtensions.find((e) => e.id === id);
  const monacoThemeId = ext?.monacoThemeId || (MONACO_THEMES[id] ? id : null);
  set({
    activeThemeExtension: id,
    activeMonacoThemeId: monacoThemeId,
    activeIconTheme: ext?.iconThemeId || get().activeIconTheme,
  });
  persistExtensions(get());
  if (monacoThemeId) applyMonacoTheme(monacoThemeId);
  if (ext?.iconThemeId) loadIconTheme(ext.iconThemeId);
},
```

Delete the hardcoded `material`, `dracula`, `monokai`, `nord`, `catppuccin`, `github`, `one-dark` branches.

Replace `setActiveIconTheme` with a direct setter:

```ts
setActiveIconTheme: (id) => {
  set({ activeIconTheme: id });
  persistExtensions(get());
  if (id) loadIconTheme(id);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('krypton:icon-theme-updated', { detail: { themeId: id } }));
  }
},
```

- [ ] **Step 6: Update consumers to use `activeMonacoThemeId`**

`CodeEditor.tsx`: destructure `activeMonacoThemeId` instead of `activeThemeExtension`, and pass it to `resolveActiveMonacoTheme` in all three call sites.

`ExtensionsPanel.tsx` and `ExtensionDetailModal.tsx`: compare themes using `activeMonacoThemeId === ext.monacoThemeId`; import `MONACO_THEMES` from `src/lib/monacoThemes`, not from the store.

- [ ] **Step 7: Run tests and type-check**

Run: `npx tsx --test tests/monacoThemes.test.ts && npm run type-check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/monacoThemes.ts src/store/useExtensionsStore.ts src/components/editor/CodeEditor.tsx src/components/sidebar/ExtensionsPanel.tsx src/components/extensions/ExtensionDetailModal.tsx tests/monacoThemes.test.ts
git commit -m "refactor(themes): drive Monaco themes from installed VSIX packages"
```

---

### Task 5: Generic webview bridge, remove fake assistant state

**Files:**
- Create: `src/lib/extensions/webviewBridge.ts`
- Modify: `src/components/extensions/ExtensionWebviewHost.tsx:1-401`
- Test: `tests/webviewBridge.test.ts`

**Interfaces:**
- Consumes: raw `message` objects from extension webviews.
- Produces:
  - `interface WebviewAction { kind: 'openUrl'; url: string } | { kind: 'info'; text: string } | { kind: 'error'; text: string } | { kind: 'forward'; message: unknown }`
  - `routeWebviewMessage(message: any): WebviewAction[]`

- [ ] **Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeWebviewMessage } from '../src/lib/extensions/webviewBridge';

test('routes only safe built-ins and forwards the rest', () => {
  assert.deepEqual(routeWebviewMessage({ command: 'openUrl', url: 'https://example.com' }), [
    { kind: 'openUrl', url: 'https://example.com' },
  ]);
  assert.deepEqual(routeWebviewMessage({ command: 'showInformationMessage', text: 'hi' }), [
    { kind: 'info', text: 'hi' },
  ]);
  assert.deepEqual(routeWebviewMessage({ command: 'openRules' }), [
    { kind: 'forward', message: { command: 'openRules' } },
  ]);
});

test('ignores empty messages', () => {
  assert.deepEqual(routeWebviewMessage(null), []);
  assert.deepEqual(routeWebviewMessage({}), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/webviewBridge.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement the bridge**

```ts
export type WebviewAction =
  | { kind: 'openUrl'; url: string }
  | { kind: 'info'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'forward'; message: unknown };

export function routeWebviewMessage(message: any): WebviewAction[] {
  if (!message) return [];
  const command = message.command || message.type;
  if (!command) return [];

  if ((command === 'openUrl' || command === 'vscode:openUrl') && typeof message.url === 'string') {
    let url: URL;
    try {
      url = new URL(message.url);
    } catch {
      return [{ kind: 'error', text: 'Blocked unsafe URL from extension webview' }];
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'mailto:') {
      return [{ kind: 'error', text: 'Blocked unsafe URL from extension webview' }];
    }
    return [{ kind: 'openUrl', url: message.url }];
  }
  if ((command === 'showInformationMessage' || command === 'toast') && typeof message.text === 'string') {
    return [{ kind: 'info', text: message.text }];
  }
  if (command === 'showErrorMessage' && typeof message.text === 'string') {
    return [{ kind: 'error', text: message.text }];
  }
  return [{ kind: 'forward', message }];
}
```

- [ ] **Step 4: Rewrite `ExtensionWebviewHost`**

Delete:
- `extensionState`, `extensionStateRef`, `sendPayloadUpdate`.
- `ensureKryptonFileAndOpen` and every `case` that fakes behavior (`openRules`, `openMcp`, `openBrowserAllowlist`, `restartLanguageServer`, `toggleTask`, `toggleContext`, `toggleAutoAccept`, `openFile`, `updateContent`, `terminalInput`).
- The `useNativeTerminalStore` import. Keep `useToastStore`; it now shows only real extension notifications.

Keep the `acquireVsCodeApi` polyfill and theme variables. Replace the message handler with:

```ts
useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    if (event.source !== iframeRef.current?.contentWindow) return;
    if (!event.data || event.data.type !== 'vscode-webview-message') return;
    if (event.data.extensionId !== extensionId) return;

    for (const action of routeWebviewMessage(event.data.message)) {
      if (action.kind === 'openUrl') window.open(action.url, '_blank', 'noopener,noreferrer');
      else if (action.kind === 'info') useToastStore.getState().info(action.text);
      else if (action.kind === 'error') useToastStore.getState().error(action.text);
      else {
        window.dispatchEvent(
          new CustomEvent('krypton:webview-message', {
            detail: { extensionId, viewId, message: action.message },
          })
        );
      }
    }
  };
  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, [extensionId, viewId]);
```

Add a host→webview listener for later phases:

```ts
useEffect(() => {
  const handleHostMessage = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (detail?.extensionId !== extensionId) return;
    if (detail?.viewId && detail.viewId !== viewId) return;
    iframeRef.current?.contentWindow?.postMessage(detail.message, '*');
  };
  window.addEventListener('krypton:webview-host-message', handleHostMessage);
  return () => window.removeEventListener('krypton:webview-host-message', handleHostMessage);
}, [extensionId, viewId]);
```

On iframe load, dispatch `krypton:webview-ready` instead of sending fake state.

- [ ] **Step 5: Run tests and type-check**

Run: `npx tsx --test tests/webviewBridge.test.ts && npm run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/extensions/webviewBridge.ts src/components/extensions/ExtensionWebviewHost.tsx tests/webviewBridge.test.ts
git commit -m "refactor(webviews): replace fake assistant state with generic bridge"
```

---

### Task 6: Honest extension view fallback

**Files:**
- Modify: `src/components/sidebar/ExtensionViewPanel.tsx:1-344`
- Test: `tests/noHardcodedExtensionData.test.ts` (extend)

**Interfaces:**
- Consumes: `findExtension` (Task 1), `activityBarContributions`, `webviewHtml`.
- Produces: a view panel with no fabricated service status or fake CLI launch.

- [ ] **Step 1: Extend the failing test**

```ts
test('extension view panel has no fake service UI', () => {
  const source = readFileSync(
    new URL('../src/components/sidebar/ExtensionViewPanel.tsx', import.meta.url),
    'utf8'
  );
  assert.equal(source.includes('Active Service'), false);
  assert.equal(source.includes('Sync State'), false);
  assert.equal(source.includes('handleLaunchInTerminal'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/noHardcodedExtensionData.test.ts`
Expected: FAIL on the new test.

- [ ] **Step 3: Rewrite the fallback**

Keep the header and the metadata section. Delete:
- The `Active Service` status card.
- `handleLaunchInTerminal`.
- The "Interactive Actions" grid with `Launch CLI` and `Sync State`.

Render instead:

```tsx
{contribViews.length > 0 ? (
  <div className="space-y-2">
    <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Contributed Views</p>
    {contribViews.map((v) => (
      <button
        key={v.id}
        onClick={() => setIsDetailModalOpen(true)}
        className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs ${
          isLight ? 'bg-[#2a2529]/5 border-[#2a2529]/10' : 'bg-[#f3f0e7]/5 border-[#f3f0e7]/10'
        }`}
      >
        <span className="flex items-center space-x-2 truncate">
          <Layers size={14} className="text-[#7C9B79]" />
          <span className="font-medium truncate">{v.name}</span>
        </span>
        <Info size={13} className="opacity-60" />
      </button>
    ))}
  </div>
) : (
  <div className={`p-4 rounded-2xl border text-xs ${
    isLight ? 'bg-[#2a2529]/5 border-[#2a2529]/10 text-[#2a2529]/70' : 'bg-[#f3f0e7]/5 border-[#f3f0e7]/10 text-[#f3f0e7]/70'
  }`}>
    This package contributes no views or webview. Its commands and language features will run
    through the native extension host.
  </div>
)}
```

Remove the `Terminal`, `Play`, `Cpu`, `CheckCircle2`, `useNativeTerminalStore`, and `useToastStore` imports if unused.

- [ ] **Step 4: Run tests and type-check**

Run: `npx tsx --test tests/noHardcodedExtensionData.test.ts && npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/ExtensionViewPanel.tsx tests/noHardcodedExtensionData.test.ts
git commit -m "refactor(extensions): remove fake extension service panel"
```

---

### Task 7: Real tool detection, no simulated installs

**Files:**
- Modify: `src/hooks/useTerminalScanner.ts:70-81`
- Modify: `src/components/sidebar/SettingsPanel.tsx:794-820`
- Test: `tests/terminalScanner.test.ts`

**Interfaces:**
- Consumes: `Capacitor.isNativePlatform()` and a native `Filesystem.stat` existence probe.
- Produces:
  - `interface ScannedTool { id: string; name: string; category: 'Agent Harness' | 'Runtime' | 'Compiler' | 'Utility'; binary: string; isInstalled: boolean; version?: string; path?: string; reason?: 'web-preview' }`
  - `KNOWN_TOOLS: Array<Omit<ScannedTool, 'isInstalled' | 'version' | 'path' | 'reason'>>`
  - `scanToolsForEnvironment(options: { isNative: boolean; exists: (absolutePath: string) => boolean }): ScannedTool[]`

- [ ] **Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { scanToolsForEnvironment } from '../src/lib/terminal/toolScanner';

test('web preview never reports tools as installed', () => {
  const tools = scanToolsForEnvironment({ isNative: false, exists: () => false });
  assert.equal(tools.every((t) => t.isInstalled === false), true);
  assert.equal(tools.every((t) => t.reason === 'web-preview'), true);
});

test('native reports only tools whose binary exists', () => {
  const tools = scanToolsForEnvironment({
    isNative: true,
    exists: (path: string) => path.endsWith('/node'),
  });
  assert.equal(tools.find((t) => t.binary === 'node')?.isInstalled, true);
  assert.equal(tools.find((t) => t.binary === 'python3')?.isInstalled, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/terminalScanner.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Extract the pure scanner**

Create `src/lib/terminal/toolScanner.ts`. Move the `ScannedTool` interface and `KNOWN_TOOLS` array out of the hook, add `reason`, and implement:

```ts
export function scanToolsForEnvironment(options: {
  isNative: boolean;
  exists: (absolutePath: string) => boolean;
}): ScannedTool[] {
  const prefix = '/data/data/com.sednium.kryptonide/files/usr';
  return KNOWN_TOOLS.map((tool) => {
    if (!options.isNative) {
      return { ...tool, isInstalled: false, reason: 'web-preview' as const };
    }
    const path = `${prefix}/bin/${tool.binary}`;
    return { ...tool, isInstalled: options.exists(path), path };
  });
}
```

Update `src/hooks/useTerminalScanner.ts` to import the type and helper, then build the existence set with the real Capacitor filesystem before scanning:

```ts
const bootstrap = await nativeTerminalBridge.getBootstrapStatus();
const prefix = bootstrap?.prefixPath || '/data/data/com.sednium.kryptonide/files/usr';
const existingPaths = new Set<string>();
for (const tool of KNOWN_TOOLS) {
  const path = `${prefix}/bin/${tool.binary}`;
  try {
    await Filesystem.stat({ path, directory: Directory.Absolute });
    existingPaths.add(path);
  } catch {
    // Binary is genuinely absent.
  }
}
const scanned = scanToolsForEnvironment({
  isNative: true,
  exists: (path) => existingPaths.has(path),
});
```

Add `import { Filesystem, Directory } from '@capacitor/filesystem';` to the hook. Remove the `hasNode`/`hasPython`/`hasRust`/`hasClang` shortcuts; `Filesystem.stat` is the source of truth.

- [ ] **Step 4: Show the web-preview reason**

In `SettingsPanel.tsx`, replace the "Not Installed" label when `tool.reason === 'web-preview'`:

```tsx
<span className="px-2 py-0.5 text-[10px] rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20">
  Native only
</span>
```

- [ ] **Step 5: Run tests and type-check**

Run: `npx tsx --test tests/terminalScanner.test.ts && npm run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useTerminalScanner.ts src/lib/terminal/toolScanner.ts src/components/sidebar/SettingsPanel.tsx tests/terminalScanner.test.ts
git commit -m "fix(terminal): report real tool availability"
```

---

### Task 8: Final verification and documentation

**Files:**
- Modify: `docs/design/krypton-native-extension-host.md` (mark Phase 0 done)
- Modify: `projectstructure.md` (add `src/lib/extensions/`)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 2: Run type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: build completes; inspect output for accidental imports of deleted files.

- [ ] **Step 4: Update docs**

Mark Phase 0 complete in the design doc and add the new `src/lib/extensions/` files to `projectstructure.md`.

- [ ] **Step 5: Commit**

```bash
git add docs/design/krypton-native-extension-host.md projectstructure.md
git commit -m "docs: record extension host phase 0 completion"
```

---

## Follow-on Plans (written when each phase starts)

These are gated on the Phase 1 device spike. Each will get its own
`docs/superpowers/plans/` document once the previous phase lands.

| Phase | First task | Depends on |
|---|---|---|
| 1 | Add `rquickjs` + JNI skeleton, `ExtensionHostPlugin.kt`, `nativeExtensionHost.ts`; install + list + manifest | Phase 0 |
| 2 | QuickJS module loader + `vscode.commands`/`window`/`workspace` shim; activate a fixture extension | Phase 1 |
| 3 | Contribution mapping: activity bar, views, commands, status bar, settings | Phase 2 |
| 4 | LSP manager in Rust + `lspClient.ts` + terminal install UX | Phase 3 |
| 5 | Node compat (`fs`, `path`, `process`) + `child_process` + trust gates | Phase 4 |
| 6 | Test fixtures, device E2E, hardening | Phase 5 |

---

## Self-Review

- **Spec coverage:** Phase 0 of the spec maps to Tasks 1–8. Phases 1–6 are explicitly deferred with their own plans.
- **Placeholder scan:** no TBD/TODO steps; each code change shows the code.
- **Type consistency:** `customExtensions`, `installedExtensions`, `monacoThemeId`, `activeMonacoThemeId`, `ScannedTool.reason`, and `routeWebviewMessage` are defined once and reused consistently.
