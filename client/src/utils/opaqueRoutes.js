import { API_BASE } from '../config/apiBase';

const SID_KEY = 'mm_nav_sid';
const AUTH_PAGES = new Set(['lives', 'audio']);

const MODE_TO_PAGE = {
  video: 'video',
  text: 'text',
  group_video: 'group_video',
  lives: 'lives',
  group_text: 'audio',
};

export function navSessionId() {
  try {
    let sid = sessionStorage.getItem(SID_KEY);
    if (sid && sid.length >= 16) return sid;
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    sid = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem(SID_KEY, sid);
    return sid;
  } catch {
    return `nav${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function pageForMode(mode) {
  return MODE_TO_PAGE[mode] || null;
}

export function modeForPage(page) {
  if (page === 'audio') return 'group_text';
  return page || null;
}

export function parseOpaqueLocation(pathname = window.location.pathname, search = window.location.search) {
  const path = String(pathname || '/');
  const params = new URLSearchParams(search || '');
  const lower = path.toLowerCase();
  if (lower === '/live' || lower.startsWith('/live/') || lower === '/audio' || lower.startsWith('/audio/')) {
    return { kind: 'blocked', reason: 'auth' };
  }
  if (lower.startsWith('/creator/')) {
    return { kind: 'blocked', reason: 'profile' };
  }
  const pageMatch = path.match(/^\/n\/(\d{16})(?:\/([^/?#]+))?$/i);
  if (pageMatch) {
    return {
      kind: 'page',
      n: pageMatch[1],
      extra: pageMatch[2] ? decodeURIComponent(pageMatch[2]) : '',
      auth: params.get('a') || '',
      pa: params.get('pa') || '',
      asCohost: params.get('cohost') === '1',
    };
  }
  const profileMatch = path.match(/^\/u\/(\d{16})$/i);
  if (profileMatch) {
    return { kind: 'profile', navId: profileMatch[1] };
  }
  const joinMatch = path.match(/^\/join\/([^/]+)/i);
  if (joinMatch) {
    return { kind: 'legacy-join', roomId: decodeURIComponent(joinMatch[1]), pa: params.get('pa') || '', asCohost: params.get('cohost') === '1' };
  }
  return { kind: 'other' };
}

export async function requestNavGrant(page, extra = '') {
  const sid = navSessionId();
  const res = await fetch(`${API_BASE}/api/nav/grant`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page, sid, extra: extra || undefined }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok || !data.path) {
    throw new Error(data?.error || 'Could not open that page');
  }
  return data;
}

export async function verifyNavGrant({ n, auth, extra = '' }) {
  const sid = navSessionId();
  const qs = new URLSearchParams({ n, sid, a: auth || '', extra });
  const res = await fetch(`${API_BASE}/api/nav/verify?${qs}`, { credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) return { ok: false, error: data?.error || 'Auth required' };
  return data;
}

export function replaceOpaqueUrl(path) {
  try {
    const next = path || '/';
    window.history.replaceState(window.history.state || {}, '', next);
  } catch { /* ignore */ }
}

export function pushOpaqueUrl(path) {
  try {
    window.history.pushState(window.history.state || {}, '', path || '/');
  } catch { /* ignore */ }
}

export function profileHref(profile) {
  if (profile?.profilePath) return profile.profilePath;
  if (profile?.navId) return `/u/${profile.navId}`;
  return '/';
}

export function isAuthPage(page) {
  return AUTH_PAGES.has(page);
}
