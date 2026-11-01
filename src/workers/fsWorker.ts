import * as Comlink from 'comlink';
import {
  getProjectDirectory,
  readOpfsFile,
  writeOpfsFile,
  deleteOpfsFile,
  listOpfsFiles,
  type OPFSFileEntry,
} from '../lib/opfsStorage';

export interface WatcherEvent {
  type: 'file-changed' | 'file-deleted';
  projectId: string;
  path: string;
  content?: string;
  lastModified?: number;
}

type EventListener = (event: WatcherEvent) => void;

export class FSWorkerImpl {
  private activeProjectId: string | null = null;
  private pollIntervalId: any = null;
  private listeners: EventListener[] = [];
  private fileSnapshot: Record<string, { lastModified: number; size: number }> = {};
  private suppressedPaths: Set<string> = new Set();
  private pendingFlushes: Set<string> = new Set();

  addListener(listener: EventListener) {
    this.listeners.push(listener);
  }

  removeListener(listener: EventListener) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  private notifyListeners(event: WatcherEvent) {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch (e) {
        console.error('[FSWorker] Listener error:', e);
      }
    }
  }

  async readFile(projectId: string, path: string): Promise<string> {
    const dir = await getProjectDirectory(projectId, false);
    return await readOpfsFile(dir, path);
  }

  async writeFile(
    projectId: string,
    path: string,
    content: string,
    fromUser = true
  ): Promise<number> {
    const dir = await getProjectDirectory(projectId, true);
    if (fromUser) {
      this.suppressedPaths.add(path);
    }

    const lastModified = await writeOpfsFile(dir, path, content);
    this.fileSnapshot[path] = { lastModified, size: content.length };
    this.pendingFlushes.add(`${projectId}:${path}`);

    return lastModified;
  }

  async deleteFile(projectId: string, path: string): Promise<void> {
    const dir = await getProjectDirectory(projectId, false);
    await deleteOpfsFile(dir, path);
    delete this.fileSnapshot[path];
    this.pendingFlushes.delete(`${projectId}:${path}`);
  }

  async listFiles(projectId: string): Promise<OPFSFileEntry[]> {
    const dir = await getProjectDirectory(projectId, true);
    return await listOpfsFiles(dir);
  }

  startWatcher(projectId: string) {
    this.stopWatcher();
    this.activeProjectId = projectId;

    // Snapshot current state
    this.listFiles(projectId).then((entries) => {
      this.fileSnapshot = {};
      for (const entry of entries) {
        if (entry.kind === 'file') {
          this.fileSnapshot[entry.path] = {
            lastModified: entry.lastModified || 0,
            size: entry.size || 0,
          };
        }
      }
    });

    // Poll every 400ms (matching Kotlin FileWatcherService.kt)
    this.pollIntervalId = setInterval(async () => {
      if (!this.activeProjectId) return;
      try {
        const entries = await this.listFiles(this.activeProjectId);
        const currentPaths = new Set<string>();

        for (const entry of entries) {
          if (entry.kind !== 'file') continue;
          currentPaths.add(entry.path);

          if (this.suppressedPaths.has(entry.path)) {
            this.suppressedPaths.delete(entry.path);
            continue;
          }

          const snap = this.fileSnapshot[entry.path];
          const currentModified = entry.lastModified || 0;
          const currentSize = entry.size || 0;

          if (!snap || snap.lastModified !== currentModified || snap.size !== currentSize) {
            this.fileSnapshot[entry.path] = { lastModified: currentModified, size: currentSize };
            const content = await this.readFile(this.activeProjectId, entry.path);
            this.notifyListeners({
              type: 'file-changed',
              projectId: this.activeProjectId,
              path: entry.path,
              content,
              lastModified: currentModified,
            });
          }
        }

        // Check for deleted files
        for (const oldPath of Object.keys(this.fileSnapshot)) {
          if (!currentPaths.has(oldPath)) {
            delete this.fileSnapshot[oldPath];
            this.notifyListeners({
              type: 'file-deleted',
              projectId: this.activeProjectId,
              path: oldPath,
            });
          }
        }
      } catch (err) {
        console.error('[FSWorker] Poll error:', err);
      }
    }, 400);
  }

  stopWatcher() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
    this.activeProjectId = null;
    this.suppressedPaths.clear();
  }
}

const fsWorker = new FSWorkerImpl();
Comlink.expose(fsWorker);
