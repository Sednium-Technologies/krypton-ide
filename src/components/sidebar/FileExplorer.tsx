import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FileJson, FileCode2, FileText, Plus, FolderPlus, Trash2, Edit2, Search, FolderUp, X, Copy, Share2, Save, Clipboard, FolderDown, MoreVertical, ChevronsDownUp, ChevronsUpDown, Info, FolderOpen, FileUp, FilePlus } from 'lucide-react';
import { useIdeStore, FileNode } from '../../store/useIdeStore';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '../../lib/utils';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import JSZip from 'jszip';
import { LanguageIcon, FolderIcon } from './LanguageIcon';
import { OortyLiteIcon } from '../ui/OortyLiteIcon';
import { ConfirmationSheet } from '../ui/ConfirmationSheet';
import { toast } from '../../store/useToastStore';

// System files excluded from project tree (changelog Sec. 7)
const SYSTEM_EXCLUDED_FILES = new Set(['.metadata', '.git', '.DS_Store', '.thumbnails', '.idea', '.vscode']);

const getFileIcon = (name: string) => {
  return <LanguageIcon fileName={name} size={16} />;
};

// ─── Context Menu Item ─────────────────────────────────
interface ContextMenuItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  nodeId: string;
}

interface FileExplorerProps {
  autoFocusSearch?: boolean;
}

export function FileExplorer({ autoFocusSearch }: FileExplorerProps = {}) {
  const files = useIdeStore((state) => state.files);
  const activeFileId = useIdeStore((state) => state.activeFileId);
  const openFile = useIdeStore((state) => state.openFile);
  const createFile = useIdeStore((state) => state.createFile);
  const deleteFile = useIdeStore((state) => state.deleteFile);
  const renameFile = useIdeStore((state) => state.renameFile);
  const saveFile = useIdeStore((state) => state.saveFile);
  const updateFileContent = useIdeStore((state) => state.updateFileContent);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root']));
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; isFolder: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeFileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocusSearch) {
      setTimeout(() => searchInputRef.current?.focus(), 150);
    }
  }, [autoFocusSearch]);

  // ─── File clipboard (whole-file copy/paste) ───────────
  const [copiedFileId, setCopiedFileId] = useState<string | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, nodeId: '' });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  // Close context menu on outside click
  useEffect(() => {
    const close = () => setContextMenu(prev => ({ ...prev, visible: false }));
    if (contextMenu.visible) {
      document.addEventListener('click', close);
      document.addEventListener('scroll', close, true);
      return () => {
        document.removeEventListener('click', close);
        document.removeEventListener('scroll', close, true);
      };
    }
  }, [contextMenu.visible]);

  // ─── Long press handlers ───────────────────────────────
  const handleTouchStart = useCallback((nodeId: string, e: React.TouchEvent) => {
    longPressTriggered.current = false;
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      // Haptic feedback
      if ('vibrate' in navigator) navigator.vibrate(30);
      setContextMenu({ visible: true, x, y, nodeId });
    }, 500);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // Also support right-click on desktop
  const handleContextMenu = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, nodeId });
  }, []);

  // ─── Context menu actions ──────────────────────────────
  const downloadFile = async (nodeId: string) => {
    const node = files[nodeId];
    if (!node || node.type !== 'file') return;
    const content = useIdeStore.getState().files[nodeId]?.content || '';
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await Filesystem.writeFile({
          path: node.name,
          data: content,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        });
        toast.success(`Exported ${node.name} to Documents`);
        try {
          if (res.uri) {
            await Share.share({
              title: node.name,
              url: res.uri,
              dialogTitle: `Share ${node.name}`,
            });
          }
        } catch {
          // Share dismissed or unavailable
        }
      } catch (err) {
        console.error('Failed to export file on native platform:', err);
        toast.error(`Failed to export ${node.name}`);
      }
      return;
    }
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = node.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadFolder = async (nodeId: string) => {
    const node = files[nodeId];
    if (!node) return;
    const zip = new JSZip();
    const addToZip = (nId: string, path: string) => {
      const n = useIdeStore.getState().files[nId];
      if (!n) return;
      if (n.type === 'file' && n.content !== undefined) {
        zip.file(`${path}${n.name}`, n.content);
      } else if (n.type === 'folder' && n.children) {
        const newPath = nId === nodeId ? '' : `${path}${n.name}/`;
        n.children.forEach(cId => addToZip(cId, newPath));
      }
    };
    addToZip(nodeId, '');
    const fileName = `${node.name}.zip`;

    if (Capacitor.isNativePlatform()) {
      try {
        const base64 = await zip.generateAsync({ type: 'base64' });
        const res = await Filesystem.writeFile({
          path: fileName,
          data: base64,
          directory: Directory.Documents,
        });
        toast.success(`Exported ${fileName} to Documents`);
        try {
          if (res.uri) {
            await Share.share({
              title: fileName,
              url: res.uri,
              dialogTitle: `Share ${fileName}`,
            });
          }
        } catch {
          // Share dismissed or unavailable
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

  const copyContent = async (nodeId: string) => {
    const content = useIdeStore.getState().files[nodeId]?.content;
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  const duplicateFile = (nodeId: string) => {
    const node = files[nodeId];
    if (!node) return;
    const content = useIdeStore.getState().files[nodeId]?.content;
    const ext = node.name.includes('.') ? '.' + node.name.split('.').pop() : '';
    const base = node.name.replace(ext, '');
    const newName = `${base}_copy${ext}`;
    const parentId = Object.entries(files).find(([_, f]) =>
      f.type === 'folder' && f.children?.includes(nodeId)
    )?.[0] || 'root';
    createFile(newName, parentId, node.type, content);
  };

  const shareFile = async (nodeId: string) => {
    const node = files[nodeId];
    if (!node) return;
    const actualNode = useIdeStore.getState().files[nodeId];
    try {
      if (node.type === 'file' && actualNode?.content !== undefined) {
        // On native: write temp file with correct extension and share file URI
        if (Capacitor.isNativePlatform()) {
          const { Filesystem, Directory } = await import('@capacitor/filesystem');
          
          // Write the file to cache directory with proper name
          const tempPath = `share_temp/${node.name}`;
          try {
            await Filesystem.mkdir({
              path: 'share_temp',
              directory: Directory.Cache,
              recursive: true,
            });
          } catch { /* already exists */ }
          
          await Filesystem.writeFile({
            path: tempPath,
            data: actualNode.content,
            directory: Directory.Cache,
            encoding: (await import('@capacitor/filesystem')).Encoding.UTF8,
          });
          
          // Get the native file URI
          const uriResult = await Filesystem.getUri({
            path: tempPath,
            directory: Directory.Cache,
          });
          
          await Share.share({
            title: node.name,
            url: uriResult.uri,
            dialogTitle: `Share ${node.name}`,
          });
        } else {
          // Web fallback: share as text
          await Share.share({
            title: node.name,
            text: node.content,
            dialogTitle: `Share ${node.name}`,
          });
        }
      } else if (node.type === 'folder') {
        // For folders: create a ZIP and share it
        if (Capacitor.isNativePlatform()) {
          const zip = new JSZip();
          const addToZip = (nId: string, path: string) => {
            const n = files[nId];
            if (!n) return;
            if (n.type === 'file' && n.content !== undefined) {
              zip.file(`${path}${n.name}`, n.content);
            } else if (n.type === 'folder' && n.children) {
              const newPath = nId === nodeId ? '' : `${path}${n.name}/`;
              n.children.forEach(cId => addToZip(cId, newPath));
            }
          };
          addToZip(nodeId, '');
          
          const blob = await zip.generateAsync({ type: 'base64' });
          const { Filesystem, Directory } = await import('@capacitor/filesystem');
          
          const zipName = `${node.name}.zip`;
          const tempPath = `share_temp/${zipName}`;
          try {
            await Filesystem.mkdir({
              path: 'share_temp',
              directory: Directory.Cache,
              recursive: true,
            });
          } catch { /* already exists */ }
          
          await Filesystem.writeFile({
            path: tempPath,
            data: blob,
            directory: Directory.Cache,
          });
          
          const uriResult = await Filesystem.getUri({
            path: tempPath,
            directory: Directory.Cache,
          });
          
          await Share.share({
            title: zipName,
            url: uriResult.uri,
            dialogTitle: `Share ${node.name}`,
          });
        } else {
          await Share.share({
            title: node.name,
            text: `Shared from Kryptonide: ${node.name}`,
            dialogTitle: 'Share',
          });
        }
      }
    } catch {
      // User cancelled or share not available
    }
  };

  const sendToAgent = (nodeId: string) => {
    const node = files[nodeId];
    if (!node) return;
    window.dispatchEvent(new CustomEvent('krypton-send-to-agent', { detail: { text: `@${node.name} ` } }));
  };

  const handleCopyFile = (nodeId: string) => {
    setCopiedFileId(nodeId);
    // Brief haptic feedback
    if ('vibrate' in navigator) navigator.vibrate(20);
  };

  const handlePasteFile = (targetFolderId: string) => {
    if (!copiedFileId) return;
    const srcNode = files[copiedFileId];
    if (!srcNode || srcNode.type !== 'file') return;
    const srcContent = useIdeStore.getState().files[copiedFileId]?.content || '';
    const newId = createFile(srcNode.name, targetFolderId, 'file', srcContent);
    openFile(newId);
    setExpandedFolders(prev => new Set(prev).add(targetFolderId));
    setCopiedFileId(null);
  };

  const getContextMenuItems = (nodeId: string): ContextMenuItem[] => {
    const node = files[nodeId];
    if (!node) return [];
    const isFile = node.type === 'file';
    const isRoot = nodeId === 'root';

    const items: ContextMenuItem[] = [];

    if (isFile) {
      items.push({ label: 'Open', icon: <File size={14} />, onClick: () => openFile(nodeId) });
    }

    if (!isRoot) {
      items.push({ label: 'Rename', icon: <Edit2 size={14} />, onClick: () => { setRenamingId(nodeId); setRenameValue(node.name); } });
    }

    if (isFile) {
      items.push({ label: 'Save', icon: <Save size={14} />, onClick: () => saveFile(nodeId) });
      items.push({ label: 'Copy Content', icon: <Clipboard size={14} />, onClick: () => copyContent(nodeId) });
      items.push({ label: 'Copy File', icon: <Copy size={14} />, onClick: () => handleCopyFile(nodeId) });
      items.push({ label: 'Duplicate', icon: <Copy size={14} />, onClick: () => duplicateFile(nodeId) });
      items.push({ label: 'Download', icon: <FolderDown size={14} />, onClick: () => downloadFile(nodeId) });
    }

    if (!isFile) {
      items.push({ label: 'New File', icon: <Plus size={14} />, onClick: () => { const name = prompt('File name:'); if (name) { const id = createFile(name, nodeId, 'file'); openFile(id); setExpandedFolders(new Set(expandedFolders).add(nodeId)); } } });
      items.push({ label: 'New Folder', icon: <FolderPlus size={14} />, onClick: () => { const name = prompt('Folder name:'); if (name) { createFile(name, nodeId, 'folder'); setExpandedFolders(new Set(expandedFolders).add(nodeId)); } } });
      if (copiedFileId && files[copiedFileId]) {
        items.push({ label: `Paste "${files[copiedFileId].name}"`, icon: <Clipboard size={14} />, onClick: () => handlePasteFile(nodeId) });
      }
      items.push({ label: 'Download as ZIP', icon: <FolderDown size={14} />, onClick: () => downloadFolder(nodeId) });
    }

    items.push({ label: 'Share', icon: <Share2 size={14} />, onClick: () => shareFile(nodeId), divider: true });

    if (isFile) {
      items.push({ label: 'Send to Oorty Lite', icon: <OortyLiteIcon size={14} />, onClick: () => sendToAgent(nodeId) });
      // Show file size
      const content = node.content || '';
      const bytes = new Blob([content]).size;
      const sizeStr = bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      items.push({ label: `Size: ${sizeStr}`, icon: <Info size={14} />, onClick: () => {} });
    }

    if (!isRoot) {
      items.push({
        label: 'Delete',
        icon: <Trash2 size={14} />,
        onClick: () => {
          setDeleteTarget({ id: nodeId, name: node.name, isFolder: !isFile });
        },
        danger: true,
        divider: true,
      });
    }

    return items;
  };

  // ─── Existing handlers ─────────────────────────────────
  const toggleFolder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedFolders(newExpanded);
  };

  const handleCreateFile = (parentId: string, type: 'file' | 'folder', e: React.MouseEvent) => {
    e.stopPropagation();
    const name = prompt(`Enter ${type} name:`);
    if (name) {
      const id = createFile(name, parentId, type);
      if (!expandedFolders.has(parentId)) setExpandedFolders(new Set(expandedFolders).add(parentId));
      if (type === 'file') openFile(id);
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const node = files[id];
    if (!node) return;
    setDeleteTarget({ id, name: node.name, isFolder: node.type === 'folder' });
  };

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      const { id, name, isFolder } = deleteTarget;
      deleteFile(id);
      toast.success(`${isFolder ? 'Folder' : 'File'} "${name}" deleted`);
      setDeleteTarget(null);
    }
  };

  const startRename = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) renameFile(renamingId, renameValue.trim());
    setRenamingId(null);
  };

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles) return;
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        const id = createFile(file.name, 'root', 'file', content);
        if (i === 0) openFile(id);
      };
      reader.readAsText(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─── Open File from native file manager ─────────────────
  const handleOpenFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      // Read as text for code files, skip binary files that are too large
      if (file.size > 10 * 1024 * 1024) {
        toast.warning(`File "${file.name}" is too large (max 10MB for editing).`);
        continue;
      }
      try {
        const content = await file.text();
        const id = createFile(file.name, 'root', 'file', content);
        if (i === 0) openFile(id);
      } catch {
        // Try reading as binary/base64 for non-text files
        const reader = new FileReader();
        reader.onload = () => {
          const content = reader.result as string;
          const id = createFile(file.name, 'root', 'file', content);
          if (i === 0) openFile(id);
        };
        reader.readAsText(file);
      }
    }
    if (nativeFileInputRef.current) nativeFileInputRef.current.value = '';
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
    const fileName = `${files.root?.name || 'project'}.zip`;

    if (Capacitor.isNativePlatform()) {
      try {
        const base64 = await zip.generateAsync({ type: 'base64' });
        const res = await Filesystem.writeFile({
          path: fileName,
          data: base64,
          directory: Directory.Documents,
        });
        toast.success(`Exported ${fileName} to Documents`);
        try {
          if (res.uri) {
            await Share.share({
              title: fileName,
              url: res.uri,
              dialogTitle: `Share ${fileName}`,
            });
          }
        } catch {
          // Share dismissed or unavailable
        }
      } catch (err) {
        console.error('Failed to export ZIP on native platform:', err);
        toast.error('Failed to export ZIP file');
      }
    } else {
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleQuickNewFile = () => {
    const name = prompt('New file name:');
    if (name?.trim()) {
      const id = createFile(name.trim(), 'root', 'file');
      openFile(id);
    }
  };

  const handleQuickNewFolder = () => {
    const name = prompt('New folder name:');
    if (name?.trim()) {
      createFile(name.trim(), 'root', 'folder');
      setExpandedFolders(prev => new Set(prev).add('root'));
    }
  };

  const handleCollapseAll = () => {
    setExpandedFolders(new Set(['root']));
  };

  const matchesSearch = (node: FileNode): boolean => {
    if (SYSTEM_EXCLUDED_FILES.has(node.name)) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (node.name.toLowerCase().includes(q)) return true;
    const actualContent = useIdeStore.getState().files[node.id]?.content;
    if (node.type === 'file' && actualContent?.toLowerCase().includes(q)) return true;
    if (node.type === 'folder' && node.children) {
      return node.children.some(childId => {
        const child = files[childId];
        return child && !SYSTEM_EXCLUDED_FILES.has(child.name) ? matchesSearch(child) : false;
      });
    }
    return false;
  };

  const renderNode = (nodeId: string, depth: number = 0) => {
    const node = files[nodeId];
    if (!node) return null;
    if (nodeId !== 'root' && SYSTEM_EXCLUDED_FILES.has(node.name)) return null;
    if (searchQuery.trim() && !matchesSearch(node)) return null;

    const isFolder = node.type === 'folder';
    const isExpanded = expandedFolders.has(nodeId) || (!!searchQuery.trim() && isFolder);
    const isActive = activeFileId === nodeId;
    const isRenaming = renamingId === nodeId;

    return (
      <div key={nodeId} className="relative">
        <div
          className={cn(
            "group flex cursor-pointer items-center py-1.5 px-2.5 my-0.5 text-xs rounded-xl transition-all select-none relative",
            isActive 
              ? "bg-[#342f33] text-[#f3f0e7] font-semibold border border-[#f3f0e7]/20 shadow-md" 
              : "text-[#f3f0e7]/70 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/5 active:bg-[#f3f0e7]/10"
          )}
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
          onClick={() => {
            if (longPressTriggered.current) { longPressTriggered.current = false; return; }
            isFolder ? toggleFolder(nodeId, { stopPropagation: () => {} } as any) : openFile(nodeId);
          }}
          onDoubleClick={(e) => {
            if (!isFolder && nodeId !== 'root') startRename(nodeId, node.name, e);
          }}
          onTouchStart={(e) => handleTouchStart(nodeId, e)}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchMove}
          onContextMenu={(e) => handleContextMenu(nodeId, e)}
        >
          {depth > 0 && (
            <div 
              className="absolute left-0 top-1/2 w-2.5 h-[1px] bg-[#f3f0e7]/10"
              style={{ left: `${depth * 14 - 4}px` }}
            />
          )}

          <div className="flex items-center flex-1 min-w-0">
            <span className="mr-1.5 w-4 flex-shrink-0 flex items-center justify-center text-[#f3f0e7]/70">
              {isFolder && (
                isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
              )}
            </span>
            <span className="mr-2 flex-shrink-0">
              {isFolder ? (
                <FolderIcon folderName={node.name} isOpen={isExpanded} size={16} />
              ) : (
                getFileIcon(node.name)
              )}
            </span>
            {/* Show clipboard indicator if this file is copied */}
            {copiedFileId === nodeId && (
              <span className="mr-1.5 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">COPIED</span>
            )}
            
            {isRenaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 min-w-0 bg-[#231e22] border border-[#f3f0e7]/30 rounded-lg px-2 py-0.5 text-xs text-[#f3f0e7] focus:outline-none"
              />
            ) : (
              <span className="truncate font-medium">{node.name}</span>
            )}
          </div>

          {/* Inline actions — keep for desktop hover */}
          {!isRenaming && (
            <div className="flex items-center space-x-1 opacity-0 md:group-hover:opacity-100 flex-shrink-0 ml-1">
              {isFolder && (
                <>
                  <button 
                    onClick={(e) => handleCreateFile(nodeId, 'file', e)} 
                    className="p-1 hover:bg-[#f3f0e7]/10 rounded-lg text-[#f3f0e7]/70 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none" 
                    title="New File"
                    aria-label="New file in folder"
                  >
                    <Plus size={14} />
                  </button>
                  <button 
                    onClick={(e) => handleCreateFile(nodeId, 'folder', e)} 
                    className="p-1 hover:bg-[#f3f0e7]/10 rounded-lg text-[#f3f0e7]/70 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none" 
                    title="New Folder"
                    aria-label="New folder in folder"
                  >
                    <FolderPlus size={14} />
                  </button>
                </>
              )}
              {nodeId !== 'root' && (
                <button 
                  onClick={(e) => { e.stopPropagation(); setContextMenu({ visible: true, x: e.clientX, y: e.clientY, nodeId }); }}
                  className="p-1 hover:bg-[#f3f0e7]/10 rounded-lg text-[#f3f0e7]/70 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none" 
                  title="More actions"
                  aria-label={`More actions for ${node.name}`}
                >
                  <MoreVertical size={14} />
                </button>
              )}
            </div>
          )}
        </div>
        
        {isFolder && isExpanded && node.children && (
          <div className="border-l border-[#f3f0e7]/10 ml-3 pl-1">
            {node.children
              .filter(childId => {
                const child = files[childId];
                return child && !SYSTEM_EXCLUDED_FILES.has(child.name);
              })
              .map(childId => renderNode(childId, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Quick Action Toolbar (changelog Sec. 7) */}
      <div className="px-3 py-2.5 border-b border-[#f3f0e7]/10 bg-[#231e22]">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-[#f3f0e7]/75 tracking-wider uppercase">
            Explorer
          </span>
          <div className="flex items-center space-x-1">
            <button
              onClick={handleQuickNewFile}
              className="p-1.5 rounded-lg text-[#f3f0e7]/70 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10 active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
              title="New File"
              aria-label="New File"
            >
              <FilePlus size={15} />
            </button>
            <button
              onClick={handleQuickNewFolder}
              className="p-1.5 rounded-lg text-[#f3f0e7]/70 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10 active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
              title="New Folder"
              aria-label="New Folder"
            >
              <FolderPlus size={15} />
            </button>
            <button
              onClick={handleCollapseAll}
              className="p-1.5 rounded-lg text-[#f3f0e7]/70 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10 active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
              title="Collapse All"
              aria-label="Collapse All"
            >
              <ChevronsDownUp size={15} />
            </button>
            <button
              onClick={() => {
                setIsSearchOpen(prev => {
                  const next = !prev;
                  if (next) setTimeout(() => searchInputRef.current?.focus(), 100);
                  else setSearchQuery('');
                  return next;
                });
              }}
              className={cn(
                "p-1.5 rounded-lg transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none",
                isSearchOpen || searchQuery
                  ? "bg-[#f3f0e7]/20 text-[#f3f0e7]"
                  : "text-[#f3f0e7]/70 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10"
              )}
              title="Search Files"
              aria-label="Toggle file search"
            >
              <Search size={15} />
            </button>
          </div>
        </div>

        {/* Real-time search/filter input */}
        {(isSearchOpen || searchQuery) && (
          <div className="mt-2 relative animate-fade-in">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#f3f0e7]/70" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              aria-label="Search files"
              className="w-full rounded-xl border border-[#f3f0e7]/10 bg-[#342f33] py-1.5 pl-8 pr-7 text-xs text-[#f3f0e7] focus:border-[#f3f0e7]/30 focus:outline-none placeholder-[#f3f0e7]/50 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#f3f0e7]/60 hover:text-[#f3f0e7] p-0.5 rounded focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
                aria-label="Clear search query"
                title="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}

        {/* Import / Export / Open File Sub-Toolbar */}
        <div className="flex items-center space-x-1.5 mt-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center space-x-1 bg-[#342f33] border border-[#f3f0e7]/10 hover:bg-[#3d373c] active:scale-95 py-1.5 rounded-xl text-[10px] font-semibold text-[#f3f0e7]/80 hover:text-[#f3f0e7] transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
            title="Import Files"
            aria-label="Import files"
          >
            <FolderUp size={12} className="text-[#f3f0e7]/70" />
            <span>Import</span>
          </button>
          <button
            onClick={handleDownloadZip}
            className="flex-1 flex items-center justify-center space-x-1 bg-[#342f33] border border-[#f3f0e7]/10 hover:bg-[#3d373c] active:scale-95 py-1.5 rounded-xl text-[10px] font-semibold text-[#f3f0e7]/80 hover:text-[#f3f0e7] transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
            title="Export as ZIP"
            aria-label="Export project as ZIP"
          >
            <FolderDown size={12} className="text-[#f3f0e7]/70" />
            <span>Export</span>
          </button>
          <button
            onClick={() => nativeFileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center space-x-1 bg-[#342f33] border border-[#f3f0e7]/10 hover:bg-[#3d373c] active:scale-95 py-1.5 rounded-xl text-[10px] font-semibold text-[#f3f0e7]/80 hover:text-[#f3f0e7] transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
            title="Open Single File"
            aria-label="Open single file"
          >
            <FileUp size={12} className="text-[#f3f0e7]/70" />
            <span>Open</span>
          </button>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input type="file" ref={fileInputRef} className="hidden" multiple accept="*/*" onChange={handleUploadFiles} />
      <input type="file" ref={nativeFileInputRef} className="hidden" multiple accept="*/*" onChange={handleOpenFile} />

      {/* File tree */}
      <div className="py-1 flex-1 overflow-y-auto">
        {renderNode('root')}
      </div>

      {/* ─── Context Menu Popup ───────────────────────── */}
      {contextMenu.visible && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setContextMenu(prev => ({ ...prev, visible: false }))} />
          <div
            className="fixed z-[101] min-w-[200px] bg-[#342f33] border border-[#f3f0e7]/15 rounded-2xl shadow-2xl py-1.5 animate-context-pop"
            style={{
              left: `${Math.min(contextMenu.x, window.innerWidth - 220)}px`,
              top: `${Math.min(contextMenu.y, window.innerHeight - 320)}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {getContextMenuItems(contextMenu.nodeId).map((item, i) => (
              <React.Fragment key={i}>
                {item.divider && i > 0 && <div className="border-t border-[#f3f0e7]/10 my-1" />}
                <button
                  className={cn(
                    "w-full flex items-center space-x-2.5 px-3.5 py-2 text-xs transition-colors text-left font-medium",
                    item.danger
                      ? "text-red-400 hover:bg-red-500/10"
                      : "text-[#f3f0e7] hover:bg-[#f3f0e7]/10"
                  )}
                  onClick={() => {
                    setContextMenu(prev => ({ ...prev, visible: false }));
                    item.onClick();
                  }}
                >
                  <span className="flex-shrink-0 opacity-70">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              </React.Fragment>
            ))}
          </div>
        </>
      )}

      {/* Confirmation Sheet for Deleting Files / Folders */}
      <ConfirmationSheet
        isOpen={!!deleteTarget}
        title={deleteTarget?.isFolder ? 'Delete Folder' : 'Delete File'}
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isDestructive
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
