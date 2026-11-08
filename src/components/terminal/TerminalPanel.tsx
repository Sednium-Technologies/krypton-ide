import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import {
  Folder,
  Zap,
  Trash2,
  RotateCw,
  Download,
  Cpu,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Play,
} from 'lucide-react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useNativeTerminalStore } from '../../store/useNativeTerminalStore';
import { useProjectsStore } from '../../store/useProjectsStore';
import { useIdeStore } from '../../store/useIdeStore';
import { TerminalAccessoryBar } from './TerminalAccessoryBar';
import { TermuxBootstrapModal } from './TermuxBootstrapModal';

const IVORY_TERMINAL_THEME = {
  background: '#f3f0e7',
  foreground: '#2a2529',
  cursor: '#2a2529',
  cursorAccent: '#f3f0e7',
  selectionForeground: '#2a2529',
  selectionBackground: 'rgba(42, 37, 41, 0.25)',
  black: '#2a2529',
  red: '#d32f2f',
  green: '#2e7d32',
  yellow: '#b45309',
  blue: '#1976d2',
  magenta: '#7b1fa2',
  cyan: '#0288d1',
  white: '#e8e4d9',
  brightBlack: '#686066',
  brightRed: '#ef5350',
  brightGreen: '#4caf50',
  brightYellow: '#f59e0b',
  brightBlue: '#42a5f5',
  brightMagenta: '#ab47bc',
  brightCyan: '#26c6da',
  brightWhite: '#ffffff',
};

const DARK_TERMINAL_THEME = {
  background: '#2a2529',
  foreground: '#f3f0e7',
  cursor: '#f3f0e7',
  cursorAccent: '#2a2529',
  selectionForeground: '#ffffff',
  selectionBackground: 'rgba(243, 240, 231, 0.3)',
  black: '#2a2529',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#f3f0e7',
  blue: '#88c0d0',
  magenta: '#9b8ec4',
  cyan: '#88c0d0',
  white: '#f3f0e7',
  brightBlack: '#4e474d',
  brightRed: '#ffa198',
  brightGreen: '#b4d29a',
  brightYellow: '#d4b57b',
  brightBlue: '#9dcde4',
  brightMagenta: '#b3a5db',
  brightCyan: '#9dcde4',
  brightWhite: '#ffffff',
};

export function TerminalPanel() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const theme = useIdeStore((s) => s.theme);
  const isLight = theme === 'light';

  // Zustand Store
  const activeTab = useNativeTerminalStore((s) => s.activeTab);
  const switchTab = useNativeTerminalStore((s) => s.switchTab);
  const initSession = useNativeTerminalStore((s) => s.initSession);
  const sendInput = useNativeTerminalStore((s) => s.sendInput);
  const resizePty = useNativeTerminalStore((s) => s.resize);
  const restartSession = useNativeTerminalStore((s) => s.restartSession);
  const clearBuffer = useNativeTerminalStore((s) => s.clearBuffer);
  const getBufferText = useNativeTerminalStore((s) => s.getBufferText);
  const subscribeOutput = useNativeTerminalStore((s) => s.subscribeOutput);
  const bootstrapStatus = useNativeTerminalStore((s) => s.bootstrapStatus);
  const checkBootstrapStatus = useNativeTerminalStore((s) => s.checkBootstrapStatus);

  // Projects & IDE Store
  const currentProjectId = useProjectsStore((s) => s.currentProjectId);
  const projects = useProjectsStore((s) => s.projects);
  const currentProject = currentProjectId ? projects[currentProjectId] : null;
  const projectName = currentProject?.name || 'Default';
  const files = useIdeStore((s) => s.files);
  const isRustProject = currentProject?.template === 'rust-cli' || Object.values(files).some((f) => f.name === 'Cargo.toml');

  // Local UI state
  const [isBootstrapModalOpen, setIsBootstrapModalOpen] = useState(false);
  const [ctrlActive, setCtrlActive] = useState(false);
  const [altActive, setAltActive] = useState(false);

  // Mutable refs for callbacks
  const activeTabRef = useRef<'project' | 'system'>(activeTab);
  activeTabRef.current = activeTab;

  const ctrlActiveRef = useRef<boolean>(ctrlActive);
  ctrlActiveRef.current = ctrlActive;

  const altActiveRef = useRef<boolean>(altActive);
  altActiveRef.current = altActive;

  // Initialize bootstrap status on mount
  useEffect(() => {
    checkBootstrapStatus();
  }, [checkBootstrapStatus]);

  // Dynamically update terminal ANSI theme on theme change
  useEffect(() => {
    if (termInstance.current) {
      termInstance.current.options.theme = isLight ? IVORY_TERMINAL_THEME : DARK_TERMINAL_THEME;
    }
  }, [isLight]);

  // Safe fit helper
  const safeFitAndResize = useCallback(() => {
    const container = terminalRef.current;
    const term = termInstance.current;
    const fit = fitAddon.current;

    if (!container || !term || !fit) return;
    if (container.clientWidth <= 0 || container.clientHeight <= 0) return;

    try {
      fit.fit();
      if (term.rows > 0 && term.cols > 0) {
        resizePty(term.rows, term.cols, activeTabRef.current);
      }
    } catch (e) {
      // Ignore initial layout timing errors
    }
  }, [resizePty]);

  // Initialize xterm.js instance
  useEffect(() => {
    if (!terminalRef.current) return;
    const container = terminalRef.current;

    const term = new Terminal({
      theme: isLight ? IVORY_TERMINAL_THEME : DARK_TERMINAL_THEME,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
      fontSize: 13,
      cursorBlink: true,
      cursorStyle: 'bar',
      letterSpacing: 0.5,
      lineHeight: 1.2,
      convertEol: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);

    // Open terminal using robust, crash-free DOM renderer
    term.open(container);

    termInstance.current = term;
    fitAddon.current = fit;

    // Handle user keyboard input
    const onDataDisposable = term.onData((data) => {
      let input = data;

      // Handle CTRL modifier if activated via accessory bar
      if (ctrlActiveRef.current && data.length === 1) {
        const code = data.charCodeAt(0);
        if (code >= 97 && code <= 122) {
          // a-z -> 0x01 to 0x1a
          input = String.fromCharCode(code - 96);
          setCtrlActive(false);
        } else if (code >= 65 && code <= 90) {
          // A-Z -> 0x01 to 0x1a
          input = String.fromCharCode(code - 64);
          setCtrlActive(false);
        }
      } else if (altActiveRef.current && data.length === 1) {
        input = '\x1b' + data;
        setAltActive(false);
      }

      sendInput(input, activeTabRef.current);
    });

    // Resize observer & window resize
    const handleResize = () => safeFitAndResize();
    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => safeFitAndResize());
    });
    resizeObserver.observe(container);

    // Initial sizing
    setTimeout(() => safeFitAndResize(), 60);

    return () => {
      window.removeEventListener('resize', handleResize);
      try { resizeObserver.disconnect(); } catch {}
      try { onDataDisposable.dispose(); } catch {}
      try { term.dispose(); } catch {}
      termInstance.current = null;
      fitAddon.current = null;
    };
  }, [sendInput, safeFitAndResize]);

  // Tab switching effect: clear screen, write new tab buffer, subscribe output
  useEffect(() => {
    const term = termInstance.current;
    if (!term) return;

    // Unsubscribe previous tab
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    // Ensure session is initialized
    try {
      initSession(activeTab);
    } catch {}

    // Reset xterm view safely
    try {
      if ((term as any)._core?._renderService?.dimensions?.css?.cell?.height) {
        term.reset();
      } else {
        term.clear();
      }
      const buffered = getBufferText(activeTab);
      if (buffered) {
        term.write(buffered);
      }
    } catch {
      try { term.clear(); } catch {}
    }

    // Fit & resize PTY
    requestAnimationFrame(() => {
      safeFitAndResize();
    });

    // Subscribe to streaming output of this tab
    unsubscribeRef.current = subscribeOutput(activeTab, (chunk) => {
      if (termInstance.current) {
        try {
          termInstance.current.write(chunk);
        } catch {}
      }
    });

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [activeTab, initSession, getBufferText, subscribeOutput, safeFitAndResize]);

  // Action handlers
  const handleTabSwitch = (tab: 'project' | 'system') => {
    if (tab === activeTab) return;
    try {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    } catch {}
    try {
      switchTab(tab);
    } catch (e) {
      console.warn('Tab switch failed:', e);
    }
  };

  const handleClear = () => {
    try {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    } catch {}

    if (termInstance.current) {
      try {
        termInstance.current.reset();
      } catch {
        try { termInstance.current.clear(); } catch {}
      }
    }
    try {
      clearBuffer(activeTab);
      sendInput('\x0C', activeTab);
    } catch (e) {
      console.warn('Clear buffer failed:', e);
    }
  };

  const handleRestart = async () => {
    try {
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    } catch {}

    if (termInstance.current) {
      try {
        termInstance.current.reset();
        termInstance.current.writeln('\x1b[33m[Restarting terminal session...]\x1b[0m\r\n');
      } catch {
        try { termInstance.current.clear(); } catch {}
      }
    }
    try {
      await restartSession(activeTab);
    } catch (e) {
      console.warn('Restart session failed:', e);
    }
  };

  const handleAccessoryInput = (key: string) => {
    sendInput(key, activeTab);
  };

  const isBootstrapInstalled = bootstrapStatus?.installed ?? false;

  return (
    <div className="flex h-full flex-col bg-[#2a2529] text-[#f3f0e7] overflow-hidden select-none">
      {/* Dual Tab Header & Actions Bar */}
      <div className="flex h-10 items-center justify-between px-2 sm:px-3 bg-[#231e22] border-b border-[#f3f0e7]/10 shrink-0">
        {/* Tabs */}
        <div 
          role="tablist"
          aria-label="Terminal sessions"
          className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto scrollbar-hide py-1"
        >
          {/* Tab 1: Project Shell */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'project'}
            aria-label="Project Shell tab"
            title="Project Shell tab"
            onClick={() => handleTabSwitch('project')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${
              activeTab === 'project'
                ? 'bg-[#342f33] text-[#f3f0e7] shadow-sm border border-[#f3f0e7]/15'
                : 'text-[#f3f0e7]/75 hover:text-[#f3f0e7] hover:bg-[#342f33]/50'
            }`}
          >
            <Folder size={13} className="shrink-0 text-amber-400" />
            <span className="whitespace-nowrap font-semibold">Project Shell</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#231e22] text-[#f3f0e7]/70 font-mono truncate max-w-[80px] sm:max-w-[120px]">
              {projectName}
            </span>
          </button>

          {/* Tab 2: System Shell */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'system'}
            aria-label="System Shell tab"
            title="System Shell tab"
            onClick={() => handleTabSwitch('system')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${
              activeTab === 'system'
                ? 'bg-[#342f33] text-[#f3f0e7] shadow-sm border border-[#f3f0e7]/15'
                : 'text-[#f3f0e7]/75 hover:text-[#f3f0e7] hover:bg-[#342f33]/50'
            }`}
          >
            <Zap size={13} className="shrink-0 text-[#88c0d0]" />
            <span className="whitespace-nowrap font-semibold">System Shell</span>
            {isBootstrapInstalled ? (
              <span className="inline-flex items-center text-[10px] font-medium text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.2 rounded-full">
                Ready
              </span>
            ) : (
              <span className="inline-flex items-center text-[10px] font-medium text-amber-400 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.2 rounded-full">
                Minimal
              </span>
            )}
          </button>
        </div>

        {/* Quick Rust / Cargo Actions */}
        {activeTab === 'project' && isRustProject && (
          <div className="flex items-center space-x-1 border-l border-[#f3f0e7]/10 pl-2 ml-1">
            <button
              type="button"
              onClick={() => sendInput('cargo run\n', 'project')}
              className="flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-[11px] font-mono font-medium border border-amber-500/30 transition-all active:scale-95"
              title="Compile and run (cargo run)"
            >
              <Play size={10} fill="currentColor" />
              <span>cargo run</span>
            </button>
            <button
              type="button"
              onClick={() => sendInput('cargo build\n', 'project')}
              className="hidden sm:inline-block px-2 py-0.5 rounded bg-[#342f33] hover:bg-[#342f33]/80 text-[#f3f0e7]/80 text-[11px] font-mono border border-[#f3f0e7]/10 transition-all active:scale-95"
              title="Compile debug binary (cargo build)"
            >
              build
            </button>
            <button
              type="button"
              onClick={() => sendInput('cargo test\n', 'project')}
              className="hidden sm:inline-block px-2 py-0.5 rounded bg-[#342f33] hover:bg-[#342f33]/80 text-[#f3f0e7]/80 text-[11px] font-mono border border-[#f3f0e7]/10 transition-all active:scale-95"
              title="Run test suite (cargo test)"
            >
              test
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center space-x-1 shrink-0 ml-auto">
          {/* Termux Ecosystem / Installer Button */}
          {!isBootstrapInstalled ? (
            <button
              type="button"
              onClick={() => setIsBootstrapModalOpen(true)}
              className="p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15 rounded-md transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:outline-none"
              title="Install Full Termux Subsystem"
              aria-label="Install Termux subsystem"
            >
              <Download size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsBootstrapModalOpen(true)}
              className="p-1.5 text-[#f3f0e7]/75 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
              title="Termux Subsystem Info & Packages"
              aria-label="Termux subsystem info and packages"
            >
              <Cpu size={14} />
            </button>
          )}

          {/* Clear Screen */}
          <button
            type="button"
            onClick={handleClear}
            className="p-1.5 text-[#f3f0e7]/75 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
            title="Clear terminal screen"
            aria-label="Clear terminal screen"
          >
            <Trash2 size={14} />
          </button>

          {/* Restart Session */}
          <button
            type="button"
            onClick={handleRestart}
            className="p-1.5 text-[#f3f0e7]/75 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
            title="Restart terminal session"
            aria-label="Restart terminal session"
          >
            <RotateCw size={14} />
          </button>
        </div>
      </div>

      {/* Main Terminal View (xterm container) */}
      <div className="flex-1 min-h-0 overflow-hidden pl-2 pt-1 bg-[#2a2529]" ref={terminalRef} />

      {/* Touch Accessory Toolbar */}
      <TerminalAccessoryBar
        onSendInput={handleAccessoryInput}
        ctrlActive={ctrlActive}
        altActive={altActive}
        onToggleCtrl={() => setCtrlActive((c) => !c)}
        onToggleAlt={() => setAltActive((a) => !a)}
      />

      {/* Termux Bootstrap Installer Modal */}
      <TermuxBootstrapModal
        isOpen={isBootstrapModalOpen}
        onClose={() => setIsBootstrapModalOpen(false)}
      />
    </div>
  );
}
