import React from 'react';
import { ShieldAlert, Check, X } from 'lucide-react';
import { useTrustStore } from '../../store/useTrustStore';
import { cn } from '../../lib/utils';

export function WorkspaceTrustBanner() {
  const { trustState, isTrustBannerVisible, trustCurrentWorkspace, dismissTrustBanner } = useTrustStore();

  if (trustState !== 'restricted' || !isTrustBannerVisible) {
    return null;
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex items-center justify-between px-3 py-1.5 text-xs font-sans border-b flex-shrink-0 transition-all",
        "bg-amber-950/40 border-amber-500/30 text-amber-200"
      )}
    >
      <div className="flex items-center space-x-2 overflow-hidden">
        <ShieldAlert size={15} className="text-amber-400 flex-shrink-0 animate-pulse" />
        <span className="truncate">
          <strong className="font-semibold text-amber-300">Restricted Mode:</strong> Process execution, external filesystem writes, and privileged extension APIs are disabled.
        </span>
      </div>

      <div className="flex items-center space-x-2 ml-3 flex-shrink-0">
        <button
          onClick={() => trustCurrentWorkspace()}
          className="flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 hover:text-white border border-amber-500/40 transition-colors cursor-pointer text-xs font-medium"
        >
          <Check size={12} />
          <span>Trust Workspace</span>
        </button>
        <button
          onClick={() => dismissTrustBanner()}
          title="Dismiss banner"
          className="p-1 rounded hover:bg-amber-500/20 text-amber-400 hover:text-amber-200 transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
