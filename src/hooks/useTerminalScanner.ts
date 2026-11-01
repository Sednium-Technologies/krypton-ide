import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { nativeTerminalBridge } from '../lib/terminal/nativeTerminalBridge';
import { useHarnessStore } from '../store/useHarnessStore';

export interface ScannedTool {
  id: string;
  name: string;
  category: 'Agent Harness' | 'Runtime' | 'Compiler' | 'Utility';
  binary: string;
  isInstalled: boolean;
  version?: string;
  path?: string;
}

const KNOWN_TOOLS: Omit<ScannedTool, 'isInstalled' | 'version' | 'path'>[] = [
  // Agent Harnesses
  { id: 'claude-code', name: 'Claude Code', category: 'Agent Harness', binary: 'claude' },
  { id: 'antigravity', name: 'Antigravity CLI', category: 'Agent Harness', binary: 'antigravity' },
  { id: 'gemini-cli', name: 'Gemini CLI', category: 'Agent Harness', binary: 'gemini' },
  { id: 'aider', name: 'Aider', category: 'Agent Harness', binary: 'aider' },
  { id: 'roo-cline', name: 'Roo Code', category: 'Agent Harness', binary: 'roo' },
  // Developer Runtimes
  { id: 'node', name: 'Node.js', category: 'Runtime', binary: 'node' },
  { id: 'npm', name: 'NPM Package Manager', category: 'Runtime', binary: 'npm' },
  { id: 'python3', name: 'Python 3', category: 'Runtime', binary: 'python3' },
  { id: 'git', name: 'Git Version Control', category: 'Utility', binary: 'git' },
  { id: 'cargo', name: 'Rust Cargo', category: 'Compiler', binary: 'cargo' },
  { id: 'clang', name: 'Clang / C++', category: 'Compiler', binary: 'clang' },
  { id: 'make', name: 'GNU Make', category: 'Utility', binary: 'make' },
  { id: 'curl', name: 'cURL Network Utility', category: 'Utility', binary: 'curl' },
];

export function useTerminalScanner() {
  const [tools, setTools] = useState<ScannedTool[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const updateHarnessInstallStatus = useHarnessStore((s) => s.updateHarnessInstallStatus);

  const scanTools = useCallback(async () => {
    setIsScanning(true);
    const scanned: ScannedTool[] = [];
    const isNative = Capacitor.isNativePlatform();

    try {
      if (isNative) {
        // 1. Probe native bootstrap status
        const bootstrap = await nativeTerminalBridge.getBootstrapStatus();
        const prefix = bootstrap?.prefixPath || '/data/data/com.sednium.kryptonide/files/usr';

        // Check each binary in the Termux prefix
        for (const t of KNOWN_TOOLS) {
          const binPath = `${prefix}/bin/${t.binary}`;
          let installed = false;
          let version = '';

          // Known status shortcuts from bootstrap check
          if (t.binary === 'python3' && bootstrap?.hasPython) installed = true;
          if (t.binary === 'node' && bootstrap?.hasNode) installed = true;
          if (t.binary === 'cargo' && bootstrap?.hasRust) installed = true;
          if (t.binary === 'clang' && bootstrap?.hasClang) installed = true;

          // Fallback / standard tool check
          scanned.push({
            ...t,
            isInstalled: installed,
            path: binPath,
            version: version || (installed ? 'installed' : undefined),
          });
        }
      } else {
        // Web simulation fallback: simulate common developer tools as installed
        for (const t of KNOWN_TOOLS) {
          const isCommon = ['git', 'node', 'npm', 'python3'].includes(t.binary);
          scanned.push({
            ...t,
            isInstalled: isCommon,
            version: isCommon ? 'simulated' : undefined,
            path: `/usr/bin/${t.binary}`,
          });
        }
      }

      setTools(scanned);

      // Sync detected agent harnesses with useHarnessStore
      const installedMap: Record<string, { isInstalled: boolean; version?: string }> = {};
      scanned.forEach((s) => {
        installedMap[s.id] = { isInstalled: s.isInstalled, version: s.version };
        installedMap[s.binary] = { isInstalled: s.isInstalled, version: s.version };
      });
      updateHarnessInstallStatus(installedMap);
    } catch (err) {
      console.warn('[TerminalScanner] Failed to scan tools:', err);
    } finally {
      setIsScanning(false);
    }
  }, [updateHarnessInstallStatus]);

  useEffect(() => {
    scanTools();
  }, [scanTools]);

  return { tools, isScanning, scanTools };
}
