import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SlidersHorizontal, ChevronRight, ChevronDown, ChevronUp, MoreHorizontal, Command } from 'lucide-react';
import { useNavbarStore } from '../../store/useNavbarStore';
import { useIdeStore } from '../../store/useIdeStore';
import { ToolIcon } from '../ui/ToolIcon';
import { hapticLight, hapticMedium } from '../../lib/haptics';

interface NavButtonProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  onLongPress?: () => void;
}

function NavButton({ icon, label, active, onClick, onLongPress }: NavButtonProps) {
  const theme = useIdeStore((state) => state.theme);
  const isLight = theme === 'light';
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);

  const startPress = () => {
    isLongPressRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      if (onLongPress) {
        onLongPress();
      } else {
        hapticMedium();
        useNavbarStore.getState().setCustomizerOpen(true);
      }
    }, 400);
  };

  const cancelPress = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    cancelPress();
    if (isLongPressRef.current) {
      e.preventDefault();
      e.stopPropagation();
      isLongPressRef.current = false;
      return;
    }
    hapticLight();
    onClick();
  };

  return (
    <button
      onClick={handleClick}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchCancel={cancelPress}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
      role="tab"
      aria-selected={active}
      aria-label={label}
      className={`flex flex-col items-center justify-center py-1.5 px-1 min-w-[48px] min-h-[44px] rounded-xl transition-all active:scale-95 focus-visible:ring-2 focus-visible:outline-none cursor-pointer select-none ${
        isLight
          ? (active
              ? 'text-[#2a2529] font-bold bg-[#2a2529]/10 focus-visible:ring-[#2a2529]/40'
              : 'text-[#2a2529]/70 active:text-[#2a2529] focus-visible:ring-[#2a2529]/40')
          : (active
              ? 'text-[#f3f0e7] font-bold bg-[#f3f0e7]/10 focus-visible:ring-[#f3f0e7]/50'
              : 'text-[#f3f0e7]/70 active:text-[#f3f0e7] focus-visible:ring-[#f3f0e7]/50')
      }`}
    >
      {icon}
      <span className="text-[9px] mt-0.5 leading-tight">{label}</span>
    </button>
  );
}

export function NavbarOverflowDrawer() {
  const isOverflowOpen = useNavbarStore((state) => state.isOverflowOpen);
  const setOverflowOpen = useNavbarStore((state) => state.setOverflowOpen);
  const setCustomizerOpen = useNavbarStore((state) => state.setCustomizerOpen);
  const tools = useNavbarStore((state) => state.tools);
  const pinnedIds = useNavbarStore((state) => state.pinnedIds);
  const pinnedCount = useNavbarStore((state) => state.pinnedCount);
  const executeTool = useNavbarStore((state) => state.executeTool);
  const isToolActive = useNavbarStore((state) => state.isToolActive);
  const theme = useIdeStore((state) => state.theme);
  const setCommandPaletteOpen = useIdeStore((state) => state.setCommandPaletteOpen);
  const isSidebarOpen = useIdeStore((state) => state.isSidebarOpen);
  const isLight = theme === 'light';

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOverflowOpen) {
        setOverflowOpen(false);
      }
    };
    if (isOverflowOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOverflowOpen, setOverflowOpen]);

  // Compute pinned and overflow tools
  const pinnedSlice = pinnedIds.slice(0, pinnedCount);
  const overflowTools = pinnedIds
    .slice(pinnedCount)
    .map((id) => tools[id])
    .filter(Boolean);

  // Append any extra registered tools not yet listed in pinnedIds
  Object.values(tools).forEach((tool) => {
    if (!pinnedSlice.includes(tool.id) && !overflowTools.some((t) => t.id === tool.id)) {
      overflowTools.push(tool);
    }
  });

  const surfaceBg = isLight ? '#f4f0e6' : '#231e22';

  const handleToolClick = (toolId: string) => {
    executeTool(toolId);
    if (isOverflowOpen) setOverflowOpen(false);
  };

  return (
    <>
      <AnimatePresence>
        {isOverflowOpen && (
          <motion.div
            key="more-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => {
              hapticLight();
              setOverflowOpen(false);
            }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* 1. Permanent, Stable Bottom Navigation Bar */}
      <div className="relative z-40">
        <nav
          role="navigation"
          aria-label="Bottom navigation"
          className={`bottom-nav relative flex justify-around items-center flex-shrink-0 select-none border-t ${
            isLight ? 'bg-[#f4f0e6] text-[#2a2529] border-[#2a2529]/12' : 'bg-[#231e22] text-[#f3f0e7] border-[#f3f0e7]/12'
          }`}
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', minHeight: '56px' }}
        >
          {/* Pinned Nav Tools */}
          {pinnedSlice.map((toolId) => {
            const tool = tools[toolId];
            if (!tool) return null;
            const active = isToolActive(toolId) && (toolId !== 'canvas' || !isSidebarOpen);
            return (
              <NavButton
                key={tool.id}
                icon={<ToolIcon icon={tool.icon} size={19} />}
                label={tool.label}
                active={active}
                onClick={() => handleToolClick(tool.id)}
                onLongPress={() => {
                  hapticMedium();
                  setCustomizerOpen(true);
                }}
              />
            );
          })}

          {/* Perched More Tab */}
          <button
            onClick={() => {
              hapticLight();
              setOverflowOpen(!isOverflowOpen);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              hapticMedium();
              setCustomizerOpen(true);
            }}
            aria-label="Open more tools"
            title="More tools (long press to customize)"
            className={`absolute bottom-full mb-[-1px] right-3 z-40 w-[124px] h-[30px] flex items-center justify-between px-2.5 rounded-t-xl border-t border-x border-b-0 active:scale-95 transition-all cursor-pointer select-none group shadow-[0_-3px_10px_rgba(0,0,0,0.06)] ${
              isLight
                ? 'bg-[#f4f0e6] border-[#2a2529]/12 text-[#2a2529] hover:bg-[#eae5d8]'
                : 'bg-[#231e22] border-[#f3f0e7]/12 text-[#f3f0e7] hover:bg-[#2c262b]'
            }`}
          >
            {/* Seam Eraser: Extends downward 2px to eliminate any subpixel dividing line with the navbar */}
            <div
              className="absolute -bottom-[2px] left-0 right-0 h-[3px] pointer-events-none"
              style={{ backgroundColor: surfaceBg }}
            />

            <div className="flex items-center space-x-1.5 min-w-0">
              <MoreHorizontal
                size={13}
                className={`transition-colors shrink-0 ${
                  isLight ? 'text-[#2a2529]/70 group-hover:text-[#2a2529]' : 'text-[#f3f0e7]/70 group-hover:text-[#f3f0e7]'
                }`}
              />
              <span className="text-[10px] font-semibold tracking-wide">More</span>
              {overflowTools.length > 0 && (
                <span
                  className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
                    isLight ? 'bg-[#2a2529]/10 text-teal-800' : 'bg-[#f3f0e7]/10 text-teal-300'
                  }`}
                >
                  +{overflowTools.length}
                </span>
              )}
            </div>
            <ChevronUp
              size={11}
              className={`transition-transform shrink-0 ${
                isOverflowOpen ? 'rotate-180' : ''
              } ${
                isLight ? 'text-[#2a2529]/50 group-hover:text-[#2a2529]' : 'text-[#f3f0e7]/50 group-hover:text-[#f3f0e7]'
              }`}
            />
          </button>
        </nav>
      </div>

      {/* 2. Slide-up More Drawer as an Overlay Sitting Perfectly Above the Persistent Navbar */}
      <AnimatePresence>
        {isOverflowOpen && (
          <motion.aside
            key="more-drawer-modal"
            role="dialog"
            aria-label="More navigation tools"
            aria-modal="true"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{
              type: 'spring',
              stiffness: 450,
              damping: 34,
            }}
            className={`fixed inset-x-0 z-50 flex flex-col select-none rounded-t-2xl border-t shadow-[0_-16px_40px_rgba(0,0,0,0.6)] ${
              isLight
                ? 'bg-[#f4f0e6] border-[#2a2529]/12 text-[#2a2529]'
                : 'bg-[#231e22] border-[#f3f0e7]/12 text-[#f3f0e7]'
            }`}
            style={{
              bottom: '56px',
              maxHeight: 'calc(80vh - 56px)',
            }}
          >
              {/* 1. Header Bar */}
              <div
                className={`flex items-center justify-between px-4 py-3 border-b flex-shrink-0 ${
                  isLight ? 'border-[#2a2529]/10' : 'border-[#f3f0e7]/10'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <span
                    className={`text-xs font-bold tracking-wider uppercase ${
                      isLight ? 'text-[#2a2529]/90' : 'text-[#f3f0e7]/90'
                    }`}
                  >
                    More Tools
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                      isLight ? 'bg-[#2a2529]/10 text-[#2a2529]/80' : 'bg-[#f3f0e7]/10 text-[#f3f0e7]/80'
                    }`}
                  >
                    {overflowTools.length}
                  </span>
                </div>

                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => {
                      hapticLight();
                      setOverflowOpen(false);
                      setCommandPaletteOpen(true);
                    }}
                    className={`p-1.5 rounded-lg active:scale-95 transition-all cursor-pointer ${
                      isLight
                        ? 'text-[#2a2529]/70 hover:text-[#2a2529] hover:bg-[#2a2529]/10'
                        : 'text-[#f3f0e7]/70 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10'
                    }`}
                    title="Command Palette (⌘)"
                    aria-label="Open command palette"
                  >
                    <Command size={15} className="shrink-0" />
                  </button>
                  <button
                    onClick={() => {
                      hapticLight();
                      setOverflowOpen(false);
                      setCustomizerOpen(true);
                    }}
                    className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold active:scale-95 transition-all cursor-pointer ${
                      isLight
                        ? 'text-[#2a2529]/70 hover:text-[#2a2529] hover:bg-[#2a2529]/10'
                        : 'text-[#f3f0e7]/70 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10'
                    }`}
                    title="Customize Navbar Layout"
                    aria-label="Customize navbar"
                  >
                    <SlidersHorizontal size={13} />
                    <span>Edit</span>
                  </button>

                  <button
                    onClick={() => {
                      hapticLight();
                      setOverflowOpen(false);
                    }}
                    className={`p-1 rounded-lg active:scale-95 transition-all cursor-pointer ${
                      isLight
                        ? 'text-[#2a2529]/70 hover:text-[#2a2529] hover:bg-[#2a2529]/10'
                        : 'text-[#f3f0e7]/70 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10'
                    }`}
                    title="Collapse more tools"
                    aria-label="Collapse more tools"
                  >
                    <ChevronDown size={18} />
                  </button>
                </div>
              </div>

              {/* 2. Scrollable Overflow Tools List */}
              <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 scrollbar-thin scrollbar-thumb-white/10 overscroll-contain">
                {overflowTools.length === 0 ? (
                  <div className="py-8 text-center px-4">
                    <p className={`text-xs ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/60'}`}>
                      All tools are currently pinned to your bottom bar.
                    </p>
                    <button
                      onClick={() => {
                        hapticLight();
                        setOverflowOpen(false);
                        setCustomizerOpen(true);
                      }}
                      className={`mt-3 inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                        isLight
                          ? 'bg-[#e8e4d9] hover:bg-[#ded9cc] text-[#2a2529] border-[#2a2529]/15'
                          : 'bg-[#342f33] hover:bg-[#3d373c] text-[#f3f0e7] border-[#f3f0e7]/15'
                      }`}
                    >
                      <SlidersHorizontal size={13} />
                      <span>Edit Navbar</span>
                    </button>
                  </div>
                ) : (
                  overflowTools.map((tool) => {
                    const active = isToolActive(tool.id);

                    return (
                      <button
                        key={tool.id}
                        onClick={() => {
                          hapticLight();
                          executeTool(tool.id);
                          setOverflowOpen(false);
                        }}
                        className={`w-full min-h-[46px] flex items-center space-x-3 px-3.5 py-2.5 rounded-xl transition-all cursor-pointer active:scale-95 text-left focus-visible:ring-2 focus-visible:outline-none ${
                          isLight
                            ? active
                              ? 'bg-[#2a2529]/10 text-[#2a2529] font-semibold shadow-sm focus-visible:ring-[#2a2529]/40'
                              : 'text-[#2a2529]/80 hover:text-[#2a2529] hover:bg-[#2a2529]/5 focus-visible:ring-[#2a2529]/40'
                            : active
                            ? 'bg-[#f3f0e7]/15 text-[#f3f0e7] font-semibold shadow-sm focus-visible:ring-[#f3f0e7]/40'
                            : 'text-[#f3f0e7]/80 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10 focus-visible:ring-[#f3f0e7]/40'
                        }`}
                        aria-label={`Open ${tool.label}`}
                      >
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                            isLight
                              ? active
                                ? 'bg-[#2a2529] text-[#f3f0e7]'
                                : 'bg-[#e8e4d9] text-[#2a2529]/80'
                              : active
                              ? 'bg-[#f3f0e7] text-[#2a2529]'
                              : 'bg-[#342f33] text-[#f3f0e7]/80'
                          }`}
                        >
                          <ToolIcon icon={tool.icon} size={17} strokeWidth={1.8} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{tool.label}</p>
                          {tool.isCustom && (
                            <span
                              className={`text-[9px] font-medium uppercase tracking-wider ${
                                isLight ? 'text-teal-700' : 'text-teal-400'
                              }`}
                            >
                              Plugin
                            </span>
                          )}
                        </div>
                        {active && (
                          <span
                            className="w-2 h-2 rounded-full bg-[#7C9B79] shadow-sm shrink-0"
                            title="Active"
                          />
                        )}
                        <ChevronRight
                          size={14}
                          className={`shrink-0 ml-1 ${isLight ? 'text-[#2a2529]/30' : 'text-[#f3f0e7]/30'}`}
                        />
                      </button>
                    );
                  })
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
    </>
  );
}
