import React from 'react';
import { ShieldAlert, Check, X } from 'lucide-react';
import { useTrustStore } from '../../store/useTrustStore';
import { useIdeStore } from '../../store/useIdeStore';
import { cn } from '../../lib/utils';

export function WorkspaceTrustBanner() {
  const { trustState, isTrustBannerVisible, trustCurrentWorkspace, dismissTrustBanner } = useTrustStore();
  const isLight = useIdeStore((state) => state.theme === 'light');

  if (trustState !== 'restricted' || !isTrustBannerVisible) {
    return null;
  }

  return (
    <div
      role="status"
      className={cn(
        "flex items-center justify-between px-3 py-1.5 text-xs font-sans border-b flex-shrink-0 transition-all",
        isLight
          ? "bg-[#f4f0e6] border-[#2a2529]/10 text-[#2a2529]/80"
          : "bg-[#231e22] border-[#f3f0e7]/10 text-[#f3f0e7]/80"
      )}
    >
      <div className="flex items-center space-x-2 overflow-hidden">
        <ShieldAlert size={15} className={cn("flex-shrink-0", isLight ? "text-[#2a2529]/60" : "text-[#f3f0e7]/60")} />
        <span className="truncate">
          <strong className="font-semibold">Restricted mode:</strong> Process execution, external writes, and privileged extension APIs are disabled.
        </span>
      </div>

      <div className="flex items-center space-x-2 ml-3 flex-shrink-0">
        <button
          onClick={() => trustCurrentWorkspace()}
          className={cn(
            "flex items-center space-x-1 px-2 py-0.5 rounded border transition-colors cursor-pointer text-xs font-medium",
            isLight
              ? "bg-white border-[#2a2529]/15 text-[#2a2529] hover:bg-[#e8e4d9]"
              : "bg-[#342f33] border-[#f3f0e7]/15 text-[#f3f0e7] hover:bg-[#3d373c]"
          )}
        >
          <Check size={12} />
          <span>Trust Workspace</span>
        </button>
        <button
          onClick={() => dismissTrustBanner()}
          title="Dismiss banner"
          className={cn(
            "p-1 rounded transition-colors cursor-pointer",
            isLight
              ? "hover:bg-[#2a2529]/10 text-[#2a2529]/50 hover:text-[#2a2529]"
              : "hover:bg-[#f3f0e7]/10 text-[#f3f0e7]/50 hover:text-[#f3f0e7]"
          )}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
