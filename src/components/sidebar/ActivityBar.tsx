import React from 'react';
import { Files, Search, GitBranch, Bot, Settings, Puzzle } from 'lucide-react';
import { useIdeStore } from '../../store/useIdeStore';
import { useNavbarStore } from '../../store/useNavbarStore';
import { ToolIcon } from '../ui/ToolIcon';
import { cn } from '../../lib/utils';

export function ActivityBar() {
  const { sidebarView, setSidebarView, isSidebarOpen, toggleSidebar, theme } = useIdeStore();
  const isLight = theme === 'light';
  const tools = useNavbarStore((state) => state.tools);
  const executeTool = useNavbarStore((state) => state.executeTool);
  const isToolActive = useNavbarStore((state) => state.isToolActive);

  // Extension contributed activity bar tools
  const customTools = Object.values(tools).filter((t) => t.isCustom);

  const handleIconClick = (view: 'explorer' | 'search' | 'git' | 'ai' | 'extensions' | 'settings') => {
    if (sidebarView === view && isSidebarOpen) {
      toggleSidebar();
    } else {
      setSidebarView(view);
    }
  };

  const IconWrapper = ({ view, icon: Icon, title }: { view: string; icon: any; title: string }) => {
    const isActive = sidebarView === view && isSidebarOpen;
    return (
      <button 
        role="tab"
        aria-selected={isActive}
        aria-label={title}
        className={cn(
          "flex h-12 w-12 cursor-pointer items-center justify-center relative transition-colors focus-visible:ring-2 focus-visible:outline-none",
          isLight
            ? (isActive ? "text-[#2a2529] bg-[#2a2529]/8" : "text-[#2a2529]/60 hover:text-[#2a2529] hover:bg-[#2a2529]/5 focus-visible:ring-[#2a2529]/30")
            : (isActive ? "text-[#f3f0e7] bg-[#f3f0e7]/5" : "text-[#f3f0e7]/60 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/5 focus-visible:ring-[#f3f0e7]/40")
        )}
        onClick={() => handleIconClick(view as any)}
        title={title}
      >
        {isActive && (
          <div className={cn("absolute left-0 top-0 h-full w-[2px]", isLight ? "bg-[#2a2529]" : "bg-[#f3f0e7]")} />
        )}
        <Icon size={22} strokeWidth={1.5} />
      </button>
    );
  };

  return (
    <div 
      role="tablist"
      aria-label="Activity bar navigation"
      className={cn(
        "flex w-12 flex-col items-center border-r py-2 flex-shrink-0 transition-colors select-none",
        isLight ? "bg-[#f4f0e6] border-[#2a2529]/10 text-[#2a2529]" : "bg-[#231e22] border-[#f3f0e7]/10 text-[#f3f0e7]"
      )}
    >
      <IconWrapper view="explorer" icon={Files} title="Explorer" />
      <IconWrapper view="search" icon={Search} title="Search" />
      <IconWrapper view="git" icon={GitBranch} title="Source Control" />
      <IconWrapper view="ai" icon={Bot} title="AI Assistant" />
      <IconWrapper view="extensions" icon={Puzzle} title="Extensions" />
      
      {/* Contributed tools from extensions (e.g. Claude Code) */}
      {customTools.map((tool) => {
        const active = isToolActive(tool.id);
        return (
          <button
            key={tool.id}
            role="tab"
            aria-selected={active}
            aria-label={tool.label}
            className={cn(
              "flex h-12 w-12 cursor-pointer items-center justify-center relative transition-colors focus-visible:ring-2 focus-visible:outline-none",
              isLight
                ? (active ? "text-[#2a2529] bg-[#2a2529]/8" : "text-[#2a2529]/60 hover:text-[#2a2529] hover:bg-[#2a2529]/5 focus-visible:ring-[#2a2529]/30")
                : (active ? "text-[#f3f0e7] bg-[#f3f0e7]/5" : "text-[#f3f0e7]/60 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/5 focus-visible:ring-[#f3f0e7]/40")
            )}
            onClick={() => executeTool(tool.id)}
            title={tool.label}
          >
            {active && (
              <div className={cn("absolute left-0 top-0 h-full w-[2px]", isLight ? "bg-[#2a2529]" : "bg-[#f3f0e7]")} />
            )}
            <ToolIcon icon={tool.icon} size={20} />
          </button>
        );
      })}

      <div className="mt-auto">
        <IconWrapper view="settings" icon={Settings} title="Settings" />
      </div>
    </div>
  );
}
