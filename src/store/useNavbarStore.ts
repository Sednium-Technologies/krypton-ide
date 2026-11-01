import { create } from 'zustand';
import {
  Code2,
  GitBranch,
  Bot,
  TerminalSquare,
  Puzzle,
  Search,
  Play,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { useIdeStore } from './useIdeStore';
import { useAiStore } from './useAiStore';
import { useExtensionsStore } from './useExtensionsStore';
import { useToastStore } from './useToastStore';


export interface NavToolDefinition {
  id: string;
  label: string;
  icon: LucideIcon | string | React.ComponentType<any>;
  action?: () => void;
  badge?: string | number;
  isCustom?: boolean;
  extensionId?: string;
}

interface NavbarPersistedConfig {
  pinnedIds: string[];
  pinnedCount: number;
}

const STORAGE_KEY = 'krypton-navbar-config';

export const DEFAULT_TOOL_IDS = [
  'canvas',
  'git',
  'ai',
  'terminal',
  'extensions',
  'search',
  'preview',
  'settings',
] as const;

export const BUILTIN_TOOLS: Record<string, NavToolDefinition> = {
  canvas: {
    id: 'canvas',
    label: 'Canvas',
    icon: Code2,
    action: () => {
      const ide = useIdeStore.getState();
      if (ide.isSidebarOpen) {
        ide.toggleSidebar();
      }
    },
  },
  git: {
    id: 'git',
    label: 'Git',
    icon: GitBranch,
    action: () => {
      useIdeStore.setState({ sidebarView: 'git', isSidebarOpen: true });
    },
  },
  ai: {
    id: 'ai',
    label: 'Oorty Lite',
    icon: Bot,
    action: () => {
      useIdeStore.setState({ sidebarView: 'ai', isSidebarOpen: true });
    },
  },
  terminal: {
    id: 'terminal',
    label: 'Terminal',
    icon: TerminalSquare,
    action: () => {
      useIdeStore.getState().setIsTerminalOpen((prev) => !prev);
    },
  },
  extensions: {
    id: 'extensions',
    label: 'Extend',
    icon: Puzzle,
    action: () => {
      useIdeStore.setState({ sidebarView: 'extensions', isSidebarOpen: true });
    },
  },
  search: {
    id: 'search',
    label: 'Search',
    icon: Search,
    action: () => {
      useIdeStore.setState({ sidebarView: 'search', isSidebarOpen: true });
    },
  },
  preview: {
    id: 'preview',
    label: 'Preview',
    icon: Play,
    action: () => {
      useIdeStore.getState().setPreviewOpen(true);
    },
  },
  settings: {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    action: () => {
      useIdeStore.setState({ sidebarView: 'settings', isSidebarOpen: true });
    },
  },
};

const DEFAULT_PINNED_IDS = ['canvas', 'git', 'ai', 'terminal', 'extensions', 'search', 'preview', 'settings'];
const DEFAULT_PINNED_COUNT = 3;

function loadStoredConfig(): NavbarPersistedConfig {
  if (typeof window === 'undefined') {
    return { pinnedIds: [...DEFAULT_PINNED_IDS], pinnedCount: DEFAULT_PINNED_COUNT };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.pinnedIds) && typeof parsed.pinnedCount === 'number') {
        let validPinnedIds = parsed.pinnedIds.filter((id: string) => typeof id === 'string');
        // Ensure all built-in tool ids are present in the list
        for (const defaultId of DEFAULT_TOOL_IDS) {
          if (!validPinnedIds.includes(defaultId)) {
            validPinnedIds.push(defaultId);
          }
        }
        // Purge any stale custom extension tools from localStorage that lack side tray window contributions
        validPinnedIds = validPinnedIds.filter((id: string) => {
          if (id.startsWith('ext-')) {
            return false;
          }
          return true;
        });
        const validCount = Math.min(6, Math.max(2, parsed.pinnedCount));
        return {
          pinnedIds: validPinnedIds,
          pinnedCount: validCount,
        };
      }
    }
  } catch (err) {
    console.warn('Failed to parse navbar config from localStorage:', err);
  }
  return { pinnedIds: [...DEFAULT_PINNED_IDS], pinnedCount: DEFAULT_PINNED_COUNT };
}

function saveConfig(config: NavbarPersistedConfig) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn('Failed to save navbar config to localStorage:', err);
  }
}

export interface NavbarState {
  tools: Record<string, NavToolDefinition>;
  pinnedIds: string[];
  pinnedCount: number;
  isOverflowOpen: boolean;
  isCustomizerOpen: boolean;

  // Actions
  setPinnedCount: (count: number) => void;
  swapPositions: (indexA: number, indexB: number) => void;
  reorderPinned: (newOrder: string[]) => void;
  togglePinned: (toolId: string) => void;
  setOverflowOpen: (open: boolean) => void;
  setCustomizerOpen: (open: boolean) => void;
  resetDefaults: () => void;
  registerCustomTool: (tool: NavToolDefinition) => void;
  unregisterCustomTool: (toolId: string) => void;
  executeTool: (toolId: string) => void;
  isToolActive: (toolId: string) => boolean;
  syncExtensionTools: () => void;
}

const initialConfig = loadStoredConfig();

export const useNavbarStore = create<NavbarState>((set, get) => ({
  tools: { ...BUILTIN_TOOLS },
  pinnedIds: initialConfig.pinnedIds,
  pinnedCount: initialConfig.pinnedCount,
  isOverflowOpen: false,
  isCustomizerOpen: false,

  setPinnedCount: (count: number) => {
    const clamped = Math.min(6, Math.max(2, Math.round(count)));
    set((state) => {
      // Ensure pinnedIds has at least clamped elements
      const currentIds = [...state.pinnedIds];
      const allToolIds = Object.keys(state.tools);
      for (const id of allToolIds) {
        if (!currentIds.includes(id)) {
          currentIds.push(id);
        }
      }
      saveConfig({ pinnedIds: currentIds, pinnedCount: clamped });
      return { pinnedCount: clamped, pinnedIds: currentIds };
    });
  },

  swapPositions: (indexA: number, indexB: number) => {
    set((state) => {
      if (
        indexA < 0 ||
        indexA >= state.pinnedIds.length ||
        indexB < 0 ||
        indexB >= state.pinnedIds.length ||
        indexA === indexB
      ) {
        return state;
      }
      const newPinnedIds = [...state.pinnedIds];
      const temp = newPinnedIds[indexA];
      newPinnedIds[indexA] = newPinnedIds[indexB];
      newPinnedIds[indexB] = temp;

      saveConfig({ pinnedIds: newPinnedIds, pinnedCount: state.pinnedCount });
      return { pinnedIds: newPinnedIds };
    });
  },

  reorderPinned: (newOrder: string[]) => {
    set((state) => {
      // Preserve any tools not in newOrder by appending them
      const updated = [...newOrder];
      for (const id of state.pinnedIds) {
        if (!updated.includes(id)) {
          updated.push(id);
        }
      }
      saveConfig({ pinnedIds: updated, pinnedCount: state.pinnedCount });
      return { pinnedIds: updated };
    });
  },

  togglePinned: (toolId: string) => {
    set((state) => {
      const isCurrentlyPinned = state.pinnedIds.slice(0, state.pinnedCount).includes(toolId);
      let newPinnedIds = [...state.pinnedIds];
      let newCount = state.pinnedCount;

      if (isCurrentlyPinned) {
        // Unpinning tool: cannot go below 2
        if (state.pinnedCount <= 2) {
          return state;
        }
        // Move this tool after the pinned slice
        newPinnedIds = newPinnedIds.filter((id) => id !== toolId);
        newPinnedIds.splice(state.pinnedCount - 1, 0, toolId);
        newCount = state.pinnedCount - 1;
      } else {
        // Pinning tool
        newPinnedIds = newPinnedIds.filter((id) => id !== toolId);
        if (state.pinnedCount < 6) {
          // Insert at end of pinned portion and increment count
          newPinnedIds.splice(state.pinnedCount, 0, toolId);
          newCount = state.pinnedCount + 1;
        } else {
          // If already at 6, swap into slot 6
          newPinnedIds.splice(5, 0, toolId);
        }
      }

      saveConfig({ pinnedIds: newPinnedIds, pinnedCount: newCount });
      return { pinnedIds: newPinnedIds, pinnedCount: newCount };
    });
  },

  setOverflowOpen: (open: boolean) => set({ isOverflowOpen: open }),

  setCustomizerOpen: (open: boolean) => set({ isCustomizerOpen: open }),

  resetDefaults: () => {
    const freshIds = [...DEFAULT_PINNED_IDS];
    saveConfig({ pinnedIds: freshIds, pinnedCount: DEFAULT_PINNED_COUNT });
    set({
      pinnedIds: freshIds,
      pinnedCount: DEFAULT_PINNED_COUNT,
    });
  },

  registerCustomTool: (tool: NavToolDefinition) => {
    set((state) => {
      const nextTools = { ...state.tools, [tool.id]: tool };
      const nextPinnedIds = state.pinnedIds.includes(tool.id)
        ? state.pinnedIds
        : [...state.pinnedIds, tool.id];
      saveConfig({ pinnedIds: nextPinnedIds, pinnedCount: state.pinnedCount });
      return { tools: nextTools, pinnedIds: nextPinnedIds };
    });
  },

  unregisterCustomTool: (toolId: string) => {
    set((state) => {
      const nextTools = { ...state.tools };
      delete nextTools[toolId];
      const nextPinnedIds = state.pinnedIds.filter((id) => id !== toolId);
      saveConfig({ pinnedIds: nextPinnedIds, pinnedCount: Math.min(state.pinnedCount, nextPinnedIds.length) });
      return { tools: nextTools, pinnedIds: nextPinnedIds };
    });
  },

  syncExtensionTools: () => {
    const extState = useExtensionsStore.getState();
    const installed = extState.installedExtensions || [];
    const custom = extState.customExtensions || [];
    const allInstalled = custom.filter((e) => installed.includes(e.id));

    const activeCustomToolIds = new Set<string>();

    // Dynamic: Inspect ONLY installed extensions that explicitly contribute activity bar view containers
    for (const ext of allInstalled) {
      if (ext.category === 'theme' || ext.category === 'snippet') continue;

      // STRICT: Only extensions that contribute VS Code side tray icon windows are allowed to appear
      if (ext.activityBarContributions && ext.activityBarContributions.length > 0) {
        for (const contrib of ext.activityBarContributions) {
          const toolId = `ext-${ext.id}-${contrib.id}`;
          activeCustomToolIds.add(toolId);
          get().registerCustomTool({
            id: toolId,
            label: contrib.title || ext.name,
            icon: contrib.icon || ext.iconUrl || Bot,
            isCustom: true,
            extensionId: ext.id,
            action: () => {
              const ide = useIdeStore.getState();
              ide.openExtensionView({
                extensionId: ext.id,
                viewContainerId: contrib.id,
                title: contrib.title || ext.name,
                icon: contrib.icon || ext.iconUrl,
                toolId,
              });
            },
          });
        }
      }
    }

    // 3. Purge ANY custom tools that are NOT in activeCustomToolIds
    // This removes languages, formatters, snippets, and themes that previously leaked into navbar tools
    const currentTools = get().tools;
    for (const [toolId, tool] of Object.entries(currentTools)) {
      if (tool.isCustom && !activeCustomToolIds.has(toolId)) {
        get().unregisterCustomTool(toolId);
      }
    }

    // Also purge stale custom IDs from state.pinnedIds that were persisted in localStorage
    set((state) => {
      const cleanedPinned = state.pinnedIds.filter((id) => {
        if (id.startsWith('ext-') && !activeCustomToolIds.has(id)) {
          return false;
        }
        return true;
      });
      if (cleanedPinned.length !== state.pinnedIds.length) {
        saveConfig({ pinnedIds: cleanedPinned, pinnedCount: Math.min(state.pinnedCount, cleanedPinned.length) });
        return { pinnedIds: cleanedPinned, pinnedCount: Math.min(state.pinnedCount, cleanedPinned.length) };
      }
      return state;
    });
  },

  executeTool: (toolId: string) => {
    const state = get();
    const tool = state.tools[toolId];
    if (tool?.action) {
      tool.action();
    } else {
      // Fallback to builtin action if available
      const builtin = BUILTIN_TOOLS[toolId];
      if (builtin?.action) builtin.action();
    }
  },

  isToolActive: (toolId: string) => {
    const ide = useIdeStore.getState();
    switch (toolId) {
      case 'canvas':
        return !ide.isSidebarOpen;
      case 'git':
        return ide.isSidebarOpen && ide.sidebarView === 'git';
      case 'ai':
        return ide.isSidebarOpen && ide.sidebarView === 'ai';
      case 'terminal':
        return ide.isTerminalOpen;
      case 'extensions':
        return ide.isSidebarOpen && ide.sidebarView === 'extensions';
      case 'search':
        return ide.isSidebarOpen && ide.sidebarView === 'search';
      case 'preview':
        return ide.isPreviewOpen;
      case 'settings':
        return ide.isSidebarOpen && ide.sidebarView === 'settings';
      default:
        if (toolId.startsWith('ext-')) {
          return (
            ide.isSidebarOpen &&
            ide.sidebarView === 'extension-view' &&
            ide.activeExtensionView?.toolId === toolId
          );
        }
        return false;
    }
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('krypton:extensions-changed', () => {
    useNavbarStore.getState().syncExtensionTools();
  });

  useExtensionsStore.subscribe(() => {
    useNavbarStore.getState().syncExtensionTools();
  });

  // Sync initially and on next tick
  setTimeout(() => {
    useNavbarStore.getState().syncExtensionTools();
  }, 60);
}
