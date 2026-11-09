import { create } from 'zustand';
import JSZip from 'jszip';
import { readExtensions, saveExtensionsDebounced } from '../lib/fileSystemStorage';
import { useToastStore } from './useToastStore';
import { downloadVsixBlob, fetchExtensionDetails, type MarketplaceExtension } from '../lib/marketplaceService';
import { addDynamicSnippets, setDynamicSnippets, type CodeSnippet } from '../lib/languageSnippets';
import { saveCustomIconTheme, loadIconTheme } from '../lib/iconThemeStorage';
import { registerExtensionCss, unregisterExtensionCss } from '../lib/customCssManager';
import { storeExtensionAssets, getMimeType, normalizeAssetPath } from '../lib/extensionAssetRegistry';
import {
  reconcileInstalledExtensions,
  deriveActiveMonacoThemeId,
} from '../lib/extensions/extensionRegistry';
import {
  MONACO_THEMES,
  registerMonacoTheme,
  type MonacoThemeDefinition,
} from '../lib/monacoThemes';

export interface Extension {
  id: string;
  name: string;
  publisher: string;
  description: string;
  icon: string; // emoji or icon identifier or remote url
  category: 'theme' | 'language' | 'formatter' | 'productivity' | 'snippet';
  installed: boolean;
  downloads?: string;
  rating?: number;
  // For themes
  themeData?: Record<string, string>;
  monacoThemeId?: string;
  iconThemeId?: string;
  // Extended marketplace fields
  version?: string;
  namespace?: string;
  iconUrl?: string;
  downloadUrl?: string;
  license?: string;
  categories?: string[];
  allVersions?: Record<string, string>;
  activityBarContributions?: Array<{ id: string; title: string; icon?: string; views?: Array<{ id: string; name: string; type?: string }> }>;
  contributedCommands?: Array<{ command: string; title: string; category?: string }>;
  webviewHtml?: string;
  webviewSynthesized?: boolean;
}

export interface InstallProgress {
  stage: string;
  percent: number;
  status: 'installing' | 'installed' | 'failed';
}

interface ExtensionsState {
  installedExtensions: string[];
  activeThemeExtension: string | null;
  activeMonacoThemeId: string | null;
  activeIconTheme: string | null;
  customExtensions: Extension[];
  installedSnippets: CodeSnippet[];
  snippetsByExtension: Record<string, CodeSnippet[]>;
  customThemes: Record<string, any>;
  installProgress: Record<string, InstallProgress>;
  installLogs: Record<string, string[]>;
  
  installExtension: (id: string) => Promise<void>;
  installFromFile: (file: File) => Promise<Extension | null>;
  installFromOpenVsx: (ext: MarketplaceExtension, versionUrl?: string) => Promise<boolean>;
  uninstallExtension: (id: string) => void;
  setActiveThemeExtension: (id: string | null) => void;
  setActiveIconTheme: (id: string | null) => void;
  isInstalled: (id: string) => boolean;
  loadFromDisk: () => Promise<void>;
}


/**
 * Strips comments (// and /* *\/) and trailing commas from JSON/JSONC text.
 */
function stripJsonComments(str: string): string {
  return str
    .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1')
    .replace(/,\s*([\]}])/g, '$1');
}

/**
 * Converts VS Code theme JSON into a Monaco theme definition.
 */
function convertVsCodeThemeToMonaco(
  themeId: string,
  label: string,
  themeJson: any,
  defaultBase: string = 'vs-dark'
): MonacoThemeDefinition {
  let base: MonacoThemeDefinition['base'] = 'vs-dark';
  if (themeJson.type === 'light' || defaultBase === 'vs') {
    base = 'vs';
  } else if (themeJson.type === 'hc-black' || defaultBase === 'hc-black') {
    base = 'hc-black';
  }

  const rules: any[] = [];
  const tokenColors = Array.isArray(themeJson.tokenColors)
    ? themeJson.tokenColors
    : Array.isArray(themeJson.settings)
    ? themeJson.settings
    : [];

  for (const item of tokenColors) {
    if (!item || !item.settings) continue;
    const scopes = Array.isArray(item.scope)
      ? item.scope
      : typeof item.scope === 'string'
      ? item.scope.split(',').map((s: string) => s.trim())
      : [];

    for (const scope of scopes) {
      if (!scope) continue;
      const rule: any = { token: scope };
      if (item.settings.foreground) {
        rule.foreground = item.settings.foreground.replace(/^#/, '');
      }
      if (item.settings.fontStyle) {
        rule.fontStyle = item.settings.fontStyle;
      }
      rules.push(rule);
    }
  }

  return {
    id: themeId,
    name: label,
    base,
    rules,
    colors: themeJson.colors || {},
  };
}

/**
 * Apply Monaco theme and sync IDE CSS variable tokens to document root.
 */
export function applyMonacoTheme(themeId: string, themeDef?: MonacoThemeDefinition): void {
  if (themeDef) {
    registerMonacoTheme(themeId, themeDef);
  }
  const tDef = MONACO_THEMES[themeId];
  if (!tDef) return;

  const monaco = (window as any).monaco;
  if (monaco?.editor) {
    try {
      monaco.editor.defineTheme(themeId, {
        base: tDef.base,
        inherit: true,
        rules: tDef.rules,
        colors: tDef.colors,
      });
      monaco.editor.setTheme(themeId);
    } catch (e) {
      console.warn('[Theme] Could not apply theme to Monaco:', e);
    }
  }

  const bg = tDef.colors?.['editor.background'] || '#1e1e1e';
  const fg = tDef.colors?.['editor.foreground'] || '#cccccc';
  const lh = tDef.colors?.['editor.lineHighlightBackground'] || '#2c2c2c';

  const lighten = (hex: string, amount: number) => {
    try {
      const clean = hex.replace('#', '').slice(0, 6);
      if (clean.length !== 6) return hex;
      const n = parseInt(clean, 16);
      const r = Math.min(255, (n >> 16) + amount);
      const g = Math.min(255, ((n >> 8) & 0xff) + amount);
      const b = Math.min(255, (n & 0xff) + amount);
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    } catch {
      return hex;
    }
  };

  const root = document.documentElement;
  root.style.setProperty('--ide-bg', bg);
  root.style.setProperty('--ide-fg', fg);
  root.style.setProperty('--ide-sidebar', lighten(bg, 8));
  root.style.setProperty('--ide-topbar', lighten(bg, 12));
  root.style.setProperty('--ide-border', lighten(bg, 20));
  root.style.setProperty('--ide-active', lh);
}

function persistExtensions(state: ExtensionsState) {
  saveExtensionsDebounced({
    installedExtensions: state.installedExtensions,
    activeThemeExtension: state.activeThemeExtension,
    activeMonacoThemeId: state.activeMonacoThemeId,
    activeIconTheme: state.activeIconTheme,
    customExtensions: state.customExtensions,
    installedSnippets: state.installedSnippets,
    snippetsByExtension: state.snippetsByExtension,
    customThemes: state.customThemes,
  });
}

function resolveRelativePath(baseDir: string, relativePath: string): string {
  if (relativePath.startsWith('/')) {
    return normalizeAssetPath(relativePath);
  }
  const parts = (baseDir ? baseDir.split('/') : []).concat(relativePath.split('/'));
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join('/');
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return typeof btoa !== 'undefined' ? btoa(binary) : '';
}

function stringToBase64(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf-8').toString('base64');
  }
  return typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(str))) : '';
}

/**
 * Universal helper: extracts all webview resources, locates or synthesizes index.html,
 * and saves assets into the extension asset registry.
 */
export async function extractExtensionWebviewPackage(
  zip: JSZip,
  pkg: any,
  extId: string
): Promise<{ webviewAssets: Record<string, { data: Uint8Array | string; mime: string }>; webviewHtml?: string; webviewSynthesized?: boolean }> {
  const webviewAssets: Record<string, { data: Uint8Array | string; mime: string }> = {};

  const SUPPORTED_EXTS = [
    '.js', '.mjs', '.css', '.html', '.htm', '.svg', '.png',
    '.jpg', '.jpeg', '.webp', '.gif', '.ttf', '.woff', '.woff2',
    '.otf', '.eot', '.wasm', '.json'
  ];

  const validDirs = [
    'extension/webview/', 'extension/media/', 'extension/dist/', 'extension/out/',
    'extension/resources/', 'extension/assets/', 'extension/static/', 'extension/build/', 'extension/node_modules/',
    'webview/', 'media/', 'dist/', 'out/', 'resources/', 'assets/', 'static/', 'build/', 'node_modules/'
  ];

  const assetFiles = Object.keys(zip.files).filter((p) => {
    if (zip.files[p].dir) return false;
    const lower = p.toLowerCase();
    const hasExt = SUPPORTED_EXTS.some((ext) => lower.endsWith(ext));
    if (!hasExt) return false;
    return validDirs.some((d) => p.startsWith(d)) || lower.endsWith('.html') || lower.endsWith('.htm');
  });

  const baseNameMap: Record<string, Array<{ cleanPath: string; data: Uint8Array | string; mime: string }>> = {};

  for (const p of assetFiles) {
    const fileObj = zip.file(p);
    if (!fileObj) continue;
    const mime = getMimeType(p);
    try {
      const isText =
        mime.startsWith('text/') ||
        mime === 'application/javascript' ||
        mime === 'application/json' ||
        mime === 'image/svg+xml';
      const data = isText ? await fileObj.async('string') : await fileObj.async('uint8array');

      const withoutExtension = p.replace(/^extension\//, '');
      const cleanPath = normalizeAssetPath(withoutExtension);
      const baseName = cleanPath.split('/').pop() || cleanPath;

      webviewAssets[withoutExtension] = { data, mime };
      webviewAssets[cleanPath] = { data, mime };

      if (!baseNameMap[baseName]) {
        baseNameMap[baseName] = [];
      }
      baseNameMap[baseName].push({ cleanPath, data, mime });
    } catch (e) {
      console.warn('[extractExtensionWebviewPackage] Failed to extract asset:', p, e);
    }
  }

  // Register unique base names
  for (const [baseName, items] of Object.entries(baseNameMap)) {
    if (items.length === 1 && !webviewAssets[baseName]) {
      webviewAssets[baseName] = { data: items[0].data, mime: items[0].mime };
    }
  }

  // 1b. In-line CSS url(...) references to base64 Data URIs (self-contained codicons, fonts, images)
  for (const [assetPath, asset] of Object.entries(webviewAssets)) {
    if (assetPath.endsWith('.css') && typeof asset.data === 'string') {
      let cssContent = asset.data;
      const urlRegex = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
      const matches = Array.from(cssContent.matchAll(urlRegex));

      for (const match of matches) {
        const fullMatch = match[0];
        const rawUrl = match[2];
        if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('http:') || rawUrl.startsWith('https://')) {
          continue;
        }

        const cleanUrl = rawUrl.split(/[?#]/)[0].trim();
        if (!cleanUrl) continue;

        const cssDir = assetPath.includes('/') ? assetPath.slice(0, assetPath.lastIndexOf('/')) : '';
        const resolvedPath = resolveRelativePath(cssDir, cleanUrl);
        const baseName = cleanUrl.split('/').pop() || cleanUrl;

        let fileData: Uint8Array | string | null = null;
        let fileMime = getMimeType(cleanUrl);

        if (webviewAssets[resolvedPath]) {
          fileData = webviewAssets[resolvedPath].data;
          fileMime = webviewAssets[resolvedPath].mime || fileMime;
        } else if (webviewAssets[cleanUrl]) {
          fileData = webviewAssets[cleanUrl].data;
          fileMime = webviewAssets[cleanUrl].mime || fileMime;
        } else if (webviewAssets[normalizeAssetPath(cleanUrl)]) {
          fileData = webviewAssets[normalizeAssetPath(cleanUrl)].data;
          fileMime = webviewAssets[normalizeAssetPath(cleanUrl)].mime || fileMime;
        } else if (webviewAssets[baseName]) {
          fileData = webviewAssets[baseName].data;
          fileMime = webviewAssets[baseName].mime || fileMime;
        } else {
          const zipCandidates = [
            `extension/${resolvedPath}`,
            resolvedPath,
            `extension/${cleanUrl}`,
            cleanUrl,
            `extension/${baseName}`,
            baseName,
          ];
          let zipFile = null;
          for (const cand of zipCandidates) {
            zipFile = zip.file(cand);
            if (zipFile) break;
          }
          if (!zipFile) {
            const foundZipKey = Object.keys(zip.files).find(
              (k) => !zip.files[k].dir && (k.endsWith('/' + baseName) || k === baseName)
            );
            if (foundZipKey) {
              zipFile = zip.file(foundZipKey);
            }
          }

          if (zipFile) {
            const isText = fileMime.startsWith('text/') || fileMime === 'image/svg+xml';
            fileData = isText ? await zipFile.async('string') : await zipFile.async('uint8array');
          }
        }

        if (fileData) {
          const b64 = typeof fileData === 'string' ? stringToBase64(fileData) : uint8ArrayToBase64(fileData);
          const dataUri = `data:${fileMime};charset=utf-8;base64,${b64}`;
          cssContent = cssContent.split(fullMatch).join(`url("${dataUri}")`);
        }
      }

      asset.data = cssContent;
    }
  }

  // 2. Locate primary HTML file
  let webviewHtml: string | undefined = undefined;
  let webviewSynthesized = false;
  const primaryHtmlFile =
    zip.file('extension/webview/index.html') ||
    zip.file('webview/index.html') ||
    zip.file('extension/media/index.html') ||
    zip.file('media/index.html') ||
    zip.file('extension/dist/index.html') ||
    zip.file('dist/index.html') ||
    zip.file(Object.keys(zip.files).find((p) => !zip.files[p].dir && p.toLowerCase().endsWith('.html') && !p.includes('node_modules/') && !p.includes('/test/') && !p.includes('/demo/')) || '');

  if (primaryHtmlFile) {
    try {
      webviewHtml = await primaryHtmlFile.async('string');
      webviewAssets['index.html'] = { data: webviewHtml, mime: 'text/html' };
    } catch (err) {
      console.warn('[extractExtensionWebviewPackage] Failed to extract extension webview HTML:', err);
    }
  }

  // 3. If NO HTML file is found, but JavaScript bundle(s) exist: synthesize container shell
  // Only synthesize container shell HTML IF the extension explicitly indicates it contributes a webview!
  const allContributedViews = Object.values(pkg.contributes?.views || {}).flat() as any[];
  const hasDeclaredWebviewView = allContributedViews.some((v: any) => v && (v.type === 'webview' || v.type === 'custom-editor'));
  const hasCustomEditors = Boolean(pkg.contributes?.customEditors);
  const isWebviewExtension = hasDeclaredWebviewView || hasCustomEditors;

  if (!webviewHtml && isWebviewExtension) {
    const scriptPriorities = ['webview.js', 'sidebar.js', 'index.js', 'bundle.js', 'app.js'];
    const searchDirs = ['dist/', 'out/', 'media/', 'webview/', 'assets/', 'build/'];

    let primaryScriptPath: string | undefined = undefined;

    for (const sName of scriptPriorities) {
      for (const sDir of searchDirs) {
        const fullDir = `extension/${sDir}${sName}`;
        const rootDir = `${sDir}${sName}`;
        if (zip.file(fullDir) || zip.file(rootDir) || webviewAssets[`${sDir}${sName}`]) {
          primaryScriptPath = `./${sDir}${sName}`;
          break;
        }
      }
      if (primaryScriptPath) break;
    }

    if (!primaryScriptPath) {
      const webviewCandidate = Object.keys(webviewAssets).find(
        (k) =>
          k.endsWith('.js') &&
          !k.includes('node_modules/') &&
          !k.toLowerCase().includes('worker') &&
          !k.endsWith('extension.js') &&
          !k.endsWith('main.js') &&
          (k.toLowerCase().includes('webview') ||
            k.toLowerCase().includes('sidebar') ||
            k.toLowerCase().includes('panel') ||
            k.toLowerCase().includes('ui'))
      );
      if (webviewCandidate) {
        primaryScriptPath = `./${webviewCandidate.replace(/^\.?\//, '')}`;
      }
    }

    if (primaryScriptPath) {
      const cssCandidateDirs = ['dist/', 'media/', 'webview/', 'assets/', 'codicons/', 'node_modules/'];
      const foundCssPaths: string[] = [];

      for (const k of Object.keys(webviewAssets)) {
        if (k.endsWith('.css')) {
          const inCandidateDir =
            cssCandidateDirs.some((cd) => k.startsWith(cd) || k.startsWith(`./${cd}`)) ||
            k.includes('codicon');
          if (inCandidateDir && !foundCssPaths.includes(k)) {
            foundCssPaths.push(k);
          }
        }
      }

      foundCssPaths.sort((a, b) => {
        const aScore = a.includes('codicon') ? -2 : a.includes('webview') ? -1 : 0;
        const bScore = b.includes('codicon') ? -2 : b.includes('webview') ? -1 : 0;
        return aScore - bScore;
      });

      const stylesheetLinks = foundCssPaths
        .map((css) => `<link rel="stylesheet" href="./${css.replace(/^\.?\//, '')}">`)
        .join('\n    ');

      const inlineStyles = foundCssPaths
        .map((p) => `<style>/* ${p} */\n${webviewAssets[p]?.data || ''}\n</style>`)
        .join('\n');

      const synthesizedHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${inlineStyles}
  <style>
    :root {
      --antigravity-font-scale: 1;
    }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      overflow-y: auto;
      overflow-x: hidden;
      background: var(--vscode-sideBar-background, #231E22);
      color: var(--vscode-sideBar-foreground, #F3F0E7);
    }
    sidebar-app {
      display: flex;
      flex-direction: column;
      width: 100%;
      min-height: 100%;
    }
  </style>
  ${stylesheetLinks}
</head>
<body class="vscode-dark" style="margin:0;padding:12px;font-family:var(--vscode-font-family, system-ui);background:var(--vscode-sideBar-background);color:var(--vscode-sideBar-foreground);">
  <sidebar-app></sidebar-app>
  <div id="root"></div>
  <div id="app"></div>
  <main id="content"></main>
  <script>
    window.__TRANSLATIONS__ = {
      reportIssue: 'Feedback',
      giveStar: 'Star',
      restartService: 'Restart Service',
      promptCredits: 'Prompt',
      flowCredits: 'Flow',
      Rules: 'Rules',
      MCP: 'MCP',
      Allowlist: 'Allowlist',
      Restart: 'Restart',
      Reset: 'Reset',
      Reload: 'Reload',
      Docs: 'Docs',
      Feedback: 'Feedback',
      Star: 'Star'
    };
    window.__VERSION__ = ${JSON.stringify(pkg.version || '1.0.0')};
  </script>
  <script type="module" src="${primaryScriptPath}"></script>
</body>
</html>`;

      webviewAssets['index.html'] = { data: synthesizedHtml, mime: 'text/html' };
      webviewHtml = synthesizedHtml;
      webviewSynthesized = true;
    }
  }

  // 4. Store assets
  if (Object.keys(webviewAssets).length > 0) {
    await storeExtensionAssets(extId, webviewAssets);
  }

  return { webviewAssets, webviewHtml, webviewSynthesized };
}

export const useExtensionsStore = create<ExtensionsState>()(
  (set, get) => ({
    installedExtensions: [],
    activeThemeExtension: null,
    activeMonacoThemeId: null,
    activeIconTheme: null,
    customExtensions: [],
    installedSnippets: [],
    snippetsByExtension: {},
    customThemes: {},
    installProgress: {},
    installLogs: {},

    loadFromDisk: async () => {
      try {
        const data = await readExtensions();
        if (data) {
          const restoredThemes: Record<string, MonacoThemeDefinition> =
            data.customThemes && typeof data.customThemes === 'object' ? data.customThemes : {};
          for (const [themeId, definition] of Object.entries(restoredThemes)) {
            registerMonacoTheme(themeId, definition);
          }
          if (Array.isArray(data.installedSnippets)) {
            setDynamicSnippets(data.installedSnippets);
          }
          const restoredExtensions: Extension[] = Array.isArray(data.customExtensions) ? data.customExtensions : [];
          const loadedInstalled = reconcileInstalledExtensions(data.installedExtensions, restoredExtensions);
          const restoredActiveThemeExtension = data.activeThemeExtension || null;
          const restoredMonacoThemeId = deriveActiveMonacoThemeId(
            data.activeMonacoThemeId,
            restoredActiveThemeExtension,
            restoredExtensions
          );

          set({
            installedExtensions: loadedInstalled,
            activeThemeExtension: restoredActiveThemeExtension,
            activeMonacoThemeId: restoredMonacoThemeId,
            activeIconTheme: (data as any).activeIconTheme || null,
            customExtensions: restoredExtensions,
            installedSnippets: data.installedSnippets || [],
            snippetsByExtension: data.snippetsByExtension || {},
            customThemes: data.customThemes || {},
          });

          if ((data as any).activeIconTheme) {
            loadIconTheme((data as any).activeIconTheme);
          }

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('krypton:extensions-changed'));
            if ((data as any).activeIconTheme) {
              window.dispatchEvent(new CustomEvent('krypton:icon-theme-updated', { detail: { themeId: (data as any).activeIconTheme } }));
            }
          }
        }
      } catch (e) {
        console.error('[Extensions] Failed to load from disk:', e);
      }
    },

    installExtension: async (id: string) => {
      const log = (msg: string) => {
        const time = new Date().toLocaleTimeString();
        const line = `[${time}] ${msg}`;
        set((s) => ({
          installLogs: {
            ...s.installLogs,
            [id]: [...(s.installLogs[id] || []), line],
          },
        }));
      };

      set((s) => ({
        installProgress: {
          ...s.installProgress,
          [id]: { stage: 'Resolving dependencies & manifest', percent: 15, status: 'installing' },
        },
        installLogs: {
          ...s.installLogs,
          [id]: [`[${new Date().toLocaleTimeString()}] [INFO] Starting installation for plugin "${id}"`],
        },
      }));

      log('[STAGE 1/5 - 15%] Resolving dependencies & manifest...');
      await new Promise((r) => setTimeout(r, 220));

      set((s) => ({
        installProgress: {
          ...s.installProgress,
          [id]: { stage: 'Downloading package & assets', percent: 40, status: 'installing' },
        },
      }));
      log('[STAGE 2/5 - 40%] Downloading package & binary assets from repository...');
      await new Promise((r) => setTimeout(r, 280));

      set((s) => ({
        installProgress: {
          ...s.installProgress,
          [id]: { stage: 'Extracting and verifying bundle', percent: 65, status: 'installing' },
        },
      }));
      log('[STAGE 3/5 - 65%] Extracting and verifying bundle checksum...');
      await new Promise((r) => setTimeout(r, 280));

      set((s) => ({
        installProgress: {
          ...s.installProgress,
          [id]: { stage: 'Configuring execution sandbox / Termux hook', percent: 85, status: 'installing' },
        },
      }));
      log('[STAGE 4/5 - 85%] Configuring execution sandbox and CLI hooks...');
      await new Promise((r) => setTimeout(r, 220));

      set((s) => {
        const ext = get().customExtensions.find((e) => e.id === id);
        let activeThemeExtension = s.activeThemeExtension;
        let activeMonacoThemeId = s.activeMonacoThemeId;
        let activeIconTheme = s.activeIconTheme;
        if (ext?.category === 'theme') {
          if (ext.monacoThemeId) {
            applyMonacoTheme(ext.monacoThemeId);
            activeThemeExtension = ext.id;
            activeMonacoThemeId = ext.monacoThemeId;
          }
          if (ext.iconThemeId) {
            activeIconTheme = ext.iconThemeId;
          }
        }

        const updated = {
          ...s,
          installedExtensions: [...new Set([...s.installedExtensions, id])],
          activeThemeExtension,
          activeMonacoThemeId,
          activeIconTheme,
          installProgress: {
            ...s.installProgress,
            [id]: { stage: 'Activated', percent: 100, status: 'installed' as const },
          },
        };
        persistExtensions(updated);
        window.dispatchEvent(new CustomEvent('krypton:extensions-changed'));
        if (activeIconTheme) {
          window.dispatchEvent(new CustomEvent('krypton:icon-theme-updated', { detail: { themeId: activeIconTheme } }));
        }
        return updated;
      });
      log('[STAGE 5/5 - 100%] Activated: Plugin is ready for editor execution.');
    },

    installFromFile: async (file: File) => {
      try {
        const zip = await JSZip.loadAsync(file);
        const pkgFile = zip.file('extension/package.json') || zip.file('package.json');
        let pkg: any = {};
        if (pkgFile) {
          const raw = await pkgFile.async('string');
          try {
            pkg = JSON.parse(stripJsonComments(raw));
          } catch {}
        }

        const id = `custom-${(pkg.name || file.name.replace(/\.(vsix|zip)$/i, '')).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
        
        // Check for themes
        let themeId: string | undefined = undefined;
        const contributes = pkg.contributes || {};
        if (Array.isArray(contributes.themes) && contributes.themes.length > 0) {
          for (const t of contributes.themes) {
            const tPath = t.path?.replace(/^\.?\//, '') || '';
            const tFile = zip.file(`extension/${tPath}`) || zip.file(tPath);
            if (tFile) {
              const rawTheme = await tFile.async('string');
              try {
                const parsedTheme = JSON.parse(stripJsonComments(rawTheme));
                themeId = `${pkg.name || 'theme'}-${(t.label || 'custom').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
                const monacoDef = convertVsCodeThemeToMonaco(themeId, t.label || themeId, parsedTheme, t.uiTheme);
                registerMonacoTheme(themeId, monacoDef);
                set((s) => ({
                  customThemes: { ...s.customThemes, [themeId!]: monacoDef },
                  activeMonacoThemeId: themeId!,
                  activeThemeExtension: id,
                }));
                break;
              } catch (err) {
                console.warn('Failed to parse theme file:', err);
              }
            }
          }
        }

        // Check for iconThemes
        let iconThemeId: string | undefined = undefined;
        if (Array.isArray(contributes.iconThemes) && contributes.iconThemes.length > 0) {
          for (const it of contributes.iconThemes) {
            const itPath = it.path?.replace(/^\.?\//, '') || '';
            const itFile = zip.file(`extension/${itPath}`) || zip.file(itPath);
            if (itFile) {
              try {
                const rawIcon = await itFile.async('string');
                const parsedIcon = JSON.parse(stripJsonComments(rawIcon));
                iconThemeId = `${pkg.name || 'icon'}-${(it.id || it.label || 'theme').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
                await saveCustomIconTheme(iconThemeId, parsedIcon, zip);
                break;
              } catch (err) {
                console.warn('Failed to parse icon theme file:', err);
              }
            }
          }
        }

        // Check for snippets
        const extractedSnippets: CodeSnippet[] = [];
        if (Array.isArray(contributes.snippets) && contributes.snippets.length > 0) {
          for (const snip of contributes.snippets) {
            const sPath = snip.path?.replace(/^\.?\//, '') || '';
            const sFile = zip.file(`extension/${sPath}`) || zip.file(sPath);
            if (sFile) {
              const rawSnip = await sFile.async('string');
              try {
                const parsedSnip = JSON.parse(stripJsonComments(rawSnip));
                for (const [name, val] of Object.entries<any>(parsedSnip)) {
                  if (!val || typeof val !== 'object') continue;
                  const prefix = Array.isArray(val.prefix) ? val.prefix[0] : (typeof val.prefix === 'string' ? val.prefix : name);
                  const body = Array.isArray(val.body) ? val.body.join('\n') : (typeof val.body === 'string' ? val.body : '');
                  extractedSnippets.push({
                    prefix,
                    body,
                    description: val.description || name,
                    language: snip.language || 'plaintext',
                  });
                }
              } catch (err) {
                console.warn('Failed to parse snippet file:', err);
              }
            }
          }
        }

        if (extractedSnippets.length > 0) {
          addDynamicSnippets(extractedSnippets);
          set((s) => ({
            installedSnippets: [...s.installedSnippets, ...extractedSnippets],
            snippetsByExtension: { ...s.snippetsByExtension, [id]: extractedSnippets },
          }));
        }

        // Check for activitybar view containers (e.g. Claude Code or third-party tools)
        const viewsByContainer = contributes.views || {};
        const activityBarContributions: Array<{ id: string; title: string; icon?: string; views?: Array<{ id: string; name: string; type?: string }> }> = [];
        const activitybarContainers = contributes.viewsContainers?.activitybar;
        if (Array.isArray(activitybarContainers) && activitybarContainers.length > 0) {
          for (const vc of activitybarContainers) {
            let vcIconUrl: string | undefined = undefined;
            if (vc.icon) {
              const cleanIconPath = vc.icon.replace(/^\.?\//, '');
              const iconFile = zip.file(`extension/${cleanIconPath}`) || zip.file(cleanIconPath);
              if (iconFile) {
                try {
                  if (cleanIconPath.endsWith('.svg')) {
                    const rawSvg = await iconFile.async('string');
                    vcIconUrl = `data:image/svg+xml;utf8,${encodeURIComponent(rawSvg)}`;
                  } else {
                    const b64 = await iconFile.async('base64');
                    const mime = cleanIconPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
                    vcIconUrl = `data:${mime};base64,${b64}`;
                  }
                } catch (e) {
                  console.warn('Failed to extract view container icon:', e);
                }
              }
            }
            const containerViews = viewsByContainer[vc.id] || [];
            activityBarContributions.push({
              id: vc.id || 'view',
              title: vc.title || pkg.displayName || pkg.name,
              icon: vcIconUrl,
              views: Array.isArray(containerViews)
                ? containerViews.map((v: any) => ({
                    id: v.id || v.name || 'view',
                    name: v.name || v.id || 'View',
                    type: v.type,
                  }))
                : [],
            });
          }
        }

        // Dynamic: Extract Webview, Media, and Resource Assets using Universal Package Extractor
        const { webviewAssets, webviewHtml, webviewSynthesized } = await extractExtensionWebviewPackage(zip, pkg, id);
        // Dynamic: Check for extension contributed CSS styles
        const cssFiles = Object.keys(zip.files).filter((p) =>
          !zip.files[p].dir &&
          p.toLowerCase().endsWith('.css') &&
          !p.includes('node_modules/')
        );
        if (cssFiles.length > 0) {
          try {
            let combinedExtCss = '';
            for (const cf of cssFiles.slice(0, 10)) {
              const fileObj = zip.file(cf);
              if (fileObj) {
                const text = await fileObj.async('string');
                combinedExtCss += `\n/* Asset: ${cf} */\n${text}\n`;
              }
            }
            if (combinedExtCss.trim()) {
              registerExtensionCss(id, combinedExtCss);
            }
          } catch (e) {
            console.warn('Failed to extract extension CSS:', e);
          }
        }

        let pkgIconUrl: string | undefined = undefined;
        if (pkg.icon) {
          const cleanPkgIcon = pkg.icon.replace(/^\.?\//, '');
          const pkgIconFile = zip.file(`extension/${cleanPkgIcon}`) || zip.file(cleanPkgIcon);
          if (pkgIconFile) {
            try {
              const b64 = await pkgIconFile.async('base64');
              const mime = cleanPkgIcon.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
              pkgIconUrl = `data:${mime};base64,${b64}`;
            } catch (e) {
              console.warn('Failed to extract pkg.icon:', e);
            }
          }
        }

        const contributedCommands = Array.isArray(pkg.contributes?.commands)
          ? pkg.contributes.commands.map((c: any) => ({
              command: c.command,
              title: c.title || c.command,
              category: c.category,
            }))
          : undefined;

        const newExt: Extension = {
          id,
          name: pkg.displayName || pkg.name || file.name.replace(/\.(vsix|zip)$/i, ''),
          publisher: pkg.publisher || 'Community',
          description: pkg.description || `Imported package from ${file.name}`,
          icon: iconThemeId ? 'palette' : (themeId ? 'palette' : (extractedSnippets.length > 0 ? 'atom' : 'package')),
          iconUrl: pkgIconUrl || activityBarContributions[0]?.icon,
          category: (iconThemeId || themeId) ? 'theme' : (extractedSnippets.length > 0 ? 'snippet' : 'productivity'),
          installed: false,
          monacoThemeId: themeId,
          iconThemeId,
          activityBarContributions: activityBarContributions.length > 0 ? activityBarContributions : undefined,
          contributedCommands,
          webviewHtml,
          webviewSynthesized,
        };

        set((s) => ({
          customExtensions: [...s.customExtensions, newExt],
        }));

        await get().installExtension(id);
        if (themeId) {
          get().setActiveThemeExtension(id);
        }
        return newExt;
      } catch (e: any) {
        console.error('Failed to install from file:', e);
        useToastStore.getState().error(`Failed to extract and install plugin archive: ${e.message}`);
        return null;
      }
    },

    installFromOpenVsx: async (ext: MarketplaceExtension, versionUrl?: string): Promise<boolean> => {
      const extId = ext.id || `${ext.namespace}.${ext.name}`;
      const log = (msg: string) => {
        const time = new Date().toLocaleTimeString();
        const line = `[${time}] ${msg}`;
        set((s) => ({
          installLogs: {
            ...s.installLogs,
            [extId]: [...(s.installLogs[extId] || []), line],
          },
        }));
      };

      try {
        set((s) => ({
          installProgress: {
            ...s.installProgress,
            [extId]: { stage: 'Resolving Open VSX package', percent: 15, status: 'installing' },
          },
          installLogs: {
            ...s.installLogs,
            [extId]: [`[${new Date().toLocaleTimeString()}] [INFO] Starting Open VSX install for ${ext.displayName || ext.name}`],
          },
        }));
        log(`[STAGE 1/5 - 15%] Querying Open VSX Registry for ${extId}...`);

        let downloadUrl = ext.files?.download || '';

        // If versionUrl or specific download URL is provided
        if (versionUrl) {
          if (versionUrl.endsWith('.vsix')) {
            downloadUrl = versionUrl;
          } else if (versionUrl.includes('/api/')) {
            log(`[INFO] Resolving version metadata from ${versionUrl}...`);
            const vRes = await fetch(versionUrl);
            if (vRes.ok) {
              const vData = await vRes.json();
              if (vData.files?.download) {
                downloadUrl = vData.files.download;
              }
            }
          }
        }

        // If downloadUrl still missing, fetch details
        if (!downloadUrl) {
          log(`[INFO] Fetching package details to locate .vsix download URL...`);
          const details = await fetchExtensionDetails(ext.namespace, ext.name, ext.version);
          downloadUrl = details.downloadUrl;
        }

        if (!downloadUrl) {
          throw new Error('No .vsix download URL available for this extension.');
        }

        log(`[STAGE 2/5 - 25%] Streaming VSIX archive from: ${downloadUrl}`);
        set((s) => ({
          installProgress: {
            ...s.installProgress,
            [extId]: { stage: 'Downloading package (.vsix)', percent: 25, status: 'installing' },
          },
        }));

        const vsixBlob = await downloadVsixBlob(downloadUrl, (pct) => {
          const mapped = Math.round(25 + (pct * 0.45)); // 25% to 70%
          set((s) => ({
            installProgress: {
              ...s.installProgress,
              [extId]: { stage: `Downloading package (${pct}%)`, percent: mapped, status: 'installing' },
            },
          }));
        });

        log(`[STAGE 3/5 - 75%] Download complete (${(vsixBlob.size / 1024 / 1024).toFixed(2)} MB). Unpacking with JSZip...`);
        set((s) => ({
          installProgress: {
            ...s.installProgress,
            [extId]: { stage: 'Extracting and verifying bundle', percent: 75, status: 'installing' },
          },
        }));

        const zip = await JSZip.loadAsync(vsixBlob);
        const pkgFile = zip.file('extension/package.json') || zip.file('package.json');
        let pkg: any = {};
        if (pkgFile) {
          const raw = await pkgFile.async('string');
          try {
            pkg = JSON.parse(stripJsonComments(raw));
          } catch (e) {
            console.warn('Could not parse extension package.json:', e);
          }
        }

        log(`[STAGE 4/5 - 85%] Inspecting contributions and registering themes/snippets...`);
        set((s) => ({
          installProgress: {
            ...s.installProgress,
            [extId]: { stage: 'Registering themes & capabilities', percent: 85, status: 'installing' },
          },
        }));

        let registeredThemeId: string | undefined = undefined;
        const contributes = pkg.contributes || {};

        // 1. Process Themes
        if (Array.isArray(contributes.themes) && contributes.themes.length > 0) {
          for (const t of contributes.themes) {
            const tPath = t.path?.replace(/^\.?\//, '') || '';
            const tFile = zip.file(`extension/${tPath}`) || zip.file(tPath);
            if (tFile) {
              try {
                const rawTheme = await tFile.async('string');
                const parsedTheme = JSON.parse(stripJsonComments(rawTheme));
                const safeThemeId = `${ext.name}-${(t.label || 'theme').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
                const monacoThemeDef = convertVsCodeThemeToMonaco(safeThemeId, t.label || safeThemeId, parsedTheme, t.uiTheme);
                registerMonacoTheme(safeThemeId, monacoThemeDef);

                set((s) => ({
                  customThemes: { ...s.customThemes, [safeThemeId]: monacoThemeDef },
                }));

                log(`[INFO] Registered Monaco Theme: "${t.label || safeThemeId}" (ID: ${safeThemeId})`);
                if (!registeredThemeId) {
                  registeredThemeId = safeThemeId;
                }
              } catch (err: any) {
                log(`[WARN] Failed to load theme ${t.label}: ${err.message}`);
              }
            }
          }
        }

        // 1.5 Process Icon Themes
        let registeredIconThemeId: string | undefined = undefined;
        if (Array.isArray(contributes.iconThemes) && contributes.iconThemes.length > 0) {
          for (const it of contributes.iconThemes) {
            const itPath = it.path?.replace(/^\.?\//, '') || '';
            const itFile = zip.file(`extension/${itPath}`) || zip.file(itPath);
            if (itFile) {
              try {
                const rawIcon = await itFile.async('string');
                const parsedIcon = JSON.parse(stripJsonComments(rawIcon));
                const safeIconThemeId = `${ext.name}-${(it.id || it.label || 'icons').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
                await saveCustomIconTheme(safeIconThemeId, parsedIcon, zip);
                registeredIconThemeId = safeIconThemeId;
                log(`[INFO] Registered Icon Theme: "${it.label || safeIconThemeId}" (ID: ${safeIconThemeId})`);
                break;
              } catch (err: any) {
                log(`[WARN] Failed to load icon theme ${it.label}: ${err.message}`);
              }
            }
          }
        }

        // 2. Process Snippets
        const extractedSnippets: CodeSnippet[] = [];
        if (Array.isArray(contributes.snippets) && contributes.snippets.length > 0) {
          for (const snip of contributes.snippets) {
            const sPath = snip.path?.replace(/^\.?\//, '') || '';
            const sFile = zip.file(`extension/${sPath}`) || zip.file(sPath);
            if (sFile) {
              try {
                const rawSnip = await sFile.async('string');
                const parsedSnip = JSON.parse(stripJsonComments(rawSnip));
                for (const [name, val] of Object.entries<any>(parsedSnip)) {
                  if (!val || typeof val !== 'object') continue;
                  const prefix = Array.isArray(val.prefix) ? val.prefix[0] : (typeof val.prefix === 'string' ? val.prefix : name);
                  const body = Array.isArray(val.body) ? val.body.join('\n') : (typeof val.body === 'string' ? val.body : '');
                  extractedSnippets.push({
                    prefix,
                    body,
                    description: val.description || name,
                    language: snip.language || 'plaintext',
                  });
                }
              } catch (err: any) {
                log(`[WARN] Failed to load snippet ${snip.path}: ${err.message}`);
              }
            }
          }
        }

        if (extractedSnippets.length > 0) {
          addDynamicSnippets(extractedSnippets);
          set((s) => ({
            installedSnippets: [...s.installedSnippets, ...extractedSnippets],
            snippetsByExtension: { ...s.snippetsByExtension, [extId]: extractedSnippets },
          }));
          log(`[INFO] Registered ${extractedSnippets.length} dynamic snippets for editor completion.`);
        }

        // Determine category
        let category: Extension['category'] = 'productivity';
        if (registeredThemeId || registeredIconThemeId || ext.categories?.includes('Themes')) {
          category = 'theme';
        } else if (ext.categories?.includes('Snippets') || extractedSnippets.length > 0) {
          category = 'snippet';
        } else if (ext.categories?.includes('Formatters')) {
          category = 'formatter';
        } else if (ext.categories?.includes('Languages') || ext.categories?.includes('Programming Languages')) {
          category = 'language';
        }

        // Check for activitybar view containers (e.g. Claude Code or third-party tools)
        const viewsByContainer = contributes.views || {};
        const activityBarContributions: Array<{ id: string; title: string; icon?: string; views?: Array<{ id: string; name: string; type?: string }> }> = [];
        const activitybarContainers = contributes.viewsContainers?.activitybar;
        if (Array.isArray(activitybarContainers) && activitybarContainers.length > 0) {
          for (const vc of activitybarContainers) {
            let vcIconUrl: string | undefined = undefined;
            if (vc.icon) {
              const cleanIconPath = vc.icon.replace(/^\.?\//, '');
              const iconFile = zip.file(`extension/${cleanIconPath}`) || zip.file(cleanIconPath);
              if (iconFile) {
                try {
                  if (cleanIconPath.endsWith('.svg')) {
                    const rawSvg = await iconFile.async('string');
                    vcIconUrl = `data:image/svg+xml;utf8,${encodeURIComponent(rawSvg)}`;
                  } else {
                    const b64 = await iconFile.async('base64');
                    const mime = cleanIconPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
                    vcIconUrl = `data:${mime};base64,${b64}`;
                  }
                } catch (e) {
                  console.warn('Failed to extract view container icon:', e);
                }
              }
            }
            const containerViews = viewsByContainer[vc.id] || [];
            activityBarContributions.push({
              id: vc.id || 'view',
              title: vc.title || ext.displayName || ext.name,
              icon: vcIconUrl || ext.iconUrl,
              views: Array.isArray(containerViews)
                ? containerViews.map((v: any) => ({
                    id: v.id || v.name || 'view',
                    name: v.name || v.id || 'View',
                    type: v.type,
                  }))
                : [],
            });
          }
        }

        // Dynamic: Extract Webview, Media, and Resource Assets using Universal Package Extractor
        const { webviewAssets, webviewHtml, webviewSynthesized } = await extractExtensionWebviewPackage(zip, pkg, extId);
        if (webviewHtml) {
          log(`[INFO] Webview ready (${Object.keys(webviewAssets).length} assets registered)`);
        }
        // Dynamic: Check for extension contributed CSS styles
        const cssFiles = Object.keys(zip.files).filter((p) =>
          !zip.files[p].dir &&
          p.toLowerCase().endsWith('.css') &&
          !p.includes('node_modules/')
        );
        if (cssFiles.length > 0) {
          try {
            let combinedExtCss = '';
            for (const cf of cssFiles.slice(0, 10)) {
              const fileObj = zip.file(cf);
              if (fileObj) {
                const text = await fileObj.async('string');
                combinedExtCss += `\n/* Asset: ${cf} */\n${text}\n`;
              }
            }
            if (combinedExtCss.trim()) {
              registerExtensionCss(extId, combinedExtCss);
              log(`[INFO] Registered extension contributed CSS (${combinedExtCss.length} bytes)`);
            }
          } catch (e) {
            console.warn('Failed to extract extension CSS:', e);
          }
        }

        const contributedCommands = Array.isArray(pkg.contributes?.commands)
          ? pkg.contributes.commands.map((c: any) => ({
              command: c.command,
              title: c.title || c.command,
              category: c.category,
            }))
          : undefined;

        const newExtension: Extension = {
          id: extId,
          name: ext.displayName || ext.name,
          publisher: ext.publisher || ext.namespace,
          description: ext.description || pkg.description || 'Open VSX Extension',
          icon: (registeredThemeId || registeredIconThemeId) ? 'palette' : (extractedSnippets.length > 0 ? 'atom' : 'package'),
          iconUrl: ext.iconUrl || ext.files?.icon,
          category,
          installed: true,
          version: ext.version,
          namespace: ext.namespace,
          downloadUrl,
          license: ext.license,
          categories: ext.categories,
          downloads: typeof ext.downloadCount === 'number' && ext.downloadCount > 0
            ? `${(ext.downloadCount >= 1000000 ? (ext.downloadCount / 1000000).toFixed(1) + 'M' : (ext.downloadCount >= 1000 ? (ext.downloadCount / 1000).toFixed(1) + 'k' : ext.downloadCount))}`
            : undefined,
          rating: ext.averageRating ? Math.round(ext.averageRating * 10) / 10 : undefined,
          monacoThemeId: registeredThemeId,
          iconThemeId: registeredIconThemeId,
          activityBarContributions: activityBarContributions.length > 0 ? activityBarContributions : undefined,
          contributedCommands,
          webviewHtml,
          webviewSynthesized,
        };

        set((s) => {
          const filteredCustom = s.customExtensions.filter((e) => e.id !== extId);
          const updatedState = {
            ...s,
            customExtensions: [...filteredCustom, newExtension],
            installedExtensions: [...new Set([...s.installedExtensions, extId])],
            activeThemeExtension: registeredThemeId ? extId : s.activeThemeExtension,
            activeMonacoThemeId: registeredThemeId || s.activeMonacoThemeId,
            activeIconTheme: registeredIconThemeId || s.activeIconTheme,
            installProgress: {
              ...s.installProgress,
              [extId]: { stage: 'Activated', percent: 100, status: 'installed' as const },
            },
          };
          persistExtensions(updatedState);
          return updatedState;
        });

        if (registeredThemeId) {
          applyMonacoTheme(registeredThemeId);
        }
        window.dispatchEvent(new CustomEvent('krypton:extensions-changed'));
        if (registeredIconThemeId) {
          window.dispatchEvent(new CustomEvent('krypton:icon-theme-updated', { detail: { themeId: registeredIconThemeId } }));
        }

        log(`[STAGE 5/5 - 100%] Successfully installed and activated ${ext.displayName || ext.name}!`);
        useToastStore.getState().success(`Installed ${ext.displayName || ext.name}`);
        return true;
      } catch (e: any) {
        console.error(`[Extensions] Failed to install ${extId}:`, e);
        log(`[ERROR] Installation failed: ${e.message}`);
        set((s) => ({
          installProgress: {
            ...s.installProgress,
            [extId]: { stage: `Failed: ${e.message}`, percent: 100, status: 'failed' },
          },
        }));
        useToastStore.getState().error(`Failed to install ${ext.displayName || ext.name}: ${e.message}`);
        return false;
      }
    },

    uninstallExtension: (id) => {
      unregisterExtensionCss(id);
      let wasActiveTheme = false;
      set((state) => {
        const ext = state.customExtensions.find((e) => e.id === id);
        wasActiveTheme =
          state.activeThemeExtension === id ||
          Boolean(ext?.monacoThemeId && state.activeMonacoThemeId === ext.monacoThemeId);
        const ownsActiveIconTheme = Boolean(
          state.activeIconTheme &&
          (state.activeIconTheme === id || state.activeIconTheme === ext?.iconThemeId)
        );

        // Remove dynamic snippets belonging to this extension
        const remainingSnippetsByExt = { ...state.snippetsByExtension };
        delete remainingSnippetsByExt[id];
        const allRemainingSnippets = Object.values(remainingSnippetsByExt).flat();
        setDynamicSnippets(allRemainingSnippets);

        const updated = {
          ...state,
          installedExtensions: state.installedExtensions.filter((e) => e !== id),
          activeThemeExtension: wasActiveTheme ? null : state.activeThemeExtension,
          activeMonacoThemeId: wasActiveTheme ? null : state.activeMonacoThemeId,
          activeIconTheme: ownsActiveIconTheme ? null : state.activeIconTheme,
          installedSnippets: allRemainingSnippets,
          snippetsByExtension: remainingSnippetsByExt,
        };

        persistExtensions(updated);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('krypton:extensions-changed'));
          if (ownsActiveIconTheme) {
            window.dispatchEvent(new CustomEvent('krypton:icon-theme-updated', { detail: { themeId: null } }));
          }
        }
        return {
          installedExtensions: updated.installedExtensions,
          activeThemeExtension: updated.activeThemeExtension,
          activeMonacoThemeId: updated.activeMonacoThemeId,
          activeIconTheme: updated.activeIconTheme,
          installedSnippets: updated.installedSnippets,
          snippetsByExtension: updated.snippetsByExtension,
        };
      });
      if (wasActiveTheme && typeof document !== 'undefined' && typeof window !== 'undefined') {
        applyMonacoTheme('krypton-warm');
      }
      useToastStore.getState().info(`Uninstalled extension`);
    },

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

    setActiveIconTheme: (id) => {
      set({ activeIconTheme: id });
      persistExtensions(get());
      if (id) loadIconTheme(id);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('krypton:icon-theme-updated', { detail: { themeId: id } }));
      }
    },

    isInstalled: (id) => {
      return get().installedExtensions.includes(id);
    },
  })
);
