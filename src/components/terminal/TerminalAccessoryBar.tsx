import React, { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { hapticLight } from '../../lib/haptics';

export interface TerminalAccessoryBarProps {
  onSendInput?: (input: string) => void;
  onKey?: (key: string) => void;
  ctrlActive?: boolean;
  altActive?: boolean;
  onToggleCtrl?: () => void;
  onToggleAlt?: () => void;
  className?: string;
}

interface AccessoryKey {
  label: string;
  value?: string;
  type?: 'ctrl' | 'alt';
  icon?: React.ReactNode;
}

const ACCESSORY_KEYS: AccessoryKey[] = [
  { label: 'ESC', value: '\x1b' },
  { label: 'TAB', value: '\t' },
  { label: 'CTRL', type: 'ctrl' },
  { label: 'ALT', type: 'alt' },
  { label: '|', value: '|' },
  { label: '~', value: '~' },
  { label: '/', value: '/' },
  { label: '-', value: '-' },
  { label: 'Up', value: '\x1b[A', icon: <ChevronUp size={15} /> },
  { label: 'Down', value: '\x1b[B', icon: <ChevronDown size={15} /> },
  { label: 'Left', value: '\x1b[D', icon: <ChevronLeft size={15} /> },
  { label: 'Right', value: '\x1b[C', icon: <ChevronRight size={15} /> },
];

export function TerminalAccessoryBar({
  onSendInput,
  onKey,
  ctrlActive,
  altActive,
  onToggleCtrl,
  onToggleAlt,
  className = '',
}: TerminalAccessoryBarProps) {
  const [internalCtrl, setInternalCtrl] = useState(false);
  const [internalAlt, setInternalAlt] = useState(false);

  const isCtrlActive = ctrlActive !== undefined ? ctrlActive : internalCtrl;
  const isAltActive = altActive !== undefined ? altActive : internalAlt;

  const handleToggleCtrl = () => {
    hapticLight();
    if (onToggleCtrl) {
      onToggleCtrl();
    } else {
      setInternalCtrl((prev) => !prev);
    }
  };

  const handleToggleAlt = () => {
    hapticLight();
    if (onToggleAlt) {
      onToggleAlt();
    } else {
      setInternalAlt((prev) => !prev);
    }
  };

  const handleKeyPress = (key: AccessoryKey) => {
    if (key.type === 'ctrl') {
      handleToggleCtrl();
      return;
    }

    if (key.type === 'alt') {
      handleToggleAlt();
      return;
    }

    hapticLight();

    let seq = key.value || key.label;

    // Apply modifier if active
    if (isCtrlActive) {
      if (seq === 'c' || seq === 'C') seq = '\x03';
      else if (seq === 'd' || seq === 'D') seq = '\x04';
      else if (seq === 'z' || seq === 'Z') seq = '\x1a';

      if (onToggleCtrl) {
        onToggleCtrl();
      } else {
        setInternalCtrl(false);
      }
    }

    if (isAltActive) {
      seq = '\x1b' + seq;
      if (onToggleAlt) {
        onToggleAlt();
      } else {
        setInternalAlt(false);
      }
    }

    onSendInput?.(seq);
    onKey?.(seq);
  };

  return (
    <div
      className={`flex items-center space-x-1.5 px-2 py-1 bg-[#342f33] border-t border-[#f3f0e7]/10 overflow-x-auto scrollbar-hide select-none touch-manipulation min-h-[48px] h-12 shrink-0 ${className}`}
      role="toolbar"
      aria-label="Terminal Accessory Toolbar"
    >
      {ACCESSORY_KEYS.map((key) => {
        const isModifier = key.type === 'ctrl' || key.type === 'alt';
        const isActive =
          (key.type === 'ctrl' && isCtrlActive) || (key.type === 'alt' && isAltActive);

        return (
          <button
            key={key.label}
            type="button"
            onClick={() => handleKeyPress(key)}
            className={`min-h-[44px] min-w-[44px] px-2 flex items-center justify-center rounded-xl font-mono text-xs transition-all active:scale-[0.94] touch-manipulation select-none shrink-0 cursor-pointer ${
              isActive
                ? 'bg-[#f3f0e7] text-[#2a2529] font-bold shadow-sm'
                : isModifier
                ? 'bg-[#2a2529] text-[#f3f0e7] border border-[#f3f0e7]/15 hover:bg-[#231e22] font-semibold'
                : 'bg-[#2a2529] text-[#f3f0e7] border border-[#f3f0e7]/10 hover:bg-[#231e22]'
            }`}
          >
            {key.icon ? key.icon : key.label}
          </button>
        );
      })}
    </div>
  );
}
