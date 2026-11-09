import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

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

  triggerHaptic(options: { type: 'click' | 'tick' | 'heavy' | 'double_click' }): Promise<void>;
}

export interface SpeechRecognitionPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  start(options?: { language?: string }): Promise<void>;
  stop(): Promise<void>;
  addListener(
    eventName: 'ready' | 'end' | 'partialResults' | 'finalResults' | 'error',
    listener: (data: { matches?: string[]; code?: number; message?: string }) => void
  ): Promise<PluginListenerHandle>;
}

export const SAFFileSystem = registerPlugin<SAFFileSystemPlugin>('SAFFileSystem');
export const FastSearch = registerPlugin<FastSearchPlugin>('FastSearch');
export const KryptonCore = registerPlugin<KryptonCorePlugin>('KryptonCore');
export const KryptonSpeech = registerPlugin<SpeechRecognitionPlugin>('KryptonSpeech');
