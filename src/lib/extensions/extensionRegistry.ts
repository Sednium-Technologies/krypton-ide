import type { Extension } from '../../store/useExtensionsStore';

export interface ExtensionLookupState {
  customExtensions: Extension[];
  installedExtensions: string[];
}

export function getInstalledExtensions(state: ExtensionLookupState): Extension[] {
  const installed = new Set(state.installedExtensions);
  return state.customExtensions
    .filter((ext) => installed.has(ext.id))
    .map((ext) => ({ ...ext, installed: true }));
}

export function findExtension(state: ExtensionLookupState, id: string): Extension | undefined {
  return state.customExtensions.find((ext) => ext.id === id);
}
