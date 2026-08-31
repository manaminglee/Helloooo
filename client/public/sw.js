/* Helloooo - Service Worker (static assets only) */
const CACHE = 'helloooo-static-v14';

const offlineResponse = () => new Response('Offline', {
  status: 503,
  statusText: 'Service Unavailable',
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
});

self.addEventListener('install', () => {
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
  if (ct.includes('text/html')) return false;
  if (pathname.match(/\.js$/i)) return ct.includes('javascript') || ct.includes('ecmascript');
  if (pathname.match(/\.css$/i)) return ct.includes('text/css');
  if (pathname.match(/\.(png|jpg|jpeg|svg|ico|webp)$/i)) return ct.includes('image');
  if (pathname.match(/\.woff2?$/i)) return ct.includes('font') || ct.includes('woff');
  return false;
}

async function cacheFirstAsset(req) {
  try {
    const res = await fetch(req);
    const type = res.headers.get('content-type') || '';
    if (res.ok && res.type === 'basic' && canCacheAsset(new URL(req.url).pathname, type)) {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    return cached || offlineResponse();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;

  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(req)
        .catch(async () => (await caches.match('/index.html')) || offlineResponse())
    );
    return;
  }

  if (!url.pathname.match(/\.(js|css|woff2?|png|jpg|jpeg|svg|ico|webp)$/i)) return;

  e.respondWith(cacheFirstAsset(req));
});
