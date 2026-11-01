/**
 * Kryptonide — Monaco Theme Definitions for Installed Themes
 * Provides authentic syntax highlighting rules and editor colors for curated VS Code themes.
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

  'one-dark-pro': {
    id: 'one-dark-pro',
    name: 'One Dark Pro',
    base: 'vs-dark',
    colors: {
      'editor.background': '#282c34',
      'editor.foreground': '#abb2bf',
      'editor.lineHighlightBackground': '#2c313a',
      'editorCursor.foreground': '#528bff',
      'editor.selectionBackground': '#3e4451',
      'editor.inactiveSelectionBackground': '#323842',
      'editorLineNumber.foreground': '#4b5263',
      'editorLineNumber.activeForeground': '#abb2bf',
      'editorGutter.background': '#282c34',
    },
    rules: [
      { token: '', foreground: 'abb2bf', background: '282c34' },
      { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c678dd', fontStyle: 'bold' },
      { token: 'string', foreground: '98c379' },
      { token: 'number', foreground: 'd19a66' },
      { token: 'type', foreground: 'e5c07b' },
      { token: 'function', foreground: '61afef' },
      { token: 'variable', foreground: 'e06c75' },
    ],
  },

  'dracula': {
    id: 'dracula',
    name: 'Dracula Official',
    base: 'vs-dark',
    colors: {
      'editor.background': '#282a36',
      'editor.foreground': '#f8f8f2',
      'editor.lineHighlightBackground': '#44475a',
      'editorCursor.foreground': '#f8f8f2',
      'editor.selectionBackground': '#44475a',
      'editor.inactiveSelectionBackground': '#383a48',
      'editorLineNumber.foreground': '#6272a4',
      'editorLineNumber.activeForeground': '#f8f8f2',
      'editorGutter.background': '#282a36',
    },
    rules: [
      { token: '', foreground: 'f8f8f2', background: '282a36' },
      { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff79c6', fontStyle: 'bold' },
      { token: 'string', foreground: 'f1fa8c' },
      { token: 'number', foreground: 'bd93f9' },
      { token: 'type', foreground: '8be9fd', fontStyle: 'italic' },
      { token: 'function', foreground: '50fa7b' },
      { token: 'variable', foreground: 'f8f8f2' },
    ],
  },

  'github-dark': {
    id: 'github-dark',
    name: 'GitHub Dark',
    base: 'vs-dark',
    colors: {
      'editor.background': '#0d1117',
      'editor.foreground': '#c9d1d9',
      'editor.lineHighlightBackground': '#161b22',
      'editorCursor.foreground': '#58a6ff',
      'editor.selectionBackground': '#264f78',
      'editor.inactiveSelectionBackground': '#1f364d',
      'editorLineNumber.foreground': '#484f58',
      'editorLineNumber.activeForeground': '#c9d1d9',
      'editorGutter.background': '#0d1117',
    },
    rules: [
      { token: '', foreground: 'c9d1d9', background: '0d1117' },
      { token: 'comment', foreground: '8b949e', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff7b72', fontStyle: 'bold' },
      { token: 'string', foreground: 'a5d6ff' },
      { token: 'number', foreground: '79c0ff' },
      { token: 'type', foreground: 'ffa657' },
      { token: 'function', foreground: 'd2a8ff' },
      { token: 'variable', foreground: 'c9d1d9' },
    ],
  },

  'monokai': {
    id: 'monokai',
    name: 'Monokai Pro',
    base: 'vs-dark',
    colors: {
      'editor.background': '#272822',
      'editor.foreground': '#f8f8f2',
      'editor.lineHighlightBackground': '#3e3d32',
      'editorCursor.foreground': '#f8f8f0',
      'editor.selectionBackground': '#49483e',
      'editor.inactiveSelectionBackground': '#3a3a32',
      'editorLineNumber.foreground': '#90908a',
      'editorLineNumber.activeForeground': '#f8f8f2',
      'editorGutter.background': '#272822',
    },
    rules: [
      { token: '', foreground: 'f8f8f2', background: '272822' },
      { token: 'comment', foreground: '75715e', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'f92672', fontStyle: 'bold' },
      { token: 'string', foreground: 'e6db74' },
      { token: 'number', foreground: 'ae81ff' },
      { token: 'type', foreground: '66d9ef', fontStyle: 'italic' },
      { token: 'function', foreground: 'a6e22e' },
      { token: 'variable', foreground: 'fd971f' },
    ],
  },

  'nord': {
    id: 'nord',
    name: 'Nord',
    base: 'vs-dark',
    colors: {
      'editor.background': '#2e3440',
      'editor.foreground': '#d8dee9',
      'editor.lineHighlightBackground': '#3b4252',
      'editorCursor.foreground': '#d8dee9',
      'editor.selectionBackground': '#434c5e',
      'editor.inactiveSelectionBackground': '#3b4252',
      'editorLineNumber.foreground': '#4c566a',
      'editorLineNumber.activeForeground': '#d8dee9',
      'editorGutter.background': '#2e3440',
    },
    rules: [
      { token: '', foreground: 'd8dee9', background: '2e3440' },
      { token: 'comment', foreground: '616e88', fontStyle: 'italic' },
      { token: 'keyword', foreground: '81a1c1', fontStyle: 'bold' },
      { token: 'string', foreground: 'a3be8c' },
      { token: 'number', foreground: 'b48ead' },
      { token: 'type', foreground: '8fbcbb' },
      { token: 'function', foreground: '88c0d0' },
      { token: 'variable', foreground: 'd8dee9' },
    ],
  },

  'catppuccin': {
    id: 'catppuccin',
    name: 'Catppuccin Mocha',
    base: 'vs-dark',
    colors: {
      'editor.background': '#1e1e2e',
      'editor.foreground': '#cdd6f4',
      'editor.lineHighlightBackground': '#313244',
      'editorCursor.foreground': '#f5e0dc',
      'editor.selectionBackground': '#45475a',
      'editor.inactiveSelectionBackground': '#36384a',
      'editorLineNumber.foreground': '#6c7086',
      'editorLineNumber.activeForeground': '#cdd6f4',
      'editorGutter.background': '#1e1e2e',
    },
    rules: [
      { token: '', foreground: 'cdd6f4', background: '1e1e2e' },
      { token: 'comment', foreground: '6c7086', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'cba6f7', fontStyle: 'bold' },
      { token: 'string', foreground: 'a6e3a1' },
      { token: 'number', foreground: 'fab387' },
      { token: 'type', foreground: 'f9e2af' },
      { token: 'function', foreground: '89b4fa' },
      { token: 'variable', foreground: 'cdd6f4' },
    ],
  },
};

/**
 * Register all curated themes with Monaco API
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

/**
 * Resolve Monaco theme ID from active extension or workbench theme
 */
export function resolveActiveMonacoTheme(
  storeTheme: string,
  activeThemeExtension: string | null
): string {
  if (storeTheme === 'light') return 'vs';
  if (storeTheme === 'hc-black') return 'hc-black';

  if (activeThemeExtension) {
    const extId = activeThemeExtension.toLowerCase();
    if (extId.includes('one-dark')) return 'one-dark-pro';
    if (extId.includes('dracula')) return 'dracula';
    if (extId.includes('github')) return 'github-dark';
    if (extId.includes('monokai')) return 'monokai';
    if (extId.includes('nord')) return 'nord';
    if (extId.includes('catppuccin')) return 'catppuccin';
  }

  return 'krypton-warm';
}
