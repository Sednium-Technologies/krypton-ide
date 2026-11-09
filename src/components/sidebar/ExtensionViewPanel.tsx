import React, { useState } from 'react';
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Package,
  Layers,
  Info,
  Play,
} from 'lucide-react';
import { useIdeStore } from '../../store/useIdeStore';
import { useExtensionsStore } from '../../store/useExtensionsStore';
import { useExtensionHostStore } from '../../store/useExtensionHostStore';
import { useToastStore } from '../../store/useToastStore';
import { ToolIcon } from '../ui/ToolIcon';
import { ExtensionDetailModal } from '../extensions/ExtensionDetailModal';
import { ExtensionWebviewHost } from '../extensions/ExtensionWebviewHost';
import { findExtension } from '../../lib/extensions/extensionRegistry';

export function ExtensionViewPanel() {
  const activeExtensionView = useIdeStore((state) => state.activeExtensionView);
  const theme = useIdeStore((state) => state.theme);
  const isLight = theme === 'light';

  const { customExtensions, installedExtensions, loadFromDisk } = useExtensionsStore();
  const hostExtensions = useExtensionHostStore((state) => state.installedExtensions);
  const executeCommand = useExtensionHostStore((state) => state.executeCommand);

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [webviewKey, setWebviewKey] = useState(0);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [runningCmd, setRunningCmd] = useState<string | null>(null);

  const extension = findExtension(
    { customExtensions, installedExtensions },
    activeExtensionView?.extensionId || ''
  );
  const hostExtension = hostExtensions.find(
    (e) => e.id === activeExtensionView?.extensionId
  );

  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRefresh = () => {
    if (extension?.webviewHtml) {
      setWebviewKey((key) => key + 1);
    } else {
      void loadFromDisk();
    }
  };

  const handleExecuteCommand = async (commandId: string, commandTitle: string) => {
    setRunningCmd(commandId);
    try {
      const result = await executeCommand(commandId);
      useToastStore.getState().show({
        message: `${commandTitle} executed${result !== undefined ? `: ${typeof result === 'object' ? JSON.stringify(result) : result}` : ''}`,
        type: 'success',
      });
    } catch (err: any) {
      useToastStore.getState().show({
        message: `Command execution failed: ${err?.message || err}`,
        type: 'error',
      });
    } finally {
      setRunningCmd(null);
    }
  };

  if (!activeExtensionView) {
    return (
      <div className={`flex flex-col items-center justify-center p-6 text-center h-full select-none ${
        isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/60'
      }`}>
        <Package size={28} className="mb-2 opacity-50" />
        <p className="text-xs">Select an extension from the activity rail or More Tools drawer.</p>
      </div>
    );
  }

  // 1. If the extension contributes a packaged Webview HTML, render the dynamic Webview Host
  const webviewHtml = (extension as any)?.webviewHtml;
  if (webviewHtml) {
    return (
      <div className={`flex flex-col h-full overflow-hidden ${
        isLight ? 'bg-[#f4f0e6] text-[#2a2529]' : 'bg-[#231e22] text-[#f3f0e7]'
      }`}>
        {/* Webview Header */}
        <div className={`flex items-center justify-between px-3.5 py-2.5 border-b shrink-0 ${
          isLight ? 'border-[#2a2529]/10 bg-[#f4f0e6]' : 'border-[#f3f0e7]/10 bg-[#231e22]'
        }`}>
          <div className="flex items-center space-x-2 min-w-0">
            {extension?.iconUrl ? (
              <img src={extension.iconUrl} alt={activeExtensionView.title} className="w-4 h-4 object-contain rounded" />
            ) : activeExtensionView.icon ? (
              <ToolIcon icon={activeExtensionView.icon} size={15} />
            ) : (
              <Package size={15} />
            )}
            <span className="text-xs font-bold truncate">
              {activeExtensionView.title}
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={handleRefresh}
              className={`p-1 rounded-lg transition-colors cursor-pointer ${
                isLight ? 'hover:bg-[#2a2529]/10 text-[#2a2529]/70' : 'hover:bg-[#f3f0e7]/10 text-[#f3f0e7]/70'
              }`}
              title="Refresh Webview"
            >
              <RefreshCw size={13} />
            </button>
            <button
              onClick={() => setIsDetailModalOpen(true)}
              className={`p-1 rounded-lg transition-colors cursor-pointer ${
                isLight ? 'hover:bg-[#2a2529]/10 text-[#2a2529]/70' : 'hover:bg-[#f3f0e7]/10 text-[#f3f0e7]/70'
              }`}
              title="Extension Details"
            >
              <Info size={13} />
            </button>
          </div>
        </div>

        {/* Dynamic Sandboxed Webview */}
        <div className="flex-1 min-h-0 relative">
          <ExtensionWebviewHost
            key={webviewKey}
            extensionId={extension?.id || activeExtensionView.extensionId}
            viewId={activeExtensionView.viewContainerId}
            htmlContent={webviewHtml}
            title={activeExtensionView.title}
          />
        </div>

        {extension && (
          <ExtensionDetailModal
            extension={extension}
            isOpen={isDetailModalOpen}
            onClose={() => setIsDetailModalOpen(false)}
          />
        )}
      </div>
    );
  }

  // Fallback: Rich Interactive GUI Panel for Declarative / Tooling / Service Extensions
  const hostViews =
    activeExtensionView?.viewContainerId && hostExtension?.manifest?.contributes?.views
      ? hostExtension.manifest.contributes.views[activeExtensionView.viewContainerId] || []
      : [];
  const contribViews = [
    ...(extension?.activityBarContributions?.flatMap((c) => c.views || []) || []),
    ...hostViews,
  ];

  const allCommands = [
    ...(extension?.contributedCommands || []),
    ...(hostExtension?.manifest?.contributes?.commands || []),
  ];

  const packagePublisher = extension?.publisher || hostExtension?.manifest?.publisher || 'Unknown';
  const packageVersion = extension?.version || hostExtension?.manifest?.version || '1.0.0';
  const packageId = extension?.id || hostExtension?.id || activeExtensionView?.extensionId;
  const packageCategory = extension?.category || 'tool';

  return (
    <div className={`flex flex-col h-full overflow-hidden select-none ${
      isLight ? 'bg-[#f4f0e6] text-[#2a2529]' : 'bg-[#231e22] text-[#f3f0e7]'
    }`}>
      {/* Extension Header */}
      <div className={`flex items-center justify-between px-3.5 py-2.5 border-b shrink-0 ${
        isLight ? 'border-[#2a2529]/10 bg-[#f4f0e6]' : 'border-[#f3f0e7]/10 bg-[#231e22]'
      }`}>
        <div className="flex items-center space-x-2 min-w-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 overflow-hidden bg-[#7C9B79]/15 text-[#7C9B79]">
            {extension?.iconUrl ? (
              <img src={extension.iconUrl} alt={activeExtensionView.title} className="w-5 h-5 object-contain" />
            ) : hostExtension?.manifest?.icon ? (
              <img src={hostExtension.manifest.icon} alt={activeExtensionView.title} className="w-5 h-5 object-contain" />
            ) : activeExtensionView.icon ? (
              <ToolIcon icon={activeExtensionView.icon} size={16} />
            ) : (
              <Package size={16} />
            )}
          </div>
          <span className="text-xs font-bold truncate">
            {activeExtensionView.title}
          </span>
          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${
            isLight ? 'bg-[#2a2529]/10 text-[#2a2529]/70' : 'bg-[#f3f0e7]/10 text-[#f3f0e7]/70'
          }`}>
            v{packageVersion}
          </span>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={handleRefresh}
            className={`p-1 rounded-lg transition-colors cursor-pointer ${
              isLight ? 'hover:bg-[#2a2529]/10 text-[#2a2529]/70' : 'hover:bg-[#f3f0e7]/10 text-[#f3f0e7]/70'
            }`}
            title="Refresh"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={() => setIsDetailModalOpen(true)}
            className={`p-1 rounded-lg transition-colors cursor-pointer ${
              isLight ? 'hover:bg-[#2a2529]/10 text-[#2a2529]/70' : 'hover:bg-[#f3f0e7]/10 text-[#f3f0e7]/70'
            }`}
            title="Extension Details"
          >
            <Info size={13} />
          </button>
        </div>
      </div>

      {/* Main Interactive GUI Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-white/5 scrollbar-thin p-3 space-y-4">
        {contribViews.some((view: any) => view?.type === 'webview') && (
          <div className={`p-3 rounded-2xl border text-[11px] leading-relaxed ${
            isLight
              ? 'bg-amber-500/10 border-amber-500/25 text-amber-800'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
          }`}>
            This extension creates its webview at runtime through the VS Code extension host. Krypton can
            render packaged webviews, but dynamically generated panels (like Claude Code) need a running
            extension-host UI bridge that is not available yet. Commands below still execute through the
            native host where supported.
          </div>
        )}

        {/* Section 1: Contributed Views */}
        {contribViews.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Contributed Views</p>
            {contribViews.map((v) => (
              <button
                key={v.id}
                onClick={() => setIsDetailModalOpen(true)}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer ${
                  isLight ? 'bg-[#2a2529]/5 border-[#2a2529]/10 hover:bg-[#2a2529]/10' : 'bg-[#f3f0e7]/5 border-[#f3f0e7]/10 hover:bg-[#f3f0e7]/10'
                }`}
              >
                <span className="flex items-center space-x-2 truncate">
                  <Layers size={14} className="text-[#7C9B79]" />
                  <span className="font-medium truncate">{v.name}</span>
                </span>
                <Info size={13} className="opacity-60" />
              </button>
            ))}
          </div>
        ) : (
          <div className={`p-4 rounded-2xl border text-xs ${
            isLight ? 'bg-[#2a2529]/5 border-[#2a2529]/10 text-[#2a2529]/70' : 'bg-[#f3f0e7]/5 border-[#f3f0e7]/10 text-[#f3f0e7]/70'
          }`}>
            This package contributes no views or webview. Its commands and language features will run
            through the native extension host.
          </div>
        )}

        {/* Section 2: Contributed Commands with Live /no-shortcuts Execution */}
        {allCommands.length > 0 && (
          <div className="space-y-2">
            <button
              onClick={() => toggleSection('commands')}
              className={`w-full flex items-center justify-between py-1 text-[11px] font-bold tracking-wider uppercase transition-colors cursor-pointer ${
                isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/70'
              }`}
            >
              <span className="flex items-center space-x-1.5">
                {collapsedSections['commands'] ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                <span>Commands ({allCommands.length})</span>
              </span>
            </button>

            {!collapsedSections['commands'] && (
              <div className="space-y-1.5 max-h-56 overflow-y-auto scrollbar-thin pr-1">
                {allCommands.map((cmd) => (
                  <div
                    key={cmd.command}
                    className={`flex items-center justify-between p-2 rounded-xl border text-xs transition-colors ${
                      isLight ? 'bg-[#2a2529]/5 border-[#2a2529]/10 text-[#2a2529]' : 'bg-[#f3f0e7]/5 border-[#f3f0e7]/10 text-[#f3f0e7]'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-medium truncate">{cmd.title}</div>
                      <div className="text-[10px] font-mono opacity-60 truncate">{cmd.command}</div>
                    </div>
                    <button
                      onClick={() => handleExecuteCommand(cmd.command, cmd.title)}
                      disabled={runningCmd === cmd.command}
                      className={`px-2.5 py-1 rounded-lg flex items-center space-x-1 text-xs font-medium cursor-pointer transition-colors ${
                        isLight
                          ? 'bg-[#2a2529]/10 hover:bg-[#2a2529]/15 text-[#2a2529]'
                          : 'bg-[#f3f0e7]/10 hover:bg-[#f3f0e7]/15 text-[#f3f0e7]'
                      }`}
                      title={`Run ${cmd.title}`}
                    >
                      {runningCmd === cmd.command ? (
                        <RefreshCw size={11} className="animate-spin" />
                      ) : (
                        <Play size={11} className="fill-current" />
                      )}
                      <span>Run</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Section 3: Package Metadata */}
        {(extension || hostExtension) && (
          <div className="space-y-2">
            <button
              onClick={() => toggleSection('info')}
              className={`w-full flex items-center justify-between py-1 text-[11px] font-bold tracking-wider uppercase transition-colors cursor-pointer ${
                isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/70'
              }`}
            >
              <span className="flex items-center space-x-1.5">
                {collapsedSections['info'] ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                <span>Package Metadata</span>
              </span>
            </button>

            {!collapsedSections['info'] && (
              <div className={`p-3 rounded-2xl border text-xs space-y-1.5 ${isLight ? 'bg-[#2a2529]/5 border-[#2a2529]/10' : 'bg-[#f3f0e7]/5 border-[#f3f0e7]/10'}`}>
                <div className="flex justify-between">
                  <span className="opacity-60">Publisher</span>
                  <span className="font-medium">{packagePublisher}</span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-60">Identifier</span>
                  <span className="font-mono text-[11px]">{packageId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-60">Category</span>
                  <span className="capitalize">{packageCategory}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {extension && (
        <ExtensionDetailModal
          extension={extension}
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
        />
      )}
    </div>
  );
}
