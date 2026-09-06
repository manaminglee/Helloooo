/* Helloooo PWA — static cache, offline shell, web push */
const CACHE = 'helloooo-static-v19';
const OFFLINE = '/index.html';

const offlineResponse = () => new Response('Offline', {
  status: 503,
  statusText: 'Service Unavailable',
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
});

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(OFFLINE).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('push', (e) => {
  let data = { title: 'Helloooo', body: 'Something new is happening', url: '/' };
  try {
    if (e.data) data = { ...data, ...e.data.json() };
  } catch { /* plain text */ }
  e.waitUntil(
    self.registration.showNotification(data.title || 'Helloooo', {
      body: data.body || '',
      icon: '/helloooo-logo.png',
      badge: '/favicon.png',
      tag: data.tag || 'helloooo',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return null;
    })
  );
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

async function networkFirstAsset(req) {
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
        .catch(async () => (await caches.match(OFFLINE)) || offlineResponse())
    );
    return;
  }

  if (!url.pathname.match(/\.(js|css|woff2?|png|jpg|jpeg|svg|ico|webp|json|webmanifest)$/i)) return;

  e.respondWith(networkFirstAsset(req));
});
