import React, { useRef, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { useIdeStore } from '../../store/useIdeStore';
import { LanguageIcon } from '../sidebar/LanguageIcon';
import { hapticLight } from '../../lib/haptics';

interface OpenFilesDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<any>;
}

export function OpenFilesDropdown({ isOpen, onClose, triggerRef }: OpenFilesDropdownProps) {
  const { openFiles, files, activeFileId, setActiveFile, closeFile, closeAllFiles } = useIdeStore();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        (!triggerRef?.current || !triggerRef.current.contains(e.target as Node))
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
      return () => {
        document.removeEventListener('mousedown', handleOutsideClick);
        document.removeEventListener('touchstart', handleOutsideClick);
      };
    }
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute left-2 top-full mt-1.5 w-72 max-w-[90vw] bg-[#231e22] border border-[#f3f0e7]/20 rounded-2xl shadow-2xl z-50 overflow-hidden animate-scale-in"
    >
      <div className="px-3.5 py-1.5 border-b border-[#f3f0e7]/10 flex items-center justify-between bg-[#1f1b1f]">
        <span className="text-[11px] font-bold text-[#f3f0e7]/70 uppercase tracking-wider">
          Opened Files ({openFiles.length})
        </span>
        <button
          onClick={() => {
            hapticLight();
            onClose();
          }}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-[#f3f0e7]/10 active:scale-95 text-[#f3f0e7]/70 hover:text-[#f3f0e7] transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
          aria-label="Close opened files menu"
          title="Close opened files menu"
        >
          <X size={15} />
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto divide-y divide-[#f3f0e7]/5 py-0.5" role="listbox" aria-label="Opened files">
        {openFiles.length === 0 ? (
          <div className="p-4 text-center text-xs text-[#f3f0e7]/70">No files open</div>
        ) : (
          openFiles.map((fileId) => {
            const file = files[fileId];
            if (!file) return null;
            const isActive = activeFileId === fileId;

            return (
              <div
                key={fileId}
                role="option"
                aria-selected={isActive}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    hapticLight();
                    setActiveFile(fileId);
                    onClose();
                  }
                }}
                onClick={() => {
                  hapticLight();
                  setActiveFile(fileId);
                  onClose();
                }}
                className={`flex items-center justify-between px-3 min-h-[44px] cursor-pointer transition-colors active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${
                  isActive
                    ? 'bg-[#f3f0e7]/15 text-[#f3f0e7] font-semibold'
                    : 'text-[#f3f0e7]/80 hover:bg-[#342f33] hover:text-[#f3f0e7]'
                }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0 flex-1 mr-1">
                  <div className="flex-shrink-0">
                    <LanguageIcon fileName={file.name} size={16} />
                  </div>
                  <span className="text-xs truncate">{file.name}</span>
                  {file.isUnsaved && (
                    <span
                      className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"
                      title="Unsaved changes"
                      aria-label="Unsaved changes"
                    />
                  )}
                </div>

                <div className="flex items-center space-x-1 flex-shrink-0">
                  {isActive && <Check size={14} className="text-teal-400 mr-1" />}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      hapticLight();
                      closeFile(fileId);
                    }}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#f3f0e7]/70 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/20 active:scale-95 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
                    aria-label={`Close ${file.name}`}
                    title={`Close ${file.name}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {openFiles.length > 0 && (
        <div className="p-2 border-t border-[#f3f0e7]/10 bg-[#1f1b1f]">
          <button
            onClick={() => {
              hapticLight();
              if (closeAllFiles) {
                closeAllFiles();
              } else {
                openFiles.forEach((id) => closeFile(id));
              }
              onClose();
            }}
            className="w-full min-h-[44px] py-2 px-3 flex items-center justify-center text-xs font-semibold text-red-400 hover:bg-red-500/10 active:scale-95 rounded-xl transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-red-400/50 focus-visible:outline-none"
            aria-label="Close all open files"
            title="Close all open files"
          >
            Close All Files
          </button>
        </div>
      )}
    </div>
  );
}
