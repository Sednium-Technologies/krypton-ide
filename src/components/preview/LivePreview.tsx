import React, { useMemo, useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { X, RefreshCw, ExternalLink, Loader2, CheckCircle2, XCircle, Terminal as TerminalIcon, Package, Wifi, WifiOff, AlertTriangle, TerminalSquare, ChevronDown, ChevronUp, Smartphone, Monitor } from 'lucide-react';
import { useIdeStore } from '../../store/useIdeStore';
import { useProjectsStore } from '../../store/useProjectsStore';
import { executeCode, canExecuteLanguage, getNativeTerminalCommand } from '../../lib/codeRunner';
import type { ExecutionResult } from '../../lib/codeRunner';
import { useNativeTerminalStore } from '../../store/useNativeTerminalStore';

interface LivePreviewProps {
  onClose: () => void;
}

/**
 * Create an object URL for an HTML document and revoke it when the document
 * changes or the component unmounts. Creating URLs inside useMemo leaked one
 * blob URL per keystroke.
 */
function useObjectUrl(html: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!html) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [html]);

  return url;
}

export function LivePreview({ onClose }: LivePreviewProps) {
  const { files, activeFileId, theme } = useIdeStore();
  const isLight = theme === 'light';
  const { currentProjectId, projects } = useProjectsStore();
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<{ type: string; args: string }[]>([]);
  const [showInternetWarning, setShowInternetWarning] = useState(false);
  const [internetWarningAccepted, setInternetWarningAccepted] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [unreadLogs, setUnreadLogs] = useState(0);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  
  const project = currentProjectId ? projects[currentProjectId] : null;

  // Listen for console messages from iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.source === window) return;
      if (e.data?.type !== 'krypton-console') return;
      if (typeof e.data.args !== 'string') return;
      const level = ['log', 'warn', 'error', 'info'].includes(e.data.level) ? e.data.level : 'log';
      const log = { type: level, args: e.data.args.slice(0, 4000) };
      setConsoleLogs(prev => [...prev.slice(-200), log]);
      setUnreadLogs(prev => prev + 1);
      // Also dispatch to bottom panel terminal
      window.dispatchEvent(new CustomEvent('krypton-console-log', { detail: log }));
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    if (showConsole) setUnreadLogs(0);
  }, [showConsole]);

  const activeFile = activeFileId ? files[activeFileId] : null;

  // Determine project type
  const hasHtmlFile = Object.values(files).some(
    f => f.type === 'file' && f.name.toLowerCase() === 'index.html'
  );
  
  const jsxFiles = Object.values(files).filter(
    f => f.type === 'file' && (f.name.endsWith('.jsx') || f.name.endsWith('.tsx'))
  );

  // Also gather .js files that contain JSX syntax (e.g. Next.js page.js files)
  const jsFilesWithJsx = Object.values(files).filter(
    f => f.type === 'file' && f.name.endsWith('.js') && f.content && 
    (f.content.includes('<div') || f.content.includes('<main') || f.content.includes('<h1') || f.content.includes('React.createElement') || f.content.includes('return ('))
  );

  const allReactFiles = [...jsxFiles, ...jsFilesWithJsx];

  // Detect Vite/Next.js projects: they have index.html with <script type="module"> which can't work in blob URLs
  const isViteOrModuleProject = useMemo(() => {
    if (!hasHtmlFile) return false;
    const htmlFile = Object.values(files).find(f => f.type === 'file' && f.name.toLowerCase() === 'index.html');
    if (!htmlFile?.content) return false;
    // Check if the HTML references module scripts that point to source files (e.g. /src/main.jsx)
    return /type=["']module["']/.test(htmlFile.content) && /src=["']\/?(src\/|\.\/src)/.test(htmlFile.content);
  }, [files, hasHtmlFile]);

  // React project = has JSX/React content AND (no HTML file OR is a Vite/module project OR is Next.js)
  // Detect Next.js: has page.js/tsx
  const isNextProject = useMemo(() => {
    return Object.values(files).some(f => f.type === 'file' && (f.name === 'page.js' || f.name === 'page.tsx' || f.name === 'page.jsx'));
  }, [files]);

  const hasReactProject = ((!hasHtmlFile || isViteOrModuleProject || isNextProject) && allReactFiles.length > 0 && allReactFiles.some(
    f => f.content?.includes('React') || f.content?.includes('react') || f.content?.includes('jsx') || f.content?.includes('useState') || f.content?.includes('export default function')
  ));

  // Detect package.json and parse dependencies for importmap generation
  const packageJsonDeps = useMemo(() => {
    const pkgFile = Object.values(files).find(
      f => f.type === 'file' && f.name === 'package.json'
    );
    if (!pkgFile?.content) return null;

    try {
      const pkg = JSON.parse(pkgFile.content);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      // Only allow valid package names/versions; values are interpolated into
      // HTML and importmap script tags, so untrusted input could break out.
      const SAFE_PKG = /^(@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/i;
      const SAFE_VER = /^[0-9a-z.+_-]+$/i;
      const filtered: Record<string, string> = {};
      for (const [name, version] of Object.entries(deps)) {
        if (!SAFE_PKG.test(name)) continue;
        if (typeof version !== 'string') continue;
        if (version.startsWith('file:') || version.startsWith('link:') || version.startsWith('workspace:')) continue;
        const cleanVersion = version.replace(/^[\^~>=<]+/, '');
        if (!SAFE_VER.test(cleanVersion)) continue;
        filtered[name] = cleanVersion;
      }
      return Object.keys(filtered).length > 0 ? filtered : null;
    } catch {
      return null;
    }
  }, [files]);

  // Build esm.sh importmap from package.json dependencies
  const importMapScript = useMemo(() => {
    if (!packageJsonDeps) return '';

    const imports: Record<string, string> = {};
    for (const [name, version] of Object.entries(packageJsonDeps)) {
      // Clean version string (remove ^, ~, >= etc.)
      const cleanVer = (version as string).replace(/^[\^~>=<]+/, '');
      imports[name] = `https://esm.sh/${name}@${cleanVer}`;
      // Also add subpath imports (e.g., react-dom/client)
      imports[`${name}/`] = `https://esm.sh/${name}@${cleanVer}/`;
    }

    return `<script type="importmap">\n${JSON.stringify({ imports }, null, 2)}\n<\/script>`;
  }, [packageJsonDeps]);

  const hasCdnDependencies = !!packageJsonDeps && Object.keys(packageJsonDeps).length > 0;

  const isMarkdownPreview = activeFile?.type === 'file' && (activeFile.name.endsWith('.md') || activeFile.language === 'markdown');

  const isSvgPreview = activeFile?.type === 'file' && activeFile.name.endsWith('.svg');
  
  const isAndroidCode = useMemo(() => {
    if (!activeFile?.content) return false;
    return activeFile.content.includes('import android.') || 
           activeFile.content.includes('import androidx.') ||
           project?.template?.startsWith('android-');
  }, [activeFile?.content, project?.template]);

  const isCodeExecution = !hasHtmlFile && !hasReactProject && !isNextProject && !isMarkdownPreview && !isSvgPreview && activeFile?.type === 'file' && activeFile.language && activeFile.language !== 'html' && activeFile.language !== 'xml' && !isAndroidCode;

  // For HTML projects, build the preview
  const previewHtml = useMemo(() => {
    if (!hasHtmlFile) return null;

    const htmlFile = Object.values(files).find(
      f => f.type === 'file' && f.name.toLowerCase() === 'index.html'
    );

    if (!htmlFile?.content) return null;

    let html = htmlFile.content;

    // Inline CSS files
    const cssFiles = Object.values(files).filter(
      f => f.type === 'file' && f.name.endsWith('.css')
    );
    for (const cssFile of cssFiles) {
      if (cssFile.content) {
        const linkPattern = new RegExp(
          `<link[^>]*href=["']${escapeRegex(cssFile.name)}["'][^>]*>`, 'gi'
        );
        html = html.replace(linkPattern, `<style>\n${cssFile.content}\n</style>`);
      }
    }

    // Inline JS files
    const jsFiles = Object.values(files).filter(
      f => f.type === 'file' && (f.name.endsWith('.js') || f.name.endsWith('.jsx'))
    );
    for (const jsFile of jsFiles) {
      if (jsFile.content) {
        const babelPattern = new RegExp(
          `<script[^>]*type=["']text/babel["'][^>]*src=["']${escapeRegex(jsFile.name)}["'][^>]*>\s*</script>`, 'gi'
        );
        const scriptPattern = new RegExp(
          `<script[^>]*src=["']${escapeRegex(jsFile.name)}["'][^>]*>\s*</script>`, 'gi'
        );
        
        if (babelPattern.test(html)) {
          html = html.replace(babelPattern, `<script type="text/babel">\n${jsFile.content}\n</script>`);
        } else {
          html = html.replace(scriptPattern, `<script>\n${jsFile.content}\n</script>`);
        }
      }
    }

    // Inject console capture bridge
    const consoleCapture = `<script>
(function(){
  var _log=console.log,_warn=console.warn,_error=console.error,_info=console.info;
  function send(level,args){
    try{parent.postMessage({type:'krypton-console',level:level,args:Array.from(args).map(function(a){try{return typeof a==='object'?JSON.stringify(a):String(a)}catch(e){return String(a)}}).join(' ')},'*')}catch(e){}
  }
  console.log=function(){send('log',arguments);_log.apply(console,arguments)};
  console.warn=function(){send('warn',arguments);_warn.apply(console,arguments)};
  console.error=function(){send('error',arguments);_error.apply(console,arguments)};
  console.info=function(){send('info',arguments);_info.apply(console,arguments)};
  window.onerror=function(m,s,l,c,e){send('error',[m+' at '+s+':'+l+':'+c])};
})();
</script>`;
    html = html.replace('</head>', consoleCapture + '\n</head>');

    // Inject importmap for CDN dependencies if package.json exists
    if (importMapScript) {
      html = html.replace('<head>', '<head>\n' + importMapScript);
    }

    return html;
  }, [files, hasHtmlFile, importMapScript]);
  const previewSrc = useObjectUrl(previewHtml);

  // For code execution, run on mount
  useEffect(() => {
    if (isCodeExecution && activeFile?.content && activeFile.language) {
      runCode();
    }
  }, []);

  const runCode = async () => {
    if (!activeFile?.content || !activeFile.language) return;
    
    setIsExecuting(true);
    setExecutionResult(null);
    
    const result = await executeCode(activeFile.language, activeFile.content, activeFile.name);
    setExecutionResult(result);
    setIsExecuting(false);
  };

  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    if (isCodeExecution) {
      runCode();
    } else {
      setRefreshKey(k => k + 1);
    }
  };

  const handleRunInNativeTerminal = () => {
    const targetFile = activeFile || Object.values(files).find(
      f => f.type === 'file' && f.language && canExecuteLanguage(f.language)
    );
    if (!targetFile) return;

    if (targetFile.isUnsaved) {
      useIdeStore.getState().saveFile(targetFile.id);
    }

    const currentPid = useProjectsStore.getState().currentProjectId;
    if (currentPid) {
      useProjectsStore.getState().saveProjectToDisk(currentPid).catch(() => {});
    }

    const cmd = getNativeTerminalCommand(targetFile.language || '', targetFile.name);
    onClose();
    useIdeStore.getState().setIsTerminalOpen(true);
    useNativeTerminalStore.getState().switchTab('project');
    useNativeTerminalStore.getState().sendInput(cmd + '\n', 'project');
  };

  // Build React project preview
  const reactPreviewHtml = useMemo(() => {
    if (!hasReactProject) return null;

    // Gather all CSS files
    const allCss = Object.values(files)
      .filter(f => f.type === 'file' && f.name.endsWith('.css') && f.content)
      .map(f => f.content)
      .join('\n');

    // Find main entry: App.jsx/tsx first, then page.js for Next.js, then first file
    const appFile = allReactFiles.find(f => f.name.toLowerCase().startsWith('app.')) 
      || allReactFiles.find(f => f.name.toLowerCase() === 'page.js' || f.name.toLowerCase() === 'page.jsx' || f.name.toLowerCase() === 'page.tsx')
      || allReactFiles[0];
    if (!appFile?.content) return null;

    // Collect all component files (non-App files first, then App last)
    const otherFiles = allReactFiles.filter(f => f.id !== appFile.id);
    
    // Process user code: strip import/export since React/ReactDOM are UMD globals
    const processCode = (code: string) => {
      return code
        .replace(/^\s*import\s+.*?from\s+['"]react['"].*?;?\s*$/gm, '')
        .replace(/^\s*import\s+.*?from\s+['"]react-dom['"].*?;?\s*$/gm, '')
        .replace(/^\s*import\s+.*?from\s+['"]react-dom\/client['"].*?;?\s*$/gm, '')
        .replace(/^\s*import\s+.*?from\s+['"]react\/jsx-runtime['"].*?;?\s*$/gm, '')
        // Strip Next.js-specific imports
        .replace(/^\s*import\s+.*?from\s+['"]next\/.*?['"].*?;?\s*$/gm, '// (next import stripped)')
        .replace(/^\s*import\s+(\w+)\s+from\s+['"]\.\/.*?['"].*?;?\s*$/gm, '// (resolved: $1)')
        .replace(/^\s*import\s+\{([^}]+)\}\s+from\s+['"]\.\/.*?['"].*?;?\s*$/gm, '// (resolved: {$1})')
        .replace(/^\s*import\s+['"]\.\/.*?\.css['"].*?;?\s*$/gm, '// (css imported via style tag)')
        // Strip Next.js metadata export
        .replace(/^\s*export\s+const\s+metadata\s*=\s*\{[\s\S]*?\};?\s*$/gm, '// (metadata stripped)')
        .replace(/^\s*export\s+default\s+function\s+/gm, 'function ')
        .replace(/^\s*export\s+default\s+class\s+/gm, 'class ')
        .replace(/^\s*export\s+default\s+(\w+)\s*;?\s*$/gm, '// (default: $1)')
        .replace(/^\s*export\s+function\s+/gm, 'function ')
        .replace(/^\s*export\s+const\s+/gm, 'const ')
        .replace(/^\s*export\s+class\s+/gm, 'class ')
        .replace(/^\s*export\s+\{[^}]*\}\s*;?\s*$/gm, '');
    };

    // Build component scripts (other files loaded first)
    const componentBlocks = otherFiles
      .filter(f => f.content)
      .map(f => {
        const processed = processCode(f.content!);
        return '<script type="text/babel" data-presets="react">\n// === ' + f.name + ' ===\n' + processed + '\n<\/script>';
      })
      .join('\n');
    
    const processedAppCode = processCode(appFile.content);

    // Detect the main component name
    const componentMatch = appFile.content.match(/(?:export\s+default\s+)?(?:function|class)\s+(\w+)/);
    const mainComponent = componentMatch?.[1] || 'App';

    // Gather SVG files for inline use
    const svgFiles = Object.values(files)
      .filter(f => f.type === 'file' && f.name.endsWith('.svg') && f.content);

    const svgDefs = svgFiles.map(f => {
      const varName = f.name.replace(/\.svg$/, '').replace(/[^a-zA-Z0-9]/g, '_');
      const svgContent = (f.content || '').replace(/`/g, '\\`').replace(/\$/g, '\\$');
      return 'window.__SVG_' + varName + ' = `' + svgContent + '`;';
    }).join('\n');

    // If we have package.json deps, use specific React versions from esm.sh
    const SAFE_VER = /^[0-9a-z.+_-]+$/i;
    const requestedReact = packageJsonDeps?.['react'] || '';
    const requestedReactDom = packageJsonDeps?.['react-dom'] || '';
    const reactVersion = SAFE_VER.test(requestedReact) ? requestedReact : '18';
    const reactDomVersion = SAFE_VER.test(requestedReactDom) ? requestedReactDom : reactVersion;

    const html = '<!DOCTYPE html>\n<html>\n<head>\n' +
      '  <meta charset="UTF-8">\n' +
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '  <style>\n    * { margin: 0; padding: 0; box-sizing: border-box; }\n    body { font-family: system-ui, -apple-system, sans-serif; }\n    ' + allCss + '\n  </style>\n' +
      '  <script src="https://unpkg.com/react@' + reactVersion + '/umd/react.development.js" crossorigin><\/script>\n' +
      '  <script src="https://unpkg.com/react-dom@' + reactDomVersion + '/umd/react-dom.development.js" crossorigin><\/script>\n' +
      '  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>\n' +
      (importMapScript ? '  ' + importMapScript + '\n' : '') +
      '</head>\n<body>\n  <div id="root"></div>\n\n' +
      '  <script>\n' +
      '    var { useState, useEffect, useRef, useCallback, useMemo, useReducer, useContext, createContext, Fragment } = React;\n' +
      '    ' + svgDefs + '\n' +
      '    window.addEventListener("error", function(e) {\n' +
      '      var r = document.getElementById("root");\n' +
      '      if (r) r.innerHTML = \'<div style="padding:20px;color:#ff6b6b;font-family:monospace;white-space:pre-wrap;background:#1a1a2e;min-height:100vh;"><h3 style="color:#ff6b6b;margin-bottom:12px;">Error</h3><pre style="color:#ffa0a0;font-size:13px;">\' + e.message + \'</pre></div>\';\n' +
      '    });\n' +
      '    window.addEventListener("unhandledrejection", function(e) { console.error("Promise rejection:", e.reason); });\n' +
      '  <\/script>\n\n' +
      componentBlocks + '\n\n' +
      '  <script type="text/babel" data-presets="react">\n' +
      '    // === ' + appFile.name + ' (entry) ===\n' +
      '    ' + processedAppCode + '\n\n' +
      '    try {\n' +
      '      var _rootEl = document.getElementById("root");\n' +
      '      if (!_rootEl._reactRoot) { _rootEl._reactRoot = ReactDOM.createRoot(_rootEl); }\n' +
      '      var _root = _rootEl._reactRoot;\n' +
      '      if (typeof ' + mainComponent + ' === "function" || typeof ' + mainComponent + ' === "object") {\n' +
      '        _root.render(React.createElement(' + mainComponent + '));\n' +
      '      } else if (typeof App === "function" || typeof App === "object") {\n' +
      '        _root.render(React.createElement(App));\n' +
      '      } else {\n' +
      '        _rootEl.innerHTML = \'<div style="padding:40px;text-align:center;color:#888;"><h3>No component found</h3><p style="margin-top:8px;font-size:14px;">Define a function App() in your code.</p></div>\';\n' +
      '      }\n' +
      '    } catch(err) {\n' +
      '      document.getElementById("root").innerHTML = \'<div style="padding:20px;color:#ff6b6b;font-family:monospace;white-space:pre-wrap;background:#1a1a2e;min-height:100vh;"><h3>Mount Error</h3>\' + err.message + \'</div>\';\n' +
      '    }\n' +
      '  <\/script>\n' +
      '</body>\n</html>';

    return html;
  }, [files, hasReactProject, refreshKey, importMapScript, packageJsonDeps]);
  const reactPreviewSrc = useObjectUrl(reactPreviewHtml);

  // Build Markdown preview 
  const markdownPreviewHtml = useMemo(() => {
    if (!isMarkdownPreview || !activeFile?.content) return null;
    
    // Sanitize before embedding: markdown is untrusted project content.
    const safeMarkdownHtml = DOMPurify.sanitize(marked.parse(activeFile.content) as string);
    const serializedHtml = JSON.stringify(safeMarkdownHtml).replace(/</g, '\\u003c');

    // Use a simple inline HTML renderer for md
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin:0; padding:24px; background:#0d1117; color:#c9d1d9; font-family:'Inter',system-ui,sans-serif; font-size:15px; line-height:1.7; }
    h1,h2,h3,h4,h5,h6 { color:#f0f6fc; margin:1.2em 0 0.5em; }
    h1 { font-size:2em; border-bottom:1px solid #21262d; padding-bottom:.3em; }
    h2 { font-size:1.5em; border-bottom:1px solid #21262d; padding-bottom:.3em; }
    a { color:#58a6ff; text-decoration:none; }
    a:hover { text-decoration:underline; }
    code { background:#161b22; border:1px solid #30363d; border-radius:6px; padding:.15em .4em; font-family:'JetBrains Mono',monospace; font-size:.88em; }
    pre { background:#161b22; border:1px solid #30363d; border-radius:8px; padding:16px; overflow-x:auto; }
    pre code { background:transparent; border:none; padding:0; }
    blockquote { border-left:4px solid #3b82f6; padding:.5em 1em; margin:1em 0; color:#8b949e; background:#161b22; border-radius:0 8px 8px 0; }
    table { width:100%; border-collapse:collapse; margin:1em 0; }
    th { background:#161b22; font-weight:600; color:#f0f6fc; text-align:left; padding:8px 12px; border:1px solid #30363d; }
    td { padding:8px 12px; border:1px solid #30363d; }
    img { max-width:100%; border-radius:8px; }
    hr { border:none; border-top:1px solid #21262d; margin:2em 0; }
    ul,ol { padding-left:2em; }
    strong { color:#f0f6fc; }
    #content { max-width:720px; margin:0 auto; }
  </style>
</head>
<body>
  <div id="content"></div>
  <script>
    document.getElementById('content').innerHTML = ${serializedHtml};
  </script>
</body>
</html>`;
    return html;
  }, [isMarkdownPreview, activeFile?.content, refreshKey]);
  const markdownPreviewSrc = useObjectUrl(markdownPreviewHtml);

  const svgPreviewHtml = useMemo(() => {
    if (!isSvgPreview || !activeFile?.content) return null;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0d1117;} svg{max-width:90vw;max-height:90vh;}</style></head><body>${DOMPurify.sanitize(activeFile.content, { USE_PROFILES: { svg: true, svgFilters: true } })}</body></html>`;
  }, [isSvgPreview, activeFile?.content]);
  const svgPreviewUrl = useObjectUrl(svgPreviewHtml);

  // ─── Internet Warning Dialog ───
  if (hasCdnDependencies && !internetWarningAccepted && (hasReactProject || hasHtmlFile)) {
    if (!showInternetWarning) {
      // Auto-show the warning
      return (
        <div className="fixed inset-0 z-50 bg-[#0d1117] flex flex-col animate-fade-in">
          <PreviewHeader onClose={onClose} onRefresh={handleRefresh} isCodeMode={false} fileName="Preview" />
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-[#161b22] border border-amber-500/30 rounded-3xl p-8 text-center shadow-2xl shadow-amber-500/10">
              <div className="w-20 h-20 bg-amber-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-amber-500/20">
                <Wifi size={40} className="text-amber-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Internet Required</h3>
              <p className="text-gray-400 mb-4 leading-relaxed text-sm">
                This project has a <code className="text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">package.json</code> with 
                <span className="text-amber-400 font-semibold"> {Object.keys(packageJsonDeps!).length} dependencies</span> that 
                will be loaded from the internet via <span className="text-emerald-400 font-mono text-xs">esm.sh</span> CDN.
              </p>
              <div className="bg-black/30 rounded-xl p-3 mb-6 border border-[#30363d] text-left">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2">Dependencies</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(packageJsonDeps!).slice(0, 12).map(([name, ver]) => (
                    <span key={name} className="text-[10px] font-mono px-2 py-1 bg-blue-500/10 text-blue-300 rounded-md border border-blue-500/20">
                      {name}@{(ver as string).replace(/^[\^~>=<]+/, '')}
                    </span>
                  ))}
                  {Object.keys(packageJsonDeps!).length > 12 && (
                    <span className="text-[10px] text-gray-500 px-2 py-1">+{Object.keys(packageJsonDeps!).length - 12} more</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-500/5 border border-amber-500/20 rounded-xl mb-6">
                <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                <p className="text-[11px] text-amber-300/80 text-left">
                  Preview won't work without an active internet connection. First load may be slow.
                </p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={onClose}
                  className="flex-1 bg-[#21262d] hover:bg-[#30363d] text-gray-300 py-3 rounded-xl font-semibold transition-all text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => setInternetWarningAccepted(true)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/30 active:scale-95 text-sm"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
  }

  // ─── React Project Preview ───
  if (hasReactProject && reactPreviewSrc) {
    return (
      <div className={`fixed inset-0 z-50 flex flex-col animate-fade-in ${isLight ? 'bg-[#f4f0e6] text-[#2a2529]' : 'bg-[#151217] text-[#f3f0e7]'}`}>
        <PreviewHeader 
          onClose={onClose} 
          onRefresh={handleRefresh} 
          isCodeMode={false} 
          fileName="React App" 
          previewUrl={reactPreviewSrc} 
          showConsole={showConsole} 
          onToggleConsole={() => setShowConsole(!showConsole)} 
          unreadLogs={unreadLogs}
          previewMode={previewMode}
          onTogglePreviewMode={() => setPreviewMode(m => m === 'desktop' ? 'mobile' : 'desktop')}
          isLight={isLight}
        />
        <div className={`flex-1 relative overflow-hidden flex items-center justify-center ${
          previewMode === 'mobile' ? (isLight ? 'bg-[#ede8db] p-3 sm:p-6' : 'bg-[#151217] p-3 sm:p-6') : 'bg-white'
        }`}>
          {previewMode === 'mobile' ? (
            <div className={`w-full max-w-[390px] h-[95%] max-h-[820px] rounded-[38px] border-4 shadow-2xl overflow-hidden relative flex flex-col transition-all duration-300 ${
              isLight ? 'border-[#2a2529]/25 bg-white shadow-stone-400/40' : 'border-[#f3f0e7]/20 bg-white shadow-black/80'
            }`}>
              <div className="h-5 w-full bg-black/5 flex items-center justify-center shrink-0">
                <div className="w-16 h-1 rounded-full bg-black/20" />
              </div>
              <iframe
                key={refreshKey}
                src={reactPreviewSrc}
                title="React Preview"
                sandbox="allow-scripts allow-modals allow-forms"
                className="w-full flex-1 border-none bg-white"
              />
            </div>
          ) : (
            <iframe
              key={refreshKey}
              src={reactPreviewSrc}
              title="React Preview"
              sandbox="allow-scripts allow-modals allow-forms"
              className="w-full h-full border-none"
            />
          )}
          <ConsoleOverlay logs={consoleLogs} isOpen={showConsole} isLight={isLight} />
        </div>
      </div>
    );
  }

  // ─── Markdown Preview ───
  if (isMarkdownPreview && markdownPreviewSrc) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0d1117] flex flex-col animate-fade-in">
        <PreviewHeader onClose={onClose} onRefresh={handleRefresh} isCodeMode={false} fileName={activeFile?.name} previewUrl={markdownPreviewSrc} />
        <div className="flex-1 relative">
          <iframe
            key={refreshKey}
            src={markdownPreviewSrc}
            title="Markdown Preview"
            sandbox="allow-scripts"
            className="w-full h-full border-none"
          />
        </div>
      </div>
    );
  }

  // ─── SVG Preview ───
  if (isSvgPreview && activeFile?.content) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0d1117] flex flex-col animate-fade-in">
        <PreviewHeader onClose={onClose} onRefresh={handleRefresh} isCodeMode={false} fileName={activeFile.name} previewUrl={svgPreviewUrl} />
        <div className="flex-1 relative">
          <iframe
            key={refreshKey}
            src={svgPreviewUrl || undefined}
            title="SVG Preview"
            sandbox="allow-scripts"
            className="w-full h-full border-none"
          />
        </div>
      </div>
    );
  }

  // ─── Android Code View (Specific Error/Guide) ───
  if (isAndroidCode) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0d1117] flex flex-col animate-fade-in">
        <PreviewHeader onClose={onClose} onRefresh={handleRefresh} isCodeMode={true} fileName={activeFile?.name} language={activeFile?.language} onRunInNativeTerminal={handleRunInNativeTerminal} />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-[#161b22] border border-[#21262d] rounded-3xl p-8 text-center shadow-2xl">
            <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-emerald-500/20">
              <Package size={40} className="text-emerald-400" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">Android Build Required</h3>
            <p className="text-gray-400 mb-8 leading-relaxed">
              This file contains Android-specific libraries (UI components, Activities) that cannot be run as a console script.
            </p>
            
            <div className="space-y-4 text-left mb-8 bg-black/30 rounded-2xl p-4 border border-[#30363d]">
              <div className="flex items-start space-x-3">
                <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center mt-0.5">
                  <span className="text-[10px] text-blue-400 font-bold">1</span>
                </div>
                <p className="text-xs text-gray-300">Open the <span className="text-blue-400 font-semibold">Build APK</span> tab in the bottom panel</p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center mt-0.5">
                  <span className="text-[10px] text-blue-400 font-bold">2</span>
                </div>
                <p className="text-xs text-gray-300">Push your changes to trigger the Android pipeline</p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center mt-0.5">
                  <span className="text-[10px] text-blue-400 font-bold">3</span>
                </div>
                <p className="text-xs text-gray-300">Download and install the APK on your device</p>
              </div>
            </div>

            <button 
              onClick={() => {
                onClose();
                // We'll rely on the user manually switching, as we don't have a direct dispatch for TopBar -> BottomPanel tabs here easily yet
                // but this message provides the clear path forward.
              }}
              className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-900/20 active:scale-95"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If it's neither HTML nor executable code
  if (!hasHtmlFile && !isCodeExecution) {
    // Try to find any executable file
    const executableFile = Object.values(files).find(
      f => f.type === 'file' && f.language && canExecuteLanguage(f.language)
    );

    if (executableFile) {
      return (
        <div className="fixed inset-0 z-50 bg-[#0d1117] flex flex-col animate-fade-in">
          <PreviewHeader 
            onClose={onClose} 
            onRefresh={handleRefresh} 
            isCodeMode={true} 
            previewUrl={null} 
            onRunInNativeTerminal={handleRunInNativeTerminal}
          />
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <TerminalIcon size={48} className="mx-auto mb-4 text-gray-600" />
              <p className="text-gray-400 mb-2">Open a file and press Run to execute it</p>
              <p className="text-xs text-gray-600 mb-4">Supported: Python, JavaScript, TypeScript, Java, C++, Go, Rust, and more</p>
              <button
                onClick={handleRunInNativeTerminal}
                className="inline-flex items-center space-x-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all shadow-md active:scale-95"
              >
                <TerminalSquare size={16} />
                <span>Run in Native Terminal</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-50 bg-[#0d1117] flex flex-col animate-fade-in">
        <PreviewHeader onClose={onClose} onRefresh={handleRefresh} isCodeMode={false} previewUrl={null} />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <XCircle size={48} className="mx-auto mb-4 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-300 mb-2">No Runnable File</h3>
            <p className="text-sm text-gray-500 max-w-xs">
              Create an <code className="text-blue-400">index.html</code> for web preview, or open a code file (Python, JS, etc.) to execute it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Code Execution View
  if (isCodeExecution) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0d1117] flex flex-col animate-fade-in">
        <PreviewHeader 
          onClose={onClose} 
          onRefresh={handleRefresh} 
          isCodeMode={true}
          fileName={activeFile?.name}
          language={activeFile?.language}
          onRunInNativeTerminal={handleRunInNativeTerminal}
        />
        
        <div className="flex-1 overflow-y-auto">
          {isExecuting ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 size={32} className="mx-auto mb-4 text-blue-400 animate-spin" />
                <p className="text-gray-400">Running {activeFile?.name}...</p>
                <p className="text-xs text-gray-600 mt-1">Using Piston API • {activeFile?.language}</p>
              </div>
            </div>
          ) : executionResult ? (
            <div className="p-4 space-y-3">
              {/* Status Badge & Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#161b22] border border-[#21262d] rounded-2xl shadow-md">
                <div className="flex items-center space-x-2">
                  {executionResult.success ? (
                    <CheckCircle2 size={18} className="text-green-400 shrink-0" />
                  ) : (
                    <XCircle size={18} className="text-red-400 shrink-0" />
                  )}
                  <span className={`text-sm font-medium ${executionResult.success ? 'text-green-400' : 'text-red-400'}`}>
                    {executionResult.success ? 'Success' : 'Error'}
                    {executionResult.exitCode !== null && ` (exit ${executionResult.exitCode})`}
                  </span>
                  <span className="text-xs text-gray-500 hidden sm:inline">•</span>
                  <span className="text-xs text-gray-500 hidden sm:inline">
                    {executionResult.language} {executionResult.version}
                  </span>
                </div>
                <button
                  onClick={handleRunInNativeTerminal}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-emerald-950/40 active:scale-95 ml-auto"
                  title="Run locally in Native Terminal"
                >
                  <TerminalSquare size={15} />
                  <span>Run in Native Terminal</span>
                </button>
              </div>

              {/* Output */}
              {executionResult.output && (
                <div>
                  <div className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">Output</div>
                  <pre className="bg-[#161b22] border border-[#21262d] rounded-xl p-4 text-sm text-green-300 font-mono whitespace-pre-wrap break-words overflow-x-auto max-h-[60vh]">
                    {executionResult.output}
                  </pre>
                </div>
              )}

              {/* Stderr */}
              {executionResult.stderr && (
                <div>
                  <div className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">Errors</div>
                  <pre className="bg-[#1a0000] border border-red-900/30 rounded-xl p-4 text-sm text-red-300 font-mono whitespace-pre-wrap break-words overflow-x-auto max-h-[40vh]">
                    {executionResult.stderr}
                  </pre>
                </div>
              )}

              {/* No output */}
              {!executionResult.output && !executionResult.stderr && (
                <div className="text-center py-8 text-gray-500 space-y-3">
                  <p>Program produced no output</p>
                  <button
                    onClick={handleRunInNativeTerminal}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 rounded-xl text-xs font-semibold transition-all border border-emerald-500/30 active:scale-95"
                  >
                    <TerminalSquare size={15} />
                    <span>Run in Native Terminal</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-3">
              <p className="text-gray-500">Press the refresh button to run</p>
              <button
                onClick={handleRunInNativeTerminal}
                className="inline-flex items-center space-x-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all shadow-md active:scale-95"
              >
                <TerminalSquare size={15} />
                <span>Run in Native Terminal</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // HTML Preview View
  return (
    <div className={`fixed inset-0 z-50 flex flex-col animate-fade-in ${isLight ? 'bg-[#f4f0e6] text-[#2a2529]' : 'bg-[#2a2529] text-[#f3f0e7]'}`}>
      <PreviewHeader 
        onClose={onClose} 
        onRefresh={handleRefresh} 
        isCodeMode={false} 
        previewUrl={previewSrc} 
        showConsole={showConsole} 
        onToggleConsole={() => setShowConsole(!showConsole)} 
        unreadLogs={unreadLogs}
        previewMode={previewMode}
        onTogglePreviewMode={() => setPreviewMode(m => m === 'desktop' ? 'mobile' : 'desktop')}
        isLight={isLight}
      />
      <div className={`flex-1 relative overflow-hidden flex items-center justify-center ${
        previewMode === 'mobile' ? (isLight ? 'bg-[#ede8db] p-3 sm:p-6' : 'bg-[#151217] p-3 sm:p-6') : 'bg-white'
      }`}>
        {previewMode === 'mobile' ? (
          <div className={`w-full max-w-[390px] h-[95%] max-h-[820px] rounded-[38px] border-4 shadow-2xl overflow-hidden relative flex flex-col transition-all duration-300 ${
            isLight ? 'border-[#2a2529]/25 bg-white shadow-stone-400/40' : 'border-[#f3f0e7]/20 bg-white shadow-black/80'
          }`}>
            <div className="h-5 w-full bg-black/5 flex items-center justify-center shrink-0">
              <div className="w-16 h-1 rounded-full bg-black/20" />
            </div>
            <iframe
              key={refreshKey}
              src={previewSrc}
              title="Live Preview"
              sandbox="allow-scripts allow-modals allow-forms"
              className="w-full flex-1 border-none bg-white"
            />
          </div>
        ) : (
          previewSrc ? (
            <iframe
              key={refreshKey}
              src={previewSrc}
              title="Live Preview"
              sandbox="allow-scripts allow-modals allow-forms"
              className="w-full h-full border-none"
            />
          ) : (
            <div className={`flex items-center justify-center h-full ${isLight ? 'bg-[#f4f0e6]' : 'bg-[#2a2529]'}`}>
              <p className={isLight ? 'text-[#2a2529]/50' : 'text-[#f3f0e7]/50'}>Could not build preview</p>
            </div>
          )
        )}
        <ConsoleOverlay logs={consoleLogs} isOpen={showConsole} isLight={isLight} />
      </div>
    </div>
  );
}

function PreviewHeader({ 
  onClose, 
  onRefresh, 
  isCodeMode, 
  fileName, 
  language, 
  previewUrl, 
  showConsole, 
  onToggleConsole, 
  unreadLogs,
  onRunInNativeTerminal,
  previewMode,
  onTogglePreviewMode,
  isLight,
}: { 
  onClose: () => void; 
  onRefresh: () => void; 
  isCodeMode: boolean;
  fileName?: string;
  language?: string;
  previewUrl?: string | null;
  showConsole?: boolean;
  onToggleConsole?: () => void;
  unreadLogs?: number;
  onRunInNativeTerminal?: () => void;
  previewMode?: 'desktop' | 'mobile';
  onTogglePreviewMode?: () => void;
  isLight?: boolean;
}) {

  const handleOpenInBrowser = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div 
      className={`flex items-center justify-between border-b px-3 flex-shrink-0 transition-colors ${
        isLight ? 'bg-[#f4f0e6] border-[#2a2529]/15 text-[#2a2529]' : 'bg-[#231e22] border-[#f3f0e7]/15 text-[#f3f0e7]'
      }`}
      style={{ height: 'calc(3.2rem + env(safe-area-inset-top, 0px))', paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className={`flex items-center space-x-2 text-xs ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>
        <div className={`w-2.5 h-2.5 rounded-full ${isCodeMode ? (isLight ? 'bg-[#2a2529]' : 'bg-[#f3f0e7]') : 'bg-emerald-400'} animate-pulse`} />
        <span className="font-bold">{isCodeMode ? 'Output' : 'Preview'}</span>
        {fileName && (
          <span className={`text-[11px] px-2 py-0.5 rounded-md border font-mono ${
            isLight ? 'text-[#2a2529]/80 bg-[#e6e2d6] border-[#2a2529]/15' : 'text-[#f3f0e7]/70 bg-[#342f33] border-[#f3f0e7]/10'
          }`}>{fileName}</span>
        )}
        {language && (
          <span className={`text-[11px] ${isLight ? 'text-[#2a2529]/50' : 'text-[#f3f0e7]/50'}`}>{language}</span>
        )}
      </div>
      <div className="flex items-center space-x-1">
        {onTogglePreviewMode && !isCodeMode && (
          <button
            onClick={onTogglePreviewMode}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold active:scale-95 transition-all ${
              isLight
                ? 'bg-white/80 border-[#2a2529]/15 text-[#2a2529] hover:bg-white'
                : 'bg-[#342f33] border-[#f3f0e7]/15 text-[#f3f0e7] hover:bg-[#3d373c]'
            }`}
            title={previewMode === 'mobile' ? 'Switch to Desktop Mode' : 'Switch to Mobile Mode'}
            aria-label="Toggle preview viewport mode"
          >
            {previewMode === 'mobile' ? <Smartphone size={15} className="text-emerald-500" /> : <Monitor size={15} className="text-sky-400" />}
            <span className="text-[11px] hidden sm:inline">{previewMode === 'mobile' ? 'Mobile' : 'Desktop'}</span>
          </button>
        )}
        {onRunInNativeTerminal && (
          <button 
            onClick={onRunInNativeTerminal}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 active:bg-emerald-600/40 text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 transition-all font-semibold text-xs active:scale-95 shadow-sm"
            title="Run in Native Terminal"
          >
            <TerminalSquare size={15} className="shrink-0 text-emerald-400" />
            <span className="hidden sm:inline">Run in Native Terminal</span>
            <span className="sm:hidden">Terminal</span>
          </button>
        )}
        {onToggleConsole && (
          <button 
            onClick={onToggleConsole}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl transition-colors relative ${
              showConsole 
                ? (isLight ? 'bg-[#2a2529]/10 text-[#2a2529] font-bold' : 'bg-[#f3f0e7]/20 text-[#f3f0e7] font-bold') 
                : (isLight ? 'text-[#2a2529]/60 hover:bg-[#2a2529]/10 hover:text-[#2a2529]' : 'text-[#f3f0e7]/60 hover:bg-[#f3f0e7]/10 hover:text-[#f3f0e7]')
            }`}
            title="Toggle Console"
          >
            <TerminalSquare size={16} />
            <span className="text-xs font-semibold">Console</span>
            {unreadLogs !== undefined && unreadLogs > 0 && !showConsole && (
              <span className={`absolute -top-1 -right-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full min-w-[16px] text-center shadow-md ${
                isLight ? 'bg-[#2a2529] text-white' : 'bg-[#f3f0e7] text-[#2a2529]'
              }`}>
                {unreadLogs > 99 ? '99+' : unreadLogs}
              </span>
            )}
            {showConsole ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        )}
        {previewUrl && (
          <button 
            onClick={handleOpenInBrowser}
            className={`p-2 rounded-xl transition-colors ${isLight ? 'text-[#2a2529]/60 hover:text-[#2a2529] hover:bg-[#2a2529]/10' : 'text-[#f3f0e7]/60 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10'}`}
            title="Open in Browser"
          >
            <ExternalLink size={18} />
          </button>
        )}
        <button 
          onClick={onRefresh}
          className={`p-2 rounded-xl transition-colors ${isLight ? 'text-[#2a2529]/60 hover:text-[#2a2529] hover:bg-[#2a2529]/10' : 'text-[#f3f0e7]/60 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10'}`}
          title={isCodeMode ? 'Re-run' : 'Refresh'}
        >
          <RefreshCw size={18} />
        </button>
        <button 
          onClick={onClose}
          className={`p-2 rounded-xl transition-colors ${isLight ? 'text-[#2a2529]/60 hover:text-[#2a2529] hover:bg-[#2a2529]/10' : 'text-[#f3f0e7]/60 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10'}`}
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ConsoleOverlay({ logs, isOpen, isLight }: { logs: { type: string, args: string }[], isOpen: boolean, isLight?: boolean }) {
  const endRef = React.useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (isOpen) {
      endRef.current?.scrollIntoView();
    }
  }, [logs, isOpen]);

  if (!isOpen) return null;

  return (
    <div className={`absolute bottom-0 left-0 right-0 h-[40vh] backdrop-blur-md border-t shadow-2xl z-20 flex flex-col animate-overlay-up ${
      isLight ? 'bg-[#f4f0e6]/95 border-[#2a2529]/15 text-[#2a2529]' : 'bg-[#342f33]/95 border-[#f3f0e7]/15 text-[#f3f0e7]'
    }`}>
      <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] md:text-xs">
        {logs.map((log, i) => (
          <div key={i} className={`px-2.5 py-1.5 mb-1.5 rounded-xl border-l-2 ${
            log.type === 'error' ? (isLight ? 'bg-red-500/10 text-red-600 border-red-500' : 'bg-red-500/10 text-red-400 border-red-500') : 
            log.type === 'warn' ? (isLight ? 'bg-amber-500/15 text-amber-800 border-amber-500' : 'bg-amber-500/10 text-amber-300 border-amber-500') : 
            log.type === 'info' ? (isLight ? 'bg-[#2a2529]/10 text-[#2a2529] border-[#2a2529]' : 'bg-[#f3f0e7]/10 text-[#f3f0e7] border-[#f3f0e7]') :
            (isLight ? 'text-[#2a2529]/80 border-[#2a2529]/30 hover:bg-[#2a2529]/5' : 'text-[#f3f0e7]/80 border-[#f3f0e7]/30 hover:bg-[#f3f0e7]/5')
          }`}>
            <span className="opacity-50 mr-2 shrink-0">[{log.type}]</span>
            <span className="whitespace-pre-wrap break-all">{log.args}</span>
          </div>
        ))}
        {logs.length === 0 && (
          <div className={`${isLight ? 'text-[#2a2529]/40' : 'text-[#f3f0e7]/40'} text-center py-8 italic flex flex-col items-center`}>
            <TerminalSquare size={32} className="mb-2 opacity-30" />
            <span>Console is empty</span>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
