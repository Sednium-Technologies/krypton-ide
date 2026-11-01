import React, { useState } from 'react';
import {
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Package,
  Layers,
  Terminal,
  Play,
  Settings,
  Info,
  CheckCircle2,
  Cpu,
} from 'lucide-react';
import { useIdeStore } from '../../store/useIdeStore';
import { useExtensionsStore, EXTENSIONS_CATALOG } from '../../store/useExtensionsStore';
import { useNativeTerminalStore } from '../../store/useNativeTerminalStore';
import { useToastStore } from '../../store/useToastStore';
import { ToolIcon } from '../ui/ToolIcon';
import { ExtensionDetailModal } from '../extensions/ExtensionDetailModal';
import { ExtensionWebviewHost } from '../extensions/ExtensionWebviewHost';

export function ExtensionViewPanel() {
  const activeExtensionView = useIdeStore((state) => state.activeExtensionView);
  const theme = useIdeStore((state) => state.theme);
  const isLight = theme === 'light';

  const { setIsTerminalOpen } = useIdeStore();
  const { customExtensions, installedExtensions } = useExtensionsStore();
  const allInstalled = [...EXTENSIONS_CATALOG, ...customExtensions].filter((e) =>
    installedExtensions.includes(e.id)
  );

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const targetId = activeExtensionView?.extensionId || '';
  const extension =
    allInstalled.find(
      (e) => e.id === targetId || e.id.toLowerCase().includes(targetId.toLowerCase())
    ) ||
    customExtensions.find(
      (e) => e.id === targetId || e.id.toLowerCase().includes(targetId.toLowerCase())
    ) ||
    EXTENSIONS_CATALOG.find(
      (e) => e.id === targetId || e.id.toLowerCase().includes(targetId.toLowerCase())
    );

  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      useToastStore.getState().success(`${activeExtensionView?.title || 'Extension'} synchronized`);
    }, 450);
  };

  const handleLaunchInTerminal = (commandName?: string) => {
    setIsTerminalOpen(true);
    const cmd = commandName || (extension?.id.includes('claude') ? 'claude' : extension?.name.toLowerCase()) || 'help';
    try {
      useNativeTerminalStore.getState().sendInput(`${cmd}\n`);
      useToastStore.getState().info(`Launched ${cmd} in native terminal`);
    } catch {
      useToastStore.getState().info('Terminal panel opened');
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
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
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
  const contribViews = extension?.activityBarContributions?.flatMap((c) => c.views || []) || [];

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
            v{extension?.version || '1.0'}
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
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
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
        {/* Status & Runtime Health Card */}
        <div className={`p-3 rounded-2xl border ${isLight ? 'bg-white/80 border-[#2a2529]/10' : 'bg-[#2a2529] border-[#f3f0e7]/10'} shadow-sm`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#7C9B79] flex items-center gap-1.5">
              <CheckCircle2 size={13} /> Active Service
            </span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${isLight ? 'bg-[#7C9B79]/10 text-[#7C9B79]' : 'bg-[#7C9B79]/20 text-[#7C9B79]'}`}>
              Ready
            </span>
          </div>
          <p className={`text-xs ${isLight ? 'text-[#2a2529]/75' : 'text-[#f3f0e7]/75'}`}>
            {extension?.description || 'Interactive background extension service.'}
          </p>
        </div>

        {/* Section 1: Contributed Views */}
        <div className="space-y-2">
          <button
            onClick={() => toggleSection('views')}
            className={`w-full flex items-center justify-between py-1 text-[11px] font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/70'
            }`}
          >
            <span className="flex items-center space-x-1.5">
              {collapsedSections['views'] ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              <span>Contributed Views ({contribViews.length})</span>
            </span>
          </button>

          {!collapsedSections['views'] && (
            <div className="space-y-1.5">
              {contribViews.length > 0 ? (
                contribViews.map((v) => (
                  <div
                    key={v.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-colors ${
                      isLight ? 'bg-[#2a2529]/5 border-[#2a2529]/10 text-[#2a2529]' : 'bg-[#f3f0e7]/5 border-[#f3f0e7]/10 text-[#f3f0e7]'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <Layers size={14} className="text-[#7C9B79] shrink-0" />
                      <span className="font-medium truncate">{v.name}</span>
                    </div>
                    <button
                      onClick={() => handleLaunchInTerminal(v.id)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold ${isLight ? 'bg-[#2a2529] text-[#f4f0e6]' : 'bg-[#f3f0e7] text-[#2a2529]'}`}
                    >
                      Inspect
                    </button>
                  </div>
                ))
              ) : (
                <div className={`p-3 text-center rounded-xl text-xs border ${
                  isLight ? 'bg-[#2a2529]/5 border-[#2a2529]/10 text-[#2a2529]/60' : 'bg-[#f3f0e7]/5 border-[#f3f0e7]/10 text-[#f3f0e7]/60'
                }`}>
                  Extension operates as an autonomous background tool service.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section: Contributed Commands */}
        {extension?.contributedCommands && extension.contributedCommands.length > 0 && (
          <div className="space-y-2">
            <button
              onClick={() => toggleSection('commands')}
              className={`w-full flex items-center justify-between py-1 text-[11px] font-bold tracking-wider uppercase transition-colors cursor-pointer ${
                isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/70'
              }`}
            >
              <span className="flex items-center space-x-1.5">
                {collapsedSections['commands'] ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                <span>Commands ({extension.contributedCommands.length})</span>
              </span>
            </button>

            {!collapsedSections['commands'] && (
              <div className="space-y-1.5 max-h-56 overflow-y-auto scrollbar-thin pr-1">
                {extension.contributedCommands.map((cmd) => (
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
                      onClick={() => handleLaunchInTerminal(cmd.command)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 cursor-pointer active:scale-95 transition-transform ${isLight ? 'bg-[#2a2529] text-[#f4f0e6]' : 'bg-[#f3f0e7] text-[#2a2529]'}`}
                    >
                      Run
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Section 2: Quick Actions & Execution */}
        <div className="space-y-2">
          <button
            onClick={() => toggleSection('actions')}
            className={`w-full flex items-center justify-between py-1 text-[11px] font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/70'
            }`}
          >
            <span className="flex items-center space-x-1.5">
              {collapsedSections['actions'] ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              <span>Interactive Actions</span>
            </span>
          </button>

          {!collapsedSections['actions'] && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleLaunchInTerminal()}
                className={`flex items-center justify-center space-x-2 px-3 py-2.5 rounded-xl text-xs font-semibold active:scale-95 transition-all cursor-pointer ${
                  isLight ? 'bg-[#2a2529] text-[#f4f0e6]' : 'bg-[#f3f0e7] text-[#2a2529]'
                }`}
              >
                <Terminal size={14} />
                <span>Launch CLI</span>
              </button>
              <button
                onClick={() => handleRefresh()}
                className={`flex items-center justify-center space-x-2 px-3 py-2.5 rounded-xl text-xs font-semibold border active:scale-95 transition-all cursor-pointer ${
                  isLight ? 'border-[#2a2529]/20 text-[#2a2529]' : 'border-[#f3f0e7]/20 text-[#f3f0e7]'
                }`}
              >
                <RefreshCw size={14} />
                <span>Sync State</span>
              </button>
            </div>
          )}
        </div>

        {/* Section 3: Package Metadata */}
        {extension && (
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
                  <span className="font-medium">{extension.publisher}</span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-60">Identifier</span>
                  <span className="font-mono text-[11px]">{extension.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-60">Category</span>
                  <span className="capitalize">{extension.category}</span>
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
