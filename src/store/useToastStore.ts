import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  success: (message: string, duration?: number) => string;
  error: (message: string, duration?: number) => string;
  info: (message: string, duration?: number) => string;
  warning: (message: string, duration?: number) => string;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const duration = toast.duration ?? 3000;
    const newToast: Toast = { ...toast, id, duration };

    set((state) => ({
      toasts: [...state.toasts, newToast],
    }));

    if (duration > 0) {
      const timer = setTimeout(() => {
        get().removeToast(id);
      }, duration);
      timers.set(id, timer);
    }

    return id;
  },

  removeToast: (id: string) => {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  success: (message: string, duration?: number) => {
    return get().addToast({ type: 'success', message, duration });
  },

  error: (message: string, duration?: number) => {
    return get().addToast({ type: 'error', message, duration });
  },

  info: (message: string, duration?: number) => {
    return get().addToast({ type: 'info', message, duration });
  },

  warning: (message: string, duration?: number) => {
    return get().addToast({ type: 'warning', message, duration });
  },
}));

// Direct helper methods as `toast.success(...)`, `toast.error(...)`, etc.
export const toast = {
  success: (message: string, duration?: number) => useToastStore.getState().success(message, duration),
  error: (message: string, duration?: number) => useToastStore.getState().error(message, duration),
  info: (message: string, duration?: number) => useToastStore.getState().info(message, duration),
  warning: (message: string, duration?: number) => useToastStore.getState().warning(message, duration),
  add: (t: Omit<Toast, 'id'>) => useToastStore.getState().addToast(t),
  remove: (id: string) => useToastStore.getState().removeToast(id),
};
