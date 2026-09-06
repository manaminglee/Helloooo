/**
 * Opaque numeric URLs for app pages and creator profiles.
 * Live + audio require a short-lived grant bound to this visitor.
 */
const crypto = require('crypto');
const clientIp = require('./clientIp');

const PAGES = Object.freeze({
  video: 'video',
  text: 'text',
  group_video: 'group_video',
  lives: 'lives',
  audio: 'audio',
  join: 'join',
});

const AUTH_PAGES = new Set(['lives', 'audio']);
const GRANT_PAGES = new Set(['video', 'text', 'group_video', 'lives', 'audio', 'join']);
const PAGE_TTL_MS = 2 * 60 * 60 * 1000;
const JOIN_TTL_MS = 24 * 60 * 60 * 1000;
const PAGE_DIGITS = 16;
const PROFILE_MAC_DIGITS = 10;

function navSecret() {
  return String(
    process.env.NAV_SECRET
    || process.env.ADMIN_KEY
    || process.env.LIVEKIT_API_SECRET
    || 'helloooo-nav-dev'
  ).trim();
}

function hmacBytes(label) {
  return crypto.createHmac('sha256', navSecret()).update(String(label)).digest();
}

function digitsFromHash(buf, length) {
  let out = '';
  for (let i = 0; i < buf.length && out.length < length; i += 1) {
    out += String(buf[i] % 10);
  }
  while (out.length < length) out += '0';
  return out.slice(0, length);
}

function hmacDigits(label, length) {
  return digitsFromHash(hmacBytes(label), length);
}

function pageNumber(page) {
  if (!GRANT_PAGES.has(page)) return null;
  return hmacDigits(`page:${page}`, PAGE_DIGITS);
}

function allPageNumbers() {
  const out = {};
  for (const page of GRANT_PAGES) out[page] = pageNumber(page);
  return out;
}

function pageFromNumber(n) {
  const raw = String(n || '');
  if (!/^\d{16}$/.test(raw)) return null;
  for (const page of GRANT_PAGES) {
    if (pageNumber(page) === raw) return page;
  }
  return null;
}

function profileNavId(creatorCode) {
  const code = String(creatorCode || '');
  if (!/^\d{6}$/.test(code)) return null;
  return `${code}${hmacDigits(`profile:${code}`, PROFILE_MAC_DIGITS)}`;
}

function parseProfileNavId(n) {
  const raw = String(n || '');
  if (!/^\d{16}$/.test(raw)) return null;
  const code = raw.slice(0, 6);
  if (profileNavId(code) !== raw) return null;
  return code;
}

function profilePath(creatorCode) {
  const id = profileNavId(creatorCode);
  return id ? `/u/${id}` : '/';
}

function pagePath(page, { auth, extra = '' } = {}) {
  const n = pageNumber(page);
  if (!n) return '/';
  const q = new URLSearchParams();
  if (auth) q.set('a', auth);
  const tail = extra ? `/${encodeURIComponent(extra)}` : '';
  const qs = q.toString();
  return `/n/${n}${tail}${qs ? `?${qs}` : ''}`;
}

function signGrant({ page, sid, ip, exp, extra = '' }) {
  const payload = `${page}|${sid}|${ip}|${exp}|${extra}`;
  return hmacBytes(`grant:${payload}`).toString('hex').slice(0, 32);
}

function packAuth(exp, hmac) {
  return `${Number(exp).toString(36)}.${hmac}`;
}

function unpackAuth(auth) {
  const raw = String(auth || '');
  const dot = raw.indexOf('.');
  if (dot < 1) return null;
  const exp = parseInt(raw.slice(0, dot), 36);
  const hmac = raw.slice(dot + 1).toLowerCase();
  if (!Number.isFinite(exp) || !/^[a-f0-9]{32}$/.test(hmac)) return null;
  return { exp, hmac };
}

function mintGrant({ page, sid, ip, extra = '' }) {
  if (!GRANT_PAGES.has(page)) return null;
  const visitor = String(sid || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (visitor.length < 8) return null;
  const ttl = page === 'join' ? JOIN_TTL_MS : PAGE_TTL_MS;
  const exp = Date.now() + ttl;
  const ipKey = String(ip || '').slice(0, 64);
  const extraSafe = String(extra || '').slice(0, 80);
  const hmac = signGrant({ page, sid: visitor, ip: ipKey, exp, extra: extraSafe });
  const auth = packAuth(exp, hmac);
  return {
    page,
    n: pageNumber(page),
    a: auth,
    exp,
    path: pagePath(page, { auth, extra: extraSafe }),
  };
}

function verifyGrant({ page, sid, ip, auth, extra = '' }) {
  if (!GRANT_PAGES.has(page)) return false;
  const visitor = String(sid || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  const parts = unpackAuth(auth);
  if (visitor.length < 8 || !parts) return false;
  if (parts.exp < Date.now() || parts.exp > Date.now() + JOIN_TTL_MS + 60_000) return false;
  const expected = signGrant({
    page,
    sid: visitor,
    ip: String(ip || '').slice(0, 64),
    exp: parts.exp,
    extra: String(extra || '').slice(0, 80),
  });
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(parts.hmac, 'hex'));
  } catch {
    return false;
  }
}

function parsePath(pathname) {
  const path = String(pathname || '/');
  const blocked = ['/live', '/audio', '/creator/', '/join/'].some((p) => (
    p.endsWith('/') ? path.toLowerCase().startsWith(p) : path.toLowerCase() === p || path.toLowerCase().startsWith(`${p}/`)
  ));
  const pageMatch = path.match(/^\/n\/(\d{16})(?:\/([^/?#]+))?$/i);
  if (pageMatch) {
    const page = pageFromNumber(pageMatch[1]);
    return {
      kind: page ? 'page' : 'unknown',
      page,
      n: pageMatch[1],
      extra: pageMatch[2] ? decodeURIComponent(pageMatch[2]) : '',
      blocked: false,
    };
  }
  const profileMatch = path.match(/^\/u\/(\d{16})$/i);
  if (profileMatch) {
    const code = parseProfileNavId(profileMatch[1]);
    return {
      kind: code ? 'profile' : 'unknown',
      navId: profileMatch[1],
      creatorCode: code,
      blocked: false,
    };
  }
  if (path === '/' || path === '') return { kind: 'landing', blocked: false };
  if (blocked) return { kind: 'blocked', blocked: true };
  return { kind: 'other', blocked: false };
}

function registerOpaqueNav(app, { getClientIp } = {}) {
  const ipOf = (req) => {
    try {
      return (getClientIp || clientIp.httpClientIp)(req) || '';
    } catch {
      return '';
    }
  };

  app.get('/api/nav/pages', (_req, res) => {
    res.json({ ok: true, pages: allPageNumbers(), authPages: [...AUTH_PAGES] });
  });

  app.post('/api/nav/grant', (req, res) => {
    const page = String(req.body?.page || '');
    const sid = String(req.body?.sid || '');
    const extra = String(req.body?.extra || '');
    if (!GRANT_PAGES.has(page)) return res.status(400).json({ ok: false, error: 'Unknown page' });
    const grant = mintGrant({ page, sid, ip: ipOf(req), extra });
    if (!grant) return res.status(400).json({ ok: false, error: 'Invalid session' });
    res.json({ ok: true, ...grant, requiresAuth: AUTH_PAGES.has(page) });
  });

  app.get('/api/nav/verify', (req, res) => {
    const n = String(req.query?.n || '');
    const page = pageFromNumber(n) || String(req.query?.page || '');
    const sid = String(req.query?.sid || '');
    const auth = String(req.query?.a || '');
    const extra = String(req.query?.extra || '');
    if (!GRANT_PAGES.has(page) || pageNumber(page) !== n) {
      return res.status(404).json({ ok: false, error: 'Unknown page' });
    }
    const valid = verifyGrant({ page, sid, ip: ipOf(req), auth, extra });
    if (!valid && AUTH_PAGES.has(page)) {
      return res.status(403).json({ ok: false, error: 'Auth required' });
    }
    if (!valid) {
      return res.status(403).json({ ok: false, error: 'Grant expired' });
    }
    res.json({ ok: true, page, n, requiresAuth: AUTH_PAGES.has(page) });
  });
}

module.exports = {
  PAGES,
  AUTH_PAGES,
  GRANT_PAGES,
  pageNumber,
  allPageNumbers,
  pageFromNumber,
  profileNavId,
  parseProfileNavId,
  profilePath,
  pagePath,
  mintGrant,
  verifyGrant,
  parsePath,
  registerOpaqueNav,
};
