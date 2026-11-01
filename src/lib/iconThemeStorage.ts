import { get, set } from 'idb-keyval';
import type JSZip from 'jszip';
import {
  resolveFileIconSvg,
  resolveFolderIconSvg,
  registerCustomSvg,
  getCustomSvg,
  registerIconThemeDefinition,
  type IconThemeDefinition,
} from './dynamicIconEngine';

// Re-export dynamicIconEngine primitives
export {
  resolveFileIconSvg,
  resolveFolderIconSvg,
  registerCustomSvg,
  getCustomSvg,
  registerIconThemeDefinition,
  type IconThemeDefinition,
};

// In-memory cache for instant lookups
const memoryIconThemeCache = new Map<string, IconThemeDefinition>();

/**
 * Save custom icon theme from extension package into IndexedDB and dynamicIconEngine
 */
export async function saveCustomIconTheme(
  themeId: string,
  definition: any,
  zip?: JSZip
): Promise<void> {
  try {
    const themeDef: IconThemeDefinition = {
      id: themeId,
      label: definition.label || themeId,
      iconDefinitions: definition.iconDefinitions || {},
      fileExtensions: definition.fileExtensions || {},
      fileNames: definition.fileNames || {},
      languageIds: definition.languageIds || {},
      folderNames: definition.folderNames || {},
      folderNamesExpanded: definition.folderNamesExpanded || {},
      file: definition.file,
      folder: definition.folder,
      folderExpanded: definition.folderExpanded,
      rootFolder: definition.rootFolder,
      rootFolderExpanded: definition.rootFolderExpanded,
      light: definition.light,
    };

    memoryIconThemeCache.set(themeId, themeDef);
    registerIconThemeDefinition(themeId, themeDef);
    await set(`krypton:icon-theme:${themeId}`, themeDef);

    // If zip is provided, extract referenced SVG icons
    if (zip && definition.iconDefinitions) {
      const svgsMap: Record<string, string> = {};
      for (const [key, iconItem] of Object.entries<any>(definition.iconDefinitions)) {
        if (iconItem?.iconPath) {
          const rawPath = iconItem.iconPath.replace(/^\.?\//, '');
          // Resolve relative paths like ../icons/html.svg or ./icons/html.svg
          const parts = rawPath.split(/[/\\]/);
          const normalizedParts: string[] = [];
          for (const p of parts) {
            if (p === '..') normalizedParts.pop();
            else if (p !== '.') normalizedParts.push(p);
          }
          const normPath = normalizedParts.join('/');
          const baseName = normPath.split('/').pop() || '';

          const fileInZip =
            zip.file(`extension/${normPath}`) ||
            zip.file(normPath) ||
            zip.file(`extension/icons/${baseName}`) ||
            zip.file(`icons/${baseName}`) ||
            zip.file(baseName) ||
            Object.keys(zip.files)
              .filter((f) => f.endsWith(`/${baseName}`) || f === baseName)
              .map((f) => zip.file(f))[0];

          if (fileInZip) {
            const svgContent = await fileInZip.async('string');
            registerCustomSvg(themeId, key, svgContent);
            svgsMap[key] = svgContent;
          }
        }
      }
      if (Object.keys(svgsMap).length > 0) {
        await set(`krypton:icon-svgs:${themeId}`, svgsMap);
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('krypton:icon-theme-updated', { detail: { themeId } }));
    }
  } catch (err) {
    console.warn('[iconThemeStorage] Failed to save icon theme:', err);
  }
}

/**
 * Synchronously retrieves custom SVG icon content from memory cache
 */
export function getCustomSvgIconSync(themeId: string, iconKey: string): string | null {
  return getCustomSvg(themeId, iconKey);
}

/**
 * Synchronously retrieves icon definition for a file from loaded theme
 */
export function getFileIconKeyFromTheme(themeDef: IconThemeDefinition, fileName: string): string | null {
  const lower = fileName.toLowerCase();
  const ext = lower.split('.').pop() || '';

  if (themeDef.fileNames?.[lower]) return themeDef.fileNames[lower];
  if (themeDef.fileExtensions?.[ext]) return themeDef.fileExtensions[ext];

  return themeDef.file || null;
}

/**
 * Load icon theme definition from memory or IDB
 */
export async function loadIconTheme(themeId: string): Promise<IconThemeDefinition | null> {
  if (memoryIconThemeCache.has(themeId)) {
    return memoryIconThemeCache.get(themeId)!;
  }
  try {
    const saved = await get<IconThemeDefinition>(`krypton:icon-theme:${themeId}`);
    if (saved) {
      memoryIconThemeCache.set(themeId, saved);
      registerIconThemeDefinition(themeId, saved);
      const savedSvgs = await get<Record<string, string>>(`krypton:icon-svgs:${themeId}`);
      if (savedSvgs) {
        for (const [k, svg] of Object.entries(savedSvgs)) {
          registerCustomSvg(themeId, k, svg);
        }
      }
      return saved;
    }
  } catch (err) {
    console.warn('[iconThemeStorage] Failed to load icon theme:', err);
  }
  return null;
}

/**
 * Palette colors for theme-coordinated file and folder icons (backward compatibility)
 */
export interface ThemeIconColors {
  folder: string;
  folderOpen: string;
  ts: string;
  js: string;
  py: string;
  html: string;
  css: string;
  json: string;
  md: string;
  rs: string;
  go: string;
  sh: string;
  badgeBg: string;
  badgeBorder: string;
}

export function getThemeIconColors(themeId: string | null, isLight: boolean): ThemeIconColors {
  switch (themeId) {
    case 'dracula':
    case 'theme-dracula':
      return {
        folder: '#bd93f9',
        folderOpen: '#ff79c6',
        ts: '#bd93f9',
        js: '#f1fa8c',
        py: '#50fa7b',
        html: '#ff79c6',
        css: '#8be9fd',
        json: '#ffb86c',
        md: '#bd93f9',
        rs: '#ffb86c',
        go: '#8be9fd',
        sh: '#50fa7b',
        badgeBg: isLight ? '#f0ebf8' : '#282a36',
        badgeBorder: isLight ? 'rgba(189,147,249,0.3)' : 'rgba(189,147,249,0.25)',
      };
    case 'monokai':
    case 'theme-monokai-pro':
      return {
        folder: '#ffd866',
        folderOpen: '#ff6188',
        ts: '#78dce8',
        js: '#ffd866',
        py: '#a9dc76',
        html: '#ff6188',
        css: '#fc9867',
        json: '#ab9df2',
        md: '#78dce8',
        rs: '#fc9867',
        go: '#78dce8',
        sh: '#a9dc76',
        badgeBg: isLight ? '#f9f6ee' : '#2d2a2e',
        badgeBorder: isLight ? 'rgba(255,216,102,0.35)' : 'rgba(255,216,102,0.25)',
      };
    case 'nord':
    case 'theme-nord':
      return {
        folder: '#88C0D0',
        folderOpen: '#81A1C1',
        ts: '#88C0D0',
        js: '#EBCB8B',
        py: '#A3BE8C',
        html: '#BF616A',
        css: '#5E81AC',
        json: '#D08770',
        md: '#8FBCBB',
        rs: '#D08770',
        go: '#88C0D0',
        sh: '#A3BE8C',
        badgeBg: isLight ? '#eef4f7' : '#2E3440',
        badgeBorder: isLight ? 'rgba(136,192,208,0.3)' : 'rgba(136,192,208,0.25)',
      };
    case 'catppuccin':
    case 'theme-catppuccin':
      return {
        folder: '#fab387',
        folderOpen: '#f38ba8',
        ts: '#89b4fa',
        js: '#f9e2af',
        py: '#a6e3a1',
        html: '#eba0ac',
        css: '#89dceb',
        json: '#cba6f7',
        md: '#b4befe',
        rs: '#fab387',
        go: '#89dceb',
        sh: '#a6e3a1',
        badgeBg: isLight ? '#f7f2fa' : '#1e1e2e',
        badgeBorder: isLight ? 'rgba(203,166,247,0.3)' : 'rgba(203,166,247,0.25)',
      };
    case 'github':
    case 'theme-github-dark':
      return {
        folder: isLight ? '#0969da' : '#58a6ff',
        folderOpen: isLight ? '#1a7f37' : '#3fb950',
        ts: isLight ? '#0969da' : '#58a6ff',
        js: isLight ? '#9a6700' : '#d29922',
        py: isLight ? '#1a7f37' : '#3fb950',
        html: isLight ? '#cf222e' : '#f85149',
        css: isLight ? '#8250df' : '#bc8cff',
        json: isLight ? '#9a6700' : '#d29922',
        md: isLight ? '#0969da' : '#58a6ff',
        rs: isLight ? '#bc4c00' : '#ffa657',
        go: isLight ? '#0969da' : '#58a6ff',
        sh: isLight ? '#1a7f37' : '#3fb950',
        badgeBg: isLight ? '#f6f8fa' : '#161b22',
        badgeBorder: isLight ? 'rgba(9,105,218,0.2)' : 'rgba(88,166,255,0.2)',
      };
    case 'one-dark':
    case 'theme-one-dark-pro':
      return {
        folder: '#61afef',
        folderOpen: '#e5c07b',
        ts: '#61afef',
        js: '#e5c07b',
        py: '#98c379',
        html: '#e06c75',
        css: '#56b6c2',
        json: '#d19a66',
        md: '#61afef',
        rs: '#d19a66',
        go: '#56b6c2',
        sh: '#98c379',
        badgeBg: isLight ? '#f2f4f7' : '#282c34',
        badgeBorder: isLight ? 'rgba(97,175,239,0.25)' : 'rgba(97,175,239,0.2)',
      };
    case 'material':
    case 'material-icon-theme':
    default:
      return {
        folder: '#E0A82E',
        folderOpen: '#F3B838',
        ts: '#3178C6',
        js: '#F7DF1E',
        py: '#3776AB',
        html: '#E34F26',
        css: '#1572B6',
        json: '#CB3837',
        md: '#0891B2',
        rs: '#DEA584',
        go: '#00ADD8',
        sh: '#10B981',
        badgeBg: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)',
        badgeBorder: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
      };
  }
}
