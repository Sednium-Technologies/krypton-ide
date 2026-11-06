import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Download,
  Star,
  ShieldCheck,
  Tag,
  ExternalLink,
  Loader2,
  Check,
  Trash2,
  Palette,
  FileText,
  History,
  Layers,
  Package,
  Sparkles,
  Code2,
  CheckCircle2,
} from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  fetchExtensionDetails,
  formatDownloadCount,
  formatRating,
  type MarketplaceExtension,
  type ExtensionDetailMetadata,
} from '../../lib/marketplaceService';
import { useExtensionsStore, type Extension } from '../../store/useExtensionsStore';
import { useExtensionHostStore } from '../../store/useExtensionHostStore';
import { useIdeStore } from '../../store/useIdeStore';
import { useToastStore } from '../../store/useToastStore';
import { getInstalledExtensions } from '../../lib/extensions/extensionRegistry';

interface ExtensionDetailModalProps {
  extension: MarketplaceExtension | Extension | null;
  isOpen: boolean;
  onClose: () => void;
}

type ActiveTab = 'overview' | 'changelog' | 'features';

export function ExtensionDetailModal({ extension, isOpen, onClose }: ExtensionDetailModalProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [details, setDetails] = useState<ExtensionDetailMetadata | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [imgError, setImgError] = useState<boolean>(false);
  const theme = useIdeStore((state) => state.theme);
  const isLight = theme === 'light';

  const {
    installedExtensions,
    customExtensions,
    activeMonacoThemeId,
    activeIconTheme,
    installProgress,
    installFromOpenVsx,
    uninstallExtension,
    setActiveThemeExtension,
    setActiveIconTheme,
  } = useExtensionsStore();

  // Determine namespace and name
  const { namespace, name, extId } = useMemo(() => {
    if (!extension) return { namespace: '', name: '', extId: '' };

    let ns = (extension as any).namespace || '';
    let n = (extension as any).name || '';
    const id = extension.id || '';

    if (!ns || !n) {
      if (id.includes('.')) {
        const parts = id.split('.');
        ns = parts[0];
        n = parts.slice(1).join('.');
      } else {
        ns = extension.publisher || 'community';
        n = extension.name || id;
      }
    }

    return { namespace: ns, name: n, extId: id || `${ns}.${n}` };
  }, [extension]);

  // Load details when extension opens
  useEffect(() => {
    if (!isOpen || !extension || !namespace || !name) {
      setDetails(null);
      setImgError(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setImgError(false);
    setSelectedVersion((extension as any).version || 'latest');

    fetchExtensionDetails(namespace, name)
      .then((data) => {
        if (isMounted) {
          setDetails(data);
          setSelectedVersion(data.version || 'latest');
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Failed to load extension details from Open VSX:', err);
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, extension, namespace, name]);

  // Handle version change
  const handleVersionChange = async (ver: string) => {
    setSelectedVersion(ver);
    if (!namespace || !name) return;

    setLoading(true);
    try {
      const data = await fetchExtensionDetails(namespace, name, ver);
      setDetails(data);
    } catch (e) {
      console.warn(`Failed to fetch version ${ver}:`, e);
    } finally {
      setLoading(false);
    }
  };

  const installedExt = customExtensions.find((e) => e.id === extId);
  const effectiveMonacoThemeId = (extension as any)?.monacoThemeId || installedExt?.monacoThemeId;
  const isInstalled = Boolean(
    extId &&
    getInstalledExtensions({ customExtensions, installedExtensions }).some((ext) => ext.id === extId)
  );
  const progress = extId ? installProgress[extId] : undefined;
  const isInstalling = progress?.status === 'installing';
  const isColorThemeActive = Boolean(
    effectiveMonacoThemeId &&
    activeMonacoThemeId === effectiveMonacoThemeId
  );
  const isIconThemeActive = Boolean(
    activeIconTheme && (
      ((extension as any)?.iconThemeId && activeIconTheme === (extension as any)?.iconThemeId) ||
      (extId && activeIconTheme === extId) ||
      ((extId?.includes('material') || (extension as any)?.name?.toLowerCase().includes('material icon')) &&
       (activeIconTheme === 'material' || activeIconTheme === 'material-icon-theme' || activeIconTheme.includes('material')))
    )
  );
  const isActiveTheme = isColorThemeActive || isIconThemeActive;
  const isNativeInstalled = useExtensionHostStore((s) =>
    s.installedExtensions.some((e) => e.id === extId)
  );

  // Available versions list
  const availableVersions = useMemo(() => {
    if (!details?.allVersions) return [];
    const keys = Object.keys(details.allVersions);
    // Filter out 'latest' if standard semver versions exist, or place at top
    const versions = keys.filter((k) => k !== 'latest');
    return versions.length > 0 ? versions : keys;
  }, [details?.allVersions]);

  // Readme HTML
  const readmeHtml = useMemo(() => {
    const raw = details?.readme || (extension as any)?.readme;
    if (!raw || typeof raw !== 'string') return null;
    try {
      marked.setOptions({ breaks: true, gfm: true });
      const parsed = marked.parse(raw);
      return typeof parsed === 'string' ? DOMPurify.sanitize(parsed) : '';
    } catch (e) {
      console.warn('Failed to parse extension readme:', e);
      return null;
    }
  }, [details?.readme, extension]);

  // Changelog HTML
  const changelogHtml = useMemo(() => {
    const raw = details?.changelog;
    if (!raw || typeof raw !== 'string') return null;
    try {
      marked.setOptions({ breaks: true, gfm: true });
      const parsed = marked.parse(raw);
      return typeof parsed === 'string' ? DOMPurify.sanitize(parsed) : '';
    } catch (e) {
      console.warn('Failed to parse extension changelog:', e);
      return null;
    }
  }, [details?.changelog]);

  // Contributions analysis from manifest
  const contributions = useMemo(() => {
    const manifest = details?.manifest;
    if (!manifest?.contributes) return null;
    return manifest.contributes;
  }, [details?.manifest]);

  // Install handler
  const handleInstall = async () => {
    if (!extension) return;

    const marketExt: MarketplaceExtension = {
      namespace,
      name,
      id: extId,
      displayName: details?.displayName || (extension as any).displayName || extension.name,
      description: details?.description || extension.description || '',
      version: selectedVersion || details?.version || (extension as any).version || '1.0.0',
      publisher: details?.publisher || extension.publisher || namespace,
      downloadCount: details?.downloadCount || (extension as any).downloadCount || 0,
      averageRating: details?.averageRating || (extension as any).rating || 0,
      iconUrl: details?.iconUrl || (extension as any).iconUrl,
      categories: details?.categories || (extension as any).categories || [],
      files: details?.files || (extension as any).files || {
        download: details?.downloadUrl || (extension as any).downloadUrl,
      },
    };

    const targetVersionUrl = details?.allVersions?.[selectedVersion] || details?.downloadUrl;
    await installFromOpenVsx(marketExt, targetVersionUrl);
  };

  const handleApplyTheme = () => {
    const ext = extension as any;
    const isIconTheme = Boolean(
      ext.iconThemeId ||
      extId?.toLowerCase().includes('icon') ||
      ext.name?.toLowerCase().includes('icon')
    );
    if (isIconTheme) {
      let themeId = ext.iconThemeId || extId || 'material';
      if (themeId.includes('material') || ext.name?.toLowerCase().includes('material')) {
        themeId = 'material';
      }
      setActiveIconTheme(themeId);
      const title = ext.name?.toLowerCase().endsWith('theme') ? ext.name : `${ext.name || 'Icon'} Theme`;
      useToastStore.getState().success(`Applied ${title}`);
      return;
    }

    if (effectiveMonacoThemeId) {
      setActiveThemeExtension(extId);
      const title = displayName?.toLowerCase().endsWith('theme') ? displayName : `${displayName} Theme`;
      useToastStore.getState().success(`Applied ${title}`);
    }
  };

  if (!isOpen || !extension) return null;

  const displayName = details?.displayName || (extension as any).displayName || extension.name;
  const publisher = details?.publisher || extension.publisher || namespace;
  const description = details?.description || extension.description;
  const iconUrl = details?.iconUrl || (extension as any).iconUrl;
  const downloads = details?.downloadCount
    ? formatDownloadCount(details.downloadCount)
    : (extension as any).downloads || '0';
  const rating = details?.averageRating
    ? formatRating(details.averageRating)
    : (extension as any).rating
    ? formatRating((extension as any).rating)
    : 'N/A';
  const license = details?.license || (extension as any).license || 'Open Source';
  const categories = details?.categories?.length
    ? details.categories
    : (extension as any).categories || [(extension as any).category || 'Other'];

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-md flex flex-col md:p-6 overflow-hidden"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 35, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 35, scale: 0.98 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className={`rounded-t-3xl md:rounded-3xl border flex flex-col h-full md:max-w-3xl md:mx-auto shadow-2xl overflow-hidden w-full mt-auto md:mt-0 ${
            isLight ? 'bg-white text-[#2a2529] border-[#2a2529]/15' : 'bg-[#231e22] text-[#f3f0e7] border-[#f3f0e7]/15'
          }`}
        >
          {/* Top Bar */}
          <div className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
            isLight ? 'border-[#2a2529]/10 bg-[#f7f5ee]' : 'border-[#f3f0e7]/10 bg-[#282327]'
          }`}>
            <div className="flex items-center space-x-2">
              <Package size={17} className="text-teal-400" />
              <span className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>
                Extension Details
              </span>
            </div>
            <button
              onClick={onClose}
              className={`p-1.5 rounded-xl transition-all focus-visible:ring-2 focus-visible:outline-none ${
                isLight
                  ? 'hover:bg-[#2a2529]/10 text-[#2a2529]/70 hover:text-[#2a2529] focus-visible:ring-[#2a2529]/40'
                  : 'hover:bg-[#f3f0e7]/10 text-[#f3f0e7]/70 hover:text-[#f3f0e7] focus-visible:ring-[#f3f0e7]/50'
              }`}
              aria-label="Close details"
            >
              <X size={18} />
            </button>
          </div>

          {/* Scrollable Body Container */}
          <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain">
            {/* Header Card */}
            <div className={`p-5 md:p-6 border-b ${
            isLight ? 'border-[#2a2529]/10 bg-white' : 'border-[#f3f0e7]/10 bg-[#262125]'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              {/* Icon */}
              <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center shrink-0 overflow-hidden shadow-inner ${
                isLight ? 'bg-[#f4f0e6] border-[#2a2529]/12' : 'bg-[#342f33] border-[#f3f0e7]/15'
              }`}>
                {iconUrl && !imgError ? (
                  <img
                    src={iconUrl}
                    alt={displayName}
                    onError={() => setImgError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Package size={32} className="text-teal-400" />
                )}
              </div>

              {/* Title, Publisher, Version */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className={`text-lg font-bold truncate ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>{displayName}</h2>
                  {details?.verified && (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-teal-500/20 text-teal-300 text-[10px] font-medium border border-teal-500/30">
                      <CheckCircle2 size={10} />
                      <span>Verified</span>
                    </span>
                  )}
                  {isNativeInstalled && (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-medium border border-emerald-500/30">
                      <CheckCircle2 size={10} />
                      <span>Native Host</span>
                    </span>
                  )}
                </div>

                <div className={`flex items-center space-x-2 text-xs mt-1 ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/70'}`}>
                  <span className={`font-semibold ${isLight ? 'text-[#2a2529]/90' : 'text-[#f3f0e7]/90'}`}>{publisher}</span>
                  <span>•</span>
                  <span className={`font-mono text-[11px] ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/60'}`}>{extId}</span>
                </div>

                <p className={`text-xs mt-2 line-clamp-2 leading-relaxed ${isLight ? 'text-[#2a2529]/80' : 'text-[#f3f0e7]/80'}`}>
                  {description}
                </p>

                {/* Metadata badges row */}
                <div className={`flex flex-wrap items-center gap-3 mt-3.5 text-xs ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/70'}`}>
                  <div className="flex items-center space-x-1">
                    <Download size={13} className="text-teal-400" />
                    <span>{downloads}</span>
                  </div>

                  <div className="flex items-center space-x-1">
                    <Star size={13} className="text-yellow-400 fill-yellow-400" />
                    <span>{rating}</span>
                  </div>

                  <div className="flex items-center space-x-1">
                    <ShieldCheck size={13} className="text-emerald-400" />
                    <span>{license}</span>
                  </div>

                  {/* Version Picker */}
                  <div className={`flex items-center space-x-1.5 ml-auto sm:ml-0 border rounded-xl px-2.5 py-1 ${
                    isLight ? 'bg-[#f2eee3] border-[#2a2529]/12' : 'bg-[#342f33] border-[#f3f0e7]/15'
                  }`}>
                    <Tag size={12} className={isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/60'} />
                    <select
                      value={selectedVersion}
                      onChange={(e) => handleVersionChange(e.target.value)}
                      disabled={isInstalling}
                      aria-label="Select extension version"
                      className={`bg-transparent text-xs font-mono focus:outline-none cursor-pointer ${
                        isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'
                      }`}
                    >
                      {availableVersions.length > 0 ? (
                        availableVersions.map((v) => (
                          <option key={v} value={v} className={isLight ? 'bg-white text-[#2a2529]' : 'bg-[#231e22] text-[#f3f0e7]'}>
                            v{v}
                          </option>
                        ))
                      ) : (
                        <option value={selectedVersion || '1.0.0'} className={isLight ? 'bg-white text-[#2a2529]' : 'bg-[#231e22] text-[#f3f0e7]'}>
                          v{selectedVersion || '1.0.0'}
                        </option>
                      )}
                    </select>
                  </div>
                </div>
              </div>

              {/* Action Buttons Column */}
              <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 shrink-0 pt-2 sm:pt-0">
                {isInstalled ? (
                  <>
                    {(extension as any).category === 'theme' && !isActiveTheme && (
                      <button
                        onClick={handleApplyTheme}
                        className="px-4 py-2 bg-gradient-to-r from-teal-400 to-emerald-400 text-[#1e1b1e] font-bold text-xs rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-md flex items-center space-x-1.5"
                      >
                        <Palette size={13} />
                        <span>Apply Theme</span>
                      </button>
                    )}

                    {isActiveTheme && (
                      <span className="px-3.5 py-2 bg-[#7C9B79]/20 text-[#7C9B79] text-xs rounded-xl font-bold border border-[#7C9B79]/30 flex items-center space-x-1.5">
                        <Check size={14} />
                        <span>Applied</span>
                      </span>
                    )}

                    <button
                      onClick={() => uninstallExtension(extId)}
                      disabled={isInstalling}
                      className="px-3.5 py-2 bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20 text-xs rounded-xl font-bold transition-all active:scale-95 flex items-center space-x-1.5"
                    >
                      <Trash2 size={13} />
                      <span>Uninstall</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleInstall}
                    disabled={isInstalling}
                    className={`w-full sm:w-auto px-5 py-2.5 active:scale-95 disabled:opacity-60 text-xs font-bold rounded-xl transition-all shadow-lg flex items-center justify-center space-x-2 ${
                      isLight ? 'bg-[#2a2529] text-white hover:bg-[#3d373c]' : 'bg-[#f3f0e7] text-[#231e22] hover:bg-white'
                    }`}
                  >
                    {isInstalling ? (
                      <>
                        <Loader2 size={14} className={`animate-spin ${isLight ? 'text-white' : 'text-[#231e22]'}`} />
                        <span>Installing ({progress?.percent || 0}%)</span>
                      </>
                    ) : (
                      <>
                        <Download size={14} />
                        <span>Install v{selectedVersion || 'latest'}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Installation Progress Bar */}
            {isInstalling && (
              <div className={`mt-4 pt-3 border-t space-y-1.5 ${isLight ? 'border-[#2a2529]/10' : 'border-[#f3f0e7]/10'}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-teal-400 font-medium flex items-center space-x-1.5">
                    <Loader2 size={12} className="animate-spin" />
                    <span>{progress?.stage || 'Installing...'}</span>
                  </span>
                  <span className={`font-mono text-xs font-bold ${isLight ? 'text-[#2a2529]/80' : 'text-[#f3f0e7]/80'}`}>
                    {progress?.percent || 0}%
                  </span>
                </div>
                <div className={`w-full h-1.5 rounded-full overflow-hidden ${isLight ? 'bg-[#e5e0d4]' : 'bg-[#1a1719]'}`}>
                  <div
                    className="h-full bg-gradient-to-r from-teal-400 via-emerald-400 to-cyan-400 transition-all duration-300 rounded-full"
                    style={{ width: `${progress?.percent || 0}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Navigation Tabs - Sticky */}
          <div className={`sticky top-0 z-10 flex border-b px-4 shrink-0 backdrop-blur-md ${isLight ? 'border-[#2a2529]/10 bg-[#f7f5ee]/95' : 'border-[#f3f0e7]/10 bg-[#231e22]/95'}`}>
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center space-x-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'overview'
                  ? (isLight ? 'border-teal-600 text-teal-700 font-bold' : 'border-teal-400 text-teal-300 font-bold')
                  : (isLight ? 'border-transparent text-[#2a2529]/70 hover:text-[#2a2529]' : 'border-transparent text-[#f3f0e7]/70 hover:text-[#f3f0e7]')
              }`}
            >
              <FileText size={14} />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('changelog')}
              className={`flex items-center space-x-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'changelog'
                  ? (isLight ? 'border-teal-600 text-teal-700 font-bold' : 'border-teal-400 text-teal-300 font-bold')
                  : (isLight ? 'border-transparent text-[#2a2529]/70 hover:text-[#2a2529]' : 'border-transparent text-[#f3f0e7]/70 hover:text-[#f3f0e7]')
              }`}
            >
              <History size={14} />
              <span>Changelog</span>
            </button>

            <button
              onClick={() => setActiveTab('features')}
              className={`flex items-center space-x-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'features'
                  ? (isLight ? 'border-teal-600 text-teal-700 font-bold' : 'border-teal-400 text-teal-300 font-bold')
                  : (isLight ? 'border-transparent text-[#2a2529]/70 hover:text-[#2a2529]' : 'border-transparent text-[#f3f0e7]/70 hover:text-[#f3f0e7]')
              }`}
            >
              <Layers size={14} />
              <span>Capabilities</span>
            </button>
          </div>

          {/* Tab Contents */}
          <div className={`p-5 md:p-6 pb-24 ${isLight ? 'bg-[#faf8f5]' : 'bg-[#1f1b1e]'}`}>
            {loading && !details ? (
              <div className="flex flex-col items-center justify-center py-16 text-[#f3f0e7]/60 space-y-3">
                <Loader2 size={28} className="animate-spin text-teal-400" />
                <p className="text-xs">Fetching extension package details...</p>
              </div>
            ) : activeTab === 'overview' ? (
              readmeHtml ? (
                <div className="max-w-none">
                  <div
                    className="markdown-body text-[#f3f0e7]/90 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: readmeHtml }}
                  />
                </div>
              ) : (
                <div className="py-12 text-center text-[#f3f0e7]/60 space-y-3">
                  <FileText size={36} className="mx-auto opacity-40 text-teal-400" />
                  <p className="text-sm font-medium">No README provided for this release.</p>
                  <p className="text-xs text-[#f3f0e7]/50 max-w-md mx-auto">
                    {description}
                  </p>
                </div>
              )
            ) : activeTab === 'changelog' ? (
              changelogHtml ? (
                <div className="max-w-none">
                  <div
                    className="markdown-body leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: changelogHtml }}
                  />
                </div>
              ) : (
                <div className={`py-12 text-center space-y-3 ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/60'}`}>
                  <History size={36} className="mx-auto opacity-40 text-teal-400" />
                  <p className="text-sm font-medium">No changelog found for this extension.</p>
                  <p className={`text-xs ${isLight ? 'text-[#2a2529]/50' : 'text-[#f3f0e7]/50'}`}>
                    Release notes may be published directly on the project's repository.
                  </p>
                </div>
              )
            ) : (
              /* Features & Contributions */
              <div className="space-y-6">
                {/* Themes */}
                {Array.isArray(contributions?.themes) && contributions.themes.length > 0 && (
                  <div className={`rounded-2xl p-4 border ${isLight ? 'bg-white border-[#2a2529]/10 shadow-sm' : 'bg-[#282327] border-[#f3f0e7]/10'}`}>
                    <div className="flex items-center space-x-2 text-xs font-bold text-amber-500 uppercase tracking-wider mb-3">
                      <Palette size={15} />
                      <span>Contributed Themes ({contributions.themes.length})</span>
                    </div>
                    <div className="space-y-2">
                      {contributions.themes.map((t: any, idx: number) => (
                        <div
                          key={idx}
                          className={`flex items-center justify-between p-2.5 rounded-xl border text-xs ${
                            isLight ? 'bg-[#f4f0e6] border-[#2a2529]/8 text-[#2a2529]' : 'bg-[#342f33]/60 border-[#f3f0e7]/5'
                          }`}
                        >
                          <span className={`font-semibold ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>{t.label}</span>
                          <span className={`font-mono text-[10px] px-2 py-0.5 rounded ${
                            isLight ? 'bg-[#e8e4d9] text-[#2a2529]/80' : 'bg-[#231e22] text-[#f3f0e7]/70'
                          }`}>
                            {t.uiTheme || 'vs-dark'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Snippets */}
                {Array.isArray(contributions?.snippets) && contributions.snippets.length > 0 && (
                  <div className={`rounded-2xl p-4 border ${isLight ? 'bg-white border-[#2a2529]/10 shadow-sm' : 'bg-[#282327] border-[#f3f0e7]/10'}`}>
                    <div className="flex items-center space-x-2 text-xs font-bold text-teal-500 uppercase tracking-wider mb-3">
                      <Code2 size={15} />
                      <span>Contributed Snippets ({contributions.snippets.length})</span>
                    </div>
                    <div className="space-y-2">
                      {contributions.snippets.map((s: any, idx: number) => (
                        <div
                          key={idx}
                          className={`flex items-center justify-between p-2.5 rounded-xl border text-xs ${
                            isLight ? 'bg-[#f4f0e6] border-[#2a2529]/8 text-[#2a2529]' : 'bg-[#342f33]/60 border-[#f3f0e7]/5'
                          }`}
                        >
                          <span className={`font-mono ${isLight ? 'text-teal-700 font-bold' : 'text-teal-300'}`}>{s.language || 'generic'}</span>
                          <span className={`text-[11px] font-mono truncate max-w-[200px] ${
                            isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/60'
                          }`}>
                            {s.path}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Commands */}
                {Array.isArray(contributions?.commands) && contributions.commands.length > 0 && (
                  <div className={`rounded-2xl p-4 border ${isLight ? 'bg-white border-[#2a2529]/10 shadow-sm' : 'bg-[#282327] border-[#f3f0e7]/10'}`}>
                    <div className="flex items-center space-x-2 text-xs font-bold text-sky-500 uppercase tracking-wider mb-3">
                      <Sparkles size={15} />
                      <span>Contributed Commands ({contributions.commands.length})</span>
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {contributions.commands.map((cmd: any, idx: number) => (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-xl border text-xs space-y-0.5 ${
                            isLight ? 'bg-[#f4f0e6] border-[#2a2529]/8 text-[#2a2529]' : 'bg-[#342f33]/60 border-[#f3f0e7]/5'
                          }`}
                        >
                          <div className={`font-semibold ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>{cmd.title}</div>
                          <div className={`text-[10px] font-mono ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/60'}`}>{cmd.command}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* General Capabilities */}
                <div className={`rounded-2xl p-4 border ${isLight ? 'bg-white border-[#2a2529]/10 shadow-sm' : 'bg-[#282327] border-[#f3f0e7]/10'}`}>
                  <div className={`flex items-center space-x-2 text-xs font-bold uppercase tracking-wider mb-3 ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>
                    <Layers size={15} />
                    <span>Package Information</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className={`p-2.5 rounded-xl border ${isLight ? 'bg-[#f4f0e6] border-[#2a2529]/8' : 'bg-[#342f33]/60 border-[#f3f0e7]/5'}`}>
                      <span className={`block text-[10px] ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/60'}`}>Categories</span>
                      <span className={`font-medium ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>
                        {Array.isArray(categories) ? categories.join(', ') : String(categories || '')}
                      </span>
                    </div>
                    <div className={`p-2.5 rounded-xl border ${isLight ? 'bg-[#f4f0e6] border-[#2a2529]/8' : 'bg-[#342f33]/60 border-[#f3f0e7]/5'}`}>
                      <span className={`block text-[10px] ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/60'}`}>License</span>
                      <span className={`font-medium ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>{license}</span>
                    </div>
                    {details?.repository && /^https?:\/\//i.test(details.repository) && (
                      <div className={`p-2.5 rounded-xl border col-span-full ${isLight ? 'bg-[#f4f0e6] border-[#2a2529]/8' : 'bg-[#342f33]/60 border-[#f3f0e7]/5'}`}>
                        <span className={`block text-[10px] ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/60'}`}>Source Repository</span>
                        <a
                          href={details.repository}
                          target="_blank"
                          rel="noreferrer"
                          className={`hover:underline flex items-center space-x-1 mt-0.5 ${isLight ? 'text-teal-700' : 'text-teal-300'}`}
                        >
                          <span className="truncate">{details.repository}</span>
                          <ExternalLink size={11} />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          </div>

          {/* Footer Bar */}
          <div className={`shrink-0 border-t px-5 py-3 flex items-center justify-between ${
            isLight ? 'border-[#2a2529]/10 bg-[#f7f5ee]' : 'border-[#f3f0e7]/10 bg-[#262125]'
          }`}>
            <span className={`text-[11px] ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/60'}`}>
              Open VSX Registry • {extId}
            </span>
            <button
              onClick={onClose}
              className={`px-4 py-1.5 border rounded-xl text-xs font-semibold active:scale-95 transition-all ${
                isLight ? 'bg-[#e8e4d9] hover:bg-[#ded9cc] text-[#2a2529] border-[#2a2529]/12' : 'bg-[#342f33] hover:bg-[#453d43] text-[#f3f0e7] border-[#f3f0e7]/15'
              }`}
            >
              Close
            </button>
          </div>
        </motion.div>

        {/* Embedded markdown style sheet */}
        <style>{`
          .markdown-body {
            color: ${isLight ? '#2a2529' : '#d8dee9'};
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 13px;
            line-height: 1.6;
            word-wrap: break-word;
          }
          .markdown-body h1 {
            font-size: 1.6em;
            font-weight: 700;
            color: ${isLight ? '#2a2529' : '#f3f0e7'};
            border-bottom: 1px solid ${isLight ? 'rgba(42, 37, 41, 0.12)' : 'rgba(243, 240, 231, 0.12)'};
            padding-bottom: 0.3em;
            margin: 1.2em 0 0.6em;
          }
          .markdown-body h2 {
            font-size: 1.3em;
            font-weight: 600;
            color: ${isLight ? '#2a2529' : '#f3f0e7'};
            border-bottom: 1px solid ${isLight ? 'rgba(42, 37, 41, 0.1)' : 'rgba(243, 240, 231, 0.1)'};
            padding-bottom: 0.25em;
            margin: 1em 0 0.5em;
          }
          .markdown-body h3, .markdown-body h4 {
            font-size: 1.1em;
            font-weight: 600;
            color: ${isLight ? '#2a2529' : '#f3f0e7'};
            margin: 0.8em 0 0.4em;
          }
          .markdown-body p {
            margin: 0.6em 0;
          }
          .markdown-body a {
            color: ${isLight ? '#0f766e' : '#5eead4'};
            text-decoration: none;
          }
          .markdown-body a:hover {
            text-decoration: underline;
          }
          .markdown-body strong {
            color: ${isLight ? '#2a2529' : '#f3f0e7'};
            font-weight: 600;
          }
          .markdown-body code {
            background: ${isLight ? '#e8e4d9' : '#2a2529'};
            border: 1px solid ${isLight ? 'rgba(42, 37, 41, 0.15)' : 'rgba(243, 240, 231, 0.15)'};
            border-radius: 4px;
            padding: 0.15em 0.4em;
            font-family: monospace;
            font-size: 0.9em;
            color: ${isLight ? '#0f766e' : '#5eead4'};
          }
          .markdown-body pre {
            background: ${isLight ? '#f0ece2' : '#181517'};
            border: 1px solid ${isLight ? 'rgba(42, 37, 41, 0.12)' : 'rgba(243, 240, 231, 0.12)'};
            border-radius: 12px;
            padding: 12px;
            overflow-x: auto;
            margin: 0.8em 0;
          }
          .markdown-body pre code {
            background: transparent;
            border: none;
            padding: 0;
            color: ${isLight ? '#2a2529' : '#f3f0e7'};
          }
          .markdown-body blockquote {
            border-left: 3px solid ${isLight ? '#0f766e' : '#5eead4'};
            padding: 0.4em 0.8em;
            margin: 0.8em 0;
            color: ${isLight ? 'rgba(42, 37, 41, 0.75)' : 'rgba(243, 240, 231, 0.7)'};
            background: ${isLight ? '#f0ece2' : '#282327'};
            border-radius: 0 8px 8px 0;
          }
          .markdown-body ul, .markdown-body ol {
            padding-left: 1.5em;
            margin: 0.6em 0;
          }
          .markdown-body li {
            margin: 0.25em 0;
          }
          .markdown-body table {
            width: 100%;
            border-collapse: collapse;
            margin: 0.8em 0;
          }
          .markdown-body th {
            background: ${isLight ? '#ebe7dc' : '#282327'};
            font-weight: 600;
            color: ${isLight ? '#2a2529' : '#f3f0e7'};
            text-align: left;
            padding: 6px 10px;
            border: 1px solid ${isLight ? 'rgba(42, 37, 41, 0.15)' : 'rgba(243, 240, 231, 0.15)'};
          }
          .markdown-body td {
            padding: 6px 10px;
            border: 1px solid ${isLight ? 'rgba(42, 37, 41, 0.1)' : 'rgba(243, 240, 231, 0.1)'};
          }
          .markdown-body img {
            max-width: 100%;
            border-radius: 8px;
            margin: 0.8em 0;
          }
        `}</style>
      </div>
    </AnimatePresence>
  );
}
