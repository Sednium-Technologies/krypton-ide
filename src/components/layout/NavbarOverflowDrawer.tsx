import React, { useEffect, useRef, useState } from 'react';
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
  const moreDockPosition = useNavbarStore((state) => state.moreDockPosition);
  const setMoreDockPosition = useNavbarStore((state) => state.setMoreDockPosition);
  const tools = useNavbarStore((state) => state.tools);
  const pinnedIds = useNavbarStore((state) => state.pinnedIds);
  const pinnedCount = useNavbarStore((state) => state.pinnedCount);
  const executeTool = useNavbarStore((state) => state.executeTool);
  const isToolActive = useNavbarStore((state) => state.isToolActive);
  const theme = useIdeStore((state) => state.theme);
  const setCommandPaletteOpen = useIdeStore((state) => state.setCommandPaletteOpen);
  const isSidebarOpen = useIdeStore((state) => state.isSidebarOpen);
  const isLight = theme === 'light';

  const [isDockArranging, setIsDockArranging] = useState(false);
  const moreLongPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPressedRef = useRef(false);

  const startMoreLongPress = () => {
    isLongPressedRef.current = false;
    if (moreLongPressTimer.current) clearTimeout(moreLongPressTimer.current);
    moreLongPressTimer.current = setTimeout(() => {
      isLongPressedRef.current = true;
      hapticMedium();
      setIsDockArranging(true);
    }, 2200);
  };

  const cancelMoreLongPress = () => {
    if (moreLongPressTimer.current) {
      clearTimeout(moreLongPressTimer.current);
      moreLongPressTimer.current = null;
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDockArranging) setIsDockArranging(false);
        else if (isOverflowOpen) setOverflowOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOverflowOpen, isDockArranging, setOverflowOpen]);

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

          {/* Floating Circular More Button */}
          <button
            onClick={() => {
              if (isLongPressedRef.current) {
                isLongPressedRef.current = false;
                return;
              }
              hapticLight();
              setOverflowOpen(!isOverflowOpen);
            }}
            onTouchStart={startMoreLongPress}
            onTouchEnd={cancelMoreLongPress}
            onTouchCancel={cancelMoreLongPress}
            onMouseDown={startMoreLongPress}
            onMouseUp={cancelMoreLongPress}
            onMouseLeave={cancelMoreLongPress}
            onContextMenu={(e) => {
              e.preventDefault();
              hapticMedium();
              setIsDockArranging(true);
            }}
            aria-label="Open more tools"
            title="More tools (long press to arrange dock)"
            className={`absolute bottom-[calc(100%+66px)] ${
              moreDockPosition === 'left'
                ? 'left-3'
                : moreDockPosition === 'center'
                ? 'left-1/2 -translate-x-1/2'
                : 'right-3'
            } z-40 w-10 h-10 rounded-full flex items-center justify-center shadow-lg border active:scale-95 transition-all select-none cursor-pointer ${
              isLight
                ? 'bg-[#f4f0e6] border-[#2a2529]/15 text-[#2a2529] hover:bg-[#eae5d8]'
                : 'bg-[#231e22] border-[#f3f0e7]/15 text-[#f3f0e7] hover:bg-[#2c262b]'
            }`}
          >
            <MoreHorizontal size={18} />
            {overflowTools.length > 0 && (
              <span
                className={`absolute -top-1 -right-1 text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full border shadow-sm ${
                  isLight
                    ? 'bg-[#2a2529] text-[#f4f0e6] border-[#f4f0e6]'
                    : 'bg-[#f3f0e7] text-[#231e22] border-[#231e22]'
                }`}
              >
                +{overflowTools.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Dock Arrangement Mode HUD */}
      <AnimatePresence>
        {isDockArranging && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className={`fixed bottom-[64px] inset-x-4 z-50 p-3 rounded-2xl border shadow-2xl flex items-center justify-between backdrop-blur-xl ${
              isLight
                ? 'bg-white/95 border-[#2a2529]/20 text-[#2a2529]'
                : 'bg-[#2a2529]/95 border-[#f3f0e7]/20 text-[#f3f0e7]'
            }`}
          >
            <div className="flex flex-col">
              <span className="text-xs font-bold uppercase tracking-wider">Dock Arrangement</span>
              <span className="text-[10px] opacity-60">Snap More tab to slot:</span>
            </div>
            <div className="flex items-center space-x-1 bg-black/10 p-1 rounded-xl">
              {(['left', 'center', 'right'] as const).map((pos) => (
                <button
                  key={pos}
                  onClick={() => {
                    hapticLight();
                    setMoreDockPosition(pos);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold capitalize transition-all active:scale-95 ${
                    moreDockPosition === pos
                      ? (isLight ? 'bg-[#2a2529] text-white shadow' : 'bg-[#f3f0e7] text-[#2a2529] shadow')
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                hapticLight();
                setIsDockArranging(false);
              }}
              className={`px-3 py-1 text-xs font-bold rounded-lg border ${
                isLight ? 'border-[#2a2529]/20 hover:bg-[#2a2529]/10' : 'border-[#f3f0e7]/20 hover:bg-[#f3f0e7]/10'
              }`}
            >
              Done
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Slide-up More Drawer: Compact Floating Menu Anchored Above Dock (Zero Lateral X Drift, No Half-Screen Takeover) */}
      <AnimatePresence>
        {isOverflowOpen && (
          <>
            {/* Scrim backdrop for click-outside dismissal */}
            <motion.div
              key="more-drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOverflowOpen(false)}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
            />

            <motion.aside
              key="more-drawer-modal"
              role="dialog"
              aria-label="More navigation tools"
              aria-modal="true"
              initial={{ opacity: 0, scaleY: 0.85, y: 12 }}
              animate={{ opacity: 1, scaleY: 1, y: 0 }}
              exit={{ opacity: 0, scaleY: 0.85, y: 12 }}
              transition={{
                type: 'spring',
                stiffness: 420,
                damping: 32,
                mass: 0.7,
              }}
              style={{
                bottom: '62px',
                transformOrigin: 'bottom center',
              }}
              className={`fixed z-50 w-[280px] flex flex-col select-none rounded-2xl border shadow-[0_12px_40px_rgba(0,0,0,0.35)] overflow-hidden ${
                moreDockPosition === 'left'
                  ? 'left-3'
                  : moreDockPosition === 'center'
                  ? 'left-1/2 -translate-x-1/2'
                  : 'right-3'
              } ${
                isLight
                  ? 'bg-[#f4f0e6] border-[#2a2529]/15 text-[#2a2529]'
                  : 'bg-[#231e22] border-[#f3f0e7]/15 text-[#f3f0e7]'
              }`}
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
          </>
        )}
      </AnimatePresence>
    </>
  );
}
