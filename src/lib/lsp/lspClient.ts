import { NativeExtensionHost, LspServerConfig } from '../extensions/nativeExtensionHost';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspDiagnostic {
  range: LspRange;
  severity?: number; // 1 = Error, 2 = Warning, 3 = Info, 4 = Hint
  code?: string | number;
  source?: string;
  message: string;
}

export interface PublishDiagnosticsParams {
  uri: string;
  version?: number;
  diagnostics: LspDiagnostic[];
}

export interface ServerCapabilities {
  textDocumentSync?: any;
  completionProvider?: any;
  hoverProvider?: any;
  definitionProvider?: any;
  referencesProvider?: any;
  documentSymbolProvider?: any;
}

export interface InitializeResult {
  capabilities: ServerCapabilities;
  serverInfo?: {
    name: string;
    version?: string;
  };
}

export class LspClient {
  public readonly sessionId: string;
  public readonly languageId: string;
  private config: LspServerConfig;
  private nextRequestId = 1;
  private pendingRequests = new Map<
    number,
    {
      resolve: (result: any) => void;
      reject: (err: any) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private notificationListeners = new Map<string, Set<(params: any) => void>>();
  private drainInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  public capabilities: ServerCapabilities = {};

  constructor(config: LspServerConfig) {
    this.config = config;
    this.sessionId = config.id;
    this.languageId = config.languageId;
  }

  /**
   * Spawns the language server and starts the message draining pump.
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    const res = await NativeExtensionHost.startLspServer(this.config);
    if (!res.success) {
      throw new Error(`Failed to start LSP server for ${this.languageId}`);
    }

    this.isRunning = true;
    this.startDrainLoop();
  }

  private startDrainLoop() {
    if (this.drainInterval) clearInterval(this.drainInterval);

    this.drainInterval = setInterval(async () => {
      if (!this.isRunning) return;
      try {
        const res = await NativeExtensionHost.drainLspMessages({ sessionId: this.sessionId });
        if (res.success && res.messages && res.messages.length > 0) {
          for (const msgStr of res.messages) {
            this.handleIncomingRawMessage(msgStr);
          }
        }
      } catch (e) {
        console.warn(`[LspClient:${this.sessionId}] Error draining messages:`, e);
      }
    }, 40);
  }

  /**
   * Processes an incoming JSON-RPC raw string.
   */
  public handleIncomingRawMessage(raw: string) {
    try {
      const data = JSON.parse(raw);
      if (typeof data.id === 'number' && (data.result !== undefined || data.error !== undefined)) {
        // Response to a request
        const pending = this.pendingRequests.get(data.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(data.id);
          if (data.error) {
            pending.reject(new Error(data.error.message || `LSP Error ${data.error.code}`));
          } else {
            pending.resolve(data.result);
          }
        }
      } else if (typeof data.method === 'string') {
        // Notification from server
        const listeners = this.notificationListeners.get(data.method);
        if (listeners) {
          listeners.forEach((fn) => {
            try {
              fn(data.params);
            } catch (err) {
              console.error(`[LspClient:${this.sessionId}] Listener error:`, err);
            }
          });
        }
      }
    } catch (e) {
      console.warn(`[LspClient:${this.sessionId}] Invalid incoming JSON-RPC message:`, raw);
    }
  }

  /**
   * Sends a JSON-RPC request and awaits the server's response.
   */
  async sendRequest<T = any>(method: string, params?: any, timeoutMs = 8000): Promise<T> {
    if (!this.isRunning) {
      throw new Error(`Cannot send request '${method}': LSP server is not running`);
    }

    const id = this.nextRequestId++;
    const payload: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP request '${method}' (id ${id}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });

      NativeExtensionHost.sendLspMessage({
        sessionId: this.sessionId,
        message: JSON.stringify(payload),
      }).catch((err) => {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(err);
      });
    });
  }

  /**
   * Sends a JSON-RPC notification (no response expected).
   */
  async sendNotification(method: string, params?: any): Promise<void> {
    if (!this.isRunning) return;

    const payload: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    await NativeExtensionHost.sendLspMessage({
      sessionId: this.sessionId,
      message: JSON.stringify(payload),
    });
  }

  /**
   * Subscribes to a JSON-RPC notification method from the server.
   */
  onNotification(method: string, listener: (params: any) => void): () => void {
    if (!this.notificationListeners.has(method)) {
      this.notificationListeners.set(method, new Set());
    }
    const set = this.notificationListeners.get(method)!;
    set.add(listener);

    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.notificationListeners.delete(method);
      }
    };
  }

  /**
   * Convenience helper to listen for textDocument/publishDiagnostics.
   */
  onDiagnostics(listener: (params: PublishDiagnosticsParams) => void): () => void {
    return this.onNotification('textDocument/publishDiagnostics', listener);
  }

  /**
   * Executes standard LSP initialization handshake:
   * 1. Request 'initialize' with client capabilities
   * 2. Send 'initialized' notification
   */
  async initialize(rootUri = 'file:///workspace'): Promise<InitializeResult> {
    const initParams = {
      processId: null,
      rootUri,
      capabilities: {
        workspace: {
          applyEdit: true,
          configuration: true,
        },
        textDocument: {
          synchronization: {
            dynamicRegistration: false,
            willSave: false,
            willSaveWaitUntil: false,
            didSave: true,
          },
          completion: {
            dynamicRegistration: false,
            completionItem: {
              snippetSupport: true,
              documentationFormat: ['markdown', 'plaintext'],
            },
          },
          hover: {
            contentFormat: ['markdown', 'plaintext'],
          },
          definition: {
            dynamicRegistration: false,
          },
          publishDiagnostics: {
            relatedInformation: true,
          },
        },
      },
    };

    const res = await this.sendRequest<InitializeResult>('initialize', initParams);
    this.capabilities = res?.capabilities || {};
    await this.sendNotification('initialized', {});
    return res;
  }

  /**
   * Document Synchronization: didOpen
   */
  async openDocument(uri: string, languageId: string, version: number, text: string): Promise<void> {
    await this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version,
        text,
      },
    });
  }

  /**
   * Document Synchronization: didChange (Full text sync)
   */
  async changeDocument(uri: string, version: number, text: string): Promise<void> {
    await this.sendNotification('textDocument/didChange', {
      textDocument: {
        uri,
        version,
      },
      contentChanges: [
        {
          text,
        },
      ],
    });
  }

  /**
   * Document Synchronization: didSave
   */
  async saveDocument(uri: string, text?: string): Promise<void> {
    const params: any = {
      textDocument: { uri },
    };
    if (text !== undefined) {
      params.text = text;
    }
    await this.sendNotification('textDocument/didSave', params);
  }

  /**
   * Document Synchronization: didClose
   */
  async closeDocument(uri: string): Promise<void> {
    await this.sendNotification('textDocument/didClose', {
      textDocument: { uri },
    });
  }

  /**
   * Language feature: textDocument/completion
   */
  async requestCompletion(uri: string, line: number, character: number): Promise<any> {
    return await this.sendRequest('textDocument/completion', {
      textDocument: { uri },
      position: { line, character },
    });
  }

  /**
   * Language feature: textDocument/hover
   */
  async requestHover(uri: string, line: number, character: number): Promise<any> {
    return await this.sendRequest('textDocument/hover', {
      textDocument: { uri },
      position: { line, character },
    });
  }

  /**
   * Language feature: textDocument/definition
   */
  async requestDefinition(uri: string, line: number, character: number): Promise<any> {
    return await this.sendRequest('textDocument/definition', {
      textDocument: { uri },
      position: { line, character },
    });
  }

  /**
   * Stops the LSP client and terminates the server session.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.drainInterval) {
      clearInterval(this.drainInterval);
      this.drainInterval = null;
    }

    try {
      await this.sendRequest('shutdown', null, 2000);
      await this.sendNotification('exit', null);
    } catch {
      // Ignore shutdown errors on exit
    }

    for (const [id, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error('LSP server stopped'));
    }
    this.pendingRequests.clear();

    await NativeExtensionHost.stopLspServer({ sessionId: this.sessionId });
  }
}
