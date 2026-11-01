import React, { useRef, useState, useEffect } from 'react';
import {
  Moon, Sun, Monitor, Trash2, Info, Github, LogOut, ExternalLink,
  Loader, CloudUpload, CloudDownload, Type, ChevronDown, RefreshCw,
  CheckCircle, CheckCircle2, AlertCircle, Copy, Check, FolderDown, FolderUp, Vibrate, Shield,
  Database, UserCheck, HardDrive, Sparkles, Layers, Sliders, Zap,
  Terminal, Bot, AlertTriangle, TerminalSquare, Code2
} from 'lucide-react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth as firebaseAuth, googleProvider } from '../../lib/firebase';
import { getCustomCss, applyCustomCss } from '../../lib/customCssManager';
import { useToastStore } from '../../store/useToastStore';
import { startDeviceFlow, type DeviceFlowSession } from '../../lib/githubOAuth';
import { useIdeStore } from '../../store/useIdeStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useProjectsStore } from '../../store/useProjectsStore';
import { useHarnessStore, type ExecutionMode } from '../../store/useHarnessStore';
import { useTerminalScanner } from '../../hooks/useTerminalScanner';
import JSZip from 'jszip';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import {
  readConfig,
  saveConfigNow,
  saveFontFile,
  deleteFontFile,
  readFontFile,
  getBasePath,
} from '../../lib/fileSystemStorage';
import {
  syncUpToDrive,
  syncDownFromDrive,
  getLastSyncInfo,
  setDriveAccessToken,
  getDriveAccessToken,
} from '../../lib/googleDriveSync';

import { AgentSettingsPanel } from '../settings/AgentSettingsPanel';
import { useNavbarStore } from '../../store/useNavbarStore';

type SettingsTab = 'account' | 'appearance' | 'agent' | 'terminal' | 'sync' | 'preferences' | 'about';

export function SettingsPanel() {
  const { files, loadProject, theme, setTheme, isHapticsEnabled, setHaptics } = useIdeStore();
  const { githubToken, githubUser, googleUser, googleAccessToken, setGithubToken, clearGithub, clearGoogle, setGoogleAuth } = useAuthStore();
  const { projects } = useProjectsStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);

  const { defaultHarnessId, setDefaultHarnessId, getInstalledHarnesses, executionMode, setExecutionMode } = useHarnessStore();
  const { tools: scannedTools, isScanning: isScanningTools, scanTools } = useTerminalScanner();
  const installedHarnesses = getInstalledHarnesses();

  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const [tokenInput, setTokenInput] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  
  // GitHub Device Flow state
  const [deviceFlowSession, setDeviceFlowSession] = useState<DeviceFlowSession | null>(null);
  const [deviceFlowStatus, setDeviceFlowStatus] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
  const [codeCopied, setCodeCopied] = useState(false);

  // Cloud Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ message: string; success: boolean } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Font state
  const [activeFont, setActiveFont] = useState('');
  const [installedFonts, setInstalledFonts] = useState<string[]>([]);
  const [showFontDropdown, setShowFontDropdown] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [customCssText, setCustomCssText] = useState(getCustomCss());

  const isLight = theme === 'light';
  const isHc = theme === 'hc-black';

  // Dynamic Theme Palette Tokens
  const cardBg = isLight ? 'bg-white/80' : isHc ? 'bg-[#121212]' : 'bg-[#342f33]';
  const cardBorder = isLight ? 'border-[#2a2529]/10' : isHc ? 'border-white/30' : 'border-[#f3f0e7]/10';
  const textPrimary = isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]';
  const textMuted = isLight ? 'text-[#2a2529]/75' : 'text-[#f3f0e7]/75';
  const textSubtle = isLight ? 'text-[#2a2529]/65' : 'text-[#f3f0e7]/70';
  const buttonSecondary = isLight
    ? 'bg-[#e6e2d6] hover:bg-[#d8d3c5] text-[#2a2529] border-[#2a2529]/10'
    : isHc
    ? 'bg-[#1e1e1e] hover:bg-[#2e2e2e] text-white border-white/20'
    : 'bg-[#2a2529] hover:bg-[#3d373c] text-[#f3f0e7] border-[#f3f0e7]/10';

  useEffect(() => {
    readConfig().then(config => {
      if (config) {
        setActiveFont(config.activeFont || '');
        setInstalledFonts(config.installedFonts || []);
      }
    });
    loadLastSyncInfo();
  }, []);

  useEffect(() => {
    if (!activeFont) return;
    loadFontIntoDOM(activeFont);
  }, [activeFont]);

  async function loadFontIntoDOM(fontName: string) {
    const fontData = await readFontFile(fontName);
    if (fontData) {
      const existingStyle = document.getElementById(`krypton-font-${fontName}`);
      if (existingStyle) existingStyle.remove();

      const style = document.createElement('style');
      style.id = `krypton-font-${fontName}`;
      style.textContent = `@font-face { font-family: '${fontName}'; src: url('${fontData}'); }`;
      document.head.appendChild(style);

      document.documentElement.style.setProperty('--krypton-font', `'${fontName}', 'Urbanist', 'Inter', ui-sans-serif, system-ui, sans-serif`);
    }
  }

  const triggerHaptic = () => {
    if (Capacitor.isNativePlatform() && isHapticsEnabled) {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    }
  };

  const loadLastSyncInfo = async () => {
    try {
      const info = await getLastSyncInfo();
      if (info?.lastSync) {
        setLastSyncTime(new Date(info.lastSync).toLocaleString());
      }
    } catch {}
  };

  const refreshGoogleToken = async () => {
    try {
      if (!Capacitor.isNativePlatform()) {
        await handleGoogleLogin();
        return;
      }
      const result = await FirebaseAuthentication.signInWithGoogle({
        scopes: [
          'https://www.googleapis.com/auth/drive.appdata',
          'https://www.googleapis.com/auth/drive.file'
        ],
        useCredentialManager: false,
      } as any);
      const token = result?.credential?.accessToken || (result as any)?.accessToken;
      if (token && googleUser) {
        setDriveAccessToken(token);
        useAuthStore.getState().setGoogleAuth(googleUser, token);
      }
    } catch (e) {
      console.warn('Token refresh failed:', e);
    }
  };

  const handleGoogleLogin = async () => {
    triggerHaptic();
    setIsGoogleLoading(true);
    try {
      if (!Capacitor.isNativePlatform()) {
        try {
          const result = await signInWithPopup(firebaseAuth, googleProvider);
          const credential = GoogleAuthProvider.credentialFromResult(result);
          const accessToken = credential?.accessToken || '';
          const user = {
            name: result.user.displayName || result.user.email || 'Google User',
            email: result.user.email || '',
            picture: result.user.photoURL || '',
          };
          setGoogleAuth(user, accessToken);
          if (accessToken) setDriveAccessToken(accessToken);
          useToastStore.getState().success(`Signed in as ${user.name}`);
          setIsGoogleLoading(false);
          return;
        } catch (popupErr: any) {
          console.warn('Firebase signInWithPopup failed, attempting GIS fallback:', popupErr);
          if (typeof window !== 'undefined') {
            if (!(window as any).google?.accounts?.oauth2) {
              await new Promise<void>((resolve, reject) => {
                const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
                if (existing) {
                  existing.addEventListener('load', () => resolve());
                  existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')));
                  return;
                }
                const script = document.createElement('script');
                script.src = 'https://accounts.google.com/gsi/client';
                script.async = true;
                script.defer = true;
                script.onload = () => resolve();
                script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
                document.head.appendChild(script);
              });
            }

            const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '228869160750-nqir9tev4919koqbcsrnhfo5puorqtqa.apps.googleusercontent.com';
            const client = (window as any).google.accounts.oauth2.initTokenClient({
              client_id: clientId,
              scope: 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
              callback: async (tokenResponse: any) => {
                if (tokenResponse?.error) {
                  console.error('GIS Error:', tokenResponse);
                  setIsGoogleLoading(false);
                  return;
                }
                const accessToken = tokenResponse.access_token;
                try {
                  const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${accessToken}` },
                  });
                  const profile = profileRes.ok ? await profileRes.json() : null;
                  const user = {
                    name: profile?.name || profile?.email || 'Google User',
                    email: profile?.email || '',
                    picture: profile?.picture || '',
                  };
                  setGoogleAuth(user, accessToken);
                  setDriveAccessToken(accessToken);
                } catch {
                  setGoogleAuth({ name: 'Google User', email: '', picture: '' }, accessToken);
                  setDriveAccessToken(accessToken);
                } finally {
                  setIsGoogleLoading(false);
                }
              },
              error_callback: (err: any) => {
                console.error('GIS Error Callback:', err);
                setIsGoogleLoading(false);
              },
            });
            client.requestAccessToken({ prompt: 'consent' });
            return;
          }
        }
      }

      const response = await FirebaseAuthentication.signInWithGoogle({
        scopes: [
          'https://www.googleapis.com/auth/drive.appdata',
          'https://www.googleapis.com/auth/drive.file'
        ],
        useCredentialManager: false,
      } as any);

      const user = {
        name: response.user?.displayName || response.user?.email || 'Google User',
        email: response.user?.email || '',
        picture: response.user?.photoUrl || '',
      };
      const accessToken = response.credential?.accessToken || (response as any).accessToken || '';
      setGoogleAuth(user, accessToken);
      if (accessToken) setDriveAccessToken(accessToken);
    } catch (err: any) {
      console.error('Google Sign-In Error:', err);
      useToastStore.getState().error(err?.message || 'Google Sign-In failed');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleGithubConnect = async () => {
    if (!tokenInput.trim()) return;
    triggerHaptic();
    setIsConnecting(true);
    setConnectError('');
    const success = await setGithubToken(tokenInput.trim());
    if (!success) setConnectError('Invalid Personal Access Token');
    setTokenInput('');
    setIsConnecting(false);
  };

  const handleGithubDeviceFlow = async () => {
    triggerHaptic();

    setDeviceFlowStatus('waiting');
    setConnectError('');
    try {
      const session = await startDeviceFlow();
      setDeviceFlowSession(session);
      const result = await session.waitForToken();
      if (result.status === 'complete') {
        const success = await setGithubToken(result.token);
        if (success) {
          setDeviceFlowStatus('success');
          setTimeout(() => {
            setDeviceFlowStatus('idle');
            setDeviceFlowSession(null);
          }, 2000);
        } else {
          setDeviceFlowStatus('error');
          setConnectError('Token validation failed');
        }
      } else if (result.status === 'expired') {
        setDeviceFlowStatus('error');
        setConnectError('Code expired. Try again.');
      } else {
        setDeviceFlowStatus('error');
        setConnectError((result as any).message || 'Login failed');
      }
    } catch (err: any) {
      setDeviceFlowStatus('error');
      setConnectError(err.message || 'Failed to start login');
    }
    setDeviceFlowSession(null);
  };

  const cancelDeviceFlow = () => {
    if (deviceFlowSession) deviceFlowSession.cancel();
    setDeviceFlowSession(null);
    setDeviceFlowStatus('idle');
    setConnectError('');
  };

  const copyDeviceCode = () => {
    if (deviceFlowSession) {
      navigator.clipboard.writeText(deviceFlowSession.userCode).catch(() => {});
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const handleSyncUpload = async () => {
    triggerHaptic();
    if (!googleUser) return;
    if (!getDriveAccessToken()) {
      setSyncStatus({ message: 'Google authorization expired. Please sign in again.', success: false });
      setTimeout(() => setSyncStatus(null), 5000);
      return;
    }
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const result = await syncUpToDrive();
      setSyncStatus({ message: result.message, success: result.success });
      if (result.success) setLastSyncTime(new Date().toLocaleString());
    } catch (err: any) {
      setSyncStatus({ message: `Upload failed: ${err.message}`, success: false });
    }
    setIsSyncing(false);
    setTimeout(() => setSyncStatus(null), 5000);
  };

  const handleSyncDownload = async () => {
    triggerHaptic();
    if (!googleUser) return;
    if (!getDriveAccessToken()) {
      setSyncStatus({ message: 'Google authorization expired. Please sign in again.', success: false });
      setTimeout(() => setSyncStatus(null), 5000);
      return;
    }
    if (!confirm('This will overwrite local workspace data with cloud backup. Continue?')) return;
    setIsDownloading(true);
    setSyncStatus(null);
    try {
      const result = await syncDownFromDrive();
      setSyncStatus({ message: result.message, success: result.success });
      if (result.success) {
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (err: any) {
      setSyncStatus({ message: `Download failed: ${err.message}`, success: false });
    }
    setIsDownloading(false);
    setTimeout(() => setSyncStatus(null), 5000);
  };

  const handleExportZip = async () => {
    triggerHaptic();
    const zip = new JSZip();
    const addToZip = (nodeId: string, currentPath: string) => {
      const node = files[nodeId];
      if (!node) return;
      if (node.type === 'file' && node.content !== undefined) {
        zip.file(`${currentPath}${node.name}`, node.content);
      } else if (node.type === 'folder' && node.children) {
        const newPath = nodeId === 'root' ? '' : `${currentPath}${node.name}/`;
        node.children.forEach(childId => addToZip(childId, newPath));
      }
    };
    addToZip('root', '');
    const fileName = `${files.root?.name || 'project'}.zip`;

    if (Capacitor.isNativePlatform()) {
      try {
        const base64 = await zip.generateAsync({ type: 'base64' });
        const res = await Filesystem.writeFile({
          path: fileName,
          data: base64,
          directory: Directory.Documents,
        });
        setSyncStatus({ message: `Exported ${fileName} to Documents`, success: true });
        setTimeout(() => setSyncStatus(null), 5000);
        try {
          if (res.uri) {
            await Share.share({
              title: fileName,
              url: res.uri,
              dialogTitle: `Share ${fileName}`,
            });
          }
        } catch {
          // ignore share dismiss
        }
      } catch (err: any) {
        setSyncStatus({ message: `Export failed: ${err.message}`, success: false });
        setTimeout(() => setSyncStatus(null), 5000);
      }
    } else {
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleImportZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(file);
      const newFiles: Record<string, any> = {
        'root': { id: 'root', name: file.name.replace('.zip', '') || 'Project', type: 'folder', parentId: null, children: [] }
      };
      const genId = () => Math.random().toString(36).substring(2, 9);
      for (const [relativePath, zipEntry] of Object.entries(contents.files)) {
        if (zipEntry.dir) continue;
        const content = await zipEntry.async('string');
        const parts = relativePath.split('/');
        const fileName = parts.pop() || 'unnamed';
        let currentParentId = 'root';
        for (const part of parts) {
          let folderId = newFiles[currentParentId].children.find((id: string) => newFiles[id]?.name === part && newFiles[id]?.type === 'folder');
          if (!folderId) {
            folderId = genId();
            newFiles[folderId] = { id: folderId, name: part, type: 'folder', parentId: currentParentId, children: [] };
            newFiles[currentParentId].children.push(folderId);
          }
          currentParentId = folderId;
        }
        const fileId = genId();
        newFiles[fileId] = { id: fileId, name: fileName, type: 'file', content, parentId: currentParentId };
        newFiles[currentParentId].children.push(fileId);
      }
      loadProject(newFiles);
    } catch (error) {
      alert('Failed to import zip file.');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const fontData = reader.result as string;
      const fontName = file.name.replace(/\.(ttf|otf|woff2?|eot)$/i, '');
      await saveFontFile(fontName, fontData);
      const config = await readConfig();
      if (config) {
        if (!config.installedFonts.includes(fontName)) config.installedFonts.push(fontName);
        config.activeFont = fontName;
        await saveConfigNow(config);
      }
      await loadFontIntoDOM(fontName);
      setActiveFont(fontName);
      useIdeStore.getState().setActiveFont(fontName);
      setInstalledFonts(prev => [...new Set([...prev, fontName])]);
    };
    reader.readAsDataURL(file);
    if (fontInputRef.current) fontInputRef.current.value = '';
  };

  const handleSelectFont = async (fontName: string) => {
    setShowFontDropdown(false);
    if (fontName === '') {
      setActiveFont('');
      useIdeStore.getState().setActiveFont('');
      document.documentElement.style.removeProperty('--krypton-font');
      const config = await readConfig();
      if (config) { config.activeFont = ''; await saveConfigNow(config); }
      return;
    }
    setActiveFont(fontName);
    useIdeStore.getState().setActiveFont(fontName);
    await loadFontIntoDOM(fontName);
    const config = await readConfig();
    if (config) { config.activeFont = fontName; await saveConfigNow(config); }
  };

  const handleDeleteFont = async (fontName: string) => {
    await deleteFontFile(fontName);
    const newList = installedFonts.filter(f => f !== fontName);
    setInstalledFonts(newList);
    const config = await readConfig();
    if (config) {
      config.installedFonts = newList;
      if (config.activeFont === fontName) config.activeFont = '';
      await saveConfigNow(config);
    }
    if (activeFont === fontName) {
      setActiveFont('');
      useIdeStore.getState().setActiveFont('');
      document.documentElement.style.removeProperty('--krypton-font');
    }
  };

  const handleClearData = () => {
    triggerHaptic();
    if (confirm('Clear all local workspace data and reset application?')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className={`flex flex-col h-full ${textPrimary} overflow-hidden select-none`}>
      {/* ── Segmented Navigation Bar ── */}
      <div 
        role="tablist" 
        aria-label="Settings categories"
        className={`flex items-center space-x-1 p-2 border-b ${cardBorder} flex-shrink-0 overflow-x-auto scrollbar-hide`}
      >
        <button
          role="tab"
          aria-selected={activeTab === 'account'}
          onClick={() => { triggerHaptic(); setActiveTab('account'); }}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all min-h-[36px] whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${
            activeTab === 'account' ? (isLight ? 'bg-[#2a2529] text-white shadow-sm font-bold' : 'bg-[#f3f0e7] text-[#2a2529] font-bold shadow-sm') : textMuted
          }`}
        >
          <UserCheck size={14} />
          <span>Accounts</span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'appearance'}
          onClick={() => { triggerHaptic(); setActiveTab('appearance'); }}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all min-h-[36px] whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${
            activeTab === 'appearance' ? (isLight ? 'bg-[#2a2529] text-white shadow-sm font-bold' : 'bg-[#f3f0e7] text-[#2a2529] font-bold shadow-sm') : textMuted
          }`}
        >
          <Sparkles size={14} />
          <span>Appearance</span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'agent'}
          onClick={() => { triggerHaptic(); setActiveTab('agent'); }}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all min-h-[36px] whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${
            activeTab === 'agent' ? (isLight ? 'bg-[#2a2529] text-white shadow-sm font-bold' : 'bg-[#f3f0e7] text-[#2a2529] font-bold shadow-sm') : textMuted
          }`}
        >
          <Sparkles size={14} className="text-teal-400" />
          <span>Agent</span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'terminal'}
          onClick={() => { triggerHaptic(); setActiveTab('terminal'); }}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all min-h-[36px] whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${
            activeTab === 'terminal' ? (isLight ? 'bg-[#2a2529] text-white shadow-sm font-bold' : 'bg-[#f3f0e7] text-[#2a2529] font-bold shadow-sm') : textMuted
          }`}
        >
          <Terminal size={14} className="text-emerald-400" />
          <span>Terminal</span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'sync'}
          onClick={() => { triggerHaptic(); setActiveTab('sync'); }}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all min-h-[36px] whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${
            activeTab === 'sync' ? (isLight ? 'bg-[#2a2529] text-white shadow-sm font-bold' : 'bg-[#f3f0e7] text-[#2a2529] font-bold shadow-sm') : textMuted
          }`}
        >
          <CloudUpload size={14} />
          <span>Storage</span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'preferences'}
          onClick={() => { triggerHaptic(); setActiveTab('preferences'); }}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all min-h-[36px] whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${
            activeTab === 'preferences' ? (isLight ? 'bg-[#2a2529] text-white shadow-sm font-bold' : 'bg-[#f3f0e7] text-[#2a2529] font-bold shadow-sm') : textMuted
          }`}
        >
          <Sliders size={14} />
          <span>Preferences</span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'about'}
          onClick={() => { triggerHaptic(); setActiveTab('about'); }}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all min-h-[36px] whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${
            activeTab === 'about' ? (isLight ? 'bg-[#2a2529] text-white shadow-sm font-bold' : 'bg-[#f3f0e7] text-[#2a2529] font-bold shadow-sm') : textMuted
          }`}
        >
          <Info size={14} />
          <span>About</span>
        </button>
      </div>

      {/* ── Main Tab Content View ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        
        {/* ── TAB: AGENT ── */}
        {activeTab === 'agent' && (
          <div className="h-full flex flex-col -m-4">
            <AgentSettingsPanel />
          </div>
        )}

        {/* ── TAB: TERMINAL & AGENT TOOLS ── */}
        {activeTab === 'terminal' && (
          <div className="space-y-4 animate-fade-in">
            {/* Default Agent Harness Card */}
            <div className={`p-4 rounded-2xl border ${cardBg} ${cardBorder} shadow-sm space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-violet-500/20 text-violet-300 flex items-center justify-center">
                    <Bot size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider">Default Agent Harness</h4>
                    <p className={`text-[11px] ${textMuted}`}>Routes Command Palette & editor AI actions</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {installedHarnesses.length} Installed
                </span>
              </div>

              <div>
                <label className={`text-xs font-medium ${textMuted} mb-1.5 block`}>
                  Active Harness (Installed Only):
                </label>
                <select
                  value={defaultHarnessId}
                  onChange={(e) => {
                    triggerHaptic();
                    setDefaultHarnessId(e.target.value);
                  }}
                  className={`w-full p-2.5 rounded-xl text-sm font-medium border ${cardBorder} bg-black/20 focus:outline-none focus:ring-1 focus:ring-violet-400`}
                >
                  {installedHarnesses.map((h) => (
                    <option key={h.id} value={h.id} className="bg-[#2a2529] text-[#f3f0e7]">
                      {h.name} {h.type === 'internal' ? '(Built-in)' : `(${h.type.toUpperCase()})`}
                    </option>
                  ))}
                </select>
                <p className={`text-[11px] mt-1.5 ${textMuted}`}>
                  {installedHarnesses.find(h => h.id === defaultHarnessId)?.description}
                </p>
              </div>
            </div>

            {/* Real Oorty Upstream Link Card */}
            <div className={`p-4 rounded-2xl border ${cardBg} ${cardBorder} shadow-sm space-y-2.5 bg-gradient-to-br from-[#2a2529] to-[#342f33]`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-violet-500/20 text-violet-300 flex items-center justify-center overflow-hidden p-1">
                    <img src="/oorty_icon.png" alt="Oorty" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#f3f0e7]">Upstream Engine: Oorty v3.14</h4>
                    <p className={`text-[11px] ${textMuted}`}>Distilled from Sednium-Technologies/OORTY</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Official
                </span>
              </div>
              <p className={`text-xs ${textMuted} leading-relaxed`}>
                Oorty Lite is the embedded, hardware-optimized harness distilled from Oorty for mobile and desktop development.
              </p>
              <a
                href="https://github.com/Sednium-Technologies/OORTY"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 text-violet-200 border border-violet-500/40 text-xs font-medium transition-all"
              >
                <span>View Real Oorty on GitHub</span>
                <ExternalLink size={12} />
              </a>
            </div>

            {/* Oorty Lite Terminal Automation Permissions */}
            <div className={`p-4 rounded-2xl border ${cardBg} ${cardBorder} shadow-sm space-y-3`}>
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center">
                  <Terminal size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider">Oorty Lite Terminal Automation</h4>
                  <p className={`text-[11px] ${textMuted}`}>Autonomous execution permission tiers</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => { triggerHaptic(); setExecutionMode('supervised'); }}
                  className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    executionMode === 'supervised'
                      ? 'bg-[#f3f0e7] text-[#2a2529] font-bold border-white shadow-md'
                      : `bg-black/15 ${cardBorder} ${textMuted} hover:bg-white/5`
                  }`}
                >
                  <span className="text-xs font-bold">Supervised</span>
                  <span className="text-[10px] opacity-75 mt-1">Preview & Run</span>
                </button>

                <button
                  type="button"
                  onClick={() => { triggerHaptic(); setExecutionMode('autonomous'); }}
                  className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    executionMode === 'autonomous'
                      ? 'bg-[#f3f0e7] text-[#2a2529] font-bold border-white shadow-md'
                      : `bg-black/15 ${cardBorder} ${textMuted} hover:bg-white/5`
                  }`}
                >
                  <span className="text-xs font-bold">Autonomous</span>
                  <span className="text-[10px] opacity-75 mt-1">Auto Dev Ops</span>
                </button>

                <button
                  type="button"
                  onClick={() => { triggerHaptic(); setExecutionMode('unbound'); }}
                  className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    executionMode === 'unbound'
                      ? 'bg-amber-500 text-black font-bold border-amber-400 shadow-md'
                      : `bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20`
                  }`}
                >
                  <span className="text-xs font-bold flex items-center gap-1">
                    <Zap size={12} /> Unbound
                  </span>
                  <span className="text-[10px] opacity-80 mt-1">YOLO / Full Auto</span>
                </button>
              </div>

              {executionMode === 'unbound' && (
                <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs flex items-start space-x-2">
                  <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>Unbound Mode Active:</strong> Oorty Lite will autonomously execute any terminal command without confirmation prompts or safety filters until tasks finish.
                  </span>
                </div>
              )}
            </div>

            {/* Detected Terminal Binaries & Runtimes */}
            <div className={`p-4 rounded-2xl border ${cardBg} ${cardBorder} shadow-sm space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center">
                    <TerminalSquare size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider">Installed Terminal Binaries</h4>
                    <p className={`text-[11px] ${textMuted}`}>Probed from Termux userland and $PATH</p>
                  </div>
                </div>

                <button
                  onClick={() => { triggerHaptic(); scanTools(); }}
                  disabled={isScanningTools}
                  className={`px-2.5 py-1 rounded-xl text-xs flex items-center space-x-1.5 border ${cardBorder} hover:bg-white/10`}
                >
                  <RefreshCw size={12} className={isScanningTools ? 'animate-spin' : ''} />
                  <span>{isScanningTools ? 'Scanning...' : 'Scan'}</span>
                </button>
              </div>

              <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1 scrollbar-hide">
                {scannedTools.map((tool) => (
                  <div
                    key={tool.id}
                    className={`flex items-center justify-between p-2 rounded-xl border ${cardBorder} bg-black/10`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold font-mono">{tool.binary}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-[#f3f0e7]/70">
                          {tool.category}
                        </span>
                      </div>
                      <p className={`text-[11px] truncate ${textMuted}`}>{tool.name}</p>
                    </div>

                    <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                      {tool.isInstalled ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                          <Check size={10} />
                          <span>Installed</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] rounded-md bg-white/5 text-[#f3f0e7]/40 border border-white/10">
                          Not Installed
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 1: ACCOUNTS ── */}
        {activeTab === 'account' && (
          <div className="space-y-4 animate-fade-in">
            {/* GitHub Card */}
            <div className={`p-4 rounded-2xl border ${cardBg} ${cardBorder} shadow-sm space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-black/10 dark:bg-white/10 flex items-center justify-center">
                    <Github size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider">GitHub Integration</h4>
                    <p className={`text-[11px] ${textMuted}`}>Repository sync & OAuth access</p>
                  </div>
                </div>
              </div>

              {githubUser ? (
                <div className={`flex items-center space-x-3 p-3 rounded-xl border ${cardBorder} ${isLight ? 'bg-[#f3f0e7]' : 'bg-[#2a2529]'}`}>
                  <img src={githubUser.avatar_url} alt="" className="w-9 h-9 rounded-full border border-white/20" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{githubUser.name || githubUser.login}</p>
                    <p className={`text-[11px] ${textMuted}`}>@{githubUser.login} • {githubUser.public_repos} repos</p>
                  </div>
                  <button onClick={clearGithub} className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all" title="Disconnect">
                    <LogOut size={16} />
                  </button>
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  {deviceFlowStatus === 'idle' || deviceFlowStatus === 'error' ? (
                    <>
                      <button
                        onClick={handleGithubDeviceFlow}
                        className="w-full flex items-center justify-center space-x-2 py-2.5 bg-[#238636] hover:bg-[#2ea043] text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-95"
                      >
                        <Github size={16} />
                        <span>Login with GitHub</span>
                      </button>

                      {connectError && <p className="text-rose-400 text-xs text-center">{connectError}</p>}

                      <details className="text-[11px] pt-1">
                        <summary className={`${textMuted} cursor-pointer hover:${textPrimary} font-medium`}>Use Personal Access Token instead</summary>
                        <div className="flex space-x-2 mt-2">
                          <input
                            type="password"
                            value={tokenInput}
                            onChange={e => setTokenInput(e.target.value)}
                            placeholder="ghp_..."
                            className={`flex-1 rounded-xl border ${cardBorder} ${buttonSecondary} px-3 py-2 text-xs focus:outline-none`}
                            onKeyDown={e => e.key === 'Enter' && handleGithubConnect()}
                          />
                          <button
                            onClick={handleGithubConnect}
                            disabled={isConnecting || !tokenInput.trim()}
                            className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] text-white font-bold rounded-xl text-xs disabled:opacity-40 transition-all"
                          >
                            {isConnecting ? <Loader size={14} className="animate-spin" /> : 'Connect'}
                          </button>
                        </div>
                      </details>
                    </>
                  ) : deviceFlowStatus === 'waiting' && deviceFlowSession ? (
                    <div className="space-y-3 p-3 bg-black/20 rounded-xl border border-white/10 text-center">
                      <p className={`text-xs ${textMuted}`}>
                        Enter this authorization code at <span className="text-blue-400 font-bold">github.com/login/device</span>
                      </p>
                      <div className="flex items-center justify-between bg-black/40 rounded-xl px-4 py-2.5 border border-white/10">
                        <span className="font-mono text-xl font-black tracking-[0.3em] text-emerald-400 select-all">
                          {deviceFlowSession.userCode}
                        </span>
                        <button onClick={copyDeviceCode} className="p-2 text-gray-400 hover:text-white rounded-lg transition-colors">
                          {codeCopied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                        </button>
                      </div>
                      <a
                        href={deviceFlowSession.verificationUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center space-x-2 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all"
                      >
                        <ExternalLink size={14} />
                        <span>Open github.com/login/device</span>
                      </a>
                      <div className="flex items-center justify-between pt-1">
                        <span className="flex items-center space-x-1.5 text-amber-400 text-xs">
                          <Loader size={12} className="animate-spin" />
                          <span>Waiting for response...</span>
                        </span>
                        <button onClick={cancelDeviceFlow} className="text-xs text-rose-400 hover:underline">Cancel</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Google Card */}
            <div className={`p-4 rounded-2xl border ${cardBg} ${cardBorder} shadow-sm space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-black/10 dark:bg-white/10 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" width="18" height="18">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider">Google Cloud Account</h4>
                    <p className={`text-[11px] ${textMuted}`}>Cloud Drive sync & backup</p>
                  </div>
                </div>
              </div>

              {googleUser ? (
                <div className={`flex items-center space-x-3 p-3 rounded-xl border ${cardBorder} ${isLight ? 'bg-[#f3f0e7]' : 'bg-[#2a2529]'}`}>
                  {googleUser.picture ? (
                    <img src={googleUser.picture} alt="" className="w-9 h-9 rounded-full border border-white/20" />
                  ) : (
                    <div className="w-9 h-9 rounded-full border border-white/20 bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                      {googleUser.name?.charAt(0)?.toUpperCase() || 'G'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{googleUser.name}</p>
                    <p className={`text-[11px] ${textMuted} truncate`}>{googleUser.email}</p>
                  </div>
                  <button onClick={clearGoogle} className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all" title="Sign Out">
                    <LogOut size={16} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGoogleLogin}
                  disabled={isGoogleLoading}
                  className="w-full flex items-center justify-center space-x-2 py-2.5 bg-white text-[#2a2529] font-bold rounded-xl text-xs transition-all shadow-md hover:bg-gray-100 disabled:opacity-50 active:scale-95"
                >
                  {isGoogleLoading ? <Loader size={16} className="animate-spin" /> : <span>Sign in with Google</span>}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 2: APPEARANCE ── */}
        {activeTab === 'appearance' && (
          <div className="space-y-4 animate-fade-in">
            {/* Theme Selector */}
            <div className={`p-4 rounded-2xl border ${cardBg} ${cardBorder} shadow-sm space-y-3`}>
              <h4 className="text-xs font-bold uppercase tracking-wider">Color Theme</h4>
              <div className="grid grid-cols-3 gap-2.5">
                <button
                  onClick={() => { triggerHaptic(); setTheme('krypton-warm'); }}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${
                    theme === 'krypton-warm' || theme === 'vs-dark'
                      ? 'border-[#7C9B79]/50 bg-[#7C9B79]/15 font-bold shadow-md'
                      : buttonSecondary
                  }`}
                >
                  <Moon size={20} className="mb-1.5 text-[#7C9B79]" />
                  <span className="text-xs font-semibold">Charcoal</span>
                </button>

                <button
                  onClick={() => { triggerHaptic(); setTheme('light'); }}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${
                    theme === 'light'
                      ? 'border-[#2a2529]/30 bg-[#2a2529]/10 font-bold shadow-md'
                      : buttonSecondary
                  }`}
                >
                  <Sun size={20} className="mb-1.5 text-[#2a2529]" />
                  <span className="text-xs font-semibold">Ivory</span>
                </button>

                <button
                  onClick={() => { triggerHaptic(); setTheme('hc-black'); }}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${
                    theme === 'hc-black'
                      ? 'border-white/50 bg-white/10 font-bold shadow-md'
                      : buttonSecondary
                  }`}
                >
                  <Monitor size={20} className="mb-1.5 text-[#F3F0E7]" />
                  <span className="text-xs font-semibold">Contrast</span>
                </button>
              </div>
            </div>

            {/* Typography & Custom Fonts */}
            <div className={`p-4 rounded-2xl border ${cardBg} ${cardBorder} shadow-sm space-y-3`}>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider">Editor Typography</h4>
                  <p className={`text-[11px] ${textMuted} mt-0.5`}>
                    {activeFont ? `Active: ${activeFont}` : 'JetBrains Mono (Default)'}
                  </p>
                </div>
                <button
                  onClick={() => fontInputRef.current?.click()}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 border ${buttonSecondary}`}
                >
                  <Type size={14} />
                  <span>Add Font</span>
                </button>
                <input
                  type="file"
                  ref={fontInputRef}
                  accept=".ttf,.otf,.woff,.woff2,.eot"
                  className="hidden"
                  onChange={handleFontUpload}
                />
              </div>

              {/* Font Dropdown Select */}
              {installedFonts.length > 0 && (
                <div className="relative pt-1">
                  <button
                    onClick={() => setShowFontDropdown(!showFontDropdown)}
                    className={`w-full flex items-center justify-between border ${cardBorder} ${buttonSecondary} rounded-xl px-3.5 py-2.5 text-xs text-left font-medium`}
                  >
                    <span>{activeFont || 'Default (JetBrains Mono)'}</span>
                    <ChevronDown size={14} className={`transform transition-transform ${showFontDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {showFontDropdown && (
                    <div className={`absolute left-0 right-0 mt-1 ${cardBg} border ${cardBorder} rounded-xl shadow-2xl z-30 overflow-hidden max-h-48 overflow-y-auto p-1`}>
                      <button
                        onClick={() => handleSelectFont('')}
                        className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-all flex items-center justify-between ${
                          !activeFont ? 'bg-emerald-500/10 text-emerald-400 font-bold' : textPrimary
                        }`}
                      >
                        <span>Default (JetBrains Mono)</span>
                        {!activeFont && <Check size={14} />}
                      </button>

                      {installedFonts.map(font => (
                        <div key={font} className={`flex items-center justify-between px-3 py-2 text-xs rounded-lg transition-all ${
                          activeFont === font ? 'bg-emerald-500/10 text-emerald-400 font-bold' : textPrimary
                        }`}>
                          <button onClick={() => handleSelectFont(font)} className="flex-1 text-left">
                            {font}
                          </button>
                          <button onClick={() => handleDeleteFont(font)} className="p-1 text-rose-400 hover:bg-rose-500/10 rounded-lg">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeFont && (
                <button onClick={() => handleSelectFont('')} className="text-xs text-rose-400 hover:underline pt-1">
                  Reset to Default Font
                </button>
              )}
            </div>

            {/* Custom CSS Injection Card */}
            <div className={`p-4 rounded-2xl border ${cardBg} ${cardBorder} shadow-sm space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#7C9B79]/15 text-[#7C9B79] flex items-center justify-center">
                    <Code2 size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider">Custom CSS Injection</h4>
                    <p className={`text-[11px] ${textMuted}`}>Inject live styles across the entire Krypton IDE</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    triggerHaptic();
                    applyCustomCss(customCssText);
                    useToastStore.getState().success('Custom CSS applied live');
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#7C9B79] text-white hover:bg-[#7C9B79]/90 active:scale-95 transition-all shadow-sm"
                >
                  Apply Live
                </button>
              </div>
              <textarea
                value={customCssText}
                onChange={(e) => setCustomCssText(e.target.value)}
                placeholder="/* Custom CSS (e.g. .monaco-editor { font-feature-settings: 'liga'; } ) */"
                rows={5}
                className="w-full font-mono text-xs p-3 rounded-xl border bg-black/20 border-[#f3f0e7]/15 focus:outline-none focus:border-[#7C9B79] text-[#f3f0e7]"
              />
            </div>
          </div>
        )}

        {/* ── TAB 3: SYNC & STORAGE ── */}
        {activeTab === 'sync' && (
          <div className="space-y-4 animate-fade-in">
            {/* Storage Directory Info */}
            <div className={`p-4 rounded-2xl border ${cardBg} ${cardBorder} shadow-sm space-y-2`}>
              <div className="flex items-center space-x-2">
                <HardDrive size={16} className="text-emerald-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider">Local Storage Path</h4>
              </div>
              <p className="text-xs font-mono text-emerald-400 break-all bg-black/20 p-2.5 rounded-xl border border-white/5">
                /storage/emulated/0/{getBasePath()}/
              </p>
              <p className={`text-[10px] ${textMuted}`}>Directly accessible via ZArchiver or standard device file managers.</p>
            </div>

            {/* Project Export/Import */}
            <div className={`p-4 rounded-2xl border ${cardBg} ${cardBorder} shadow-sm space-y-3`}>
              <h4 className="text-xs font-bold uppercase tracking-wider">Project Archives (.zip)</h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleExportZip}
                  className={`flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs font-bold border transition-all active:scale-95 ${buttonSecondary}`}
                >
                  <FolderDown size={16} />
                  <span>Export Zip</span>
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs font-bold border transition-all active:scale-95 ${buttonSecondary}`}
                >
                  <FolderUp size={16} />
                  <span>Import Zip</span>
                </button>
                <input type="file" accept=".zip" ref={fileInputRef} className="hidden" onChange={handleImportZip} />
              </div>
            </div>

            {/* Cloud Sync */}
            <div className={`p-4 rounded-2xl border ${cardBg} ${cardBorder} shadow-sm space-y-3`}>
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider">Cloud Backup & Restore</h4>
                {lastSyncTime && (
                  <span className="text-[10px] text-emerald-400 font-mono">Last: {lastSyncTime}</span>
                )}
              </div>

              <div className="space-y-2">
                <button
                  onClick={handleSyncUpload}
                  disabled={isSyncing || !googleUser}
                  className={`w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs font-bold border transition-all disabled:opacity-40 active:scale-95 ${buttonSecondary}`}
                >
                  {isSyncing ? <Loader size={16} className="animate-spin" /> : <CloudUpload size={16} />}
                  <span>{isSyncing ? 'Uploading Backup...' : 'Backup to Google Drive'}</span>
                </button>

                <button
                  onClick={handleSyncDownload}
                  disabled={isDownloading || !googleUser}
                  className={`w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs font-bold border transition-all disabled:opacity-40 active:scale-95 ${buttonSecondary}`}
                >
                  {isDownloading ? <Loader size={16} className="animate-spin" /> : <CloudDownload size={16} />}
                  <span>{isDownloading ? 'Restoring Backup...' : 'Restore from Google Drive'}</span>
                </button>

                {googleUser && Capacitor.isNativePlatform() && (
                  <button onClick={refreshGoogleToken} className={`w-full text-[11px] ${textMuted} hover:${textPrimary} text-center py-1 transition-colors flex items-center justify-center space-x-1`}>
                    <RefreshCw size={12} />
                    <span>Refresh Auth Token</span>
                  </button>
                )}
              </div>

              {syncStatus && (
                <div className={`flex items-center justify-center space-x-1.5 text-xs text-center font-medium ${syncStatus.success ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {syncStatus.success ? <CheckCircle2 size={13} className="shrink-0" /> : <AlertCircle size={13} className="shrink-0" />}
                  <span>{syncStatus.message}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 4: PREFERENCES ── */}
        {activeTab === 'preferences' && (
          <div className="space-y-4 animate-fade-in">
            <div className={`p-4 rounded-2xl border ${cardBg} ${cardBorder} shadow-sm space-y-4`}>
              <h4 className="text-xs font-bold uppercase tracking-wider">Device & Feedback</h4>

              {/* Haptics Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Vibrate size={18} className="text-indigo-400" />
                  <div>
                    <p className="text-xs font-bold">Haptic Feedback</p>
                    <p className={`text-[11px] ${textMuted}`}>Vibrate on button taps & symbol typing</p>
                  </div>
                </div>
                <button
                  onClick={() => { triggerHaptic(); setHaptics(!isHapticsEnabled); }}
                  className={`w-12 h-7 rounded-full transition-all relative p-1 ${
                    isHapticsEnabled ? 'bg-emerald-500' : 'bg-gray-600'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white transition-all transform ${
                    isHapticsEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </div>

            {/* Navigation Bar Customizer */}
            <div className={`p-4 rounded-2xl border ${cardBg} ${cardBorder} shadow-sm space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <Sliders size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider">Navigation Bar</h4>
                    <p className={`text-[11px] ${textMuted}`}>Button count, custom order & overflow menu</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    triggerHaptic();
                    useNavbarStore.getState().setCustomizerOpen(true);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${buttonSecondary} active:scale-95 cursor-pointer shadow-sm`}
                >
                  Customize
                </button>
              </div>
            </div>

            {/* Clear All Data */}
            <div className={`p-4 rounded-2xl border ${cardBg} ${cardBorder} shadow-sm space-y-3`}>
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400">Danger Zone</h4>
              <button
                onClick={handleClearData}
                className="w-full flex items-center justify-center space-x-2 py-2.5 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-bold rounded-xl text-xs transition-all active:scale-95"
              >
                <Trash2 size={16} />
                <span>Clear All Workspace Data</span>
              </button>
            </div>
          </div>
        )}

        {/* ── TAB 5: ABOUT ── */}
        {activeTab === 'about' && (
          <div className="space-y-4 animate-fade-in">
            <div className={`p-4 rounded-2xl border ${cardBg} ${cardBorder} shadow-sm space-y-3`}>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-lg">
                  K
                </div>
                <div>
                  <h4 className="text-sm font-bold">Kryptonide v4.0</h4>
                  <p className={`text-[11px] ${textMuted}`}>Hybrid Native-Core Mobile Code Editor</p>
                </div>
              </div>

              <div className={`p-3 rounded-xl border ${cardBorder} ${isLight ? 'bg-[#f3f0e7]' : 'bg-[#2a2529]'} space-y-2 text-xs`}>
                <p className="flex items-center space-x-1.5">
                  <span className={textMuted}>Author:</span>
                  <a href="https://github.com/CoderBhoid" target="_blank" rel="noopener noreferrer" className="text-cyan-400 font-bold hover:underline">
                    CoderBhoid
                  </a>
                </p>
                <p className="flex flex-wrap gap-x-2 gap-y-1 text-[11px]">
                  <span className={textMuted}>Websites:</span>
                  <a href="https://sednium.com" target="_blank" rel="noopener noreferrer" className="text-emerald-400 font-bold hover:underline">
                    sednium.com
                  </a>
                  <span>•</span>
                  <a href="https://kryptonide.sednium.com" target="_blank" rel="noopener noreferrer" className="text-emerald-400 font-bold hover:underline">
                    kryptonide.sednium.com
                  </a>
                </p>
                <p className={`text-[11px] ${textMuted} leading-relaxed pt-1 flex items-center`}>
                  <Zap size={13} className="text-amber-400 shrink-0 mr-1.5" />
                  <span>Engineered with TypeScript 7, OPFS, React 19, and Monaco Editor.</span>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
