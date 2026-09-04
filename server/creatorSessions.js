/**
 * Creator session tokens — opaque bearer tokens hashed at rest in Supabase / localDb.
 * Replaces insecure referral_code-as-auth.
 */
const crypto = require('crypto');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_PREFIX = 'cs_';

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

function mintRawToken() {
  return `${SESSION_PREFIX}${crypto.randomBytes(32).toString('hex')}`;
}

function ensureLocalShape(localDb) {
  if (!localDb.creator_sessions) localDb.creator_sessions = [];
}

function findLocalSession(localDb, tokenHash) {
  ensureLocalShape(localDb);
  return (localDb.creator_sessions || []).find(
    (s) => s.token_hash === tokenHash && !s.revoked_at
  ) || null;
}

function findLocalCreator(localDb, creatorId) {
  return (localDb.creators || []).find((c) => c.id === creatorId) || null;
}

/**
 * Create a session for an approved creator. Returns { token, expiresAt, sessionId }.
 * Always mirrors to localDb so resolve works even if Supabase insert fails/lags.
 */
async function createSession({ supabase, localDb, saveLocalDb, creatorId, ip, userAgent }) {
  const raw = mintRawToken();
  const tokenHash = hashToken(raw);
  const id = crypto.randomBytes(12).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const row = {
    id,
    creator_id: creatorId,
    token_hash: tokenHash,
    ip: String(ip || '').slice(0, 64) || null,
    user_agent: String(userAgent || '').slice(0, 240) || null,
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
    revoked_at: null,
  };

  ensureLocalShape(localDb);
  localDb.creator_sessions.push(row);
  if (localDb.creator_sessions.length > 5000) {
    localDb.creator_sessions = localDb.creator_sessions.slice(-2500);
  }
  saveLocalDb?.();

  if (supabase) {
    const { error } = await supabase.from('creator_sessions').insert(row);
    if (error) {
      console.warn('[CREATOR_SESSIONS] supabase insert failed, using local:', error.message);
    }
  }

  return { token: raw, expiresAt, sessionId: id };
}

/**
 * Resolve creator from Authorization / X-Creator-Session / X-Creator-Token (session).
 * Does NOT accept referral_code as a session.
 * Falls back to localDb when Supabase has no row (e.g. insert failed / migration lag).
 */
async function resolveSessionCreator({ supabase, localDb, saveLocalDb, token, requireApproved = true }) {
  const raw = String(token || '').trim();
  if (!raw || !raw.startsWith(SESSION_PREFIX)) return null;

  const tokenHash = hashToken(raw);
  const now = Date.now();
  let session = null;

  if (supabase) {
    try {
      const { data } = await supabase
        .from('creator_sessions')
        .select('*')
        .eq('token_hash', tokenHash)
        .is('revoked_at', null)
        .maybeSingle();
      session = data;
    } catch (e) {
      console.warn('[CREATOR_SESSIONS] supabase resolve failed:', e.message);
    }
  }

  if (!session) {
    session = findLocalSession(localDb, tokenHash);
  }

  if (!session) return null;
  if (new Date(session.expires_at).getTime() < now) {
    await revokeSession({ supabase, localDb, saveLocalDb, sessionId: session.id });
    return null;
  }

  let creator = null;
  if (supabase) {
    try {
      const { data } = await supabase.from('creators').select('*').eq('id', session.creator_id).maybeSingle();
      creator = data;
    } catch (e) {
      console.warn('[CREATOR_SESSIONS] creator lookup failed:', e.message);
    }
  }
  if (!creator) {
    creator = findLocalCreator(localDb, session.creator_id);
  }
  if (!creator) return null;
  if (requireApproved && creator.status !== 'approved') return null;

  return { creator, session };
}

async function revokeSession({ supabase, localDb, saveLocalDb, sessionId, tokenHash }) {
  const now = new Date().toISOString();
  if (supabase) {
    try {
      if (sessionId) {
        await supabase.from('creator_sessions').update({ revoked_at: now }).eq('id', sessionId);
      } else if (tokenHash) {
        await supabase.from('creator_sessions').update({ revoked_at: now }).eq('token_hash', tokenHash);
      }
    } catch (e) {
      console.warn('[CREATOR_SESSIONS] revoke supabase failed:', e.message);
    }
  }
  ensureLocalShape(localDb);
  for (const s of localDb.creator_sessions || []) {
    if ((sessionId && s.id === sessionId) || (tokenHash && s.token_hash === tokenHash)) {
      s.revoked_at = now;
    }
  }
  saveLocalDb?.();
}

async function revokeAllForCreator({ supabase, localDb, saveLocalDb, creatorId }) {
  const now = new Date().toISOString();
  if (supabase) {
    try {
      await supabase
        .from('creator_sessions')
        .update({ revoked_at: now })
        .eq('creator_id', creatorId)
        .is('revoked_at', null);
    } catch (e) {
      console.warn('[CREATOR_SESSIONS] revokeAll supabase failed:', e.message);
    }
  }
  ensureLocalShape(localDb);
  for (const s of localDb.creator_sessions || []) {
    if (s.creator_id === creatorId && !s.revoked_at) s.revoked_at = now;
  }
  saveLocalDb?.();
}

function extractSessionToken(req) {
  const auth = req.headers.authorization || '';
  const fromAuth = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return String(
    req.headers['x-creator-session']
    || req.headers['x-creator-token']
    || fromAuth
    || ''
  ).trim();
}

module.exports = {
  SESSION_TTL_MS,
  SESSION_PREFIX,
  hashToken,
  createSession,
  resolveSessionCreator,
  revokeSession,
  revokeAllForCreator,
  extractSessionToken,
};
