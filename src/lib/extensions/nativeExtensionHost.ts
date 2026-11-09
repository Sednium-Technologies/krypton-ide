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
  type?: string;
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
  debuggers?: Array<{ type: string; label?: string; [key: string]: any }>;
  terminal?: any;
  terminalProfiles?: any;
  [key: string]: any;
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
  capabilities?: {
    untrustedWorkspaces?: {
      supported?: boolean | 'limited';
      description?: string;
    };
    virtualWorkspaces?: boolean;
  };
}

export interface InstalledExtension {
  id: string;
  version: string;
  location: string;
  manifest: ExtensionManifest;
}

export interface ExtensionNotification {
  level: 'info' | 'warn' | 'error';
  message: string;
  items: string[];
}

export interface ExtensionStatusBarItem {
  id: string;
  alignment?: number;
  priority?: number;
  text: string;
  tooltip?: string;
  command?: string;
  visible?: boolean;
}

export interface ExtensionWebviewSnapshot {
  id: string;
  extensionId: string;
  kind: 'view' | 'panel' | string;
  viewType: string;
  title: string;
  html: string;
  visible: boolean;
  messages: any[];
}

export interface LspServerConfig {
  id: string;
  languageId: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface LspBinaryCheck {
  name: string;
  exists: boolean;
  path?: string;
  installCommand: string;
}

export interface BuiltinLspServer {
  languageId: string;
  command: string;
  args: string[];
  binary: string;
  installCommand: string;
}

export const BUILTIN_LSP_SERVERS: BuiltinLspServer[] = [
  {
    languageId: 'typescript',
    command: 'typescript-language-server',
    args: ['--stdio'],
    binary: 'typescript-language-server',
    installCommand: 'npm install -g typescript-language-server typescript',
  },
  {
    languageId: 'javascript',
    command: 'typescript-language-server',
    args: ['--stdio'],
    binary: 'typescript-language-server',
    installCommand: 'npm install -g typescript-language-server typescript',
  },
  {
    languageId: 'python',
    command: 'pyright-langserver',
    args: ['--stdio'],
    binary: 'pyright-langserver',
    installCommand: 'npm install -g pyright',
  },
  {
    languageId: 'rust',
    command: 'rust-analyzer',
    args: [],
    binary: 'rust-analyzer',
    installCommand: 'pkg install -y rust-analyzer',
  },
  {
    languageId: 'cpp',
    command: 'clangd',
    args: [],
    binary: 'clangd',
    installCommand: 'pkg install -y clang',
  },
  {
    languageId: 'c',
    command: 'clangd',
    args: [],
    binary: 'clangd',
    installCommand: 'pkg install -y clang',
  },
  {
    languageId: 'go',
    command: 'gopls',
    args: [],
    binary: 'gopls',
    installCommand: 'pkg install -y gopls',
  },
  {
    languageId: 'json',
    command: 'vscode-json-language-server',
    args: ['--stdio'],
    binary: 'vscode-json-language-server',
    installCommand: 'npm install -g vscode-langservers-extracted',
  },
  {
    languageId: 'html',
    command: 'vscode-html-language-server',
    args: ['--stdio'],
    binary: 'vscode-html-language-server',
    installCommand: 'npm install -g vscode-langservers-extracted',
  },
  {
    languageId: 'css',
    command: 'vscode-css-language-server',
    args: ['--stdio'],
    binary: 'vscode-css-language-server',
    installCommand: 'npm install -g vscode-langservers-extracted',
  },
];

export type WorkspaceTrustState = 'trusted' | 'restricted' | 'untrusted';

export type ExtensionCapability =
  | 'spawnProcess'
  | 'fsOutsideWorkspace'
  | 'fsWrite'
  | 'network'
  | 'terminalWrite';

export interface WorkspaceTrustInfo {
  state: WorkspaceTrustState;
  workspaceRoot?: string;
  isTrusted: boolean;
}

export interface CapabilityCheckResult {
  capability: ExtensionCapability | string;
  allowed: boolean;
  error?: string;
}

export interface ExtensionPermissionRequirement {
  capability: ExtensionCapability;
  title: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
}

export interface ExtensionHostPlugin {
  installVsix(options: { path: string }): Promise<{ success: boolean; extension: InstalledExtension }>;
  listInstalled(): Promise<{ extensions: InstalledExtension[] }>;
  uninstall(options: { id: string }): Promise<{ success: boolean; id: string }>;
  getManifest(options: { id: string }): Promise<{ manifest: ExtensionManifest | null }>;
  activate(options: { id: string }): Promise<{ success: boolean; id: string; state: string }>;
  executeCommand<T = any>(options: { command: string; arguments?: any[] }): Promise<{ success: boolean; result: T }>;
  listCommands(): Promise<{ commands: string[] }>;
  drainNotifications(): Promise<{ notifications: ExtensionNotification[] }>;
  listStatusBarItems(): Promise<{ items: ExtensionStatusBarItem[] }>;
  resolveWebview(options: { extensionId: string; viewId: string }): Promise<{ webview: ExtensionWebviewSnapshot | null }>;
  drainWebviews(options: { extensionId: string }): Promise<{ webviews: ExtensionWebviewSnapshot[] }>;
  sendWebviewMessage(options: { webviewId: string; messageJson: string }): Promise<{ handled: boolean }>;
  startLspServer(options: { config: LspServerConfig } | LspServerConfig): Promise<{ success: boolean; sessionId: string }>;
  sendLspMessage(options: { sessionId: string; message: string }): Promise<{ success: boolean }>;
  drainLspMessages(options: { sessionId: string }): Promise<{ success: boolean; messages: string[] }>;
  stopLspServer(options: { sessionId: string }): Promise<{ success: boolean }>;
  checkLspBinary(options: { binary: string; prefix?: string }): Promise<LspBinaryCheck>;
  getBuiltinLspServers(): Promise<{ servers: BuiltinLspServer[] }>;
  setWorkspaceTrust(options: { state: WorkspaceTrustState; workspaceRoot?: string }): Promise<WorkspaceTrustInfo>;
  getWorkspaceTrust(): Promise<WorkspaceTrustInfo>;
  checkCapability(options: { capability: ExtensionCapability | string }): Promise<CapabilityCheckResult>;
  addListener(
    eventName: 'contributionsChanged',
    listenerFunc: (info: any) => void
  ): Promise<PluginListenerHandle>;
}

/**
 * In-memory extension host used only by the Node test harness. Production web
 * builds must not install, activate, or fake LSP servers in the browser.
 */
export class ExtensionHostWeb implements ExtensionHostPlugin {
  private inMemoryExtensions: InstalledExtension[] = [];
  private activeExtensions: Set<string> = new Set();
  private mockCommands: Map<string, (...args: any[]) => any> = new Map();
  private pendingNotifications: ExtensionNotification[] = [];
  private mockStatusBarItems: Map<string, ExtensionStatusBarItem> = new Map();
  private mockWebviews: Map<string, ExtensionWebviewSnapshot> = new Map();
  private mockWebviewHandlers: Map<string, (message: any) => void> = new Map();
  private mockLspSessions: Map<string, { config: LspServerConfig; queuedMessages: string[] }> = new Map();
  private mockBinaryOverrides: Map<string, Partial<LspBinaryCheck>> = new Map();
  private trustState: WorkspaceTrustState = 'restricted';
  private workspaceRoot: string = '';

  constructor() {
    this.mockCommands.set('krypton.ping', () => 'pong');
  }

  registerMockCommand(id: string, fn: (...args: any[]) => any) {
    this.mockCommands.set(id, fn);
  }

  pushMockNotification(note: ExtensionNotification) {
    this.pendingNotifications.push(note);
  }

  async installVsix(options: { path: string }): Promise<{ success: boolean; extension: InstalledExtension }> {
    let manifest: ExtensionManifest = {
      name: options.path.split('/').pop()?.replace('.vsix', '') || 'web-preview-extension',
      publisher: 'web',
      version: '1.0.0',
      displayName: 'Web Preview Extension',
      description: 'Simulated extension in web preview environment',
      activationEvents: ['*'],
      contributes: {
        commands: [{ command: 'web.hello', title: 'Say Hello' }],
      },
    };

    if (typeof window === 'undefined' && typeof process !== 'undefined' && options.path) {
      try {
        const fsModule = 'node:fs';
        const admZipModule = 'adm-zip';
        const fs = await import(/* @vite-ignore */ fsModule);
        if (fs.existsSync(options.path)) {
          const admZipMod: any = await import(/* @vite-ignore */ admZipModule);
          const AdmZipClass = admZipMod?.default || admZipMod;
          const AdmZip = AdmZipClass?.default || AdmZipClass;
          const zip = new AdmZip(options.path);
          const pkgEntry = zip.getEntry('extension/package.json');
          if (pkgEntry) {
            const rawPkg = zip.readAsText(pkgEntry);
            manifest = JSON.parse(rawPkg);
          }
        }
      } catch {
        // Fall back to filename extraction
      }
    }

    const extension: InstalledExtension = {
      id: `${manifest.publisher}.${manifest.name}`,
      version: manifest.version,
      location: `/extensions/${manifest.publisher}.${manifest.name}-${manifest.version}`,
      manifest: manifest,
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
    this.activeExtensions.delete(options.id);
    return { success: this.inMemoryExtensions.length < priorLen, id: options.id };
  }

  async getManifest(options: { id: string }): Promise<{ manifest: ExtensionManifest | null }> {
    const found = this.inMemoryExtensions.find(e => e.id === options.id);
    return { manifest: found ? found.manifest : null };
  }

  async activate(options: { id: string }): Promise<{ success: boolean; id: string; state: string }> {
    this.activeExtensions.add(options.id);
    return { success: true, id: options.id, state: 'active' };
  }

  async executeCommand<T = any>(options: { command: string; arguments?: any[] }): Promise<{ success: boolean; result: T }> {
    if (this.mockCommands.has(options.command)) {
      const fn = this.mockCommands.get(options.command)!;
      const res = await Promise.resolve(fn(...(options.arguments || [])));
      return { success: true, result: res };
    }
    return { success: true, result: null as unknown as T };
  }

  async listCommands(): Promise<{ commands: string[] }> {
    return { commands: Array.from(this.mockCommands.keys()) };
  }

  async drainNotifications(): Promise<{ notifications: ExtensionNotification[] }> {
    const notes = [...this.pendingNotifications];
    this.pendingNotifications = [];
    return { notifications: notes };
  }

  setMockStatusBarItem(item: ExtensionStatusBarItem) {
    this.mockStatusBarItems.set(item.id, item);
  }

  removeMockStatusBarItem(id: string) {
    this.mockStatusBarItems.delete(id);
  }

  async listStatusBarItems(): Promise<{ items: ExtensionStatusBarItem[] }> {
    const visibleItems = Array.from(this.mockStatusBarItems.values())
      .filter((it) => it.visible !== false)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return { items: visibleItems };
  }

  registerMockWebview(webview: ExtensionWebviewSnapshot, handler?: (message: any) => void) {
    this.mockWebviews.set(webview.id, { ...webview, messages: [] });
    if (handler) this.mockWebviewHandlers.set(webview.id, handler);
  }

  pushMockWebviewMessage(webviewId: string, message: any) {
    const webview = this.mockWebviews.get(webviewId);
    if (webview) webview.messages.push(message);
  }

  async resolveWebview(options: { extensionId: string; viewId: string }): Promise<{ webview: ExtensionWebviewSnapshot | null }> {
    const found = Array.from(this.mockWebviews.values()).find(
      (webview) => webview.extensionId === options.extensionId && webview.viewType === options.viewId
    );
    return { webview: found ? { ...found, messages: [...found.messages] } : null };
  }

  async drainWebviews(options: { extensionId: string }): Promise<{ webviews: ExtensionWebviewSnapshot[] }> {
    const webviews = Array.from(this.mockWebviews.values())
      .filter((webview) => webview.extensionId === options.extensionId)
      .map((webview) => {
        const snapshot = { ...webview, messages: [...webview.messages] };
        webview.messages = [];
        return snapshot;
      });
    return { webviews };
  }

  async sendWebviewMessage(options: { webviewId: string; messageJson: string }): Promise<{ handled: boolean }> {
    const handler = this.mockWebviewHandlers.get(options.webviewId);
    if (!handler) return { handled: false };
    try {
      handler(JSON.parse(options.messageJson));
      return { handled: true };
    } catch {
      return { handled: false };
    }
  }

  setMockBinaryCheck(name: string, check: Partial<LspBinaryCheck>) {
    this.mockBinaryOverrides.set(name, check);
  }

  pushMockLspMessage(sessionId: string, message: string) {
    const sess = this.mockLspSessions.get(sessionId);
    if (sess) {
      sess.queuedMessages.push(message);
    }
  }

  async startLspServer(options: { config: LspServerConfig } | LspServerConfig): Promise<{ success: boolean; sessionId: string }> {
    const config = 'config' in options ? options.config : options;
    const sessionId = config.id || `session-${Date.now()}`;
    this.mockLspSessions.set(sessionId, { config, queuedMessages: [] });
    return { success: true, sessionId };
  }

  async sendLspMessage(options: { sessionId: string; message: string }): Promise<{ success: boolean }> {
    const session = this.mockLspSessions.get(options.sessionId);
    if (!session) {
      return { success: false };
    }

    try {
      const parsed = JSON.parse(options.message);
      if (parsed.method === 'initialize') {
        session.queuedMessages.push(JSON.stringify({
          jsonrpc: '2.0',
          id: parsed.id,
          result: {
            capabilities: {
              completionProvider: { triggerCharacters: ['.', ':'] },
              hoverProvider: true,
              definitionProvider: true,
              textDocumentSync: 1, // Full
            },
          },
        }));
      } else if (parsed.method === 'textDocument/completion') {
        session.queuedMessages.push(JSON.stringify({
          jsonrpc: '2.0',
          id: parsed.id,
          result: {
            isIncomplete: false,
            items: [
              {
                label: 'mockCompletion',
                kind: 1,
                detail: 'Mock LSP completion item',
                insertText: 'mockCompletion',
              },
            ],
          },
        }));
      } else if (parsed.method === 'textDocument/hover') {
        session.queuedMessages.push(JSON.stringify({
          jsonrpc: '2.0',
          id: parsed.id,
          result: {
            contents: {
              kind: 'markdown',
              value: '**Mock LSP Hover Information**',
            },
          },
        }));
      } else if (parsed.method === 'textDocument/definition') {
        session.queuedMessages.push(JSON.stringify({
          jsonrpc: '2.0',
          id: parsed.id,
          result: [
            {
              uri: parsed.params?.textDocument?.uri || 'file:///mock/test.ts',
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 10 },
              },
            },
          ],
        }));
      } else if (parsed.method === 'textDocument/didOpen') {
        const text: string = parsed.params?.textDocument?.text || '';
        if (text.includes('trigger-error')) {
          session.queuedMessages.push(JSON.stringify({
            jsonrpc: '2.0',
            method: 'textDocument/publishDiagnostics',
            params: {
              uri: parsed.params?.textDocument?.uri,
              diagnostics: [
                {
                  range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 13 },
                  },
                  severity: 1, // Error
                  message: 'Syntax error: invalid token detected',
                  source: 'lsp-mock',
                },
              ],
            },
          }));
        }
      } else if (parsed.method === 'shutdown') {
        session.queuedMessages.push(JSON.stringify({
          jsonrpc: '2.0',
          id: parsed.id,
          result: null,
        }));
      }
    } catch {
      // Ignore parse errors in mock
    }

    return { success: true };
  }

  async drainLspMessages(options: { sessionId: string }): Promise<{ success: boolean; messages: string[] }> {
    const session = this.mockLspSessions.get(options.sessionId);
    if (!session) {
      return { success: false, messages: [] };
    }
    const msgs = [...session.queuedMessages];
    session.queuedMessages = [];
    return { success: true, messages: msgs };
  }

  async stopLspServer(options: { sessionId: string }): Promise<{ success: boolean }> {
    this.mockLspSessions.delete(options.sessionId);
    return { success: true };
  }

  async checkLspBinary(options: { binary: string; prefix?: string }): Promise<LspBinaryCheck> {
    const matched = BUILTIN_LSP_SERVERS.find(
      (s) => s.binary === options.binary || s.command === options.binary || s.languageId === options.binary
    );
    const defaultInstall = matched?.installCommand || `pkg install -y ${options.binary}`;

    const override = this.mockBinaryOverrides.get(options.binary);
    if (override) {
      return {
        name: options.binary,
        exists: override.exists ?? false,
        path: override.path,
        installCommand: override.installCommand || defaultInstall,
      };
    }

    return {
      name: options.binary,
      exists: false,
      installCommand: defaultInstall,
    };
  }

  async getBuiltinLspServers(): Promise<{ servers: BuiltinLspServer[] }> {
    return { servers: BUILTIN_LSP_SERVERS };
  }

  async setWorkspaceTrust(options: { state: WorkspaceTrustState; workspaceRoot?: string }): Promise<WorkspaceTrustInfo> {
    this.trustState = options.state;
    if (options.workspaceRoot !== undefined) {
      this.workspaceRoot = options.workspaceRoot;
    }
    return {
      state: this.trustState,
      workspaceRoot: this.workspaceRoot,
      isTrusted: this.trustState === 'trusted',
    };
  }

  async getWorkspaceTrust(): Promise<WorkspaceTrustInfo> {
    return {
      state: this.trustState,
      workspaceRoot: this.workspaceRoot,
      isTrusted: this.trustState === 'trusted',
    };
  }

  async checkCapability(options: { capability: ExtensionCapability | string }): Promise<CapabilityCheckResult> {
    const cap = options.capability;
    if (this.trustState === 'trusted') {
      return { capability: cap, allowed: true };
    }
    if (this.trustState === 'restricted') {
      if (cap === 'fsWrite') {
        return { capability: cap, allowed: true };
      }
      return {
        capability: cap,
        allowed: false,
        error: `SecurityError: Capability '${cap}' is not permitted in Restricted workspace`,
      };
    }
    return {
      capability: cap,
      allowed: false,
      error: `SecurityError: Capability '${cap}' is not permitted in Untrusted workspace`,
    };
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

export function inspectExtensionPermissions(manifest: ExtensionManifest): ExtensionPermissionRequirement[] {
  const permissions: ExtensionPermissionRequirement[] = [];

  // Check untrusted workspaces declaration
  if (manifest.capabilities?.untrustedWorkspaces) {
    const untrusted = manifest.capabilities.untrustedWorkspaces;
    if (untrusted.supported === false || untrusted.supported === 'limited') {
      permissions.push({
        capability: 'spawnProcess',
        title: 'Full Workspace Trust Required',
        description: untrusted.description || 'This extension requires complete workspace trust to execute.',
        risk: 'high',
      });
    }
  }

  // Check contributions for process execution / debuggers
  if (manifest.contributes?.debuggers && manifest.contributes.debuggers.length > 0) {
    permissions.push({
      capability: 'spawnProcess',
      title: 'Debugger Process Execution',
      description: 'Spawns local debugging adapters and processes.',
      risk: 'high',
    });
  }

  // Check main script execution
  if (manifest.main) {
    if (manifest.activationEvents?.includes('*') || manifest.activationEvents?.includes('onStartupFinished')) {
      permissions.push({
        capability: 'fsWrite',
        title: 'Background Automation',
        description: 'Runs code at startup with filesystem and state access.',
        risk: 'medium',
      });
    }
  }

  return permissions;
}

const WEB_EXTENSION_HOST_UNAVAILABLE =
  'Extension Host requires the native Android runtime. VSIX installation and language servers are unavailable in the browser preview.';

class UnsupportedExtensionHost implements ExtensionHostPlugin {
  async installVsix(_options: { path: string }): Promise<{ success: boolean; extension: InstalledExtension }> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
  async listInstalled(): Promise<{ extensions: InstalledExtension[] }> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
  async uninstall(_options: { id: string }): Promise<{ success: boolean; id: string }> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
  async getManifest(_options: { id: string }): Promise<{ manifest: ExtensionManifest | null }> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
  async activate(_options: { id: string }): Promise<{ success: boolean; id: string; state: string }> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
  async executeCommand<T = any>(_options: { command: string; arguments?: any[] }): Promise<{ success: boolean; result: T }> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
  async listCommands(): Promise<{ commands: string[] }> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
  async drainNotifications(): Promise<{ notifications: ExtensionNotification[] }> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
  async listStatusBarItems(): Promise<{ items: ExtensionStatusBarItem[] }> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
  async resolveWebview(_options: { extensionId: string; viewId: string }): Promise<{ webview: ExtensionWebviewSnapshot | null }> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
  async drainWebviews(_options: { extensionId: string }): Promise<{ webviews: ExtensionWebviewSnapshot[] }> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
  async sendWebviewMessage(_options: { webviewId: string; messageJson: string }): Promise<{ handled: boolean }> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
  async startLspServer(_options: { config: LspServerConfig } | LspServerConfig): Promise<{ success: boolean; sessionId: string }> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
  async sendLspMessage(_options: { sessionId: string; message: string }): Promise<{ success: boolean }> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
  async drainLspMessages(_options: { sessionId: string }): Promise<{ success: boolean; messages: string[] }> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
  async stopLspServer(_options: { sessionId: string }): Promise<{ success: boolean }> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
  async checkLspBinary(_options: { binary: string; prefix?: string }): Promise<LspBinaryCheck> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
  async getBuiltinLspServers(): Promise<{ servers: BuiltinLspServer[] }> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
  async setWorkspaceTrust(_options: { state: WorkspaceTrustState; workspaceRoot?: string }): Promise<WorkspaceTrustInfo> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
  async getWorkspaceTrust(): Promise<WorkspaceTrustInfo> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
  async checkCapability(_options: { capability: ExtensionCapability | string }): Promise<CapabilityCheckResult> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
  async addListener(
    _eventName: 'contributionsChanged',
    _listenerFunc: (info: any) => void
  ): Promise<PluginListenerHandle> {
    throw new Error(WEB_EXTENSION_HOST_UNAVAILABLE);
  }
}

// Node test processes have no window; browser previews do. Keep the in-memory
// harness for tests, but never expose fake extension/LSP behavior in production.
const webFallbackInstance: ExtensionHostPlugin =
  typeof window === 'undefined' ? new ExtensionHostWeb() : new UnsupportedExtensionHost();

function getWebHarness(): ExtensionHostWeb {
  if (!(webFallbackInstance instanceof ExtensionHostWeb)) {
    throw new Error('Web extension mocks are only available in the test harness.');
  }
  return webFallbackInstance;
}

export function registerWebMockCommand(id: string, fn: (...args: any[]) => any) {
  getWebHarness().registerMockCommand(id, fn);
}

export function pushWebMockNotification(note: ExtensionNotification) {
  getWebHarness().pushMockNotification(note);
}

export function setWebMockStatusBarItem(item: ExtensionStatusBarItem) {
  getWebHarness().setMockStatusBarItem(item);
}

export function setWebMockBinaryCheck(name: string, check: Partial<LspBinaryCheck>) {
  getWebHarness().setMockBinaryCheck(name, check);
}

export function pushWebMockLspMessage(sessionId: string, message: string) {
  getWebHarness().pushMockLspMessage(sessionId, message);
}

export const NativeExtensionHost = registerPlugin<ExtensionHostPlugin>('ExtensionHost', {
  web: () => webFallbackInstance,
});
