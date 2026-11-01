/**
 * AifManager: Manages Kryptonide's persistent cognitive memory lifecycle.
 * Implements AIF V4 orbital ring persistence (Red Core INT16, Black Ring INT8, Blue Crust INT2)
 * stored directly under Kryptonide's data directory (${basePath}/aif/).
 */

import {
  getBasePath,
  readTextFile,
  writeTextFile,
  mkdirSafe,
  isNative,
  webRead,
  webWrite,
} from '../fileSystemStorage';

export interface AifBlock {
  id: string;
  summary: string;
  importance: number;
  tags: string[];
  text: string;
  timestamp: number;
  ring: 'INT16_CORE' | 'INT8_RING' | 'INT2_CRUST';
}

export interface AifMemoryState {
  version: string;
  projectId: string;
  updatedAt: number;
  core: AifBlock[];
  ring: AifBlock[];
  crust: AifBlock[];
}

export class AifManager {
  private static scratchBuffer: string = '';
  private projectId: string;
  private inMemoryBlocks: AifBlock[] = [];

  constructor(projectId: string = 'default_project') {
    this.projectId = projectId;
  }

  /**
   * Resolves the primary directory for .ai files.
   * Native Android: /storage/emulated/0/KryptonIDE/aif/
   * Desktop/Web fallback: KryptonIDE/aif/
   */
  getAifDirectory(): string {
    const base = getBasePath();
    return base ? `${base}/aif` : 'KryptonIDE/aif';
  }

  getProjectFilePath(): string {
    return `${this.getAifDirectory()}/${this.projectId}.ai`;
  }

  getBridgeFilePath(): string {
    return `${this.getAifDirectory()}/bridge_nexus.ai`;
  }

  /**
   * Arms the OS-level volatile scratch buffer before multi-file edits or subagent delegation.
   */
  writeScratch(taskSpec: string): void {
    AifManager.scratchBuffer = taskSpec;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('krypton_aif_scratch', taskSpec);
      }
    } catch {
      // Storage unavailable in test or headless env
    }
  }

  readScratch(): string {
    if (AifManager.scratchBuffer) return AifManager.scratchBuffer;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem('krypton_aif_scratch') || '';
      }
    } catch {}
    return '';
  }

  clearScratch(): void {
    AifManager.scratchBuffer = '';
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('krypton_aif_scratch');
      }
    } catch {}
  }

  /**
   * Commits a turn cognitive note with an importance score (0.0 to 1.0).
   * 0.70 - 1.00: Red Core (INT16_CORE)
   * 0.30 - 0.69: Black Ring (INT8_RING)
   * 0.00 - 0.29: Blue Crust (INT2_CRUST)
   */
  async commitNote(params: {
    importance: number;
    summary: string;
    tags?: string[];
    text?: string;
  }): Promise<{ success: boolean; block: AifBlock }> {
    const importance = Math.max(0, Math.min(1, params.importance));
    let ring: AifBlock['ring'] = 'INT2_CRUST';
    if (importance >= 0.70) ring = 'INT16_CORE';
    else if (importance >= 0.30) ring = 'INT8_RING';

    const block: AifBlock = {
      id: `note_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      summary: params.summary,
      importance,
      tags: params.tags || [],
      text: params.text || params.summary,
      timestamp: Date.now(),
      ring,
    };

    this.inMemoryBlocks.push(block);

    // 1. Persist directly to .ai disk files in Kryptonide data directory (${basePath}/aif/)
    try {
      const aifDir = this.getAifDirectory();
      const projectPath = this.getProjectFilePath();
      const bridgePath = this.getBridgeFilePath();
      const projectData = JSON.stringify(this.inMemoryBlocks, null, 2);

      if (isNative()) {
        await mkdirSafe(aifDir);
        await writeTextFile(projectPath, projectData);

        // If high importance or tagged bridge, update bridge_nexus.ai
        if (block.importance >= 0.70 || block.tags.some(t => t.includes('bridge') || t.includes('cross-project'))) {
          let bridgeBlocks: AifBlock[] = [];
          const existingBridge = await readTextFile(bridgePath);
          if (existingBridge) {
            try { bridgeBlocks = JSON.parse(existingBridge); } catch {}
          }
          if (!bridgeBlocks.some(b => b.id === block.id)) {
            bridgeBlocks.push(block);
            await writeTextFile(bridgePath, JSON.stringify(bridgeBlocks, null, 2));
          }
        }
      } else {
        webWrite(projectPath, projectData);
      }
    } catch (fsErr) {
      console.warn('[AifManager] Disk persistence fallback:', fsErr);
    }

    // 2. Save to localStorage as web persistence fallback
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const key = `krypton_aif_${this.projectId}`;
        const existingRaw = window.localStorage.getItem(key);
        const existing: AifBlock[] = existingRaw ? JSON.parse(existingRaw) : [];
        existing.push(block);
        window.localStorage.setItem(key, JSON.stringify(existing));
      }
    } catch {}

    return { success: true, block };
  }

  /**
   * Chat Boot Recall: Retrieves Red Core blocks and cross-project bridge pointers.
   */
  async recall(): Promise<{ core: AifBlock[]; bridge: AifBlock[]; formattedContext: string }> {
    let allBlocks = [...this.inMemoryBlocks];

    // 1. Load from .ai files in ${basePath}/aif/
    try {
      const projectPath = this.getProjectFilePath();
      const bridgePath = this.getBridgeFilePath();

      let projectContent: string | null = null;
      let bridgeContent: string | null = null;

      if (isNative()) {
        projectContent = await readTextFile(projectPath);
        bridgeContent = await readTextFile(bridgePath);
      } else {
        projectContent = webRead(projectPath);
        bridgeContent = webRead(bridgePath);
      }

      if (projectContent) {
        try {
          const parsed: AifBlock[] = JSON.parse(projectContent);
          const ids = new Set(allBlocks.map(b => b.id));
          for (const p of parsed) {
            if (!ids.has(p.id)) {
              allBlocks.push(p);
              ids.add(p.id);
            }
          }
        } catch {}
      }

      if (bridgeContent) {
        try {
          const parsedBridge: AifBlock[] = JSON.parse(bridgeContent);
          const ids = new Set(allBlocks.map(b => b.id));
          for (const b of parsedBridge) {
            if (!ids.has(b.id)) {
              allBlocks.push(b);
              ids.add(b.id);
            }
          }
        } catch {}
      }
    } catch (e) {
      console.warn('[AifManager] Recall disk read error:', e);
    }

    // 2. Also check localStorage fallback
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const key = `krypton_aif_${this.projectId}`;
        const stored = window.localStorage.getItem(key);
        if (stored) {
          const parsed: AifBlock[] = JSON.parse(stored);
          const ids = new Set(allBlocks.map(b => b.id));
          for (const p of parsed) {
            if (!ids.has(p.id)) allBlocks.push(p);
          }
        }
      }
    } catch {}

    const core = allBlocks.filter(b => b.ring === 'INT16_CORE' || b.importance >= 0.70);
    const bridge = allBlocks.filter(b => b.tags?.includes('bridge') || b.tags?.includes('cross-project'));

    const lines = [
      '# AIF V4 COGNITIVE MEMORY ACTIVE STATE',
      core.length > 0 ? `## Red Core Memory (${core.length} items):` : '',
      ...core.slice(-5).map(c => `- [${c.id}] (Importance: ${c.importance.toFixed(2)}) ${c.summary}`),
      bridge.length > 0 ? `## Cross-Project Bridge Nexus (${bridge.length} items):` : '',
      ...bridge.slice(-3).map(b => `- [Bridge] ${b.summary}`),
    ].filter(Boolean);

    return {
      core,
      bridge,
      formattedContext: lines.join('\n'),
    };
  }

  /**
   * Queries cognitive memory by tag or semantic keyword.
   */
  async query(queryText: string): Promise<AifBlock[]> {
    const q = queryText.toLowerCase();
    const { core, bridge } = await this.recall();
    const pool = [...core, ...bridge, ...this.inMemoryBlocks];
    const matches = pool.filter(b => 
      b.summary.toLowerCase().includes(q) ||
      b.text.toLowerCase().includes(q) ||
      b.tags.some(t => t.toLowerCase().includes(q))
    );
    return matches;
  }
}

export const defaultAifManager = new AifManager();
