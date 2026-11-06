import React, { useRef, useEffect, useState, useMemo } from 'react';
import { RefreshCw, AlertTriangle, Layers } from 'lucide-react';
import { useIdeStore } from '../../store/useIdeStore';
import { useToastStore } from '../../store/useToastStore';
import { createBlobUrlMap, rewriteHtmlWithBlobMap } from '../../lib/extensionAssetRegistry';
import { routeWebviewMessage } from '../../lib/extensions/webviewBridge';

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

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!event.data || event.data.type !== 'vscode-webview-message') return;
      if (event.data.extensionId !== extensionId) return;

      for (const action of routeWebviewMessage(event.data.message)) {
        if (action.kind === 'openUrl') window.open(action.url, '_blank', 'noopener,noreferrer');
        else if (action.kind === 'info') useToastStore.getState().info(action.text);
        else if (action.kind === 'error') useToastStore.getState().error(action.text);
        else {
          window.dispatchEvent(
            new CustomEvent('krypton:webview-message', {
              detail: { extensionId, viewId, message: action.message },
            })
          );
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [extensionId, viewId]);

  useEffect(() => {
    const handleHostMessage = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.extensionId !== extensionId) return;
      if (detail?.viewId !== undefined && detail.viewId !== viewId) return;
      iframeRef.current?.contentWindow?.postMessage(detail.message, '*');
    };
    window.addEventListener('krypton:webview-host-message', handleHostMessage);
    return () => window.removeEventListener('krypton:webview-host-message', handleHostMessage);
  }, [extensionId, viewId]);

  const handleIframeLoad = () => {
    window.dispatchEvent(
      new CustomEvent('krypton:webview-ready', { detail: { extensionId, viewId } })
    );
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
        sandbox="allow-scripts allow-forms allow-modals"
        className="w-full h-full flex-1 border-none bg-transparent"
        title={title}
        onLoad={handleIframeLoad}
        onError={() => setLoadError('Failed to load extension webview frame')}
      />
    </div>
  );
}
