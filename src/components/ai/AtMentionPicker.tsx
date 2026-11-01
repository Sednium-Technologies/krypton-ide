import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileCode2, Check } from 'lucide-react';
import { useIdeStore, FileNode } from '../../store/useIdeStore';

interface AtMentionPickerProps {
  query: string; // text after '@'
  onSelectFile: (file: FileNode) => void;
  onClose: () => void;
}

export function AtMentionPicker({ query, onSelectFile, onClose }: AtMentionPickerProps) {
  const filesMap = useIdeStore((state) => state.files);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const fileList = Object.values(filesMap).filter(
    (f) => f.type === 'file' && f.content !== undefined
  );

  const filteredFiles = fileList.filter((f) => {
    const q = query.toLowerCase();
    return f.name.toLowerCase().includes(q);
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredFiles.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredFiles.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredFiles.length) % filteredFiles.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredFiles[selectedIndex]) {
          onSelectFile(filteredFiles[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredFiles, selectedIndex, onSelectFile, onClose]);

  if (filteredFiles.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        style={{ willChange: 'transform, opacity' }}
        className="absolute bottom-full left-0 right-0 mb-2 max-h-60 overflow-y-auto bg-[#252227]/95 backdrop-blur-2xl border border-[#f3f0e7]/20 rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.6)] p-1.5 z-50 text-[#f3f0e7] scrollbar-hide"
      >
        <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-300 flex items-center space-x-1.5 border-b border-[#f3f0e7]/10 mb-1">
          <FileCode2 size={12} className="text-blue-400" />
          <span>Project Files (@ mention)</span>
        </div>

        {filteredFiles.map((file, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <div
              key={file.id}
              onClick={() => onSelectFile(file)}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`flex items-center space-x-3 p-2.5 rounded-xl cursor-pointer transition-all ${
                isSelected ? 'bg-blue-500/20 border border-blue-500/40 text-blue-100' : 'hover:bg-[#f3f0e7]/10 text-[#f3f0e7]/80'
              }`}
            >
              <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-300 flex-shrink-0">
                <FileCode2 size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-[#f3f0e7] truncate block">@{file.name}</span>
                <span className="text-[10px] text-[#f3f0e7]/50 truncate block">
                  Language: {file.language || 'plaintext'}
                </span>
              </div>
              {isSelected && <Check size={14} className="text-blue-400 flex-shrink-0" />}
            </div>
          );
        })}
      </motion.div>
    </AnimatePresence>
  );
}
