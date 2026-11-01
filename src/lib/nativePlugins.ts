import { registerPlugin } from '@capacitor/core';

export interface SAFFileSystemPlugin {
  readFile(options: { uri: string }): Promise<{ content: string }>;
  writeFile(options: { uri: string; content: string }): Promise<{ success: boolean }>;
}

export interface FastSearchMatch {
  file: string;
  line: number;
  content: string;
}

export interface FastSearchPlugin {
  searchInFiles(options: { query: string; files: Array<{ name: string; content: string }> }): Promise<{ results: FastSearchMatch[] }>;
}

export interface KryptonCorePlugin {
  searchFiles(options: {
    query: string;
    dirPath?: string;
    isRegex?: boolean;
    matchCase?: boolean;
    maxMatches?: number;
  }): Promise<{ results: Array<{ path: string; line_number: number; line_content: string; match_start: number; match_end: number }>; wasCancelled: boolean }>;

  computeDiff(options: {
    oldText: string;
    newText: string;
  }): Promise<{ additions: number; deletions: number; modifications: number; hunks: any[] }>;

  pruneAifContext(options: {
    aifBinaryBase64: string;
    maxTokens?: number;
  }): Promise<{ prunedBinaryBase64: string }>;
}

export const SAFFileSystem = registerPlugin<SAFFileSystemPlugin>('SAFFileSystem');
export const FastSearch = registerPlugin<FastSearchPlugin>('FastSearch');
export const KryptonCore = registerPlugin<KryptonCorePlugin>('KryptonCore');
