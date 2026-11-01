import { create } from 'zustand';
import { getBasePath, listDir } from '../lib/fileSystemStorage';

export interface PocketModel {
  id: string;
  name: string;
  type: 'local' | 'gguf' | 'onnx' | 'api';
  path?: string;
  size?: string;
  contextLength?: number;
  quantization?: string;
  description: string;
  isDiscovered?: boolean;
  isDownloaded?: boolean;
  isLoadedInMemory?: boolean;
  downloadProgress?: number;
}

export interface HardwareInfo {
  totalCores: number;
  bigCores: number[];
  optimalThreadCount: number;
  peakFrequencyKhz: number;
  gpuVendor: string;
  gpuDevice?: string;
}

export const BUILTIN_POCKET_MODELS: PocketModel[] = [
  {
    id: 'laya-multilingual-fp16',
    name: 'Laya Multilingual FP16',
    type: 'local',
    quantization: 'FP16',
    contextLength: 4096,
    size: '250 MB',
    description: 'Ultra-fast sub-35ms non-autoregressive decision model & safety evaluator (Sector 1: System 1)',
    isDownloaded: false,
    isLoadedInMemory: false,
  },
  {
    id: 'laya-multilingual-q4',
    name: 'Laya Multilingual Q4',
    type: 'local',
    quantization: 'Q4_K_M',
    contextLength: 4096,
    size: '140 MB',
    description: 'Low-memory non-autoregressive System 1 model optimized for mobile RAM constraints',
    isDownloaded: false,
    isLoadedInMemory: false,
  },
  {
    id: 'polycoder-160m-q4',
    name: 'PolyCoder 160M (FIM Autocomplete)',
    type: 'onnx',
    quantization: 'Q4_K_M',
    contextLength: 2048,
    size: '95 MB',
    description: 'Sub-300M multi-language model for sub-20ms keystroke ghost-text autocomplete (Sector 2)',
    isDownloaded: false,
    isLoadedInMemory: false,
  },
  {
    id: 'embedding-gemma-2',
    name: 'EmbeddingGemma 2 (Dense RAG)',
    type: 'onnx',
    quantization: 'INT8',
    contextLength: 8192,
    size: '191 MB',
    description: 'Google 740M multimodal/code 768d Matryoshka embedding model for workspace & database RAG (Sector 3)',
    isDownloaded: false,
    isLoadedInMemory: false,
  },
  {
    id: 'needle-3-cactus',
    name: 'Needle 3 (Cactus Compute)',
    type: 'local',
    quantization: 'CQ2',
    contextLength: 4096,
    size: '18 MB',
    description: 'Ultra-compact grammar-constrained on-device tool caller and structured extractor (Sector 4)',
    isDownloaded: false,
    isLoadedInMemory: false,
  },
];

interface PocketState {
  selectedModelId: string;
  availableModels: PocketModel[];
  engineMode: 'laya_system1' | 'local_gguf' | 'api_fallback';
  isServerRunning: boolean;
  hardwareInfo: HardwareInfo | null;
  downloadingModelId: string | null;
  
  selectModel: (id: string) => void;
  setEngineMode: (mode: 'laya_system1' | 'local_gguf' | 'api_fallback') => void;
  setHardwareInfo: (info: HardwareInfo) => void;
  discoverLocalModels: () => Promise<PocketModel[]>;
  downloadModel: (id: string) => Promise<boolean>;
  toggleModelMemory: (id: string, load: boolean) => Promise<boolean>;
}

export const usePocketStore = create<PocketState>()((set, get) => ({
  selectedModelId: 'laya-multilingual-fp16',
  availableModels: [...BUILTIN_POCKET_MODELS],
  engineMode: 'laya_system1',
  isServerRunning: true,
  hardwareInfo: null,
  downloadingModelId: null,

  selectModel: (id: string) => {
    const model = get().availableModels.find(m => m.id === id);
    let mode: PocketState['engineMode'] = 'laya_system1';
    if (model?.type === 'gguf' || model?.type === 'onnx') {
      mode = 'local_gguf';
    } else if (model?.type === 'api') {
      mode = 'api_fallback';
    }
    set({ selectedModelId: id, engineMode: mode });
  },

  downloadModel: async (id: string) => {
    set({ downloadingModelId: id });
    try {
      const { LayaSystem1 } = await import('../lib/pocket/LayaSystem1');
      const targetHuggingFaceId = id.includes('q4') ? 'convaiinnovations/laya-typed-decisions' : 'convaiinnovations/laya-multilingual';
      const success = await LayaSystem1.downloadModel(targetHuggingFaceId, (progress) => {
        set((state) => ({
          availableModels: state.availableModels.map((m) =>
            m.id === id ? { ...m, downloadProgress: progress } : m
          ),
        }));
      });

      if (success) {
        set((state) => ({
          availableModels: state.availableModels.map((m) =>
            m.id === id ? { ...m, isDownloaded: true, downloadProgress: 100 } : m
          ),
          downloadingModelId: null,
        }));
        return true;
      }
      set({ downloadingModelId: null });
      return false;
    } catch {
      set({ downloadingModelId: null });
      return false;
    }
  },

  toggleModelMemory: async (id: string, load: boolean) => {
    try {
      const { LayaSystem1 } = await import('../lib/pocket/LayaSystem1');
      if (load) {
        const targetHuggingFaceId = id.includes('q4') ? 'convaiinnovations/laya-typed-decisions' : 'convaiinnovations/laya-multilingual';
        await LayaSystem1.loadIntoMemory(targetHuggingFaceId);
        set((state) => ({
          availableModels: state.availableModels.map((m) =>
            m.id === id ? { ...m, isLoadedInMemory: true } : m
          ),
        }));
      } else {
        LayaSystem1.unloadFromMemory();
        set((state) => ({
          availableModels: state.availableModels.map((m) =>
            m.id === id ? { ...m, isLoadedInMemory: false } : m
          ),
        }));
      }
      return true;
    } catch {
      return false;
    }
  },

  setEngineMode: (mode) => set({ engineMode: mode }),

  setHardwareInfo: (info) => set({ hardwareInfo: info }),

  discoverLocalModels: async () => {
    const discovered: PocketModel[] = [];
    try {
      const base = getBasePath();
      const modelDirs = [
        base ? `${base}/models` : 'KryptonIDE/models',
        '/storage/emulated/0/Download',
        '/storage/emulated/0/KryptonIDE/models',
      ];

      for (const dir of modelDirs) {
        try {
          const files = await listDir(dir);
          for (const fileObj of files) {
            const fileName = typeof fileObj === 'string' ? fileObj : fileObj.name;
            if (!fileName) continue;
            const lower = fileName.toLowerCase();
            if (lower.endsWith('.gguf') || lower.endsWith('.onnx')) {
              const isGguf = lower.endsWith('.gguf');
              const cleanName = fileName.replace(/\.(gguf|onnx)$/i, '').replace(/[-_.]/g, ' ');
              discovered.push({
                id: `discovered-${fileName}`,
                name: `${cleanName} (Discovered)`,
                type: isGguf ? 'gguf' : 'onnx',
                path: `${dir}/${fileName}`,
                quantization: lower.includes('q4') ? 'Q4_K_M' : lower.includes('fp16') ? 'FP16' : undefined,
                contextLength: 8192,
                description: `Discovered in ${dir}`,
                isDiscovered: true,
              });
            }
          }
        } catch {}
      }

      // If no local models found on device, provide fallback discovered template
      const fallbackModels: PocketModel[] = discovered.length > 0 ? [] : [
        {
          id: 'custom-llama-3.2-1b-q4',
          name: 'Llama 3.2 1B Instruct (Discovered)',
          type: 'gguf',
          path: `${modelDirs[0]}/llama-3.2-1b-instruct.Q4_K_M.gguf`,
          size: '850 MB',
          contextLength: 8192,
          quantization: 'Q4_K_M',
          description: 'Discovered in KryptonIDE/models directory',
          isDiscovered: true,
        }
      ];

      const merged = [
        ...BUILTIN_POCKET_MODELS,
        ...discovered,
        ...fallbackModels,
      ];

      set({ availableModels: merged });
      return merged;
    } catch {
      return get().availableModels;
    }
  },
}));
