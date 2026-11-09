/**
 * VS Code-like Custom CSS Injector for Kryptonide
 * Allows skinning and styling every aspect of the app via:
 * 1. User custom CSS (from localStorage / live settings editor)
 * 2. Extension-contributed styles (<style id="krypton-extension-styles">)
 * 3. Workspace custom CSS (.krypton/custom.css in active project)
 */

const STORAGE_KEY = 'krypton:custom-css';
const USER_STYLE_ELEMENT_ID = 'kryptonide-custom-css';
const EXTENSION_STYLE_ELEMENT_ID = 'krypton-extension-styles';
const WORKSPACE_STYLE_ELEMENT_ID = 'krypton-workspace-styles';

export const DEFAULT_CORE_CSS = `/* ========================================================
   Kryptonide v4 - Core Custom Stylesheet Rules
   Target UI Shell and Monaco Editor DOM Frame
   ======================================================== */

:root {
  /* Core Surface Tokens (Ivory Mode) */
  --krypton-bg: #f3f0e7;
  --krypton-surface: #e8e4d9;
  --krypton-card: #ffffff;
  --krypton-border: rgba(42, 37, 41, 0.12);
  --krypton-text: #2a2529;
  --krypton-text-muted: rgba(42, 37, 41, 0.65);
  --krypton-accent: #6366f1;
}

/* UI Shell Styling */
body, #root {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* Monaco Editor DOM Frame Styling */
.monaco-editor {
  border-radius: 8px;
  overflow: hidden;
}

.monaco-editor .margin {
  background-color: transparent !important;
}

.monaco-editor .current-line {
  border-radius: 4px;
}

/* Monaco Ghost Text inline suggestion styling */
.monaco-editor .ghost-text {
  opacity: 0.6;
  cursor: pointer;
}

/* Scrollbar Customization */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-thumb {
  background: rgba(42, 37, 41, 0.2);
  border-radius: 9999px;
}
`;

// In-memory registry for extension-contributed CSS
const extensionStylesRegistry = new Map<string, string>();

// ─── 1. User Custom CSS ────────────────────────────────────────────────────────

export function getCustomCss(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) return saved;
    return DEFAULT_CORE_CSS;
  } catch {
    return DEFAULT_CORE_CSS;
  }
}

export function applyCustomCss(cssText: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, cssText);
  } catch (e) {
    console.warn('Failed to persist custom CSS to localStorage:', e);
  }

  if (typeof document === 'undefined') return;

  let styleTag = document.getElementById(USER_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = USER_STYLE_ELEMENT_ID;
    document.head.appendChild(styleTag);
  }

  styleTag.textContent = cssText;
}

export function initCustomCss(): void {
  const saved = getCustomCss();
  if (saved) {
    applyCustomCss(saved);
  }
}

export function clearCustomCss(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  if (typeof document === 'undefined') return;
  const styleTag = document.getElementById(USER_STYLE_ELEMENT_ID);
  if (styleTag) {
    styleTag.remove();
  }
}

// ─── 2. Extension Contributed CSS ──────────────────────────────────────────────

export function registerExtensionCss(extensionId: string, cssText: string): void {
  if (!extensionId || !cssText) return;
  extensionStylesRegistry.set(extensionId, cssText);
  syncExtensionStyles();
}

export function unregisterExtensionCss(extensionId: string): void {
  if (!extensionId) return;
  if (extensionStylesRegistry.delete(extensionId)) {
    syncExtensionStyles();
  }
}

function syncExtensionStyles(): void {
  if (typeof document === 'undefined') return;

  let styleTag = document.getElementById(EXTENSION_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (extensionStylesRegistry.size === 0) {
    if (styleTag) styleTag.remove();
    return;
  }

  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = EXTENSION_STYLE_ELEMENT_ID;
    document.head.appendChild(styleTag);
  }

  const combinedCss = Array.from(extensionStylesRegistry.entries())
    .map(([id, css]) => `/* Extension: ${id} */\n${css}`)
    .join('\n\n');

  styleTag.textContent = combinedCss;
}

// ─── 3. Workspace Custom CSS (.krypton/custom.css) ─────────────────────────────

export function loadWorkspaceCustomCss(files: Record<string, any>): void {
  if (typeof document === 'undefined') return;

  let cssContent = '';

  // Look for .krypton/custom.css in file records
  for (const [id, node] of Object.entries(files)) {
    if (!node || node.type !== 'file') continue;
    const nameMatch = node.name === 'custom.css';
    const pathMatch = id.endsWith('.krypton/custom.css') || id.includes('.krypton/custom.css');
    if (nameMatch || pathMatch) {
      if (typeof node.content === 'string' && node.content.trim().length > 0) {
        cssContent = node.content;
        break;
      }
    }
  }

  let styleTag = document.getElementById(WORKSPACE_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!cssContent) {
    if (styleTag) styleTag.remove();
    return;
  }

  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = WORKSPACE_STYLE_ELEMENT_ID;
    document.head.appendChild(styleTag);
  }

  styleTag.textContent = `/* Workspace Custom CSS (.krypton/custom.css) */\n${cssContent}`;
}
