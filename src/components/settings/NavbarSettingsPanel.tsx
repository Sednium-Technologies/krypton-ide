import React, { useState } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ArrowLeftRight,
  RotateCcw,
  Plus,
  Minus,
  Check,
  X,
  MoreHorizontal,
  Sliders,
} from 'lucide-react';
import { useNavbarStore } from '../../store/useNavbarStore';
import { useIdeStore } from '../../store/useIdeStore';
import { ToolIcon } from '../ui/ToolIcon';
import { hapticLight, hapticMedium } from '../../lib/haptics';
import { toast } from '../../store/useToastStore';

interface NavbarSettingsPanelProps {
  onClose?: () => void;
}

export function NavbarSettingsPanel({ onClose }: NavbarSettingsPanelProps) {
  const tools = useNavbarStore((state) => state.tools);
  const pinnedIds = useNavbarStore((state) => state.pinnedIds);
  const pinnedCount = useNavbarStore((state) => state.pinnedCount);
  const setPinnedCount = useNavbarStore((state) => state.setPinnedCount);
  const swapPositions = useNavbarStore((state) => state.swapPositions);
  const togglePinned = useNavbarStore((state) => state.togglePinned);
  const resetDefaults = useNavbarStore((state) => state.resetDefaults);
  const theme = useIdeStore((state) => state.theme);
  const isLight = theme === 'light';

  // Quick picker modal state for swapping a slot
  const [swappingSlotIndex, setSwappingSlotIndex] = useState<number | null>(null);

  const pinnedSlice = pinnedIds.slice(0, pinnedCount);
  const allToolList = Object.values(tools);

  const handleIncrement = () => {
    if (pinnedCount < 6) {
      hapticLight();
      setPinnedCount(pinnedCount + 1);
    }
  };

  const handleDecrement = () => {
    if (pinnedCount > 2) {
      hapticLight();
      setPinnedCount(pinnedCount - 1);
    } else {
      toast.warning('Navbar requires at least 2 primary buttons');
    }
  };

  const handleMoveUp = (index: number) => {
    if (index > 0) {
      hapticLight();
      swapPositions(index, index - 1);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index < pinnedCount - 1) {
      hapticLight();
      swapPositions(index, index + 1);
    }
  };

  const handleSelectReplacement = (newToolId: string) => {
    if (swappingSlotIndex === null) return;
    hapticMedium();
    const existingIndex = pinnedIds.indexOf(newToolId);
    if (existingIndex !== -1) {
      swapPositions(swappingSlotIndex, existingIndex);
    } else {
      // If the tool is not in pinnedIds, insert it
      const copy = [...pinnedIds];
      copy[swappingSlotIndex] = newToolId;
      useNavbarStore.getState().reorderPinned(copy);
    }
    setSwappingSlotIndex(null);
  };

  const handleReset = () => {
    hapticMedium();
    resetDefaults();
    toast.success('Navbar layout reset to defaults');
  };

  return (
    <div
      className={`flex flex-col h-full overflow-y-auto p-4 sm:p-6 space-y-6 font-sans select-none ${
        isLight ? 'bg-[#f4f0e6] text-[#2a2529]' : 'bg-[#2a2529] text-[#f3f0e7]'
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between pb-3 border-b ${
          isLight ? 'border-[#2a2529]/10' : 'border-[#f3f0e7]/10'
        }`}
      >
        <div className="flex items-center space-x-2.5">
          <div
            className={`w-8 h-8 rounded-xl border flex items-center justify-center ${
              isLight
                ? 'bg-[#ebe7dc] border-[#2a2529]/10 text-[#2a2529]/80'
                : 'bg-[#342f33] border-[#f3f0e7]/15 text-[#f3f0e7]/80'
            }`}
          >
            <Sliders size={18} />
          </div>
          <div>
            <h3 className={`text-sm font-bold ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>
              Navbar Customizer
            </h3>
            <p className={`text-[11px] ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/70'}`}>
              Fine-tune button positions, count, and overflow menu
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={() => {
              hapticLight();
              onClose();
            }}
            className={`p-1.5 rounded-xl active:scale-95 transition-all ${
              isLight
                ? 'text-[#2a2529]/60 hover:text-[#2a2529] hover:bg-[#2a2529]/10'
                : 'text-[#f3f0e7]/60 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10'
            }`}
            aria-label="Close customizer"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* 1. Live Bottom Bar Preview */}
      <div
        className={`p-4 rounded-2xl border space-y-2.5 shadow-sm ${
          isLight ? 'bg-[#ebe7dc]/70 border-[#2a2529]/10' : 'bg-[#342f33]/70 border-[#f3f0e7]/10'
        }`}
      >
        <div className="flex items-center justify-between">
          <span
            className={`text-[11px] font-bold uppercase tracking-wider ${
              isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/70'
            }`}
          >
            Live Preview (Bottom Bar)
          </span>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            {pinnedCount} Primary + More
          </span>
        </div>

        {/* Mock Bottom Navigation Bar */}
        <div
          className={`border rounded-2xl p-2.5 flex items-center justify-around shadow-inner overflow-hidden ${
            isLight ? 'bg-[#f4f0e6] border-[#2a2529]/15' : 'bg-[#231e22] border-[#f3f0e7]/15'
          }`}
        >
          {pinnedSlice.map((toolId) => {
            const tool = tools[toolId];
            if (!tool) return null;
            return (
              <div
                key={toolId}
                className={`flex flex-col items-center justify-center py-1 px-1.5 min-w-[42px] rounded-xl border transition-all ${
                  isLight ? 'bg-[#2a2529]/5 border-black/5' : 'bg-[#f3f0e7]/5 border-white/5'
                }`}
              >
                <ToolIcon
                  icon={tool.icon}
                  size={16}
                  className={isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}
                />
                <span
                  className={`text-[9px] mt-1 font-medium truncate max-w-[50px] ${
                    isLight ? 'text-[#2a2529]/90' : 'text-[#f3f0e7]/90'
                  }`}
                >
                  {tool.label}
                </span>
              </div>
            );
          })}

          {/* Mirrored 'L' Overflow Button */}
          <div className={`flex flex-col items-center justify-center py-1 px-1.5 min-w-[42px] rounded-xl border ${
            isLight
              ? 'bg-[#2a2529]/5 border-[#2a2529]/10 text-[#2a2529]/80'
              : 'bg-[#f3f0e7]/5 border-[#f3f0e7]/10 text-[#f3f0e7]/80'
          }`}>
            <MoreHorizontal size={16} />
            <span className="text-[9px] mt-1 font-bold">More</span>
          </div>
        </div>
      </div>

      {/* 2. Visible Buttons Stepper */}
      <div
        className={`p-4 rounded-2xl border space-y-3 shadow-sm ${
          isLight ? 'bg-[#ebe7dc] border-[#2a2529]/10' : 'bg-[#342f33] border-[#f3f0e7]/10'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h4
              className={`text-xs font-bold uppercase tracking-wider ${
                isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'
              }`}
            >
              Visible Primary Buttons
            </h4>
            <p className={`text-[11px] mt-0.5 ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/70'}`}>
              Choose between 2 and 6 buttons on the bottom navigation bar.
            </p>
          </div>

          <div
            className={`flex items-center space-x-2 p-1 rounded-2xl border ${
              isLight ? 'bg-[#f4f0e6] border-[#2a2529]/15' : 'bg-[#2a2529] border-[#f3f0e7]/15'
            }`}
          >
            <button
              onClick={handleDecrement}
              disabled={pinnedCount <= 2}
              className={`w-8 h-8 rounded-xl flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-all cursor-pointer ${
                isLight
                  ? 'text-[#2a2529] hover:bg-[#2a2529]/10'
                  : 'text-[#f3f0e7] hover:bg-[#f3f0e7]/10'
              }`}
              aria-label="Decrease button count"
            >
              <Minus size={15} />
            </button>
            <span
              className={`w-8 text-center font-bold text-sm ${
                isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'
              }`}
            >
              {pinnedCount}
            </span>
            <button
              onClick={handleIncrement}
              disabled={pinnedCount >= 6}
              className={`w-8 h-8 rounded-xl flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-all cursor-pointer ${
                isLight
                  ? 'text-[#2a2529] hover:bg-[#2a2529]/10'
                  : 'text-[#f3f0e7] hover:bg-[#f3f0e7]/10'
              }`}
              aria-label="Increase button count"
            >
              <Plus size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Navbar Slots Reorder & Swapper */}
      <div
        className={`p-4 rounded-2xl border space-y-3 shadow-sm ${
          isLight ? 'bg-[#ebe7dc] border-[#2a2529]/10' : 'bg-[#342f33] border-[#f3f0e7]/10'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h4
              className={`text-xs font-bold uppercase tracking-wider ${
                isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'
              }`}
            >
              Active Navbar Slots
            </h4>
            <p className={`text-[11px] ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/70'}`}>
              Reorder slots or swap any tool directly into a position.
            </p>
          </div>
          <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            Slot 1 to {pinnedCount}
          </span>
        </div>

        <div className="space-y-2">
          {pinnedSlice.map((toolId, index) => {
            const tool = tools[toolId];
            if (!tool) return null;

            return (
              <div
                key={toolId}
                className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                  isLight
                    ? 'bg-[#f4f0e6] border-[#2a2529]/10 hover:border-[#2a2529]/20'
                    : 'bg-[#2a2529] border-[#f3f0e7]/10 hover:border-[#f3f0e7]/20'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <span
                    className={`w-5 text-[11px] font-bold text-center ${
                      isLight ? 'text-[#2a2529]/50' : 'text-[#f3f0e7]/50'
                    }`}
                  >
                    #{index + 1}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${
                      isLight
                        ? 'bg-[#ebe7dc] border-[#2a2529]/10 text-[#2a2529]'
                        : 'bg-[#342f33] border-[#f3f0e7]/10 text-[#f3f0e7]'
                    }`}
                  >
                    <ToolIcon icon={tool.icon} size={15} />
                  </div>
                  <span
                    className={`text-xs font-semibold truncate ${
                      isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'
                    }`}
                  >
                    {tool.label}
                  </span>
                </div>

                <div className="flex items-center space-x-1 shrink-0">
                  {/* Replace Slot Picker Trigger */}
                  <button
                    onClick={() => {
                      hapticLight();
                      setSwappingSlotIndex(index);
                    }}
                    className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-[10px] font-semibold border active:scale-95 transition-all ${
                      isLight
                        ? 'bg-[#ebe7dc] text-[#2a2529]/80 hover:text-[#2a2529] hover:bg-[#ded9cb] border-[#2a2529]/10'
                        : 'bg-[#342f33] text-[#f3f0e7]/80 hover:text-[#f3f0e7] hover:bg-[#3e383d] border-[#f3f0e7]/10'
                    }`}
                    title="Swap with another tool"
                  >
                    <ArrowLeftRight size={11} />
                    <span>Swap</span>
                  </button>

                  {/* Move Up */}
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className={`p-1.5 rounded-lg disabled:opacity-20 disabled:pointer-events-none active:scale-95 transition-all ${
                      isLight
                        ? 'text-[#2a2529]/70 hover:text-[#2a2529] hover:bg-[#ebe7dc]'
                        : 'text-[#f3f0e7]/70 hover:text-[#f3f0e7] hover:bg-[#342f33]'
                    }`}
                    aria-label={`Move ${tool.label} up`}
                  >
                    <ChevronUp size={15} />
                  </button>

                  {/* Move Down */}
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === pinnedCount - 1}
                    className={`p-1.5 rounded-lg disabled:opacity-20 disabled:pointer-events-none active:scale-95 transition-all ${
                      isLight
                        ? 'text-[#2a2529]/70 hover:text-[#2a2529] hover:bg-[#ebe7dc]'
                        : 'text-[#f3f0e7]/70 hover:text-[#f3f0e7] hover:bg-[#342f33]'
                    }`}
                    aria-label={`Move ${tool.label} down`}
                  >
                    <ChevronDown size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Tool Picker Modal for Slot Swapping */}
      {swappingSlotIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div
            className={`w-full max-w-sm border rounded-3xl p-5 shadow-2xl space-y-4 animate-scale-in ${
              isLight ? 'bg-[#f4f0e6] border-[#2a2529]/20' : 'bg-[#2a2529] border-[#f3f0e7]/20'
            }`}
          >
            <div
              className={`flex items-center justify-between pb-2 border-b ${
                isLight ? 'border-[#2a2529]/10' : 'border-[#f3f0e7]/10'
              }`}
            >
              <div>
                <h4
                  className={`text-xs font-bold uppercase tracking-wider ${
                    isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'
                  }`}
                >
                  Replace Slot #{swappingSlotIndex + 1}
                </h4>
                <p className={`text-[11px] ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/70'}`}>
                  Select a tool to place in this navbar slot
                </p>
              </div>
              <button
                onClick={() => setSwappingSlotIndex(null)}
                className={`p-1.5 rounded-xl ${
                  isLight
                    ? 'hover:bg-[#2a2529]/10 text-[#2a2529]/60 hover:text-[#2a2529]'
                    : 'hover:bg-[#f3f0e7]/10 text-[#f3f0e7]/60 hover:text-[#f3f0e7]'
                }`}
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-1 max-h-60 overflow-y-auto">
              {allToolList.map((tool) => {
                const isCurrentInThisSlot = pinnedIds[swappingSlotIndex] === tool.id;
                const isCurrentlyPinned = pinnedSlice.includes(tool.id);

                return (
                  <button
                    key={tool.id}
                    onClick={() => handleSelectReplacement(tool.id)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all active:scale-95 ${
                      isCurrentInThisSlot
                        ? (isLight
                            ? 'bg-[#2a2529]/10 text-[#2a2529] border border-[#2a2529]/20'
                            : 'bg-[#f3f0e7]/10 text-[#f3f0e7] border border-[#f3f0e7]/20')
                        : isLight
                        ? 'hover:bg-[#ebe7dc] text-[#2a2529]'
                        : 'hover:bg-[#342f33] text-[#f3f0e7]'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                          isLight
                            ? 'bg-[#ebe7dc] text-[#2a2529]'
                            : 'bg-[#342f33] text-[#f3f0e7]'
                        }`}
                      >
                        <ToolIcon icon={tool.icon} size={15} />
                      </div>
                      <span className="text-xs font-medium">{tool.label}</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {isCurrentlyPinned && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                          Slot #{pinnedIds.indexOf(tool.id) + 1}
                        </span>
                      )}
                      {isCurrentInThisSlot && (
                        <Check size={14} className={isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. All Available Tools List with Pinned vs Overflow Toggles */}
      <div
        className={`p-4 rounded-2xl border space-y-3 shadow-sm ${
          isLight ? 'bg-[#ebe7dc] border-[#2a2529]/10' : 'bg-[#342f33] border-[#f3f0e7]/10'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h4
              className={`text-xs font-bold uppercase tracking-wider ${
                isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'
              }`}
            >
              All Available Tools
            </h4>
            <p className={`text-[11px] ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/70'}`}>
              Toggle tools between primary pinned slots and the overflow drawer.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {allToolList.map((tool) => {
            const isPinned = pinnedSlice.includes(tool.id);
            const slotIndex = pinnedIds.indexOf(tool.id);

            return (
              <div
                key={tool.id}
                className={`flex items-center justify-between p-3 rounded-xl border ${
                  isLight
                    ? 'bg-[#f4f0e6] border-[#2a2529]/10'
                    : 'bg-[#2a2529] border-[#f3f0e7]/10'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                      isPinned
                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
                        : isLight
                        ? 'bg-[#ebe7dc] text-[#2a2529]/70'
                        : 'bg-[#342f33] text-[#f3f0e7]/70'
                    }`}
                  >
                    <ToolIcon icon={tool.icon} size={16} />
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`text-xs font-semibold truncate ${
                        isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'
                      }`}
                    >
                      {tool.label}
                    </p>
                    <p
                      className={`text-[10px] ${
                        isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/60'
                      }`}
                    >
                      {isPinned ? `Pinned (Slot #${slotIndex + 1})` : 'In Overflow Menu'}
                    </p>
                  </div>
                </div>

                {/* Switch Toggle */}
                <button
                  onClick={() => {
                    if (isPinned && pinnedCount <= 2) {
                      toast.warning('Minimum 2 buttons required on bottom bar');
                      return;
                    }
                    hapticLight();
                    togglePinned(tool.id);
                  }}
                  className={`w-11 h-6 rounded-full transition-all relative p-0.5 cursor-pointer ${
                    isPinned ? 'bg-emerald-500' : isLight ? 'bg-stone-400' : 'bg-gray-600'
                  }`}
                  aria-label={`Toggle pin for ${tool.label}`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-all transform ${
                      isPinned ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Reset to Defaults */}
      <div className="pt-2">
        <button
          onClick={handleReset}
          className={`w-full flex items-center justify-center space-x-2 py-3 rounded-2xl text-xs font-bold border active:scale-95 transition-all cursor-pointer ${
            isLight
              ? 'bg-[#ebe7dc] hover:bg-[#ded9cb] text-[#2a2529] border-[#2a2529]/15'
              : 'bg-[#342f33] hover:bg-[#3e383d] text-[#f3f0e7]/80 hover:text-[#f3f0e7] border-[#f3f0e7]/15'
          }`}
        >
          <RotateCcw size={14} />
          <span>Reset Navbar to Defaults</span>
        </button>
      </div>
    </div>
  );
}
