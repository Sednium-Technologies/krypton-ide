/**
 * Kryptonide — Monaco theme registry for installed themes.
 * The built-in Krypton palette is the only entry shipped with the app;
 * installed VSIX packages register their themes dynamically.
 */

export interface MonacoThemeDefinition {
  id: string;
  name: string;
  base: 'vs-dark' | 'vs' | 'hc-black';
  colors: Record<string, string>;
  rules: Array<{ token: string; foreground?: string; background?: string; fontStyle?: string }>;
}

export const MONACO_THEMES: Record<string, MonacoThemeDefinition> = {
  'krypton-warm': {
    id: 'krypton-warm',
    name: 'Krypton Warm',
    base: 'vs-dark',
    colors: {
      'editor.background': '#2a2529',
      'editor.foreground': '#f3f0e7',
      'editor.lineHighlightBackground': '#342f33',
      'editorCursor.foreground': '#f3f0e7',
      'editor.selectionBackground': '#453d43',
      'editor.inactiveSelectionBackground': '#363035',
      'editorLineNumber.foreground': '#6b6369',
      'editorLineNumber.activeForeground': '#f3f0e7',
      'editorGutter.background': '#2a2529',
      'editorGhostText.foreground': '#f3f0e755',
    },
    rules: [
      { token: '', foreground: 'f3f0e7', background: '2a2529' },
      { token: 'comment', foreground: '8c828a', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'f3f0e7', fontStyle: 'bold' },
      { token: 'string', foreground: 'a3be8c' },
      { token: 'number', foreground: 'd08770' },
      { token: 'type', foreground: 'b8aedc' },
      { token: 'function', foreground: '88c0d0' },
      { token: 'variable', foreground: 'f3f0e7' },
    ],
  },
};

/**
 * Register every currently known theme with the Monaco API.
 */
export function registerAllMonacoThemes(monaco: any) {
  if (!monaco) return;
  for (const [themeId, def] of Object.entries(MONACO_THEMES)) {
    try {
      monaco.editor.defineTheme(themeId, {
        base: def.base,
        inherit: true,
        rules: def.rules,
        colors: def.colors,
      });
    } catch {}
  }
}

/** Register a theme contributed by an installed extension package. */
export function registerMonacoTheme(themeId: string, definition: MonacoThemeDefinition): void {
  MONACO_THEMES[themeId] = definition;
}

/**
 * Resolve Monaco theme ID from the store theme and the active installed theme id.
 */
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
