import React, { useRef, useEffect, useState, useMemo } from 'react';
import { RefreshCw, AlertTriangle, Layers } from 'lucide-react';
import { useIdeStore } from '../../store/useIdeStore';
import { useNativeTerminalStore } from '../../store/useNativeTerminalStore';
import { useToastStore } from '../../store/useToastStore';
import { createBlobUrlMap, rewriteHtmlWithBlobMap } from '../../lib/extensionAssetRegistry';

interface ExtensionWebviewHostProps {
  extensionId: string;
  viewId?: string;
  htmlContent?: string;
  title?: string;
  className?: string;
}

export function ExtensionWebviewHost({
  extensionId,
  viewId = 'main',
  htmlContent,
  title = 'Extension Webview',
  className = '',
}: ExtensionWebviewHostProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const theme = useIdeStore((state) => state.theme);
  const isLight = theme === 'light';
  const [loadError, setLoadError] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const [blobMap, setBlobMap] = useState<Record<string, string> | null>(null);
  const [swReady, setSwReady] = useState(false);

  // Initial bi-directional protocol state for assistant / agent harness webviews
  const [extensionState, setExtensionState] = useState(() => ({
    connectionStatus: 'connected',
    user: { email: 'developer@kryptonide', tier: 'Pro' },
    quotas: [] as Array<{ label: string; remaining: number; resetTime: string; hasData?: boolean; themeColor?: string }>,
    tasks: { folders: [] as any[], expanded: true, stats: '0 Tasks' },
    contexts: { folders: [] as any[], expanded: true, stats: '0 Projects' },
    autoAcceptEnabled: false,
    autoAcceptStatus: { running: true, cdp: 'connected', commandCount: 0 },
    gaugeStyle: 'semi-arc',
    uiScale: 1,
  }));

  const extensionStateRef = useRef(extensionState);
  extensionStateRef.current = extensionState;

  const sendPayloadUpdate = (payload: any) => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: 'update',
        payload,
      },
      '*'
    );
  };

  useEffect(() => {
    let mounted = true;
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      if (navigator.serviceWorker.controller) {
        setSwReady(true);
      } else {
        navigator.serviceWorker.ready
          .then(() => {
            if (mounted) setSwReady(true);
          })
          .catch(() => {});
      }
    }
    createBlobUrlMap(extensionId).then((map) => {
      if (mounted) setBlobMap(map);
    });
    return () => {
      mounted = false;
    };
  }, [extensionId, key]);

  // VS Code styling tokens mapped to Charcoal (#2A2529), Matcha Green (#7C9B79), and Pale Ivory (#F3F0E7)
  const themeColors = useMemo(() => {
    return isLight
      ? {
          bg: '#F3F0E7',
          fg: '#2A2529',
          editorBg: '#FFFFFF',
          editorFg: '#2A2529',
          border: 'rgba(42, 37, 41, 0.12)',
          accent: '#7C9B79',
        }
      : {
          bg: '#2A2529',
          fg: '#F3F0E7',
          editorBg: '#1E1A1D',
          editorFg: '#F3F0E7',
          border: 'rgba(243, 240, 231, 0.12)',
          accent: '#7C9B79',
        };
  }, [isLight]);

  const synthesizedDoc = useMemo(() => {
    if (!htmlContent) return null;

    const polyfillScript = `
      <script>
        (function() {
          const EXTENSION_ID = ${JSON.stringify(extensionId)};
          const VIEW_ID = ${JSON.stringify(viewId)};
          let _state = {};
          try {
            _state = JSON.parse(localStorage.getItem('kryptonide_wv_' + EXTENSION_ID) || '{}');
          } catch(e) {}

          window.acquireVsCodeApi = function() {
            return {
              postMessage: function(message) {
                window.parent.postMessage({
                  type: 'vscode-webview-message',
                  extensionId: EXTENSION_ID,
                  viewId: VIEW_ID,
                  message: message
                }, '*');
              },
              getState: function() {
                return _state;
              },
              setState: function(newState) {
                _state = newState;
                try {
                  localStorage.setItem('kryptonide_wv_' + EXTENSION_ID, JSON.stringify(_state));
                } catch(e) {}
                return _state;
              }
            };
          };

          try {
            const vscodeApi = window.acquireVsCodeApi();
            window.vscodeApi = vscodeApi;
          } catch (err) {}

          const root = document.documentElement;
          root.style.setProperty('--vscode-font-family', 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
          root.style.setProperty('--vscode-font-size', '13px');
          root.style.setProperty('--vscode-editor-background', '${themeColors.editorBg}');
          root.style.setProperty('--vscode-editor-foreground', '${themeColors.editorFg}');
          root.style.setProperty('--vscode-sideBar-background', '${themeColors.bg}');
          root.style.setProperty('--vscode-sideBar-foreground', '${themeColors.fg}');
          root.style.setProperty('--vscode-background', '${themeColors.bg}');
          root.style.setProperty('--vscode-foreground', '${themeColors.fg}');
          root.style.setProperty('--vscode-sideBar-border', '${themeColors.border}');
          root.style.setProperty('--vscode-button-background', '${themeColors.accent}');
          root.style.setProperty('--vscode-button-foreground', '#ffffff');
          root.classList.add(${isLight ? "'vscode-light'" : "'vscode-dark'"});
        })();
      </script>
    `;

    let html = htmlContent;
    if (blobMap && Object.keys(blobMap).length > 0) {
      html = rewriteHtmlWithBlobMap(html, blobMap);
    }

    if (html.includes('<head>')) {
      return html.replace('<head>', `<head>${polyfillScript}`);
    } else if (html.includes('<html>')) {
      return html.replace('<html>', `<html><head>${polyfillScript}</head>`);
    } else {
      return `<!DOCTYPE html><html><head>${polyfillScript}</head><body>${html}</body></html>`;
    }
  }, [htmlContent, extensionId, viewId, themeColors, isLight, blobMap]);

  const ensureKryptonFileAndOpen = (fileName: string, defaultContent: string) => {
    const ideStore = useIdeStore.getState();
    const toastStore = useToastStore.getState();

    let kryptonFolder = Object.values(ideStore.files).find(
      (f) => f.type === 'folder' && f.name === '.krypton'
    );
    let folderId = kryptonFolder?.id;
    if (!folderId) {
      folderId = ideStore.createFile('.krypton', 'root', 'folder');
    }

    let targetFile = Object.values(ideStore.files).find(
      (f) => f.name === fileName && f.parentId === folderId
    );
    let fileId = targetFile?.id;
    if (!fileId) {
      fileId = ideStore.createFile(fileName, folderId, 'file', defaultContent);
    }

    ideStore.openFile(fileId);
    toastStore.info(`Opened .krypton/${fileName}`);
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!event.data || event.data.type !== 'vscode-webview-message') return;
      if (event.data.extensionId !== extensionId) return;

      const { message } = event.data;
      if (!message) return;

      const ideStore = useIdeStore.getState();
      const terminalStore = useNativeTerminalStore.getState();
      const toastStore = useToastStore.getState();

      const cmd = message.command || message.type;

      switch (cmd) {
        case 'webviewReady':
        case 'ready':
        case 'init':
          sendPayloadUpdate(extensionStateRef.current);
          break;

        case 'openRules':
        case 'vscode:openRules':
          ensureKryptonFileAndOpen(
            'rules',
            '# Krypton Assistant Rules\n\n1. Be concise and precise.\n2. Write tested, production-grade code.\n'
          );
          break;

        case 'openMcp':
        case 'vscode:openMcp':
          ensureKryptonFileAndOpen('mcp.json', '{\n  "mcpServers": {}\n}\n');
          break;

        case 'openBrowserAllowlist':
        case 'vscode:openBrowserAllowlist':
          ensureKryptonFileAndOpen('allowlist', '# Krypton Browser Allowlist\nlocalhost\n127.0.0.1\n');
          break;

        case 'restartLanguageServer':
        case 'vscode:restartLanguageServer':
          toastStore.success('Language server restarted');
          break;

        case 'toggleTask':
        case 'toggleTasks':
          setExtensionState((prev) => {
            const next = {
              ...prev,
              tasks: {
                ...prev.tasks,
                expanded: !prev.tasks.expanded,
              },
            };
            sendPayloadUpdate(next);
            return next;
          });
          break;

        case 'toggleContext':
        case 'toggleProjects':
          setExtensionState((prev) => {
            const next = {
              ...prev,
              contexts: {
                ...prev.contexts,
                expanded: !prev.contexts.expanded,
              },
            };
            sendPayloadUpdate(next);
            return next;
          });
          break;

        case 'toggleAutoAccept':
          setExtensionState((prev) => {
            const next = {
              ...prev,
              autoAcceptEnabled: !prev.autoAcceptEnabled,
            };
            sendPayloadUpdate(next);
            return next;
          });
          break;

        case 'openUrl':
        case 'vscode:openUrl':
          if (message.url) {
            if (typeof window !== 'undefined') {
              window.open(message.url, '_blank');
            }
            toastStore.info(`Opening ${message.url}`);
          }
          break;

        case 'openFile':
        case 'vscode:openFile':
          if (message.fileId) ideStore.openFile(message.fileId);
          break;

        case 'updateContent':
        case 'edit':
        case 'vscode:edit':
          if (message.fileId && message.content !== undefined) {
            ideStore.updateFileContent(message.fileId, message.content);
            toastStore.success('File updated by extension');
          }
          break;

        case 'terminalInput':
        case 'runCommand':
        case 'vscode:terminal':
          if (message.text) {
            ideStore.setIsTerminalOpen(true);
            terminalStore.sendInput(message.text + '\n');
          }
          break;

        case 'toast':
        case 'showInformationMessage':
          if (message.text) toastStore.info(message.text);
          break;

        case 'showErrorMessage':
          if (message.text) toastStore.error(message.text);
          break;

        default:
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [extensionId]);

  const handleIframeLoad = () => {
    setTimeout(() => {
      sendPayloadUpdate(extensionStateRef.current);
    }, 100);
    setTimeout(() => {
      sendPayloadUpdate(extensionStateRef.current);
    }, 300);
  };

  if (!htmlContent) {
    return (
      <div className={`flex flex-col items-center justify-center p-6 text-center h-full select-none ${className}`}>
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${
            isLight ? 'bg-[#2A2529]/8 text-[#2A2529]/70' : 'bg-[#F3F0E7]/8 text-[#F3F0E7]/70'
          }`}
        >
          <Layers size={22} />
        </div>
        <h3 className={`text-sm font-semibold mb-1 ${isLight ? 'text-[#2A2529]' : 'text-[#F3F0E7]'}`}>{title}</h3>
        <p className={`text-xs max-w-xs mb-4 ${isLight ? 'text-[#2A2529]/60' : 'text-[#F3F0E7]/60'}`}>
          No packaged Webview HTML found for view{' '}
          <code className="px-1 py-0.5 rounded bg-black/10 font-mono text-[11px]">{viewId}</code>.
        </p>
        <button
          onClick={() => setKey((k) => k + 1)}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold active:scale-95 transition-all ${
            isLight ? 'bg-[#2A2529] text-[#F3F0E7] hover:bg-[#2A2529]/90' : 'bg-[#F3F0E7] text-[#2A2529] hover:bg-[#F3F0E7]/90'
          }`}
        >
          <RefreshCw size={13} />
          <span>Reload View</span>
        </button>
      </div>
    );
  }

  const iframeSrc = swReady ? `/ext-webview/${encodeURIComponent(extensionId)}/index.html` : undefined;

  return (
    <div className={`relative w-full h-full flex flex-col overflow-hidden bg-transparent ${className}`}>
      {loadError && (
        <div className="p-3 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs flex items-center justify-between">
          <span className="flex items-center space-x-1.5 truncate">
            <AlertTriangle size={14} className="shrink-0" />
            <span>{loadError}</span>
          </span>
          <button onClick={() => setLoadError(null)} className="underline text-[11px] ml-2 shrink-0">
            Dismiss
          </button>
        </div>
      )}
      <iframe
        key={key}
        ref={iframeRef}
        src={iframeSrc}
        srcDoc={!iframeSrc ? synthesizedDoc || '' : undefined}
        sandbox="allow-scripts allow-forms allow-modals allow-same-origin"
        className="w-full h-full flex-1 border-none bg-transparent"
        title={title}
        onLoad={handleIframeLoad}
        onError={() => setLoadError('Failed to load extension webview frame')}
      />
    </div>
  );
}
