import React from 'react';
import { ShieldAlert, AlertTriangle, X, Check, ShieldCheck } from 'lucide-react';
import { useTrustStore } from '../../store/useTrustStore';
import { cn } from '../../lib/utils';

export function ExtensionConsentModal() {
  const pending = useTrustStore((s) => s.pendingConsentModal);
  const closeConsentModal = useTrustStore((s) => s.closeConsentModal);

  if (!pending) {
    return null;
  }

  const { extensionId, manifest, permissions, onConfirm, onCancel } = pending;
  const displayName = manifest.displayName || manifest.name || extensionId;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-modal-title"
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div className="bg-[#241f23] border border-[#f3f0e7]/20 rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-[#f3f0e7] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#f3f0e7]/10 bg-black/20">
          <div className="flex items-center space-x-2 text-amber-400">
            <ShieldAlert size={20} />
            <h2 id="consent-modal-title" className="font-semibold text-base">
              Elevated Permission Request
            </h2>
          </div>
          <button
            onClick={closeConsentModal}
            className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto">
          <div>
            <h3 className="font-medium text-sm text-white">
              {displayName}{' '}
              <span className="text-xs text-white/40 font-normal">v{manifest.version}</span>
            </h3>
            <p className="text-xs text-white/60 mt-0.5">
              By <span className="text-white/80">{manifest.publisher}</span> ({extensionId})
            </p>
          </div>

          <div className="bg-amber-950/30 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-200/90 leading-relaxed">
            This extension declares features that require elevated privileges in your workspace. In Restricted mode, these capabilities will only execute if you grant consent.
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white/50">
              Requested Capabilities
            </h4>
            <div className="space-y-2">
              {permissions.map((perm, idx) => (
                <div
                  key={idx}
                  className="bg-black/30 border border-[#f3f0e7]/10 rounded-lg p-3 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white flex items-center space-x-1.5">
                      <AlertTriangle size={13} className="text-amber-400" />
                      <span>{perm.title}</span>
                    </span>
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold",
                        perm.risk === 'high' && "bg-rose-500/20 text-rose-300 border border-rose-500/30",
                        perm.risk === 'medium' && "bg-amber-500/20 text-amber-300 border border-amber-500/30",
                        perm.risk === 'low' && "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                      )}
                    >
                      {perm.risk} risk
                    </span>
                  </div>
                  <p className="text-white/60 text-[11px] pl-5">{perm.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#f3f0e7]/10 bg-black/20 flex items-center justify-end space-x-2">
          <button
            onClick={closeConsentModal}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-lg shadow-emerald-950/40 cursor-pointer"
          >
            <ShieldCheck size={14} />
            <span>Trust & Install</span>
          </button>
        </div>
      </div>
    </div>
  );
}
