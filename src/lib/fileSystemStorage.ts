import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import type { FileNode } from '../store/useIdeStore';
import { getLanguageFromFilename } from '../store/useIdeStore';
import { checkStoragePermission, requestStoragePermission } from './storagePermission';

// ─── Constants ───────────────────────────────────────────────
const BASE_PATH_KEY = 'krypton-base-path'; // bootstrap key stored in localStorage
const DEFAULT_FOLDER = 'KryptonIDE';

// ─── Types ───────────────────────────────────────────────────
export interface SavedModel {
  id: string;
  name: string;
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export interface KryptonConfig {
  welcomed: boolean;
  haptics: boolean;
  theme: 'krypton-warm' | 'vs-dark' | 'light' | 'hc-black';
  activeFont: string; // name of active font, empty = default
  installedFonts: string[]; // list of font names saved in fonts/ folder
  fileFontSizes?: Record<string, number>;
  ai: {
    provider: string;
    model: string;
    baseUrl?: string;
    activeSessionId: string | null;
    savedModels?: SavedModel[];
    activeModelId?: string;
  };
  harness?: {
    defaultHarnessId?: string;
    executionMode?: 'supervised' | 'autonomous' | 'unbound';
  };
}

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  template: string;
  githubRepo?: string; // Format: "owner/repo"
  folderPath?: string;
}

// API key is stored separately in Directory.Data for privacy
const API_KEY_FILE = 'krypton-api-key.json';

const DEFAULT_CONFIG: KryptonConfig = {
  welcomed: false,
  haptics: true,
  theme: 'krypton-warm',
  activeFont: '',
  installedFonts: [],
  ai: {
    provider: '',
    model: '',
    activeSessionId: null,
    savedModels: [],
    activeModelId: undefined,
  },
};

// ─── Debounce Queue ──────────────────────────────────────────
const writeTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function debouncedWrite(key: string, fn: () => Promise<void>, delayMs = 500) {
  if (writeTimers[key]) clearTimeout(writeTimers[key]);
  writeTimers[key] = setTimeout(async () => {
    try {
      await fn();
    } catch (e) {
      console.error(`[FS] Debounced write failed for ${key}:`, e);
    }
  }, delayMs);
}

// ─── Flush all pending writes immediately ────────────────────
export async function flushAllWrites(): Promise<void> {
  const keys = Object.keys(writeTimers);
  for (const key of keys) {
    clearTimeout(writeTimers[key]);
    delete writeTimers[key];
  }
  // The actual pending write functions are lost when we clear timers.
  // Instead, callers should use saveConfigNow / saveProjectNow etc.
}

// ─── Path Helpers ────────────────────────────────────────────

export function getBasePath(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(BASE_PATH_KEY) || '';
    }
  } catch {}
  return '';
}

export function setBasePath(path: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(BASE_PATH_KEY, path);
    }
  } catch {}
}

export function isStorageInitialized(): boolean {
  return !!getBasePath();
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export function defaultDir(): Directory {
  return isNative() ? Directory.ExternalStorage : Directory.Documents;
}

// ─── Low-Level FS Ops ────────────────────────────────────────

export async function readTextFile(path: string, directory: Directory = defaultDir()): Promise<string | null> {
  try {
    const result = await Filesystem.readFile({ path, directory, encoding: Encoding.UTF8 });
    return typeof result.data === 'string' ? result.data : null;
  } catch {
    return null;
  }
}

export async function writeTextFile(path: string, data: string, directory: Directory = defaultDir()): Promise<void> {
  try {
    await Filesystem.writeFile({ path, data, directory, encoding: Encoding.UTF8 });
  } catch (e: any) {
    if (isNative() && (e?.message?.includes('EACCES') || e?.message?.includes('Permission denied') || e?.message?.includes('openfailed'))) {
      console.warn('[FS] Storage permission missing during writeTextFile, requesting permission...');
      const granted = await requestStoragePermission();
      if (granted) {
        await Filesystem.writeFile({ path, data, directory, encoding: Encoding.UTF8 });
        return;
      }
    }
    throw e;
  }
}

export async function mkdirSafe(path: string, directory: Directory = defaultDir()): Promise<void> {
  try {
    await Filesystem.mkdir({ path, directory, recursive: true });
  } catch (e: any) {
    if (e?.message?.includes('exists')) return;
    if (isNative() && (e?.message?.includes('EACCES') || e?.message?.includes('Permission denied') || e?.message?.includes('openfailed'))) {
      console.warn('[FS] Storage permission missing during mkdirSafe, requesting permission...');
      const granted = await requestStoragePermission();
      if (granted) {
        try {
          await Filesystem.mkdir({ path, directory, recursive: true });
          return;
        } catch (err: any) {
          if (err?.message?.includes('exists')) return;
          throw err;
        }
      }
    }
    throw e;
  }
}

export async function deletePathSafe(path: string, directory: Directory = defaultDir()): Promise<void> {
  try {
    await Filesystem.rmdir({ path, directory, recursive: true });
  } catch {
    try {
      await Filesystem.deleteFile({ path, directory });
    } catch {
      // already gone
    }
  }
}

export async function deleteProjectFileNode(
  projectId: string,
  relativePath: string,
  _isFolder?: boolean
): Promise<void> {
  const base = getBasePath();
  if (!base) return;
  const projectDir = `${base}/projects/${projectId}`;
  await deletePathSafe(`${projectDir}/${relativePath}`);
}

export async function listDir(path: string, directory: Directory = defaultDir()) {
  try {
    const result = await Filesystem.readdir({ path, directory });
    return result.files;
  } catch {
    return [];
  }
}

// ─── Web Fallback (localStorage) ─────────────────────────────
// When running in the browser (non-native), we fall back to localStorage
// so the app still works for dev/testing.

export function webRead(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(`kfs:${key}`);
    }
  } catch {}
  return null;
}
export function webWrite(key: string, data: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`kfs:${key}`, data);
    }
  } catch {}
}
export function webDelete(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`kfs:${key}`);
    }
  } catch {}
}
export function webList(prefix: string): string[] {
  const keys: string[] = [];
  try {
    if (typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(`kfs:${prefix}`)) keys.push(k.replace('kfs:', ''));
      }
    }
  } catch {}
  return keys;
}

// ─── Initialize Storage ──────────────────────────────────────

export async function initializeStorage(folderName: string): Promise<void> {
  const basePath = folderName || DEFAULT_FOLDER;

  if (isNative()) {
    const hasPerm = await checkStoragePermission();
    if (!hasPerm) {
      throw new Error('Storage permission denied. Please enable "All files access" for KryptonIDE in Android Settings.');
    }

    const dir = defaultDir();
    await mkdirSafe(basePath, dir);
    await mkdirSafe(`${basePath}/projects`, dir);
    await mkdirSafe(`${basePath}/ai-sessions`, dir);
    await mkdirSafe(`${basePath}/fonts`, dir);
    await mkdirSafe(`${basePath}/.contexts`, dir);
    await mkdirSafe(`${basePath}/.memory`, dir);
    await mkdirSafe(`${basePath}/.krypton`, dir);
    await mkdirSafe(`${basePath}/skills`, dir);
    await mkdirSafe(`${basePath}/snippets`, dir);
  }

  setBasePath(basePath);

  // Write default config if none exists
  const existing = await readConfig();
  if (!existing) {
    await saveConfigNow(DEFAULT_CONFIG);
  }

  // Ensure default mcp.json exists
  const mcpConfig = await readMcpConfig();
  if (!mcpConfig) {
    await saveMcpConfig([]);
  }
}

// ─── Config (krypton.config.json) ────────────────────────────

export async function readConfig(): Promise<KryptonConfig | null> {
  const base = getBasePath();

  if (!isNative()) {
    const raw = (base ? webRead(`${base}/krypton.config.json`) : null) || webRead('krypton.config.json');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) {
      console.error('[FS] Corrupt config (web), resetting:', e);
      return null;
    }
  }

  // 1. Check Directory.Data (app-private internal storage)
  let raw = await readTextFile('krypton.config.json', Directory.Data);

  // 2. Migration: if not found in Directory.Data, check external storage
  if (!raw && base) {
    raw = await readTextFile(`${base}/krypton.config.json`, Directory.ExternalStorage);
    if (raw) {
      await writeTextFile('krypton.config.json', raw, Directory.Data);
      await deletePathSafe(`${base}/krypton.config.json`, Directory.ExternalStorage);
    }
  }

  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) {
    console.error('[FS] Corrupt config file, resetting:', e);
    return null;
  }
}

export async function saveConfigNow(config: KryptonConfig): Promise<void> {
  const data = JSON.stringify(config, null, 2);
  if (!isNative()) {
    const base = getBasePath();
    if (base) webWrite(`${base}/krypton.config.json`, data);
    webWrite('krypton.config.json', data);
    return;
  }
  await writeTextFile('krypton.config.json', data, Directory.Data);
}

export function saveConfigDebounced(config: KryptonConfig): void {
  debouncedWrite('config', () => saveConfigNow(config));
}

// ─── API Key (private storage) ───────────────────────────────

export async function readApiKey(): Promise<string> {
  if (!isNative()) {
    return localStorage.getItem('kfs:api-key') || '';
  }
  try {
    const raw = await readTextFile(API_KEY_FILE, Directory.Data);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.apiKey || '';
    }
  } catch { /* empty */ }
  return '';
}

export async function saveApiKey(apiKey: string): Promise<void> {
  if (!isNative()) {
    localStorage.setItem('kfs:api-key', apiKey);
    return;
  }
  await writeTextFile(API_KEY_FILE, JSON.stringify({ apiKey }), Directory.Data);
}

// ─── Auth (auth.json in external) ────────────────────────────

export async function readAuth(): Promise<any | null> {
  const base = getBasePath();

  if (!isNative()) {
    const raw = (base ? webRead(`${base}/auth.json`) : null) || webRead('auth.json');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) {
      console.error('[FS] Corrupt auth (web), resetting:', e);
      return null;
    }
  }

  // 1. Check Directory.Data (app-private internal storage)
  let raw = await readTextFile('auth.json', Directory.Data);

  // 2. Migration: if not found in Directory.Data, check external storage
  if (!raw && base) {
    raw = await readTextFile(`${base}/auth.json`, Directory.ExternalStorage);
    if (raw) {
      await writeTextFile('auth.json', raw, Directory.Data);
      await deletePathSafe(`${base}/auth.json`, Directory.ExternalStorage);
    }
  }

  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) {
    console.error('[FS] Corrupt auth file, resetting:', e);
    return null;
  }
}

export async function saveAuth(data: any): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  if (!isNative()) {
    const base = getBasePath();
    if (base) webWrite(`${base}/auth.json`, json);
    webWrite('auth.json', json);
    return;
  }
  await writeTextFile('auth.json', json, Directory.Data);
}

export function saveAuthDebounced(data: any): void {
  debouncedWrite('auth', () => saveAuth(data));
}

// ─── Extensions (extensions.json) ────────────────────────────

export async function readExtensions(): Promise<any | null> {
  const base = getBasePath();
  if (!base) return null;

  if (!isNative()) {
    const raw = webRead(`${base}/extensions.json`);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) {
      console.error('[FS] Corrupt extensions (web), resetting:', e);
      return null;
    }
  }

  const raw = await readTextFile(`${base}/extensions.json`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) {
    console.error('[FS] Corrupt extensions file, resetting:', e);
    return null;
  }
}

export async function saveExtensions(data: any): Promise<void> {
  const base = getBasePath();
  if (!base) return;

  const json = JSON.stringify(data, null, 2);
  if (!isNative()) {
    webWrite(`${base}/extensions.json`, json);
    return;
  }
  await writeTextFile(`${base}/extensions.json`, json);
}

export function saveExtensionsDebounced(data: any): void {
  debouncedWrite('extensions', () => saveExtensions(data));
}

// ─── AI Sessions (per-project) ───────────────────────────────

/** Get the session directory path for a given project, or global if no project */
function sessionDir(projectId?: string): string {
  const base = getBasePath();
  if (projectId) {
    return `${base}/projects/${projectId}/ai-sessions`;
  }
  return `${base}/ai-sessions`;
}

export async function readAllSessions(projectId?: string): Promise<any[]> {
  const base = getBasePath();
  if (!base) return [];

  const dir = sessionDir(projectId);

  if (!isNative()) {
    const keys = webList(`${dir}/`);
    return keys
      .map(k => { try { return JSON.parse(webRead(k) || ''); } catch { return null; } })
      .filter(Boolean);
  }

  // Ensure directory exists
  await mkdirSafe(dir);

  const entries = await listDir(dir);
  const sessions: any[] = [];
  for (const entry of entries) {
    if (entry.name.endsWith('.json')) {
      const raw = await readTextFile(`${dir}/${entry.name}`);
      if (raw) {
        try { sessions.push(JSON.parse(raw)); } catch { /* skip corrupt */ }
      }
    }
  }
  return sessions;
}

export async function saveSession(session: any, projectId?: string): Promise<void> {
  const base = getBasePath();
  if (!base) return;

  const dir = sessionDir(projectId);
  const fname = `session_${session.id}.json`;
  const data = JSON.stringify(session, null, 2);

  if (!isNative()) {
    webWrite(`${dir}/${fname}`, data);
    return;
  }
  await mkdirSafe(dir);
  await writeTextFile(`${dir}/${fname}`, data);
}

export function saveSessionDebounced(session: any, projectId?: string): void {
  debouncedWrite(`session-${session.id}`, () => saveSession(session, projectId));
}

export async function deleteSessionFile(sessionId: string, projectId?: string): Promise<void> {
  const base = getBasePath();
  if (!base) return;

  const dir = sessionDir(projectId);
  const fname = `session_${sessionId}.json`;
  if (!isNative()) {
    webDelete(`${dir}/${fname}`);
    return;
  }
  try {
    await Filesystem.deleteFile({ path: `${dir}/${fname}`, directory: defaultDir() });
  } catch { /* already gone */ }
}

// ─── Projects (real files on disk!) ──────────────────────────

export async function loadAllProjectMetas(): Promise<ProjectMeta[]> {
  const base = getBasePath();
  if (!base) return [];

  if (!isNative()) {
    const keys = webList(`${base}/projects/`);
    const metaKeys = keys.filter(k => k.endsWith('/project.meta.json'));
    return metaKeys
      .map(k => { try { return JSON.parse(webRead(k) || ''); } catch { return null; } })
      .filter(Boolean);
  }

  const entries = await listDir(`${base}/projects`);
  const metas: ProjectMeta[] = [];
  for (const entry of entries) {
    if (entry.type === 'directory') {
      const raw = await readTextFile(`${base}/projects/${entry.name}/project.meta.json`);
      if (raw) {
        try { metas.push(JSON.parse(raw)); } catch { /* skip */ }
      }
    }
  }
  return metas;
}

export async function saveProjectMeta(meta: ProjectMeta): Promise<void> {
  const base = getBasePath();
  if (!base) return;

  const dir = `${base}/projects/${meta.id}`;
  const data = JSON.stringify(meta, null, 2);

  if (!isNative()) {
    webWrite(`${dir}/project.meta.json`, data);
    return;
  }

  await mkdirSafe(dir);
  await writeTextFile(`${dir}/project.meta.json`, data);
}

/**
 * Writes the FileNode tree as real files to disk.
 * Folders become real directories, files become real files.
 */
export async function writeProjectFiles(
  projectId: string,
  files: Record<string, FileNode>
): Promise<void> {
  const base = getBasePath();
  if (!base) return;

  const projectDir = `${base}/projects/${projectId}`;

  if (!isNative()) {
    // Web fallback: store as JSON blob
    webWrite(`${projectDir}/files.json`, JSON.stringify(files));
    return;
  }

  await mkdirSafe(projectDir);

  // Physical wipe: clean up removed/renamed files by diffing against previous tree
  try {
    const prevTreeRaw = await readTextFile(`${projectDir}/._krypton_tree.json`);
    if (prevTreeRaw) {
      const prevTree = JSON.parse(prevTreeRaw) as Record<string, FileNode>;
      const prevPathMap = new Map<string, string>();
      function buildPrevPath(nId: string): string {
        if (prevPathMap.has(nId)) return prevPathMap.get(nId)!;
        const n = prevTree[nId];
        if (!n) return '';
        if (nId === 'root' || !n.parentId) {
          prevPathMap.set(nId, '');
          return '';
        }
        const pp = buildPrevPath(n.parentId);
        const fp = pp ? `${pp}/${n.name}` : n.name;
        prevPathMap.set(nId, fp);
        return fp;
      }
      for (const nId of Object.keys(prevTree)) {
        buildPrevPath(nId);
      }

      const toDelete: string[] = [];
      for (const [prevId] of Object.entries(prevTree)) {
        if (prevId === 'root') continue;
        if (!files[prevId]) {
          const rel = prevPathMap.get(prevId);
          if (rel) toDelete.push(rel);
        }
      }
      // Delete child files before folders
      toDelete.sort((a, b) => b.length - a.length);
      for (const rel of toDelete) {
        await deletePathSafe(`${projectDir}/${rel}`);
      }
    }
  } catch (e) {
    console.warn('[FS] Error cleaning old project nodes:', e);
  }

  // Build path map: nodeId → full relative path
  const pathMap = new Map<string, string>();

  function buildPath(nodeId: string): string {
    if (pathMap.has(nodeId)) return pathMap.get(nodeId)!;
    const node = files[nodeId];
    if (!node) return '';
    if (nodeId === 'root' || !node.parentId) {
      pathMap.set(nodeId, '');
      return '';
    }
    const parentPath = buildPath(node.parentId);
    const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    pathMap.set(nodeId, fullPath);
    return fullPath;
  }

  // Build all paths first
  for (const nodeId of Object.keys(files)) {
    buildPath(nodeId);
  }

  // Create directories first, then write files
  for (const [nodeId, node] of Object.entries(files)) {
    if (nodeId === 'root') continue;
    const relativePath = pathMap.get(nodeId) || node.name;
    const fullPath = `${projectDir}/${relativePath}`;

    if (node.type === 'folder') {
      await mkdirSafe(fullPath);
    }
  }

  for (const [nodeId, node] of Object.entries(files)) {
    if (nodeId === 'root') continue;
    const relativePath = pathMap.get(nodeId) || node.name;
    const fullPath = `${projectDir}/${relativePath}`;

    if (node.type === 'file' && node.content !== undefined) {
      await writeTextFile(fullPath, node.content);
    }
  }

  // Also save the FileNode structure for internal use (IDs, parentId, etc.)
  await writeTextFile(`${projectDir}/._krypton_tree.json`, JSON.stringify(files, null, 2));
}

export function writeProjectFilesDebounced(
  projectId: string,
  files: Record<string, FileNode>
): void {
  debouncedWrite(`project-${projectId}`, () => writeProjectFiles(projectId, files), 1000);
}

/**
 * Reads project files back into a FileNode tree.
 * Uses the saved ._krypton_tree.json for internal structure.
 */
export async function readProjectFiles(projectId: string): Promise<Record<string, FileNode> | null> {
  const base = getBasePath();
  if (!base) return null;

  const projectDir = `${base}/projects/${projectId}`;

  if (!isNative()) {
    const raw = webRead(`${projectDir}/files.json`);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) {
      console.error('[FS] Corrupt project files (web):', e);
      return null;
    }
  }

  // Try reading the internal tree structure
  const treeRaw = await readTextFile(`${projectDir}/._krypton_tree.json`);
  if (treeRaw) {
    try {
      const tree = JSON.parse(treeRaw) as Record<string, FileNode>;
      const missingNodeIds = new Set<string>();

      // Re-read actual file contents from disk (source of truth)
      for (const [nodeId, node] of Object.entries(tree)) {
        if (nodeId === 'root' || node.type !== 'file') continue;

        const pathMap = new Map<string, string>();
        function buildPath(nId: string): string {
          if (pathMap.has(nId)) return pathMap.get(nId)!;
          const n = tree[nId];
          if (!n) return '';
          if (nId === 'root' || !n.parentId) { pathMap.set(nId, ''); return ''; }
          const pp = buildPath(n.parentId);
          const fp = pp ? `${pp}/${n.name}` : n.name;
          pathMap.set(nId, fp);
          return fp;
        }

        const relativePath = buildPath(nodeId);
        const content = await readTextFile(`${projectDir}/${relativePath}`);
        if (content !== null) {
          tree[nodeId] = { ...node, content };
        } else {
          missingNodeIds.add(nodeId);
        }
      }

      // Prune missing nodes
      missingNodeIds.forEach(id => {
        const node = tree[id];
        if (node.parentId && tree[node.parentId]) {
          tree[node.parentId].children = tree[node.parentId].children?.filter(c => c !== id) || [];
        }
        delete tree[id];
      });

      return tree;
    } catch { /* fall through to scan */ }
  }

  // Fallback: scan directory and build tree from scratch
  return await scanDirectoryToTree(projectDir);
}

/**
 * Scan a directory and build a FileNode tree from raw files.
 */
async function scanDirectoryToTree(dirPath: string): Promise<Record<string, FileNode> | null> {
  if (!isNative()) return null;

  const root: FileNode = {
    id: 'root',
    name: 'Project', // Cannot set real name here without passing it correctly, we fix this in loadFromDisk
    type: 'folder',
    parentId: null,
    children: [],
  };

  const tree: Record<string, FileNode> = { root };
  const generateId = () => Math.random().toString(36).substring(2, 9);

  async function scanDir(path: string, parentId: string) {
    const entries = await listDir(path);
    for (const entry of entries) {
      // Skip internal files and subfolders
      if (entry.name.startsWith('._krypton') || entry.name === 'project.meta.json' || entry.name === 'ai-sessions') continue;

      const id = generateId();

      if (entry.type === 'directory') {
        tree[id] = {
          id,
          name: entry.name,
          type: 'folder',
          parentId,
          children: [],
        };
        tree[parentId].children!.push(id);
        await scanDir(`${path}/${entry.name}`, id);
      } else {
        const content = await readTextFile(`${path}/${entry.name}`);
        tree[id] = {
          id,
          name: entry.name,
          type: 'file',
          content: content || '',
          parentId,
          language: getLanguageFromFilename(entry.name),
        };
        tree[parentId].children!.push(id);
      }
    }
  }

  await scanDir(dirPath, 'root');
  return Object.keys(tree).length > 1 ? tree : null;
}

export async function deleteProjectFolder(projectId: string): Promise<void> {
  const base = getBasePath();
  if (!base) return;

  const dir = `${base}/projects/${projectId}`;

  if (!isNative()) {
    // Remove all webRead keys with this prefix
    const keys = webList(`${dir}/`);
    keys.forEach(k => webDelete(k));
    webDelete(`${dir}/project.meta.json`);
    webDelete(`${dir}/files.json`);
    return;
  }

  await deletePathSafe(dir);
}

// ─── Fonts ───────────────────────────────────────────────────

export async function saveFontFile(fileName: string, base64Data: string): Promise<void> {
  const base = getBasePath();
  if (!base) return;

  if (!isNative()) {
    webWrite(`${base}/fonts/${fileName}`, base64Data);
    return;
  }

  await mkdirSafe(`${base}/fonts`);
  // base64Data is a data URL, write it as-is for later @font-face usage
  await writeTextFile(`${base}/fonts/${fileName}.b64`, base64Data);
}

export async function readFontFile(fileName: string): Promise<string | null> {
  const base = getBasePath();
  if (!base) return null;

  if (!isNative()) {
    return webRead(`${base}/fonts/${fileName}`);
  }

  return await readTextFile(`${base}/fonts/${fileName}.b64`);
}

export async function deleteFontFile(fileName: string): Promise<void> {
  const base = getBasePath();
  if (!base) return;

  if (!isNative()) {
    webDelete(`${base}/fonts/${fileName}`);
    return;
  }

  try {
    await Filesystem.deleteFile({ path: `${base}/fonts/${fileName}.b64`, directory: defaultDir() });
  } catch { /* already gone */ }
}

export async function listFonts(): Promise<string[]> {
  const base = getBasePath();
  if (!base) return [];

  if (!isNative()) {
    const keys = webList(`${base}/fonts/`);
    return keys.map(k => {
      const parts = k.split('/');
      return parts[parts.length - 1];
    });
  }

  const entries = await listDir(`${base}/fonts`);
  return entries
    .filter(e => e.name.endsWith('.b64'))
    .map(e => e.name.replace('.b64', ''));
}

// ─── Migration from localStorage ─────────────────────────────

export async function migrateFromLocalStorage(): Promise<void> {
  const base = getBasePath();
  if (!base) return;

  // Check if already migrated
  const migrated = localStorage.getItem('krypton-migrated-to-fs');
  if (migrated === 'true') return;

  console.log('[FS] Starting migration from localStorage...');

  try {
    // 1. Migrate config
    const config: KryptonConfig = { ...DEFAULT_CONFIG };
    config.welcomed = localStorage.getItem('krypton-welcomed') === 'true';
    config.haptics = localStorage.getItem('krypton-haptics') !== 'false';

    // AI config
    config.ai.provider = localStorage.getItem('krypton-ai-provider') || '';
    config.ai.model = localStorage.getItem('krypton-ai-model') || '';
    config.ai.activeSessionId = localStorage.getItem('krypton-active-session') || null;

    // Font
    const fontName = localStorage.getItem('krypton-custom-font-name');
    const fontData = localStorage.getItem('krypton-custom-font-data');
    if (fontName && fontData) {
      config.activeFont = fontName;
      config.installedFonts = [fontName];
      await saveFontFile(fontName, fontData);
    }

    await saveConfigNow(config);

    // 2. Migrate API key
    const apiKey = localStorage.getItem('krypton-ai-apiKey') || '';
    if (apiKey) {
      await saveApiKey(apiKey);
    }

    // 3. Migrate projects
    const projectsRaw = localStorage.getItem('krypton-projects-storage');
    if (projectsRaw) {
      try {
        const parsed = JSON.parse(projectsRaw);
        const projectsState = parsed.state || parsed;
        const projectsMap = projectsState.projects || {};

        for (const [id, project] of Object.entries(projectsMap) as [string, any][]) {
          const meta: ProjectMeta = {
            id: project.id,
            name: project.name,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            template: project.template,
          };
          await saveProjectMeta(meta);
          await writeProjectFiles(project.id, project.files);
        }
      } catch (e) {
        console.error('[FS] Failed to migrate projects:', e);
      }
    }

    // 4. Migrate AI sessions
    const sessionsRaw = localStorage.getItem('krypton-ai-sessions-v2');
    if (sessionsRaw) {
      try {
        const sessions = JSON.parse(sessionsRaw);
        for (const session of sessions) {
          await saveSession(session);
        }
      } catch (e) {
        console.error('[FS] Failed to migrate AI sessions:', e);
      }
    }

    // 5. Migrate auth
    const authRaw = localStorage.getItem('krypton-auth-storage');
    if (authRaw) {
      try {
        const parsed = JSON.parse(authRaw);
        const authState = parsed.state || parsed;
        await saveAuth({
          githubToken: authState.githubToken,
          githubUser: authState.githubUser,
          githubRepoLink: authState.githubRepoLink,
          googleUser: authState.googleUser,
        });
      } catch (e) {
        console.error('[FS] Failed to migrate auth:', e);
      }
    }

    // 6. Migrate extensions
    const extRaw = localStorage.getItem('krypton-extensions-storage');
    if (extRaw) {
      try {
        const parsed = JSON.parse(extRaw);
        const extState = parsed.state || parsed;
        await saveExtensions({
          installedExtensions: extState.installedExtensions || [],
          activeThemeExtension: extState.activeThemeExtension || null,
        });
      } catch (e) {
        console.error('[FS] Failed to migrate extensions:', e);
      }
    }

    // Mark as migrated
    localStorage.setItem('krypton-migrated-to-fs', 'true');
    console.log('[FS] Migration complete!');

  } catch (e) {
    console.error('[FS] Migration error:', e);
  }
}

// ─── Get project base path for AI tool actions ───────────────

export function getProjectPath(projectId: string): string {
  return `${getBasePath()}/projects/${projectId}`;
}

// ─── MCP Storage ──────────────────────────────────────────────
export interface McpServerConfig {
  id: string;
  name: string;
  type: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
  enabled: boolean;
}

export async function readMcpConfig(): Promise<McpServerConfig[] | null> {
  const base = getBasePath();

  if (!isNative()) {
    const raw = (base ? webRead(`${base}/mcp.json`) : null) || webRead('mcp.json');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  // 1. Check Directory.Data
  let raw = await readTextFile('mcp.json', Directory.Data);
  // 2. Migration: check external storage
  if (!raw && base) {
    raw = await readTextFile(`${base}/mcp.json`, Directory.ExternalStorage);
    if (raw) {
      await writeTextFile('mcp.json', raw, Directory.Data);
      await deletePathSafe(`${base}/mcp.json`, Directory.ExternalStorage);
    }
  }
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function saveMcpConfig(configs: McpServerConfig[]): Promise<void> {
  const data = JSON.stringify(configs, null, 2);
  if (!isNative()) {
    const base = getBasePath();
    if (base) webWrite(`${base}/mcp.json`, data);
    webWrite('mcp.json', data);
    return;
  }
  await writeTextFile('mcp.json', data, Directory.Data);
}

// ─── System Prompts Storage ────────────────────────────────────
export async function readSystemPrompt(projectId?: string): Promise<string> {
  const base = getBasePath();
  if (!base) return '';
  const path = projectId ? `${base}/.krypton/${projectId}/system_prompt.md` : `${base}/.krypton/global_system_prompt.md`;

  if (!isNative()) {
    return webRead(path) || '';
  }
  return (await readTextFile(path)) || '';
}

export async function saveSystemPrompt(prompt: string, projectId?: string): Promise<void> {
  const base = getBasePath();
  if (!base) return;
  const folder = projectId ? `${base}/.krypton/${projectId}` : `${base}/.krypton`;
  const path = projectId ? `${folder}/system_prompt.md` : `${base}/.krypton/global_system_prompt.md`;

  if (isNative()) {
    await mkdirSafe(folder);
    await writeTextFile(path, prompt);
  } else {
    webWrite(path, prompt);
  }
}

// ─── Skills Disk Helpers ──────────────────────────────────────
export interface DiskSkill {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
}

export async function readDiskSkills(): Promise<DiskSkill[]> {
  const base = getBasePath();
  if (!base) return [];

  const skillsList: DiskSkill[] = [];

  if (!isNative()) {
    const keys = webList(`${base}/skills/`);
    const skillFolders = new Set<string>();
    keys.forEach(k => {
      const parts = k.replace(`${base}/skills/`, '').split('/');
      if (parts[0]) skillFolders.add(parts[0]);
    });

    for (const folder of skillFolders) {
      let content = webRead(`${base}/skills/${folder}/SKILL.md`);
      if (!content && folder.endsWith('.md')) {
        content = webRead(`${base}/skills/${folder}`);
      }
      if (content) {
        const nameMatch = content.match(/^name:\s*(.+)$/m);
        const descMatch = content.match(/^description:\s*(.+)$/m);
        const cleanId = folder.replace(/\.md$/i, '');
        skillsList.push({
          id: cleanId,
          name: nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, '') : cleanId,
          description: descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, '') : 'User skill',
          content,
          enabled: true,
        });
      }
    }
    return skillsList;
  }

  try {
    const files = await listDir(`${base}/skills`);
    for (const fileObj of files) {
      const entryName = typeof fileObj === 'string' ? fileObj : fileObj.name;
      if (!entryName) continue;
      let content: string | null = null;
      let skillId = entryName;
      if (entryName.endsWith('.md')) {
        content = await readTextFile(`${base}/skills/${entryName}`);
        skillId = entryName.replace(/\.md$/i, '');
      } else {
        content = await readTextFile(`${base}/skills/${entryName}/SKILL.md`);
      }
      if (content) {
        const nameMatch = content.match(/^name:\s*(.+)$/m);
        const descMatch = content.match(/^description:\s*(.+)$/m);
        skillsList.push({
          id: skillId,
          name: nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, '') : skillId,
          description: descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, '') : 'User skill',
          content,
          enabled: true,
        });
      }
    }
  } catch (e) {
    console.warn('[FS] Error reading skills directory:', e);
  }

  return skillsList;
}

export async function writeDiskSkill(id: string, name: string, description: string, body: string): Promise<void> {
  const base = getBasePath();
  if (!base) return;
  const folder = `${base}/skills/${id}`;
  const skillFile = `${folder}/SKILL.md`;
  const fullContent = `---\nname: "${name}"\ndescription: "${description}"\n---\n\n${body}`;

  if (isNative()) {
    await mkdirSafe(folder);
    await writeTextFile(skillFile, fullContent);
  } else {
    webWrite(skillFile, fullContent);
  }
}


export function getProjectDirectory(): Directory {
  return defaultDir();
}
