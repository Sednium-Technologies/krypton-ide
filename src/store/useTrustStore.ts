import { create } from 'zustand';
import {
  NativeExtensionHost,
  WorkspaceTrustState,
  WorkspaceTrustInfo,
  ExtensionManifest,
  ExtensionPermissionRequirement,
  inspectExtensionPermissions,
} from '../lib/extensions/nativeExtensionHost';

export interface PendingConsentModal {
  extensionId: string;
  manifest: ExtensionManifest;
  permissions: ExtensionPermissionRequirement[];
  onConfirm: () => void;
  onCancel: () => void;
}

export interface TrustStoreState {
  trustState: WorkspaceTrustState;
  workspaceRoot: string;
  isTrusted: boolean;
  isTrustBannerVisible: boolean;
  pendingConsentModal: PendingConsentModal | null;

  // Actions
  initializeTrust: (workspaceRoot?: string) => Promise<WorkspaceTrustInfo>;
  setTrustState: (state: WorkspaceTrustState, workspaceRoot?: string) => Promise<WorkspaceTrustInfo>;
  trustCurrentWorkspace: () => Promise<WorkspaceTrustInfo>;
  restrictCurrentWorkspace: () => Promise<WorkspaceTrustInfo>;
  dismissTrustBanner: () => void;
  showTrustBanner: () => void;
  requestExtensionConsent: (
    extensionId: string,
    manifest: ExtensionManifest,
    onConfirm: () => void,
    onCancel: () => void
  ) => boolean;
  closeConsentModal: () => void;
}

export const useTrustStore = create<TrustStoreState>((set, get) => ({
  trustState: 'restricted',
  workspaceRoot: '',
  isTrusted: false,
  isTrustBannerVisible: true,
  pendingConsentModal: null,

  initializeTrust: async (workspaceRoot?: string) => {
    const root = workspaceRoot !== undefined ? workspaceRoot : get().workspaceRoot;
    const info = await NativeExtensionHost.setWorkspaceTrust({
      state: get().trustState,
      workspaceRoot: root,
    });
    set({
      trustState: info.state,
      workspaceRoot: info.workspaceRoot || '',
      isTrusted: info.isTrusted,
      isTrustBannerVisible: info.state === 'restricted',
    });
    return info;
  },

  setTrustState: async (state: WorkspaceTrustState, workspaceRoot?: string) => {
    const root = workspaceRoot !== undefined ? workspaceRoot : get().workspaceRoot;
    const info = await NativeExtensionHost.setWorkspaceTrust({
      state,
      workspaceRoot: root,
    });
    set({
      trustState: info.state,
      workspaceRoot: info.workspaceRoot || '',
      isTrusted: info.isTrusted,
      isTrustBannerVisible: info.state === 'restricted',
    });
    return info;
  },

  trustCurrentWorkspace: async () => {
    return get().setTrustState('trusted');
  },

  restrictCurrentWorkspace: async () => {
    return get().setTrustState('restricted');
  },

  dismissTrustBanner: () => {
    set({ isTrustBannerVisible: false });
  },

  showTrustBanner: () => {
    set({ isTrustBannerVisible: true });
  },

  requestExtensionConsent: (
    extensionId: string,
    manifest: ExtensionManifest,
    onConfirm: () => void,
    onCancel: () => void
  ) => {
    if (get().isTrusted) {
      onConfirm();
      return false;
    }

    const permissions = inspectExtensionPermissions(manifest);
    if (permissions.length === 0) {
      onConfirm();
      return false;
    }

    set({
      pendingConsentModal: {
        extensionId,
        manifest,
        permissions,
        onConfirm: () => {
          set({ pendingConsentModal: null });
          onConfirm();
        },
        onCancel: () => {
          set({ pendingConsentModal: null });
          onCancel();
        },
      },
    });
    return true;
  },

  closeConsentModal: () => {
    const pending = get().pendingConsentModal;
    if (pending) {
      pending.onCancel();
    }
    set({ pendingConsentModal: null });
  },
}));
