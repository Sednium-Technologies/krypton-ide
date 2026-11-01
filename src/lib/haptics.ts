import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { useIdeStore } from '../store/useIdeStore';

function isHapticsAllowed(): boolean {
  try {
    return useIdeStore.getState().isHapticsEnabled ?? true;
  } catch {
    return true;
  }
}

/**
 * Light impact haptic feedback (soft tick)
 */
export async function hapticLight(): Promise<void> {
  if (!isHapticsAllowed()) return;
  if (Capacitor.isNativePlatform()) {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
  } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate?.([15]);
    } catch {}
  }
}

/**
 * Medium impact haptic feedback (standard click / hold feedback)
 */
export async function hapticMedium(): Promise<void> {
  if (!isHapticsAllowed()) return;
  if (Capacitor.isNativePlatform()) {
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch {}
  } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate?.([30]);
    } catch {}
  }
}

/**
 * Success notification haptic pattern
 */
export async function hapticSuccess(): Promise<void> {
  if (!isHapticsAllowed()) return;
  if (Capacitor.isNativePlatform()) {
    try {
      await Haptics.notification({ type: NotificationType.Success });
    } catch {}
  } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate?.([15, 40, 20]);
    } catch {}
  }
}

/**
 * Warning notification haptic pattern
 */
export async function hapticWarning(): Promise<void> {
  if (!isHapticsAllowed()) return;
  if (Capacitor.isNativePlatform()) {
    try {
      await Haptics.notification({ type: NotificationType.Warning });
    } catch {}
  } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate?.([30, 50, 30]);
    } catch {}
  }
}

/**
 * Error notification haptic pattern
 */
export async function hapticError(): Promise<void> {
  if (!isHapticsAllowed()) return;
  if (Capacitor.isNativePlatform()) {
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {}
  } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate?.([40, 40, 40, 40, 60]);
    } catch {}
  }
}

/**
 * Subtle selection tick haptic
 */
export async function hapticSelection(): Promise<void> {
  if (!isHapticsAllowed()) return;
  if (Capacitor.isNativePlatform()) {
    try {
      await Haptics.selectionChanged();
    } catch {
      try {
        await Haptics.impact({ style: ImpactStyle.Light });
      } catch {}
    }
  } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(15);
    } catch {}
  }
}
