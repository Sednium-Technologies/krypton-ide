import * as Comlink from 'comlink';

export interface SearchMatch {
  path: string;
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
}

export interface DiffChange {
  changeType: 'insert' | 'delete' | 'equal';
  value: string;
}

export class SearchWorkerImpl {
  private fileIndex: Map<string, string> = new Map();
  private wasmEngine: any = null;
  private wasmInitAttempted = false;

  private async tryInitWasm() {
    if (this.wasmInitAttempted) return;
    this.wasmInitAttempted = true;
    try {
      // Dynamic import to allow graceful fallback when WASM module is absent
      const pkgPath = '../../crates/krypton-core-rs/pkg';
      const wasm = await import(/* @vite-ignore */ pkgPath);
      if (wasm && wasm.FastSearchEngine) {
        this.wasmEngine = new wasm.FastSearchEngine();
      }
    } catch {
      // Graceful fallback to pure TypeScript engine
      this.wasmEngine = null;
    }
  }

  async indexProject(files: { path: string; content: string }[]): Promise<void> {
    this.fileIndex.clear();
    for (const f of files) {
      this.fileIndex.set(f.path, f.content);
    }
    await this.tryInitWasm();
    if (this.wasmEngine) {
      try {
        this.wasmEngine.indexFiles(JSON.stringify(files));
      } catch {
        // Fall back to TS index
      }
    }
  }

  async updateFile(path: string, content: string): Promise<void> {
    this.fileIndex.set(path, content);
    if (this.wasmEngine) {
      try {
        this.wasmEngine.updateFile(path, content);
      } catch {
        // Fall back
      }
    }
  }

  async removeFile(path: string): Promise<void> {
    this.fileIndex.delete(path);
    if (this.wasmEngine) {
      try {
        this.wasmEngine.removeFile(path);
      } catch {
        // Fall back
      }
    }
  }

  async search(query: string, isRegex = false, matchCase = false): Promise<SearchMatch[]> {
    if (!query) return [];

    await this.tryInitWasm();
    if (this.wasmEngine) {
      try {
        const rawJson = this.wasmEngine.search(query, isRegex, matchCase, 500);
        const parsed = JSON.parse(rawJson);
        return parsed.map((m: any) => ({
          path: m.path,
          lineNumber: m.line_number,
          lineContent: m.line_content,
          matchStart: m.match_start,
          matchEnd: m.match_end,
        }));
      } catch {
        // Fall through to TS search implementation
      }
    }

    const matches: SearchMatch[] = [];
    let regex: RegExp;

    try {
      if (isRegex) {
        regex = new RegExp(query, matchCase ? 'g' : 'gi');
      } else {
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(escaped, matchCase ? 'g' : 'gi');
      }
    } catch {
      return [];
    }

    for (const [path, content] of this.fileIndex.entries()) {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(line)) !== null) {
          matches.push({
            path,
            lineNumber: i + 1,
            lineContent: line,
            matchStart: match.index,
            matchEnd: match.index + match[0].length,
          });

          if (matches.length >= 500) break;
        }
        if (matches.length >= 500) break;
      }
      if (matches.length >= 500) break;
    }

    return matches;
  }
}

const searchWorker = new SearchWorkerImpl();
Comlink.expose(searchWorker);
