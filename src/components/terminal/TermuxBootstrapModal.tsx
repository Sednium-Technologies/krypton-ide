import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Terminal,
  X,
  CheckCircle2,
  Download,
  RotateCw,
  Folder,
  Cpu,
  Package,
  Layers,
  Check,
  ArrowRight,
} from 'lucide-react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useNativeTerminalStore } from '../../store/useNativeTerminalStore';

export interface TermuxBootstrapModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ToolStatus {
  name: string;
  command: string;
  description: string;
  isInstalled: boolean;
}

export function TermuxBootstrapModal({ isOpen, onClose }: TermuxBootstrapModalProps) {
  const {
    bootstrapStatus,
    bootstrapProgress,
    isInstallingBootstrap,
    checkBootstrapStatus,
    installBootstrap,
  } = useNativeTerminalStore();

  useEffect(() => {
    if (isOpen) {
      checkBootstrapStatus();
    }
  }, [isOpen, checkBootstrapStatus]);

  const handleClose = () => {
    try {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    } catch {}
    onClose();
  };

  const handleInstall = async () => {
    try {
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    } catch {}
    await installBootstrap();
  };

  const isInstalled = bootstrapStatus?.installed ?? false;

  const tools: ToolStatus[] = [
    {
      name: 'Python 3',
      command: 'python3',
      description: 'CPython runtime & pip package manager',
      isInstalled: bootstrapStatus?.hasPython ?? false,
    },
    {
      name: 'Rust & Cargo',
      command: 'rustc, cargo',
      description: 'Rust compiler, cargo build & crates',
      isInstalled: bootstrapStatus?.hasRust ?? false,
    },
    {
      name: 'C/C++ Clang',
      command: 'clang',
      description: 'LLVM Clang compiler toolchain & make',
      isInstalled: bootstrapStatus?.hasClang ?? false,
    },
    {
      name: 'Node.js & npm',
      command: 'node',
      description: 'V8 JavaScript runtime & package manager',
      isInstalled: bootstrapStatus?.hasNode ?? false,
    },
    {
      name: 'Git',
      command: 'git',
      description: 'Distributed version control system',
      isInstalled: isInstalled,
    },
  ];

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-3 sm:p-4 pointer-events-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={isInstallingBootstrap ? undefined : handleClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          {/* Modal Dialog Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 14 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl bg-[#231e22] border border-[#f3f0e7]/10 shadow-[0_25px_60px_rgba(0,0,0,0.65)] overflow-hidden text-[#f3f0e7]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#f3f0e7]/10 bg-[#2a2529]/60 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-[#342f33] border border-[#f3f0e7]/10 flex items-center justify-center text-[#f3f0e7]">
                  <Terminal size={18} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[#f3f0e7] leading-tight">
                    Linux &amp; Termux Subsystem
                  </h3>
                  <div className="flex items-center space-x-2 mt-0.5">
                    {isInstalled ? (
                      <span className="inline-flex items-center space-x-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                        <CheckCircle2 size={11} className="mr-0.5" /> Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 text-[11px] font-medium text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full">
                        Installation Available
                      </span>
                    )}
                    {bootstrapStatus?.arch && (
                      <span className="text-[11px] text-[#f3f0e7]/40 font-mono">
                        {bootstrapStatus.arch}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {!isInstallingBootstrap && (
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-full p-1.5 text-[#f3f0e7]/60 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10 transition-colors"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Scrollable Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Description */}
              <p className="text-xs sm:text-sm text-[#f3f0e7]/75 leading-relaxed">
                Offline on-device toolchain for compiling and running Python, Rust, C/C++,
                Node.js, and any Termux package.
              </p>

              {/* Status Banner / Quick Instructions */}
              {isInstalled ? (
                <div className="p-4 rounded-xl bg-[#342f33] border border-emerald-500/30 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                          Subsystem Active
                        </span>
                      </div>
                      <div className="flex items-center space-x-1.5 text-[11px] text-[#f3f0e7]/60 font-mono break-all">
                        <Folder size={12} className="shrink-0 text-[#f3f0e7]/40" />
                        <span>{bootstrapStatus?.prefixPath || '/data/data/com.sednium.kryptonide.legacy/files/usr'}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleInstall}
                      disabled={isInstallingBootstrap}
                      className="px-2.5 py-1 text-xs text-[#f3f0e7]/70 hover:text-[#f3f0e7] bg-[#231e22] hover:bg-[#2a2529] border border-[#f3f0e7]/10 rounded-lg flex items-center space-x-1 transition-colors disabled:opacity-50"
                      title="Reinstall or update bootstrap rootfs"
                    >
                      <RotateCw size={12} />
                      <span>Reinstall</span>
                    </button>
                  </div>

                  {/* Quick Usage Commands */}
                  <div className="pt-2 border-t border-[#f3f0e7]/10 space-y-2">
                    <span className="text-[11px] font-semibold text-[#f3f0e7]/50 uppercase tracking-wider">
                      Quick Commands in Terminal:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                      <div className="px-2.5 py-1.5 rounded-lg bg-[#231e22]/90 border border-[#f3f0e7]/5 text-[#f3f0e7]/90 flex items-center justify-between">
                        <span>pkg install python</span>
                        <ArrowRight size={12} className="text-[#f3f0e7]/30" />
                      </div>
                      <div className="px-2.5 py-1.5 rounded-lg bg-[#231e22]/90 border border-[#f3f0e7]/5 text-[#f3f0e7]/90 flex items-center justify-between">
                        <span>pip install &lt;package&gt;</span>
                        <ArrowRight size={12} className="text-[#f3f0e7]/30" />
                      </div>
                      <div className="px-2.5 py-1.5 rounded-lg bg-[#231e22]/90 border border-[#f3f0e7]/5 text-[#f3f0e7]/90 flex items-center justify-between">
                        <span>pkg install rust</span>
                        <ArrowRight size={12} className="text-[#f3f0e7]/30" />
                      </div>
                      <div className="px-2.5 py-1.5 rounded-lg bg-[#231e22]/90 border border-[#f3f0e7]/5 text-[#f3f0e7]/90 flex items-center justify-between">
                        <span>pkg install clang</span>
                        <ArrowRight size={12} className="text-[#f3f0e7]/30" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Not installed banner / Download card */
                <div className="p-4 rounded-xl bg-[#342f33] border border-[#f3f0e7]/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Package size={18} className="text-amber-400" />
                      <span className="text-sm font-semibold text-[#f3f0e7]">
                        Termux Rootfs Bootstrap
                      </span>
                    </div>
                    <span className="text-xs text-[#f3f0e7]/60 font-mono bg-[#231e22] px-2 py-0.5 rounded border border-[#f3f0e7]/5">
                      ~50 MB download
                    </span>
                  </div>

                  <p className="text-xs text-[#f3f0e7]/70 leading-relaxed">
                    Downloads and extracts the standalone Linux rootfs into internal app storage.
                    Includes Bash 5, Coreutils, BusyBox, Clang, Python, and the APT/dpkg package
                    manager for completely offline development.
                  </p>

                  {/* Progress Indicator when installing */}
                  {isInstallingBootstrap && (
                    <div className="space-y-2 pt-2 border-t border-[#f3f0e7]/10">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#f3f0e7]/80 truncate mr-2">
                          {bootstrapProgress?.message || 'Installing Termux bootstrap...'}
                        </span>
                        <span className="font-mono font-bold text-emerald-400">
                          {Math.round(bootstrapProgress?.progress || 0)}%
                        </span>
                      </div>

                      {/* Progress bar track */}
                      <div className="w-full h-2 rounded-full bg-[#231e22] overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 transition-all duration-300 rounded-full"
                          style={{ width: `${Math.max(4, bootstrapProgress?.progress || 0)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Install Button */}
                  <button
                    type="button"
                    onClick={handleInstall}
                    disabled={isInstallingBootstrap}
                    className="w-full py-3 px-4 rounded-xl bg-[#f3f0e7] text-[#2a2529] font-semibold text-sm hover:bg-white flex items-center justify-center space-x-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 shadow-md"
                  >
                    {isInstallingBootstrap ? (
                      <>
                        <RotateCw size={16} className="animate-spin" />
                        <span>Installing Bootstrap...</span>
                      </>
                    ) : (
                      <>
                        <Download size={16} />
                        <span>Install Full Ecosystem</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Tools Status Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#f3f0e7]/50 flex items-center space-x-1.5">
                    <Layers size={13} />
                    <span>Toolchain &amp; Runtimes</span>
                  </h4>
                  <span className="text-[11px] text-[#f3f0e7]/40">
                    {tools.filter((t) => t.isInstalled).length} of {tools.length} active
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {tools.map((tool) => (
                    <div
                      key={tool.name}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#342f33]/60 border border-[#f3f0e7]/5 hover:bg-[#342f33] transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-medium text-[#f3f0e7]">
                            {tool.name}
                          </span>
                          <span className="text-[10px] font-mono text-[#f3f0e7]/50 bg-[#231e22] px-1.5 py-0.2 rounded">
                            {tool.command}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#f3f0e7]/50">{tool.description}</p>
                      </div>

                      <div className="shrink-0 ml-3">
                        {tool.isInstalled ? (
                          <span className="inline-flex items-center text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                            <Check size={10} className="mr-1" /> Installed
                          </span>
                        ) : isInstalled ? (
                          <button
                            type="button"
                            onClick={() => {
                              handleClose();
                              useNativeTerminalStore.getState().setActiveTab('system');
                              useNativeTerminalStore.getState().sendInput(`pkg install ${tool.command.split(',')[0].trim()} -y\n`, 'system');
                            }}
                            className="inline-flex items-center text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 active:scale-95 px-2 py-0.5 rounded-full border border-emerald-500/30 transition-all cursor-pointer"
                            title={`Install ${tool.name} with pkg`}
                          >
                            + Install
                          </button>
                        ) : (
                          <span className="inline-flex items-center text-[10px] font-medium text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                            Available
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[#f3f0e7]/10 bg-[#2a2529]/40 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2 text-[11px] text-[#f3f0e7]/40">
                <Cpu size={13} />
                <span>Rootless Userland via Android Bionic PTY</span>
              </div>

              <button
                type="button"
                onClick={handleClose}
                disabled={isInstallingBootstrap}
                className="px-4 py-1.5 rounded-lg text-xs font-medium text-[#f3f0e7]/70 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10 transition-colors disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
