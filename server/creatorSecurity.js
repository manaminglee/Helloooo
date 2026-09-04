/**
 * Creator registration/login validation, password hashing, and response sanitization.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const ALLOWED_PLATFORMS = new Set([
  'Instagram',
  'YouTube',
  'Snapchat',
  'X (Twitter)',
  'TikTok',
  'Other',
]);

const HANDLE_REGEX = /^[a-zA-Z0-9_]{3,30}$/;
const UPI_REGEX = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9._-]{2,64}$/;

const loginAttempts = new Map();
const registerAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const MAX_REGISTER_PER_IP = 3;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

/** 10,000 Nuts = $1. Display helper still named computeEarningsRs for callers; returns USD cents-as-rupee-display field historically used as earnings_rs. */
const NUTS_PER_USD = 10000;

function computeEarningsUsd(nuts) {
  return Math.floor(Math.max(0, Number(nuts) || 0) / NUTS_PER_USD * 100) / 100;
}

/** Legacy name: now stores USD value (10k Nuts = $1), not INR slabs. */
function computeEarningsRs(coins) {
  return computeEarningsUsd(coins);
}

function normalizeHandle(raw) {
  return String(raw || '').trim().replace(/^@+/, '').slice(0, 30);
}

function validateHandle(raw) {
  const handle = normalizeHandle(raw);
  if (!handle) return { ok: false, error: 'Handle is required.' };
  if (!HANDLE_REGEX.test(handle)) {
    return { ok: false, error: 'Handle must be 3–30 characters (letters, numbers, underscore only).' };
  }
  return { ok: true, handle };
}

function validatePlatform(platform) {
  const p = String(platform || '').trim();
  if (!p || !ALLOWED_PLATFORMS.has(p)) {
    return { ok: false, error: 'Please select a valid platform.' };
  }
  return { ok: true, platform: p };
}

function validateProfileLink(link, handle) {
  const urlStr = String(link || '').trim();
  if (!urlStr) return { ok: false, error: 'Profile link is required.' };
  let url;
  try {
    url = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
  } catch {
    return { ok: false, error: 'Profile link must be a valid URL (https://…).' };
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { ok: false, error: 'Profile link must use http or https.' };
  }
  if (url.hostname === 'localhost' || url.hostname.endsWith('.local')) {
    return { ok: false, error: 'Profile link cannot point to localhost.' };
  }
  const h = normalizeHandle(handle).toLowerCase();
  if (h && !url.href.toLowerCase().includes(h.replace(/_/g, '')) && !url.pathname.toLowerCase().includes(h)) {
    // Soft warning only — allow but flag; registration can proceed
  }
  return { ok: true, link: url.href.slice(0, 200) };
}

function validatePassword(password, { forLogin = false } = {}) {
  const p = String(password || '');
  if (!p) return { ok: false, error: 'Password is required.' };
  if (p.length > 128) return { ok: false, error: 'Password is too long.' };
  if (!forLogin) {
    if (p.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
    if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) {
      return { ok: false, error: 'Password must include at least one letter and one number.' };
    }
  }
  return { ok: true, password: p };
}

function validateUpi(upi) {
  const u = String(upi || '').trim().toLowerCase();
  if (!u) return { ok: false, error: 'UPI ID is required.' };
  if (!UPI_REGEX.test(u)) return { ok: false, error: 'Enter a valid UPI ID (name@bank).' };
  return { ok: true, upi: u };
}

function generateSecurePassword(handle) {
  const base = normalizeHandle(handle).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'Creator';
  const suffix = crypto.randomBytes(4).toString('hex');
  return `${base}@${suffix}`;
}

async function hashPassword(plain) {
  return bcrypt.hash(String(plain), 12);
}

async function verifyPassword(plain, creator) {
  if (!creator) return false;
  const hash = creator.password_hash;
  if (hash) {
    try {
      return await bcrypt.compare(String(plain), hash);
    } catch {
      return false;
    }
  }
  // Legacy / schema-fallback: bcrypt hash may be stored in `password` when
  // `password_hash` column is missing on older Supabase schemas.
  if (creator.password) {
    const stored = String(creator.password);
    if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
      try {
        return await bcrypt.compare(String(plain), stored);
      } catch {
        return false;
      }
    }
    if (stored === plain) return 'legacy';
  }
  return false;
}

function stripCreatorSecrets(creator, { includePasswordOnce = false } = {}) {
  if (!creator) return null;
  const out = { ...creator };
  delete out.password_hash;
  if (!includePasswordOnce) delete out.password;
  delete out.follower_ips;
  return out;
}

// referral_code is accepted as a legacy credential by getApprovedCreatorForRequest,
// so it is a secret, not an identifier. The rest are private contact, payout and
// network details. None may reach a caller who has not proven account ownership.
const CREATOR_PRIVATE_FIELDS = [
  'referral_code',
  'email',
  'preferred_upi',
  'authorized_ips',
  'follower_ips',
  'password',
  'password_hash',
];

/**
 * Creator record safe to hand to a caller that has not proven account ownership.
 * `keep` re-admits named fields for callers with a legitimate need (e.g. an
 * agency seeing its own roster's contact email).
 */
function publicCreatorView(creator, { keep = [] } = {}) {
  if (!creator) return null;
  const out = { ...creator };
  const keepSet = new Set(keep);
  for (const field of CREATOR_PRIVATE_FIELDS) {
    if (!keepSet.has(field)) delete out[field];
  }
  return out;
}

function checkRateBucket(map, key, max, windowMs) {
  const now = Date.now();
  let bucket = map.get(key);
  if (!bucket || now - bucket.start > windowMs) {
    bucket = { start: now, count: 0 };
    map.set(key, bucket);
  }
  if (bucket.count >= max) {
    const retryAfterSec = Math.ceil((windowMs - (now - bucket.start)) / 1000);
    return { allowed: false, retryAfterSec };
  }
  bucket.count += 1;
  return { allowed: true };
}

function checkLoginLock(handle, ip) {
  const key = `${String(ip)}:${normalizeHandle(handle).toLowerCase()}`;
  const rec = loginAttempts.get(key);
  if (rec?.lockedUntil && Date.now() < rec.lockedUntil) {
    const retryAfterSec = Math.ceil((rec.lockedUntil - Date.now()) / 1000);
    return { locked: true, retryAfterSec, key };
  }
  if (rec?.lockedUntil && Date.now() >= rec.lockedUntil) {
    loginAttempts.delete(key);
  }
  return { locked: false, key };
}

function recordLoginFailure(key) {
  const rec = loginAttempts.get(key) || { failures: 0 };
  rec.failures = (rec.failures || 0) + 1;
  if (rec.failures >= MAX_LOGIN_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOGIN_LOCK_MS;
    rec.failures = 0;
  }
  loginAttempts.set(key, rec);
}

function clearLoginFailures(key) {
  loginAttempts.delete(key);
}

function checkRegisterRate(ip) {
  return checkRateBucket(registerAttempts, ip, MAX_REGISTER_PER_IP, REGISTER_WINDOW_MS);
}

async function logCreatorEvent(supabase, localDb, saveLocalDb, { creatorId, eventType, amount = 0, details = '', metadata = {} }) {
  const row = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    creator_id: creatorId,
    event_type: eventType,
    amount,
    details: String(details).slice(0, 200),
    metadata,
    created_at: new Date().toISOString(),
  };
  if (supabase) {
    await supabase.from('creator_events').insert({
      creator_id: creatorId,
      event_type: eventType,
      amount,
      details: row.details,
      metadata,
    });
  } else {
    if (!localDb.creator_events) localDb.creator_events = [];
    localDb.creator_events.push(row);
    if (localDb.creator_events.length > 5000) localDb.creator_events = localDb.creator_events.slice(-5000);
    saveLocalDb();
  }
  return row;
}

async function creditCreatorCoins(supabase, localDb, saveLocalDb, creator, amount, eventDetails) {
  const add = Math.max(0, Math.floor(Number(amount) || 0));
  if (!creator || add <= 0) return null;
  const newCoins = (creator.coins_earned || 0) + add;
  const newEarnings = computeEarningsRs(newCoins);
  if (supabase) {
    await supabase.from('creators').update({ coins_earned: newCoins, earnings_rs: newEarnings }).eq('id', creator.id);
  } else {
    creator.coins_earned = newCoins;
    creator.earnings_rs = newEarnings;
    saveLocalDb();
  }
  creator.coins_earned = newCoins;
  creator.earnings_rs = newEarnings;
  await logCreatorEvent(supabase, localDb, saveLocalDb, {
    creatorId: creator.id,
    eventType: eventDetails?.type || 'credit',
    amount: add,
    details: eventDetails?.details || '',
    metadata: eventDetails?.metadata || {},
  });
  return { coins_earned: newCoins, earnings_rs: newEarnings };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateEmail(raw, { required = false } = {}) {
  const e = String(raw || '').trim().toLowerCase();
  if (!e) {
    if (required) return { ok: false, error: 'Email is required for account recovery.' };
    return { ok: true, email: null };
  }
  if (!EMAIL_REGEX.test(e) || e.length > 254) return { ok: false, error: 'Enter a valid email address.' };
  return { ok: true, email: e };
}

async function createPasswordResetToken(supabase, localDb, saveLocalDb, creatorId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const row = {
    id: `rst_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    creator_id: creatorId,
    token,
    expires_at: expiresAt,
    used: false,
    created_at: new Date().toISOString(),
  };
  if (supabase) {
    await supabase.from('creator_password_resets').insert({
      creator_id: creatorId,
      token,
      expires_at: expiresAt,
      used: false,
    });
  } else {
    if (!localDb.creator_password_resets) localDb.creator_password_resets = [];
    localDb.creator_password_resets.push(row);
    saveLocalDb();
  }
  return token;
}

async function findValidResetToken(supabase, localDb, token) {
  if (!token) return null;
  const now = Date.now();
  if (supabase) {
    const { data } = await supabase
      .from('creator_password_resets')
      .select('*')
      .eq('token', token)
      .eq('used', false)
      .maybeSingle();
    if (!data) return null;
    if (new Date(data.expires_at).getTime() < now) return null;
    return data;
  }
  const row = (localDb.creator_password_resets || []).find(
    (r) => r.token === token && !r.used && new Date(r.expires_at).getTime() >= now
  );
  return row || null;
}

async function markResetTokenUsed(supabase, localDb, saveLocalDb, token) {
  if (supabase) {
    await supabase.from('creator_password_resets').update({ used: true }).eq('token', token);
  } else {
    const row = (localDb.creator_password_resets || []).find((r) => r.token === token);
    if (row) row.used = true;
    saveLocalDb();
  }
}

module.exports = {
  ALLOWED_PLATFORMS,
  HANDLE_REGEX,
  NUTS_PER_USD,
  computeEarningsUsd,
  computeEarningsRs,
  normalizeHandle,
  validateHandle,
  validatePlatform,
  validateProfileLink,
  validatePassword,
  validateEmail,
  validateUpi,
  generateSecurePassword,
  hashPassword,
  verifyPassword,
  stripCreatorSecrets,
  publicCreatorView,
  checkRegisterRate,
  checkLoginLock,
  recordLoginFailure,
  clearLoginFailures,
  logCreatorEvent,
  creditCreatorCoins,
  createPasswordResetToken,
  findValidResetToken,
  markResetTokenUsed,
};
