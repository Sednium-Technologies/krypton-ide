import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, File, Moon, Sun, Monitor, PanelLeft, TerminalSquare, Play, Plus, 
  FolderPlus, Palette, ArrowLeft, Hash, Replace, SearchCode, Bot, Sparkles, 
  GitBranch, GitCommit, GitPullRequest, Code2, WrapText, Check, ChevronRight,
  Download, Terminal, Zap, Bug, FileCode, Puzzle
} from 'lucide-react';
import { useIdeStore } from '../store/useIdeStore';
import { useHarnessStore, KNOWN_HARNESSES } from '../store/useHarnessStore';
import { useNativeTerminalStore } from '../store/useNativeTerminalStore';
import { useExtensionHostStore } from '../store/useExtensionHostStore';
import { useToastStore } from '../store/useToastStore';

export type PaletteMode = 'all' | 'commands' | 'line' | 'symbol';

interface PaletteItem {
  id: string;
  category?: 'Editor' | 'Git' | 'Terminal' | 'AI' | 'View' | 'Project' | 'File' | 'Symbol' | 'Extensions';
  label: string;
  description?: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void | Promise<void>;
  detail?: string;
}

interface CommandPaletteProps {
  onRunProject: () => void;
  onBackToProjects: () => void;
}

export function CommandPalette({ onRunProject, onBackToProjects }: CommandPaletteProps) {
  const [rawQuery, setRawQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { 
    files, activeFileId, openFile, setCommandPaletteOpen, toggleSidebar, 
    setTheme, theme, setSidebarView, createFile, closeFile
  } = useIdeStore();

  const { 
    defaultHarnessId, setDefaultHarnessId, getInstalledHarnesses, 
    dispatchAgentTask, executionMode, setExecutionMode 
  } = useHarnessStore();

  const hostExtensions = useExtensionHostStore((state) => state.installedExtensions);
  const executeHostCommand = useExtensionHostStore((state) => state.executeCommand);

  const activeFile = activeFileId ? files[activeFileId] : null;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Determine palette mode based on prefix
  const { mode, query } = useMemo(() => {
    const trimmed = rawQuery.trim();
    if (trimmed.startsWith('>')) {
      return { mode: 'commands' as PaletteMode, query: trimmed.slice(1).trim().toLowerCase() };
    }
    if (trimmed.startsWith(':')) {
      return { mode: 'line' as PaletteMode, query: trimmed.slice(1).trim() };
    }
    if (trimmed.startsWith('@')) {
      return { mode: 'symbol' as PaletteMode, query: trimmed.slice(1).trim().toLowerCase() };
    }
    return { mode: 'all' as PaletteMode, query: trimmed.toLowerCase() };
  }, [rawQuery]);

  // Extract symbols from active file for '@' mode
  const fileSymbols = useMemo(() => {
    if (!activeFile?.content) return [];
    const lines = activeFile.content.split('\n');
    const symbols: PaletteItem[] = [];

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmed = line.trim();

      // Function or method: function foo(), const foo = () =>
      const funcMatch = trimmed.match(/(?:function\s+([a-zA-Z0-9_$]+)|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/);
      if (funcMatch) {
        const name = funcMatch[1] || funcMatch[2];
        symbols.push({
          id: `sym-fn-${lineNum}`,
          category: 'Symbol',
          label: name,
          description: `function (line ${lineNum})`,
          icon: <Code2 size={16} className="text-amber-400" />,
          action: () => {
            window.dispatchEvent(new CustomEvent('krypton-goto-line', { detail: { line: lineNum } }));
            setCommandPaletteOpen(false);
          }
        });
        return;
      }

      // Class or Interface: class Foo, interface Bar
      const classMatch = trimmed.match(/(?:class|interface|type)\s+([a-zA-Z0-9_$]+)/);
      if (classMatch) {
        symbols.push({
          id: `sym-class-${lineNum}`,
          category: 'Symbol',
          label: classMatch[1],
          description: `type/class (line ${lineNum})`,
          icon: <FileCode size={16} className="text-sky-400" />,
          action: () => {
            window.dispatchEvent(new CustomEvent('krypton-goto-line', { detail: { line: lineNum } }));
            setCommandPaletteOpen(false);
          }
        });
      }
    });

    return symbols;
  }, [activeFile, setCommandPaletteOpen]);

  // Base list of all IDE commands
  const allCommands: PaletteItem[] = useMemo(() => {
    const installedHarnesses = getInstalledHarnesses();
    const currentHarness = installedHarnesses.find(h => h.id === defaultHarnessId) || KNOWN_HARNESSES[0];

    return [
      // ── AI & Multi-Agent Harness ──
      {
        id: 'ai-ask',
        category: 'AI',
        label: `AI: Ask ${currentHarness.name}...`,
        description: 'Send context to your active agent harness',
        icon: <Bot size={16} className="text-violet-400" />,
        shortcut: 'Ctrl+Shift+A',
        action: () => {
          setCommandPaletteOpen(false);
          setTimeout(() => {
            const promptText = prompt(`Ask ${currentHarness.name}:`);
            if (promptText) {
              dispatchAgentTask({
                prompt: promptText,
                contextText: activeFile?.content,
                filePath: activeFile?.name
              });
            }
          }, 100);
        }
      },
      {
        id: 'ai-fix',
        category: 'AI',
        label: 'AI: Fix Diagnostics & Bugs',
        description: 'Analyze active file for errors and generate fixes',
        icon: <Bug size={16} className="text-violet-400" />,
        action: () => {
          setCommandPaletteOpen(false);
          if (activeFile) {
            dispatchAgentTask({
              prompt: `Inspect ${activeFile.name} for syntax errors, logical bugs, and edge cases. Propose exact fixes.`,
              contextText: activeFile.content,
              filePath: activeFile.name
            });
          }
        }
      },
      {
        id: 'ai-tests',
        category: 'AI',
        label: 'AI: Generate Unit Tests',
        description: 'Write comprehensive test suite for current file',
        icon: <Sparkles size={16} className="text-violet-400" />,
        action: () => {
          setCommandPaletteOpen(false);
          if (activeFile) {
            dispatchAgentTask({
              prompt: `Generate a complete unit test suite for ${activeFile.name}. Include happy paths, edge cases, and mocks.`,
              contextText: activeFile.content,
              filePath: activeFile.name
            });
          }
        }
      },
      {
        id: 'ai-switch-harness',
        category: 'AI',
        label: `AI: Switch Default Agent Harness (Active: ${currentHarness.name})`,
        description: 'Select which installed agent handles AI triggers',
        icon: <Zap size={16} className="text-violet-400" />,
        action: () => {
          setCommandPaletteOpen(false);
          setTimeout(() => {
            const options = installedHarnesses.map((h, i) => `${i + 1}. ${h.name}`).join('\n');
            const chosen = prompt(`Select Default Agent Harness (Installed Only):\n${options}`);
            if (chosen) {
              const idx = parseInt(chosen, 10) - 1;
              if (installedHarnesses[idx]) {
                setDefaultHarnessId(installedHarnesses[idx].id);
              }
            }
          }, 100);
        }
      },
      {
        id: 'ai-switch-mode',
        category: 'AI',
        label: `AI: Switch Terminal Execution Mode (Current: ${executionMode.toUpperCase()})`,
        description: 'Toggle Supervised, Autonomous, or Unbound (YOLO)',
        icon: <Bot size={16} className="text-violet-400" />,
        action: () => {
          setCommandPaletteOpen(false);
          setTimeout(() => {
            const nextMode = executionMode === 'supervised' ? 'autonomous' : (executionMode === 'autonomous' ? 'unbound' : 'supervised');
            setExecutionMode(nextMode);
          }, 100);
        }
      },

      // ── Editor Power Tools ──
      {
        id: 'editor-format',
        category: 'Editor',
        label: 'Format Document',
        description: 'Format active file with Prettier / Biome',
        icon: <Palette size={16} className="text-amber-400" />,
        shortcut: 'Shift+Alt+F',
        action: async () => {
          setCommandPaletteOpen(false);
          if (activeFile?.content) {
            try {
              const { formatCode } = await import('../lib/formatter');
              const formatted = await formatCode(activeFile.content, activeFile.language || 'plaintext');
              if (formatted && formatted !== activeFile.content) {
                useIdeStore.getState().updateFileContent(activeFileId!, formatted);
              }
            } catch {}
          }
        }
      },
      {
        id: 'editor-wrap',
        category: 'Editor',
        label: 'Toggle Word Wrap',
        description: 'Toggle soft-wrapping of long code lines',
        icon: <WrapText size={16} className="text-amber-400" />,
        action: () => {
          setCommandPaletteOpen(false);
          window.dispatchEvent(new CustomEvent('krypton-toggle-word-wrap'));
        }
      },
      {
        id: 'editor-fold-all',
        category: 'Editor',
        label: 'Fold All Code Blocks',
        description: 'Collapse all functions, classes, and brackets',
        icon: <Code2 size={16} className="text-amber-400" />,
        action: () => {
          setCommandPaletteOpen(false);
          window.dispatchEvent(new CustomEvent('krypton-fold-all'));
        }
      },
      {
        id: 'editor-unfold-all',
        category: 'Editor',
        label: 'Unfold All Code Blocks',
        description: 'Expand all collapsed code blocks',
        icon: <Code2 size={16} className="text-amber-400" />,
        action: () => {
          setCommandPaletteOpen(false);
          window.dispatchEvent(new CustomEvent('krypton-unfold-all'));
        }
      },
      {
        id: 'editor-close-active',
        category: 'Editor',
        label: 'Close Active Tab',
        description: 'Close currently open editor file',
        icon: <File size={16} className="text-amber-400" />,
        shortcut: 'Ctrl+W',
        action: () => {
          setCommandPaletteOpen(false);
          if (activeFileId) closeFile(activeFileId);
        }
      },

      // ── Git Operations ──
      {
        id: 'git-commit',
        category: 'Git',
        label: 'Git: Commit Changes',
        description: 'Stage all modified files and commit',
        icon: <GitCommit size={16} className="text-orange-400" />,
        action: () => {
          setSidebarView('git');
          if (!useIdeStore.getState().isSidebarOpen) toggleSidebar();
          setCommandPaletteOpen(false);
        }
      },
      {
        id: 'git-push',
        category: 'Git',
        label: 'Git: Push to Remote',
        description: 'Push committed branches to remote repository',
        icon: <GitPullRequest size={16} className="text-orange-400" />,
        action: () => {
          setSidebarView('git');
          if (!useIdeStore.getState().isSidebarOpen) toggleSidebar();
          setCommandPaletteOpen(false);
        }
      },
      {
        id: 'git-branch',
        category: 'Git',
        label: 'Git: Create / Switch Branch',
        description: 'Manage git working branches',
        icon: <GitBranch size={16} className="text-orange-400" />,
        action: () => {
          setSidebarView('git');
          if (!useIdeStore.getState().isSidebarOpen) toggleSidebar();
          setCommandPaletteOpen(false);
        }
      },

      // ── Terminal & System ──
      {
        id: 'term-new',
        category: 'Terminal',
        label: 'Terminal: New Linux Userland Shell',
        description: 'Open a new POSIX PTY session',
        icon: <Terminal size={16} className="text-emerald-400" />,
        shortcut: 'Ctrl+`',
        action: () => {
          setCommandPaletteOpen(false);
          useNativeTerminalStore.getState().restartSession('project');
        }
      },
      {
        id: 'term-clear',
        category: 'Terminal',
        label: 'Terminal: Clear Active Screen',
        description: 'Clear the terminal output buffer',
        icon: <TerminalSquare size={16} className="text-emerald-400" />,
        action: () => {
          setCommandPaletteOpen(false);
          useNativeTerminalStore.getState().clearBuffer('project');
        }
      },

      // ── Project Operations ──
      {
        id: 'proj-run',
        category: 'Project',
        label: 'Run Project',
        description: 'Open live web preview',
        icon: <Play size={16} className="text-teal-400" />,
        shortcut: 'Ctrl+R',
        action: () => {
          onRunProject();
          setCommandPaletteOpen(false);
        }
      },
      {
        id: 'proj-new-file',
        category: 'Project',
        label: 'New File',
        description: 'Create a new file in workspace',
        icon: <Plus size={16} className="text-teal-400" />,
        shortcut: 'Ctrl+N',
        action: () => {
          const name = prompt('File name:');
          if (name) {
            const id = createFile(name, 'root', 'file');
            openFile(id);
          }
          setCommandPaletteOpen(false);
        }
      },
      {
        id: 'proj-new-folder',
        category: 'Project',
        label: 'New Folder',
        description: 'Create a new directory in workspace',
        icon: <FolderPlus size={16} className="text-teal-400" />,
        action: () => {
          const name = prompt('Folder name:');
          if (name) createFile(name, 'root', 'folder');
          setCommandPaletteOpen(false);
        }
      },
      {
        id: 'proj-back',
        category: 'Project',
        label: 'Back to Projects Dashboard',
        description: 'Return to the workspace manager',
        icon: <ArrowLeft size={16} className="text-teal-400" />,
        action: () => {
          onBackToProjects();
          setCommandPaletteOpen(false);
        }
      },

      // ── View & Themes ──
      {
        id: 'view-sidebar',
        category: 'View',
        label: 'Toggle Sidebar',
        icon: <PanelLeft size={16} className="text-sky-400" />,
        shortcut: 'Ctrl+B',
        action: () => {
          toggleSidebar();
          setCommandPaletteOpen(false);
        }
      },
      {
        id: 'view-explorer',
        category: 'View',
        label: 'Show Explorer',
        icon: <PanelLeft size={16} className="text-sky-400" />,
        action: () => {
          setSidebarView('explorer');
          if (!useIdeStore.getState().isSidebarOpen) toggleSidebar();
          setCommandPaletteOpen(false);
        }
      },
      {
        id: 'view-search',
        category: 'View',
        label: 'Show Search in Files',
        icon: <Search size={16} className="text-sky-400" />,
        shortcut: 'Ctrl+Shift+F',
        action: () => {
          setSidebarView('search');
          if (!useIdeStore.getState().isSidebarOpen) toggleSidebar();
          setCommandPaletteOpen(false);
        }
      },
      {
        id: 'theme-warm',
        category: 'View',
        label: 'Theme: Krypton Warm',
        icon: <Moon size={16} className="text-sky-400" />,
        action: () => {
          setTheme('krypton-warm');
          setCommandPaletteOpen(false);
        }
      },
      {
        id: 'theme-dark',
        category: 'View',
        label: 'Theme: Dark',
        icon: <Moon size={16} className="text-sky-400" />,
        action: () => {
          setTheme('vs-dark');
          setCommandPaletteOpen(false);
        }
      },
      {
        id: 'theme-light',
        category: 'View',
        label: 'Theme: Light',
        icon: <Sun size={16} className="text-sky-400" />,
        action: () => {
          setTheme('light');
          setCommandPaletteOpen(false);
        }
      },
      {
        id: 'theme-hc',
        category: 'View',
        label: 'Theme: High Contrast',
        icon: <Monitor size={16} className="text-sky-400" />,
        action: () => {
          setTheme('hc-black');
          setCommandPaletteOpen(false);
        }
      },

      // ── Contributed Extension Commands ──
      ...hostExtensions.flatMap((ext) => {
        const cmds = ext.manifest?.contributes?.commands || [];
        return cmds.map((cmd) => ({
          id: `ext-cmd-${ext.id}-${cmd.command}`,
          category: 'Extensions' as const,
          label: cmd.category ? `${cmd.category}: ${cmd.title}` : cmd.title,
          description: `${cmd.command} (${ext.manifest.displayName || ext.manifest.name})`,
          icon: <Puzzle size={16} className="text-[#7C9B79]" />,
          action: async () => {
            setCommandPaletteOpen(false);
            try {
              const res = await executeHostCommand(cmd.command);
              useToastStore.getState().show({
                message: `${cmd.title} executed${res !== undefined ? `: ${typeof res === 'object' ? JSON.stringify(res) : res}` : ''}`,
                type: 'success',
              });
            } catch (err: any) {
              useToastStore.getState().show({
                message: `Failed: ${err?.message || err}`,
                type: 'error',
              });
            }
          },
        }));
      }),
    ];
  }, [
    activeFile, activeFileId, closeFile, createFile, defaultHarnessId, dispatchAgentTask, 
    executionMode, getInstalledHarnesses, onBackToProjects, onRunProject, openFile, 
    setCommandPaletteOpen, setDefaultHarnessId, setExecutionMode, setSidebarView, setTheme, toggleSidebar,
    hostExtensions, executeHostCommand
  ]);

  // Filter items based on active mode
  const filteredItems: PaletteItem[] = useMemo(() => {
    if (mode === 'line') {
      const targetLine = parseInt(query, 10);
      if (isNaN(targetLine) || targetLine <= 0) {
        return [{
          id: 'goto-line-prompt',
          category: 'Editor',
          label: 'Type a line number to navigate...',
          icon: <Hash size={16} className="text-amber-400" />,
          action: () => {}
        }];
      }
      return [{
        id: `goto-line-${targetLine}`,
        category: 'Editor',
        label: `Go to line ${targetLine}`,
        description: 'Jump cursor in active editor',
        icon: <Hash size={16} className="text-amber-400" />,
        action: () => {
          window.dispatchEvent(new CustomEvent('krypton-goto-line', { detail: { line: targetLine } }));
          setCommandPaletteOpen(false);
        }
      }];
    }

    if (mode === 'symbol') {
      if (!query) return fileSymbols;
      return fileSymbols.filter(s => 
        s.label.toLowerCase().includes(query) || 
        s.description?.toLowerCase().includes(query)
      );
    }

    if (mode === 'commands') {
      if (!query) return allCommands;
      return allCommands.filter(c => 
        c.label.toLowerCase().includes(query) || 
        c.description?.toLowerCase().includes(query) ||
        c.category?.toLowerCase().includes(query)
      );
    }

    // Default 'all' mode: Fuzzy search across files (top) and common commands (bottom)
    const matchedFiles: PaletteItem[] = Object.values(files)
      .filter(f => f.type === 'file' && (!query || f.name.toLowerCase().includes(query)))
      .map(file => ({
        id: `file-${file.id}`,
        category: 'File',
        label: file.name,
        description: 'Open file',
        icon: <File size={16} className="text-[#f3f0e7]/70" />,
        action: () => {
          openFile(file.id);
          setCommandPaletteOpen(false);
        }
      }));

    const matchedCommands = allCommands.filter(c => 
      !query || 
      c.label.toLowerCase().includes(query) || 
      c.description?.toLowerCase().includes(query)
    );

    return [...matchedFiles, ...matchedCommands];
  }, [mode, query, fileSymbols, allCommands, files, openFile, setCommandPaletteOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [rawQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filteredItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filteredItems[selectedIndex]) {
      e.preventDefault();
      filteredItems[selectedIndex].action();
    } else if (e.key === 'Escape') {
      setCommandPaletteOpen(false);
    }
  };

  const getCategoryBadgeClass = (category?: string) => {
    switch (category) {
      case 'AI': return 'bg-violet-500/20 text-violet-300 border-violet-500/30';
      case 'Editor': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'Git': return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      case 'Terminal': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'Project': return 'bg-teal-500/20 text-teal-300 border-teal-500/30';
      case 'View': return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
      case 'Symbol': return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      default: return 'bg-[#f3f0e7]/10 text-[#f3f0e7]/60 border-[#f3f0e7]/15';
    }
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-start justify-center pt-[10vh] sm:pt-[8vh] px-3">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity" 
        onClick={() => setCommandPaletteOpen(false)} 
      />
      
      <div className="relative w-full max-w-xl bg-[#2a2529]/95 backdrop-blur-2xl border border-[#f3f0e7]/15 rounded-[22px] shadow-[0_25px_60px_rgba(0,0,0,0.7)] overflow-hidden text-[#f3f0e7] animate-scale-in">
        
        {/* Mode Indicator & Input Bar */}
        <div className="flex items-center border-b border-[#f3f0e7]/10 px-4 py-1">
          {mode === 'commands' ? (
            <span className="px-2 py-0.5 text-xs font-mono font-bold rounded-lg bg-violet-500/20 text-violet-300 border border-violet-500/30 flex-shrink-0 mr-1.5">
              &gt; Commands
            </span>
          ) : mode === 'line' ? (
            <span className="px-2 py-0.5 text-xs font-mono font-bold rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 flex-shrink-0 mr-1.5">
              : Go to Line
            </span>
          ) : mode === 'symbol' ? (
            <span className="px-2 py-0.5 text-xs font-mono font-bold rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 flex-shrink-0 mr-1.5">
              @ Symbol
            </span>
          ) : (
            <Search size={16} className="text-[#f3f0e7]/60 flex-shrink-0 mr-1.5" />
          )}

          <input
            ref={inputRef}
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Command palette input"
            placeholder={
              mode === 'commands' ? 'Search commands...' :
              mode === 'line' ? 'Type line number...' :
              mode === 'symbol' ? 'Search functions, classes...' :
              "Search files or type '>' for commands, ':' for line, '@' for symbols..."
            }
            className="w-full bg-transparent py-3.5 px-2 text-[#f3f0e7] text-sm sm:text-base placeholder-[#f3f0e7]/40 focus:outline-none font-sans"
          />

          {rawQuery && (
            <button
              onClick={() => setRawQuery('')}
              className="text-[#f3f0e7]/40 hover:text-[#f3f0e7] text-xs px-2 py-1 rounded-md"
            >
              Clear
            </button>
          )}
        </div>

        {/* Results List */}
        <div className="max-h-[52vh] overflow-y-auto py-1.5 scrollbar-hide" role="listbox">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[#f3f0e7]/60">
              No matching {mode === 'commands' ? 'commands' : mode === 'symbol' ? 'symbols' : 'results'} found
            </div>
          ) : (
            filteredItems.map((item, i) => {
              const isSelected = i === selectedIndex;
              return (
                <div
                  key={item.id}
                  role="option"
                  aria-selected={isSelected}
                  className={`flex items-center justify-between px-3.5 py-2.5 mx-2 my-0.5 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[#f3f0e7] text-[#2a2529] font-medium shadow-md'
                      : 'text-[#f3f0e7]/85 hover:bg-[#f3f0e7]/10'
                  }`}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <span className={`flex-shrink-0 ${isSelected ? 'text-[#2a2529]' : ''}`}>
                      {item.icon}
                    </span>

                    <div className="min-w-0 flex items-center space-x-2 flex-1">
                      <span className="truncate text-sm font-sans">{item.label}</span>
                      {item.description && (
                        <span className={`text-xs truncate hidden sm:inline ${
                          isSelected ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/50'
                        }`}>
                          {item.description}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
                    {item.category && mode === 'commands' && (
                      <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md border ${
                        isSelected 
                          ? 'bg-[#2a2529]/15 text-[#2a2529] border-[#2a2529]/20' 
                          : getCategoryBadgeClass(item.category)
                      }`}>
                        {item.category}
                      </span>
                    )}

                    {item.shortcut && (
                      <span className={`text-xs px-2 py-0.5 rounded-md font-mono ${
                        isSelected ? 'bg-[#2a2529]/15 text-[#2a2529]' : 'bg-[#342f33] text-[#f3f0e7]/60 border border-[#f3f0e7]/10'
                      }`}>
                        {item.shortcut}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Quick Hints */}
        <div className="border-t border-[#f3f0e7]/10 px-4 py-2 bg-[#231e22]/70 flex items-center justify-between text-[11px] text-[#f3f0e7]/50">
          <div className="flex items-center space-x-3 overflow-x-auto scrollbar-hide">
            <span><kbd className="px-1 py-0.5 rounded bg-[#342f33] text-[#f3f0e7]/80">&gt;</kbd> Commands</span>
            <span><kbd className="px-1 py-0.5 rounded bg-[#342f33] text-[#f3f0e7]/80">:</kbd> Go to Line</span>
            <span><kbd className="px-1 py-0.5 rounded bg-[#342f33] text-[#f3f0e7]/80">@</kbd> Go to Symbol</span>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
            <span><kbd className="px-1 py-0.5 rounded bg-[#342f33] text-[#f3f0e7]/80">↵</kbd> Select</span>
            <span><kbd className="px-1 py-0.5 rounded bg-[#342f33] text-[#f3f0e7]/80">Esc</kbd> Close</span>
          </div>
        </div>

      </div>
    </div>
  );
}
