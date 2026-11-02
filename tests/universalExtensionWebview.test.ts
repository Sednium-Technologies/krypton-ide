import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  normalizeAssetPath,
  getMimeType,
  rewriteHtmlWithBlobMap,
  createBlobUrlMap,
  storeExtensionAssets,
  getExtensionAsset,
} from '../src/lib/extensionAssetRegistry';
import { extractExtensionWebviewPackage } from '../src/store/useExtensionsStore';

// Polyfill createObjectURL for Node test runner if missing
if (typeof URL.createObjectURL !== 'function') {
  (URL as any).createObjectURL = () => `blob:mock-blob-${Math.random().toString(36).slice(2)}`;
}

test('normalizeAssetPath: strips query strings, hash anchors, and leading slashes', () => {
  assert.equal(normalizeAssetPath('codicon.ttf?721d4c92e76f784e38e5e6e18f8e0bd9'), 'codicon.ttf');
  assert.equal(normalizeAssetPath('./dist/webview.js?v=2#hash'), 'dist/webview.js');
  assert.equal(normalizeAssetPath('/media/style.css'), 'media/style.css');
  assert.equal(normalizeAssetPath('dist\\webview.js'), 'dist/webview.js');
  assert.equal(normalizeAssetPath('././assets/icon.png'), 'assets/icon.png');
});

test('getMimeType: returns correct MIME types including fonts, wasm, and styles', () => {
  assert.equal(getMimeType('index.html'), 'text/html');
  assert.equal(getMimeType('index.htm'), 'text/html');
  assert.equal(getMimeType('dist/webview.js'), 'application/javascript');
  assert.equal(getMimeType('bundle.mjs'), 'application/javascript');
  assert.equal(getMimeType('styles.css'), 'text/css');
  assert.equal(getMimeType('package.json'), 'application/json');
  assert.equal(getMimeType('icon.svg'), 'image/svg+xml');
  assert.equal(getMimeType('photo.png'), 'image/png');
  assert.equal(getMimeType('photo.jpg'), 'image/jpeg');
  assert.equal(getMimeType('photo.jpeg'), 'image/jpeg');
  assert.equal(getMimeType('photo.webp'), 'image/webp');
  assert.equal(getMimeType('anim.gif'), 'image/gif');
  assert.equal(getMimeType('font.woff'), 'font/woff');
  assert.equal(getMimeType('font.woff2'), 'font/woff2');
  assert.equal(getMimeType('codicon.ttf?721d4c92e76f'), 'font/ttf');
  assert.equal(getMimeType('font.otf'), 'font/otf');
  assert.equal(getMimeType('font.eot'), 'application/vnd.ms-fontobject');
  assert.equal(getMimeType('module.wasm'), 'application/wasm');
  assert.equal(getMimeType('data.unknown'), 'application/octet-stream');
});

test('rewriteHtmlWithBlobMap: transforms script, link, img, and CSS url(...) paths', () => {
  const blobMap: Record<string, string> = {
    'dist/webview.js': 'blob:http://localhost/mock-js',
    'dist/webview.css': 'blob:http://localhost/mock-css',
    'codicon.ttf': 'blob:http://localhost/mock-font',
    'assets/logo.png': 'blob:http://localhost/mock-logo',
  };

  const html = `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="./dist/webview.css">
  <style>
    @font-face {
      src: url('./codicon.ttf?721d4c92e76f');
    }
  </style>
</head>
<body>
  <img src="./assets/logo.png" />
  <script type="module" src="./dist/webview.js"></script>
</body>
</html>`;

  const rewritten = rewriteHtmlWithBlobMap(html, blobMap);

  assert.ok(rewritten.includes('href="blob:http://localhost/mock-css"'));
  assert.ok(rewritten.includes('src="blob:http://localhost/mock-js"'));
  assert.ok(rewritten.includes('src="blob:http://localhost/mock-logo"'));
  assert.ok(rewritten.includes('url("blob:http://localhost/mock-font")'));
  assert.ok(rewritten.includes('<script type="importmap">'));
});

test('extractExtensionWebviewPackage: extracts assets and synthesizes universal container shell when no HTML exists', async () => {
  const zip = new JSZip();

  // Mock Antigravity Panel / TFA SPA bundle
  zip.file('extension/dist/webview.js', 'console.log("Antigravity Panel Webview initialized");');
  zip.file('extension/dist/webview.css', 'body { background: #231e22; color: #fff; }');
  zip.file('extension/node_modules/@vscode/codicons/dist/codicon.css', '@font-face { font-family: "codicon"; }');
  zip.file('extension/node_modules/@vscode/codicons/dist/codicon.ttf', new Uint8Array([0, 1, 2, 3]));

  const pkg = {
    name: 'antigravity-panel',
    version: '2.8.1',
    displayName: 'Antigravity Panel',
    contributes: {
      views: {
        antigravity: [{ id: 'antigravity.panel', name: 'Antigravity', type: 'webview' }],
      },
    },
  };

  const { webviewAssets, webviewHtml } = await extractExtensionWebviewPackage(zip, pkg, 'n2ns.antigravity-panel');

  // Verify synthesized HTML shell
  assert.ok(webviewHtml, 'webviewHtml should be synthesized');
  assert.ok(webviewHtml.includes('<sidebar-app></sidebar-app>'), 'Should include custom element placeholder');
  assert.ok(webviewHtml.includes('<div id="root"></div>'), 'Should include React root');
  assert.ok(webviewHtml.includes('src="./dist/webview.js"'), 'Should link primary script');
  assert.ok(webviewHtml.includes('href="./dist/webview.css"'), 'Should link webview stylesheet');
  assert.ok(webviewHtml.includes('window.__VERSION__ = "2.8.1"'), 'Should inject package version');

  // Verify asset registry contains the synthesized index.html and assets
  assert.ok(webviewAssets['index.html'], 'Synthesized index.html must be saved in webviewAssets');
  assert.equal(webviewAssets['index.html'].mime, 'text/html');
  assert.ok(webviewAssets['dist/webview.js'], 'dist/webview.js must be present');
  assert.ok(webviewAssets['codicon.ttf'], 'codicon.ttf should be mapped under basename');

  // Verify retrieval via getExtensionAsset
  const retrieved = await getExtensionAsset('n2ns.antigravity-panel', 'codicon.ttf');
  assert.ok(retrieved, 'Should retrieve codicon.ttf through basename fallback');
  assert.equal(retrieved.mime, 'font/ttf');
});
