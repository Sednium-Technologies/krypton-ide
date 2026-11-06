import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

export interface ExtensionCommandContribution {
  command: string;
  title: string;
  category?: string;
}

export interface ExtensionMenuContribution {
  command: string;
  when?: string;
  group?: string;
}

export interface ExtensionContainerContribution {
  id: string;
  title: string;
  icon?: string;
}

export interface ExtensionViewsContainersContribution {
  activitybar?: ExtensionContainerContribution[];
}

export interface ExtensionViewContribution {
  id: string;
  name: string;
  when?: string;
}

export interface ExtensionThemeContribution {
  label?: string;
  uiTheme?: string;
  path: string;
}

export interface ExtensionIconThemeContribution {
  id?: string;
  label?: string;
  path: string;
}

export interface ExtensionSnippetContribution {
  language?: string;
  path: string;
}

export interface ExtensionLanguageContribution {
  id: string;
  aliases?: string[];
  extensions?: string[];
}

export interface ExtensionContributions {
  commands?: ExtensionCommandContribution[];
  menus?: Record<string, ExtensionMenuContribution[]>;
  viewsContainers?: ExtensionViewsContainersContribution;
  views?: Record<string, ExtensionViewContribution[]>;
  configuration?: any;
  themes?: ExtensionThemeContribution[];
  iconThemes?: ExtensionIconThemeContribution[];
  snippets?: ExtensionSnippetContribution[];
  languages?: ExtensionLanguageContribution[];
}

export interface ExtensionManifest {
  name: string;
  publisher: string;
  version: string;
  displayName?: string;
  description?: string;
  main?: string;
  icon?: string;
  activationEvents?: string[];
  contributes?: ExtensionContributions;
  engines?: Record<string, string>;
}

export interface InstalledExtension {
  id: string;
  version: string;
  location: string;
  manifest: ExtensionManifest;
}

export interface ExtensionHostPlugin {
  installVsix(options: { path: string }): Promise<{ success: boolean; extension: InstalledExtension }>;
  listInstalled(): Promise<{ extensions: InstalledExtension[] }>;
  uninstall(options: { id: string }): Promise<{ success: boolean; id: string }>;
  getManifest(options: { id: string }): Promise<{ manifest: ExtensionManifest | null }>;
  addListener(
    eventName: 'contributionsChanged',
    listenerFunc: (info: any) => void
  ): Promise<PluginListenerHandle>;
}

class ExtensionHostWeb implements ExtensionHostPlugin {
  private inMemoryExtensions: InstalledExtension[] = [];

  async installVsix(options: { path: string }): Promise<{ success: boolean; extension: InstalledExtension }> {
    // In web dev preview, return simulated success or parse in-memory
    const mockManifest: ExtensionManifest = {
      name: options.path.split('/').pop()?.replace('.vsix', '') || 'web-preview-extension',
      publisher: 'web',
      version: '1.0.0',
      displayName: 'Web Preview Extension',
      description: 'Simulated extension in web preview environment',
    };
    const extension: InstalledExtension = {
      id: `${mockManifest.publisher}.${mockManifest.name}`,
      version: mockManifest.version,
      location: `/extensions/${mockManifest.publisher}.${mockManifest.name}-1.0.0`,
      manifest: mockManifest,
    };
    this.inMemoryExtensions = this.inMemoryExtensions.filter(e => e.id !== extension.id);
    this.inMemoryExtensions.push(extension);
    return { success: true, extension };
  }

  async listInstalled(): Promise<{ extensions: InstalledExtension[] }> {
    return { extensions: [...this.inMemoryExtensions] };
  }

  async uninstall(options: { id: string }): Promise<{ success: boolean; id: string }> {
    const priorLen = this.inMemoryExtensions.length;
    this.inMemoryExtensions = this.inMemoryExtensions.filter(e => e.id !== options.id);
    return { success: this.inMemoryExtensions.length < priorLen, id: options.id };
  }

  async getManifest(options: { id: string }): Promise<{ manifest: ExtensionManifest | null }> {
    const found = this.inMemoryExtensions.find(e => e.id === options.id);
    return { manifest: found ? found.manifest : null };
  }

  async addListener(
    _eventName: 'contributionsChanged',
    _listenerFunc: (info: any) => void
  ): Promise<PluginListenerHandle> {
    return {
      remove: async () => {},
    };
  }
}

export const NativeExtensionHost = registerPlugin<ExtensionHostPlugin>('ExtensionHost', {
  web: () => new ExtensionHostWeb(),
});
