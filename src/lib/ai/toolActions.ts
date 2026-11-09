import { Filesystem, Encoding } from '@capacitor/filesystem';
import { useIdeStore } from '../../store/useIdeStore';
import { useProjectsStore } from '../../store/useProjectsStore';
import { getBasePath, getProjectPath, defaultDir } from '../fileSystemStorage';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { LayaSystem1 } from '../pocket/LayaSystem1';
import { requestPreviewBridge } from '../preview/previewBridge';

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Get the filesystem base path for the current project.
 * On native, files live under: KryptonIDE/projects/<projectId>/
 * On web, we operate purely against the IDE store (in-memory).
 */
function getProjectBasePath(): string {
  try {
    const projectId = useProjectsStore.getState().currentProjectId;
    if (projectId && getBasePath()) {
      return getProjectPath(projectId);
    }
  } catch (e) {
    console.warn('[ToolActions] Could not resolve project base path:', e);
  }
  return '';
}

/**
 * Resolve the full filesystem path from a project-relative path.
 * AI provides paths like "src/App.tsx", we need "KryptonIDE/projects/<projectId>/src/App.tsx"
 */
export function resolveFullPath(relativePath: string): string {
  // Strip leading ./ or / and normalize separators
  const cleaned = relativePath.replace(/\\/g, '/').replace(/^\.?\//, '');
  const segments = cleaned.split('/').filter(Boolean);
  const safeSegments: string[] = [];

  for (const seg of segments) {
    if (seg === '.') continue;
    if (seg === '..') {
      throw new Error("Access Denied: Path traversal ('..') is prohibited.");
    }
    safeSegments.push(seg);
  }

  const safePath = safeSegments.join('/');

  if (!Capacitor.isNativePlatform()) {
    // On web, just return safePath — FS operations go through web fallback
    return safePath;
  }

  const basePath = getProjectBasePath();
  if (basePath) {
    const fullPath = `${basePath}/${safePath}`;
    if (!fullPath.startsWith(basePath)) {
      throw new Error("Access Denied: Path traversal ('..') is prohibited.");
    }
    return fullPath;
  }

  // Fallback: use path as-is (legacy behavior)
  return safePath;
}

/**
 * Walk the IDE store's file tree to find a node by its full relative path.
 * Returns the node ID if found, or null.
 * This is the correct way to match — NOT by basename only.
 */
function findFileIdByPath(relativePath: string): string | null {
  const state = useIdeStore.getState();
  const { files } = state;

  // Strip leading ./ or / and normalize separators
  const cleaned = relativePath.replace(/\\/g, '/').replace(/^\.?\//, '');
  const segments = cleaned.split('/').filter(Boolean);

  if (segments.some(seg => seg === '..')) {
    throw new Error("Access Denied: Path traversal ('..') is prohibited.");
  }

  if (segments.length === 0) return null;

  // Walk the tree from root
  let currentId = 'root';

  for (const segment of segments) {
    const currentNode = files[currentId];
    if (!currentNode?.children) return null;

    const childId = currentNode.children.find(cid => {
      const child = files[cid];
      return child && child.name === segment;
    });

    if (!childId) return null;
    currentId = childId;
  }

  return currentId;
}

/**
 * Sync file content with the IDE store after any write operation.
 * Uses full path-based matching instead of basename-only.
 */
function syncWithIdeStore(path: string, newContent: string) {
  const state = useIdeStore.getState();

  // First try: full path matching (correct)
  const fileId = findFileIdByPath(path);
  if (fileId) {
    state.updateFileContent(fileId, newContent);
    return;
  }

}

// ─── read_file ───────────────────────────────────────────────

/**
 * Reads a file and returns its content with line numbers prepended.
 * Supports optional line range for partial reads.
 *
 * First tries reading from the IDE store (in-memory, always up-to-date).
 * Falls back to the filesystem for files not in the store.
 */
export async function CapacitorFilesystemRead(
  path: string,
  startLine?: number,
  endLine?: number
): Promise<string> {
  try {
    // Validate path traversal and resolve full path
    const fullPath = resolveFullPath(path);
    // Clean the path
    const cleaned = path.replace(/\\/g, '/').replace(/^\.?\//, '');

    // Strategy 1: Read from IDE store (in-memory, always fresh)
    const fileId = findFileIdByPath(cleaned);
    if (fileId) {
      const file = useIdeStore.getState().files[fileId];
      if (file && file.type === 'file' && file.content !== undefined) {
        const content = file.content;
        const lines = content.split('\n');

        const start = startLine ? Math.max(1, startLine) : 1;
        const end = endLine ? Math.min(lines.length, endLine) : lines.length;

        const numbered = lines
          .slice(start - 1, end)
          .map((line, i) => `${start + i}: ${line}`)
          .join('\n');

        const header = `File: ${cleaned} (${lines.length} lines total, showing ${start}-${end})`;
        return `${header}\n${numbered}`;
      }
    }

    // Strategy 2: Read from disk (filesystem)
    const result = await Filesystem.readFile({
      path: fullPath,
      directory: defaultDir(),
      encoding: Encoding.UTF8,
    });
    const content = typeof result.data === 'string' ? result.data : '';
    const lines = content.split('\n');

    // Apply line range if specified
    const start = startLine ? Math.max(1, startLine) : 1;
    const end = endLine ? Math.min(lines.length, endLine) : lines.length;

    // Prepend line numbers for context
    const numbered = lines
      .slice(start - 1, end)
      .map((line, i) => `${start + i}: ${line}`)
      .join('\n');

    const header = `File: ${cleaned} (${lines.length} lines total, showing ${start}-${end})`;
    return `${header}\n${numbered}`;
  } catch (error: any) {
    if (error.message?.includes('Access Denied')) {
      throw error;
    }
    console.error('Filesystem Read Error:', error);
    throw new Error(`Could not read file at ${path}: ${error.message}`);
  }
}

/** Internal: read raw content without line numbers (for edit operations) */
async function readRawContent(path: string): Promise<string> {
  const fullPath = resolveFullPath(path);
  const cleaned = path.replace(/\\/g, '/').replace(/^\.?\//, '');

  // Try IDE store first (in-memory)
  const fileId = findFileIdByPath(cleaned);
  if (fileId) {
    const file = useIdeStore.getState().files[fileId];
    if (file && file.type === 'file' && file.content !== undefined) {
      return file.content;
    }
  }

  // Fallback to disk
  const result = await Filesystem.readFile({
    path: fullPath,
    directory: defaultDir(),
    encoding: Encoding.UTF8,
  });
  return typeof result.data === 'string' ? result.data : '';
}

/** Internal: write content to disk, auto-creating parent directories */
async function writeContent(path: string, content: string): Promise<void> {
  const fullPath = resolveFullPath(path);

  // Ensure parent directories exist on disk
  const lastSlash = fullPath.lastIndexOf('/');
  if (lastSlash > 0) {
    const parentDir = fullPath.substring(0, lastSlash);
    try {
      await Filesystem.mkdir({
        path: parentDir,
        directory: defaultDir(),
        recursive: true,
      });
    } catch (e: any) {
      // Directory already exists — safe to ignore
      if (!e.message?.includes('exists')) {
        console.warn('[FS] mkdir warning:', e.message);
      }
    }
  }
  await Filesystem.writeFile({
    path: fullPath,
    data: content,
    directory: defaultDir(),
    encoding: Encoding.UTF8,
  });
}

// ─── edit_lines ──────────────────────────────────────────────

/**
 * Replaces a specific range of lines in a file.
 * Line numbers are 1-indexed and inclusive on both ends.
 */
export async function CapacitorFilesystemEditLines(
  path: string,
  startLine: number,
  endLine: number,
  newContent: string
): Promise<string> {
  try {
    const content = await readRawContent(path);
    const lines = content.split('\n');

    // Validate range
    if (startLine < 1 || startLine > lines.length) {
      throw new Error(`start_line ${startLine} is out of range (file has ${lines.length} lines)`);
    }
    if (endLine < startLine) {
      throw new Error(`end_line ${endLine} cannot be less than start_line ${startLine}`);
    }
    if (endLine > lines.length) {
      endLine = lines.length; // Clamp to file length
    }

    // Split new content into lines (handle empty string = deletion)
    const newLines = newContent === '' ? [] : newContent.split('\n');

    // Splice: remove old lines, insert new ones
    const before = lines.slice(0, startLine - 1);
    const after = lines.slice(endLine);
    const result = [...before, ...newLines, ...after];

    const newFileContent = result.join('\n');
    await writeContent(path, newFileContent);
    syncWithIdeStore(path, newFileContent);

    const removedCount = endLine - startLine + 1;
    const insertedCount = newLines.length;
    return `Success: Replaced lines ${startLine}-${endLine} (${removedCount} lines removed, ${insertedCount} lines inserted). File now has ${result.length} lines.`;
  } catch (error: any) {
    throw new Error(`Could not edit lines in ${path}: ${error.message}`);
  }
}

// ─── insert_lines ────────────────────────────────────────────

/**
 * Inserts new lines BEFORE the specified line number.
 * Does not remove any existing content.
 */
export async function CapacitorFilesystemInsertLines(
  path: string,
  atLine: number,
  content: string
): Promise<string> {
  try {
    const fileContent = await readRawContent(path);
    const lines = fileContent.split('\n');

    const newLines = content.split('\n');
    const insertIdx = Math.min(Math.max(atLine - 1, 0), lines.length);

    lines.splice(insertIdx, 0, ...newLines);

    const newFileContent = lines.join('\n');
    await writeContent(path, newFileContent);
    syncWithIdeStore(path, newFileContent);

    return `Success: Inserted ${newLines.length} lines at line ${atLine}. File now has ${lines.length} lines.`;
  } catch (error: any) {
    throw new Error(`Could not insert lines in ${path}: ${error.message}`);
  }
}

// ─── patch_file ──────────────────────────────────────────────

/**
 * Patches a file by replacing a search string with a replacement string.
 */
export async function CapacitorFilesystemPatch(
  path: string,
  searchString: string,
  replaceString: string
): Promise<boolean> {
  try {
    const content = await readRawContent(path);

    if (!content.includes(searchString)) {
      console.warn(`Patch failed: Search string not found in ${path}`);
      return false;
    }

    const newContent = content.replace(searchString, replaceString);
    await writeContent(path, newContent);
    syncWithIdeStore(path, newContent);

    return true;
  } catch (error: any) {
    console.error('Filesystem Patch Error:', error);
    throw new Error(`Could not patch file at ${path}: ${error.message}`);
  }
}

// ─── create_directory ────────────────────────────────────────

export async function CapacitorFilesystemMkdir(path: string, options: { recursive: boolean }): Promise<void> {
  try {
    const fullPath = resolveFullPath(path);
    await Filesystem.mkdir({
      path: fullPath,
      directory: defaultDir(),
      recursive: options.recursive,
    });
  } catch (error: any) {
    if (error.message.includes('exists')) return;
    throw new Error(`Could not create directory at ${path}: ${error.message}`);
  }
}

export async function listDirectory(subPath?: string): Promise<Array<{ name: string; type: string; path: string }>> {
  const cleaned = (subPath || '').replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/, '');
  const targetId = cleaned ? findFileIdByPath(cleaned) : 'root';
  if (!targetId) {
    throw new Error(`Directory not found: ${subPath}`);
  }

  const files = useIdeStore.getState().files;
  const node = files[targetId];
  if (!node) {
    throw new Error(`Directory not found: ${subPath}`);
  }
  if (node.type !== 'folder') {
    throw new Error(`Not a directory: ${subPath}`);
  }

  return (node.children || [])
    .map((childId) => files[childId])
    .filter((child): child is NonNullable<typeof child> => Boolean(child))
    .map((child) => ({
      name: child.name,
      type: child.type,
      path: cleaned ? `${cleaned}/${child.name}` : child.name,
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

// ─── write_new_file ──────────────────────────────────────────

export async function CapacitorFilesystemWrite(path: string, content: string): Promise<void> {
  try {
    await writeContent(path, content);

    const state = useIdeStore.getState();
    const cleaned = path.replace(/^\.?\//, '');
    const segments = cleaned.split('/').filter(Boolean);
    const fileName = segments.pop()!;

    // Walk/create folder hierarchy in the IDE store
    let currentParentId: string = 'root';
    for (const folderName of segments) {
      // Check if this folder already exists under currentParentId
      const parentNode = state.files[currentParentId];
      const existingFolderId = parentNode?.children?.find(cid => {
        const child = state.files[cid];
        return child && child.name === folderName && child.type === 'folder';
      });

      if (existingFolderId) {
        currentParentId = existingFolderId;
      } else {
        // Create the intermediate folder in the store
        const newFolderId = state.createFile(folderName, currentParentId, 'folder');
        currentParentId = newFolderId;
      }
    }

    // Now create or update the file under the correct parent
    const parentNode = useIdeStore.getState().files[currentParentId];
    const existingFileId = parentNode?.children?.find(cid => {
      const child = useIdeStore.getState().files[cid];
      return child && child.name === fileName && child.type === 'file';
    });

    if (existingFileId) {
      useIdeStore.getState().updateFileContent(existingFileId, content);
    } else {
      useIdeStore.getState().createFile(fileName, currentParentId, 'file', content);
    }
  } catch (error: any) {
    throw new Error(`Could not write file at ${path}: ${error.message}`);
  }
}

/**
 * Execute a real terminal command inside the project root directory using the native Linux PTY.
 * Respects the 3 permission tiers (Supervised, Autonomous, Unbound).
 */
export async function executeTerminalCommand(
  command: string,
  timeoutMs: number = 60000
): Promise<{ stdout: string; stderr: string; exitCode: number; command?: string }> {
  try {
    const { useHarnessStore } = await import('../../store/useHarnessStore');
    const { useNativeTerminalStore } = await import('../../store/useNativeTerminalStore');

    const harnessState = useHarnessStore.getState();
    const executionMode = harnessState.executionMode;

    // Real-time command risk assessment via Laya System 1
    const risk = LayaSystem1.assessCommandRisk(command, executionMode);
    if (risk.riskLevel === 'high' && executionMode !== 'unbound') {
      throw new Error(
        `Security Block: ${risk.reason}. Destructive command blocked by safety guardrails. Switch to "Unbound Mode" in Terminal Settings to execute without restrictions.`
      );
    }

    if (risk.requiresConfirmation && executionMode === 'supervised') {
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        const approved = window.confirm(
          `[Oorty Lite Terminal Supervision]\n\nCommand: ${command}\nRisk Assessment: ${risk.reason}\n\nDo you want to authorize execution?`
        );
        if (!approved) {
          throw new Error(`Command cancelled by user in Supervised mode: "${command}"`);
        }
      }
    }

    const termStore = useNativeTerminalStore.getState();
    const session = termStore.sessions.project;
    if (!session.running) {
      await termStore.initSession('project');
    }

    return new Promise((resolve) => {
      let outputBuffer = '';
      const nonce = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2);
      const startTag = `__KRYPTON_START_${nonce}__`;
      const endTagPrefix = `__KRYPTON_EXIT_${nonce}_`;
      const exitRegex = new RegExp(`__KRYPTON_EXIT_${nonce}_(\\d+)__`);

      let resolved = false;
      let timer: any = null;

      const cleanup = termStore.subscribeOutput('project', (chunk: string) => {
        outputBuffer += chunk;

        // Detect exit tag
        const exitMatch = outputBuffer.match(exitRegex);
        if (exitMatch && !resolved) {
          resolved = true;
          if (timer) clearTimeout(timer);
          cleanup();

          const exitCode = parseInt(exitMatch[1], 10);
          let cleanOutput = outputBuffer;
          if (cleanOutput.includes(startTag)) {
            cleanOutput = cleanOutput.split(startTag)[1] || cleanOutput;
          }
          cleanOutput = cleanOutput.replace(new RegExp(`__KRYPTON_EXIT_${nonce}_\\d+__[\\r\\n]*`), '');
          // Surgical token pruning & ANSI stripping via Laya System 1
          cleanOutput = LayaSystem1.pruneCompilerLog(cleanOutput);

          resolve({
            stdout: cleanOutput,
            stderr: exitCode !== 0 ? cleanOutput : '',
            exitCode,
            command,
          });
        }
      });

      timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({
            stdout: LayaSystem1.pruneCompilerLog(outputBuffer),
            stderr: `Command timed out after ${timeoutMs}ms`,
            exitCode: 124,
            command,
          });
        }
      }, timeoutMs);

      // Execute wrapped shell command with nonce sentinels
      const wrappedCommand = `echo "${startTag}"; ${command}; echo "${endTagPrefix}$?__"\n`;
      termStore.sendInput(wrappedCommand, 'project');
    });
  } catch (err: any) {
    return {
      stdout: '',
      stderr: err.message || 'Execution error',
      exitCode: 1,
      command,
    };
  }
}



// ─── 7. Web Surfing & Live Documentation ─────────────────────

async function httpGetText(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const nativeRes = await CapacitorHttp.get({
      url,
      headers,
      responseType: 'text',
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
    });
    if (nativeRes.status < 200 || nativeRes.status >= 300) {
      throw new Error(`HTTP ${nativeRes.status}`);
    }
    return typeof nativeRes.data === 'string' ? nativeRes.data : JSON.stringify(nativeRes.data);
  }

  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return res.text();
}

/**
 * Searches the web for technical documentation, libraries, and error resolutions.
 */
export async function searchWeb(
  query: string,
  domain?: string
): Promise<{
  query: string;
  results: Array<{ title: string; url: string; snippet: string }>;
  source: string;
}> {
  const effectiveQuery = domain ? `${query} site:${domain}` : query;
  const results: Array<{ title: string; url: string; snippet: string }> = [];

  try {
    // 1. DuckDuckGo Instant Answer API (JSON)
    const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(effectiveQuery)}&format=json&no_html=1&skip_disambig=1`;

    {
      const data = JSON.parse(await httpGetText(apiUrl, { Accept: 'application/json' }, 8000));
      if (data.AbstractText) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL || '',
          snippet: data.AbstractText,
        });
      }
      if (Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics.slice(0, 5)) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 50),
              url: topic.FirstURL,
              snippet: topic.Text,
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[searchWeb] DuckDuckGo API error, attempting HTML search:', err);
  }

  // 2. Fallback: DuckDuckGo HTML Lite scraping if API returns few results
  if (results.length === 0) {
    try {
      const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(effectiveQuery)}`;
      const text = await httpGetText(
        htmlUrl,
        { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        8000
      );
      const linkRegex = /<a class="result__url" href="([^"]+)">([^<]+)<\/a>[\s\S]*?<a class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
      let match;
      while ((match = linkRegex.exec(text)) !== null && results.length < 5) {
        const rawUrl = match[1].trim();
        const cleanSnippet = match[3].replace(/<[^>]+>/g, '').trim();
        results.push({
          title: match[2].trim(),
          url: rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl,
          snippet: cleanSnippet,
        });
      }
    } catch (htmlErr) {
      console.warn('[searchWeb] HTML search fallback failed:', htmlErr);
    }
  }

  return {
    query: effectiveQuery,
    results,
    source: 'duckduckgo',
  };
}

/**
 * Fetches an external web page, strips scripts/styles, and converts into clean reader markdown.
 */
export async function fetchWebPage(
  url: string,
  selector?: string,
  maxLength: number = 8000
): Promise<{
  url: string;
  title: string;
  content: string;
  truncated: boolean;
}> {
  // Security guard: Validate URL protocol
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Access Denied: Protocol ${parsed.protocol} is prohibited.`);
  }
  // Cloud metadata protection
  if (parsed.hostname === '169.254.169.254' || parsed.host.includes('169.254.169.254')) {
    throw new Error('Access Denied: Cloud metadata IP is prohibited.');
  }

  const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; KryptonideOorty/4.0; +https://oorty.sednium.com)' };
  let html: string;

  if (Capacitor.isNativePlatform()) {
    const nativeRes = await CapacitorHttp.get({
      url,
      headers,
      responseType: 'text',
      connectTimeout: 12000,
      readTimeout: 12000,
    });
    if (nativeRes.status < 200 || nativeRes.status >= 300) {
      throw new Error(`Failed to fetch web page: HTTP ${nativeRes.status}`);
    }
    html = typeof nativeRes.data === 'string' ? nativeRes.data : JSON.stringify(nativeRes.data);
  } else {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch web page: HTTP ${res.status} ${res.statusText}`);
    }

    html = await res.text();
  }

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : parsed.hostname;

  // Clean HTML
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // If a CSS selector was passed and DOMParser is available
  if (selector && typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(cleaned, 'text/html');
      const el = doc.querySelector(selector);
      if (el) {
        cleaned = el.innerHTML;
      }
    } catch {}
  }

  // Convert basic HTML to readable Markdown
  let text = cleaned
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n### $1\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '\n- $1')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const truncated = text.length > maxLength;
  if (truncated) {
    text = text.slice(0, maxLength) + '\n\n... [Content truncated for context budget]';
  }

  return {
    url,
    title,
    content: text,
    truncated,
  };
}

// ─── 8. Visual UI Inspection & Region Screenshotting ────────

export interface DomNodeSnapshot {
  tag: string;
  id?: string;
  classes?: string[];
  role?: string;
  text?: string;
  rect?: { x: number; y: number; width: number; height: number };
  attributes?: Record<string, string>;
  children?: DomNodeSnapshot[];
}

/**
 * Inspects the DOM layout, semantic roles, bounding boxes, and interactive
 * elements of the active Live Preview. The preview is sandboxed, so this
 * request is handled by the injected bridge inside the iframe.
 */
export async function inspectPreviewDom(
  selector?: string,
  depth: number = 3
): Promise<{
  target: string;
  snapshot: DomNodeSnapshot | null;
  totalElements: number;
}> {
  return requestPreviewBridge('inspect', {
    selector: selector || undefined,
    depth: Math.max(1, Math.min(12, Math.floor(depth || 3))),
  });
}

/**
 * Captures a real PNG screenshot of the Live Preview, a CSS selector, a clip
 * rectangle, or the full scrollable page. Returns base64 PNG data produced by
 * the preview bridge (html-to-image inside the iframe).
 */
export async function capturePreviewScreenshot(options?: {
  selector?: string;
  clip?: { x: number; y: number; width: number; height: number };
  fullPage?: boolean;
}): Promise<{
  mimeType: string;
  base64: string;
  width: number;
  height: number;
  clip?: { x: number; y: number; width: number; height: number };
  selector?: string;
  target: string;
}> {
  const result = await requestPreviewBridge<{
    mimeType: string;
    base64: string;
    width: number;
    height: number;
    clip?: { x: number; y: number; width: number; height: number };
    selector?: string;
    target: string;
  }>('capture', { options: options || {} }, 30000);

  if (!result?.base64 || !result.base64.startsWith('data:image/png;base64,')) {
    throw new Error('Preview bridge returned no PNG data');
  }
  return result;
}

// ─── 9. Workspace Code Search (Grep & Find) ──────────────────

/**
 * Fast workspace text and regex search across all project files.
 */
export async function grepSearch(
  query: string,
  subPath?: string,
  isRegex: boolean = false,
  caseSensitive: boolean = false
): Promise<{
  query: string;
  totalMatches: number;
  filesSearched: number;
  matches: Array<{ path: string; line: number; content: string }>;
}> {
  const files = useIdeStore.getState().files;
  const matches: Array<{ path: string; line: number; content: string }> = [];
  let filesSearched = 0;

  let pattern: RegExp;
  try {
    const flags = caseSensitive ? 'g' : 'gi';
    pattern = isRegex ? new RegExp(query, flags) : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  } catch (err: any) {
    throw new Error(`Invalid regex search pattern: ${err.message}`);
  }

  const buildPathForNode = (nodeId: string): string => {
    const node = files[nodeId];
    if (!node || !node.parentId || nodeId === 'root') return '';
    const parentPath = buildPathForNode(node.parentId);
    return parentPath ? `${parentPath}/${node.name}` : node.name;
  };

  const normalizedSubPath = subPath ? subPath.replace(/^\.?\//, '') : '';

  for (const [id, node] of Object.entries(files)) {
    if (id === 'root' || node.type !== 'file' || typeof node.content !== 'string') continue;
    const fullPath = buildPathForNode(id);
    if (normalizedSubPath && !fullPath.startsWith(normalizedSubPath)) continue;

    filesSearched++;
    const lines = node.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        matches.push({
          path: fullPath,
          line: i + 1,
          content: lines[i].trim(),
        });
        pattern.lastIndex = 0; // Reset regex state
        if (matches.length >= 100) break; // Limit to 100 matches
      }
    }
    if (matches.length >= 100) break;
  }

  return {
    query,
    totalMatches: matches.length,
    filesSearched,
    matches,
  };
}

/**
 * Locates files and directories matching a glob or substring pattern across the workspace.
 */
export async function findFilesByName(
  pattern: string,
  subPath?: string
): Promise<{
  pattern: string;
  totalMatches: number;
  matches: Array<{ name: string; path: string; type: 'file' | 'folder' }>;
}> {
  const files = useIdeStore.getState().files;
  const matches: Array<{ name: string; path: string; type: 'file' | 'folder' }> = [];

  const buildPathForNode = (nodeId: string): string => {
    const node = files[nodeId];
    if (!node || !node.parentId || nodeId === 'root') return '';
    const parentPath = buildPathForNode(node.parentId);
    return parentPath ? `${parentPath}/${node.name}` : node.name;
  };

  const normalizedPattern = pattern.toLowerCase();
  const normalizedSubPath = subPath ? subPath.replace(/^\.?\//, '') : '';

  for (const [id, node] of Object.entries(files)) {
    if (id === 'root') continue;
    const fullPath = buildPathForNode(id);
    if (normalizedSubPath && !fullPath.startsWith(normalizedSubPath)) continue;

    const matchesName = node.name.toLowerCase().includes(normalizedPattern) ||
      (normalizedPattern.includes('*') && new RegExp('^' + normalizedPattern.replace(/\*/g, '.*') + '$', 'i').test(node.name));

    if (matchesName) {
      matches.push({
        name: node.name,
        path: fullPath,
        type: node.type,
      });
      if (matches.length >= 100) break;
    }
  }

  return {
    pattern,
    totalMatches: matches.length,
    matches,
  };
}
