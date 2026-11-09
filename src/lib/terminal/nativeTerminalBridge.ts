import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface BootstrapStatus {
  installed: boolean;
  prefixPath: string;
  homePath: string;
  hasBash: boolean;
  hasPython: boolean;
  hasRust: boolean;
  hasNode: boolean;
  hasClang: boolean;
  arch: string;
}

export interface BootstrapProgressEvent {
  status: 'checking' | 'downloading' | 'extracting' | 'configuring' | 'ready' | 'error';
  progress: number;
  message: string;
}

export interface TerminalOutputEvent {
  sessionId: string;
  data: string;
}

export interface TerminalExitEvent {
  sessionId: string;
  exitCode: number;
}

export interface CreateSessionOptions {
  sessionId?: string;
  cwd?: string;
  cmd?: string;
  rows?: number;
  cols?: number;
  env?: Record<string, string> | string[];
}

export interface CreateSessionResult {
  sessionId: string;
  pid: number;
}

export interface WriteOptions {
  sessionId: string;
  data: string;
}

export interface ResizeOptions {
  sessionId: string;
  rows: number;
  cols: number;
}

export interface KillSessionOptions {
  sessionId: string;
}

export interface InstallBootstrapResult {
  success: boolean;
}

export interface NativeTerminalPlugin {
  createSession(options?: CreateSessionOptions): Promise<CreateSessionResult>;
  write(options: WriteOptions): Promise<void>;
  resize(options: ResizeOptions): Promise<void>;
  killSession(options: KillSessionOptions): Promise<void>;
  getBootstrapStatus(): Promise<BootstrapStatus>;
  installTermuxBootstrap(): Promise<InstallBootstrapResult>;
  addListener(
    eventName: 'terminalOutput',
    listenerFunc: (event: TerminalOutputEvent) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'terminalExit',
    listenerFunc: (event: TerminalExitEvent) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'bootstrapProgress',
    listenerFunc: (event: BootstrapProgressEvent) => void
  ): Promise<PluginListenerHandle>;
}

// ─── Capacitor Plugin Registration ──────────────────────────────────────────

export const NativeTerminal = registerPlugin<NativeTerminalPlugin>('NativeTerminal');

const WEB_UNAVAILABLE_MESSAGE =
  'The native Linux terminal is only available in the Android app. The browser build cannot execute shell commands or install the Termux bootstrap.';

// ─── Native-Only Bridge ──────────────────────────────────────────────────────

/**
 * Thin, truthful wrapper around the Android `NativeTerminal` plugin.
 *
 * There is deliberately no browser shell simulation: commands typed in the web
 * build must never appear to compile or install software that does not exist.
 * Callers should surface `WEB_UNAVAILABLE_MESSAGE` in the terminal panel.
 */
export class NativeTerminalBridge {
  isNativePlatform(): boolean {
    return Capacitor.isNativePlatform();
  }

  private assertNative(): void {
    if (!this.isNativePlatform()) {
      throw new Error(WEB_UNAVAILABLE_MESSAGE);
    }
  }

  async createSession(options?: CreateSessionOptions): Promise<CreateSessionResult> {
    this.assertNative();
    const sessionId = options?.sessionId || `term-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const cwd = options?.cwd || '/data/data/com.sednium.kryptonide.legacy/files/home';

    return NativeTerminal.createSession({
      sessionId,
      cwd,
      cmd: options?.cmd,
      rows: options?.rows ?? 24,
      cols: options?.cols ?? 80,
      env: options?.env,
    });
  }

  async write(options: WriteOptions): Promise<void> {
    this.assertNative();
    await NativeTerminal.write(options);
  }

  async resize(options: ResizeOptions): Promise<void> {
    if (!this.isNativePlatform()) return;
    await NativeTerminal.resize(options);
  }

  async killSession(options: KillSessionOptions): Promise<void> {
    if (!this.isNativePlatform()) return;
    await NativeTerminal.killSession(options);
  }

  async getBootstrapStatus(): Promise<BootstrapStatus> {
    if (this.isNativePlatform()) {
      return NativeTerminal.getBootstrapStatus();
    }

    return {
      installed: false,
      prefixPath: '/data/data/com.sednium.kryptonide.legacy/files/usr',
      homePath: '/data/data/com.sednium.kryptonide.legacy/files/home',
      hasBash: false,
      hasPython: false,
      hasRust: false,
      hasNode: false,
      hasClang: false,
      arch: 'web',
    };
  }

  async installTermuxBootstrap(): Promise<InstallBootstrapResult> {
    this.assertNative();
    return NativeTerminal.installTermuxBootstrap();
  }

  async addTerminalOutputListener(
    listener: (event: TerminalOutputEvent) => void
  ): Promise<PluginListenerHandle> {
    if (!this.isNativePlatform()) {
      return { remove: async () => {} };
    }
    return NativeTerminal.addListener('terminalOutput', listener);
  }

  async addTerminalExitListener(
    listener: (event: TerminalExitEvent) => void
  ): Promise<PluginListenerHandle> {
    if (!this.isNativePlatform()) {
      return { remove: async () => {} };
    }
    return NativeTerminal.addListener('terminalExit', listener);
  }

  async addBootstrapProgressListener(
    listener: (event: BootstrapProgressEvent) => void
  ): Promise<PluginListenerHandle> {
    if (!this.isNativePlatform()) {
      return { remove: async () => {} };
    }
    return NativeTerminal.addListener('bootstrapProgress', listener);
  }
}

export const nativeTerminalBridge = new NativeTerminalBridge();
export { WEB_UNAVAILABLE_MESSAGE };
