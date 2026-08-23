/* Helloooo - Service Worker (static assets only) */
const CACHE = 'helloooo-static-v13';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

function canCacheAsset(pathname, contentType) {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  // Never cache HTML as JS/CSS (SPA fallback mistake)
  if (ct.includes('text/html')) return false;
  if (pathname.match(/\.js$/i)) return ct.includes('javascript') || ct.includes('ecmascript');
  if (pathname.match(/\.css$/i)) return ct.includes('text/css');
  if (pathname.match(/\.(png|jpg|jpeg|svg|ico|webp)$/i)) return ct.includes('image');
  if (pathname.match(/\.woff2?$/i)) return ct.includes('font') || ct.includes('woff');
  return false;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Cache API only supports http(s); ignore extensions and other schemes
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;

  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(req).catch(() => caches.match('/index.html'))
    );
    return;
  }

  if (!url.pathname.match(/\.(js|css|woff2?|png|jpg|jpeg|svg|ico|webp)$/i)) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        const type = res.headers.get('content-type') || '';
        if (res.ok && res.type === 'basic' && canCacheAsset(url.pathname, type)) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
