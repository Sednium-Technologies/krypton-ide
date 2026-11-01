import { registerPlugin, Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

export interface StoragePermissionPlugin {
  checkPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  openSettings(): Promise<{ opened: boolean }>;
}

const NativeStoragePermission = registerPlugin<StoragePermissionPlugin>('StoragePermission');

/**
 * Probe actual filesystem access by:
 * 1. Creating the KryptonIDE working directory (idempotent mkdir)
 * 2. Writing a random temp file inside it
 * 3. Deleting the temp file
 * This is the ground-truth permission check — no native plugin needed.
 */
async function probeFilesystemAccess(): Promise<boolean> {
  const workDir = 'KryptonIDE';
  const tmpFile = `KryptonIDE/.krypton_probe_${Date.now()}.tmp`;
  try {
    // Step 1 — ensure KryptonIDE dir exists (mkdir is safe if already exists)
    try {
      await Filesystem.mkdir({
        path: workDir,
        directory: Directory.ExternalStorage,
        recursive: true,
      });
    } catch {
      // Dir may already exist — that's fine, continue to write probe
    }
    // Step 2 — write a tiny temp file inside KryptonIDE/
    await Filesystem.writeFile({
      path: tmpFile,
      data: '1',
      directory: Directory.ExternalStorage,
      encoding: 'utf8' as any,
    });
    // Step 3 — clean up
    await Filesystem.deleteFile({ path: tmpFile, directory: Directory.ExternalStorage });
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether the app currently has permission to read and write to device storage.
 * First tries the native plugin; falls back to a live filesystem probe if the plugin
 * is unavailable (e.g. not compiled into this build).
 */
export async function checkStoragePermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;

  // Try the native plugin first (fast path)
  try {
    const res = await NativeStoragePermission.checkPermission();
    return res.granted;
  } catch (e: any) {
    const msg = String(e?.message || e);
    // Plugin not compiled / not registered — fall back to filesystem probe
    if (msg.includes('not implemented') || msg.includes('not registered')) {
      return probeFilesystemAccess();
    }
    console.warn('[StoragePermission] checkPermission error:', e);
    return probeFilesystemAccess();
  }
}

/**
 * Requests storage permission. On Android 11+, opens System Settings so the user
 * can enable "Allow management of all files" for KryptonIDE.
 * Falls back to opening settings via a direct Android intent URL if the plugin
 * is unavailable.
 */
export async function requestStoragePermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;

  // Try native plugin first
  try {
    const res = await NativeStoragePermission.requestPermission();
    return !!res?.granted;
  } catch (e: any) {
    console.warn('[StoragePermission] requestPermission plugin unavailable, using intent fallback:', e);
    // Fallback: open All Files Access settings directly via Android intent URL
    try {
      // This works on Android 11+ — Capacitor's App plugin can open URLs
      const { App } = await import('@capacitor/app');
      // Use android-app:// scheme to launch the all-files-access settings screen
      await (App as any).openUrl?.({ url: 'package:com.sednium.kryptonide' });
    } catch {
      // If App.openUrl isn't available, try window.open as last resort
      try {
        window.open('https://support.google.com/files', '_system');
      } catch { /* silent */ }
    }
    return false;
  }
}

/**
 * Opens system settings for storage permission management.
 */
export async function openStorageSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await NativeStoragePermission.openSettings();
  } catch {
    // Fallback already handled in requestStoragePermission
  }
}
