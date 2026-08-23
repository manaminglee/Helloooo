/** Site SEO helpers — update document title + meta for SPA routes. */
export const SITE_URL = 'https://helloooo.site';
export const SITE_NAME = 'Helloooo';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/helloooo-logo.png`;

export const DEFAULT_TITLE = 'Helloooo 👋 – Random Video Chat & Voice Rooms | Omegle Alternative';
export const DEFAULT_DESCRIPTION =
  'Helloooo 👋 — free anonymous video chat, text chat, and live voice rooms. Meet strangers by interest. No signup. AI safety, WebRTC video, creator program.';

function setMeta(name, content, { property = false } = {}) {
  if (!content) return;
  const attr = property ? 'property' : 'name';
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = href;
}

/** Apply page-level SEO (call on route / view changes). */
export function applyPageSeo({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  path = '/',
  image = DEFAULT_OG_IMAGE,
  type = 'website',
  noindex = false,
} = {}) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${SITE_URL}${normalizedPath}`;

  document.title = title;
  setMeta('description', description);
  setMeta('robots', noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');
  setCanonical(url);

  setMeta('og:title', title, { property: true });
  setMeta('og:description', description, { property: true });
  setMeta('og:url', url, { property: true });
  setMeta('og:type', type, { property: true });
  setMeta('og:site_name', SITE_NAME, { property: true });
  setMeta('og:image', image, { property: true });
  setMeta('og:locale', 'en_US', { property: true });

  setMeta('twitter:card', 'summary_large_image');
  setMeta('twitter:title', title);
  setMeta('twitter:description', description);
  setMeta('twitter:image', image);
}

export function applyCreatorProfileSeo(handle, bio = '') {
  const safeHandle = String(handle || '').trim();
  const desc = bio
    ? `${bio.slice(0, 140)}${bio.length > 140 ? '…' : ''}`
    : `Follow @${safeHandle} on Helloooo — verified creator profile, live streams, and referral link.`;
  applyPageSeo({
    title: `@${safeHandle} on Helloooo | Creator Profile`,
    description: desc,
    path: `/creator/${encodeURIComponent(safeHandle)}`,
    type: 'profile',
  });
}

export function applyPrivateSessionSeo(modeLabel = 'Chat') {
  applyPageSeo({
    title: `${modeLabel} – Helloooo`,
    description: DEFAULT_DESCRIPTION,
    noindex: true,
  });
}
