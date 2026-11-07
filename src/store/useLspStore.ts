import { create } from 'zustand';
import {
  NativeExtensionHost,
  BuiltinLspServer,
  LspBinaryCheck,
  BUILTIN_LSP_SERVERS,
  LspServerConfig,
} from '../lib/extensions/nativeExtensionHost';
import { LspClient, PublishDiagnosticsParams } from '../lib/lsp/lspClient';
import { useProblemsStore } from './useProblemsStore';

export interface LspSessionState {
  languageId: string;
  sessionId: string;
  status: 'stopped' | 'starting' | 'ready' | 'error';
  client: LspClient | null;
  error?: string;
}

export interface LspStoreState {
  sessions: Record<string, LspSessionState>;
  builtinServers: BuiltinLspServer[];
  missingBinaries: Record<string, LspBinaryCheck>;
  documentVersions: Record<string, number>;

  loadBuiltinServers: () => Promise<void>;
  checkBinary: (languageIdOrBinary: string) => Promise<LspBinaryCheck>;
  startServer: (languageId: string, workspacePath?: string) => Promise<LspClient | null>;
  stopServer: (languageId: string) => Promise<void>;
  restartServer: (languageId: string, workspacePath?: string) => Promise<LspClient | null>;
  getClient: (languageId: string) => LspClient | null;
  syncDocumentOpen: (uri: string, languageId: string, text: string) => Promise<void>;
  syncDocumentChange: (uri: string, languageId: string, text: string) => Promise<void>;
  syncDocumentClose: (uri: string, languageId: string) => Promise<void>;
  getInstallCommand: (languageId: string) => string;
}

function normalizeLanguage(lang: string): string {
  const l = (lang || '').toLowerCase().trim();
  if (l === 'ts' || l === 'typescriptreact' || l === 'tsx') return 'typescript';
  if (l === 'js' || l === 'javascriptreact' || l === 'jsx') return 'javascript';
  if (l === 'py') return 'python';
  if (l === 'rs') return 'rust';
  if (l === 'c++' || l === 'cc' || l === 'cxx' || l === 'h' || l === 'hpp') return 'cpp';
  return l;
}

export const useLspStore = create<LspStoreState>()((set, get) => ({
  sessions: {},
  builtinServers: BUILTIN_LSP_SERVERS,
  missingBinaries: {},
  documentVersions: {},

  loadBuiltinServers: async () => {
    try {
      const res = await NativeExtensionHost.getBuiltinLspServers();
      if (res && res.servers && res.servers.length > 0) {
        set({ builtinServers: res.servers });
      }
    } catch {
      set({ builtinServers: BUILTIN_LSP_SERVERS });
    }
  },

  checkBinary: async (languageIdOrBinary: string) => {
    const lang = normalizeLanguage(languageIdOrBinary);
    const servers = get().builtinServers;
    const matched = servers.find(
      (s) => s.languageId === lang || s.binary === languageIdOrBinary || s.command === languageIdOrBinary
    );
    const binary = matched ? matched.binary : languageIdOrBinary;

    try {
      const check = await NativeExtensionHost.checkLspBinary({ binary });
      set((state) => ({
        missingBinaries: {
          ...state.missingBinaries,
          [lang]: check,
          [binary]: check,
        },
      }));
      return check;
    } catch (e: any) {
      const fallback: LspBinaryCheck = {
        name: binary,
        exists: false,
        installCommand: matched?.installCommand || `pkg install -y ${binary}`,
      };
      set((state) => ({
        missingBinaries: {
          ...state.missingBinaries,
          [lang]: fallback,
          [binary]: fallback,
        },
      }));
      return fallback;
    }
  },

  startServer: async (languageId: string, workspacePath = '/data/data/com.sednium.kryptonide.legacy/files/home') => {
    const lang = normalizeLanguage(languageId);
    const existing = get().sessions[lang];
    if (existing && existing.status === 'ready' && existing.client) {
      return existing.client;
    }

    const servers = get().builtinServers;
    const serverDef = servers.find((s) => s.languageId === lang);
    if (!serverDef) {
      console.warn(`[useLspStore] No built-in language server configuration for '${lang}'`);
      return null;
    }

    // Check binary presence first
    const check = await get().checkBinary(lang);
    if (!check.exists) {
      set((state) => ({
        sessions: {
          ...state.sessions,
          [lang]: {
            languageId: lang,
            sessionId: `lsp-${lang}`,
            status: 'error',
            client: null,
            error: `Language server '${serverDef.binary}' not found. Install with: ${check.installCommand}`,
          },
        },
      }));
      return null;
    }

    const sessionId = `lsp-${lang}-${Date.now()}`;
    const config: LspServerConfig = {
      id: sessionId,
      languageId: lang,
      command: check.path || serverDef.command,
      args: serverDef.args,
      cwd: workspacePath,
    };

    const client = new LspClient(config);

    set((state) => ({
      sessions: {
        ...state.sessions,
        [lang]: {
          languageId: lang,
          sessionId,
          status: 'starting',
          client,
        },
      },
    }));

    try {
      await client.start();
      await client.initialize(`file://${workspacePath}`);

      // Wire publishDiagnostics to problems store
      client.onDiagnostics((params: PublishDiagnosticsParams) => {
        const uri = params.uri || '';
        const fileName = uri.split('/').pop() || uri;
        const newProblems = params.diagnostics.map((d) => ({
          id: Math.random().toString(36).substring(2, 9),
          filePath: uri,
          fileName,
          severity: (d.severity === 1 ? 'error' : d.severity === 2 ? 'warning' : 'info') as any,
          message: d.message,
          startLine: d.range.start.line + 1,
          startCol: d.range.start.character + 1,
          endLine: d.range.end.line + 1,
          endCol: d.range.end.character + 1,
          source: d.source || `lsp-${lang}`,
        }));

        const currentProblems = useProblemsStore.getState().problems.filter((p) => p.filePath !== uri);
        useProblemsStore.getState().setProblems([...currentProblems, ...newProblems]);
      });

      set((state) => ({
        sessions: {
          ...state.sessions,
          [lang]: {
            languageId: lang,
            sessionId,
            status: 'ready',
            client,
          },
        },
      }));

      return client;
    } catch (e: any) {
      set((state) => ({
        sessions: {
          ...state.sessions,
          [lang]: {
            languageId: lang,
            sessionId,
            status: 'error',
            client: null,
            error: e.message,
          },
        },
      }));
      return null;
    }
  },

  stopServer: async (languageId: string) => {
    const lang = normalizeLanguage(languageId);
    const session = get().sessions[lang];
    if (session && session.client) {
      await session.client.stop();
    }
    set((state) => {
      const next = { ...state.sessions };
      delete next[lang];
      return { sessions: next };
    });
  },

  restartServer: async (languageId: string, workspacePath) => {
    const lang = normalizeLanguage(languageId);
    await get().stopServer(lang);
    return await get().startServer(lang, workspacePath);
  },

  getClient: (languageId: string) => {
    const lang = normalizeLanguage(languageId);
    const session = get().sessions[lang];
    return session?.status === 'ready' ? session.client : null;
  },

  syncDocumentOpen: async (uri: string, languageId: string, text: string) => {
    const lang = normalizeLanguage(languageId);
    const client = get().getClient(lang);
    if (!client) return;

    set((state) => ({
      documentVersions: {
        ...state.documentVersions,
        [uri]: 1,
      },
    }));

    await client.openDocument(uri, lang, 1, text);
  },

  syncDocumentChange: async (uri: string, languageId: string, text: string) => {
    const lang = normalizeLanguage(languageId);
    const client = get().getClient(lang);
    if (!client) return;

    const currentVersion = (get().documentVersions[uri] || 1) + 1;
    set((state) => ({
      documentVersions: {
        ...state.documentVersions,
        [uri]: currentVersion,
      },
    }));

    await client.changeDocument(uri, currentVersion, text);
  },

  syncDocumentClose: async (uri: string, languageId: string) => {
    const lang = normalizeLanguage(languageId);
    const client = get().getClient(lang);
    if (!client) return;

    set((state) => {
      const next = { ...state.documentVersions };
      delete next[uri];
      return { documentVersions: next };
    });

    await client.closeDocument(uri);
  },

  getInstallCommand: (languageId: string) => {
    const lang = normalizeLanguage(languageId);
    const check = get().missingBinaries[lang];
    if (check?.installCommand) return check.installCommand;

    const server = get().builtinServers.find((s) => s.languageId === lang);
    return server?.installCommand || `pkg install -y ${lang}`;
  },
}));
