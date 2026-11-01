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

// ─── Web Simulation State (Browser Fallback) ────────────────────────────────

interface SimulatedSession {
  id: string;
  cwd: string;
  lineBuffer: string;
}

const simulatedSessions = new Map<string, SimulatedSession>();
const webOutputListeners = new Set<(event: TerminalOutputEvent) => void>();
const webExitListeners = new Set<(event: TerminalExitEvent) => void>();
const webProgressListener = new Set<(event: BootstrapProgressEvent) => void>();

let simulatedBootstrapInstalled = false;

function emitWebOutput(sessionId: string, data: string): void {
  const event: TerminalOutputEvent = { sessionId, data };
  webOutputListeners.forEach((listener) => {
    try {
      listener(event);
    } catch (e) {
      console.error('[nativeTerminalBridge] Web output listener error:', e);
    }
  });
}

function emitWebExit(sessionId: string, exitCode: number): void {
  const event: TerminalExitEvent = { sessionId, exitCode };
  webExitListeners.forEach((listener) => {
    try {
      listener(event);
    } catch (e) {
      console.error('[nativeTerminalBridge] Web exit listener error:', e);
    }
  });
}

function emitWebProgress(status: BootstrapProgressEvent['status'], progress: number, message: string): void {
  const event: BootstrapProgressEvent = { status, progress, message };
  webProgressListener.forEach((listener) => {
    try {
      listener(event);
    } catch (e) {
      console.error('[nativeTerminalBridge] Web progress listener error:', e);
    }
  });
}

function getWebPrompt(cwd: string): string {
  const displayCwd = cwd.replace(/^\/sdcard\/Documents\/KryptonIDE/, '~/KryptonIDE').replace(/^\/data\/data\/[^\/]+\/files\/home/, '~');
  return `\x1b[1;38;5;179mkrypton\x1b[0m:\x1b[1;38;5;147m${displayCwd}\x1b[0m$ `;
}

function handleWebCommand(session: SimulatedSession, command: string): void {
  const cmd = command.trim();
  if (!cmd) {
    emitWebOutput(session.id, getWebPrompt(session.cwd));
    return;
  }

  if (cmd === 'clear' || cmd === 'cls') {
    emitWebOutput(session.id, '\x1b[2J\x1b[H' + getWebPrompt(session.cwd));
    return;
  }

  if (cmd === 'exit') {
    emitWebOutput(session.id, 'exit\r\n');
    simulatedSessions.delete(session.id);
    emitWebExit(session.id, 0);
    return;
  }

  if (cmd === 'help') {
    emitWebOutput(
      session.id,
      '\r\n\x1b[1;38;5;179mKrypton Terminal (Web Simulation Mode)\x1b[0m\r\n' +
        '  \x1b[38;5;243mAvailable demo commands: help, clear, pwd, ls, whoami, uname, exit\x1b[0m\r\n' +
        '  \x1b[38;5;110mOn Android, a full native POSIX Linux shell (Termux/Bash) runs locally.\x1b[0m\r\n\r\n' +
        getWebPrompt(session.cwd)
    );
    return;
  }

  if (cmd === 'pwd') {
    emitWebOutput(session.id, `${session.cwd}\r\n` + getWebPrompt(session.cwd));
    return;
  }

  if (cmd === 'whoami') {
    emitWebOutput(session.id, `krypton\r\n` + getWebPrompt(session.cwd));
    return;
  }

  if (cmd.startsWith('uname')) {
    emitWebOutput(session.id, `Linux krypton-web 6.6.0-generic #1 SMP WebAssembly x86_64 GNU/Linux\r\n` + getWebPrompt(session.cwd));
    return;
  }

  if (cmd.startsWith('echo ')) {
    emitWebOutput(session.id, `${cmd.slice(5)}\r\n` + getWebPrompt(session.cwd));
    return;
  }

  if (cmd === 'ls') {
    emitWebOutput(
      session.id,
      `\x1b[1;34msrc\x1b[0m  Cargo.toml  README.md\r\n` +
        getWebPrompt(session.cwd)
    );
    return;
  }

  // Rust / Cargo Execution Simulation for Web Dev Preview
  if (cmd === 'cargo run' || cmd.includes('cargo run') || (cmd.includes('Cargo.toml') && cmd.includes('cargo'))) {
    emitWebOutput(
      session.id,
      `\x1b[1;32m   Compiling\x1b[0m rust_cli v0.1.0 (/project)\r\n` +
        `\x1b[1;32m    Finished\x1b[0m \`dev\` profile [unoptimized + debuginfo] target(s) in 0.52s\r\n` +
        `\x1b[1;32m     Running\x1b[0m \`target/debug/rust_cli\`\r\n` +
        `Hello, Rust from Kryptonide!\r\n` +
        getWebPrompt(session.cwd)
    );
    return;
  }

  if (cmd === 'cargo build' || cmd.includes('cargo build')) {
    emitWebOutput(
      session.id,
      `\x1b[1;32m   Compiling\x1b[0m rust_cli v0.1.0 (/project)\r\n` +
        `\x1b[1;32m    Finished\x1b[0m \`dev\` profile [unoptimized + debuginfo] target(s) in 0.44s\r\n` +
        getWebPrompt(session.cwd)
    );
    return;
  }

  if (cmd === 'cargo test' || cmd.includes('cargo test')) {
    emitWebOutput(
      session.id,
      `\x1b[1;32m   Compiling\x1b[0m rust_cli v0.1.0 (/project)\r\n` +
        `\x1b[1;32m    Finished\x1b[0m \`test\` profile [unoptimized + debuginfo] target(s) in 0.48s\r\n` +
        `\x1b[1;32m     Running\x1b[0m unittests src/main.rs (target/debug/deps/rust_cli-a43b8)\r\n\r\n` +
        `running 1 test\r\n` +
        `test tests::test_sanity ... \x1b[1;32mok\x1b[0m\r\n\r\n` +
        `test result: \x1b[1;32mok\x1b[0m. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s\r\n\r\n` +
        getWebPrompt(session.cwd)
    );
    return;
  }

  if (cmd === 'cargo check' || cmd.includes('cargo check')) {
    emitWebOutput(
      session.id,
      `\x1b[1;32m    Checking\x1b[0m rust_cli v0.1.0 (/project)\r\n` +
        `\x1b[1;32m    Finished\x1b[0m \`dev\` profile [unoptimized + debuginfo] target(s) in 0.12s\r\n` +
        getWebPrompt(session.cwd)
    );
    return;
  }

  if (cmd.startsWith('rustc ') || (cmd.includes('rustc ') && cmd.includes('./main'))) {
    const filenameMatch = cmd.match(/rustc\s+"?([^"\s]+)"?/);
    const targetFile = filenameMatch ? filenameMatch[1] : 'main.rs';
    emitWebOutput(
      session.id,
      `\x1b[1;32m   Compiling\x1b[0m ${targetFile} via rustc (offline)\r\n` +
        `Hello, Rust from Kryptonide!\r\n` +
        getWebPrompt(session.cwd)
    );
    return;
  }

  if (cmd.includes('pkg install rust') || cmd.includes('pkg install')) {
    simulatedBootstrapInstalled = true;
    emitWebOutput(
      session.id,
      `Updating repository catalogs...\r\n` +
        `Reading package lists... Done\r\n` +
        `Building dependency tree... Done\r\n` +
        `\x1b[1;32mSelecting previously unselected package rust-aarch64.\x1b[0m\r\n` +
        `Unpacking rust toolchain (rustc 1.82.0, cargo 1.82.0)...\r\n` +
        `Setting up rust (1.82.0)...\r\n` +
        `\x1b[1;32mRust & Cargo toolchain installed and ready for offline compilation.\x1b[0m\r\n` +
        getWebPrompt(session.cwd)
    );
    return;
  }

  emitWebOutput(
    session.id,
    `bash: ${cmd}: command not found (running in Web Simulation mode — run on Android for full native Linux userland)\r\n` +
      getWebPrompt(session.cwd)
  );
}

// ─── Safe Bridge Implementation ──────────────────────────────────────────────

export class NativeTerminalBridge {
  /**
   * Check if running on native Android with native PTY support.
   */
  isNativePlatform(): boolean {
    return Capacitor.isNativePlatform();
  }

  /**
   * Spawns a PTY session (native Linux subprocess on Android, simulated shell in web).
   */
  async createSession(options?: CreateSessionOptions): Promise<CreateSessionResult> {
    const sessionId = options?.sessionId || `term-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const cwd = options?.cwd || '/data/data/com.sednium.kryptonide/files/home';

    if (this.isNativePlatform()) {
      try {
        return await NativeTerminal.createSession({
          sessionId,
          cwd,
          cmd: options?.cmd,
          rows: options?.rows ?? 24,
          cols: options?.cols ?? 80,
          env: options?.env,
        });
      } catch (e) {
        console.error('[nativeTerminalBridge] Native createSession error, falling back:', e);
      }
    }

    // Web simulation fallback
    const pid = 1000 + Math.floor(Math.random() * 9000);
    const session: SimulatedSession = {
      id: sessionId,
      cwd,
      lineBuffer: '',
    };
    simulatedSessions.set(sessionId, session);

    // Initial greeting in next event loop tick so listeners are ready
    setTimeout(() => {
      const banner =
        '\r\n\x1b[1;38;5;179m  Krypton Terminal (Web Simulation)\x1b[0m\r\n' +
        '\x1b[38;5;243m  Browser dev preview. Full Linux Termux PTY active on Android devices.\x1b[0m\r\n\r\n' +
        getWebPrompt(cwd);
      emitWebOutput(sessionId, banner);
    }, 50);

    return { sessionId, pid };
  }

  /**
   * Writes raw bytes / UTF-8 string into PTY master descriptor or web shell.
   */
  async write(options: WriteOptions): Promise<void> {
    if (this.isNativePlatform()) {
      try {
        await NativeTerminal.write(options);
        return;
      } catch (e) {
        console.error('[nativeTerminalBridge] Native write error:', e);
      }
    }

    // Web simulation typing handling
    let session = simulatedSessions.get(options.sessionId);
    if (!session && simulatedSessions.size > 0) {
      session = Array.from(simulatedSessions.values()).find((s) => s.id.includes('project')) || simulatedSessions.values().next().value;
    }
    if (!session) return;

    const data = options.data;
    for (let i = 0; i < data.length; i++) {
      const ch = data[i];

      if (ch === '\r' || ch === '\n') {
        emitWebOutput(session.id, '\r\n');
        const cmd = session.lineBuffer;
        session.lineBuffer = '';
        handleWebCommand(session, cmd);
      } else if (ch === '\x7f' || ch === '\b') {
        if (session.lineBuffer.length > 0) {
          session.lineBuffer = session.lineBuffer.slice(0, -1);
          emitWebOutput(session.id, '\b \b');
        }
      } else if (ch === '\x03') {
        // Ctrl+C
        session.lineBuffer = '';
        emitWebOutput(session.id, '^C\r\n' + getWebPrompt(session.cwd));
      } else if (ch === '\x04') {
        // Ctrl+D
        if (session.lineBuffer.length === 0) {
          emitWebOutput(session.id, 'exit\r\n');
          simulatedSessions.delete(session.id);
          emitWebExit(session.id, 0);
          return;
        }
      } else if (ch >= ' ') {
        session.lineBuffer += ch;
        emitWebOutput(session.id, ch);
      }
    }
  }

  /**
   * Resize PTY window dimensions (rows and columns).
   */
  async resize(options: ResizeOptions): Promise<void> {
    if (this.isNativePlatform()) {
      try {
        await NativeTerminal.resize(options);
      } catch (e) {
        console.error('[nativeTerminalBridge] Native resize error:', e);
      }
    }
  }

  /**
   * Terminate a PTY subprocess.
   */
  async killSession(options: KillSessionOptions): Promise<void> {
    if (this.isNativePlatform()) {
      try {
        await NativeTerminal.killSession(options);
        return;
      } catch (e) {
        console.error('[nativeTerminalBridge] Native killSession error:', e);
      }
    }

    if (simulatedSessions.has(options.sessionId)) {
      simulatedSessions.delete(options.sessionId);
      emitWebExit(options.sessionId, 0);
    }
  }

  /**
   * Checks if Termux bootstrap rootfs is installed on Android storage.
   */
  async getBootstrapStatus(): Promise<BootstrapStatus> {
    if (this.isNativePlatform()) {
      try {
        return await NativeTerminal.getBootstrapStatus();
      } catch (e) {
        console.error('[nativeTerminalBridge] Native getBootstrapStatus error:', e);
      }
    }

    return {
      installed: simulatedBootstrapInstalled,
      prefixPath: '/data/data/com.sednium.kryptonide/files/usr',
      homePath: '/data/data/com.sednium.kryptonide/files/home',
      hasBash: simulatedBootstrapInstalled,
      hasPython: simulatedBootstrapInstalled,
      hasRust: simulatedBootstrapInstalled,
      hasNode: simulatedBootstrapInstalled,
      hasClang: simulatedBootstrapInstalled,
      arch: 'web',
    };
  }

  /**
   * Initiates download and unpacking of Termux bootstrap tar.xz userland.
   */
  async installTermuxBootstrap(): Promise<InstallBootstrapResult> {
    if (this.isNativePlatform()) {
      try {
        return await NativeTerminal.installTermuxBootstrap();
      } catch (e) {
        console.error('[nativeTerminalBridge] Native installTermuxBootstrap error:', e);
        throw e;
      }
    }

    // Web simulation progress sequence
    emitWebProgress('checking', 10, 'Checking web environment architecture...');
    await new Promise((r) => setTimeout(r, 200));

    emitWebProgress('downloading', 40, 'Simulating bootstrap download (45MB)...');
    await new Promise((r) => setTimeout(r, 400));

    emitWebProgress('extracting', 75, 'Simulating rootfs extraction into /files/usr...');
    await new Promise((r) => setTimeout(r, 400));

    emitWebProgress('configuring', 90, 'Setting symlinks and executable bits...');
    await new Promise((r) => setTimeout(r, 300));

    simulatedBootstrapInstalled = true;
    emitWebProgress('ready', 100, 'Termux bootstrap userland ready.');

    return { success: true };
  }

  /**
   * Listen to streaming terminal output.
   */
  async addTerminalOutputListener(
    listener: (event: TerminalOutputEvent) => void
  ): Promise<PluginListenerHandle> {
    if (this.isNativePlatform()) {
      return await NativeTerminal.addListener('terminalOutput', listener);
    }

    webOutputListeners.add(listener);
    return {
      remove: async () => {
        webOutputListeners.delete(listener);
      },
    };
  }

  /**
   * Listen to session process exit events.
   */
  async addTerminalExitListener(
    listener: (event: TerminalExitEvent) => void
  ): Promise<PluginListenerHandle> {
    if (this.isNativePlatform()) {
      return await NativeTerminal.addListener('terminalExit', listener);
    }

    webExitListeners.add(listener);
    return {
      remove: async () => {
        webExitListeners.delete(listener);
      },
    };
  }

  /**
   * Listen to Termux bootstrap download/installation progress.
   */
  async addBootstrapProgressListener(
    listener: (event: BootstrapProgressEvent) => void
  ): Promise<PluginListenerHandle> {
    if (this.isNativePlatform()) {
      return await NativeTerminal.addListener('bootstrapProgress', listener);
    }

    webProgressListener.add(listener);
    return {
      remove: async () => {
        webProgressListener.delete(listener);
      },
    };
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

export const nativeTerminalBridge = new NativeTerminalBridge();

// Convenience aliases
export const isNativePlatform = () => nativeTerminalBridge.isNativePlatform();
export const createSession = (opts?: CreateSessionOptions) => nativeTerminalBridge.createSession(opts);
export const writeTerminal = (opts: WriteOptions) => nativeTerminalBridge.write(opts);
export const resizeTerminal = (opts: ResizeOptions) => nativeTerminalBridge.resize(opts);
export const killSession = (opts: KillSessionOptions) => nativeTerminalBridge.killSession(opts);
export const getBootstrapStatus = () => nativeTerminalBridge.getBootstrapStatus();
export const installTermuxBootstrap = () => nativeTerminalBridge.installTermuxBootstrap();
export const onTerminalOutput = (fn: (e: TerminalOutputEvent) => void) => nativeTerminalBridge.addTerminalOutputListener(fn);
export const onTerminalExit = (fn: (e: TerminalExitEvent) => void) => nativeTerminalBridge.addTerminalExitListener(fn);
export const onBootstrapProgress = (fn: (e: BootstrapProgressEvent) => void) => nativeTerminalBridge.addBootstrapProgressListener(fn);

export default nativeTerminalBridge;
