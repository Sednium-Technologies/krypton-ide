import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { useProjectsStore } from './store/useProjectsStore';
import { useIdeStore } from './store/useIdeStore';
import { useAuthStore } from './store/useAuthStore';
import { useNavbarStore } from './store/useNavbarStore';
import { useExtensionsStore } from './store/useExtensionsStore';
import { initCustomCss } from './lib/customCssManager';
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Configure Monaco Environment with local Vite web workers
if (typeof window !== 'undefined') {
  (self as any).MonacoEnvironment = {
    getWorker(_: any, label: string) {
      if (label === 'json') return new jsonWorker();
      if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
      if (label === 'typescript' || label === 'javascript') return new tsWorker();
      return new editorWorker();
    },
  };
}

// Configure Monaco to use local bundled version, preventing CDN hangs
loader.config({ monaco });

// Initialize user custom CSS
initCustomCss();

// Register webview service worker for universal extension webview asset resolution
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/webview-sw.js', { scope: '/ext-webview/' })
      .catch((err) => {
        console.warn('[WebviewSW] Registration failed:', err);
      });
  });
}

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
