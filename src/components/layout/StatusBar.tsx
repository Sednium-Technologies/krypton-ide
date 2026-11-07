import React, { useMemo } from 'react';
import { useIdeStore, getLanguageFromFilename } from '../../store/useIdeStore';
import { useExtensionHostStore } from '../../store/useExtensionHostStore';
import { useLspStore } from '../../store/useLspStore';
import { useNativeTerminalStore } from '../../store/useNativeTerminalStore';
import { useToastStore } from '../../store/useToastStore';
import { useTrustStore } from '../../store/useTrustStore';
import { cn } from '../../lib/utils';
import type { ExtensionStatusBarItem } from '../../lib/extensions/nativeExtensionHost';

export function StatusBar() {
  const { cursorPosition, activeFileId, files, theme } = useIdeStore();
  const statusBarItems = useExtensionHostStore((state) => state.statusBarItems);
  const executeCommand = useExtensionHostStore((state) => state.executeCommand);
  const activeFile = activeFileId ? files[activeFileId] : null;

  const leftItems = useMemo(() => statusBarItems.filter((i) => (i.alignment || 1) !== 2), [statusBarItems]);
  const rightItems = useMemo(() => statusBarItems.filter((i) => i.alignment === 2), [statusBarItems]);

  const handleItemClick = async (item: ExtensionStatusBarItem) => {
    if (!item.command) return;
    try {
      const res = await executeCommand(item.command);
      useToastStore.getState().show({
        message: `${item.text} triggered${res !== undefined ? `: ${typeof res === 'object' ? JSON.stringify(res) : res}` : ''}`,
        type: 'success',
      });
    } catch (err: any) {
      useToastStore.getState().show({
        message: `Command failed: ${err?.message || err}`,
        type: 'error',
      });
    }
  };

  const language = activeFile ? (activeFile.language || getLanguageFromFilename(activeFile.name)) : '';
  const displayLang = language.charAt(0).toUpperCase() + language.slice(1);

  const lspSession = useLspStore((s) => s.sessions[language]);
  const lspInstallCmd = useLspStore((s) => s.getInstallCommand(language));

  const handleLspClick = async () => {
    if (!language) return;
    const lspState = useLspStore.getState();
    const session = lspState.sessions[language];
    const installCmd = lspState.getInstallCommand(language);

    if (!session || session.status === 'error') {
      useIdeStore.getState().setIsTerminalOpen(true);
      await useNativeTerminalStore.getState().sendInput(`${installCmd}\n`);
      useToastStore.getState().show({
        message: `Installing ${language} language server in terminal: ${installCmd}`,
        type: 'info',
      });
    } else if (session.status === 'ready') {
      useToastStore.getState().show({
        message: `${displayLang} Language Server is active (${session.sessionId})`,
        type: 'success',
      });
    }
  };

  // Compute word count, character count, and line count for the active file
  const stats = useMemo(() => {
    if (!activeFile?.content) return null;
    const content = activeFile.content;
    const lines = content.split('\n').length;
    const chars = content.length;
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    return { lines, chars, words };
  }, [activeFile?.content]);

  // Format file size
  const fileSize = useMemo(() => {
    if (!activeFile?.content) return null;
    const bytes = new Blob([activeFile.content]).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, [activeFile?.content]);

  return (
    <div className="flex h-6 items-center bg-[#007acc] px-3 text-[11px] text-white select-none justify-between">
      <div className="flex space-x-3 items-center">
        <span className="cursor-pointer hover:bg-white/20 px-1.5 py-0.5 rounded flex items-center space-x-1">
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" clipRule="evenodd" d="M11.5 2.75L10.25 4l1.25 1.25L10.25 6.5 11.5 7.75 12.75 6.5 14 7.75 15.25 6.5 14 5.25 15.25 4 14 2.75 12.75 4 11.5 2.75zM6.5 4L5.25 5.25 4 4 2.75 5.25 4 6.5 2.75 7.75 4 9l1.25-1.25L6.5 9 7.75 7.75 6.5 6.5 7.75 5.25 6.5 4z"/></svg>
          <span>main*</span>
        </span>
        {/* Word / Char / File size stats */}
        {stats && (
          <span className="text-white/70 hidden sm:inline">
            {stats.words} words · {stats.chars.toLocaleString()} chars
          </span>
        )}
        {fileSize && (
          <span className="text-white/70 hidden sm:inline">
            {fileSize}
          </span>
        )}
        {/* Contributed Left Status Bar Items */}
        {leftItems.map((item) => (
          <span
            key={item.id}
            onClick={() => handleItemClick(item)}
            title={item.tooltip || item.text}
            className={`px-1.5 py-0.5 rounded flex items-center space-x-1 ${item.command ? 'cursor-pointer hover:bg-white/20' : ''}`}
          >
            <span>{item.text}</span>
          </span>
        ))}
      </div>
      <div className="flex space-x-3 items-center">
        {/* Contributed Right Status Bar Items */}
        {rightItems.map((item) => (
          <span
            key={item.id}
            onClick={() => handleItemClick(item)}
            title={item.tooltip || item.text}
            className={`px-1.5 py-0.5 rounded flex items-center space-x-1 ${item.command ? 'cursor-pointer hover:bg-white/20' : ''}`}
          >
            <span>{item.text}</span>
          </span>
        ))}
        {activeFile && (
          <>
            <span className="cursor-pointer hover:bg-white/20 px-1.5 py-0.5 rounded">
              Ln {cursorPosition.line}, Col {cursorPosition.col}
            </span>
            {stats && (
              <span className="cursor-pointer hover:bg-white/20 px-1.5 py-0.5 rounded sm:hidden">
                {stats.words}w
              </span>
            )}
            <span className="cursor-pointer hover:bg-white/20 px-1.5 py-0.5 rounded">Spaces: 2</span>
            <span className="cursor-pointer hover:bg-white/20 px-1.5 py-0.5 rounded">UTF-8</span>
            <span className="cursor-pointer hover:bg-white/20 px-1.5 py-0.5 rounded">{displayLang}</span>
            {displayLang && (
              <span
                onClick={handleLspClick}
                title={
                  lspSession?.status === 'ready'
                    ? `${displayLang} Language Server is active. Click for info.`
                    : lspSession?.status === 'starting'
                    ? `${displayLang} Language Server is starting...`
                    : `${displayLang} Language Server is not installed. Click to install in terminal: ${lspInstallCmd}`
                }
                className={cn(
                  "cursor-pointer hover:bg-white/20 px-1.5 py-0.5 rounded flex items-center space-x-1 transition-colors",
                  lspSession?.status === 'error' && "text-amber-300 font-medium animate-pulse",
                  lspSession?.status === 'ready' && "text-emerald-300 font-medium"
                )}
              >
                <span>
                  {lspSession?.status === 'ready'
                    ? `● ${displayLang} LSP`
                    : lspSession?.status === 'starting'
                    ? `⟳ ${displayLang} LSP`
                    : `⚠ ${displayLang} (Install LSP)`}
                </span>
              </span>
            )}
          </>
        )}
        <span
          onClick={async () => {
            const isCurrentlyTrusted = useTrustStore.getState().isTrusted;
            if (isCurrentlyTrusted) {
              await useTrustStore.getState().restrictCurrentWorkspace();
              useToastStore.getState().show({
                message: "Workspace set to Restricted Mode. Privileged capabilities disabled.",
                type: 'info',
              });
            } else {
              await useTrustStore.getState().trustCurrentWorkspace();
              useToastStore.getState().show({
                message: "Workspace is now Trusted. All features and tools enabled.",
                type: 'success',
              });
            }
          }}
          title={
            useTrustStore.getState().isTrusted
              ? "Workspace is Trusted. Click to restrict."
              : "Workspace is in Restricted Mode. Click to trust."
          }
          className={cn(
            "cursor-pointer hover:bg-white/20 px-1.5 py-0.5 rounded flex items-center space-x-1 transition-colors font-medium ml-1",
            useTrustStore.getState().isTrusted ? "text-emerald-300" : "text-amber-300"
          )}
        >
          <span>{useTrustStore.getState().isTrusted ? "🛡️ Trusted" : "🔒 Restricted"}</span>
        </span>
      </div>
    </div>
  );
}
