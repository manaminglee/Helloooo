/** Client-side creator form validation (mirrors server rules). */

export const CREATOR_HANDLE_REGEX = /^[a-zA-Z0-9_]{3,30}$/;
export const CREATOR_UPI_REGEX = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9._-]{2,64}$/;

export const CREATOR_PLATFORMS = [
  'Instagram',
  'YouTube',
  'Snapchat',
  'X (Twitter)',
  'TikTok',
  'Other',
];

export function normalizeCreatorHandle(raw) {
  return String(raw || '').trim().replace(/^@+/, '').slice(0, 30);
}

export function validateCreatorHandle(raw) {
  const handle = normalizeCreatorHandle(raw);
  if (!handle) return { ok: false, error: 'Handle is required.' };
  if (!CREATOR_HANDLE_REGEX.test(handle)) {
    return { ok: false, error: '3–30 characters: letters, numbers, underscore only.' };
  }
  return { ok: true, handle };
}

export function validateCreatorPlatform(platform) {
  const p = String(platform || '').trim();
  if (!CREATOR_PLATFORMS.includes(p)) return { ok: false, error: 'Select a platform.' };
  return { ok: true, platform: p };
}

export function validateCreatorLink(link) {
  const urlStr = String(link || '').trim();
  if (!urlStr) return { ok: false, error: 'Profile link is required.' };
  try {
    const url = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
    if (!['http:', 'https:'].includes(url.protocol)) return { ok: false, error: 'Link must use http or https.' };
    return { ok: true, link: url.href };
  } catch {
    return { ok: false, error: 'Enter a valid profile URL.' };
  }
}

export function validateCreatorPassword(password, confirm) {
  const p = String(password || '');
  const c = String(confirm || '');
  if (!p) return { ok: false, error: 'Choose a login password.' };
  if (p.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
  if (p.length > 128) return { ok: false, error: 'Password is too long.' };
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) {
    return { ok: false, error: 'Include at least one letter and one number.' };
  }
  if (p !== c) return { ok: false, error: 'Passwords do not match.' };
  return { ok: true, password: p };
}

export function validateCreatorLogin(handleOrEmail, password) {
  const raw = String(handleOrEmail || '').trim();
  if (!raw) return { ok: false, error: 'Handle or email is required.' };
  if (!String(password || '').trim()) return { ok: false, error: 'Password is required.' };
  if (String(password).length > 128) return { ok: false, error: 'Password is too long.' };
  if (raw.includes('@')) {
    const e = validateCreatorEmail(raw, { required: true });
    if (!e.ok) return e;
    return { ok: true, handle: e.email, password: String(password), viaEmail: true };
  }
  const h = validateCreatorHandle(raw);
  if (!h.ok) return h;
  return { ok: true, handle: h.handle, password: String(password), viaEmail: false };
}

export function validateCreatorUpi(upi) {
  const u = String(upi || '').trim().toLowerCase();
  if (!u) return { ok: false, error: 'UPI ID is required.' };
  if (!CREATOR_UPI_REGEX.test(u)) return { ok: false, error: 'Enter a valid UPI ID (name@bank).' };
  return { ok: true, upi: u };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateCreatorEmail(raw, { required = true } = {}) {
  const e = String(raw || '').trim().toLowerCase();
  if (!e) {
    if (required) return { ok: false, error: 'Email is required.' };
    return { ok: true, email: '' };
  }
  if (!EMAIL_REGEX.test(e) || e.length > 254) return { ok: false, error: 'Enter a valid email.' };
  return { ok: true, email: e };
}
