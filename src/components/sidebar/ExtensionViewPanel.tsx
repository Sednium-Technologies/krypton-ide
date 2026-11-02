import React, { useState } from 'react';
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Package,
  Layers,
  Info,
} from 'lucide-react';
import { useIdeStore } from '../../store/useIdeStore';
import { useExtensionsStore } from '../../store/useExtensionsStore';
import { ToolIcon } from '../ui/ToolIcon';
import { ExtensionDetailModal } from '../extensions/ExtensionDetailModal';
import { ExtensionWebviewHost } from '../extensions/ExtensionWebviewHost';
import { findExtension } from '../../lib/extensions/extensionRegistry';

export function ExtensionViewPanel() {
  const activeExtensionView = useIdeStore((state) => state.activeExtensionView);
  const theme = useIdeStore((state) => state.theme);
  const isLight = theme === 'light';

  const { customExtensions, installedExtensions, loadFromDisk } = useExtensionsStore();

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [webviewKey, setWebviewKey] = useState(0);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const extension = findExtension(
    { customExtensions, installedExtensions },
    activeExtensionView?.extensionId || ''
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
        {/* Section 1: Contributed Views */}
        {contribViews.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Contributed Views</p>
            {contribViews.map((v) => (
              <button
                key={v.id}
                onClick={() => setIsDetailModalOpen(true)}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs ${
                  isLight ? 'bg-[#2a2529]/5 border-[#2a2529]/10' : 'bg-[#f3f0e7]/5 border-[#f3f0e7]/10'
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
                <p className="text-[11px] opacity-60">
                  Command metadata from this extension. Execution ships with the native extension host.
                </p>
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
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
