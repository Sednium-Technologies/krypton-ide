import { Capacitor, registerPlugin } from '@capacitor/core';

export interface OortyCpuCore {
  index: number;
  maxFreqKhz: number;
  performance: boolean;
}

export interface OortyHardware {
  cores: OortyCpuCore[];
  performanceCoreCount: number;
  peakFrequencyKhz: number;
  totalRamMb: number;
  availableRamMb: number;
  gpuVendor: string;
  thermalCelsius: number;
  optimalThreadCount: number;
  thermalWarning: boolean;
}

export interface OortyModel {
  id: string;
  name: string;
  type: string;
  quantization: string;
  contextLength: number;
  sizeBytes: number;
  sizeLabel: string;
  description: string;
  huggingFaceId?: string | null;
  sectors?: string[];
}

export interface OortyServerState {
  running: boolean;
  selectedModelId: string;
  engineMode: string;
  foregroundService: boolean;
  lastError?: string | null;
}

export interface OortyAifBlock {
  type: string;
  timestamp: number;
  importance: number;
  summary: string;
  tags: string[];
}

export interface OortyToolResult {
  ok: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface OortyLitePlugin {
  getSystemPrompt(): Promise<{ version: string; upstream: string; label: string; prompt: string }>;
  route(options: { query: string }): Promise<{ route: string; confidence: number; reason: string }>;
  assessRisk(options: { command: string }): Promise<{ level: string; score: number; requiresConfirmation: boolean; reasons: string[] }>;
  pruneOutput(options: { output: string; maxLines?: number }): Promise<{ output: string }>;
  hardware(): Promise<OortyHardware>;
  listModels(): Promise<{ models: OortyModel[] }>;
  scanModels(): Promise<{ models: Array<{ name: string; path: string; format: string; sizeBytes: number; modifiedAt: number }> }>;
  aifRecall(options: { projectId?: string; limit?: number }): Promise<{ context: string; blocks: OortyAifBlock[] }>;
  aifCommit(options: { projectId?: string; summary: string; importance: number; tags?: string[] }): Promise<{ block: OortyAifBlock }>;
  aifScratch(options: { projectId?: string; intent: string }): Promise<{ path: string }>;
  aifQuery(options: { projectId?: string; keyword: string }): Promise<{ blocks: OortyAifBlock[] }>;
  listTools(options: { projectId?: string; format?: 'gemini' | 'openai' }): Promise<{ tools: unknown[]; mcpTools: number }>;
  executeTool(options: { projectId?: string; name: string; arguments: Record<string, unknown> }): Promise<OortyToolResult>;
  configure(options: { executionTier?: string; servers?: Array<Record<string, unknown>> }): Promise<{ executionTier: string; mcpServers: number }>;
  serverState(): Promise<OortyServerState>;
  startServer(): Promise<OortyServerState>;
  stopServer(): Promise<OortyServerState>;
  selectModel(options: { modelId: string }): Promise<OortyServerState>;
  openPocketServer(): Promise<void>;
  openUpstream(): Promise<void>;
}

export const OortyLite = registerPlugin<OortyLitePlugin>('OortyLite');

export function isOortyNativeAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

export async function configureOortyNative(executionTier: string): Promise<void> {
  if (!isOortyNativeAvailable()) return;
  try {
    await OortyLite.configure({ executionTier });
  } catch {
    // Native plugin not registered in this build.
  }
}

export async function openOortyPocketServer(): Promise<boolean> {
  if (!isOortyNativeAvailable()) return false;
  try {
    await OortyLite.openPocketServer();
    return true;
  } catch {
    return false;
  }
}
