import React, { useEffect, useCallback, useState, useRef, lazy, Suspense } from 'react';
import { ProjectsDashboard } from './components/projects/ProjectsDashboard';
import { FolderPicker } from './components/projects/FolderPicker';
import { KryptonLoader } from './components/ui/KryptonLoader';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ToastContainer } from './components/ui/ToastContainer';
import { ExtensionConsentModal } from './components/trust/ExtensionConsentModal';
import { useProjectsStore } from './store/useProjectsStore';
import { useIdeStore } from './store/useIdeStore';
import { useAiStore } from './store/useAiStore';
import { useAuthStore } from './store/useAuthStore';
import { useExtensionsStore } from './store/useExtensionsStore';
import { useHarnessStore } from './store/useHarnessStore';
import { useNavbarStore } from './store/useNavbarStore';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { App as CapApp } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import { useBuildStore } from './store/useBuildStore';
import { enableBackgroundMode, disableBackgroundMode } from './lib/backgroundMode';
import { useFileWatcher } from './hooks/useFileWatcher';
import { checkStoragePermission } from './lib/storagePermission';
import {
  isStorageInitialized,
  initializeStorage,
  migrateFromLocalStorage,
  readConfig,
  saveConfigNow,
  writeProjectFiles,
  readFontFile,
  type KryptonConfig,
} from './lib/fileSystemStorage';

// Monaco, xterm, and the full editor surface are only needed after a project opens.
const IdeLayout = lazy(() => import('./components/layout/IdeLayout').then((m) => ({ default: m.IdeLayout })));

export default function App() {
  useFileWatcher();
  const { currentProjectId, projects, closeProject } = useProjectsStore();
  const { loadProject, theme, isHapticsEnabled } = useIdeStore();
  const [storageReady, setStorageReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const loadedProjectIdRef = useRef<string | null>(null);

  // ── Check & init storage ──
  const boot = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      const hasPerm = await checkStoragePermission();
      if (!hasPerm) {
        console.log('[App] Storage permission missing on boot — prompting user');
        setStorageReady(false);
        setIsLoading(false);
        return;
      }
    }

    if (!isStorageInitialized()) {
      console.log('[App] Storage not initialized yet — showing FolderPicker onboarding');
      setStorageReady(false);
      setIsLoading(false);
      return;
    }

    // Storage is ready — load all data from disk
    setStorageReady(true);
    try {
      // Load config first — self-heal if corrupt
      let config = await readConfig();
      if (!config) {
        console.warn('[App] Config missing or corrupt — writing fresh defaults');
        const freshConfig: KryptonConfig = {
          welcomed: true, haptics: true, theme: 'light',
          activeFont: '', installedFonts: [],
          ai: { provider: '', model: '', activeSessionId: null, savedModels: [], activeModelId: undefined },
        };
        await saveConfigNow(freshConfig);
        config = freshConfig;
      }
      useIdeStore.getState().setTheme(config.theme || 'light');
      useIdeStore.getState().setHaptics(config.haptics !== false);
      useIdeStore.getState().setActiveFont(config.activeFont || '');

      // Load all stores from disk in parallel
      await Promise.race([
        Promise.all([
          useProjectsStore.getState().loadFromDisk(),
          useAiStore.getState().loadFromDisk(),
          useAuthStore.getState().loadFromDisk(),
          useExtensionsStore.getState().loadFromDisk(),
          useHarnessStore.getState().loadHarnessConfig(),
        ]),
        new Promise((r) => setTimeout(r, 3500)),
      ]);
    } catch (e) {
      console.error('[App] Boot error:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    boot();
    if (typeof window !== 'undefined') {
      (window as any).__KRYPTON_OPEN_PROJECT__ = (id: string) => {
        useProjectsStore.getState().openProject(id);
      };
      (window as any).__KRYPTON_STORES__ = {
        projects: useProjectsStore,
        ide: useIdeStore,
        auth: useAuthStore,
        navbar: useNavbarStore,
        extensions: useExtensionsStore,
      };
    }
  }, [boot]);

  // Re-check boot on app resume if storage is not ready yet
  useEffect(() => {
    if (storageReady) return;

    const handleResume = () => {
      boot();
    };

    const sub = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) handleResume();
    });

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleResume();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('resume', handleResume);
    window.addEventListener('focus', handleResume);

    return () => {
      sub.then(h => h.remove()).catch(() => {});
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('resume', handleResume);
      window.removeEventListener('focus', handleResume);
    };
  }, [storageReady, boot]);

  // ── Handle FolderPicker completion ──
  const handleStorageReady = useCallback(async () => {
    setStorageReady(true);
    setIsLoading(true);

    // Load config to check welcomed state — self-heal if corrupt
    let config = await readConfig();
    if (!config) {
      console.warn('[App] Config missing after init — writing fresh defaults');
      const freshConfig: KryptonConfig = {
        welcomed: true, haptics: true, theme: 'light',
        activeFont: '', installedFonts: [],
        ai: { provider: '', model: '', activeSessionId: null, savedModels: [], activeModelId: undefined },
      };
      await saveConfigNow(freshConfig);
      config = freshConfig;
    }
    useIdeStore.getState().setTheme(config.theme || 'light');
    useIdeStore.getState().setHaptics(config.haptics !== false);
    useIdeStore.getState().setActiveFont(config.activeFont || '');

    // Load stores
    try {
      await Promise.race([
        Promise.all([
          useProjectsStore.getState().loadFromDisk(),
          useAiStore.getState().loadFromDisk(),
          useAuthStore.getState().loadFromDisk(),
          useExtensionsStore.getState().loadFromDisk(),
          useHarnessStore.getState().loadHarnessConfig(),
        ]),
        new Promise((r) => setTimeout(r, 3500)),
      ]);
    } catch (e) {
      console.error('[App] Storage ready load error:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Global Theme Injector ──
  useEffect(() => {
    const isLight = theme === 'light';
    const bgColor = isLight ? '#f3f0e7' : '#2a2529';
    const style = isLight ? Style.Light : Style.Dark;

    // 1. Set data-theme attribute & toggle class
    document.documentElement.setAttribute('data-theme', theme);
    if (isLight) {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }

    // 2. Persist theme to filesystem config
    readConfig().then(config => {
      if (config && config.theme !== theme) {
        config.theme = theme;
        saveConfigNow(config);
      }
    });

    // 3. Update Meta Theme Color (drives Android Navigation Bar in WebView)
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', bgColor);
    }

    // 4. Update Capacitor Status Bar
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style }).catch(e => console.warn('[App] StatusBar style error:', e));
      if (Capacitor.getPlatform() === 'android') {
        StatusBar.setBackgroundColor({ color: bgColor }).catch(e => console.warn('[App] StatusBar background error:', e));
      }
    }
  }, [theme]);

  // ── Global Font Injector ──
  const { activeFont } = useIdeStore();
  useEffect(() => {
    if (activeFont) {
      readFontFile(activeFont).then(fontData => {
        if (fontData) {
          const styleId = `krypton-font-${activeFont}`;
          if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `@font-face { font-family: '${activeFont}'; src: url('${fontData}'); }`;
            document.head.appendChild(style);
          }
          document.documentElement.style.setProperty('--krypton-font', `'${activeFont}', 'Inter', ui-sans-serif, system-ui, sans-serif`);
        }
      });
    } else {
      document.documentElement.style.removeProperty('--krypton-font');
    }
  }, [activeFont]);

  useEffect(() => {
    if (currentProjectId && currentProjectId !== loadedProjectIdRef.current && projects[currentProjectId]) {
      const projectFiles = projects[currentProjectId].files;
      // Guard: only load if the project has actual file data
      if (projectFiles && Object.keys(projectFiles).length > 0) {
        loadProject(projectFiles);
        loadedProjectIdRef.current = currentProjectId;
      }
    } else if (!currentProjectId) {
      loadedProjectIdRef.current = null;
    }
  }, [currentProjectId, projects, loadProject]);

  // ── Global Build Status Poller ──
  const { buildStatus, pollStatus } = useBuildStore();
  useEffect(() => {
    let interval: any;
    const project = currentProjectId ? projects[currentProjectId] : null;
    
    if (buildStatus === 'building' && project?.githubRepo) {
      const [owner, repoName] = project.githubRepo.split('/');
      interval = setInterval(() => {
        pollStatus(owner, repoName);
      }, 5000);
    }
    
    return () => clearInterval(interval);
  }, [buildStatus, currentProjectId, projects, pollStatus]);

  // ── Capacitor native initialization ──
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    
    document.documentElement.classList.add('is-native');
    if (Capacitor.getPlatform() === 'android') {
      document.documentElement.classList.add('is-android');
    }

    // Status bar: honor the persisted theme (Ivory by default) to avoid a dark FOUC
    const initialLight = useIdeStore.getState().theme === 'light';
    StatusBar.setStyle({ style: initialLight ? Style.Light : Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: initialLight ? '#f3f0e7' : '#2a2529' }).catch(() => {});

    // Splash screen: hide after app renders
    SplashScreen.hide().catch(() => {});

    // Keyboard: native resize mode
    Keyboard.setResizeMode({ mode: 'native' as any }).catch(() => {});

    // Android back button handler
    const backHandler = CapApp.addListener('backButton', () => {
      const ide = useIdeStore.getState();
      const proj = useProjectsStore.getState();

      if (ide.isAiFullscreen) {
        ide.setAiFullscreen(false);
        return;
      }
      if (ide.isPreviewOpen) {
        ide.setPreviewOpen(false);
        return;
      }
      if (ide.isCommandPaletteOpen) {
        ide.setCommandPaletteOpen(false);
        return;
      }
      if (ide.isSidebarOpen) {
        ide.toggleSidebar();
        return;
      }
      const modalCloseBtn = document.querySelector<HTMLElement>(
        '[role="dialog"] button[aria-label="Close"], .fixed.inset-0 button[aria-label="Close"]'
      );
      if (modalCloseBtn) {
        modalCloseBtn.click();
        return;
      }
      if (proj.currentProjectId) {
        const confirmClose = window.confirm('Do you want to save and close the current project?');
        if (confirmClose) {
          saveCurrentProject();
          proj.closeProject();
        }
        return;
      }
      CapApp.exitApp();
    });

    // App state change: save when backgrounded, re-acquire wake lock when foregrounded
    const stateHandler = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        // Going to background — save immediately
        saveCurrentProject();
      }
    });

    return () => {
      backHandler.then(h => h.remove());
      stateHandler.then(h => h.remove());
    };
  }, []);

  // ── Auto-save: sync IDE files back to project store + disk ──
  const saveCurrentProject = useCallback(async () => {
    const pid = useProjectsStore.getState().currentProjectId;
    if (!pid) return;
    const currentFiles = useIdeStore.getState().files;
    if (Object.keys(currentFiles).length > 0) {
      useProjectsStore.getState().updateProjectFiles(pid, currentFiles);
      // Also write files directly to disk (immediate, not debounced)
      try {
        await writeProjectFiles(pid, currentFiles);
      } catch (e) {
        console.error('[App] Save project to disk error:', e);
      }
    }

    // Also persist config (theme, haptics, etc.)
    try {
      const config = await readConfig();
      if (config) {
        config.theme = useIdeStore.getState().theme;
        config.haptics = useIdeStore.getState().isHapticsEnabled;
        await saveConfigNow(config);
      }
    } catch (e) {
      console.error('[App] Save config error:', e);
    }
  }, []);

  useEffect(() => {
    // Save on visibility change (switching tabs/apps — critical for mobile)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveCurrentProject();
      }
    };

    // Save on window blur (alt-tab, switching apps)
    const handleBlur = () => saveCurrentProject();

    // Save before browser closes
    const handleBeforeUnload = () => saveCurrentProject();

    // Periodic auto-save every 30 seconds
    const interval = setInterval(saveCurrentProject, 30000);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [saveCurrentProject]);

  // ── Persist theme and haptics changes to config ──
  useEffect(() => {
    if (!storageReady) return;
    const persistSettings = async () => {
      try {
        const config = await readConfig();
        if (config) {
          config.theme = theme;
          config.haptics = isHapticsEnabled;
          await saveConfigNow(config);
        }
      } catch (e) {
        console.error('[App] Persist settings error:', e);
      }
    };
    persistSettings();
  }, [theme, isHapticsEnabled, storageReady]);

  // ── Background Mode: keep alive when a project is open ──
  useEffect(() => {
    if (currentProjectId) {
      enableBackgroundMode();
    } else {
      disableBackgroundMode();
    }
    return () => {
      disableBackgroundMode();
    };
  }, [currentProjectId]);

  const handleBackToProjects = () => {
    saveCurrentProject();
    closeProject();
  };

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className={`fixed inset-0 flex items-center justify-center ${theme === 'light' ? 'bg-[#f3f0e7] text-[#2a2529]' : 'bg-[#2a2529] text-[#f3f0e7]'}`}>
        <KryptonLoader text="Loading Workspace..." size="lg" />
      </div>
    );
  }

  // ── FolderPicker gate ──
  if (!storageReady) {
    return <FolderPicker onComplete={handleStorageReady} />;
  }

  return (
    <ErrorBoundary>
      <ToastContainer />
      <ExtensionConsentModal />
      {!currentProjectId ? (
        <ProjectsDashboard />
      ) : (
        <Suspense
          fallback={
            <div className={`fixed inset-0 flex items-center justify-center ${theme === 'light' ? 'bg-[#f3f0e7] text-[#2a2529]' : 'bg-[#2a2529] text-[#f3f0e7]'}`}>
              <KryptonLoader text="Opening Editor..." size="lg" />
            </div>
          }
        >
          <IdeLayout onBackToProjects={handleBackToProjects} />
        </Suspense>
      )}
    </ErrorBoundary>
  );
}
