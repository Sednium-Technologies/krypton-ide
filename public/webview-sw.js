// public/webview-sw.js

const DB_NAME = 'krypton_extension_assets';
const DB_VERSION = 1;
const DB_STORE = 'assets';

function openDatabase() {
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

function getAsset(extensionId, relativePath) {
  // Clean path: strip query strings and hash anchors
  const noQuery = (relativePath || '').split(/[?#]/)[0].replace(/\\/g, '/');
  const cleanPath = noQuery.replace(/^(\.\/|\/)+/, '').replace(/^[./]+/, '');
  const baseName = cleanPath.split('/').pop() || cleanPath;
  const key = `${extensionId}::${cleanPath}`;

  return openDatabase().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result) {
          return resolve(req.result);
        }
        // If not found by clean path, search by basename or relative suffix
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const item = cursor.value;
            if (item && item.extensionId === extensionId) {
              const itemPath = item.path || '';
              const itemBase = itemPath.split('/').pop() || itemPath;
              if (itemBase === baseName || itemPath.endsWith('/' + cleanPath) || itemPath.endsWith(cleanPath)) {
                return resolve(item);
              }
            }
            cursor.continue();
          } else {
            resolve(null);
          }
        };
        cursorReq.onerror = () => resolve(null);
      };
      req.onerror = () => reject(req.error);
    });
  });
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Match /ext-webview/:extensionId/*
  if (url.pathname.startsWith('/ext-webview/')) {
    const subPath = url.pathname.slice('/ext-webview/'.length);
    const slashIdx = subPath.indexOf('/');

    if (slashIdx !== -1) {
      const extensionId = decodeURIComponent(subPath.slice(0, slashIdx));
      let assetPath = decodeURIComponent(subPath.slice(slashIdx + 1));
      if (!assetPath || assetPath.trim() === '') {
        assetPath = 'index.html';
      }

      event.respondWith(
        getAsset(extensionId, assetPath)
          .then((asset) => {
            if (asset && asset.data) {
              return new Response(asset.data, {
                status: 200,
                headers: {
                  'Content-Type': asset.mime || 'application/octet-stream',
                  'Access-Control-Allow-Origin': '*',
                  'Cache-Control': 'no-cache',
                  'X-Krypton-Asset': '1',
                },
              });
            }
            return fetch(event.request);
          })
          .catch(() => fetch(event.request))
      );
    }
  }
});
