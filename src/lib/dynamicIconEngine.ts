/**
 * Dynamic VS Code-compliant Icon Theme Engine for Kryptonide.
 * Resolves file and folder icons dynamically supporting:
 * 1. Custom VSIX/SVG themes loaded in memory or IndexedDB
 * 2. Authentic Google Material Design SVGs ('material' / 'material-icon-theme')
 * 3. Krypton Signature Aesthetic (Charcoal #2A2529, Matcha #7C9B79, Pale Ivory #F3F0E7)
 */

import DOMPurify from 'dompurify';

/**
 * Sanitize SVG markup before it is injected with dangerouslySetInnerHTML.
 * Custom icon themes are third-party input, so strip scripts, event handlers,
 * and javascript: URLs. Falls back to a conservative regex pass in environments
 * without a DOM (e.g. unit tests).
 */
export function sanitizeSvg(svg: string): string {
  if (!svg) return '';

  const purifier: any = DOMPurify as any;
  if (purifier && typeof purifier.sanitize === 'function') {
    return purifier.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ['script', 'foreignObject'],
      FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'onfocus'],
    }) as string;
  }

  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:xlink:href|href)\s*=\s*("|')\s*javascript:[^"']*\1/gi, '');
}

export interface IconThemeDefinition {
  id: string;
  label?: string;
  iconDefinitions?: Record<string, { iconPath?: string; fontCharacter?: string; fontColor?: string }>;
  fileExtensions?: Record<string, string>;
  fileNames?: Record<string, string>;
  languageIds?: Record<string, string>;
  folderNames?: Record<string, string>;
  folderNamesExpanded?: Record<string, string>;
  file?: string;
  folder?: string;
  folderExpanded?: string;
  rootFolder?: string;
  rootFolderExpanded?: string;
  light?: Partial<IconThemeDefinition>;
}

// In-memory registries
const themeDefinitions = new Map<string, IconThemeDefinition>();
const customSvgRegistry = new Map<string, string>();

/**
 * Register custom SVG content for a given theme and icon key
 */
export function registerCustomSvg(themeId: string, iconKey: string, svgContent: string): void {
  if (!themeId || !iconKey || !svgContent) return;
  const safeSvg = sanitizeSvg(svgContent);
  customSvgRegistry.set(`${themeId}:${iconKey}`, safeSvg);
  // Also register with normalized raw key
  customSvgRegistry.set(iconKey, safeSvg);
}

/**
 * Synchronously retrieve custom SVG content from registry
 */
export function getCustomSvg(themeId: string, iconKey: string): string | null {
  return customSvgRegistry.get(`${themeId}:${iconKey}`) || customSvgRegistry.get(iconKey) || null;
}

/**
 * Register a complete VS Code icon theme definition
 */
export function registerIconThemeDefinition(themeId: string, def: any): void {
  if (!themeId || !def) return;
  const themeDef: IconThemeDefinition = {
    id: themeId,
    label: def.label || themeId,
    iconDefinitions: def.iconDefinitions || {},
    fileExtensions: def.fileExtensions || {},
    fileNames: def.fileNames || {},
    languageIds: def.languageIds || {},
    folderNames: def.folderNames || {},
    folderNamesExpanded: def.folderNamesExpanded || {},
    file: def.file,
    folder: def.folder,
    folderExpanded: def.folderExpanded,
    rootFolder: def.rootFolder,
    rootFolderExpanded: def.rootFolderExpanded,
    light: def.light,
  };
  themeDefinitions.set(themeId, themeDef);
}

/**
 * Clear all registered custom themes and SVGs (useful for tests)
 */
export function clearIconEngineCache(): void {
  themeDefinitions.clear();
  customSvgRegistry.clear();
}

/**
 * Ensures an SVG scales responsively and cleanly to 100% of any container without being cropped
 */
export function ensureSvgResponsive(svg: string): string {
  if (!svg || typeof svg !== 'string') return svg;
  return svg.replace(/<svg\b([^>]*)>/i, (_, attrs) => {
    let newAttrs = attrs;
    if (/\bwidth="[^"]*"/i.test(newAttrs)) {
      newAttrs = newAttrs.replace(/\bwidth="[^"]*"/i, 'width="100%"');
    } else {
      newAttrs = `${newAttrs} width="100%"`;
    }
    if (/\bheight="[^"]*"/i.test(newAttrs)) {
      newAttrs = newAttrs.replace(/\bheight="[^"]*"/i, 'height="100%"');
    } else {
      newAttrs = `${newAttrs} height="100%"`;
    }
    return `<svg ${newAttrs.trim()}>`;
  });
}

// ─── GOOGLE MATERIAL DESIGN ICONS ─────────────────────────────────────────────

const MATERIAL_ICONS = {
  html: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 3l1.6 18 6.4 1.8 6.4-1.8L20 3H4z" fill="#E44D26"/><path d="M12 4.6v16.7l5.1-1.4 1.3-15.3H12z" fill="#F16529"/><path d="M7.7 7.5h8.6l-.3 3.2h-5l.2 2.6h4.6l-.5 5.1-3.3.9-3.3-.9-.2-2.3h1.8l.1 1.1 1.6.4 1.6-.4.2-2.1H7.5l-.5-7.7z" fill="#FFFFFF"/></svg>`,
  css: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 3l1.6 18 6.4 1.8 6.4-1.8L20 3H4z" fill="#1572B6"/><path d="M12 4.6v16.7l5.1-1.4 1.3-15.3H12z" fill="#33A9DC"/><path d="M7.7 7.5h8.6l-.3 3.2h-5.2l.2 2.6h4.8l-.5 5.2-3.3.9-3.3-.9-.2-2.3h1.8l.1 1.1 1.6.4 1.6-.4.2-2.2H7.9l-.2-7.6z" fill="#FFFFFF"/></svg>`,
  js: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="3" fill="#F7DF1E"/><path d="M7.5 17.5c.5.8 1.2 1.3 2.2 1.3 1.2 0 1.9-.6 1.9-1.9v-6.4h-1.8v6.3c0 .5-.2.7-.6.7-.4 0-.7-.3-.9-.7l-.8 1zm8.2.2c1.2 0 2-.6 2.3-1.4l-1.5-.9c-.2.4-.4.7-.8.7-.5 0-.8-.3-.8-.7 0-.5.3-.7 1-.9 1.4-.4 2.1-1 2.1-2.1 0-1.2-1-2.1-2.4-2.1-1.4 0-2.3.8-2.6 1.8l1.5.8c.2-.5.4-.8.9-.8.4 0 .7.3.7.6 0 .4-.3.6-.9.8-1.5.4-2.2 1.1-2.2 2.2 0 1.3 1 2.2 2.4 2.2z" fill="#000000"/></svg>`,
  ts: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="3" fill="#3178C6"/><path d="M6 10.5h6v1.8H9.9v6.7H8v-6.7H6v-1.8zm9.7 7.2c1.2 0 2-.6 2.3-1.4l-1.5-.9c-.2.4-.4.7-.8.7-.5 0-.8-.3-.8-.7 0-.5.3-.7 1-.9 1.4-.4 2.1-1 2.1-2.1 0-1.2-1-2.1-2.4-2.1-1.4 0-2.3.8-2.6 1.8l1.5.8c.2-.5.4-.8.9-.8.4 0 .7.3.7.6 0 .4-.3.6-.9.8-1.5.4-2.2 1.1-2.2 2.2 0 1.3 1 2.2 2.4 2.2z" fill="#FFFFFF"/></svg>`,
  react: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="12" cy="12" rx="9" ry="3.6" stroke="#61DAFB" strokeWidth="1.4"/><ellipse cx="12" cy="12" rx="9" ry="3.6" stroke="#61DAFB" strokeWidth="1.4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" stroke="#61DAFB" strokeWidth="1.4" transform="rotate(120 12 12)"/><circle cx="12" cy="12" r="1.8" fill="#61DAFB"/></svg>`,
  python: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.9 2c-3.1 0-4.9 1.4-4.9 3.8v2.7h5.1v.7H4.7c-2.4 0-4.2 1.5-4.2 4.5 0 3 1.8 4.6 4.2 4.6h1.7v-2.3c0-2.6 2.2-4.8 4.8-4.8h5.1V8.5c0-2.4-1.8-3.8-4.9-3.8h.5zm-2.7 1.9a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z" fill="#3776AB"/><path d="M12.1 22c3.1 0 4.9-1.4 4.9-3.8v-2.7h-5.1v-.7h7.4c2.4 0 4.2-1.5 4.2-4.5 0-3-1.8-4.6-4.2-4.6h-1.7v2.3c0 2.6-2.2 4.8-4.8 4.8H7.7v2.7c0 2.4 1.8 3.8 4.9 3.8h-.5zm2.7-1.9a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2z" fill="#FFD43B"/></svg>`,
  json: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 4C7.3 4 6 5.3 6 7v3c0 1-.8 1.8-1.8 2 1 .2 1.8 1 1.8 2v3c0 1.7 1.3 3 3 3h1v-2H9c-.6 0-1-.4-1-1v-3.2c0-1.1-.9-2-2-2 1.1 0 2-.9 2-2V7c0-.6.4-1 1-1h1V4H9zm6 0c1.7 0 3 1.3 3 3v3c0 1 .8 1.8 1.8 2-1 .2-1.8 1-1.8 2v3c0 1.7-1.3 3-3 3h-1v-2h1c.6 0 1-.4 1-1v-3.2c0-1.1.9-2 2-2-1.1 0-2-.9-2-2V7c0-.6-.4-1-1-1h-1V4h1z" fill="#FBC02D"/></svg>`,
  markdown: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="4" width="20" height="16" rx="2" fill="#42A5F5"/><path d="M5 16V8l3 3.5L11 8v8M15 11.5v4.5m0 0l-2.2-2.2m2.2 2.2l2.2-2.2" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" fill="#FFA000"/><path d="M20 8H4c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-8c0-1.1-.9-2-2-2z" fill="#FFCA28"/></svg>`,
  folderOpen: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" fill="#FFA000"/><path d="M21.8 10.2L19.5 19H3.2l2.3-8.8H21.8z" fill="#FFD54F"/></svg>`,
  docker: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22.5 11.2c-.3-.2-1.3-.4-2.5.3-.2-.5-.7-.9-1.3-1.1l-.5-.1-.2.5c-.3.8-.2 1.7.3 2.4-1.2 1.3-3.1 2-5.7 2-5 0-8.8-2.6-10.4-7.5l-.2-.6-.6.2C.6 7.6 0 8.6 0 9.7c0 4.6 4.3 8.3 11 8.3 6.9 0 11.6-4.1 11.8-6.3v-.5h-.3z" fill="#2496ED"/><rect x="5.5" y="11.5" width="2" height="1.8" rx=".2" fill="#2496ED"/><rect x="8" y="11.5" width="2" height="1.8" rx=".2" fill="#2496ED"/><rect x="10.5" y="11.5" width="2" height="1.8" rx=".2" fill="#2496ED"/><rect x="8" y="9.2" width="2" height="1.8" rx=".2" fill="#2496ED"/><rect x="10.5" y="9.2" width="2" height="1.8" rx=".2" fill="#2496ED"/><rect x="13" y="11.5" width="2" height="1.8" rx=".2" fill="#2496ED"/><rect x="13" y="9.2" width="2" height="1.8" rx=".2" fill="#2496ED"/><rect x="10.5" y="6.9" width="2" height="1.8" rx=".2" fill="#2496ED"/></svg>`,
  git: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21.6 10.9L13.1 2.4a1.7 1.7 0 0 0-2.4 0L8.3 4.8l3 3a2 2 0 0 1 2.5 2.5l2.9 2.9a2 2 0 1 1-1.2 1.2l-2.8-2.8v4.3a2 2 0 1 1-1.7 0v-4.4a2 2 0 0 1-1.1-2.6l-3-3-4.5 4.5a1.7 1.7 0 0 0 0 2.4l8.5 8.5a1.7 1.7 0 0 0 2.4 0l7.3-7.3a1.7 1.7 0 0 0 0-2.4z" fill="#F05032"/></svg>`,
  npm: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" fill="#CB3837" fillOpacity="0.15" stroke="#CB3837" strokeWidth="1.6" strokeLinejoin="round"/><path d="M12 12L3 7m9 5l9-5m-9 5v10" stroke="#CB3837" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>`,
  config: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" stroke="#78909C" strokeWidth="1.6"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="#78909C" strokeWidth="1.6"/></svg>`,
  file: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#ECEFF1" stroke="#90A4AE" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6" fill="#CFD8DC" stroke="#90A4AE" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>`,
  java: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 19h16v1.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V19z" fill="#5382A1"/><path d="M5 9h11v5.5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 14.5V9z" fill="#E76F00"/><path d="M16 10.5h1.5a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H16" stroke="#E76F00" strokeWidth="1.8" strokeLinecap="round"/><path d="M8 4c0 1.2.8 1.8.8 2.5M11.5 3.5c0 1.5.8 2 .8 3M15 4c0 1.2.8 1.8.8 2.5" stroke="#5382A1" strokeWidth="1.6" strokeLinecap="round"/></svg>`,
  kotlin: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21.5 2.5H2.5v19h19l-9.5-9.5 9.5-9.5z" fill="url(#ktGrad)"/><defs><linearGradient id="ktGrad" x1="21.5" y1="2.5" x2="2.5" y2="21.5" gradientUnits="userSpaceOnUse"><stop stop-color="#C757BC"/><stop offset="0.5" stop-color="#7F52FF"/><stop offset="1" stop-color="#E4485D"/></linearGradient></defs></svg>`,
  gradle: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.5 2 2 6.5 2 12c0 3.3 1.6 6.2 4.1 8l1.4-1.8C5.5 16.9 4.2 14.6 4.2 12c0-4.3 3.5-7.8 7.8-7.8s7.8 3.5 7.8 7.8c0 2.6-1.3 4.9-3.3 6.2l1.4 1.8c2.5-1.8 4.1-4.7 4.1-8 0-5.5-4.5-10-10-10z" fill="#02303A"/><path d="M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zm0 8.8a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6z" fill="#02303A"/><circle cx="12" cy="12" r="2" fill="#05A85C"/></svg>`,
  xml: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15" stroke="#FF9800" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>`,
};

// ─── KRYPTON SIGNATURE AESTHETIC ICONS (BORDERLESS SILHOUETTES) ─────────────────

function getKryptonIcons(isLight: boolean) {
  const ivory = isLight ? '#4A4448' : '#F3F0E7';
  const matcha = '#7C9B79';
  const coral = '#E06C75';
  const gold = '#E5C07B';
  const blue = '#61AFEF';
  const cyan = '#56B6C2';
  const purple = '#C678DD';

  return {
    file: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 3h8l6 6v12a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 21V4.5A1.5 1.5 0 0 1 6 3z" stroke="${ivory}" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 3v6h6" stroke="${ivory}" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>`,
    folder: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6a2 2 0 0 1 2-2h4.5a2 2 0 0 1 1.4.6l1.6 1.8H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" stroke="${matcha}" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="${matcha}" fillOpacity="0.12"/></svg>`,
    folderOpen: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 7a2 2 0 0 1 2-2h4.5a2 2 0 0 1 1.4.6l1.6 1.8H19a2 2 0 0 1 2 2v2H3V7z" stroke="${matcha}" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 11h18l-2 9a2 2 0 0 1-2 1.6H5a2 2 0 0 1-2-1.6l2-9z" stroke="${matcha}" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="${matcha}" fillOpacity="0.18"/></svg>`,
    html: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.5 3.5l1.5 15.5L12 21l6-2 1.5-15.5H4.5z" stroke="${coral}" strokeWidth="1.6" strokeLinejoin="round"/><path d="M8 8h8l-.5 5.5-3.5 1-3.5-1-.2-2" stroke="${ivory}" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>`,
    css: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.5 3.5l1.5 15.5L12 21l6-2 1.5-15.5H4.5z" stroke="${matcha}" strokeWidth="1.6" strokeLinejoin="round"/><path d="M8 8h7.5l-.4 3.5h-5.5l.3 2.5 1.6.4 1.6-.4.2-1.5" stroke="${ivory}" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>`,
    js: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 9v7a2.5 2.5 0 0 1-4.5 1.5" stroke="${gold}" strokeWidth="1.8" strokeLinecap="round"/><path d="M14 17.5c1.5.5 3 .2 3.8-.5a2 2 0 0 0 0-3c-1.5-.8-3-.8-3-2a2 2 0 0 1 3.5-1.5" stroke="${gold}" strokeWidth="1.8" strokeLinecap="round"/></svg>`,
    ts: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 8h7M7.5 8v10" stroke="${blue}" strokeWidth="1.8" strokeLinecap="round"/><path d="M14 17.5c1.5.5 3 .2 3.8-.5a2 2 0 0 0 0-3c-1.5-.8-3-.8-3-2a2 2 0 0 1 3.5-1.5" stroke="${blue}" strokeWidth="1.8" strokeLinecap="round"/></svg>`,
    react: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="12" cy="12" rx="8.5" ry="3.2" stroke="${cyan}" strokeWidth="1.5" transform="rotate(30 12 12)"/><ellipse cx="12" cy="12" rx="8.5" ry="3.2" stroke="${matcha}" strokeWidth="1.5" transform="rotate(-30 12 12)"/><circle cx="12" cy="12" r="1.6" fill="${ivory}"/></svg>`,
    python: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.5 3.5c-2.8 0-4.5 1.2-4.5 3.5v2.5h5v1H5c-2.2 0-3.5 1.5-3.5 3.8 0 2.8 1.8 3.8 3.5 3.8h1.5v-2c0-2 1.8-3.5 3.8-3.5H15V7c0-2-1.5-3.5-3.5-3.5z" stroke="${matcha}" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><circle cx="9" cy="6" r="0.8" fill="${matcha}"/><path d="M12.5 20.5c2.8 0 4.5-1.2 4.5-3.5v-2.5h-5v-1H19c2.2 0 3.5-1.5 3.5-3.8 0-2.8-1.8-3.8-3.5-3.8h-1.5v2c0 2-1.8 3.5-3.8 3.5H9V17c0 2 1.5 3.5 3.5 3.5z" stroke="${gold}" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><circle cx="15" cy="18" r="0.8" fill="${gold}"/></svg>`,
    json: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 5c-1.5 0-2.5 1-2.5 2.5v2c0 .8-.6 1.5-1.5 1.5.9 0 1.5.7 1.5 1.5v2c0 1.5 1 2.5 2.5 2.5M15 5c1.5 0 2.5 1 2.5 2.5v2c0 .8.6 1.5 1.5 1.5-.9 0-1.5.7-1.5 1.5v2c0 1.5-1 2.5-2.5 2.5" stroke="${matcha}" strokeWidth="1.8" strokeLinecap="round"/></svg>`,
    markdown: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z" stroke="${matcha}" strokeWidth="1.6"/><path d="M7 15V9l2.5 3.2L12 9v6M16 11v4m-1.8-1.8L16 15l1.8-1.8" stroke="${ivory}" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>`,
    git: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="7" cy="6" r="2.2" stroke="${coral}" strokeWidth="1.6"/><circle cx="7" cy="18" r="2.2" stroke="${coral}" strokeWidth="1.6"/><circle cx="17" cy="12" r="2.2" stroke="${coral}" strokeWidth="1.6"/><path d="M7 8.2v7.6M7 10c0 2 10 0 10 2" stroke="${coral}" strokeWidth="1.6" strokeLinecap="round"/></svg>`,
    docker: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 13.5c1.5 4.5 5 6 9 6 6 0 9-3.5 9-6 0-.8-.5-1.5-1.2-1.5-1.2 0-2.3.8-2.8 1.8-1.5-.3-3-.2-4.5.7l-4.5-.3C6 13.5 4 12 3 13.5z" stroke="${cyan}" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 10h2v2H7zM10 10h2v2h-2zM13 10h2v2h-2zM10 7h2v2h-2z" fill="${cyan}"/></svg>`,
    package: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" stroke="${matcha}" strokeWidth="1.6" strokeLinejoin="round"/><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9" stroke="${matcha}" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>`,
    env: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="12" r="5" stroke="${gold}" strokeWidth="1.6"/><path d="M14 12h6m-3 0v3" stroke="${gold}" strokeWidth="1.6" strokeLinecap="round"/></svg>`,
    rust: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="7" stroke="${coral}" strokeWidth="1.6" strokeDasharray="3 2"/><circle cx="12" cy="12" r="3" stroke="${coral}" strokeWidth="1.6"/></svg>`,
    go: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 14.5A4.5 4.5 0 1 1 10.5 10H6" stroke="${cyan}" strokeWidth="1.8" strokeLinecap="round"/><circle cx="16" cy="12" r="4.5" stroke="${cyan}" strokeWidth="1.8"/></svg>`,
    shell: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 8l5 4-5 4M13 16h6" stroke="${matcha}" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>`,
    c: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 8.5a5.5 5.5 0 1 0 0 7" stroke="${blue}" strokeWidth="1.8" strokeLinecap="round"/><path d="M18 10v4M16 12h4" stroke="${blue}" strokeWidth="1.4" strokeLinecap="round"/></svg>`,
    image: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="16" height="16" rx="2" stroke="${purple}" strokeWidth="1.6"/><circle cx="9" cy="9" r="1.5" fill="${purple}"/><path d="M4 17l5-5 3 3 4-4 4 4" stroke="${purple}" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>`,
    database: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="12" cy="7" rx="7" ry="3" stroke="${cyan}" strokeWidth="1.6"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" stroke="${cyan}" strokeWidth="1.6"/></svg>`,
    java: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 9h12v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9z" stroke="${coral}" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M17 11h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2" stroke="${coral}" strokeWidth="1.6" strokeLinecap="round"/><path d="M8 4c0 1.5 1 2 1 3m3-3c0 1.5 1 2 1 3m3-3c0 1.5 1 2 1 3" stroke="${matcha}" strokeWidth="1.5" strokeLinecap="round"/></svg>`,
    kotlin: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 4H4v16h16l-8-8 8-8z" stroke="${purple}" strokeWidth="1.6" strokeLinejoin="round" fill="${purple}" fillOpacity="0.12"/><path d="M4 12l8 8" stroke="${matcha}" strokeWidth="1.6" strokeLinecap="round"/></svg>`,
    gradle: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3a9 9 0 0 0-9 9c0 3.2 1.7 6 4.2 7.6l1.2-1.6A7 7 0 1 1 19 12h2a9 9 0 0 0-9-9z" fill="${matcha}"/><circle cx="12" cy="12" r="3" stroke="${matcha}" strokeWidth="1.6"/></svg>`,
    xml: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.5 8.5L5 12l3.5 3.5m7-7L19 12l-3.5 3.5m-5 4.5l3.5-13" stroke="${coral}" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>`,
  };
}

// ─── RESOLUTION FUNCTIONS ─────────────────────────────────────────────────────

/**
 * Dynamically resolves SVG string for any file name based on active theme
 */
export function resolveFileIconSvg(
  fileName: string,
  themeId?: string | null,
  isLight = false
): string {
  const cleanName = (fileName || '').trim();
  const lower = cleanName.toLowerCase();
  const parts = lower.split('.');
  const ext = parts.length > 1 ? parts.pop() || '' : '';
  const compoundExt = parts.length > 1 ? `${parts.pop()}.${ext}` : '';

  const activeTheme = themeId || 'krypton';

  // 1. Check Custom VSIX/SVG registered theme first for any active theme
  if (activeTheme && activeTheme !== 'krypton' && activeTheme !== 'default') {
    const themeDef = themeDefinitions.get(activeTheme) || themeDefinitions.get('material') || themeDefinitions.get('material-icon-theme');
    if (themeDef) {
      const activeDef = (isLight && themeDef.light) ? { ...themeDef, ...themeDef.light } : themeDef;

      let iconKey: string | undefined = undefined;
      // Exact file name match
      if (activeDef.fileNames?.[lower] || activeDef.fileNames?.[cleanName]) {
        iconKey = activeDef.fileNames[lower] || activeDef.fileNames[cleanName];
      }
      // Compound extension match (e.g. d.ts, test.tsx)
      else if (compoundExt && activeDef.fileExtensions?.[compoundExt]) {
        iconKey = activeDef.fileExtensions[compoundExt];
      }
      // Simple extension match
      else if (ext && activeDef.fileExtensions?.[ext]) {
        iconKey = activeDef.fileExtensions[ext];
      }
      // Language ID match
      else if (ext && activeDef.languageIds?.[ext]) {
        iconKey = activeDef.languageIds[ext];
      }
      // Standard file fallback
      else if (activeDef.file) {
        iconKey = activeDef.file;
      }

      if (iconKey) {
        const customSvg = getCustomSvg(activeTheme, iconKey) || getCustomSvg('material', iconKey) || getCustomSvg('material-icon-theme', iconKey);
        if (customSvg) return ensureSvgResponsive(customSvg);
      }
    }

    // Direct SVG key lookup in custom registry with common extension aliases
    const directKeys = [
      ext,
      `_f_${ext}`,
      `file_type_${ext}`,
      ext === 'jsx' ? 'react' : ext === 'tsx' ? 'react_ts' : null,
      ext === 'py' ? 'python' : null,
      ext === 'js' ? 'javascript' : null,
      ext === 'ts' ? 'typescript' : null,
      ext === 'md' ? 'markdown' : null,
      cleanName,
      lower,
    ].filter(Boolean) as string[];

    for (const dk of directKeys) {
      const directSvg = getCustomSvg(activeTheme, dk) || getCustomSvg('material', dk) || getCustomSvg('material-icon-theme', dk);
      if (directSvg) return ensureSvgResponsive(directSvg);
    }
  }

  // 2. Material Design Icon Theme
  if (activeTheme === 'material' || activeTheme === 'material-icon-theme') {
    if (lower === 'package.json' || lower === 'package-lock.json' || lower === 'pnpm-lock.yaml' || lower === 'yarn.lock' || lower === 'bun.lockb') {
      return ensureSvgResponsive(MATERIAL_ICONS.npm);
    }
    if (lower.startsWith('.env')) return ensureSvgResponsive(MATERIAL_ICONS.config);
    if (lower.includes('dockerfile') || lower.includes('docker-compose')) return ensureSvgResponsive(MATERIAL_ICONS.docker);
    if (lower.startsWith('.git') || lower === '.gitignore' || lower === '.gitattributes') return ensureSvgResponsive(MATERIAL_ICONS.git);
    if (lower.includes('tsconfig') || lower.includes('jsconfig') || lower.includes('vite.config') || lower.includes('tailwind.config')) {
      return ensureSvgResponsive(MATERIAL_ICONS.config);
    }
    if (ext === 'html' || ext === 'htm') return ensureSvgResponsive(MATERIAL_ICONS.html);
    if (ext === 'css' || ext === 'scss' || ext === 'sass' || ext === 'less') return ensureSvgResponsive(MATERIAL_ICONS.css);
    if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return ensureSvgResponsive(MATERIAL_ICONS.js);
    if (ext === 'ts' || ext === 'mts' || ext === 'cts') return ensureSvgResponsive(MATERIAL_ICONS.ts);
    if (ext === 'jsx' || ext === 'tsx') return ensureSvgResponsive(MATERIAL_ICONS.react);
    if (ext === 'py' || ext === 'pyw' || ext === 'ipynb') return ensureSvgResponsive(MATERIAL_ICONS.python);
    if (ext === 'json' || ext === 'json5' || ext === 'jsonc') return ensureSvgResponsive(MATERIAL_ICONS.json);
    if (ext === 'md' || ext === 'markdown' || ext === 'mdx') return ensureSvgResponsive(MATERIAL_ICONS.markdown);
    if (ext === 'java' || ext === 'class' || ext === 'jar') return ensureSvgResponsive(MATERIAL_ICONS.java);
    if (ext === 'kt' || ext === 'kts') return ensureSvgResponsive(MATERIAL_ICONS.kotlin);
    if (ext === 'gradle') return ensureSvgResponsive(MATERIAL_ICONS.gradle);
    if (ext === 'xml') return ensureSvgResponsive(MATERIAL_ICONS.xml);

    return ensureSvgResponsive(MATERIAL_ICONS.file);
  }

  // 3. Default Krypton Theme (Sleek Borderless Brand Silhouettes)
  const icons = getKryptonIcons(isLight);

  if (lower === 'package.json' || lower === 'package-lock.json' || lower === 'pnpm-lock.yaml' || lower === 'yarn.lock' || lower === 'bun.lockb') {
    return ensureSvgResponsive(icons.package);
  }
  if (lower.startsWith('.env')) return ensureSvgResponsive(icons.env);
  if (lower.includes('dockerfile') || lower.includes('docker-compose')) return ensureSvgResponsive(icons.docker);
  if (lower.startsWith('.git') || lower === '.gitignore' || lower === '.gitattributes') return ensureSvgResponsive(icons.git);
  if (lower.includes('tsconfig') || lower.includes('jsconfig') || lower.includes('vite.config') || lower.includes('tailwind.config')) {
    return ensureSvgResponsive(icons.package);
  }

  if (ext === 'tsx') return ensureSvgResponsive(icons.react);
  if (ext === 'ts' || ext === 'mts' || ext === 'cts') return ensureSvgResponsive(icons.ts);
  if (ext === 'jsx') return ensureSvgResponsive(icons.react);
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return ensureSvgResponsive(icons.js);
  if (ext === 'py' || ext === 'pyw' || ext === 'ipynb') return ensureSvgResponsive(icons.python);
  if (ext === 'html' || ext === 'htm') return ensureSvgResponsive(icons.html);
  if (ext === 'css' || ext === 'scss' || ext === 'sass' || ext === 'less') return ensureSvgResponsive(icons.css);
  if (ext === 'json' || ext === 'json5' || ext === 'jsonc') return ensureSvgResponsive(icons.json);
  if (ext === 'md' || ext === 'markdown' || ext === 'mdx') return ensureSvgResponsive(icons.markdown);
  if (ext === 'java' || ext === 'class' || ext === 'jar') return ensureSvgResponsive(icons.java);
  if (ext === 'kt' || ext === 'kts') return ensureSvgResponsive(icons.kotlin);
  if (ext === 'gradle') return ensureSvgResponsive(icons.gradle);
  if (ext === 'xml') return ensureSvgResponsive(icons.xml);
  if (ext === 'rs') return ensureSvgResponsive(icons.rust);
  if (ext === 'go') return ensureSvgResponsive(icons.go);
  if (ext === 'sh' || ext === 'bash' || ext === 'zsh' || ext === 'fish') return ensureSvgResponsive(icons.shell);
  if (ext === 'c' || ext === 'cpp' || ext === 'h' || ext === 'hpp' || ext === 'cs') return ensureSvgResponsive(icons.c);
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif'].includes(ext)) return ensureSvgResponsive(icons.image);
  if (['sql', 'sqlite', 'db'].includes(ext)) return ensureSvgResponsive(icons.database);

  return ensureSvgResponsive(icons.file);
}

/**
 * Dynamically resolves SVG string for any folder based on active theme
 */
export function resolveFolderIconSvg(
  folderName: string,
  isOpen = false,
  themeId?: string | null,
  isLight = false
): string {
  const lower = (folderName || '').trim().toLowerCase();
  const activeTheme = themeId || 'krypton';

  // 1. Check Custom VSIX/SVG registered theme
  if (activeTheme && activeTheme !== 'krypton' && activeTheme !== 'default') {
    const themeDef = themeDefinitions.get(activeTheme) || themeDefinitions.get('material') || themeDefinitions.get('material-icon-theme');
    if (themeDef) {
      const activeDef = (isLight && themeDef.light) ? { ...themeDef, ...themeDef.light } : themeDef;

      let folderKey: string | undefined = undefined;
      if (isOpen && activeDef.folderNamesExpanded?.[lower]) {
        folderKey = activeDef.folderNamesExpanded[lower];
      } else if (activeDef.folderNames?.[lower]) {
        folderKey = activeDef.folderNames[lower];
      } else if (isOpen && activeDef.folderExpanded) {
        folderKey = activeDef.folderExpanded;
      } else if (activeDef.folder) {
        folderKey = activeDef.folder;
      }

      if (folderKey) {
        const customFolder = getCustomSvg(activeTheme, folderKey) || getCustomSvg('material', folderKey) || getCustomSvg('material-icon-theme', folderKey);
        if (customFolder) return ensureSvgResponsive(customFolder);
      }
    }

    // Direct fallback
    const directKey = isOpen ? 'folder-open' : 'folder';
    const directFolder = getCustomSvg(activeTheme, directKey) || getCustomSvg('material', directKey) || getCustomSvg('material-icon-theme', directKey);
    if (directFolder) return ensureSvgResponsive(directFolder);
  }

  // 2. Material Design Icon Theme
  if (activeTheme === 'material' || activeTheme === 'material-icon-theme') {
    return ensureSvgResponsive(isOpen ? MATERIAL_ICONS.folderOpen : MATERIAL_ICONS.folder);
  }

  // 3. Default Krypton Theme
  const icons = getKryptonIcons(isLight);
  return ensureSvgResponsive(isOpen ? icons.folderOpen : icons.folder);
}
