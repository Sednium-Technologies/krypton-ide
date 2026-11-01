import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  Download,
  Trash2,
  Check,
  Star,
  Palette,
  Code2,
  Sparkles,
  Puzzle,
  FileCode2,
  Upload,
  X,
  Terminal,
  Loader2,
  Clock,
  Package,
  ArrowUpDown,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  useExtensionsStore,
  MONACO_THEMES,
  applyMonacoTheme,
  type Extension,
} from '../../store/useExtensionsStore';
import {
  searchOpenVsx,
  formatDownloadCount,
  formatRating,
  type MarketplaceExtension,
} from '../../lib/marketplaceService';
import { ExtensionDetailModal } from '../extensions/ExtensionDetailModal';
import { useToastStore } from '../../store/useToastStore';
import { getInstalledExtensions } from '../../lib/extensions/extensionRegistry';

function ExtensionIcon({ icon, category }: { icon?: string; category?: string }) {
  const iconProps = { size: 18 };
  if (category === 'theme' || icon === 'palette') return <Palette {...iconProps} className="text-amber-400" />;
  if (category === 'language' || icon === 'code') return <Code2 {...iconProps} className="text-blue-400" />;
  if (category === 'formatter' || icon === 'file-code') return <FileCode2 {...iconProps} className="text-orange-400" />;
  if (category === 'snippet' || icon === 'atom') return <Code2 {...iconProps} className="text-emerald-400" />;
  if (category === 'productivity' || icon === 'puzzle') return <Puzzle {...iconProps} className="text-purple-400" />;

  switch (icon) {
    case 'moon':
      return <Palette {...iconProps} className="text-purple-400" />;
    case 'sparkles':
      return <Sparkles {...iconProps} className="text-yellow-400" />;
    case 'terminal':
      return <Terminal {...iconProps} className="text-emerald-400" />;
    default:
      return <Package {...iconProps} className="text-teal-400" />;
  }
}

function ExtensionCardIcon({ ext }: { ext: MarketplaceExtension | Extension }) {
  const [hasError, setHasError] = useState(false);
  const iconUrl = (ext as any)?.iconUrl || (ext as any)?.files?.icon;

  if (iconUrl && !hasError) {
    return (
      <img
        src={iconUrl}
        alt={ext?.name || 'Extension'}
        onError={() => setHasError(true)}
        className="w-10 h-10 rounded-xl object-cover bg-[#231e22] border border-[#f3f0e7]/10 shrink-0 mt-0.5"
      />
    );
  }

  return (
    <div className="w-10 h-10 rounded-xl bg-[#231e22] border border-[#f3f0e7]/10 flex items-center justify-center shrink-0 mt-0.5">
      <ExtensionIcon icon={(ext as any)?.icon} category={(ext as any)?.category} />
    </div>
  );
}

const CATEGORIES = [
  { id: 'all', label: 'All', icon: Sparkles },
  { id: 'theme', label: 'Themes', icon: Palette },
  { id: 'language', label: 'Languages', icon: Code2 },
  { id: 'formatter', label: 'Formatters', icon: FileCode2 },
  { id: 'snippet', label: 'Snippets', icon: Code2 },
  { id: 'productivity', label: 'Tools', icon: Puzzle },
] as const;

const SORT_OPTIONS = [
  { id: 'relevance', label: 'Relevance', icon: Sparkles },
  { id: 'downloadCount', label: 'Most Downloaded', icon: Download },
  { id: 'rating', label: 'Highest Rated', icon: Star },
  { id: 'timestamp', label: 'Recently Updated', icon: Clock },
] as const;

function ExtensionsPanelContent() {
  const [mainTab, setMainTab] = useState<'marketplace' | 'installed'>('marketplace');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('relevance');
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // Open VSX search results
  const [marketplaceResults, setMarketplaceResults] = useState<MarketplaceExtension[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // Modals
  const [selectedExtension, setSelectedExtension] = useState<MarketplaceExtension | Extension | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedLogsId, setSelectedLogsId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    installedExtensions,
    customExtensions,
    installProgress,
    installLogs,
    installExtension,
    installFromFile,
    installFromOpenVsx,
    uninstallExtension,
    activeThemeExtension,
    activeIconTheme,
    setActiveThemeExtension,
    setActiveIconTheme,
    loadFromDisk,
  } = useExtensionsStore();

  useEffect(() => {
    loadFromDisk();
  }, [loadFromDisk]);

  // 300ms debounce for search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Query Open VSX when debouncedQuery, activeCategory, or sortBy changes
  useEffect(() => {
    if (mainTab !== 'marketplace') return;

    let isMounted = true;
    setIsSearching(true);
    setSearchError(null);

    searchOpenVsx(debouncedQuery, activeCategory, sortBy, 0, 30)
      .then((res) => {
        if (isMounted) {
          setMarketplaceResults(res.extensions);
          setIsSearching(false);
        }
      })
      .catch((err) => {
        console.warn('Failed to query Open VSX:', err);
        if (isMounted) {
          setSearchError('Could not reach Open VSX registry.');
          setIsSearching(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedQuery, activeCategory, sortBy, mainTab, retryNonce]);

  // Restore active theme on mount
  useEffect(() => {
    if (activeThemeExtension) {
      applyMonacoTheme(activeThemeExtension);
    }
  }, [activeThemeExtension]);

  const installedList = useMemo(
    () => getInstalledExtensions({ customExtensions, installedExtensions }),
    [customExtensions, installedExtensions]
  );

  const allInstalledList = useMemo(() => {
    if (!debouncedQuery.trim()) return installedList;
    const q = debouncedQuery.toLowerCase();
    return installedList.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.publisher.toLowerCase().includes(q)
    );
  }, [installedList, debouncedQuery]);

  const handleOpenDetail = (ext: MarketplaceExtension | Extension) => {
    setSelectedExtension(ext);
    setIsDetailModalOpen(true);
  };

  const handleInstallClick = async (e: React.MouseEvent, ext: MarketplaceExtension | Extension) => {
    e.stopPropagation();
    if ('namespace' in ext && ext.namespace) {
      await installFromOpenVsx(ext as MarketplaceExtension);
    } else {
      const localExt = ext as Extension;
      await installExtension(localExt.id);
      if (localExt.category === 'theme' && localExt.monacoThemeId) {
        applyMonacoTheme(localExt.monacoThemeId);
        setActiveThemeExtension(localExt.id);
      }
    }
  };


  const isThemeActive = (ext: any) => {
    if (!ext) return false;
    const extId = ext.id || `${ext.namespace}.${ext.name}`;
    const isColorTheme = Boolean(
      extId && (
        activeThemeExtension === extId ||
        (!!ext.monacoThemeId && activeThemeExtension === ext.monacoThemeId)
      )
    );
    const isIconTheme = Boolean(
      activeIconTheme && (
        (ext.iconThemeId && activeIconTheme === ext.iconThemeId) ||
        (extId && activeIconTheme === extId) ||
        ((extId?.includes('material') || ext.name?.toLowerCase().includes('material icon')) &&
         (activeIconTheme === 'material' || activeIconTheme === 'material-icon-theme' || activeIconTheme.includes('material')))
      )
    );
    return isColorTheme || isIconTheme;
  };

  const handleApplyThemeClick = (e: React.MouseEvent, ext: Extension) => {
    e.stopPropagation();
    const isIconTheme = Boolean(
      ext.iconThemeId ||
      ext.id?.toLowerCase().includes('icon') ||
      ext.name?.toLowerCase().includes('icon')
    );
    if (isIconTheme) {
      let themeId = ext.iconThemeId || ext.id;
      if (themeId.includes('material') || ext.name?.toLowerCase().includes('material')) {
        themeId = 'material';
      }
      setActiveIconTheme(themeId);
      const displayName = ext.name?.toLowerCase().endsWith('theme') ? ext.name : `${ext.name} Theme`;
      useToastStore.getState().success(`Applied ${displayName}`);
      return;
    }
    if (!ext.monacoThemeId) return;
    applyMonacoTheme(ext.monacoThemeId);
    setActiveThemeExtension(ext.id);
    const displayName = ext.name?.toLowerCase().endsWith('theme') ? ext.name : `${ext.name} Theme`;
    useToastStore.getState().success(`Applied ${displayName}`);
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const installed = await installFromFile(file);
    if (installed) {
      setSelectedLogsId(installed.id);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isInstalled = (id: string) => installedExtensions.includes(id);

  const currentSortObj = SORT_OPTIONS.find((s) => s.id === sortBy) || SORT_OPTIONS[0];
  const CurrentSortIcon = currentSortObj.icon;

  return (
    <div className="flex h-full flex-col bg-[#2a2529] text-[#f3f0e7]">
      {/* Header Search & Actions */}
      <div className="p-3 border-b border-[#f3f0e7]/10 bg-[#231e22] space-y-2.5">
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-3 text-[#f3f0e7]/60" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Open VSX extensions & themes..."
              aria-label="Search Open VSX extensions and themes"
              className="w-full bg-[#342f33] border border-[#f3f0e7]/15 rounded-2xl py-2 pl-9 pr-8 text-xs text-[#f3f0e7] placeholder-[#f3f0e7]/40 focus:border-teal-400/60 focus:outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-[#f3f0e7]/50 hover:text-[#f3f0e7] p-0.5 rounded-full"
                aria-label="Clear search query"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".vsix,.zip"
            className="hidden"
            onChange={handleFilePicked}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-1.5 px-3 py-2 bg-[#342f33] hover:bg-[#453d43] border border-[#f3f0e7]/15 rounded-2xl text-xs font-semibold text-[#f3f0e7] active:scale-95 transition-all shadow-sm shrink-0 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
            aria-label="Install extension from .vsix file"
            title="Install from local .vsix file"
          >
            <Upload size={13} className="text-teal-400" />
            <span className="hidden sm:inline">Install .vsix</span>
          </button>
        </div>

        {/* Dual Tab Mode Switcher: Marketplace vs Installed */}
        <div className="flex p-1 bg-[#1c181b] rounded-2xl border border-[#f3f0e7]/10">
          <button
            onClick={() => setMainTab('marketplace')}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              mainTab === 'marketplace'
                ? 'bg-[#342f33] text-teal-300 shadow-sm border border-[#f3f0e7]/10'
                : 'text-[#f3f0e7]/60 hover:text-[#f3f0e7]'
            }`}
          >
            <Sparkles size={12} />
            <span>Marketplace</span>
          </button>
          <button
            onClick={() => setMainTab('installed')}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              mainTab === 'installed'
                ? 'bg-[#342f33] text-teal-300 shadow-sm border border-[#f3f0e7]/10'
                : 'text-[#f3f0e7]/60 hover:text-[#f3f0e7]'
            }`}
          >
            <Check size={12} />
            <span>Installed ({installedExtensions.length})</span>
          </button>
        </div>
      </div>

      {/* Category Filters and Sorting (Visible in Marketplace Tab) */}
      {mainTab === 'marketplace' && (
        <div className="border-b border-[#f3f0e7]/10 bg-[#231e22] px-2 py-1.5 flex items-center gap-1.5">
          {/* Category Carousel */}
          <div
            role="tablist"
            aria-label="Extension categories"
            className="flex-1 flex overflow-x-auto scrollbar-hide space-x-1 py-0.5"
          >
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isSelected = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs whitespace-nowrap transition-all ${
                    isSelected
                      ? 'bg-teal-500/20 text-teal-300 font-bold border border-teal-500/30 shadow-sm'
                      : 'text-[#f3f0e7]/70 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/5'
                  }`}
                >
                  <Icon size={12} />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Sort Selector Dropdown */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="flex items-center space-x-1 px-2.5 py-1 bg-[#342f33] hover:bg-[#453d43] border border-[#f3f0e7]/15 rounded-xl text-xs text-[#f3f0e7] transition-all"
              title="Sort extensions"
              aria-label="Sort options"
            >
              <CurrentSortIcon size={12} className="text-teal-400" />
              <ArrowUpDown size={11} className="text-[#f3f0e7]/50" />
            </button>

            {showSortDropdown && (
              <div className="absolute right-0 mt-1 z-30 w-44 bg-[#231e22] border border-[#f3f0e7]/20 rounded-2xl p-1 shadow-2xl space-y-0.5">
                <div className="px-2.5 py-1 text-[10px] font-bold text-[#f3f0e7]/50 uppercase tracking-wider">
                  Sort By
                </div>
                {SORT_OPTIONS.map((opt) => {
                  const OptIcon = opt.icon;
                  const isSelected = sortBy === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setSortBy(opt.id);
                        setShowSortDropdown(false);
                      }}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-xl text-xs text-left transition-all ${
                        isSelected
                          ? 'bg-teal-500/20 text-teal-300 font-bold'
                          : 'text-[#f3f0e7]/80 hover:bg-[#f3f0e7]/10'
                      }`}
                    >
                      <OptIcon size={13} />
                      <span className="flex-1">{opt.label}</span>
                      {isSelected && <Check size={12} className="text-teal-300" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Extension List */}
      <div className="flex-1 overflow-y-auto pb-4">
        {mainTab === 'marketplace' ? (
          /* Marketplace View */
          <div>
            {isSearching ? (
              <div className="flex flex-col items-center justify-center py-16 text-[#f3f0e7]/60 space-y-3">
                <Loader2 size={26} className="animate-spin text-teal-400" />
                <p className="text-xs">Searching Open VSX registry...</p>
              </div>
            ) : searchError ? (
              <div className="p-4 m-3 rounded-2xl border border-red-500/30 bg-red-500/10 text-xs text-red-300">
                <p className="font-semibold mb-1">Open VSX is unreachable</p>
                <p className="opacity-80">Connect to the internet or retry. Krypton no longer ships a curated fallback catalog.</p>
                <button
                  onClick={() => setRetryNonce((n) => n + 1)}
                  className="mt-2 px-3 py-1.5 rounded-xl bg-red-500/20 border border-red-400/30 font-semibold"
                >
                  Retry
                </button>
              </div>
            ) : marketplaceResults.length === 0 ? (
              <div className="p-4 space-y-4">
                <div className="text-center py-6 text-[#f3f0e7]/60">
                  <Puzzle size={32} className="mx-auto mb-2 opacity-40 text-teal-400" />
                  <p className="text-sm font-medium">No marketplace extensions found</p>
                  <p className="text-xs text-[#f3f0e7]/50 mt-1">
                    Try a different search or category.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 p-3">
                {marketplaceResults.map((ext) => {
                  const extId = ext.id || `${ext.namespace}.${ext.name}`;
                  const installed = isInstalled(extId);
                  const progress = installProgress?.[extId];
                  const isActive = isThemeActive(ext);

                  return (
                    <ExtensionCard
                      key={extId}
                      ext={ext}
                      isInstalled={installed}
                      isActiveTheme={isActive}
                      progress={progress}
                      hasLogs={(installLogs?.[extId]?.length || 0) > 0}
                      onClick={() => handleOpenDetail(ext)}
                      onInstall={(e) => handleInstallClick(e, ext)}
                      onApplyTheme={(e) => handleApplyThemeClick(e, ext as any)}
                      onViewLogs={(e) => {
                        e.stopPropagation();
                        setSelectedLogsId(extId);
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Installed Extensions View */
          <div className="p-3">
            {allInstalledList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-[#f3f0e7]/50 space-y-3">
                <Package size={36} className="opacity-40 text-teal-400" />
                <p className="text-sm font-medium">No plugins installed yet</p>
                <button
                  onClick={() => setMainTab('marketplace')}
                  className="px-4 py-2 bg-[#f3f0e7] text-[#231e22] rounded-xl text-xs font-bold hover:bg-white transition-all shadow-md"
                >
                  Explore Marketplace
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {allInstalledList.map((ext) => {
                  const isActive = isThemeActive(ext);

                  return (
                    <div
                      key={ext.id}
                      onClick={() => handleOpenDetail(ext)}
                      className="p-3.5 rounded-2xl bg-[#342f33] border border-[#f3f0e7]/20 shadow-md hover:border-[#f3f0e7]/40 transition-all cursor-pointer group"
                    >
                      <div className="flex items-start space-x-3">
                        <ExtensionCardIcon ext={ext} />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-[#f3f0e7] text-sm truncate group-hover:text-teal-300 transition-colors">
                              {ext.name}
                            </span>
                            <Check size={14} className="text-emerald-400 shrink-0" />
                          </div>

                          <div className="text-xs text-[#f3f0e7]/70 mt-0.5">
                            {ext.publisher} {ext.version ? `• v${ext.version}` : ''}
                          </div>
                          <p className="text-xs text-[#f3f0e7]/80 mt-1 line-clamp-2 leading-relaxed">
                            {ext.description}
                          </p>

                          <div className="flex items-center space-x-3 mt-2">
                            <span className="text-[10px] text-stone-700 dark:text-[#f3f0e7]/80 bg-stone-200/80 dark:bg-[#231e22] border border-stone-300 dark:border-white/5 px-2 py-0.5 rounded-md font-mono">
                              {ext.category}
                            </span>

                            {(installLogs?.[ext.id]?.length || 0) > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedLogsId(ext.id);
                                }}
                                className="text-[10px] text-teal-700 dark:text-teal-300 hover:text-teal-800 dark:hover:text-teal-200 flex items-center space-x-1 font-mono underline cursor-pointer"
                              >
                                <Terminal size={10} />
                                <span>Logs</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-col space-y-1.5 items-end shrink-0">
                          {ext.category === 'theme' && !isActive && (
                            <button
                              onClick={(e) => handleApplyThemeClick(e, ext)}
                              className="px-3 py-1.5 bg-[#f3f0e7] text-[#2a2529] hover:bg-white text-xs rounded-xl font-bold transition-all active:scale-95 shadow-md flex items-center space-x-1"
                            >
                              <Palette size={12} />
                              <span>Apply</span>
                            </button>
                          )}
                          {isActive && (
                            <span className="px-2.5 py-1.5 bg-[#7C9B79]/20 text-[#7C9B79] text-xs rounded-xl font-bold border border-[#7C9B79]/30 flex items-center space-x-1">
                              <Check size={13} />
                              <span>Applied</span>
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              uninstallExtension(ext.id);
                            }}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#f3f0e7]/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title={`Uninstall ${ext.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <ExtensionDetailModal
        extension={selectedExtension}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedExtension(null);
        }}
      />

      {/* Installation Log Viewer Modal */}
      {selectedLogsId && (
        <div className="fixed inset-0 z-[250] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#1e1b1e] border border-[#f3f0e7]/20 rounded-3xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#f3f0e7]/10 bg-[#252125]">
              <div className="flex items-center space-x-2">
                <Terminal size={16} className="text-teal-400" />
                <span className="text-xs font-bold text-[#f3f0e7] font-mono truncate max-w-xs">
                  Logs: {selectedLogsId}
                </span>
              </div>
              <button
                onClick={() => setSelectedLogsId(null)}
                className="p-1 rounded-lg hover:bg-[#f3f0e7]/10 text-[#f3f0e7]/70 hover:text-[#f3f0e7]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 font-mono text-[11px] leading-relaxed space-y-1 text-[#f3f0e7]/80 bg-[#161416]">
              {(installLogs[selectedLogsId] || []).map((line, idx) => (
                <div key={idx} className="whitespace-pre-wrap">
                  {line}
                </div>
              ))}
              {(!installLogs[selectedLogsId] || installLogs[selectedLogsId].length === 0) && (
                <div className="text-[#f3f0e7]/70 italic">No installation logs recorded.</div>
              )}
            </div>
            <div className="p-3 border-t border-[#f3f0e7]/10 bg-[#252125] flex justify-end">
              <button
                onClick={() => setSelectedLogsId(null)}
                className="px-4 py-1.5 bg-[#f3f0e7] text-[#2a2529] rounded-xl text-xs font-bold hover:bg-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Status */}
      <div className="border-t border-[#f3f0e7]/10 px-3 py-2 bg-[#231e22] flex items-center justify-between">
        <p className="text-[10px] text-[#f3f0e7]/70 font-medium">
          {installedExtensions.length} installed • Open VSX live catalog
        </p>
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" title="Connected to Open VSX" />
      </div>
    </div>
  );
}

/**
 * Subcomponent for individual extension card in marketplace view.
 */
interface ExtensionCardProps {
  ext: MarketplaceExtension | Extension;
  isInstalled: boolean;
  isActiveTheme: boolean;
  progress?: { stage: string; percent: number; status: string };
  hasLogs: boolean;
  onClick: () => void;
  onInstall: (e: React.MouseEvent) => void;
  onApplyTheme: (e: React.MouseEvent) => void;
  onViewLogs: (e: React.MouseEvent) => void;
}

function ExtensionCard({
  ext,
  isInstalled,
  isActiveTheme,
  progress,
  hasLogs,
  onClick,
  onInstall,
  onApplyTheme,
  onViewLogs,
}: ExtensionCardProps) {
  const isInstalling = progress?.status === 'installing';
  const displayName = (ext as any)?.displayName || ext?.name || 'Extension';
  const publisher = (ext as any)?.namespace || ext?.publisher || 'Community';
  const downloads = (ext as any)?.downloadCount
    ? formatDownloadCount((ext as any).downloadCount)
    : (ext as any)?.downloads;
  const rating = (ext as any)?.averageRating
    ? formatRating((ext as any).averageRating)
    : (ext as any)?.rating
    ? formatRating((ext as any).rating)
    : null;

  return (
    <div
      onClick={onClick}
      className={`p-3.5 rounded-2xl border transition-all cursor-pointer group ${
        isInstalled
          ? 'bg-[#342f33] border-[#f3f0e7]/20 shadow-md'
          : 'bg-[#342f33]/60 border-[#f3f0e7]/10 hover:border-[#f3f0e7]/30 hover:bg-[#342f33]/80'
      }`}
    >
      <div className="flex items-start space-x-3">
        <ExtensionCardIcon ext={ext} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-[#f3f0e7] text-sm truncate group-hover:text-teal-300 transition-colors">
              {displayName}
            </span>
            {isInstalled && <Check size={14} className="text-emerald-400 shrink-0" />}
          </div>

          <div className="text-xs text-[#f3f0e7]/70 mt-0.5">
            {publisher} {ext.version ? `• v${ext.version}` : ''}
          </div>

          <p className="text-xs text-[#f3f0e7]/80 mt-1 line-clamp-2 leading-relaxed">
            {ext.description}
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-2.5">
            {downloads && (
              <span className="flex items-center space-x-1 text-[11px] text-[#f3f0e7]/70">
                <Download size={11} className="text-teal-400" />
                <span>{downloads}</span>
              </span>
            )}
            {rating && (
              <span className="flex items-center space-x-1 text-[11px] text-[#f3f0e7]/70">
                <Star size={11} className="text-yellow-400 fill-yellow-400" />
                <span>{rating}</span>
              </span>
            )}
            <span className="text-[10px] text-stone-700 dark:text-[#f3f0e7]/80 bg-stone-200/80 dark:bg-[#231e22] border border-stone-300 dark:border-white/5 px-2 py-0.5 rounded-md font-mono">
              {(ext as any).category || ((ext as any).categories?.[0]) || 'plugin'}
            </span>

            {hasLogs && (
              <button
                onClick={onViewLogs}
                className="text-[10px] text-teal-700 dark:text-teal-300 hover:text-teal-800 dark:hover:text-teal-200 flex items-center space-x-1 font-mono underline cursor-pointer"
              >
                <Terminal size={10} />
                <span>Logs</span>
              </button>
            )}
          </div>

          {/* Progress bar if installing */}
          {isInstalling && (
            <div className="mt-3 pt-2 border-t border-[#f3f0e7]/10 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-teal-300 font-medium flex items-center space-x-1.5">
                  <Loader2 size={11} className="animate-spin" />
                  <span>{progress?.stage || 'Installing...'}</span>
                </span>
                <span className="font-mono text-[#f3f0e7]/75 font-bold">
                  {progress?.percent || 0}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-[#231e22] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-teal-400 to-emerald-400 transition-all duration-300 rounded-full"
                  style={{ width: `${progress?.percent || 0}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="shrink-0 flex flex-col items-end space-y-1.5">
          {isInstalled ? (
            <div className="flex items-center space-x-1">
              {(ext as any).category === 'theme' && !isActiveTheme && (
                <button
                  onClick={onApplyTheme}
                  className="px-3 py-1.5 bg-[#f3f0e7] text-[#2a2529] hover:bg-white text-xs rounded-xl font-bold transition-all active:scale-95 shadow-md flex items-center space-x-1"
                >
                  <Palette size={12} />
                  <span>Apply</span>
                </button>
              )}
              {isActiveTheme && (
                <span className="px-2.5 py-1.5 bg-[#7C9B79]/20 text-[#7C9B79] text-xs rounded-xl font-bold border border-[#7C9B79]/30 flex items-center space-x-1">
                  <Check size={13} />
                  <span>Applied</span>
                </span>
              )}
              {!isActiveTheme && (ext as any).category !== 'theme' && (
                <span className="px-2.5 py-1 bg-[#231e22] text-[#f3f0e7]/60 text-xs rounded-xl font-medium border border-[#f3f0e7]/10">
                  Installed
                </span>
              )}
            </div>
          ) : (
            <button
              onClick={onInstall}
              disabled={isInstalling}
              className="px-3.5 py-1.5 bg-[#f3f0e7] text-[#2a2529] hover:bg-white disabled:opacity-50 text-xs rounded-xl font-bold transition-all active:scale-95 shadow-md flex items-center space-x-1.5"
            >
              {isInstalling ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  <span>{progress?.percent || 0}%</span>
                </>
              ) : (
                <>
                  <Download size={12} />
                  <span>Install</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

class ExtensionsErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state: { hasError: boolean; error: Error | null } = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('[ExtensionsPanel] Render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center p-6 bg-[#2a2529] text-[#f3f0e7] text-center space-y-3">
          <Puzzle size={36} className="text-amber-400 opacity-60" />
          <h3 className="text-sm font-bold">Extensions View Recovered</h3>
          <p className="text-xs text-[#f3f0e7]/60 max-w-xs">
            {this.state.error?.message || 'An error occurred while displaying extensions.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-3 py-1.5 bg-[#f3f0e7] text-[#2a2529] text-xs font-bold rounded-xl hover:bg-white transition-all shadow-sm"
          >
            Retry Loading Extensions
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ExtensionsPanel() {
  return (
    <ExtensionsErrorBoundary>
      <ExtensionsPanelContent />
    </ExtensionsErrorBoundary>
  );
}
