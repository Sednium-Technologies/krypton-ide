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

export function reconcileInstalledExtensions(
  installed: string[] | null | undefined,
  extensions: Extension[] | null | undefined
): string[] {
  const knownIds = new Set((extensions || []).map((ext) => ext.id));
  const seen = new Set<string>();
  const reconciled: string[] = [];

  for (const id of installed || []) {
    if (typeof id !== 'string' || !knownIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    reconciled.push(id);
  }

  return reconciled;
}

export function deriveActiveMonacoThemeId(
  persistedThemeId: string | null | undefined,
  activeExtensionId: string | null | undefined,
  extensions: Extension[] | null | undefined
): string | null {
  if (persistedThemeId) return persistedThemeId;
  const activeExtension = (extensions || []).find((ext) => ext.id === activeExtensionId);
  return activeExtension?.monacoThemeId || null;
}
