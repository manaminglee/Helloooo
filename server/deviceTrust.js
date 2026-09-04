/**
 * "Remember this device" for the audio + live identity.
 *
 * These are the two surfaces that hold real money (coin recharges, gifting),
 * so the PIN is the thing we must NOT ask for constantly — people who retype a
 * PIN twenty times a day end up picking 1234 and typing it in front of others.
 * Instead: prove the PIN once, then bind a long-lived credential to the device.
 *
 * Security model
 * ──────────────
 * · The device token is 32 random bytes. Only its SHA-256 is stored — a
 *   database leak yields nothing usable, exactly like a password hash.
 * · Every successful resume ROTATES the token. The previous hash is kept for
 *   one generation purely to detect reuse.
 * · Reuse detection: presenting an already-rotated token means the credential
 *   was copied (the legitimate device would hold the newest one). That device
 *   record is revoked immediately and the user is sent back to their PIN.
 * · Tokens are bound to a user-agent hash. A stolen token replayed from a
 *   different client is rejected.
 * · IP is recorded but NOT bound — mobile networks change IPs constantly, and
 *   binding to them would just train people to re-enter their PIN.
 * · Resume is rate limited per IP, and every device is individually revocable.
 * · Trust is opt-in. Without it the old behaviour is unchanged.
 *
 * The PIN itself is never stored here and never travels on a resume.
 */
const crypto = require('crypto');

const TOKEN_BYTES = 32;
const DEVICE_TTL_MS = 90 * 24 * 60 * 60 * 1000;   // 90 days, refreshed on use
const IDLE_REVOKE_MS = 45 * 24 * 60 * 60 * 1000;  // unused for 45 days → dead
const MAX_DEVICES_PER_USER = 8;
const RESUME_LIMIT = { max: 20, windowMs: 10 * 60 * 1000 };

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

/** Constant-time compare so a hash cannot be discovered by timing. */
function sameHash(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function newToken() {
  return `dv_${crypto.randomBytes(TOKEN_BYTES).toString('base64url')}`;
}

function uaFingerprint(userAgent) {
  // Deliberately coarse: browser family + platform, not the full string. Minor
  // version bumps must not log people out.
  const ua = String(userAgent || '').slice(0, 400);
  const family = (ua.match(/(Firefox|Edg|OPR|Chrome|CriOS|Safari)/) || ['?'])[0];
  const platform = (ua.match(/(Android|iPhone|iPad|Windows|Macintosh|Linux)/) || ['?'])[0];
  return sha256(`${family}|${platform}`);
}

function createDeviceTrust({ supabase, localDb, saveLocalDb, audit } = {}) {
  const attempts = new Map();

  function ensureShape() {
    if (!localDb.audio_devices) localDb.audio_devices = [];
    return localDb.audio_devices;
  }

  function rateOk(ip) {
    const now = Date.now();
    let b = attempts.get(ip);
    if (!b || now - b.start > RESUME_LIMIT.windowMs) {
      b = { start: now, count: 0 };
      attempts.set(ip, b);
    }
    b.count += 1;
    if (attempts.size > 5000) {
      for (const [k, v] of attempts) if (now - v.start > RESUME_LIMIT.windowMs) attempts.delete(k);
    }
    return b.count <= RESUME_LIMIT.max;
  }

  function alive(row) {
    if (!row || row.revoked) return false;
    const now = Date.now();
    if (row.expiresAt && row.expiresAt < now) return false;
    if (row.lastUsedAt && now - row.lastUsedAt > IDLE_REVOKE_MS) return false;
    return true;
  }

  async function readAll(usernameKey) {
    if (supabase) {
      try {
        const { data } = await supabase
          .from('mm_audio_devices')
          .select('*')
          .eq('username_key', usernameKey);
        if (data) {
          return data.map((d) => ({
            id: d.id,
            usernameKey: d.username_key,
            tokenHash: d.token_hash,
            prevHash: d.prev_hash,
            uaHash: d.ua_hash,
            label: d.label,
            createdAt: new Date(d.created_at).getTime(),
            lastUsedAt: d.last_used_at ? new Date(d.last_used_at).getTime() : 0,
            expiresAt: d.expires_at ? new Date(d.expires_at).getTime() : 0,
            lastIp: d.last_ip,
            revoked: !!d.revoked,
          }));
        }
      } catch { /* fall through to local */ }
    }
    return ensureShape().filter((d) => d.usernameKey === usernameKey);
  }

  async function upsert(row) {
    ensureShape();
    const list = localDb.audio_devices;
    const i = list.findIndex((d) => d.id === row.id);
    if (i >= 0) list[i] = row; else list.push(row);
    saveLocalDb?.();
    if (supabase) {
      try {
        await supabase.from('mm_audio_devices').upsert({
          id: row.id,
          username_key: row.usernameKey,
          token_hash: row.tokenHash,
          prev_hash: row.prevHash,
          ua_hash: row.uaHash,
          label: row.label,
          created_at: new Date(row.createdAt).toISOString(),
          last_used_at: new Date(row.lastUsedAt || row.createdAt).toISOString(),
          expires_at: new Date(row.expiresAt).toISOString(),
          last_ip: row.lastIp || null,
          revoked: !!row.revoked,
        });
      } catch { /* local copy is authoritative if Supabase is down */ }
    }
  }

  async function findByToken(token) {
    const hash = sha256(token);
    if (supabase) {
      try {
        const { data } = await supabase
          .from('mm_audio_devices')
          .select('*')
          .or(`token_hash.eq.${hash},prev_hash.eq.${hash}`)
          .limit(1);
        if (data?.length) {
          const d = data[0];
          return {
            row: {
              id: d.id,
              usernameKey: d.username_key,
              tokenHash: d.token_hash,
              prevHash: d.prev_hash,
              uaHash: d.ua_hash,
              label: d.label,
              createdAt: new Date(d.created_at).getTime(),
              lastUsedAt: d.last_used_at ? new Date(d.last_used_at).getTime() : 0,
              expiresAt: d.expires_at ? new Date(d.expires_at).getTime() : 0,
              lastIp: d.last_ip,
              revoked: !!d.revoked,
            },
            hash,
          };
        }
      } catch { /* fall through */ }
    }
    const row = ensureShape().find(
      (d) => sameHash(d.tokenHash, hash) || sameHash(d.prevHash, hash),
    );
    return row ? { row, hash } : null;
  }

  /** Called after a real PIN login, only when the user opted in. */
  async function issue({ usernameKey, ip, userAgent, label }) {
    if (!usernameKey) return { ok: false, error: 'No identity' };
    const token = newToken();
    const now = Date.now();

    const existing = (await readAll(usernameKey)).filter(alive);
    // Oldest devices fall off the end rather than accumulating forever.
    if (existing.length >= MAX_DEVICES_PER_USER) {
      const oldest = existing.sort((a, b) => (a.lastUsedAt || 0) - (b.lastUsedAt || 0))[0];
      if (oldest) await upsert({ ...oldest, revoked: true });
    }

    const row = {
      id: crypto.randomUUID(),
      usernameKey,
      tokenHash: sha256(token),
      prevHash: null,
      uaHash: uaFingerprint(userAgent),
      label: String(label || 'This device').slice(0, 40),
      createdAt: now,
      lastUsedAt: now,
      expiresAt: now + DEVICE_TTL_MS,
      lastIp: ip || null,
      revoked: false,
    };
    await upsert(row);
    audit?.('device_trusted', { usernameKey, deviceId: row.id, ip });
    return { ok: true, deviceToken: token, deviceId: row.id, expiresAt: row.expiresAt };
  }

  /**
   * Exchange a device token for a fresh session, rotating the token.
   * @returns {{ok:true, usernameKey, deviceToken, deviceId}|{ok:false, reason, error}}
   */
  async function resume({ deviceToken, ip, userAgent }) {
    const token = String(deviceToken || '');
    if (!token.startsWith('dv_')) return { ok: false, reason: 'malformed', error: 'Sign in again.' };
    if (!rateOk(ip || 'unknown')) {
      return { ok: false, reason: 'rate', error: 'Too many attempts — wait a few minutes.' };
    }

    const found = await findByToken(token);
    if (!found) return { ok: false, reason: 'unknown', error: 'Sign in again.' };
    const { row, hash } = found;

    // Reuse of a rotated token means the credential was copied. The real device
    // holds the newest one, so this record is burned and the PIN comes back.
    if (row.prevHash && sameHash(row.prevHash, hash) && !sameHash(row.tokenHash, hash)) {
      await upsert({ ...row, revoked: true, prevHash: null });
      audit?.('device_token_reuse', { usernameKey: row.usernameKey, deviceId: row.id, ip });
      return { ok: false, reason: 'reuse', error: 'For your security, sign in again.' };
    }

    if (!alive(row)) return { ok: false, reason: 'expired', error: 'Sign in again.' };

    if (!sameHash(row.uaHash, uaFingerprint(userAgent))) {
      audit?.('device_ua_mismatch', { usernameKey: row.usernameKey, deviceId: row.id, ip });
      return { ok: false, reason: 'device', error: 'Sign in again on this browser.' };
    }

    const now = Date.now();
    const rotated = newToken();
    await upsert({
      ...row,
      prevHash: row.tokenHash,
      tokenHash: sha256(rotated),
      lastUsedAt: now,
      expiresAt: now + DEVICE_TTL_MS,
      lastIp: ip || row.lastIp,
    });

    return { ok: true, usernameKey: row.usernameKey, deviceToken: rotated, deviceId: row.id };
  }

  async function list(usernameKey) {
    return (await readAll(usernameKey)).filter(alive).map((d) => ({
      id: d.id,
      label: d.label,
      createdAt: d.createdAt,
      lastUsedAt: d.lastUsedAt,
      expiresAt: d.expiresAt,
    }));
  }

  async function revoke(usernameKey, deviceId) {
    const row = (await readAll(usernameKey)).find((d) => d.id === deviceId);
    if (!row) return { ok: false, error: 'Device not found' };
    await upsert({ ...row, revoked: true, tokenHash: null, prevHash: null });
    audit?.('device_revoked', { usernameKey, deviceId });
    return { ok: true };
  }

  async function revokeAll(usernameKey) {
    const rows = await readAll(usernameKey);
    for (const row of rows) await upsert({ ...row, revoked: true, tokenHash: null, prevHash: null });
    audit?.('device_revoked_all', { usernameKey, count: rows.length });
    return { ok: true, count: rows.length };
  }

  return { issue, resume, list, revoke, revokeAll, uaFingerprint };
}

module.exports = { createDeviceTrust, DEVICE_TTL_MS, MAX_DEVICES_PER_USER };
