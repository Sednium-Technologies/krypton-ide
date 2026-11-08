import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from '../sidebar/Sidebar';
import { CodeEditor } from '../editor/CodeEditor';
import { BottomPanel } from '../terminal/BottomPanel';
import { ActivityBar } from '../sidebar/ActivityBar';
import { StatusBar } from './StatusBar';
import { LivePreview } from '../preview/LivePreview';
import { CommandPalette } from '../CommandPalette';
import { SettingsPanel } from '../sidebar/SettingsPanel';
import { ExtensionsPanel } from '../sidebar/ExtensionsPanel';
import { AiAssistant } from '../sidebar/AiAssistant';
import { useIdeStore } from '../../store/useIdeStore';
import { useProjectsStore } from '../../store/useProjectsStore';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useIsLandscape } from '../../hooks/useIsLandscape';
import { ArrowLeft, Play, Upload, Download, Files, TerminalSquare, Puzzle, Bot, Settings, ChevronLeft, Menu, GitBranch, Code2, FolderTree, Command, X, Save, ChevronDown, ChevronUp, Check, FileCode2, Columns, MoreHorizontal } from 'lucide-react';
import JSZip from 'jszip';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { BottomSheet } from '../ui/BottomSheet';
import { FileExplorer } from '../sidebar/FileExplorer';
import { LanguageIcon } from '../sidebar/LanguageIcon';
import { hapticLight, hapticMedium } from '../../lib/haptics';
import { toast } from '../../store/useToastStore';
import { useNavbarStore } from '../../store/useNavbarStore';
import { useExtensionHostStore } from '../../store/useExtensionHostStore';
import { useNativeTerminalStore } from '../../store/useNativeTerminalStore';
import { NavbarOverflowDrawer } from './NavbarOverflowDrawer';
import { NavbarSettingsPanel } from '../settings/NavbarSettingsPanel';
import { ToolIcon } from '../ui/ToolIcon';
import { ExtensionViewPanel } from '../sidebar/ExtensionViewPanel';
import { loadWorkspaceCustomCss } from '../../lib/customCssManager';
import { cn } from '../../lib/utils';

interface IdeLayoutProps {
  onBackToProjects: () => void;
}

export function IdeLayout({ onBackToProjects }: IdeLayoutProps) {
  const isSidebarOpen = useIdeStore((state) => state.isSidebarOpen);
  const toggleSidebar = useIdeStore((state) => state.toggleSidebar);
  const sidebarView = useIdeStore((state) => state.sidebarView);
  const activeExtensionView = useIdeStore((state) => state.activeExtensionView);
  const setSidebarView = useIdeStore((state) => state.setSidebarView);
  const isPreviewOpen = useIdeStore((state) => state.isPreviewOpen);
  const setPreviewOpen = useIdeStore((state) => state.setPreviewOpen);
  const isCommandPaletteOpen = useIdeStore((state) => state.isCommandPaletteOpen);
  const setCommandPaletteOpen = useIdeStore((state) => state.setCommandPaletteOpen);
  const files = useIdeStore((state) => state.files);
  const openFiles = useIdeStore((state) => state.openFiles);
  const saveFile = useIdeStore((state) => state.saveFile);
  const activeFileId = useIdeStore((state) => state.activeFileId);
  const createFile = useIdeStore((state) => state.createFile);
  const openFile = useIdeStore((state) => state.openFile);
  const loadProject = useIdeStore((state) => state.loadProject);
  const isAiFullscreen = useIdeStore((state) => state.isAiFullscreen);
  const setAiFullscreen = useIdeStore((state) => state.setAiFullscreen);
  const theme = useIdeStore((state) => state.theme);
  const isLight = theme === 'light';
  const currentProjectId = useProjectsStore((state) => state.currentProjectId);
  const projects = useProjectsStore((state) => state.projects);
  const isLandscape = useIsLandscape();
  const isSideNav = isLandscape || (typeof window !== 'undefined' && window.innerWidth >= 600);
  const [terminalHeight, setTerminalHeight] = useState(200);
  const isTerminalOpen = useIdeStore((state) => state.isTerminalOpen);
  const setIsTerminalOpen = useIdeStore((state) => state.setIsTerminalOpen);
  const isTerminalFullScreen = useIdeStore((state) => state.isTerminalFullScreen);
  const setIsTerminalFullScreen = useIdeStore((state) => state.setIsTerminalFullScreen);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showProjectTreeSheet, setShowProjectTreeSheet] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resizable split-pane width for docked sidebar in landscape / desktop
  const [sidebarWidth, setSidebarWidth] = useState(340);
  const isResizingRef = useRef(false);

  const startResizing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    isResizingRef.current = true;
    const isTouch = 'touches' in e;
    const startX = isTouch ? e.touches[0].clientX : e.clientX;
    const startWidth = sidebarWidth;

    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!isResizingRef.current) return;
      const currentX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const delta = currentX - startX;
      const newWidth = Math.max(240, Math.min(650, startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const handleStop = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleStop);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleStop);
      window.dispatchEvent(new Event('resize'));
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleStop);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleStop);
  }, [sidebarWidth]);

  // Resizable split-pane width for right-docked terminal in landscape / desktop
  const [terminalWidth, setTerminalWidth] = useState(460);
  const isTerminalResizingRef = useRef(false);

  const startTerminalResizing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    isTerminalResizingRef.current = true;
    const isTouch = 'touches' in e;
    const startX = isTouch ? e.touches[0].clientX : e.clientX;
    const startWidth = terminalWidth;

    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!isTerminalResizingRef.current) return;
      const currentX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      // Moving handle left expands right-docked terminal, moving right shrinks it
      const delta = startX - currentX;
      const maxW = Math.max(300, Math.min(window.innerWidth * 0.75, 900));
      const newWidth = Math.max(280, Math.min(maxW, startWidth + delta));
      setTerminalWidth(newWidth);
    };

    const handleStop = () => {
      isTerminalResizingRef.current = false;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleStop);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleStop);
      window.dispatchEvent(new Event('resize'));
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleStop);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleStop);
  }, [terminalWidth]);

  const currentProject = currentProjectId ? projects[currentProjectId] : null;
  const activeFile = activeFileId ? files[activeFileId] : null;

  // Navbar customization state
  const isNavbarCustomizerOpen = useNavbarStore((state) => state.isCustomizerOpen);
  const setNavbarCustomizerOpen = useNavbarStore((state) => state.setCustomizerOpen);

  // Sync extension tools on mount
  useEffect(() => {
    useNavbarStore.getState().syncExtensionTools();
    const hostStore = useExtensionHostStore.getState();
    void hostStore.loadInstalled();
    const cleanup = hostStore.initListeners();
    return cleanup;
  }, []);

  // Load & sync workspace custom CSS (.krypton/custom.css)
  useEffect(() => {
    loadWorkspaceCustomCss(files);
  }, [files]);

  // Auto-open first code file when entering a project
  useEffect(() => {
    if (activeFileId) return;
    const codeFiles = Object.values(files).filter(
      f => f.type === 'file' && f.id !== 'root' && f.content !== undefined
    );
    if (codeFiles.length > 0) {
      const priority = ['index.html', 'App.jsx', 'App.tsx', 'index.js', 'index.ts', 'main.py', 'main.js', 'app.js'];
      const entryFile = codeFiles.find(f => priority.includes(f.name)) || codeFiles[0];
      openFile(entryFile.id);
    }
  }, [files, activeFileId]);

  // Close sidebar on mobile by default
  useEffect(() => {
    if (window.innerWidth < 768 && isSidebarOpen) {
      toggleSidebar();
    }
  }, []);

  // Fix mobile viewport height + keyboard handling
  useEffect(() => {
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    setVH();
    window.addEventListener('resize', setVH);
    const handleOrientation = () => setTimeout(setVH, 100);
    window.addEventListener('orientationchange', handleOrientation);

    const vv = window.visualViewport;
    if (vv) {
      const onViewportResize = () => {
        const keyboardHeight = window.innerHeight - vv.height;
        document.documentElement.style.setProperty('--keyboard-height', `${Math.max(0, keyboardHeight)}px`);
        if (keyboardHeight > 100) {
          document.documentElement.classList.add('keyboard-open');
        } else {
          document.documentElement.classList.remove('keyboard-open');
        }
        const vh = vv.height * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
      };
      vv.addEventListener('resize', onViewportResize);
      return () => {
        vv.removeEventListener('resize', onViewportResize);
        window.removeEventListener('resize', setVH);
        window.removeEventListener('orientationchange', handleOrientation);
      };
    }

    return () => {
      window.removeEventListener('resize', setVH);
      window.removeEventListener('orientationchange', handleOrientation);
    };
  }, []);

  const handleRun = useCallback(() => {
    const active = activeFileId ? files[activeFileId] : null;
    const isRustFile = active?.language === 'rust' || (active?.name ? active.name.endsWith('.rs') : false);
    const hasCargoToml = Object.values(files).some(f => f.name === 'Cargo.toml');
    const isRustProject = currentProject?.template === 'rust-cli' || hasCargoToml || isRustFile;

    if (isRustProject) {
      if (activeFileId && files[activeFileId]?.isUnsaved) {
        saveFile(activeFileId);
      }
      if (currentProjectId) {
        useProjectsStore.getState().saveProjectToDisk(currentProjectId).catch(() => {});
      }
      setIsTerminalOpen(true);
      const termStore = useNativeTerminalStore.getState();
      termStore.switchTab('project');
      const cmd = hasCargoToml
        ? 'cargo run'
        : `if [ -f Cargo.toml ]; then cargo run; else rustc "${active?.name || 'src/main.rs'}" -o main && ./main; fi`;
      setTimeout(() => {
        useNativeTerminalStore.getState().sendInput(cmd + '\n', 'project');
      }, 100);
      toast.info('Running offline Rust compilation via Cargo...');
      return;
    }

    setPreviewOpen(true);
  }, [setPreviewOpen, activeFileId, files, currentProject, currentProjectId, saveFile, setIsTerminalOpen]);

  const handleSave = useCallback(() => {
    if (activeFileId) {
      saveFile(activeFileId);
      toast.success('File saved');
    }
  }, [activeFileId, saveFile]);

  // Auto-save on window blur, beforeunload, and app backgrounding (zero data loss)
  useEffect(() => {
    const handleAutoSave = () => {
      const state = useIdeStore.getState();
      if (state.activeFileId) {
        const f = state.files[state.activeFileId];
        if (f?.isUnsaved) {
          state.saveFile(state.activeFileId);
        }
      }
    };

    window.addEventListener('blur', handleAutoSave);
    window.addEventListener('beforeunload', handleAutoSave);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleAutoSave();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', handleAutoSave);
      window.removeEventListener('beforeunload', handleAutoSave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleBackToProjects = useCallback(() => {
    const state = useIdeStore.getState();
    if (state.activeFileId) {
      const f = state.files[state.activeFileId];
      if (f?.isUnsaved) {
        state.saveFile(state.activeFileId);
      }
    }
    onBackToProjects();
  }, [onBackToProjects]);

  const handleToggleTerminal = useCallback(() => {
    setIsTerminalOpen(prev => !prev);
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSave: handleSave,
    onCommandPalette: () => setCommandPaletteOpen(true),
    onToggleTerminal: handleToggleTerminal,
    onRun: handleRun,
  });

  const handleNavCanvas = () => {
    if (isSidebarOpen) toggleSidebar();
    setShowProjectTreeSheet(false);
  };

  const handleNavGit = () => {
    useIdeStore.setState({ sidebarView: 'git', isSidebarOpen: true });
    setShowProjectTreeSheet(false);
  };

  const handleNavSettings = () => {
    useIdeStore.setState({ sidebarView: 'settings', isSidebarOpen: true });
    setShowProjectTreeSheet(false);
  };

  const handleNavExtensions = () => {
    useIdeStore.setState({ sidebarView: 'extensions', isSidebarOpen: true });
    setShowProjectTreeSheet(false);
  };

  const handleNavAi = () => {
    useIdeStore.setState({ sidebarView: 'ai', isSidebarOpen: true });
    setShowProjectTreeSheet(false);
  };

  const handleUploadFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    Array.from(uploadedFiles).forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        const newFileId = createFile(file.name, 'root', 'file', content);
        saveFile(newFileId);
        if (index === 0) openFile(newFileId);
      };
      const isBinary = /\.(png|jpe?g|gif|webp|ico|wasm|pdf|ttf|woff2?|zip|jar|apk|bin)$/i.test(file.name) ||
        file.type.startsWith('image/') ||
        file.type.startsWith('font/');
      if (isBinary) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownloadZip = async () => {
    const zip = new JSZip();
    const addToZip = (nodeId: string, currentPath: string) => {
      const node = files[nodeId];
      if (!node) return;
      if (node.type === 'file' && node.content !== undefined) {
        zip.file(`${currentPath}${node.name}`, node.content);
      } else if (node.type === 'folder' && node.children) {
        const newPath = nodeId === 'root' ? '' : `${currentPath}${node.name}/`;
        node.children.forEach(childId => addToZip(childId, newPath));
      }
    };

    addToZip('root', '');
    const fileName = `${currentProject?.name || 'krypton-project'}.zip`;

    if (Capacitor.isNativePlatform()) {
      try {
        const base64 = await zip.generateAsync({ type: 'base64' });
        const result = await Filesystem.writeFile({
          path: fileName,
          data: base64,
          directory: Directory.Documents,
        });
        toast.success(`Exported ${fileName} to Documents`);
        try {
          if (result.uri) {
            await Share.share({
              title: fileName,
              url: result.uri,
              dialogTitle: `Share ${fileName}`,
            });
          }
        } catch {
          // Sharing is optional or dismissed by user
        }
      } catch (err) {
        console.error('Failed to export ZIP on native platform:', err);
        toast.error('Failed to export ZIP file');
      }
    } else {
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#2a2529] text-[#f3f0e7] overflow-hidden select-none">
      <style>{`
        .keyboard-open .bottom-nav {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          max-height: 0 !important;
          overflow: hidden !important;
          pointer-events: none !important;
          padding: 0 !important;
          margin: 0 !important;
          min-height: 0 !important;
          border: none !important;
        }
      `}</style>
      
      {/* Top Bar */}
      <div 
        className="flex h-[calc(3.25rem+env(safe-area-inset-top,0px))] md:h-12 items-center justify-between px-3 text-[13px] flex-shrink-0 z-20 bg-[#231e22] border-b border-[#f3f0e7]/10"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center space-x-1 min-w-0 flex-1 md:flex-none">
          <button 
            className="min-w-[44px] min-h-[44px] flex items-center justify-center md:hidden hover:bg-[#f3f0e7]/10 active:scale-95 rounded-xl text-[#f3f0e7] transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/40 focus-visible:outline-none cursor-pointer" 
            onClick={() => {
              hapticLight();
              handleBackToProjects();
            }}
            aria-label="Back to projects"
            title="Back to projects"
          >
            <ArrowLeft size={18} />
          </button>
          <button 
            className="min-w-[44px] min-h-[44px] flex items-center justify-center md:hidden hover:bg-[#f3f0e7]/10 active:scale-95 rounded-xl text-[#f3f0e7] transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/40 focus-visible:outline-none cursor-pointer" 
            onClick={() => {
              hapticLight();
              if (isLandscape) {
                if (isSidebarOpen && sidebarView === 'explorer') {
                  toggleSidebar();
                } else {
                  setSidebarView('explorer');
                  if (!isSidebarOpen) toggleSidebar();
                }
              } else {
                setShowProjectTreeSheet(true);
              }
            }}
            title="Toggle file drawer"
            aria-label="Toggle file drawer"
          >
            <Menu size={18} />
          </button>

          <div className="flex items-center px-1.5 py-1 max-w-[120px] md:max-w-[170px] flex-shrink-0">
            <span className="text-sm font-bold text-[#f3f0e7] truncate">
              {currentProject?.name || 'Krypton'}
            </span>
          </div>

          <div className="hidden md:flex items-center space-x-0.5 ml-1">
            <button 
              className="p-1 hover:bg-[#f3f0e7]/10 rounded text-[#f3f0e7]/70 hover:text-[#f3f0e7] focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/40 focus-visible:outline-none" 
              onClick={handleBackToProjects} 
              title="Back to Projects"
              aria-label="Back to projects"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="relative">
              <button 
                className="px-2 py-0.5 hover:bg-[#f3f0e7]/10 rounded cursor-pointer text-[#f3f0e7]/75 hover:text-[#f3f0e7] focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/40 focus-visible:outline-none" 
                onClick={() => setShowFileMenu(!showFileMenu)}
                aria-label="File menu"
                aria-haspopup="true"
                aria-expanded={showFileMenu}
              >File</button>
              {showFileMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowFileMenu(false)} />
                  <div className="absolute left-0 top-full mt-1 w-48 bg-[#342f33] border border-[#f3f0e7]/10 rounded-xl shadow-2xl z-50 py-1 animate-scale-in">
                    <button 
                      onClick={() => {
                        const name = prompt('File name:');
                        if (name) { const id = createFile(name, 'root', 'file'); openFile(id); }
                        setShowFileMenu(false);
                      }} 
                      className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-[#f3f0e7] hover:bg-[#f3f0e7]/10 border-b border-[#f3f0e7]/10 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/40 focus-visible:outline-none"
                      aria-label="Create new file"
                    >
                      <Files size={16} />
                      <span>New File...</span>
                    </button>
                    <button 
                      onClick={() => fileInputRef.current?.click()} 
                      className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-[#f3f0e7] hover:bg-[#f3f0e7]/10 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/40 focus-visible:outline-none"
                      aria-label="Upload files"
                    >
                      <Upload size={16} />
                      <span>Upload Files</span>
                    </button>
                    <button 
                      onClick={handleDownloadZip} 
                      className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-[#f3f0e7] hover:bg-[#f3f0e7]/10 border-b border-[#f3f0e7]/10 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/40 focus-visible:outline-none"
                      aria-label="Download project as zip"
                    >
                      <Download size={16} />
                      <span>Download .zip</span>
                    </button>
                    <button 
                      onClick={() => { setCommandPaletteOpen(true); setShowFileMenu(false); }} 
                      className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-[#f3f0e7] hover:bg-[#f3f0e7]/10 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/40 focus-visible:outline-none"
                      aria-label="Open command palette"
                    >
                      <span>Command Palette</span>
                    </button>
                  </div>
                </>
              )}
            </div>
            <button 
              className="px-2 py-0.5 hover:bg-[#f3f0e7]/10 rounded cursor-pointer text-[#f3f0e7]/75 hover:text-[#f3f0e7] focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/40 focus-visible:outline-none" 
              onClick={() => setCommandPaletteOpen(true)}
              aria-label="Open view command palette"
            >View</button>
            <button 
              className="px-2 py-0.5 hover:bg-[#f3f0e7]/10 rounded cursor-pointer text-[#f3f0e7]/75 hover:text-[#f3f0e7] focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/40 focus-visible:outline-none" 
              onClick={handleRun}
              aria-label="Run project or active file"
            >Run</button>
            <button 
              className="px-2 py-0.5 hover:bg-[#f3f0e7]/10 rounded cursor-pointer text-[#f3f0e7]/75 hover:text-[#f3f0e7] focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/40 focus-visible:outline-none" 
              onClick={handleToggleTerminal}
              aria-label="Toggle terminal panel"
            >Terminal</button>
          </div>
        </div>

        {/* Right side actions */}
        <div className="flex items-center space-x-1">

          <button 
            onClick={() => {
              hapticLight();
              setCommandPaletteOpen(true);
            }} 
            className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-[#f3f0e7]/10 active:scale-95 rounded-xl text-[#f3f0e7] transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/40 focus-visible:outline-none cursor-pointer" 
            title="Command Palette (Ctrl+P)"
            aria-label="Open command palette"
          >
            <Command size={18} />
          </button>
          <button 
            onClick={() => {
              hapticLight();
              handleToggleTerminal();
            }} 
            className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-[#f3f0e7]/10 active:scale-95 rounded-xl text-[#f3f0e7] transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/40 focus-visible:outline-none cursor-pointer" 
            title="Toggle Terminal"
            aria-label="Toggle terminal panel"
          >
            <TerminalSquare size={18} />
          </button>
          <button 
            onClick={() => {
              hapticLight();
              handleRun();
            }} 
            className="flex items-center justify-center space-x-1.5 bg-[#f3f0e7] text-[#2a2529] hover:bg-white active:scale-95 min-h-[44px] px-3.5 rounded-xl text-xs font-bold transition-all shadow-md focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/40 focus-visible:outline-none cursor-pointer"
            title="Run project or active file"
            aria-label="Run project or active file"
          >
            <Play size={14} fill="currentColor" />
            <span>Run</span>
          </button>

          <div className="hidden md:flex items-center space-x-0.5">
            <button 
              onClick={() => {
                hapticLight();
                fileInputRef.current?.click();
              }} 
              className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-[#f3f0e7]/10 active:scale-95 rounded-xl text-[#f3f0e7]/70 hover:text-[#f3f0e7] focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/40 focus-visible:outline-none transition-all cursor-pointer" 
              title="Upload Files"
              aria-label="Upload files"
            >
              <Upload size={15} />
            </button>
            <button 
              onClick={() => {
                hapticLight();
                handleDownloadZip();
              }} 
              className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-[#f3f0e7]/10 active:scale-95 rounded-xl text-[#f3f0e7]/70 hover:text-[#f3f0e7] focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/40 focus-visible:outline-none transition-all cursor-pointer" 
              title="Download .zip"
              aria-label="Download project as zip"
            >
              <Download size={15} />
            </button>
            <button 
              onClick={() => {
                hapticLight();
                handleToggleTerminal();
              }} 
              className={`min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-[#f3f0e7]/10 active:scale-95 rounded-xl transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/40 focus-visible:outline-none cursor-pointer ${isTerminalOpen ? 'text-[#f3f0e7] bg-[#f3f0e7]/10' : 'text-[#f3f0e7]/70'}`} 
              title="Toggle Terminal"
              aria-label="Toggle terminal panel"
            >
              <TerminalSquare size={15} />
            </button>
          </div>
        </div>
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        multiple 
        accept="*/*"
        onChange={handleUploadFiles} 
      />

      {/* Main Area */}
      <div className="flex flex-1 overflow-hidden relative min-h-0">
        <div className={cn(isSideNav ? "flex" : "hidden")}>
          <ActivityBar />
        </div>

        {/* Docked Sidebar (Desktop, Tablet, or Landscape - Zero Blur, Side-by-Side with Monaco, Resizable) */}
        {isSidebarOpen && isSideNav && (
          <div 
            className={cn(
              "flex border-r flex-col flex-shrink-0 transition-colors relative",
              isLight ? "bg-[#f4f0e6] border-[#2a2529]/10" : "bg-[#2a2529] border-[#f3f0e7]/10"
            )}
            style={{ width: `${sidebarWidth}px` }}
          >
            <Sidebar />
            {/* Draggable Divider Handle */}
            <div
              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#f3f0e7]/20 active:bg-blue-500/40 z-30 transition-colors"
              onMouseDown={startResizing}
              onTouchStart={startResizing}
              title="Drag to resize sidebar"
            />
          </div>
        )}

        {/* Mobile Portrait Bottom Sheet Sidebar for Standard Views — Only mounted when isSideNav is false */}
        {!isSideNav && (
          <BottomSheet
            isOpen={isSidebarOpen && sidebarView !== 'extension-view'}
            onClose={toggleSidebar}
            maxHeight="92vh"
            showDragHandle={true}
            showCloseButton={false}
          >
            <div className="flex-1 flex flex-col min-h-0 h-full">
              <Sidebar />
            </div>
          </BottomSheet>
        )}

        {/* Dedicated Mobile Popup Bottom Sheet for Active Extension View */}
        {!isSideNav && (
          <BottomSheet
            isOpen={isSidebarOpen && sidebarView === 'extension-view' && !!activeExtensionView}
            onClose={() => useIdeStore.setState({ isSidebarOpen: false })}
            title={activeExtensionView?.title || 'Extension'}
            maxHeight="88vh"
            showDragHandle={true}
            showCloseButton={true}
          >
            <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden">
              <ExtensionViewPanel />
            </div>
          </BottomSheet>
        )}

        {/* Project Files & Folders Tree Sheet (Top 3 Bars) — Mobile Portrait Only */}
        {!isSideNav && (
          <BottomSheet
            isOpen={showProjectTreeSheet}
            onClose={() => setShowProjectTreeSheet(false)}
            title="Explorer"
            maxHeight="92vh"
            showDragHandle={true}
            showCloseButton={true}
          >
            <div className="flex-1 flex flex-col min-h-0 h-full">
              <FileExplorer />
            </div>
          </BottomSheet>
        )}

        {/* Editor Area */}
        <div className={`flex flex-col min-w-0 flex-1 h-full ${isTerminalFullScreen ? 'hidden' : ''}`}>
          {!isTerminalFullScreen && (
            <div className="flex-1 relative min-h-0">
              <CodeEditor />
            </div>
          )}

          {/* Terminal (Mobile Portrait Bottom Panel) */}
          {isTerminalOpen && !isSideNav && !isTerminalFullScreen && (
            <div 
              className="flex flex-col z-20 border-t border-[#f3f0e7]/10 flex-shrink-0 bg-[#2a2529] overflow-hidden"
              style={{ height: `${terminalHeight}px` }}
            >
              <BottomPanel 
                onClose={() => setIsTerminalOpen(false)} 
                height={terminalHeight} 
                setHeight={setTerminalHeight} 
                isDockedSide={false} 
              />
            </div>
          )}
        </div>

        {/* Dedicated True Full-Screen Terminal Viewport */}
        {isTerminalOpen && isTerminalFullScreen && (
          <div 
            className="fixed inset-0 z-50 flex flex-col bg-[#2a2529] overflow-hidden w-full h-full"
            style={{ width: '100vw', height: '100vh' }}
          >
            <BottomPanel 
              onClose={() => {
                setIsTerminalFullScreen(false);
                setIsTerminalOpen(false);
              }} 
              height={typeof window !== 'undefined' ? window.innerHeight : 600} 
              setHeight={setTerminalHeight} 
              isDockedSide={false} 
            />
            {/* Persistent floating swap/back action button returning to Monaco code editor */}
            <button
              onClick={() => {
                hapticLight();
                setIsTerminalFullScreen(false);
              }}
              className="fixed bottom-6 right-6 z-[10000] flex items-center space-x-2 px-4 py-2.5 rounded-full bg-[#f3f0e7] text-[#2a2529] font-bold text-xs shadow-2xl hover:bg-white active:scale-95 transition-all border border-[#2a2529]/15 cursor-pointer"
              title="Return to Monaco Code Editor"
            >
              <Code2 size={16} />
              <span>Back to Editor</span>
            </button>
          </div>
        )}

        {/* Right Docked Terminal (Landscape / Desktop Split-Pane) */}
        {isTerminalOpen && isSideNav && (
          <aside 
            className="flex border-l flex-col flex-shrink-0 transition-colors relative bg-[#2a2529] border-[#f3f0e7]/10 z-20 h-full overflow-hidden"
            style={{ width: `${terminalWidth}px` }}
          >
            {/* Draggable Divider Handle on Left */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#f3f0e7]/20 active:bg-blue-500/40 z-30 transition-colors"
              onMouseDown={startTerminalResizing}
              onTouchStart={startTerminalResizing}
              title="Drag to resize terminal"
            />
            <div className="flex-1 min-h-0 h-full w-full overflow-hidden">
              <BottomPanel 
                onClose={() => setIsTerminalOpen(false)} 
                height={terminalHeight} 
                setHeight={setTerminalHeight} 
                isDockedSide={true} 
              />
            </div>
          </aside>
        )}
      </div>
      
      {/* Bottom Navigation Bar & Unified More Drawer — Mobile Portrait Only */}
      {!isSideNav && (
        <NavbarOverflowDrawer />
      )}

      {/* Navbar Settings Customizer Sheet */}
      <BottomSheet
        isOpen={isNavbarCustomizerOpen}
        onClose={() => setNavbarCustomizerOpen(false)}
        title="Navbar Customizer"
        maxHeight="92vh"
        showDragHandle={true}
        showCloseButton={true}
        className="max-w-xl mx-auto"
      >
        <NavbarSettingsPanel onClose={() => setNavbarCustomizerOpen(false)} />
      </BottomSheet>

      {/* Fullscreen AI Assistant Overlay */}
      {isAiFullscreen && (
        <div className="fixed inset-0 z-50 bg-[#2a2529] flex flex-col animate-fade-in">
          <AiAssistant />
        </div>
      )}

      {/* Live Preview Overlay */}
      {isPreviewOpen && (
        <LivePreview onClose={() => setPreviewOpen(false)} />
      )}

      {/* Command Palette */}
      {isCommandPaletteOpen && (
        <CommandPalette onRunProject={handleRun} onBackToProjects={onBackToProjects} />
      )}


    </div>
  );
}
