import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { nativeTerminalBridge } from '../lib/terminal/nativeTerminalBridge';
import { useHarnessStore } from '../store/useHarnessStore';
import {
  KNOWN_TOOLS,
  scanToolsForEnvironment,
  type ScannedTool,
} from '../lib/terminal/toolScanner';

export type { ScannedTool } from '../lib/terminal/toolScanner';

export function useTerminalScanner() {
  const [tools, setTools] = useState<ScannedTool[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const updateHarnessInstallStatus = useHarnessStore((s) => s.updateHarnessInstallStatus);

  const scanTools = useCallback(async () => {
    setIsScanning(true);

    try {
      const isNative = Capacitor.isNativePlatform();
      let scanned: ScannedTool[];

      if (isNative) {
        const bootstrap = await nativeTerminalBridge.getBootstrapStatus();
        const prefix = bootstrap?.prefixPath || '/data/data/com.sednium.kryptonide.legacy/files/usr';
        const canonicalPrefix = '/data/data/com.sednium.kryptonide.legacy/files/usr';
        const existingPaths = new Set<string>();

        for (const tool of KNOWN_TOOLS) {
          try {
            await Filesystem.stat({ path: `usr/bin/${tool.binary}`, directory: Directory.Data });
            existingPaths.add(`${prefix}/bin/${tool.binary}`);
            existingPaths.add(`${canonicalPrefix}/bin/${tool.binary}`);
          } catch {
            // Binary is genuinely absent.
          }
        }

        scanned = scanToolsForEnvironment({
          isNative: true,
          exists: (path) => existingPaths.has(path),
        });
      } else {
        scanned = scanToolsForEnvironment({ isNative: false, exists: () => false });
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
