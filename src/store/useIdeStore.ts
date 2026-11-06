import { create } from 'zustand';
import { loadWorkspaceCustomCss } from '../lib/customCssManager';

export type FileNode = {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  parentId: string | null;
  children?: string[];
  isOpen?: boolean;
  isUnsaved?: boolean;
  language?: string;
};

interface CursorPosition {
  line: number;
  col: number;
}

export type SidebarView = 'explorer' | 'search' | 'git' | 'ai' | 'extensions' | 'settings' | 'extension-view';

export interface ActiveExtensionView {
  extensionId: string;
  viewContainerId: string;
  title: string;
  icon?: string;
  toolId?: string;
}

interface IdeState {
  files: Record<string, FileNode>;
  activeFileId: string | null;
  openFiles: string[];
  sidebarView: SidebarView;
  activeExtensionView: ActiveExtensionView | null;
  isSidebarOpen: boolean;
  theme: 'krypton-warm' | 'vs-dark' | 'light' | 'hc-black';
  activeFont: string;
  cursorPosition: CursorPosition;
  isPreviewOpen: boolean;
  isTerminalOpen: boolean;
  isCommandPaletteOpen: boolean;
  aiMessages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  isAiLoading: boolean;
  isAiFullscreen: boolean;
  isHapticsEnabled: boolean;
  runTarget: 'java' | 'wasm' | 'js';
  fileFontSizes: Record<string, number>;
  
  // Actions
  setFileFontSize: (fileId: string, size: number) => void;
  setAiFullscreen: (fullscreen: boolean) => void;
  setAiMessages: (messages: { role: 'user' | 'assistant' | 'system'; content: string }[]) => void;
  setAiLoading: (loading: boolean) => void;
  createFile: (name: string, parentId: string | null, type: 'file' | 'folder', content?: string) => string;
  updateFileContent: (id: string, content: string) => void;
  deleteFile: (id: string) => void;
  renameFile: (id: string, newName: string) => void;
  openFile: (id: string) => void;
  closeFile: (id: string) => void;
  closeAllFiles: () => void;
  setActiveFile: (id: string | null) => void;
  setSidebarView: (view: SidebarView) => void;
  setActiveExtensionView: (view: ActiveExtensionView | null) => void;
  openExtensionView: (view: ActiveExtensionView) => void;
  toggleSidebar: () => void;
  setTheme: (theme: 'krypton-warm' | 'vs-dark' | 'light' | 'hc-black') => void;
  setActiveFont: (font: string) => void;
  setCursorPosition: (pos: CursorPosition) => void;
  setPreviewOpen: (open: boolean) => void;
  setIsTerminalOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setHaptics: (val: boolean) => void;
  setRunTarget: (target: 'java' | 'wasm' | 'js') => void;
  
  // Save
  saveFile: (id: string) => void;
  saveAllFiles: () => void;
  
  // Project
  loadProject: (files: Record<string, FileNode>) => void;
  
  // File system helpers (for shell engine)
  getFileByPath: (pathSegments: string[]) => FileNode | null;
  getChildrenOf: (id: string) => FileNode[];
  moveFile: (id: string, newParentId: string, newName?: string) => void;
  copyFile: (id: string, newParentId: string, newName?: string) => string;
  getFilePath: (id: string) => string[];
}

// File names are used directly as on-disk paths, so never allow separators or
// traversal segments (e.g. "../../token").
export const sanitizeFileName = (name: string): string => {
  const cleaned = name
    .trim()
    .replace(/[\\/]/g, '_')
    .replace(/\.\.+/g, '.')
    .replace(/^\.+$/, '_');
  return cleaned || 'untitled';
};

export const getLanguageFromFilename = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase();
  // Handle special filenames first
  const lowerName = name.toLowerCase();
  if (lowerName === 'dockerfile') return 'dockerfile';
  if (lowerName === 'makefile') return 'makefile';
  if (lowerName === '.gitignore' || lowerName === '.gitattributes') return 'ini';
  if (lowerName === 'cargo.toml' || lowerName === 'cargo.lock') return 'toml';
  if (lowerName.endsWith('.gradle') || lowerName.endsWith('.gradle.kts')) return 'groovy';

  switch (ext) {
    case 'js': case 'jsx': return 'javascript';
    case 'ts': case 'tsx': return 'typescript';
    case 'html': case 'htm': return 'html';
    case 'css': case 'scss': case 'less': return 'css';
    case 'json': return 'json';
    case 'md': case 'markdown': return 'markdown';
    case 'py': return 'python';
    case 'rs': return 'rust';
    case 'go': return 'go';
    case 'java': case 'aidl': return 'java';
    case 'kt': case 'kts': return 'kotlin';
    case 'cpp': case 'c': case 'h': case 'hpp': case 'cc': case 'cxx': return 'cpp';
    case 'xml': case 'svg': case 'plist': return 'xml';
    case 'yaml': case 'yml': return 'yaml';
    case 'sh': case 'bash': case 'zsh': return 'shell';
    case 'sql': return 'sql';
    case 'php': return 'php';
    case 'rb': return 'ruby';
    case 'swift': return 'swift';
    case 'dart': return 'dart';
    case 'groovy': case 'gradle': return 'groovy';
    case 'toml': return 'toml';
    case 'ini': case 'cfg': case 'conf': case 'pro': return 'ini';
    case 'lua': return 'lua';
    case 'r': return 'r';
    case 'pl': case 'pm': return 'perl';
    case 'dockerfile': return 'dockerfile';
    case 'graphql': case 'gql': return 'graphql';
    case 'proto': return 'protobuf';
    case 'tf': return 'hcl';
    default: return 'plaintext';
  }
};

const generateId = () => Math.random().toString(36).substring(2, 9);

export const useIdeStore = create<IdeState>()(
  (set, get) => ({
    files: {},
    activeFileId: null,
    openFiles: [],
    sidebarView: 'explorer',
    activeExtensionView: null,
    isSidebarOpen: false,
    theme: 'vs-dark',
    activeFont: '',
    cursorPosition: { line: 1, col: 1 },
    isPreviewOpen: false,
    isTerminalOpen: false,
    isCommandPaletteOpen: false,
    aiMessages: [],
    isAiLoading: false,
    isAiFullscreen: false,
    fileFontSizes: {},

    setFileFontSize: (fileId, size) => set((state) => ({
      fileFontSizes: { ...state.fileFontSizes, [fileId]: size }
    })),
    setAiFullscreen: (fullscreen) => set({ isAiFullscreen: fullscreen }),
    setAiMessages: (messages) => set({ aiMessages: messages }),
    setAiLoading: (loading) => set({ isAiLoading: loading }),
    isHapticsEnabled: true,

    createFile: (name, parentId, type, content = '') => {
      const id = generateId();
      const safeName = sanitizeFileName(name);
      const language = getLanguageFromFilename(safeName);

      const newNode: FileNode = {
        id,
        name: safeName,
        type,
        content: type === 'file' ? content : undefined,
        parentId,
        children: type === 'folder' ? [] : undefined,
        language,
      };

      set((state) => {
        const newFiles = { ...state.files, [id]: newNode };
        if (parentId && newFiles[parentId]) {
          newFiles[parentId] = {
            ...newFiles[parentId],
            children: [...(newFiles[parentId].children || []), id],
          };
        }
        return { files: newFiles };
      });

      return id;
    },

    updateFileContent: (id, content) => {
      set((state) => {
        const file = state.files[id];
        if (!file) return state;
        if (file.content === content) return state;
        return {
          files: {
            ...state.files,
            [id]: { ...file, content, isUnsaved: true },
          },
        };
      });
    },

    deleteFile: (id) => {
      set((state) => {
        const newFiles = { ...state.files };
        const fileToDelete = newFiles[id];
        
        const deleteRecursively = (nodeId: string) => {
          const node = newFiles[nodeId];
          if (node?.children) {
            node.children.forEach(deleteRecursively);
          }
          delete newFiles[nodeId];
        };

        if (fileToDelete?.parentId && newFiles[fileToDelete.parentId]) {
          newFiles[fileToDelete.parentId] = {
            ...newFiles[fileToDelete.parentId],
            children: newFiles[fileToDelete.parentId].children?.filter(childId => childId !== id),
          };
        }

        deleteRecursively(id);

        const newOpenFiles = state.openFiles.filter(openId => newFiles[openId]);
        const activeStillExists = !!state.activeFileId && !!newFiles[state.activeFileId];
        const newActiveFileId = activeStillExists ? state.activeFileId : (newOpenFiles[0] || null);

        return {
          files: newFiles,
          openFiles: newOpenFiles,
          activeFileId: newActiveFileId,
        };
      });
    },

    renameFile: (id, newName) => {
      const safeName = sanitizeFileName(newName);
      const language = getLanguageFromFilename(safeName);
      set((state) => ({
        files: {
          ...state.files,
          [id]: { ...state.files[id], name: safeName, language },
        },
      }));
    },

    openFile: (id) => {
      set((state) => {
        const file = state.files[id];
        if (!file || file.type === 'folder') return state;

        if (!state.openFiles.includes(id)) {
          return {
            openFiles: [...state.openFiles, id],
            activeFileId: id,
          };
        }
        return { activeFileId: id };
      });
    },

    closeFile: (id) => {
      set((state) => {
        const newOpenFiles = state.openFiles.filter((fileId) => fileId !== id);
        let newActiveFileId = state.activeFileId;
        
        if (state.activeFileId === id) {
          const closedIndex = state.openFiles.indexOf(id);
          if (newOpenFiles.length > 0) {
            newActiveFileId = newOpenFiles[Math.min(closedIndex, newOpenFiles.length - 1)];
          } else {
            newActiveFileId = null;
          }
        }

        return {
          openFiles: newOpenFiles,
          activeFileId: newActiveFileId,
        };
      });
    },

    setActiveFile: (id) => {
      const state = get();
      if (state.activeFileId && state.files[state.activeFileId]?.isUnsaved) {
        state.saveFile(state.activeFileId);
      }
      set({ activeFileId: id });
    },

    closeAllFiles: () => {
      const state = get();
      state.openFiles.forEach((fileId) => {
        if (state.files[fileId]?.isUnsaved) {
          state.saveFile(fileId);
        }
      });
      set({ openFiles: [], activeFileId: null });
    },
    
    setSidebarView: (view) => {
      set((state) => {
        // If clicking the same view that's already open, close the sidebar
        if (state.sidebarView === view && state.isSidebarOpen) {
          return { isSidebarOpen: false };
        }
        return { sidebarView: view, isSidebarOpen: true };
      });
    },

    setActiveExtensionView: (activeExtensionView) => set({ activeExtensionView }),

    openExtensionView: (view) => {
      set((state) => {
        // If clicking the same extension view and sidebar is open, toggle closed (VS Code behavior)
        if (
          state.sidebarView === 'extension-view' &&
          state.isSidebarOpen &&
          state.activeExtensionView?.toolId === view.toolId
        ) {
          return { isSidebarOpen: false };
        }
        return {
          sidebarView: 'extension-view',
          activeExtensionView: view,
          isSidebarOpen: true,
        };
      });
    },
    
    toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
    setTheme: (theme) => set({ theme }),
    setActiveFont: (activeFont) => set({ activeFont }),
    setCursorPosition: (pos) => set({ cursorPosition: pos }),
    setPreviewOpen: (open) => set({ isPreviewOpen: open }),
    setIsTerminalOpen: (open) => set((state) => ({
      isTerminalOpen: typeof open === 'function' ? open(state.isTerminalOpen) : open,
    })),
    setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),

    setHaptics: (val) => {
      set({ isHapticsEnabled: val });
      // Persistence is handled by App.tsx which watches this and writes to config
    },

    saveFile: (id) => {
      set((state) => ({
        files: {
          ...state.files,
          [id]: { ...state.files[id], isUnsaved: false },
        },
      }));
    },

    saveAllFiles: () => {
      set((state) => {
        const newFiles = { ...state.files };
        for (const key of Object.keys(newFiles)) {
          if (newFiles[key].isUnsaved) {
            newFiles[key] = { ...newFiles[key], isUnsaved: false };
          }
        }
        return { files: newFiles };
      });
    },

    loadProject: (files) => {
      loadWorkspaceCustomCss(files);
      const fileNodes = Object.entries(files).filter(([_, f]) => f.type === 'file');
      let defaultFileId: string | null = null;

      if (fileNodes.length > 0) {
        const mainFile = fileNodes.find(([_, f]) => 
          ['index.html', 'app.tsx', 'app.jsx', 'app.js', 'main.py', 'main.ts', 'main.js', 'index.js', 'page.tsx', 'page.jsx'].includes(f.name.toLowerCase())
        );
        defaultFileId = mainFile ? mainFile[0] : fileNodes[0][0];
      }

      set({
        files,
        openFiles: defaultFileId ? [defaultFileId] : [],
        activeFileId: defaultFileId,
        cursorPosition: { line: 1, col: 1 },
      });
    },

    getFileByPath: (pathSegments: string[]) => {
      const { files } = get();
      if (pathSegments.length === 0) return files['root'] || null;
      
      let current = files['root'];
      if (!current) return null;

      for (const segment of pathSegments) {
        if (segment === '.' || segment === '') continue;
        if (!current.children) return null;
        
        const childId = current.children.find(cid => {
          const child = files[cid];
          return child && child.name === segment;
        });
        
        if (!childId) return null;
        current = files[childId];
      }
      return current;
    },

    getChildrenOf: (id: string) => {
      const { files } = get();
      const node = files[id];
      if (!node?.children) return [];
      return node.children.map(cid => files[cid]).filter(Boolean);
    },

    moveFile: (id: string, newParentId: string, newName?: string) => {
      set((state) => {
        const newFiles = { ...state.files };
        const file = newFiles[id];
        if (!file) return state;

        // Remove from old parent
        if (file.parentId && newFiles[file.parentId]) {
          newFiles[file.parentId] = {
            ...newFiles[file.parentId],
            children: newFiles[file.parentId].children?.filter(cid => cid !== id),
          };
        }

        // Add to new parent
        if (newFiles[newParentId]) {
          newFiles[newParentId] = {
            ...newFiles[newParentId],
            children: [...(newFiles[newParentId].children || []), id],
          };
        }

        // Update file
        const language = newName ? getLanguageFromFilename(newName) : file.language;
        newFiles[id] = {
          ...file,
          parentId: newParentId,
          ...(newName ? { name: newName, language } : {}),
        };

        return { files: newFiles };
      });
    },

    copyFile: (id: string, newParentId: string, newName?: string) => {
      const { files } = get();
      const original = files[id];
      if (!original) return '';

      const copyId = generateId();
      const name = newName || original.name;
      const language = getLanguageFromFilename(name);

      const copy: FileNode = {
        id: copyId,
        name,
        type: original.type,
        content: original.content,
        parentId: newParentId,
        children: original.type === 'folder' ? [] : undefined,
        language,
      };

      set((state) => {
        const newFiles = { ...state.files, [copyId]: copy };
        if (newFiles[newParentId]) {
          newFiles[newParentId] = {
            ...newFiles[newParentId],
            children: [...(newFiles[newParentId].children || []), copyId],
          };
        }
        return { files: newFiles };
      });

      return copyId;
    },

    getFilePath: (id: string) => {
      const { files } = get();
      const segments: string[] = [];
      let current = files[id];
      while (current && current.id !== 'root') {
        segments.unshift(current.name);
        current = current.parentId ? files[current.parentId] : undefined as any;
      }
      return segments;
    },
    runTarget: 'java',
    setRunTarget: (target) => set({ runTarget: target }),
  })
);

// Atomic selector hooks to avoid re-rendering entire component tree
export const useActiveFileId = () => useIdeStore((s) => s.activeFileId);
export const useActiveFile = () => useIdeStore((s) => (s.activeFileId ? s.files[s.activeFileId] : null));
export const useTheme = () => useIdeStore((s) => s.theme);
export const useOpenFiles = () => useIdeStore((s) => s.openFiles);
export const useActiveFont = () => useIdeStore((s) => s.activeFont);
export const useIsSidebarOpen = () => useIdeStore((s) => s.isSidebarOpen);
export const useFileMetadata = (id: string) =>
  useIdeStore((s) => {
    const f = s.files[id];
    if (!f) return null;
    return {
      id: f.id,
      name: f.name,
      type: f.type,
      parentId: f.parentId,
      language: f.language,
      isUnsaved: f.isUnsaved,
    };
  });

