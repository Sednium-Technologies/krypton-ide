import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronUp, ChevronDown, Trash2, Send, AlertCircle, AlertTriangle, Info, Package, GripHorizontal, Maximize2, Minimize2, Move } from 'lucide-react';
import { TerminalPanel } from './TerminalPanel';
import { useOutputStore } from '../../store/useOutputStore';
import { useProblemsStore } from '../../store/useProblemsStore';
import { useIdeStore } from '../../store/useIdeStore';
import { useProjectsStore } from '../../store/useProjectsStore';
import { OortyLiteIcon } from '../ui/OortyLiteIcon';
import { hapticSelection } from '../../lib/haptics';

interface BottomPanelProps {
  onClose: () => void;
  height: number;
  setHeight: (height: number) => void;
  isDockedSide?: boolean;
}

export function BottomPanel({ onClose, height, setHeight, isDockedSide = false }: BottomPanelProps) {
  const currentProjectId = useProjectsStore((s) => s.currentProjectId);
  const projects = useProjectsStore((s) => s.projects);
  const runTarget = useIdeStore((s) => s.runTarget);
  const setRunTarget = useIdeStore((s) => s.setRunTarget);
  const project = currentProjectId ? projects[currentProjectId] : null;
  const isAndroidProject = project?.template?.startsWith('android-');
  const isKotlinOrJava = project?.template === 'kotlin-cli' || project?.template === 'java-cli';

  const [activeTab, setActiveTab] = useState<'terminal' | 'problems' | 'output' | 'console' | 'build'>('terminal');
  const consoleLogs = useOutputStore(s => s.consoleLogs);
  const addConsoleLog = useOutputStore(s => s.addConsoleLog);
  const clearConsoleLogs = useOutputStore(s => s.clearConsoleLogs);

  useEffect(() => {
    if (activeTab === 'build' && !isAndroidProject) {
      setActiveTab('terminal');
    }
    if (activeTab === 'terminal') {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isAndroidProject, activeTab]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        addConsoleLog({ type: detail.level, args: detail.args, ts: Date.now() });
      }
    };
    window.addEventListener('krypton-console-log', handler);
    return () => window.removeEventListener('krypton-console-log', handler);
  }, []);

  const panelRef = useRef<HTMLDivElement>(null);
  const [dragTranslateY, setDragTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const touchStartYRef = useRef(0);
  const touchStartXRef = useRef(0);
  const touchStartTimeRef = useRef(0);
  const touchMovedRef = useRef(false);
  const isDraggingRef = useRef(false);
  const dragTranslateYRef = useRef(0);
  const lastTapRef = useRef(0);

  const isTerminalFullScreen = useIdeStore((s) => s.isTerminalFullScreen);
  const setIsTerminalFullScreen = useIdeStore((s) => s.setIsTerminalFullScreen);

  const [isFloating, setIsFloating] = useState(true);
  const [floatPos, setFloatPos] = useState({ x: 30, y: 70 });
  const [floatSize, setFloatSize] = useState({
    width: Math.min(680, typeof window !== 'undefined' ? window.innerWidth - 60 : 580),
    height: 380,
  });
  const floatDragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);

  const handleFloatDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    floatDragRef.current = { startX: clientX, startY: clientY, posX: floatPos.x, posY: floatPos.y };

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!floatDragRef.current) return;
      const curX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const curY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;
      const nextX = Math.max(10, Math.min(window.innerWidth - floatSize.width - 10, floatDragRef.current.posX + (curX - floatDragRef.current.startX)));
      const nextY = Math.max(10, Math.min(window.innerHeight - floatSize.height - 10, floatDragRef.current.posY + (curY - floatDragRef.current.startY)));
      setFloatPos({ x: nextX, y: nextY });
    };

    const onEnd = () => {
      floatDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onEnd);
  };

  const togglePanelHeight = () => {
    const normalH = Math.round(window.innerHeight * 0.40);
    const expandedH = Math.round(window.innerHeight * 0.75);
    const targetH = height >= (normalH + expandedH) / 2 ? normalH : expandedH;
    setHeight(targetH);
    hapticSelection();
  };

  const handleDragStart = (e: React.MouseEvent) => {
    const startY = e.clientY;
    const startHeight = height;

    const onMove = (moveEvent: MouseEvent) => {
      const deltaY = startY - moveEvent.clientY;
      const newHeight = Math.max(120, Math.min(window.innerHeight - 100, startHeight + deltaY));
      setHeight(newHeight);
    };

    const onEnd = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartTimeRef.current = Date.now();
    touchMovedRef.current = false;
    isDraggingRef.current = false;
    dragTranslateYRef.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const currentY = e.touches[0].clientY;
    const currentX = e.touches[0].clientX;
    const deltaY = currentY - touchStartYRef.current;
    const deltaX = Math.abs(currentX - touchStartXRef.current);

    // If initial movement is horizontal (e.g. scrolling tabs), don't hijack swipe
    if (!isDraggingRef.current && deltaX > Math.abs(deltaY) && deltaX > 8) {
      return;
    }

    if (deltaY > 0) {
      touchMovedRef.current = true;
      isDraggingRef.current = true;
      setIsDragging(true);
      dragTranslateYRef.current = deltaY;
      setDragTranslateY(deltaY);
    } else {
      dragTranslateYRef.current = 0;
      setDragTranslateY(0);
    }
  };

  const handleTouchEnd = () => {
    const deltaY = dragTranslateYRef.current;
    const touchDuration = Date.now() - touchStartTimeRef.current;
    setIsDragging(false);
    isDraggingRef.current = false;

    if (deltaY > 70) {
      // Swiped down past threshold: close panel, trigger haptic tick, reset drag state
      hapticSelection();
      useIdeStore.getState().setIsTerminalOpen(false);
      onClose();
      dragTranslateYRef.current = 0;
      setDragTranslateY(0);
    } else {
      // Snap smoothly back to translateY(0) with spring transition
      dragTranslateYRef.current = 0;
      setDragTranslateY(0);

      // Check double-tap gesture
      if (!touchMovedRef.current && touchDuration < 350) {
        const now = Date.now();
        if (now - lastTapRef.current < 350) {
          togglePanelHeight();
          lastTapRef.current = 0;
        } else {
          lastTapRef.current = now;
        }
      }
    }
  };

  const handleDragHandleClick = () => {
    if (!touchMovedRef.current && Math.abs(dragTranslateYRef.current) < 5) {
      togglePanelHeight();
    }
  };

  return (
    <div 
      ref={panelRef}
      className={`flex flex-col bg-[#2a2529] text-[#f3f0e7] ${
        isTerminalFullScreen
          ? 'fixed inset-0 w-screen h-screen z-[9999] rounded-none border-0 shadow-none'
          : isFloating
            ? 'rounded-[28px] border border-[#f3f0e7]/20 shadow-2xl overflow-hidden'
            : 'h-full rounded-t-[28px] overflow-hidden will-change-transform'
      }`}
      style={isTerminalFullScreen ? {
        position: 'fixed',
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 9999,
      } : isFloating ? {
        position: 'fixed',
        left: `${floatPos.x}px`,
        top: `${floatPos.y}px`,
        width: `${floatSize.width}px`,
        height: `${floatSize.height}px`,
        zIndex: 100,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
      } : {
        transform: isDockedSide ? 'none' : `translateY(${dragTranslateY}px)`,
        transition: (isDragging && !isDockedSide) ? 'none' : 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      }}
    >
      {/* Visual Drag Handle & Swipe Bar — Hidden when side-docked or floating or fullscreen */}
      {!isDockedSide && !isFloating && !isTerminalFullScreen && (
        <div 
          onMouseDown={handleDragStart}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleDragHandleClick}
          onDoubleClick={togglePanelHeight}
          className="w-full pt-1.5 pb-1 flex flex-col items-center justify-center cursor-ns-resize bg-[#231e22] hover:bg-[#f3f0e7]/10 transition-colors border-b border-[#f3f0e7]/5 touch-none select-none group"
          title="Swipe down to dismiss • Tap or double-tap to toggle height • Drag to resize"
        >
          <div className="w-10 h-1 rounded-full bg-[#f3f0e7]/30 my-1 mx-auto group-hover:bg-[#f3f0e7]/50 transition-colors" />
        </div>
      )}

      {/* Header Tabs with Move handle when floating */}
      <div 
        onMouseDown={isFloating ? handleFloatDragStart : undefined}
        onTouchStart={isFloating ? handleFloatDragStart : (isDockedSide ? undefined : handleTouchStart)}
        onTouchMove={isFloating ? undefined : (isDockedSide ? undefined : handleTouchMove)}
        onTouchEnd={isFloating ? undefined : (isDockedSide ? undefined : handleTouchEnd)}
        onDoubleClick={isDockedSide || isFloating ? undefined : togglePanelHeight}
        className={`flex h-9 items-center justify-between px-2 md:px-4 bg-[#231e22] border-b border-[#f3f0e7]/10 overflow-x-auto scrollbar-hide select-none flex-shrink-0 ${
          isFloating ? 'cursor-move' : ''
        }`}
      >
        <div 
          role="tablist"
          aria-label="Bottom panel tabs"
          className="flex items-center space-x-4 text-[11px] uppercase tracking-wider text-[#f3f0e7]/75 whitespace-nowrap"
        >
          <ProblemsTabLabel active={activeTab === 'problems'} onClick={() => setActiveTab('problems')} />
          <OutputTabLabel active={activeTab === 'output'} onClick={() => setActiveTab('output')} />
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'console'}
            aria-label="Console tab"
            tabIndex={0}
            className={`flex items-center space-x-2 cursor-pointer h-9 px-1 uppercase tracking-wider text-[11px] focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none rounded ${activeTab === 'console' ? 'text-[#f3f0e7] border-b-2 border-[#f3f0e7] font-bold' : 'text-[#f3f0e7]/75 hover:text-[#f3f0e7]'}`}
            onClick={() => setActiveTab('console')}
          >
            <span>Console</span>
            {consoleLogs.length > 0 && (
              <span className="bg-[#7c9b79]/20 text-[#7c9b79] text-[10px] px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center">{consoleLogs.length}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'terminal'}
            aria-label="Terminal tab"
            tabIndex={0}
            className={`flex items-center space-x-2 cursor-pointer h-9 px-1 uppercase tracking-wider text-[11px] focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none rounded ${activeTab === 'terminal' ? 'text-[#f3f0e7] border-b-2 border-[#f3f0e7] font-bold' : 'text-[#f3f0e7]/75 hover:text-[#f3f0e7]'}`}
            onClick={() => setActiveTab('terminal')}
          >
            <span>Terminal</span>
          </button>
          {isAndroidProject && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'build'}
              aria-label="Build APK tab"
              tabIndex={0}
              className={`flex items-center space-x-1.5 cursor-pointer h-9 px-1 uppercase tracking-wider text-[11px] focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none rounded ${activeTab === 'build' ? 'text-[#f3f0e7] border-b-2 border-[#f3f0e7] font-bold' : 'text-[#f3f0e7]/75 hover:text-[#f3f0e7]'}`}
              onClick={() => setActiveTab('build')}
            >
              <Package size={14} />
              <span className="font-bold">Build APK</span>
            </button>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {isKotlinOrJava && (
            <div className="hidden md:flex items-center bg-[#32303a] rounded-full p-0.5 border border-[#f3f0e7]/10 mr-2">
              <button
                onClick={() => setRunTarget('java')}
                className={`px-3 py-0.5 rounded-full text-[10px] font-bold transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${
                  runTarget === 'java' ? 'bg-[#f3f0e7] text-[#2a2529] shadow-md' : 'text-[#f3f0e7]/75 hover:text-[#f3f0e7]'
                }`}
              >
                JVM
              </button>
              <button
                onClick={() => setRunTarget('wasm')}
                className={`px-3 py-0.5 rounded-full text-[10px] font-bold transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${
                  runTarget === 'wasm' ? 'bg-[#7c9b79] text-[#2a2529] shadow-md' : 'text-[#f3f0e7]/75 hover:text-[#f3f0e7]'
                }`}
              >
                WASM
              </button>
            </div>
          )}

          <div className="flex items-center space-x-1 text-[#f3f0e7]/75 flex-shrink-0">
            {isTerminalFullScreen && (
              <button
                type="button"
                onClick={() => {
                  hapticSelection();
                  setIsTerminalFullScreen(false);
                }}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-[#f3f0e7] text-[#2a2529] hover:bg-white text-[11px] font-bold shadow-md transition-all active:scale-95 border border-[#2a2529]/10 mr-1 cursor-pointer"
                title="Return to Monaco Code Editor"
              >
                <span>Back to Editor</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                hapticSelection();
                setIsTerminalFullScreen(!isTerminalFullScreen);
              }}
              className="p-1 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10 rounded focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
              title={isTerminalFullScreen ? "Exit Full Screen" : "Full Screen Mode"}
              aria-label={isTerminalFullScreen ? "Exit Full Screen" : "Full Screen Mode"}
            >
              {isTerminalFullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              type="button"
              onClick={() => {
                hapticSelection();
                setIsFloating(!isFloating);
              }}
              className="p-1 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10 rounded focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
              title={isFloating ? "Dock terminal to bottom" : "Float terminal freely on screen"}
              aria-label={isFloating ? "Dock terminal" : "Float terminal"}
            >
              {isFloating ? <Minimize2 size={14} /> : <Move size={14} />}
            </button>
            {!isDockedSide && !isFloating && (
              <button 
                onClick={togglePanelHeight} 
                className="p-1 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10 rounded focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none" 
                title="Toggle Height"
                aria-label="Toggle bottom panel height"
              >
                {height >= (Math.round(window.innerHeight * 0.40) + Math.round(window.innerHeight * 0.75)) / 2 ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
            )}
            <button 
              onClick={onClose} 
              className="p-1 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10 rounded focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none" 
              title="Close Panel"
              aria-label="Close bottom panel"
            ><X size={14} /></button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-0 relative">
        <div className={`h-full w-full flex flex-col ${activeTab === 'terminal' ? '' : 'hidden'}`}>
          <TerminalPanel />
        </div>
        {activeTab === 'problems' && <ProblemsPanel />}
        {activeTab === 'output' && <OutputPanel />}
        {activeTab === 'console' && <ConsolePanel logs={consoleLogs} onClear={clearConsoleLogs} />}
        {activeTab === 'build' && <BuildPanel onMinimize={onClose} />}
      </div>
    </div>
  );
}

function BuildPanel({ onMinimize }: { onMinimize: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-[#f3f0e7]/75 text-sm space-y-3 px-8">
      <Package size={32} className="opacity-40 text-[#f3f0e7]" />
      <p className="text-center">Use the <span className="text-[#f3f0e7] font-semibold">GitHub</span> panel to trigger APK builds via GitHub Actions.</p>
      <p className="text-[11px] text-[#f3f0e7]/70 text-center">Go to Git Panel → Actions → Trigger Build Workflow</p>
    </div>
  );
}

function ProblemsTabLabel({ active, onClick }: { active: boolean; onClick: () => void }) {
  const errorCount = useProblemsStore(s => s.errorCount);
  const warningCount = useProblemsStore(s => s.warningCount);
  const totalCount = errorCount + warningCount;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={`Problems tab (${totalCount} problems)`}
      tabIndex={0}
      className={`flex items-center space-x-2 cursor-pointer h-9 px-1 uppercase tracking-wider text-[11px] focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none rounded ${active ? 'text-[#f3f0e7] border-b-2 border-[#f3f0e7] font-bold' : 'text-[#f3f0e7]/75 hover:text-[#f3f0e7]'}`}
      onClick={onClick}
    >
      <span>Problems</span>
      {totalCount > 0 && (
        <span className="bg-red-500/20 text-red-500 dark:text-red-400 border border-red-500/30 text-[10px] px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center">
          {totalCount}
        </span>
      )}
    </button>
  );
}

function OutputTabLabel({ active, onClick }: { active: boolean; onClick: () => void }) {
  const entryCount = useOutputStore(s => s.entries.length);

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={`Output tab (${entryCount} entries)`}
      tabIndex={0}
      className={`flex items-center space-x-2 cursor-pointer h-9 px-1 uppercase tracking-wider text-[11px] focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none rounded ${active ? 'text-[#f3f0e7] border-b-2 border-[#f3f0e7] font-bold' : 'text-[#f3f0e7]/75 hover:text-[#f3f0e7]'}`}
      onClick={onClick}
    >
      <span>Output</span>
      {entryCount > 0 && (
        <span className="bg-[#f3f0e7]/20 text-[#f3f0e7] text-[10px] px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center">{entryCount}</span>
      )}
    </button>
  );
}

function ProblemsPanel() {
  const problems = useProblemsStore(s => s.problems);
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const { setSidebarView } = useIdeStore();

  const filtered = filterSeverity === 'all' 
    ? problems 
    : problems.filter(p => p.severity === filterSeverity);

  const grouped = filtered.reduce<Record<string, typeof problems>>((acc, p) => {
    const key = p.fileName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const sendToAgent = () => {
    if (problems.length === 0) return;
    
    const summary = problems.map(p => 
      `[${p.severity.toUpperCase()}] ${p.fileName}:${p.startLine}:${p.startCol} — ${p.message}`
    ).join('\n');

    setSidebarView('ai');
    
    window.dispatchEvent(new CustomEvent('krypton-send-to-agent', {
      detail: {
        text: `Fix these problems in my project:\n\n${summary}`
      }
    }));
  };

  const severityIcon = (severity: string) => {
    switch (severity) {
      case 'error': return <AlertCircle size={14} className="text-red-400 flex-shrink-0" />;
      case 'warning': return <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />;
      default: return <Info size={14} className="text-[#88c0d0] flex-shrink-0" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#2a2529]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#f3f0e7]/10 flex-shrink-0">
        <div className="flex items-center space-x-1">
          {(['all', 'error', 'warning', 'info'] as const).map(sev => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              className={`px-2 py-1 rounded text-[10px] uppercase tracking-wider font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${
                filterSeverity === sev
                  ? 'bg-[#f3f0e7]/20 text-[#f3f0e7]'
                  : 'text-[#f3f0e7]/70 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/5'
              }`}
            >
              {sev === 'all' ? `All (${problems.length})` : `${sev} (${problems.filter(p => p.severity === sev).length})`}
            </button>
          ))}
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={sendToAgent}
            disabled={problems.length === 0}
            className="p-1.5 rounded hover:bg-[#f3f0e7]/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-[#f3f0e7] focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
            title="Send to Oorty Lite"
            aria-label="Send problems to Oorty Lite"
          >
            <OortyLiteIcon size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {Object.keys(grouped).length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#f3f0e7]/70 text-sm">
            <div className="text-center">
              <AlertCircle size={24} className="mx-auto mb-2 opacity-30" />
              <p>No problems detected.</p>
            </div>
          </div>
        ) : (
          Object.entries(grouped).map(([fileName, fileProblems]) => (
            <div key={fileName}>
              <div className="px-3 py-1.5 text-[11px] font-semibold text-[#f3f0e7] bg-[#32303a] sticky top-0 flex items-center space-x-2 border-b border-[#f3f0e7]/5">
                <span>{fileName}</span>
                <span className="text-[#f3f0e7]/70">({fileProblems.length})</span>
              </div>
              {fileProblems.map(problem => (
                <div
                  key={problem.id}
                  className="flex items-start space-x-2 px-3 py-1.5 hover:bg-[#32303a]/60 cursor-pointer text-[12px] border-b border-[#f3f0e7]/5"
                  onClick={() => {
                    const store = useIdeStore.getState();
                    const fileEntry = Object.values(store.files).find(f => f.name === problem.fileName);
                    if (fileEntry) {
                      store.openFile(fileEntry.id);
                    }
                  }}
                >
                  {severityIcon(problem.severity)}
                  <div className="flex-1 min-w-0">
                    <span className="text-[#f3f0e7]">{problem.message}</span>
                  </div>
                  <span className="text-[#f3f0e7]/70 text-[10px] flex-shrink-0 font-mono">
                    [{problem.startLine}:{problem.startCol}]
                  </span>
                  <span className="text-[#f3f0e7]/70 text-[10px] flex-shrink-0">
                    {problem.source}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function OutputPanel() {
  const entries = useOutputStore(s => s.entries);
  const clearOutput = useOutputStore(s => s.clear);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filterSource, setFilterSource] = useState<'all' | 'terminal' | 'runner' | 'git' | 'system'>('all');

  const filtered = filterSource === 'all' 
    ? entries 
    : entries.filter(e => e.source === filterSource);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length]);

  const typeColor = (type: string) => {
    switch (type) {
      case 'stderr': return 'text-red-400';
      case 'info': return 'text-[#88c0d0]';
      case 'system': return 'text-[#7c9b79]';
      default: return 'text-[#f3f0e7]';
    }
  };

  const sourceTag = (source: string) => {
    const colors: Record<string, string> = {
      terminal: 'bg-green-500/15 text-green-400',
      runner: 'bg-[#f3f0e7]/15 text-[#f3f0e7]',
      git: 'bg-amber-500/15 text-amber-400',
      system: 'bg-[#7c9b79]/15 text-[#7c9b79]',
    };
    return colors[source] || 'bg-stone-500/15 text-stone-400';
  };

  return (
    <div className="flex flex-col h-full bg-[#2a2529]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#f3f0e7]/10 flex-shrink-0">
        <div className="flex items-center space-x-1">
          {(['all', 'runner', 'terminal', 'git', 'system'] as const).map(src => (
            <button
              key={src}
              onClick={() => setFilterSource(src)}
              className={`px-2 py-1 rounded text-[10px] uppercase tracking-wider font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${
                filterSource === src
                  ? 'bg-[#f3f0e7]/20 text-[#f3f0e7]'
                  : 'text-[#f3f0e7]/70 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/5'
              }`}
            >
              {src}
            </button>
          ))}
        </div>
        <button
          onClick={clearOutput}
          className="p-1 text-[#f3f0e7]/70 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10 rounded focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
          title="Clear Output"
          aria-label="Clear output"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto font-mono text-[12px]">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#f3f0e7]/70 text-sm">
            No output available.
          </div>
        ) : (
          filtered.map(entry => (
            <div key={entry.id} className="flex items-start px-3 py-1 hover:bg-[#32303a]/50 border-b border-[#f3f0e7]/5">
              <span className="text-[#f3f0e7]/70 text-[10px] mr-2 flex-shrink-0 pt-0.5 min-w-[60px]">
                {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false })}
              </span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded mr-2 flex-shrink-0 uppercase tracking-wider font-bold ${sourceTag(entry.source)}`}>
                {entry.source}
              </span>
              <pre className={`flex-1 whitespace-pre-wrap break-words ${typeColor(entry.type)}`}>
                {entry.text}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ConsolePanel({ logs, onClear }: { logs: { type: string; args: string; ts: number }[]; onClear: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const logColor = (type: string) => {
    switch (type) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-amber-400';
      case 'info': return 'text-[#88c0d0]';
      default: return 'text-[#f3f0e7]';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#2a2529]">
      <div className="flex items-center justify-between px-3 py-1 border-b border-[#f3f0e7]/10 flex-shrink-0">
        <span className="text-[10px] text-[#f3f0e7]/70">Console Output</span>
        <button 
          onClick={onClear} 
          className="p-1 text-[#f3f0e7]/70 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10 rounded focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none" 
          title="Clear"
          aria-label="Clear console"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto font-mono text-[12px]">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#f3f0e7]/70 text-sm">
            No console output.
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className={`flex items-start px-3 py-1 hover:bg-[#32303a]/50 border-b border-[#f3f0e7]/5 ${logColor(log.type)}`}>
              <span className="text-[#f3f0e7]/70 text-[10px] mr-2 flex-shrink-0 pt-0.5 min-w-[52px]">
                {new Date(log.ts).toLocaleTimeString('en-US', { hour12: false })}
              </span>
              <pre className="flex-1 whitespace-pre-wrap break-words">{log.args}</pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
