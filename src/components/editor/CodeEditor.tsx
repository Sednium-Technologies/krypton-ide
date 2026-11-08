import React, { useState, useCallback, useEffect, useRef } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { useIdeStore } from '../../store/useIdeStore';
import { useAiStore } from '../../store/useAiStore';
import { OortyLiteIcon } from '../ui/OortyLiteIcon';
import { KryptonLoader } from '../ui/KryptonLoader';
import { X, Keyboard as KeyboardIcon, FileCode2, Zap, Eye, Code2, Paintbrush, ClipboardPaste, ClipboardCopy, Undo2, Redo2, Search, TextSelect, ChevronUp, ChevronDown, Replace, Save } from 'lucide-react';
import { cn } from '../../lib/utils';
import { MarkdownPreview } from './MarkdownPreview';
import { useProblemsStore, extractMonacoProblems } from '../../store/useProblemsStore';
import { hapticLight, hapticMedium, hapticSelection } from '../../lib/haptics';
import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';
import { Keyboard } from '@capacitor/keyboard';
import { readConfig, readFontFile } from '../../lib/fileSystemStorage';
import { getSnippetsForLanguage, getSnippetLanguages } from '../../lib/languageSnippets';

import { FloatingContextMenu } from './FloatingContextMenu';
import { usePinchZoom } from '../../hooks/usePinchZoom';
import { useEditorCompletions } from '../../hooks/useEditorCompletions';
import { LanguageIcon } from '../sidebar/LanguageIcon';
import { predictLocalCompletion, fetchAiInlineCompletion } from '../../lib/ai/inlineCompletionService';
import { useExtensionsStore } from '../../store/useExtensionsStore';
import { registerAllMonacoThemes, resolveActiveMonacoTheme } from '../../lib/monacoThemes';
import { useIsLandscape } from '../../hooks/useIsLandscape';
import { registerMonacoLspProviders } from '../../lib/lsp/monacoLspAdapter';
import { useLspStore } from '../../store/useLspStore';
import { WorkspaceTrustBanner } from '../trust/WorkspaceTrustBanner';

// Monaco identifies models by URI. Using only the file name made two files
// such as src/index.js and test/index.js share one buffer. The node id makes
// each model stable and unique.
function fileModelUri(file: { id: string; name: string }): string {
  return `file:///${encodeURIComponent(file.id)}/${encodeURIComponent(file.name)}`;
}

// Helper: read from clipboard using Capacitor (native) or fallback to browser API
async function readClipboard(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { value } = await Clipboard.read();
      return value || '';
    } catch { return ''; }
  }
  try { return await navigator.clipboard.readText(); } catch { return ''; }
}

// Helper: write to clipboard using Capacitor (native) or fallback to browser API
async function writeClipboard(text: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try { await Clipboard.write({ string: text }); } catch {}
    return;
  }
  try { await navigator.clipboard.writeText(text); } catch {}
}

interface EditorTabItemProps {
  fileId: string;
  isActive: boolean;
  theme: string;
  isClosing: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

const EditorTabItem = React.memo(function EditorTabItem({
  fileId,
  isActive,
  theme,
  isClosing,
  onSelect,
  onClose,
}: EditorTabItemProps) {
  const fileName = useIdeStore((s) => s.files[fileId]?.name || '');
  const isUnsaved = useIdeStore((s) => !!s.files[fileId]?.isUnsaved);
  const isLight = theme === 'light';

  if (!fileName) return null;

  return (
    <div
      className={cn(
        "group flex min-w-[100px] max-w-[190px] cursor-pointer items-center border-r px-2.5 text-[13px] transition-all",
        isLight ? "border-r-black/10" : "border-r-[#f3f0e7]/10",
        isActive 
          ? (isLight 
              ? "bg-[#e8e4d9] text-[#2a2529] font-semibold border-t-2 border-t-[#2a2529]" 
              : "bg-[#2a2529] text-[#f3f0e7] font-semibold border-t-2 border-t-[#f3f0e7]")
          : (isLight 
              ? "text-[#2a2529]/60 hover:bg-[#ded9cb]/60 active:bg-[#ded9cb]" 
              : "text-[#f3f0e7]/60 hover:bg-[#32303a]/60 active:bg-[#32303a]"),
        isClosing && "animate-tab-close"
      )}
      onClick={() => onSelect(fileId)}
    >
      <LanguageIcon fileName={fileName} size={14} className="mr-1.5 shrink-0" />
      <span className="truncate flex-1">{fileName}</span>
      <span
        className={cn(
          "ml-1.5 h-2 w-2 rounded-full flex-shrink-0 transition-all duration-300",
          isUnsaved
            ? "bg-amber-400 ring-2 ring-amber-400/30 shadow-sm shadow-amber-400/50 animate-pulse"
            : "bg-emerald-400 ring-2 ring-emerald-400/30 shadow-sm shadow-emerald-400/50"
        )}
        title={isUnsaved ? "Unsaved changes" : "All changes saved"}
      />
      <button
        className={cn(
          "ml-1.5 rounded p-0.5 opacity-0 hover:bg-[#f3f0e7]/20 group-hover:opacity-100 flex-shrink-0 transition-opacity",
          isActive && "opacity-60"
        )}
        onClick={(e) => {
          e.stopPropagation();
          onClose(fileId);
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
});

export function CodeEditor() {
  const activeFileId = useIdeStore((s) => s.activeFileId);
  const activeFile = useIdeStore((s) => (s.activeFileId ? s.files[s.activeFileId] : null));
  const openFiles = useIdeStore((s) => s.openFiles);
  const closeFile = useIdeStore((s) => s.closeFile);
  const setActiveFile = useIdeStore((s) => s.setActiveFile);
  const updateFileContent = useIdeStore((s) => s.updateFileContent);
  const saveFile = useIdeStore((s) => s.saveFile);
  const theme = useIdeStore((s) => s.theme);
  const activeFont = useIdeStore((s) => s.activeFont);
  const setCursorPosition = useIdeStore((s) => s.setCursorPosition);
  const isSidebarOpen = useIdeStore((s) => s.isSidebarOpen);
  const fileFontSizes = useIdeStore((s) => s.fileFontSizes);
  const setFileFontSize = useIdeStore((s) => s.setFileFontSize);
  const activeMonacoThemeId = useExtensionsStore((state) => state.activeMonacoThemeId);
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const [mdViewMode, setMdViewMode] = useState<'edit' | 'preview' | 'split'>('split');
  const monaco = useMonaco();
  const isLandscape = useIsLandscape();
  const isSideLayout = isLandscape || (typeof window !== 'undefined' && window.innerWidth >= 600);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [closingTab, setClosingTab] = useState<string | null>(null);

  const editorRef = useRef<any>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const [floatingMenu, setFloatingMenu] = useState<{ isOpen: boolean; position: { x: number; y: number } }>({
    isOpen: false,
    position: { x: 0, y: 0 },
  });

  const currentFontSize = activeFileId ? (fileFontSizes[activeFileId] || 14) : 14;

  usePinchZoom({
    containerRef: editorContainerRef,
    fontSize: currentFontSize,
    onFontSizeChange: (newSize) => {
      if (activeFileId) setFileFontSize(activeFileId, newSize);
    },
  });

  const { completions, insertCompletion } = useEditorCompletions(
    editorRef,
    monaco,
    activeFile?.language || 'plaintext'
  );

  const isMarkdown = activeFile?.name?.endsWith('.md') || activeFile?.language === 'markdown';

  // Listen for Go to Line command from Command Palette
  useEffect(() => {
    const handleGotoLine = (e: Event) => {
      const line = (e as CustomEvent).detail?.line;
      if (editorRef.current && line) {
        editorRef.current.revealLineInCenter(line);
        editorRef.current.setPosition({ lineNumber: line, column: 1 });
        editorRef.current.focus();
      }
    };
    window.addEventListener('krypton-goto-line', handleGotoLine);
    return () => window.removeEventListener('krypton-goto-line', handleGotoLine);
  }, []);

  const [isFindOpen, setIsFindOpen] = useState(false);
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const findInputRef = useRef<HTMLInputElement>(null);

  // Listen for Find & Replace command from Command Palette / Toolbar
  useEffect(() => {
    const handleFindReplace = () => {
      setIsFindOpen(prev => !prev);
      setTimeout(() => findInputRef.current?.focus(), 120);
    };
    window.addEventListener('krypton-find-replace', handleFindReplace);
    return () => window.removeEventListener('krypton-find-replace', handleFindReplace);
  }, []);

  const handleFindNext = () => {
    if (editorRef.current && findText) {
      editorRef.current.getAction('editor.action.nextMatch')?.run();
    }
  };

  const handleFindPrev = () => {
    if (editorRef.current && findText) {
      editorRef.current.getAction('editor.action.previousMatch')?.run();
    }
  };

  const handleReplaceOne = () => {
    if (editorRef.current && findText) {
      editorRef.current.getAction('editor.action.replaceOne')?.run();
    }
  };

  const handleReplaceAll = () => {
    if (editorRef.current && findText) {
      editorRef.current.getAction('editor.action.replaceAll')?.run();
    }
  };

  useEffect(() => {
    if (editorRef.current && isFindOpen) {
      try {
        const controller = (editorRef.current as any).getContribution?.('editor.contrib.findController');
        if (controller) {
          controller.getState().change({ searchString: findText, isRevealed: true }, true);
        }
      } catch {}
    }
  }, [findText, isFindOpen]);

  // Custom font is now managed by IdeStore and injected globally in App.tsx

  // Custom font is now managed by IdeStore and injected globally in App.tsx

  // Define & register all themes in Monaco & apply active theme
  useEffect(() => {
    if (!monaco) return;
    try {
      registerAllMonacoThemes(monaco);
      const currentTheme = resolveActiveMonacoTheme(theme, activeMonacoThemeId);
      monaco.editor.setTheme(currentTheme);
    } catch {
      // Ignore theme re-definition error
    }
  }, [monaco, theme, activeMonacoThemeId]);

  // Cross-file IntelliSense & Sync (decoupled from active typing)
  useEffect(() => {
    if (!monaco) return;
    let cancel = false;
    let idleHandle: any = null;

    const scheduleSync = () => {
      const filesMap = useIdeStore.getState().files;
      const fileList = Object.values(filesMap).filter((f) => f.type === 'file' && f.content !== undefined);
      let index = 0;

      const syncNextBatch = () => {
        if (cancel) return;
        const startTime = performance.now();
        const currentActiveId = useIdeStore.getState().activeFileId;
        while (index < fileList.length && performance.now() - startTime < 8) {
          const f = fileList[index++];
          if (f.id === currentActiveId) continue;
          try {
            const uri = monaco.Uri.parse(fileModelUri(f));
            const model = monaco.editor.getModel(uri);
            if (!model) {
              monaco.editor.createModel(f.content!, f.language, uri);
            } else if (model.getValue() !== f.content) {
              model.setValue(f.content!);
            }
          } catch {
            // Ignore invalid URI or model conflicts
          }
        }
        if (index < fileList.length && !cancel) {
          requestAnimationFrame(syncNextBatch);
        }
      };

      syncNextBatch();
    };

    const timer = setTimeout(() => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        idleHandle = (window as any).requestIdleCallback(scheduleSync, { timeout: 2000 });
      } else {
        scheduleSync();
      }
    }, 500);

    return () => {
      cancel = true;
      clearTimeout(timer);
      if (idleHandle && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(idleHandle);
      }
    };
  }, [monaco, activeFileId, openFiles.length]);

  // Sync Monaco diagnostics → Problems panel
  useEffect(() => {
    if (!monaco) return;
    const interval = setInterval(() => {
      const problems = extractMonacoProblems(monaco);
      useProblemsStore.getState().setProblems(problems);
    }, 2000);
    return () => clearInterval(interval);
  }, [monaco]);

  // Register language snippets as completion providers
  useEffect(() => {
    if (!monaco) return;
    const disposables: any[] = [];
    const languages = getSnippetLanguages();

    for (const lang of languages) {
      const snippets = getSnippetsForLanguage(lang);
      if (snippets.length === 0) continue;

      const monacoLangs: string[] = [];
      if (lang === 'typescript') monacoLangs.push('typescript', 'javascript', 'typescriptreact', 'javascriptreact');
      else if (lang === 'groovy') monacoLangs.push('groovy', 'plaintext');
      else if (lang === 'cpp') monacoLangs.push('cpp', 'c');
      else monacoLangs.push(lang);

      for (const monacoLang of monacoLangs) {
        try {
          const disposable = monaco.languages.registerCompletionItemProvider(monacoLang, {
            provideCompletionItems: (model: any, position: any) => {
              const word = model.getWordUntilPosition(position);
              const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
              };

              const suggestions = snippets.map((s) => ({
                label: s.prefix,
                kind: monaco.languages.CompletionItemKind.Snippet,
                documentation: s.description,
                insertText: s.body.replace(/\$0/g, '').replace(/\$\d/g, ''),
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range,
                detail: s.description,
              }));

              return { suggestions };
            },
          });
          disposables.push(disposable);
        } catch {
          // Language may not be registered in Monaco — skip
        }
      }
    }

    return () => disposables.forEach(d => d.dispose());
  }, [monaco]);

  // ── Native Extension Host Phase 4: Monaco LSP Provider Registration ──
  useEffect(() => {
    if (!monaco) return;
    const lspRegistration = registerMonacoLspProviders(monaco);
    return () => lspRegistration.dispose();
  }, [monaco]);

  // ── Native Extension Host Phase 4: Active File LSP Synchronization ──
  useEffect(() => {
    if (!activeFile || !activeFile.name) return;
    const uri = fileModelUri(activeFile);
    const lang = activeFile.language || 'plaintext';
    const content = activeFile.content || '';

    let isMounted = true;
    useLspStore.getState().startServer(lang).then((client) => {
      if (isMounted && client) {
        useLspStore.getState().syncDocumentOpen(uri, lang, content);
      }
    });

    return () => {
      isMounted = false;
      useLspStore.getState().syncDocumentClose(uri, lang);
    };
  }, [activeFile?.id, activeFile?.name, activeFile?.language]);

  // ── Phase 5.4: Oorty Lite Inline Ghost Text Autocomplete ──
  useEffect(() => {
    if (!monaco) return;
    let abortController: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    try {
      const disposable = monaco.languages.registerInlineCompletionsProvider('*', {
        provideInlineCompletions: async (model: any, position: any, _context: any, token: any) => {
          if (abortController) abortController.abort();
          abortController = new AbortController();

          const lineContent = model.getLineContent(position.lineNumber);
          const linePrefix = lineContent.substring(0, position.column - 1);
          const lineSuffix = lineContent.substring(position.column - 1);

          // Avoid triggering on purely empty lines or spaces
          if (!linePrefix.trim()) {
            return { items: [] };
          }

          const fullModelText = model.getValue();
          const offset = model.getOffsetAt(position);
          const prefix = fullModelText.substring(0, offset);
          const suffix = fullModelText.substring(offset);
          const language = model.getLanguageId() || 'javascript';

          // 1. Instant local heuristic predictor (< 5ms) for variable combinations and standard idioms
          const localPrediction = predictLocalCompletion({
            prefix,
            suffix,
            linePrefix,
            language,
          });

          if (localPrediction) {
            return {
              items: [
                {
                  insertText: localPrediction,
                  range: new monaco.Range(
                    position.lineNumber,
                    position.column,
                    position.lineNumber,
                    position.column
                  ),
                },
              ],
            };
          }

          // 2. Fallback to debounced cloud AI inline completion (Groq / Gemini / OpenRouter / Nvidia)
          const aiState = useAiStore.getState();
          const hasKey = aiState.apiKey || (aiState.savedModels && aiState.savedModels.length > 0);
          if (!hasKey) return { items: [] };

          return new Promise((resolve) => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(async () => {
              if (token.isCancellationRequested) {
                resolve({ items: [] });
                return;
              }

              try {
                const aiResult = await fetchAiInlineCompletion({
                  prefix,
                  suffix,
                  linePrefix,
                  language,
                  signal: abortController?.signal,
                });

                if (aiResult && !token.isCancellationRequested) {
                  resolve({
                    items: [
                      {
                        insertText: aiResult,
                        range: new monaco.Range(
                          position.lineNumber,
                          position.column,
                          position.lineNumber,
                          position.column
                        ),
                      },
                    ],
                  });
                  return;
                }
              } catch {
                // Silently ignore network / cancellation errors
              }

              resolve({ items: [] });
            }, 300);
          });
        },
        disposeInlineCompletions: (_completions: any, _reason: any) => {},
      });

      return () => {
        if (timer) clearTimeout(timer);
        abortController?.abort();
        disposable.dispose();
      };
    } catch {
      // Ignore if provider registration fails
    }
  }, [monaco]);

  // ── Mobile Keyboard Viewport Adaptation & Cursor Centering ──
  useEffect(() => {
    const adjustEditor = () => {
      if (editorRef.current) {
        editorRef.current.layout();
        const pos = editorRef.current.getPosition();
        if (pos) {
          if (typeof editorRef.current.revealPositionInCenterIfOutsideViewport === 'function') {
            editorRef.current.revealPositionInCenterIfOutsideViewport(pos);
          } else if (typeof editorRef.current.revealPositionInCenter === 'function') {
            editorRef.current.revealPositionInCenter(pos, 0);
          }
        }
      }
    };

    const handleKeyboardShow = (height: number) => {
      setKeyboardHeight(height);
      adjustEditor();
      setTimeout(adjustEditor, 100);
      setTimeout(adjustEditor, 250);
    };

    const handleKeyboardHide = () => {
      setKeyboardHeight(0);
      const resetEditor = () => {
        if (editorRef.current) {
          editorRef.current.layout();
        }
      };
      resetEditor();
      setTimeout(resetEditor, 150);
    };

    let showListener: any = null;
    let didShowListener: any = null;
    let hideListener: any = null;
    let didHideListener: any = null;

    if (Capacitor.isNativePlatform()) {
      Keyboard.addListener('keyboardWillShow', (info) => {
        if (info && typeof info.keyboardHeight === 'number') {
          handleKeyboardShow(info.keyboardHeight);
          document.documentElement.classList.add('keyboard-open');
        }
      }).then((handle) => { showListener = handle; }).catch(() => {});

      Keyboard.addListener('keyboardDidShow', (info) => {
        if (info && typeof info.keyboardHeight === 'number') {
          handleKeyboardShow(info.keyboardHeight);
          document.documentElement.classList.add('keyboard-open');
        }
      }).then((handle) => { didShowListener = handle; }).catch(() => {});

      Keyboard.addListener('keyboardWillHide', () => {
        handleKeyboardHide();
        document.documentElement.classList.remove('keyboard-open');
      }).then((handle) => { hideListener = handle; }).catch(() => {});

      Keyboard.addListener('keyboardDidHide', () => {
        handleKeyboardHide();
        document.documentElement.classList.remove('keyboard-open');
      }).then((handle) => { didHideListener = handle; }).catch(() => {});
    } else {
      // Browser mode fallback: window.visualViewport resize listener
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      if (vv) {
        const handleResize = () => {
          const fullHeight = window.innerHeight;
          const viewportHeight = vv.height;
          const kbHeight = fullHeight - viewportHeight;
          if (kbHeight > 50) {
            handleKeyboardShow(kbHeight);
          } else {
            handleKeyboardHide();
          }
        };

        vv.addEventListener('resize', handleResize);
        vv.addEventListener('scroll', handleResize);
        return () => {
          vv.removeEventListener('resize', handleResize);
          vv.removeEventListener('scroll', handleResize);
        };
      }
    }

    return () => {
      showListener?.remove?.();
      didShowListener?.remove?.();
      hideListener?.remove?.();
      didHideListener?.remove?.();
    };
  }, []);

  // Ensure Monaco re-layouts and centers cursor smoothly whenever keyboardHeight state changes
  useEffect(() => {
    if (!editorRef.current) return;
    const adjust = () => {
      if (editorRef.current) {
        editorRef.current.layout();
        if (keyboardHeight > 0) {
          const pos = editorRef.current.getPosition();
          if (pos) {
            if (typeof editorRef.current.revealPositionInCenterIfOutsideViewport === 'function') {
              editorRef.current.revealPositionInCenterIfOutsideViewport(pos);
            } else if (typeof editorRef.current.revealPositionInCenter === 'function') {
              editorRef.current.revealPositionInCenter(pos, 0);
            }
          }
        }
      }
    };
    const rId = requestAnimationFrame(adjust);
    const t = setTimeout(adjust, 200);
    return () => {
      cancelAnimationFrame(rId);
      clearTimeout(t);
    };
  }, [keyboardHeight]);

  const editorChangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestValue = useRef<string | undefined>(undefined);
  const pendingFileId = useRef<string | null>(null);

  // Flush any pending debounced write so switching/closing a file never drops
  // the last keystrokes.
  const flushPendingEdit = useCallback(() => {
    if (editorChangeTimer.current) {
      clearTimeout(editorChangeTimer.current);
      editorChangeTimer.current = null;
    }
    if (pendingFileId.current && latestValue.current !== undefined) {
      updateFileContent(pendingFileId.current, latestValue.current);
    }
    pendingFileId.current = null;
    latestValue.current = undefined;
  }, [updateFileContent]);

  useEffect(() => {
    return flushPendingEdit;
  }, [activeFileId, flushPendingEdit]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!activeFileId || value === undefined) return;
    latestValue.current = value;
    pendingFileId.current = activeFileId;

    if (editorChangeTimer.current) {
      clearTimeout(editorChangeTimer.current);
    }
    editorChangeTimer.current = setTimeout(() => {
      if (pendingFileId.current && latestValue.current !== undefined) {
        updateFileContent(pendingFileId.current, latestValue.current);
        if (activeFile) {
          const uri = fileModelUri(activeFile);
          const lang = activeFile.language || 'plaintext';
          useLspStore.getState().syncDocumentChange(uri, lang, latestValue.current);
        }
      }
      pendingFileId.current = null;
      latestValue.current = undefined;
      editorChangeTimer.current = null;
    }, 300);
  }, [activeFileId, updateFileContent]);

  const handleEditorMount = useCallback((editor: any, monacoApi: any) => {
    setEditorInstance(editor);
    editorRef.current = editor;

    try {
      registerAllMonacoThemes(monacoApi);
      const activeStoreTheme = useIdeStore.getState().theme;
      const activeExtTheme = useExtensionsStore.getState().activeMonacoThemeId;
      const targetTheme = resolveActiveMonacoTheme(activeStoreTheme, activeExtTheme);
      monacoApi.editor.setTheme(targetTheme);
    } catch {}

    editor.onDidChangeCursorPosition((e: any) => {
      setCursorPosition({
        line: e.position.lineNumber,
        col: e.position.column,
      });
    });

    editor.onDidChangeCursorSelection((e: any) => {
      const selection = e.selection;
      if (selection && !selection.isEmpty()) {
        const domPos = editor.getScrolledVisiblePosition(selection.getEndPosition());
        const containerNode = editor.getDomNode?.() || editorContainerRef.current;
        if (domPos && containerNode) {
          const rect = containerNode.getBoundingClientRect();
          setFloatingMenu({
            isOpen: true,
            position: { x: rect.left + domPos.left, y: rect.top + domPos.top - 10 },
          });
          hapticLight();
        }
      } else {
        setFloatingMenu((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
      }
    });

    // Monaco onContextMenu listener
    editor.onContextMenu((e: any) => {
      if (e.event) {
        e.event.preventDefault?.();
        e.event.stopPropagation?.();
      }
      const x = e.event?.posx ?? (e.target?.position ? (editor.getScrolledVisiblePosition(e.target.position)?.left ?? 150) : 150);
      const y = e.event?.posy ?? (e.target?.position ? (editor.getScrolledVisiblePosition(e.target.position)?.top ?? 150) : 150);
      setFloatingMenu({
        isOpen: true,
        position: { x, y },
      });
      hapticSelection();
    });

    // Close floating menu on editor scroll
    editor.onDidScrollChange(() => {
      setFloatingMenu((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
    });

    // Touch hold detection (400ms long-press) on editor DOM node
    const containerDOMNode = editor.getDomNode?.() || editorContainerRef.current;
    if (containerDOMNode) {
      let touchHoldTimer: any = null;
      let touchStartCoord = { x: 0, y: 0 };

      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length !== 1) {
          if (touchHoldTimer) clearTimeout(touchHoldTimer);
          return;
        }
        const touch = e.touches[0];
        touchStartCoord = { x: touch.clientX, y: touch.clientY };

        if (touchHoldTimer) clearTimeout(touchHoldTimer);
        touchHoldTimer = setTimeout(() => {
          try {
            const target = editor.getTargetAtClientPoint(touchStartCoord.x, touchStartCoord.y);
            if (target && target.position) {
              const model = editor.getModel();
              if (model) {
                const word = model.getWordAtPosition(target.position);
                if (word) {
                  editor.setSelection(new monacoApi.Selection(
                    target.position.lineNumber,
                    word.startColumn,
                    target.position.lineNumber,
                    word.endColumn
                  ));
                } else {
                  editor.setPosition(target.position);
                }
                editor.focus();
              }
            }
          } catch (e) {
            console.warn('Hold-to-select word error:', e);
          }
          setFloatingMenu({
            isOpen: true,
            position: { x: touchStartCoord.x, y: touchStartCoord.y - 10 },
          });
          hapticMedium();
        }, 400);
      };

      const onTouchMove = (e: TouchEvent) => {
        if (!touchHoldTimer) return;
        const touch = e.touches[0];
        if (touch) {
          const dx = Math.abs(touch.clientX - touchStartCoord.x);
          const dy = Math.abs(touch.clientY - touchStartCoord.y);
          if (dx > 10 || dy > 10) {
            clearTimeout(touchHoldTimer);
            touchHoldTimer = null;
          }
        }
      };

      const onTouchEnd = () => {
        if (touchHoldTimer) {
          clearTimeout(touchHoldTimer);
          touchHoldTimer = null;
        }
      };

      containerDOMNode.addEventListener('touchstart', onTouchStart, { passive: true });
      containerDOMNode.addEventListener('touchmove', onTouchMove, { passive: true });
      containerDOMNode.addEventListener('touchend', onTouchEnd, { passive: true });
      containerDOMNode.addEventListener('touchcancel', onTouchEnd, { passive: true });

      containerDOMNode.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault();
        setFloatingMenu({
          isOpen: true,
          position: { x: e.clientX, y: e.clientY },
        });
        hapticSelection();
      });

      // Tap-to-Accept Ghost Text Autocompletion
      const onGhostTextPointer = (e: Event) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const isGhost = target.closest('.ghost-text, .ghost-text-decoration, .suggest-preview-text, [class*="ghost-text"]');
        if (isGhost) {
          e.preventDefault();
          e.stopPropagation();
          try {
            editor.trigger('inlineSuggest', 'editor.action.inlineSuggest.commit', null);
            editor.getAction('editor.action.inlineSuggest.commit')?.run();
            hapticLight();
          } catch (err) {
            console.warn('Inline suggest commit error:', err);
          }
        }
      };

      containerDOMNode.addEventListener('pointerdown', onGhostTextPointer, true);
      containerDOMNode.addEventListener('click', onGhostTextPointer, true);

      editor.onMouseDown((e: any) => {
        const targetEl = e.event?.browserEvent?.target as HTMLElement | null;
        if (targetEl && targetEl.closest('.ghost-text, .ghost-text-decoration, .suggest-preview-text, [class*="ghost-text"]')) {
          e.event.preventDefault?.();
          e.event.stopPropagation?.();
          editor.trigger('inlineSuggest', 'editor.action.inlineSuggest.commit', null);
          editor.getAction('editor.action.inlineSuggest.commit')?.run();
          hapticLight();
        }
      });
    }

    // Defer heavy non-critical configuration to non-blocking microtask
    setTimeout(() => {
      if (Capacitor.isNativePlatform()) {
        const copyAction = editor.getAction('editor.action.clipboardCopyAction');
        if (copyAction) {
          editor.addAction({
            id: 'krypton.clipboardCopy',
            label: 'Copy',
            keybindings: [monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyC],
            run: async (ed: any) => {
              const selection = ed.getSelection();
              const model = ed.getModel();
              if (selection && model) {
                const text = model.getValueInRange(selection);
                if (text) await writeClipboard(text);
              }
            }
          });
        }

        editor.addAction({
          id: 'krypton.clipboardCut',
          label: 'Cut',
          keybindings: [monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyX],
          run: async (ed: any) => {
            const selection = ed.getSelection();
            const model = ed.getModel();
            if (selection && model && !selection.isEmpty()) {
              const text = model.getValueInRange(selection);
              if (text) await writeClipboard(text);
              ed.executeEdits('krypton-cut', [{ range: selection, text: '', forceMoveMarkers: true }]);
            }
          }
        });

        editor.addAction({
          id: 'krypton.clipboardPaste',
          label: 'Paste',
          keybindings: [monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyV],
          run: async (ed: any) => {
            const text = await readClipboard();
            if (text) {
              const selection = ed.getSelection();
              if (selection) {
                ed.executeEdits('krypton-paste', [{ range: selection, text, forceMoveMarkers: true }]);
              }
            }
          }
        });

        const domNode = editor.getDomNode?.() || editorContainerRef.current;
        if (domNode) {
          domNode.addEventListener('paste', async (e: ClipboardEvent) => {
            if (Capacitor.isNativePlatform()) {
              e.preventDefault();
              e.stopPropagation();
              try {
                const text = await readClipboard();
                if (text) {
                  const selection = editor.getSelection();
                  const range = selection && !selection.isEmpty()
                    ? selection
                    : (() => { const pos = editor.getPosition(); return new monacoApi.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column); })();
                  editor.executeEdits('krypton-paste', [{
                    range,
                    text: text,
                    forceMoveMarkers: true
                  }]);
                }
              } catch (err) {
                console.error("Native paste intercept failed", err);
              }
            }
          }, { capture: true });
        }
      }

      // TypeScript IntelliSense settings
      monacoApi.languages.typescript.typescriptDefaults.setCompilerOptions({
        target: monacoApi.languages.typescript.ScriptTarget.ES2020,
        allowNonTsExtensions: true,
        moduleResolution: monacoApi.languages.typescript.ModuleResolutionKind.NodeJs,
        module: monacoApi.languages.typescript.ModuleKind.CommonJS,
        noEmit: true,
        esModuleInterop: true,
        jsx: monacoApi.languages.typescript.JsxEmit.React,
        reactNamespace: 'React',
        allowJs: true,
      });
      
      monacoApi.languages.typescript.javascriptDefaults.setCompilerOptions({
        target: monacoApi.languages.typescript.ScriptTarget.ES2020,
        allowNonTsExtensions: true,
        moduleResolution: monacoApi.languages.typescript.ModuleResolutionKind.NodeJs,
        allowJs: true,
        alwaysStrict: true,
        jsx: monacoApi.languages.typescript.JsxEmit.React,
        reactNamespace: 'React',
      });

      monacoApi.languages.css.cssDefaults.setOptions({
        lint: {
          unknownAtRules: 'ignore'
        }
      });

      editor.addCommand(monacoApi.KeyMod.Shift | monacoApi.KeyMod.Alt | monacoApi.KeyCode.KeyF, async () => {
        try {
          const state = useIdeStore.getState();
          const currentFile = state.files[state.activeFileId!];
          if (currentFile && currentFile.content) {
            const { formatCode } = await import('../../lib/formatter');
            const formatted = await formatCode(currentFile.content, currentFile.language || 'plaintext');
            const model = editor.getModel();
            if (model && formatted && formatted !== currentFile.content) {
               editor.executeEdits('prettier', [{
                range: model.getFullModelRange(),
                text: formatted,
                forceMoveMarkers: true
              }]);
              state.updateFileContent(state.activeFileId!, formatted);
            }
          }
        } catch (err: any) {
          if (err?.type !== 'cancelation') console.error('Format error:', err);
        }
      });
    }, 0);

  }, [setCursorPosition]);

  const insertText = (text: string) => {
    if (editorRef.current) {
      editorRef.current.trigger('keyboard', 'type', { text });
      editorRef.current.focus();
    }
  };

  const handleTabKey = () => {
    if (editorRef.current) {
      const posBefore = editorRef.current.getPosition();
      // Commit active ghost text autocomplete suggestion
      editorRef.current.trigger('toolbar', 'editor.action.inlineSuggest.commit', null);
      const posAfter = editorRef.current.getPosition();
      // If position did not advance, no ghost text was active, so insert two spaces
      if (
        posBefore &&
        posAfter &&
        posBefore.column === posAfter.column &&
        posBefore.lineNumber === posAfter.lineNumber
      ) {
        editorRef.current.trigger('keyboard', 'type', { text: '  ' });
      }
      editorRef.current.focus();
    }
  };

  const keys = ['Tab', '{', '}', '[', ']', '(', ')', '<', '>', '=', ';', '"', "'", '/', ':', '!', '&', '|', '#', '=>', '->'];

  const handleSendToOortyLite = () => {
    if (editorRef.current) {
      const selection = editorRef.current.getSelection();
      const model = editorRef.current.getModel();
      let contextText = '';
      if (selection && model && !selection.isEmpty()) {
        contextText = model.getValueInRange(selection);
      }
      
      const state = useIdeStore.getState();
      state.setSidebarView('ai');
      if (!state.isSidebarOpen) state.toggleSidebar();
      
      if (contextText) {
        const aiStore = useAiStore.getState();
        let sid = aiStore.activeSessionId;
        if (!sid) {
          sid = aiStore.createNewSession();
        }
        aiStore.sendMessage(sid, `Analyze and help with this code:\n\`\`\`\n${contextText}\n\`\`\``, 'User selected code snippet from editor.');
      }
    }
  };

  const currentEditorTheme = resolveActiveMonacoTheme(theme, activeMonacoThemeId);

  return (
    <div className="flex h-full flex-col bg-[#2a2529] text-[#f3f0e7]">
      {/* Editor Tabs */}
      {openFiles.length > 0 && (
        <div className={`flex h-9 overflow-x-auto scrollbar-hide flex-shrink-0 border-b ${
          theme === 'light' ? 'border-black/10 bg-[#f4f0e6]' : 'border-[#f3f0e7]/10 bg-[#231e22]'
        }`}>
          {openFiles.map(fileId => (
            <EditorTabItem
              key={fileId}
              fileId={fileId}
              isActive={activeFileId === fileId}
              theme={theme}
              isClosing={closingTab === fileId}
              onSelect={setActiveFile}
              onClose={(id) => {
                setClosingTab(id);
                setTimeout(() => { closeFile(id); setClosingTab(null); }, 200);
              }}
            />
          ))}

          <div className="ml-auto flex items-center pr-2 space-x-1 flex-shrink-0">
            {/* Save button for active file right next to Prettier */}
            {activeFile && (
              <button
                onClick={() => {
                  hapticLight();
                  saveFile(activeFile.id);
                }}
                className={cn(
                  "p-1.5 rounded transition-all cursor-pointer",
                  activeFile.isUnsaved
                    ? "text-amber-400 hover:text-amber-300 hover:bg-amber-400/15"
                    : "text-[#f3f0e7]/60 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10"
                )}
                title={activeFile.isUnsaved ? "Save file (Ctrl+S) - Unsaved changes" : "File saved"}
                aria-label="Save file"
              >
                <Save size={14} />
              </button>
            )}

            {/* Format button (Prettier) for active file */}
            {activeFile && (
              <button
                onClick={async () => {
                  if (activeFile.content) {
                    const { formatCode } = await import('../../lib/formatter');
                    const formatted = await formatCode(activeFile.content, activeFile.language || 'plaintext');
                    if (formatted && formatted !== activeFile.content) {
                      editorInstance?.executeEdits('prettier', [{
                        range: editorInstance.getModel().getFullModelRange(),
                        text: formatted,
                        forceMoveMarkers: true
                      }]);
                      updateFileContent(activeFile.id, formatted);
                    }
                  }
                }}
                className="p-1.5 rounded text-[#f3f0e7]/60 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10"
                title="Format Code (Shift+Alt+F)"
              >
                <Paintbrush size={14} />
              </button>
            )}

            {/* Markdown view mode toggle */}
            {isMarkdown && (
               <>
                <button 
                  onClick={() => setMdViewMode('edit')} 
                  className={cn("p-1.5 rounded text-xs", mdViewMode === 'edit' ? 'bg-[#f3f0e7] text-[#2a2529] font-bold' : 'text-[#f3f0e7]/60 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10')}
                  title="Edit"
                >
                  <Code2 size={14} />
                </button>
                <button 
                  onClick={() => setMdViewMode('split')} 
                  className={cn("p-1.5 rounded text-xs", mdViewMode === 'split' ? 'bg-[#f3f0e7] text-[#2a2529] font-bold' : 'text-[#f3f0e7]/60 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10')}
                  title="Split"
                >
                  <span className="text-[10px] font-bold">⫼</span>
                </button>
                <button 
                  onClick={() => setMdViewMode('preview')} 
                  className={cn("p-1.5 rounded text-xs", mdViewMode === 'preview' ? 'bg-[#f3f0e7] text-[#2a2529] font-bold' : 'text-[#f3f0e7]/60 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10')}
                  title="Preview"
                >
                  <Eye size={14} />
                </button>
               </>
            )}
          </div>
        </div>
      )}

      {/* Workspace Trust Restricted Mode Banner */}
      <WorkspaceTrustBanner />

      {/* Editor / Preview Area */}
      <div 
        ref={editorContainerRef} 
        className="flex-1 relative min-h-0 transition-[padding-bottom] duration-150 ease-out"
        style={{
          paddingBottom: isSideLayout
            ? '0px'
            : (keyboardHeight > 0 ? '48px' : (isSidebarOpen ? '0px' : '104px')),
        }}
      >
        <FloatingContextMenu
          isOpen={floatingMenu.isOpen}
          position={floatingMenu.position}
          onClose={() => setFloatingMenu(prev => ({ ...prev, isOpen: false }))}
          editor={editorRef.current}
          monaco={monaco}
          onAskOortyLite={(selectedText) => {
            const state = useIdeStore.getState();
            state.setSidebarView('ai');
            if (!state.isSidebarOpen) state.toggleSidebar();
            if (selectedText) {
              const aiStore = useAiStore.getState();
              let sid = aiStore.activeSessionId || aiStore.createNewSession();
              aiStore.sendMessage(sid, `Analyze and help with this code:\n\`\`\`\n${selectedText}\n\`\`\``, 'User selected code snippet from editor.');
            }
          }}
        />
        {activeFile ? (
          <>
            {isMarkdown ? (
              /* Markdown: edit/split/preview modes */
              <div className="flex h-full">
                {(mdViewMode === 'edit' || mdViewMode === 'split') && (
                  <div className={cn("min-h-0", mdViewMode === 'split' ? 'w-1/2 border-r border-[#f3f0e7]/10' : 'w-full')}>
                    <Editor
                      key={activeFileId}
                      height="100%"
                      language="markdown"
                      theme={currentEditorTheme}
                      value={activeFile.content || ''}
                      onChange={handleEditorChange}
                      onMount={handleEditorMount}
                      path={fileModelUri(activeFile)}
                      options={{
                        minimap: { enabled: false },
                        fontSize: currentFontSize,
                        fontFamily: activeFont ? `'${activeFont}', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace` : "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                        wordWrap: 'on',
                        automaticLayout: true,
                        padding: { top: 12, bottom: isSideLayout ? 12 : (keyboardHeight > 0 ? 48 : 60) },
                        scrollBeyondLastLine: false,
                        smoothScrolling: false,
                        stopRenderingLineAfter: 5000,
                        lineNumbers: 'on',
                        renderLineHighlight: 'line',
                        contextmenu: false,
                        inlineSuggest: {
                          enabled: true,
                          mode: 'prefix',
                          showToolbar: 'onHover',
                        },
                        suggest: {
                          preview: true,
                          showKeywords: true,
                          showSnippets: true,
                        },
                        quickSuggestions: {
                          other: true,
                          comments: false,
                          strings: false,
                        },
                        suggestOnTriggerCharacters: true,
                        acceptSuggestionOnEnter: 'on',
                        tabCompletion: 'on',
                        occurrencesHighlight: 'off',
                        selectionHighlight: true,
                        hover: { enabled: false },
                        parameterHints: { enabled: false },
                        lightbulb: { enabled: 'off' as any },
                      }}
                    />
                  </div>
                )}
                {(mdViewMode === 'preview' || mdViewMode === 'split') && (
                  <div className={mdViewMode === 'split' ? 'w-1/2' : 'w-full'}>
                    <MarkdownPreview content={activeFile.content || ''} />
                  </div>
                )}
              </div>
            ) : (
              /* Normal code editor */
              <>
                <Editor
                  key={activeFileId}
                  height="100%"
                  language={activeFile.language || 'plaintext'}
                  theme={currentEditorTheme}
                  value={activeFile.content || ''}
                  onChange={handleEditorChange}
                  onMount={handleEditorMount}
                  path={fileModelUri(activeFile)}
                  options={{
                    minimap: { enabled: false },
                    lineNumbers: 'on',
                    lineNumbersMinChars: 3,
                    lineDecorationsWidth: 10,
                    glyphMargin: true,
                    folding: true,
                    foldingStrategy: 'auto',
                    showFoldingControls: 'always',
                    fontSize: currentFontSize,
                    fontFamily: activeFont ? `'${activeFont}', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace` : "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                    fontLigatures: true,
                    wordWrap: 'on',
                    automaticLayout: true,
                    padding: { top: 12, bottom: isSideLayout ? 12 : (keyboardHeight > 0 ? 48 : 60) },
                    scrollBeyondLastLine: false,
                    smoothScrolling: false,
                    stopRenderingLineAfter: 5000,
                    renderValidationDecorations: 'editable' as any,
                    cursorBlinking: 'solid',
                    cursorSmoothCaretAnimation: 'off',
                    formatOnPaste: true,
                    renderLineHighlight: 'all',
                    bracketPairColorization: { enabled: true },
                    guides: { bracketPairs: true },
                    scrollbar: { verticalScrollbarSize: 4, horizontalScrollbarSize: 4, useShadows: false },
                    overviewRulerBorder: false,
                    hideCursorInOverviewRuler: true,
                    inlineSuggest: {
                      enabled: true,
                      mode: 'prefix',
                      showToolbar: 'onHover',
                    },
                    suggest: {
                      preview: true,
                      showKeywords: true,
                      showSnippets: true,
                    },
                    quickSuggestions: {
                      other: true,
                      comments: false,
                      strings: false,
                    },
                    suggestOnTriggerCharacters: true,
                    acceptSuggestionOnEnter: 'on',
                    tabCompletion: 'on',
                    contextmenu: false,
                    occurrencesHighlight: 'off',
                    selectionHighlight: true,
                    hover: { enabled: true, delay: 300 },
                    parameterHints: { enabled: true },
                    lightbulb: { enabled: 'on' as any },
                  }}
                  loading={
                    <div className="flex h-full items-center justify-center">
                      <KryptonLoader size="sm" text="Initializing Monaco Engine..." />
                    </div>
                  }
                />

                {/* Modern Frosted-Glass Find & Replace Bar */}
                {isFindOpen && (
                  <div className="absolute top-3 right-4 z-40 bg-[#252227]/90 backdrop-blur-2xl border border-[#f3f0e7]/15 rounded-2xl shadow-2xl p-2.5 flex flex-col space-y-2 animate-scale-in text-[#f3f0e7] max-w-sm w-full">
                    <div className="flex items-center space-x-2">
                      <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#f3f0e7]/50" />
                        <input
                          ref={findInputRef}
                          type="text"
                          value={findText}
                          onChange={(e) => setFindText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleFindNext();
                            if (e.key === 'Escape') setIsFindOpen(false);
                          }}
                          placeholder="Find in file..."
                          className="w-full bg-[#342f33] border border-[#f3f0e7]/15 rounded-xl py-1.5 pl-8 pr-3 text-xs text-[#f3f0e7] placeholder-[#f3f0e7]/40 focus:outline-none focus:border-[#f3f0e7]/40"
                        />
                      </div>
                      <button
                        onClick={handleFindPrev}
                        className="p-1.5 bg-[#342f33] hover:bg-[#453d43] rounded-xl border border-[#f3f0e7]/15 transition-all text-[#f3f0e7]"
                        title="Previous Match"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        onClick={handleFindNext}
                        className="p-1.5 bg-[#342f33] hover:bg-[#453d43] rounded-xl border border-[#f3f0e7]/15 transition-all text-[#f3f0e7]"
                        title="Next Match"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <button
                        onClick={() => setIsReplaceOpen(!isReplaceOpen)}
                        className={`p-1.5 rounded-xl border transition-all ${isReplaceOpen ? 'bg-[#f3f0e7] text-[#2a2529] font-bold' : 'bg-[#342f33] hover:bg-[#453d43] text-[#f3f0e7] border-[#f3f0e7]/15'}`}
                        title="Toggle Replace"
                      >
                        <Replace size={14} />
                      </button>
                      <button
                        onClick={() => setIsFindOpen(false)}
                        className="p-1.5 hover:bg-[#f3f0e7]/10 rounded-xl transition-all text-[#f3f0e7]/60 hover:text-[#f3f0e7]"
                        title="Close"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {isReplaceOpen && (
                      <div className="flex items-center space-x-2 pt-1 border-t border-[#f3f0e7]/10">
                        <input
                          type="text"
                          value={replaceText}
                          onChange={(e) => setReplaceText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleReplaceOne();
                          }}
                          placeholder="Replace with..."
                          className="flex-1 bg-[#342f33] border border-[#f3f0e7]/15 rounded-xl py-1.5 px-3 text-xs text-[#f3f0e7] placeholder-[#f3f0e7]/40 focus:outline-none"
                        />
                        <button
                          onClick={handleReplaceOne}
                          className="px-2.5 py-1.5 bg-[#342f33] hover:bg-[#453d43] text-[#f3f0e7] text-xs font-bold rounded-xl border border-[#f3f0e7]/15 transition-all"
                        >
                          Replace
                        </button>
                        <button
                          onClick={handleReplaceAll}
                          className="px-2.5 py-1.5 bg-[#f3f0e7] text-[#2a2529] text-xs font-bold rounded-xl transition-all hover:bg-white"
                        >
                          All
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!isSidebarOpen && !isSideLayout && (
                <div 
                  ref={toolbarRef}
                  className="md:hidden fixed left-0 right-0 border-t flex items-center overflow-x-auto scrollbar-hide py-2 px-2.5 space-x-1.5 z-30 shadow-[0_-6px_20px_rgba(0,0,0,0.35)] transition-[bottom] duration-150 ease-out bg-[#252227]/95 backdrop-blur-xl border-[#f3f0e7]/15"
                  style={{ bottom: keyboardHeight > 0 ? '0px' : 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
                >
                  <div className="flex items-center justify-center px-1 text-[#f3f0e7]/50 flex-shrink-0"><KeyboardIcon size={15}/></div>
                  {/* Undo / Redo buttons */}
                  <button 
                    onClick={(e) => { 
                      e.preventDefault(); 
                      editorRef.current?.trigger('keyboard', 'undo', null);
                      editorRef.current?.focus();
                      hapticLight();
                    }} 
                    className="flex-shrink-0 bg-[#342f33] hover:bg-[#453d43] active:bg-[#f3f0e7] active:text-[#2a2529] text-[#f3f0e7] min-w-[40px] h-[38px] flex items-center justify-center rounded-xl text-sm transition-all border border-[#f3f0e7]/15 select-none touch-manipulation shadow-md"
                    title="Undo"
                  >
                    <Undo2 size={15} />
                  </button>
                  <button 
                    onClick={(e) => { 
                      e.preventDefault(); 
                      editorRef.current?.trigger('keyboard', 'redo', null);
                      editorRef.current?.focus();
                      hapticLight();
                    }} 
                    className="flex-shrink-0 bg-[#342f33] hover:bg-[#453d43] active:bg-[#f3f0e7] active:text-[#2a2529] text-[#f3f0e7] min-w-[40px] h-[38px] flex items-center justify-center rounded-xl text-sm transition-all border border-[#f3f0e7]/15 select-none touch-manipulation shadow-md"
                    title="Redo"
                  >
                    <Redo2 size={15} />
                  </button>
                  {/* Find in file button */}
                  <button 
                    onClick={(e) => { 
                      e.preventDefault(); 
                      setIsFindOpen(prev => !prev);
                      hapticLight();
                    }} 
                    className="flex-shrink-0 bg-[#342f33] hover:bg-[#453d43] active:bg-[#f3f0e7] active:text-[#2a2529] text-[#f3f0e7] min-w-[40px] h-[38px] flex items-center justify-center rounded-xl text-sm transition-all border border-[#f3f0e7]/15 select-none touch-manipulation shadow-md"
                    title="Find & Replace"
                  >
                    <Search size={15} />
                  </button>
                  {/* Select All button */}
                  <button 
                    onClick={(e) => { 
                      e.preventDefault(); 
                      if (editorRef.current) {
                        const model = editorRef.current.getModel();
                        if (model) {
                          editorRef.current.setSelection(model.getFullModelRange());
                          editorRef.current.focus();
                        }
                      }
                      hapticLight();
                    }} 
                    className="flex-shrink-0 bg-[#342f33] hover:bg-[#453d43] active:bg-[#f3f0e7] active:text-[#2a2529] text-[#f3f0e7] min-w-[40px] h-[38px] flex items-center justify-center rounded-xl text-sm transition-all border border-[#f3f0e7]/15 select-none touch-manipulation shadow-md"
                    title="Select All"
                  >
                    <TextSelect size={15} />
                  </button>
                  {/* Copy button */}
                  <button 
                    onClick={async (e) => { 
                      e.preventDefault(); 
                      if (editorRef.current) {
                        const selection = editorRef.current.getSelection();
                        const model = editorRef.current.getModel();
                        if (selection && model && !selection.isEmpty()) {
                          const text = model.getValueInRange(selection);
                          if (text) await writeClipboard(text);
                        }
                        editorRef.current.focus();
                      }
                      hapticLight();
                    }} 
                    className="flex-shrink-0 bg-[#342f33] hover:bg-[#453d43] active:bg-[#f3f0e7] active:text-[#2a2529] text-[#f3f0e7] min-w-[40px] h-[38px] flex items-center justify-center rounded-xl text-sm transition-all border border-[#f3f0e7]/15 select-none touch-manipulation shadow-md"
                    title="Copy"
                  >
                    <ClipboardCopy size={15} />
                  </button>
                  {/* Paste button */}
                  <button 
                    onClick={async (e) => { 
                      e.preventDefault(); 
                      try {
                        const text = await readClipboard();
                        if (text && editorRef.current && monaco) {
                          const selection = editorRef.current.getSelection();
                          const range = selection && !selection.isEmpty()
                            ? selection
                            : (() => { const pos = editorRef.current.getPosition(); return new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column); })();
                          editorRef.current.executeEdits('krypton-paste', [{
                            range,
                            text: text,
                            forceMoveMarkers: true
                          }]);
                          editorRef.current.focus();
                        }
                      } catch (err) {
                        console.error("Paste failed", err);
                      }
                      hapticLight();
                    }} 
                    className="flex-shrink-0 bg-[#342f33] hover:bg-[#453d43] active:bg-[#f3f0e7] active:text-[#2a2529] text-[#f3f0e7] min-w-[40px] h-[38px] flex items-center justify-center rounded-xl text-sm transition-all border border-[#f3f0e7]/15 select-none touch-manipulation shadow-md"
                    title="Paste"
                  >
                    <ClipboardPaste size={15} />
                  </button>
                  {/* Live Syntax Completion Chips */}
                  {completions.length > 0 && (
                    <>
                      <div className="w-px h-5 bg-teal-500/40 flex-shrink-0 mx-0.5" />
                      {completions.map((comp: string) => (
                        <button
                          key={comp}
                          onClick={(e) => {
                            e.preventDefault();
                            insertCompletion(comp);
                            hapticLight();
                          }}
                          className="flex-shrink-0 bg-[#342f33] hover:bg-teal-500/20 active:bg-teal-500 text-teal-200 hover:text-white px-2.5 h-[38px] flex items-center justify-center rounded-xl text-xs font-mono transition-all border-l-2 border-l-teal-400 border border-[#f3f0e7]/15 select-none touch-manipulation shadow-md font-bold"
                        >
                          {comp}
                        </button>
                      ))}
                    </>
                  )}
                  {/* Divider */}
                  <div className="w-px h-5 bg-[#f3f0e7]/20 flex-shrink-0 mx-0.5" />
                  {keys.map(k => (
                    <button 
                      key={k} 
                      onClick={(e) => { 
                        e.preventDefault(); 
                        if (k === 'Tab') {
                          handleTabKey();
                        } else {
                          insertText(k);
                        }
                        hapticLight();
                      }} 
                      className="flex-shrink-0 bg-[#342f33] hover:bg-[#453d43] active:bg-[#f3f0e7] active:text-[#2a2529] text-[#f3f0e7] min-w-[40px] h-[38px] flex items-center justify-center rounded-xl text-sm font-mono transition-all border border-[#f3f0e7]/15 select-none touch-manipulation shadow-md"
                    >
                      {k}
                    </button>
                  ))}
                </div>
                )}
              </>
            )}
            

          </>
        ) : (
          /* Empty state — project auto-opens first file, this is just fallback */
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-gray-500 px-8">
              <Zap size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Open a file from the Explorer</p>
              <p className="text-xs mt-1 text-gray-600">or create a new file to get started</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
