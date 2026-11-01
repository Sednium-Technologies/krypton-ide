import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useToastStore, type ToastType } from '../../store/useToastStore';
import { useIdeStore } from '../../store/useIdeStore';

const getToastIcon = (type: ToastType, isLight: boolean) => {
  switch (type) {
    case 'success':
      return <CheckCircle2 size={16} className={isLight ? "text-emerald-600 shrink-0" : "text-emerald-400 shrink-0"} />;
    case 'error':
      return <AlertCircle size={16} className={isLight ? "text-rose-600 shrink-0" : "text-rose-400 shrink-0"} />;
    case 'warning':
      return <AlertTriangle size={16} className={isLight ? "text-amber-600 shrink-0" : "text-amber-400 shrink-0"} />;
    case 'info':
    default:
      return <Info size={16} className={isLight ? "text-cyan-600 shrink-0" : "text-cyan-400 shrink-0"} />;
  }
};

export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);
  const theme = useIdeStore((state) => state.theme);
  const isLight = theme === 'light';

  return (
    <div
      className="fixed top-4 left-4 right-4 max-w-sm mx-auto z-[9999] pointer-events-none flex flex-col gap-2.5"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: -16, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 450, damping: 30 }}
            className={`krypton-toast-item backdrop-blur-xl border rounded-2xl p-3 flex items-center gap-3 text-xs pointer-events-auto transition-all ${
              isLight
                ? 'bg-white/95 text-[#2a2529] border-[#2a2529]/15 shadow-[0_12px_32px_rgba(42,37,41,0.14)]'
                : 'bg-[#231e22]/95 text-[#f3f0e7] border-[#f3f0e7]/15 shadow-2xl'
            }`}
          >
            {getToastIcon(toast.type, isLight)}
            <span className={`flex-1 break-words font-medium leading-relaxed select-none ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>
              {toast.message}
            </span>
            <button
              onClick={() => removeToast(toast.id)}
              className={`p-1 rounded-lg transition-colors shrink-0 ${
                isLight
                  ? 'text-[#2a2529]/50 hover:text-[#2a2529] hover:bg-[#2a2529]/10'
                  : 'text-[#f3f0e7]/50 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10'
              }`}
              title="Dismiss"
            >
              <X size={12} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
