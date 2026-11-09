import { create } from 'zustand';
import {
  NativeExtensionHost,
  type InstalledExtension,
  type ExtensionManifest,
  type ExtensionNotification,
  type ExtensionStatusBarItem,
  type ExtensionWebviewSnapshot,
} from '../lib/extensions/nativeExtensionHost';

export interface ExtensionHostState {
  installedExtensions: InstalledExtension[];
  activeExtensions: Record<string, string>;
  registeredCommands: string[];
  notifications: ExtensionNotification[];
  statusBarItems: ExtensionStatusBarItem[];
  configurations: Record<string, any>;
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
  refreshStatusBarItems: () => Promise<ExtensionStatusBarItem[]>;
  resolveWebview: (extensionId: string, viewId: string) => Promise<ExtensionWebviewSnapshot | null>;
  drainWebviews: (extensionId: string) => Promise<ExtensionWebviewSnapshot[]>;
  sendWebviewMessage: (webviewId: string, message: unknown) => Promise<boolean>;
  getContributedCommands: () => Array<{ extensionId: string; command: string; title: string; category?: string }>;
  getContributedConfigurations: () => Array<{ extensionId: string; title: string; properties: Record<string, any> }>;
  getConfiguration: (key: string, defaultValue?: any) => any;
  updateConfiguration: (key: string, value: any) => void;
  initListeners: () => () => void;
}

export const useExtensionHostStore = create<ExtensionHostState>((set, get) => ({
  installedExtensions: [],
  activeExtensions: {},
  registeredCommands: [],
  notifications: [],
  statusBarItems: [],
  configurations: {},
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
      // Auto-activate owner extension if registered but not yet active
      const state = get();
      const owner = state.installedExtensions.find((e) =>
        e.manifest?.contributes?.commands?.some((c) => c.command === command)
      );
      if (owner && !state.activeExtensions[owner.id]) {
        await get().activateExtension(owner.id);
      }

      const res = await NativeExtensionHost.executeCommand<T>({ command, arguments: args });
      void get().drainNotifications();
      return res.result;
    } catch (e: any) {
      const err = e?.message || `Failed to execute command ${command}`;
      set({ error: err });
      throw new Error(err);
    }
  },

  getContributedCommands: () => {
    const list: Array<{ extensionId: string; command: string; title: string; category?: string }> = [];
    const exts = get().installedExtensions || [];
    for (const ext of exts) {
      const cmds = ext.manifest?.contributes?.commands;
      if (Array.isArray(cmds)) {
        for (const cmd of cmds) {
          list.push({
            extensionId: ext.id,
            command: cmd.command,
            title: cmd.title,
            category: cmd.category,
          });
        }
      }
    }
    return list;
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

  resolveWebview: async (extensionId, viewId) => {
    try {
      const res = await NativeExtensionHost.resolveWebview({ extensionId, viewId });
      return res.webview || null;
    } catch (e: any) {
      set({ error: e?.message || `Failed to resolve webview ${viewId}` });
      return null;
    }
  },

  drainWebviews: async (extensionId) => {
    try {
      const res = await NativeExtensionHost.drainWebviews({ extensionId });
      return res.webviews || [];
    } catch {
      return [];
    }
  },

  sendWebviewMessage: async (webviewId, message) => {
    try {
      const res = await NativeExtensionHost.sendWebviewMessage({
        webviewId,
        messageJson: JSON.stringify(message),
      });
      return Boolean(res.handled);
    } catch {
      return false;
    }
  },

  refreshStatusBarItems: async () => {
    try {
      const res = await NativeExtensionHost.listStatusBarItems();
      const items = res.items || [];
      set({ statusBarItems: items });
      return items;
    } catch {
      return [];
    }
  },

  getContributedConfigurations: () => {
    const list: Array<{ extensionId: string; title: string; properties: Record<string, any> }> = [];
    const exts = get().installedExtensions || [];
    for (const ext of exts) {
      const config = ext.manifest?.contributes?.configuration;
      if (config && typeof config === 'object') {
        const title = config.title || ext.manifest.displayName || ext.manifest.name || ext.id;
        const properties = config.properties || {};
        list.push({
          extensionId: ext.id,
          title,
          properties,
        });
      }
    }
    return list;
  },

  getConfiguration: (key: string, defaultValue?: any) => {
    const configs = get().configurations || {};
    if (key in configs && configs[key] !== undefined) {
      return configs[key];
    }
    // Check manifest defaults
    const exts = get().installedExtensions || [];
    for (const ext of exts) {
      const props = ext.manifest?.contributes?.configuration?.properties;
      if (props && key in props && props[key].default !== undefined) {
        return props[key].default;
      }
    }
    return defaultValue;
  },

  updateConfiguration: (key: string, value: any) => {
    set((state) => {
      const nextConfigs = { ...state.configurations, [key]: value };
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem('krypton:ext-configs', JSON.stringify(nextConfigs));
        } catch {}
      }
      return { configurations: nextConfigs };
    });
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
