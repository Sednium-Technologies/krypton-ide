import { create } from 'zustand';
import {
  NativeExtensionHost,
  type InstalledExtension,
  type ExtensionManifest,
  type ExtensionNotification,
} from '../lib/extensions/nativeExtensionHost';

export interface ExtensionHostState {
  installedExtensions: InstalledExtension[];
  activeExtensions: Record<string, string>;
  registeredCommands: string[];
  notifications: ExtensionNotification[];
  isLoading: boolean;
  error: string | null;

  loadInstalled: () => Promise<void>;
  installVsix: (path: string) => Promise<InstalledExtension>;
  uninstall: (id: string) => Promise<boolean>;
  getManifest: (id: string) => Promise<ExtensionManifest | null>;
  activateExtension: (id: string) => Promise<boolean>;
  executeCommand: <T = any>(command: string, args?: any[]) => Promise<T>;
  refreshCommands: () => Promise<string[]>;
  drainNotifications: () => Promise<ExtensionNotification[]>;
  initListeners: () => () => void;
}

export const useExtensionHostStore = create<ExtensionHostState>((set, get) => ({
  installedExtensions: [],
  activeExtensions: {},
  registeredCommands: [],
  notifications: [],
  isLoading: false,
  error: null,

  loadInstalled: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await NativeExtensionHost.listInstalled();
      set({ installedExtensions: res.extensions || [], isLoading: false });
    } catch (e: any) {
      set({ error: e?.message || 'Failed to list installed extensions', isLoading: false });
    }
  },

  installVsix: async (path: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await NativeExtensionHost.installVsix({ path });
      if (!res.success || !res.extension) {
        throw new Error('Native installation failed');
      }
      const ext = res.extension;
      set((state) => ({
        installedExtensions: [
          ...state.installedExtensions.filter((e) => e.id !== ext.id),
          ext,
        ],
        isLoading: false,
      }));
      return ext;
    } catch (e: any) {
      const err = e?.message || 'Failed to install VSIX';
      set({ error: err, isLoading: false });
      throw new Error(err);
    }
  },

  uninstall: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await NativeExtensionHost.uninstall({ id });
      if (res.success) {
        set((state) => {
          const active = { ...state.activeExtensions };
          delete active[id];
          return {
            installedExtensions: state.installedExtensions.filter((e) => e.id !== id),
            activeExtensions: active,
            isLoading: false,
          };
        });
        return true;
      }
      set({ isLoading: false });
      return false;
    } catch (e: any) {
      set({ error: e?.message || 'Failed to uninstall extension', isLoading: false });
      return false;
    }
  },

  getManifest: async (id: string) => {
    try {
      const res = await NativeExtensionHost.getManifest({ id });
      return res.manifest || null;
    } catch {
      return null;
    }
  },

  activateExtension: async (id: string) => {
    try {
      const res = await NativeExtensionHost.activate({ id });
      if (res.success) {
        set((state) => ({
          activeExtensions: { ...state.activeExtensions, [id]: res.state || 'active' },
        }));
        await get().refreshCommands();
        return true;
      }
      return false;
    } catch (e: any) {
      set({ error: e?.message || `Failed to activate extension ${id}` });
      return false;
    }
  },

  executeCommand: async <T = any>(command: string, args?: any[]) => {
    try {
      const res = await NativeExtensionHost.executeCommand<T>({ command, arguments: args });
      void get().drainNotifications();
      return res.result;
    } catch (e: any) {
      const err = e?.message || `Failed to execute command ${command}`;
      set({ error: err });
      throw new Error(err);
    }
  },

  refreshCommands: async () => {
    try {
      const res = await NativeExtensionHost.listCommands();
      const cmds = res.commands || [];
      set({ registeredCommands: cmds });
      return cmds;
    } catch {
      return [];
    }
  },

  drainNotifications: async () => {
    try {
      const res = await NativeExtensionHost.drainNotifications();
      const notes = res.notifications || [];
      if (notes.length > 0) {
        set((state) => ({
          notifications: [...state.notifications, ...notes],
        }));
      }
      return notes;
    } catch {
      return [];
    }
  },

  initListeners: () => {
    let handle: any = null;
    NativeExtensionHost.addListener('contributionsChanged', () => {
      void get().loadInstalled();
    }).then((h) => {
      handle = h;
    }).catch(() => {});

    return () => {
      if (handle && typeof handle.remove === 'function') {
        handle.remove();
      }
    };
  },
}));
