import { create } from 'zustand';
import { readConfig, saveConfigDebounced } from '../lib/fileSystemStorage';
import { useIdeStore } from './useIdeStore';
import { useAiStore } from './useAiStore';
import { useNativeTerminalStore } from './useNativeTerminalStore';

export type HarnessType = 'internal' | 'cli' | 'extension';
export type ExecutionMode = 'supervised' | 'autonomous' | 'unbound';

export interface AgentHarness {
  id: string;
  name: string;
  type: HarnessType;
  description: string;
  binaryName?: string;
  isInstalled: boolean;
  version?: string;
}

export const KNOWN_HARNESSES: AgentHarness[] = [
  {
    id: 'oorty-lite',
    name: 'Oorty Lite (Built-in)',
    type: 'internal',
    description: 'Kryptonide native hardware-accelerated agentic harness powered by Oorty',
    isInstalled: true,
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    type: 'cli',
    description: 'Anthropic agentic coding CLI tool',
    binaryName: 'claude',
    isInstalled: false,
  },
  {
    id: 'antigravity',
    name: 'Antigravity CLI',
    type: 'cli',
    description: 'Google Deepmind Advanced Agentic Coding CLI',
    binaryName: 'antigravity',
    isInstalled: false,
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    type: 'cli',
    description: 'Official Gemini developer CLI',
    binaryName: 'gemini',
    isInstalled: false,
  },
  {
    id: 'aider',
    name: 'Aider',
    type: 'cli',
    description: 'AI pair programming in your terminal',
    binaryName: 'aider',
    isInstalled: false,
  },
  {
    id: 'roo-cline',
    name: 'Roo Code / Cline',
    type: 'extension',
    description: 'Autonomous coding agent extension',
    binaryName: 'roo',
    isInstalled: false,
  },
];

interface HarnessState {
  defaultHarnessId: string;
  executionMode: ExecutionMode;
  harnesses: AgentHarness[];
  isLoaded: boolean;

  // Actions
  setDefaultHarnessId: (id: string) => void;
  setExecutionMode: (mode: ExecutionMode) => void;
  updateHarnessInstallStatus: (installedMap: Record<string, { isInstalled: boolean; version?: string }>) => void;
  getInstalledHarnesses: () => AgentHarness[];
  loadHarnessConfig: () => Promise<void>;
  dispatchAgentTask: (task: {
    prompt: string;
    contextText?: string;
    filePath?: string;
    fileContent?: string;
  }) => Promise<void>;
}

export const useHarnessStore = create<HarnessState>((set, get) => ({
  defaultHarnessId: 'oorty-lite',
  executionMode: 'supervised',
  harnesses: KNOWN_HARNESSES,
  isLoaded: false,

  setDefaultHarnessId: (id: string) => {
    const targetId = id === 'larry' ? 'oorty-lite' : id;
    const harness = get().harnesses.find((h) => h.id === targetId);
    // User policy: users can only choose from installed harnesses
    if (!harness || !harness.isInstalled) {
      console.warn(`[HarnessStore] Cannot select uninstalled harness "${targetId}". Fallback to oorty-lite.`);
      return;
    }

    set({ defaultHarnessId: targetId });

    // Persist to config
    readConfig().then((cfg) => {
      if (cfg) {
        cfg.harness = {
          ...cfg.harness,
          defaultHarnessId: id,
          executionMode: get().executionMode,
        };
        saveConfigDebounced(cfg);
      }
    });
  },

  setExecutionMode: (mode: ExecutionMode) => {
    set({ executionMode: mode });

    // Persist to config
    readConfig().then((cfg) => {
      if (cfg) {
        cfg.harness = {
          ...cfg.harness,
          defaultHarnessId: get().defaultHarnessId,
          executionMode: mode,
        };
        saveConfigDebounced(cfg);
      }
    });
  },

  updateHarnessInstallStatus: (installedMap) => {
    set((state) => {
      const updated = state.harnesses.map((h) => {
        if (h.id === 'oorty-lite' || h.id === 'larry') return h; // Oorty Lite is always installed
        const match = installedMap[h.id] || (h.binaryName ? installedMap[h.binaryName] : undefined);
        if (match) {
          return {
            ...h,
            isInstalled: match.isInstalled,
            version: match.version || h.version,
          };
        }
        return h;
      });

      // If active harness is no longer installed, fall back to Oorty Lite
      let active = state.defaultHarnessId;
      if (active === 'larry') active = 'oorty-lite';
      const activeHarness = updated.find((h) => h.id === active);
      if (!activeHarness || !activeHarness.isInstalled) {
        active = 'oorty-lite';
      }

      return { harnesses: updated, defaultHarnessId: active };
    });
  },

  getInstalledHarnesses: () => {
    return get().harnesses.filter((h) => h.isInstalled);
  },

  loadHarnessConfig: async () => {
    try {
      const cfg = await readConfig();
      if (cfg?.harness) {
        const configuredId = cfg.harness.defaultHarnessId;
        const defaultHarnessId = (!configuredId || configuredId === 'larry') ? 'oorty-lite' : configuredId;
        set({
          defaultHarnessId,
          executionMode: cfg.harness.executionMode || 'supervised',
          isLoaded: true,
        });
      } else {
        set({ isLoaded: true });
      }
    } catch {
      set({ isLoaded: true });
    }
  },

  dispatchAgentTask: async ({ prompt, contextText, filePath }) => {
    const { defaultHarnessId, harnesses } = get();
    const activeHarness = harnesses.find((h) => h.id === defaultHarnessId) || harnesses[0];

    if (activeHarness.id === 'oorty-lite' || activeHarness.id === 'larry' || activeHarness.type === 'internal') {
      // 1. Delegate to Oorty Lite (Built-in Assistant)
      const ideState = useIdeStore.getState();
      ideState.setSidebarView('ai');
      if (!ideState.isSidebarOpen) {
        ideState.toggleSidebar();
      }

      const aiState = useAiStore.getState();
      let sessionId = aiState.activeSessionId;
      if (!sessionId) {
        sessionId = aiState.createNewSession();
      }

      let formattedPrompt = prompt;
      if (contextText) {
        formattedPrompt = `${prompt}\n\n\`\`\`${filePath ? filePath.split('.').pop() || '' : ''}\n${contextText}\n\`\`\``;
      }

      const systemCtx = filePath
        ? `User is working on file "${filePath}". Active Agent Harness: Oorty Lite.`
        : 'User invoked action from Command Palette. Active Agent Harness: Oorty Lite.';

      await aiState.sendMessage(sessionId, formattedPrompt, systemCtx);
    } else if (activeHarness.type === 'cli') {
      // 2. Delegate to Terminal CLI Harness (e.g. Claude Code or Antigravity)
      const termStore = useNativeTerminalStore.getState();
      termStore.setActiveTab('project');

      // Send instruction into the terminal
      const bin = activeHarness.binaryName || activeHarness.id;
      let cliCmd = `${bin} "${prompt.replace(/"/g, '\\"')}"\n`;
      if (contextText && filePath) {
        cliCmd = `${bin} "Regarding ${filePath}: ${prompt.replace(/"/g, '\\"')}"\n`;
      }

      await termStore.sendInput(cliCmd);
    } else if (activeHarness.type === 'extension') {
      // 3. Delegate to Extension Panel
      const ideState = useIdeStore.getState();
      ideState.setSidebarView('extensions');
      if (!ideState.isSidebarOpen) {
        ideState.toggleSidebar();
      }
    }
  },
}));
