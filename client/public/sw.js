/* Helloooo - Service Worker (static assets only) */
const CACHE = 'helloooo-static-v8';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

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

  if (!url.pathname.match(/\.(js|css|woff2?|png|jpg|svg|ico|webp)$/i)) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
