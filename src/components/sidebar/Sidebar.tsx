import React from 'react';
import { useIdeStore } from '../../store/useIdeStore';
import { useIsLandscape } from '../../hooks/useIsLandscape';
import { FileExplorer } from './FileExplorer';
import { AiAssistant } from './AiAssistant';
import { SettingsPanel } from './SettingsPanel';
import { GitPanel } from './GitPanel';
import { ExtensionsPanel } from './ExtensionsPanel';
import { ExtensionViewPanel } from './ExtensionViewPanel';
import { SearchPanel } from './SearchPanel';
import { Files, Search, GitBranch, Bot, Puzzle, Settings } from 'lucide-react';

export function Sidebar() {
  const sidebarView = useIdeStore((state) => state.sidebarView);
  const activeExtensionView = useIdeStore((state) => state.activeExtensionView);
  const setSidebarView = useIdeStore((state) => state.setSidebarView);
  const theme = useIdeStore((state) => state.theme);
  const isLight = theme === 'light';
  const isLandscape = useIsLandscape();
  const isSideNav = isLandscape || (typeof window !== 'undefined' && window.innerWidth >= 600);

  const tabs = [
    { id: 'explorer', label: 'Explorer', icon: Files },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'git', label: 'Git', icon: GitBranch },
    { id: 'ai', label: 'AI', icon: Bot },
    { id: 'extensions', label: 'Extensions', icon: Puzzle },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  const titles: Record<string, string> = {
    explorer: 'Explorer',
    search: 'Search Files',
    git: 'Source Control',
    ai: 'AI Assistant',
    extensions: 'Extensions',
    settings: 'Settings',
    'extension-view': activeExtensionView?.title || 'Extension',
  };

  return (
    <div className={`flex h-full flex-col transition-colors ${isLight ? 'bg-[#f4f0e6] text-[#2a2529]' : 'bg-[#2a2529] text-[#f3f0e7]'}`}>
      {/* Show category header ONLY in mobile portrait, and NOT when extension-view */}
      {!isSideNav && sidebarView !== 'extension-view' && (
        <div className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border-b flex items-center justify-between shrink-0 ${
          isLight ? 'text-[#2a2529] border-[#2a2529]/10 bg-[#f4f0e6]' : 'text-[#f3f0e7] border-[#f3f0e7]/10 bg-[#231e22]'
        }`}>
          <span className={`text-[11px] font-bold ${isLight ? 'text-[#2a2529]/75' : 'text-[#f3f0e7]/75'}`}>{titles[sidebarView] || sidebarView}</span>
          <div role="tablist" aria-label="Sidebar view switcher" className="flex items-center space-x-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = sidebarView === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  aria-label={tab.label}
                  title={tab.label}
                  onClick={() => setSidebarView(tab.id)}
                  className={`p-1 rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                    isLight
                      ? (isActive
                          ? 'bg-[#2a2529]/10 text-[#2a2529] focus-visible:ring-[#2a2529]/40'
                          : 'text-[#2a2529]/60 hover:text-[#2a2529] hover:bg-[#2a2529]/5 focus-visible:ring-[#2a2529]/30')
                      : (isActive
                          ? 'bg-[#f3f0e7]/15 text-[#f3f0e7] focus-visible:ring-[#f3f0e7]/50'
                          : 'text-[#f3f0e7]/70 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10 focus-visible:ring-[#f3f0e7]/50')
                  }`}
                >
                  <Icon size={14} />
                </button>
              );
            })}
          </div>
        </div>
      )}
      
      <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
        {sidebarView === 'explorer' && <FileExplorer />}
        {sidebarView === 'search' && <SearchPanel />}
        {sidebarView === 'git' && <GitPanel />}
        {sidebarView === 'ai' && <AiAssistant />}
        {sidebarView === 'extensions' && <ExtensionsPanel />}
        {sidebarView === 'settings' && <SettingsPanel />}
        {sidebarView === 'extension-view' && <ExtensionViewPanel />}
      </div>
    </div>
  );
}
