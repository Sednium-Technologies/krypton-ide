import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import {
  nativeTerminalBridge,
  type BootstrapStatus,
  type BootstrapProgressEvent,
  type TerminalOutputEvent,
  type TerminalExitEvent,
} from '../lib/terminal/nativeTerminalBridge';
import { useProjectsStore } from './useProjectsStore';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface TerminalSessionState {
  id: string;
  pid: number | null;
  running: boolean;
  cwd: string;
  buffer: string[];
}

export interface NativeTerminalState {
  activeTab: 'project' | 'system';
  sessions: Record<'project' | 'system', TerminalSessionState>;
  bootstrapStatus: BootstrapStatus | null;
  bootstrapProgress: BootstrapProgressEvent | null;
  isInstallingBootstrap: boolean;

  // Actions
  setActiveTab: (tab: 'project' | 'system') => void;
  switchTab: (tab: 'project' | 'system') => void;
  initSession: (tab: 'project' | 'system', cwd?: string, rows?: number, cols?: number) => Promise<void>;
  sendInput: (dataOrTab: string, tabOrData?: string) => Promise<void>;
  resize: (
    rowsOrTab: number | 'project' | 'system',
    colsOrRows: number,
    tabOrCols?: 'project' | 'system' | number
  ) => Promise<void>;
  restartSession: (tab: 'project' | 'system') => Promise<void>;
  clearBuffer: (tab: 'project' | 'system') => void;
  checkBootstrapStatus: () => Promise<BootstrapStatus | null>;
  installBootstrap: () => Promise<boolean>;
  subscribeOutput: (tab: 'project' | 'system', callback: (data: string) => void) => () => void;
  getBufferText: (tab?: 'project' | 'system') => string;
}

// ─── Output Subscribers ──────────────────────────────────────────────────────

type TerminalSubscriber = (data: string) => void;
const subscribers: Record<'project' | 'system', Set<TerminalSubscriber>> = {
  project: new Set(),
  system: new Set(),
};

// ─── Project Directory Detection ─────────────────────────────────────────────

export function detectProjectDirectory(): string {
  try {
    const isNative = Capacitor.isNativePlatform();
    const projectsState = useProjectsStore.getState();
    const currentProjectId = projectsState.currentProjectId;
    const project = currentProjectId ? projectsState.projects[currentProjectId] : null;

    if (!isNative) {
      if (project) {
        return `/project/${project.name || project.id}`;
      }
      return '/project';
    }

    // Native Android device execution
    if (project) {
      if (project.folderPath && project.folderPath.trim()) {
        const fp = project.folderPath.trim();
        if (fp.startsWith('/')) {
          return fp;
        }
        return `/sdcard/${fp}`;
      }

      const basePath = localStorage.getItem('krypton-base-path') || 'Documents/KryptonIDE';
      const rootBase = basePath.startsWith('/') ? basePath : `/sdcard/${basePath}`;
      const folderName = project.name ? project.name.replace(/[^a-zA-Z0-9_\-\.]/g, '_') : project.id;
      return `${rootBase}/projects/${project.id || folderName}`;
    }

    const basePath = localStorage.getItem('krypton-base-path') || 'Documents/KryptonIDE';
    return basePath.startsWith('/') ? basePath : `/sdcard/${basePath}`;
  } catch (e) {
    return Capacitor.isNativePlatform() ? '/sdcard/Documents/KryptonIDE' : '/project';
  }
}

export function getSystemHomeDirectory(bootstrapStatus?: BootstrapStatus | null): string {
  if (!Capacitor.isNativePlatform()) {
    return '/home';
  }
  return bootstrapStatus?.homePath || '/data/data/com.sednium.kryptonide/files/home';
}

// ─── Singleton Listener Lifecycle ────────────────────────────────────────────

let listenersAttached = false;

function ensureListenersInitialized(
  get: () => NativeTerminalState,
  set: (fn: (state: NativeTerminalState) => Partial<NativeTerminalState> | NativeTerminalState) => void
) {
  if (listenersAttached) return;
  listenersAttached = true;

  nativeTerminalBridge.addTerminalOutputListener((event: TerminalOutputEvent) => {
    const { sessionId, data } = event;
    const state = get();

    let targetTab: 'project' | 'system';
    if (state.sessions.project.id && state.sessions.project.id === sessionId) {
      targetTab = 'project';
    } else if (state.sessions.system.id && state.sessions.system.id === sessionId) {
      targetTab = 'system';
    } else if (sessionId.startsWith('project')) {
      targetTab = 'project';
    } else if (sessionId.startsWith('system')) {
      targetTab = 'system';
    } else {
      targetTab = state.activeTab;
    }

    // Append output chunk to session buffer (capped to latest 10,000 chunks)
    set((prev) => {
      const currentSession = prev.sessions[targetTab];
      const newBuffer = [...currentSession.buffer, data];
      const trimmed = newBuffer.length > 10000 ? newBuffer.slice(newBuffer.length - 10000) : newBuffer;
      return {
        sessions: {
          ...prev.sessions,
          [targetTab]: {
            ...currentSession,
            buffer: trimmed,
          },
        },
      };
    });

    // Notify real-time subscribers (e.g. xterm.js instance)
    subscribers[targetTab].forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error(`[useNativeTerminalStore] Subscriber error for ${targetTab}:`, err);
      }
    });
  });

  nativeTerminalBridge.addTerminalExitListener((event: TerminalExitEvent) => {
    const { sessionId, exitCode } = event;
    const state = get();

    let targetTab: 'project' | 'system';
    if (state.sessions.project.id && state.sessions.project.id === sessionId) {
      targetTab = 'project';
    } else if (state.sessions.system.id && state.sessions.system.id === sessionId) {
      targetTab = 'system';
    } else if (sessionId.startsWith('project')) {
      targetTab = 'project';
    } else if (sessionId.startsWith('system')) {
      targetTab = 'system';
    } else {
      targetTab = state.activeTab;
    }

    set((prev) => ({
      sessions: {
        ...prev.sessions,
        [targetTab]: {
          ...prev.sessions[targetTab],
          running: false,
        },
      },
    }));

    const exitMsg = `\r\n\x1b[33m[Process exited with code ${exitCode}]\x1b[0m\r\n`;
    subscribers[targetTab].forEach((cb) => {
      try {
        cb(exitMsg);
      } catch {}
    });
  });

  nativeTerminalBridge.addBootstrapProgressListener((event: BootstrapProgressEvent) => {
    set((prev) => ({
      bootstrapProgress: event,
      isInstallingBootstrap: event.status !== 'ready' && event.status !== 'error',
    }));

    if (event.status === 'ready') {
      get().checkBootstrapStatus();
    }
  });
}

// ─── Zustand Store ───────────────────────────────────────────────────────────

export const useNativeTerminalStore = create<NativeTerminalState>((set, get) => ({
  activeTab: 'project',
  sessions: {
    project: {
      id: '',
      pid: null,
      running: false,
      cwd: '',
      buffer: [],
    },
    system: {
      id: '',
      pid: null,
      running: false,
      cwd: '',
      buffer: [],
    },
  },
  bootstrapStatus: null,
  bootstrapProgress: null,
  isInstallingBootstrap: false,

  setActiveTab: (tab: 'project' | 'system') => {
    set({ activeTab: tab });
  },

  switchTab: (tab: 'project' | 'system') => {
    set({ activeTab: tab });
  },

  initSession: async (tab: 'project' | 'system', customCwd?: string, rows = 24, cols = 80) => {
    ensureListenersInitialized(get, set);

    const currentSession = get().sessions[tab];
    if (currentSession.running && currentSession.id) {
      return;
    }

    if (!get().bootstrapStatus) {
      await get().checkBootstrapStatus();
    }

    const targetCwd =
      customCwd ||
      (tab === 'project'
        ? detectProjectDirectory()
        : getSystemHomeDirectory(get().bootstrapStatus));

    const sessionId = `${tab}-${Date.now().toString(36)}`;

    try {
      const result = await nativeTerminalBridge.createSession({
        sessionId,
        cwd: targetCwd,
        rows,
        cols,
      });

      set((prev) => ({
        sessions: {
          ...prev.sessions,
          [tab]: {
            id: result.sessionId,
            pid: result.pid,
            running: true,
            cwd: targetCwd,
            buffer: prev.sessions[tab].buffer,
          },
        },
      }));
    } catch (err) {
      console.error(`[useNativeTerminalStore] Failed to initialize ${tab} session:`, err);
    }
  },

  sendInput: async (dataOrTab: string, tabOrData?: string) => {
    let data: string;
    let tab: 'project' | 'system';

    if (dataOrTab === 'project' || dataOrTab === 'system') {
      tab = dataOrTab;
      data = tabOrData ?? '';
    } else {
      data = dataOrTab;
      tab = (tabOrData as 'project' | 'system') || get().activeTab;
    }

    let session = get().sessions[tab];
    if (!session.running || !session.id) {
      await get().initSession(tab);
      session = get().sessions[tab];
    }

    if (session.id) {
      await nativeTerminalBridge.write({
        sessionId: session.id,
        data,
      });
    }
  },

  resize: async (
    a: number | 'project' | 'system',
    b: number,
    c?: number | 'project' | 'system'
  ) => {
    let tab: 'project' | 'system';
    let rows: number;
    let cols: number;

    if (typeof a === 'string') {
      tab = a;
      rows = b;
      cols = typeof c === 'number' ? c : 80;
    } else {
      rows = a;
      cols = b;
      tab = typeof c === 'string' ? c : get().activeTab;
    }

    const session = get().sessions[tab];
    if (!session.id) return;

    await nativeTerminalBridge.resize({
      sessionId: session.id,
      rows,
      cols,
    });
  },

  restartSession: async (tab: 'project' | 'system') => {
    const session = get().sessions[tab];
    if (session.id) {
      try {
        await nativeTerminalBridge.killSession({ sessionId: session.id });
      } catch (e) {
        console.warn(`[useNativeTerminalStore] Error killing session ${session.id}:`, e);
      }
    }

    set((prev) => ({
      sessions: {
        ...prev.sessions,
        [tab]: {
          ...prev.sessions[tab],
          running: false,
          pid: null,
        },
      },
    }));

    await get().initSession(tab);
  },

  clearBuffer: (tab: 'project' | 'system') => {
    set((prev) => ({
      sessions: {
        ...prev.sessions,
        [tab]: {
          ...prev.sessions[tab],
          buffer: [],
        },
      },
    }));
  },

  checkBootstrapStatus: async () => {
    try {
      const status = await nativeTerminalBridge.getBootstrapStatus();
      set({ bootstrapStatus: status });
      return status;
    } catch (e) {
      console.error('[useNativeTerminalStore] Failed to check bootstrap status:', e);
      return null;
    }
  },

  installBootstrap: async () => {
    set({
      isInstallingBootstrap: true,
      bootstrapProgress: {
        status: 'checking',
        progress: 0,
        message: 'Preparing Termux bootstrap installation...',
      },
    });

    try {
      const result = await nativeTerminalBridge.installTermuxBootstrap();
      await get().checkBootstrapStatus();
      set({
        isInstallingBootstrap: false,
        bootstrapProgress: {
          status: 'ready',
          progress: 100,
          message: 'Termux bootstrap installation completed successfully.',
        },
      });
      return result.success;
    } catch (err: any) {
      set({
        isInstallingBootstrap: false,
        bootstrapProgress: {
          status: 'error',
          progress: 0,
          message: err?.message || 'Failed to install Termux bootstrap',
        },
      });
      return false;
    }
  },

  subscribeOutput: (tab: 'project' | 'system', callback: (data: string) => void) => {
    subscribers[tab].add(callback);
    return () => {
      subscribers[tab].delete(callback);
    };
  },

  getBufferText: (tab?: 'project' | 'system') => {
    const targetTab = tab || get().activeTab;
    return (get().sessions[targetTab]?.buffer || []).join('');
  },
}));
