import { Filesystem, Encoding } from '@capacitor/filesystem';
import { useIdeStore } from '../../store/useIdeStore';
import { useProjectsStore } from '../../store/useProjectsStore';
import { getBasePath, getProjectPath, defaultDir } from '../fileSystemStorage';
import { Capacitor } from '@capacitor/core';
import { LayaSystem1 } from '../pocket/LayaSystem1';

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

  // Fallback: basename matching (for backwards compatibility)
  const fileName = path.split('/').pop() || path;
  const fallbackId = Object.entries(state.files).find(([_, f]) => {
    return f.type === 'file' && f.name === fileName;
  })?.[0];

  if (fallbackId) {
    state.updateFileContent(fallbackId, newContent);
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
    // Last resort: try IDE store by basename as a final fallback
    const fileName = path.split('/').pop() || path;
    const state = useIdeStore.getState();
    const fallbackEntry = Object.entries(state.files).find(([_, f]) =>
      f.type === 'file' && f.name === fileName
    );
    if (fallbackEntry) {
      const [, file] = fallbackEntry;
      const content = file.content || '';
      const lines = content.split('\n');
      const start = startLine ? Math.max(1, startLine) : 1;
      const end = endLine ? Math.min(lines.length, endLine) : lines.length;
      const numbered = lines
        .slice(start - 1, end)
        .map((line, i) => `${start + i}: ${line}`)
        .join('\n');
      return `File: ${path} (${lines.length} lines total, showing ${start}-${end})\n${numbered}`;
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
      return `Error: start_line ${startLine} is out of range (file has ${lines.length} lines)`;
    }
    if (endLine < startLine) {
      return `Error: end_line ${endLine} cannot be less than start_line ${startLine}`;
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
        // Re-read state after mutation
        const freshState = useIdeStore.getState();
        Object.assign(state, { files: freshState.files });
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

