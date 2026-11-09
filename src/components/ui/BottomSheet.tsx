import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, PanInfo, useAnimationControls } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useIdeStore } from '../../store/useIdeStore';
import { hapticLight, hapticMedium } from '../../lib/haptics';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  maxHeight?: string;
  showDragHandle?: boolean;
  showCloseButton?: boolean;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  className,
  maxHeight = '85vh',
  showDragHandle = true,
  showCloseButton = true,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const controls = useAnimationControls();
  const theme = useIdeStore((state) => state.theme);
  const isLight = theme === 'light';

  useEffect(() => {
    if (!isOpen) setIsExpanded(false);
  }, [isOpen]);

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
    if (info.offset.y > 100 || info.velocity.y > 500) {
      hapticMedium();
      onClose();
    } else if (info.offset.y < -80 || info.velocity.y < -400) {
      hapticMedium();
      setIsExpanded(true);
    } else {
      hapticLight();
      controls.start({ y: 0 });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[160] flex flex-col justify-end">
          {/* Backdrop on separate GPU compositor layer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            style={{ willChange: 'opacity' }}
          />

          {/* Draggable Sheet */}
          <motion.div
            ref={sheetRef}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38, mass: 0.8 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            layout={false}
            style={{
              maxHeight: isExpanded ? '100vh' : maxHeight,
              height: isExpanded ? '100vh' : maxHeight,
              willChange: 'transform',
            }}
            className={cn(
              'relative w-full border-t border-x flex flex-col overflow-hidden transition-[border-radius] duration-200 pb-[env(safe-area-inset-bottom,0px)]',
              isLight
                ? 'bg-[#f7f5ee] border-[#2a2529]/15 text-[#2a2529] shadow-[0_-12px_40px_rgba(42,37,41,0.14)]'
                : 'bg-[#2a2529] border-[#f3f0e7]/10 text-[#f3f0e7] shadow-[0_-12px_40px_rgba(0,0,0,0.6)]',
              isExpanded ? 'rounded-t-none h-full' : 'rounded-t-[28px]',
              className
            )}
          >
            {showDragHandle && (
              <div className="w-full flex items-center justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing flex-shrink-0">
                <div className={cn("w-12 h-1.5 rounded-full", isLight ? "bg-[#2a2529]/20" : "bg-[#f3f0e7]/30")} />
              </div>
            )}

            {(title || showCloseButton) && (
              <div className={cn("flex items-center justify-between px-6 py-3 border-b flex-shrink-0", isLight ? "border-[#2a2529]/10" : "border-[#f3f0e7]/10")}>
                <div className={cn("flex-1 font-semibold text-base tracking-tight", isLight ? "text-[#2a2529]" : "text-[#f3f0e7]")}>
                  {title}
                </div>
                {showCloseButton && (
                  <button
                    onClick={() => { hapticLight(); onClose(); }}
                    aria-label="Close sheet"
                    className={cn(
                      "ml-3 rounded-full p-1.5 transition-colors",
                      isLight ? "text-[#2a2529]/60 hover:text-[#2a2529] hover:bg-[#2a2529]/10" : "text-[#f3f0e7]/60 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10"
                    )}
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto flex flex-col min-h-0 scrollbar-hide">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
