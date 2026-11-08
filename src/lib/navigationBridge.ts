import { Capacitor } from '@capacitor/core';

export type OfficialEndpoint =
  | 'portal'
  | 'homepage'
  | 'tos'
  | 'github'
  | 'oorty';

export const OFFICIAL_URLS: Record<OfficialEndpoint, string> = {
  portal: 'https://kryptonide.sednium.com',
  homepage: 'https://sednium.com',
  tos: 'https://sednium.com/tos',
  github: 'https://github.com/Sednium-Technologies',
  oorty: 'https://github.com/Sednium-Technologies/OORTY',
};

/**
 * Dispatches navigation requests through the Kotlin native intent bridge if running
 * on Android, with a clean window.open fallback on web preview environments.
 */
export async function openOfficialLink(target: OfficialEndpoint | string): Promise<void> {
  const url = (OFFICIAL_URLS as Record<string, string>)[target] || target;

  if (Capacitor.isNativePlatform()) {
    try {
      const core = (Capacitor as any).Plugins?.KryptonCore;
      if (core && typeof core.openExternalUrl === 'function') {
        await core.openExternalUrl({ url });
        return;
      }
    } catch (e) {
      console.warn('[NavigationBridge] Native openExternalUrl failed, falling back:', e);
    }
  }

  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
