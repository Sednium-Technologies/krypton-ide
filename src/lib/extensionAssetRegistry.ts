// src/lib/extensionAssetRegistry.ts

const DB_NAME = 'krypton_extension_assets';
const DB_VERSION = 1;
const DB_STORE = 'assets';

export interface StoredAsset {
  id: string; // `${extensionId}::${path}`
  extensionId: string;
  path: string;
  data: Uint8Array | string;
  mime: string;
}

// In-memory fallback / cache
const memoryAssetStore = new Map<string, StoredAsset>();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in this environment'));
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Standard MIME detection helper based on file extension.
 * Supports webview bundles, styles, media, fonts, wasm, and json.
 */
export function getMimeType(filePath: string): string {
  if (!filePath) return 'application/octet-stream';
  const cleanPath = filePath.split(/[?#]/)[0];
  const ext = cleanPath.toLowerCase().split('.').pop() || '';
  switch (ext) {
    case 'html':
    case 'htm':
      return 'text/html';
    case 'js':
    case 'mjs':
      return 'application/javascript';
    case 'css':
      return 'text/css';
    case 'json':
      return 'application/json';
    case 'svg':
      return 'image/svg+xml';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'woff':
      return 'font/woff';
    case 'woff2':
      return 'font/woff2';
    case 'ttf':
      return 'font/ttf';
    case 'otf':
      return 'font/otf';
    case 'eot':
      return 'application/vnd.ms-fontobject';
    case 'wasm':
      return 'application/wasm';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Normalizes asset relative path to a clean forward-slash path without leading ./ or /
 * Strips query strings and hash anchors (e.g. codicon.ttf?721d4c... -> codicon.ttf).
 */
export function normalizeAssetPath(p: string): string {
  if (!p) return '';
  const noQuery = p.split(/[?#]/)[0].replace(/\\/g, '/');
  return noQuery.replace(/^(\.\/|\/)+/, '').replace(/^[./]+/, '');
}

/**
 * Store binary blobs / Uint8Arrays and strings indexed by extensionId and path.
 */
export async function storeExtensionAssets(
  extensionId: string,
  assets: Record<string, { data: Uint8Array | string; mime: string }>
): Promise<void> {
  const entries: StoredAsset[] = [];
  for (const [rawPath, item] of Object.entries(assets)) {
    const cleanPath = normalizeAssetPath(rawPath);
    const record: StoredAsset = {
      id: `${extensionId}::${cleanPath}`,
      extensionId,
      path: cleanPath,
      data: item.data,
      mime: item.mime || getMimeType(cleanPath),
    };
    memoryAssetStore.set(record.id, record);
    entries.push(record);
  }

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      for (const entry of entries) {
        store.put(entry);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[extensionAssetRegistry] IDB write failed, using in-memory store:', err);
  }
}

/**
 * Retrieve single extension asset.
 */
export async function getExtensionAsset(
  extensionId: string,
  relativePath: string
): Promise<{ data: Uint8Array | string; mime: string } | null> {
  const cleanPath = normalizeAssetPath(relativePath);
  const key = `${extensionId}::${cleanPath}`;

  if (memoryAssetStore.has(key)) {
    const cached = memoryAssetStore.get(key)!;
    return { data: cached.data, mime: cached.mime };
  }

  // Basename fallback in memory
  const baseName = cleanPath.split('/').pop() || cleanPath;
  for (const [, item] of memoryAssetStore.entries()) {
    if (item.extensionId === extensionId) {
      if (item.path === cleanPath || item.path.endsWith('/' + baseName) || item.path === baseName) {
        return { data: item.data, mime: item.mime };
      }
    }
  }

  try {
    const db = await openDatabase();
    return await new Promise<{ data: Uint8Array | string; mime: string } | null>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result) {
          memoryAssetStore.set(key, req.result);
          resolve({ data: req.result.data, mime: req.result.mime });
        } else {
          // Basename fallback in IDB
          const cursorReq = store.openCursor();
          cursorReq.onsuccess = (e) => {
            const cursor = (e.target as any).result;
            if (cursor) {
              const item = cursor.value as StoredAsset;
              if (item && item.extensionId === extensionId) {
                const itemPath = item.path || '';
                const itemBase = itemPath.split('/').pop() || itemPath;
                if (itemBase === baseName || itemPath.endsWith('/' + cleanPath) || itemPath.endsWith(cleanPath)) {
                  memoryAssetStore.set(key, item);
                  return resolve({ data: item.data, mime: item.mime });
                }
              }
              cursor.continue();
            } else {
              resolve(null);
            }
          };
          cursorReq.onerror = () => resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[extensionAssetRegistry] IDB get failed:', err);
    return null;
  }
}

/**
 * Creates blob URLs for all assets belonging to extensionId and returns a map from path to URL.
 * Every asset is mapped under clean path, ./path, /path, baseName, ./baseName, /baseName, and path without query.
 */
export async function createBlobUrlMap(extensionId: string): Promise<Record<string, string>> {
  const blobMap: Record<string, string> = {};

  const registerBlobForAsset = (item: StoredAsset) => {
    const cleanPath = normalizeAssetPath(item.path);
    const baseName = cleanPath.split('/').pop() || cleanPath;

    let blobUrl = blobMap[cleanPath];
    if (!blobUrl) {
      const blob = new Blob([item.data as any], { type: item.mime });
      blobUrl = URL.createObjectURL(blob);
    }

    blobMap[cleanPath] = blobUrl;
    blobMap[`./${cleanPath}`] = blobUrl;
    blobMap[`/${cleanPath}`] = blobUrl;

    if (!blobMap[baseName]) {
      blobMap[baseName] = blobUrl;
      blobMap[`./${baseName}`] = blobUrl;
      blobMap[`/${baseName}`] = blobUrl;
    }

    if (item.path && !blobMap[item.path]) {
      blobMap[item.path] = blobUrl;
    }
  };

  // 1. Collect from in-memory store
  for (const [, item] of memoryAssetStore.entries()) {
    if (item.extensionId === extensionId) {
      registerBlobForAsset(item);
    }
  }

  // 2. Query IndexedDB
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          const item = cursor.value as StoredAsset;
          if (item && item.extensionId === extensionId) {
            registerBlobForAsset(item);
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[extensionAssetRegistry] createBlobUrlMap IDB scan error:', err);
  }

  return blobMap;
}

/**
 * Generates an importmap JSON string for module resolution.
 */
export function generateImportMap(blobMap: Record<string, string>): string {
  const imports: Record<string, string> = {};
  for (const [p, blobUrl] of Object.entries(blobMap)) {
    if (p.endsWith('.js') || p.endsWith('.mjs')) {
      imports[p] = blobUrl;
    }
  }
  return JSON.stringify({ imports }, null, 2);
}

/**
 * Replaces module scripts, links, img src, and CSS url(...) with Blob URLs and injects <script type="importmap">.
 */
export function rewriteHtmlWithBlobMap(html: string, blobMap: Record<string, string>): string {
  if (!html) return '';

  let rewritten = html;

  const resolvePath = (urlPath: string): string | undefined => {
    if (
      urlPath.startsWith('http://') ||
      urlPath.startsWith('https://') ||
      urlPath.startsWith('data:') ||
      urlPath.startsWith('blob:')
    ) {
      return undefined;
    }
    const clean = normalizeAssetPath(urlPath);
    const base = clean.split('/').pop() || clean;
    return (
      blobMap[clean] ||
      blobMap[`./${clean}`] ||
      blobMap[`/${clean}`] ||
      blobMap[urlPath] ||
      blobMap[base]
    );
  };

  // Replace src and href attributes matching blobMap paths
  rewritten = rewritten.replace(
    /(src|href)=["']([^"']+)["']/gi,
    (match, attr, urlPath) => {
      const resolved = resolvePath(urlPath);
      if (resolved) {
        return `${attr}="${resolved}"`;
      }
      return match;
    }
  );

  // Replace CSS url(...) links
  rewritten = rewritten.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (match, quote, urlPath) => {
      const trimmed = urlPath.trim();
      const resolved = resolvePath(trimmed);
      if (resolved) {
        return `url("${resolved}")`;
      }
      return match;
    }
  );

  // Inject importmap
  const importMapJson = generateImportMap(blobMap);
  const importMapTag = `\n<script type="importmap">\n${importMapJson}\n</script>\n`;

  if (rewritten.includes('<head>')) {
    rewritten = rewritten.replace('<head>', `<head>${importMapTag}`);
  } else if (rewritten.includes('<html>')) {
    rewritten = rewritten.replace('<html>', `<html><head>${importMapTag}</head>`);
  } else {
    rewritten = `<head>${importMapTag}</head>${rewritten}`;
  }

  return rewritten;
}
