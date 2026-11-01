import React, { useEffect } from 'react';
import { motion, AnimatePresence, PanInfo } from 'motion/react';
import { cn } from '../../lib/utils';

export interface ConfirmationSheetProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmationSheet({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = true,
  onConfirm,
  onClose,
}: ConfirmationSheetProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.y > 80 || info.velocity.y > 400) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[170] flex flex-col justify-end items-center pointer-events-auto">
          {/* Backdrop blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            style={{ willChange: 'opacity' }}
          />

          {/* Draggable bottom sheet card */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 36, mass: 0.8 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            style={{ willChange: 'transform' }}
            className="relative w-full max-w-lg mx-auto rounded-t-3xl bg-[#231e22] border-t border-x border-[#f3f0e7]/15 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] text-[#f3f0e7] shadow-2xl z-10 flex flex-col"
          >
            {/* Drag bar indicator at top */}
            <div className="w-12 h-1.5 rounded-full bg-[#f3f0e7]/25 mx-auto mb-4 cursor-grab active:cursor-grabbing" />

            {/* Content */}
            <h3 className="text-base font-bold text-[#f3f0e7] tracking-tight">
              {title}
            </h3>
            <p className="text-xs text-[#f3f0e7]/70 leading-relaxed mt-1.5 mb-6">
              {description}
            </p>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3 w-full">
              <button
                type="button"
                onClick={onClose}
                className="w-full bg-[#342f33] text-[#f3f0e7] hover:bg-[#3d373c] py-3 rounded-xl font-medium active:scale-98 transition-all text-xs sm:text-sm flex items-center justify-center cursor-pointer"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  onConfirm();
                }}
                className={cn(
                  "w-full py-3 rounded-xl font-bold active:scale-98 transition-all text-xs sm:text-sm flex items-center justify-center cursor-pointer",
                  isDestructive
                    ? "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30"
                    : "bg-[#f3f0e7] text-[#2a2529] hover:bg-white shadow-lg shadow-black/20"
                )}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
