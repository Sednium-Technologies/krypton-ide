import { create } from 'zustand';
import {
  NativeExtensionHost,
  type InstalledExtension,
  type ExtensionManifest,
} from '../lib/extensions/nativeExtensionHost';

export interface ExtensionHostState {
  installedExtensions: InstalledExtension[];
  isLoading: boolean;
  error: string | null;

  loadInstalled: () => Promise<void>;
  installVsix: (path: string) => Promise<InstalledExtension>;
  uninstall: (id: string) => Promise<boolean>;
  getManifest: (id: string) => Promise<ExtensionManifest | null>;
  initListeners: () => () => void;
}

export const useExtensionHostStore = create<ExtensionHostState>((set, get) => ({
  installedExtensions: [],
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
        set((state) => ({
          installedExtensions: state.installedExtensions.filter((e) => e.id !== id),
          isLoading: false,
        }));
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
