import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scissors, Copy, ClipboardPaste, Sparkles, Type, CheckSquare, Paintbrush, Check } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';
import { hapticLight } from '../../lib/haptics';
import { useIdeStore } from '../../store/useIdeStore';

interface FloatingContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  editor: any;
  monaco: any;
  onAskOortyLite?: (selectedText: string) => void;
}

async function readClipboard(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { value } = await Clipboard.read();
      return value || '';
    } catch {
      return '';
    }
  }
  try {
    return await navigator.clipboard.readText();
  } catch {
    return '';
  }
}

async function writeClipboard(text: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Clipboard.write({ string: text });
    } catch {}
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {}
}

export function FloatingContextMenu({
  isOpen,
  position,
  onClose,
  editor,
  monaco,
  onAskOortyLite,
}: FloatingContextMenuProps) {
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const theme = useIdeStore((state) => state.theme);
  const isLight = theme === 'light';

  // Close when clicking outside or scrolling
  useEffect(() => {
    if (!isOpen) return;

    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
    };

    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleOutside, { passive: true });
      window.addEventListener('touchstart', handleOutside, { passive: true });
      window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    }, 60);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('touchstart', handleOutside);
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [isOpen, onClose]);

  const handleSelectWord = () => {
    hapticLight();
    if (!editor || !monaco) return;
    const pos = editor.getPosition();
    const model = editor.getModel();
    if (pos && model) {
      const word = model.getWordAtPosition(pos);
      if (word) {
        editor.setSelection(new monaco.Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn));
      }
    }
    onClose();
  };

  const handleSelectAll = () => {
    hapticLight();
    if (!editor) return;
    const model = editor.getModel();
    if (model) {
      editor.setSelection(model.getFullModelRange());
    }
    onClose();
  };

  const handleCut = async () => {
    hapticLight();
    if (!editor) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (selection && model && !selection.isEmpty()) {
      const text = model.getValueInRange(selection);
      if (text) await writeClipboard(text);
      editor.executeEdits('krypton-cut', [{ range: selection, text: '', forceMoveMarkers: true }]);
    }
    onClose();
  };

  const handleCopy = async () => {
    hapticLight();
    if (!editor) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (selection && model && !selection.isEmpty()) {
      const text = model.getValueInRange(selection);
      if (text) await writeClipboard(text);
    }
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      onClose();
    }, 650);
  };

  const handlePaste = async () => {
    hapticLight();
    if (!editor || !monaco) return;
    const text = await readClipboard();
    if (text) {
      const selection = editor.getSelection();
      const range = selection && !selection.isEmpty()
        ? selection
        : (() => {
            const pos = editor.getPosition();
            return new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column);
          })();
      editor.executeEdits('krypton-paste', [{ range, text, forceMoveMarkers: true }]);
    }
    onClose();
  };

  const handleAskOortyLite = () => {
    hapticLight();
    if (!editor) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    let text = '';
    if (selection && model && !selection.isEmpty()) {
      text = model.getValueInRange(selection);
    }
    if (onAskOortyLite) onAskOortyLite(text);
    onClose();
  };

  const handleFormat = async () => {
    hapticLight();
    if (!editor) return;
    try {
      const action = editor.getAction('editor.action.formatDocument');
      if (action) {
        await action.run();
      }
    } catch {}
    try {
      const state = useIdeStore.getState();
      if (state.activeFileId) {
        const currentFile = state.files[state.activeFileId];
        if (currentFile && currentFile.content) {
          const { formatCode } = await import('../../lib/formatter');
          const formatted = await formatCode(currentFile.content, currentFile.language || 'plaintext');
          const model = editor.getModel();
          if (model && formatted && formatted !== currentFile.content) {
            editor.executeEdits('prettier', [{
              range: model.getFullModelRange(),
              text: formatted,
              forceMoveMarkers: true,
            }]);
            state.updateFileContent(state.activeFileId, formatted);
          }
        }
      }
    } catch {}
    onClose();
  };

  if (!isOpen) return null;

  // Approximate menu width ~340px, height ~50px.
  // Center horizontally over touch point, clamped to screen margins
  const approxWidth = 330;
  let clampedX = position.x - approxWidth / 2;
  clampedX = Math.max(12, Math.min(window.innerWidth - approxWidth - 12, clampedX));

  // Place 58px above touch point; if too close to top bar (< 60px), place below touch point (+24px)
  let clampedY = position.y - 58;
  if (clampedY < 60) {
    clampedY = Math.min(window.innerHeight - 70, position.y + 24);
  }

  const btnClass = `flex flex-col items-center justify-center px-1.5 py-1 min-h-[38px] min-w-[42px] rounded-xl active:scale-95 font-semibold text-[10px] transition-all cursor-pointer ${
    isLight
      ? 'text-[#2a2529] hover:bg-[#2a2529]/8 active:bg-[#2a2529]/15'
      : 'text-[#f3f0e7] hover:bg-[#f3f0e7]/10 active:bg-[#f3f0e7]/20'
  }`;

  return (
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.88, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 4 }}
        transition={{ type: 'spring', stiffness: 450, damping: 28 }}
        style={{ left: `${clampedX}px`, top: `${clampedY}px`, willChange: 'transform, opacity' }}
        className={`fixed z-[250] krypton-floating-context-menu backdrop-blur-md rounded-2xl p-1 flex items-center space-x-0.5 select-none max-w-[calc(100vw-24px)] overflow-x-auto scrollbar-hide ${
          isLight
            ? 'bg-white/95 text-[#2a2529] shadow-[0_12px_36px_rgba(42,37,41,0.18)] border border-[#2a2529]/15'
            : 'bg-[#231e22]/95 text-[#f3f0e7] shadow-[0_12px_36px_rgba(0,0,0,0.6)] border border-[#f3f0e7]/15'
        }`}
      >
        {/* Select Word */}
        <button
          onClick={handleSelectWord}
          className={btnClass}
          title="Select Word"
        >
          <Type size={14} />
          <span className="mt-0.5 leading-tight">Word</span>
        </button>

        {/* Select All */}
        <button
          onClick={handleSelectAll}
          className={btnClass}
          title="Select All"
        >
          <CheckSquare size={14} />
          <span className="mt-0.5 leading-tight">All</span>
        </button>

        <div className={`w-px h-5 mx-0.5 shrink-0 krypton-menu-divider ${isLight ? 'bg-[#2a2529]/15' : 'bg-[#f3f0e7]/15'}`} />

        {/* Cut */}
        <button
          onClick={handleCut}
          className={btnClass}
          title="Cut"
        >
          <Scissors size={14} />
          <span className="mt-0.5 leading-tight">Cut</span>
        </button>

        {/* Copy */}
        <button
          onClick={handleCopy}
          className={btnClass}
          title="Copy"
        >
          {copied ? (
            <>
              <Check size={14} className="text-emerald-500" />
              <span className="mt-0.5 leading-tight text-emerald-500 font-bold">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span className="mt-0.5 leading-tight">Copy</span>
            </>
          )}
        </button>

        {/* Paste */}
        <button
          onClick={handlePaste}
          className={btnClass}
          title="Paste"
        >
          <ClipboardPaste size={14} />
          <span className="mt-0.5 leading-tight">Paste</span>
        </button>

        <div className={`w-px h-5 mx-0.5 shrink-0 krypton-menu-divider ${isLight ? 'bg-[#2a2529]/15' : 'bg-[#f3f0e7]/15'}`} />

        {/* Ask Oorty Lite */}
        <button
          onClick={handleAskOortyLite}
          className="flex flex-col items-center justify-center px-2 py-1 min-h-[38px] min-w-[48px] rounded-xl bg-[#7C9B79] text-white hover:bg-[#6d8a6a] active:scale-95 shadow-sm border border-[#7C9B79]/50 font-bold text-[10px] transition-all cursor-pointer"
          title="Ask Oorty Lite"
        >
          <Sparkles size={14} className="text-white" />
          <span className="mt-0.5 leading-tight font-bold">Oorty Lite</span>
        </button>

        {/* Format */}
        <button
          onClick={handleFormat}
          className={btnClass}
          title="Format Code"
        >
          <Paintbrush size={14} />
          <span className="mt-0.5 leading-tight">Format</span>
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
