/**
 * Audio-room-only identity: username + 4-digit PIN, colored display name,
 * persistent coin wallet, and XP/level progression.
 * Durable storage: Supabase (mm_audio_identities) + local JSON fallback.
 */
const crypto = require('crypto');
const { displayLevel, levelFromXp, levelBadgeLabel, levelPerks, xpToNextLevel } = require('./audioLevels');

const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
const PIN_RE = /^\d{4}$/;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;

const NAME_COLORS = [
  '#f472b6', '#a78bfa', '#34d399', '#38bdf8', '#fbbf24',
  '#fb7185', '#22d3ee', '#e879f9', '#4ade80', '#f97316',
];

function registerAudioIdentity(app, io, deps) {
  const { saveLocalDb, localDb, audit, supabase } = deps;

  const identities = new Map();
  const sessions = new Map();
  const loginAttempts = new Map();
  const locks = new Map();
  let hydrated = false;

  function ensureShape() {
    if (!localDb.audio_identities) localDb.audio_identities = {};
  }

  function rowToRecord(row) {
    return normalizeRecord({
      username: row.username,
      pinSalt: row.pin_salt,
      pinHash: row.pin_hash,
      nameColor: row.name_color,
      coins: row.coins,
      xp: row.xp,
      peakXp: row.peak_xp,
      giftsReceived: row.gifts_received,
      coinsRecharged: row.coins_recharged,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
    });
  }

  function recordToRow(rec) {
    return {
      username_key: rec.usernameKey,
      username: rec.username,
      pin_salt: rec.pinSalt,
      pin_hash: rec.pinHash,
      name_color: rec.nameColor,
      coins: rec.coins,
      xp: rec.xp,
      peak_xp: rec.peakXp,
      gifts_received: rec.giftsReceived,
      coins_recharged: rec.coinsRecharged,
      created_at: new Date(rec.createdAt).toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  function loadLocal() {
    ensureShape();
    for (const [key, row] of Object.entries(localDb.audio_identities)) {
      const k = String(key).toLowerCase();
      if (!identities.has(k)) identities.set(k, normalizeRecord(row));
    }
  }

  async function hydrateFromSupabase() {
    if (!supabase || hydrated) return;
    try {
      const { data, error } = await supabase.from('mm_audio_identities').select('*');
      if (error) {
        console.warn('[audioIdentity] Supabase load failed:', error.message);
        return;
      }
      for (const row of data || []) {
        const k = String(row.username_key || row.username || '').toLowerCase();
        if (k) identities.set(k, rowToRecord(row));
      }
      hydrated = true;
      console.log(`[audioIdentity] Loaded ${data?.length || 0} identities from Supabase`);
    } catch (e) {
      console.warn('[audioIdentity] Supabase hydrate error:', e.message);
    }
  }

  async function ensureHydrated() {
    loadLocal();
    await hydrateFromSupabase();
  }
  void ensureHydrated();

  function normalizeRecord(row) {
    const xp = Math.max(0, Number(row?.xp) || 0);
    const coins = Math.max(0, Number(row?.coins) || 0);
    const peakXp = Math.max(xp, Number(row?.peakXp) || 0);
    return {
      username: row.username,
      usernameKey: String(row.username || '').toLowerCase(),
      pinSalt: row.pinSalt,
      pinHash: row.pinHash,
      nameColor: NAME_COLORS.includes(row?.nameColor) ? row.nameColor : NAME_COLORS[0],
      coins,
      xp,
      peakXp,
      giftsReceived: Math.max(0, Number(row?.giftsReceived) || 0),
      coinsRecharged: Math.max(0, Number(row?.coinsRecharged) || 0),
      createdAt: row.createdAt || Date.now(),
      updatedAt: row.updatedAt || Date.now(),
    };
  }

  async function journalLedger(usernameKey, delta, reason, balanceAfter, meta = {}) {
    if (!supabase) return;
    supabase
      .from('mm_audio_coin_ledger')
      .insert({
        username_key: usernameKey,
        delta,
        reason,
        balance_after: balanceAfter,
        meta,
      })
      .then(() => {})
      .catch(() => {});
  }

  async function persist(usernameKey, meta = {}) {
    const rec = identities.get(usernameKey);
    if (!rec) return;
    rec.updatedAt = Date.now();
    ensureShape();
    localDb.audio_identities[usernameKey] = {
      username: rec.username,
      pinSalt: rec.pinSalt,
      pinHash: rec.pinHash,
      nameColor: rec.nameColor,
      coins: rec.coins,
      xp: rec.xp,
      peakXp: rec.peakXp,
      giftsReceived: rec.giftsReceived,
      coinsRecharged: rec.coinsRecharged,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
    };
    saveLocalDb?.();

    if (supabase) {
      const row = recordToRow(rec);
      if (meta.registerIp) row.register_ip = meta.registerIp;
      if (meta.loginIp) row.last_login_ip = meta.loginIp;
      const { error } = await supabase.from('mm_audio_identities').upsert(row);
      if (error) console.warn('[audioIdentity] Supabase upsert failed:', error.message);
    }
  }

  function hashPin(pin, salt) {
    return crypto.scryptSync(pin, salt, 32).toString('hex');
  }

  function publicView(rec) {
    const lvl = displayLevel(rec);
    return {
      username: rec.username,
      nameColor: rec.nameColor,
      coins: rec.coins,
      xp: rec.xp,
      peakXp: rec.peakXp,
      level: lvl,
      peakLevel: levelFromXp(rec.peakXp || rec.xp),
      levelBadge: levelBadgeLabel(lvl),
      profileBadge: lvl >= 5,
      xpToNext: xpToNextLevel(rec.xp),
      perks: levelPerks(lvl),
      giftsReceived: rec.giftsReceived,
      coinsRecharged: rec.coinsRecharged,
    };
  }

  function withLock(key, fn) {
    const prev = locks.get(key) || Promise.resolve();
    const next = prev.then(fn, fn);
    locks.set(key, next.then(() => {}, () => {}));
    return next;
  }

  function rateLogin(ip) {
    const now = Date.now();
    const b = loginAttempts.get(ip);
    if (!b || now - b.start > LOGIN_WINDOW_MS) {
      loginAttempts.set(ip, { start: now, count: 1 });
      return true;
    }
    b.count += 1;
    return b.count <= LOGIN_MAX_ATTEMPTS;
  }

  function createSession(usernameKey) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { username: usernameKey, expiresAt: Date.now() + SESSION_TTL_MS });
    return token;
  }

  function getSession(token) {
    if (!token) return null;
    const s = sessions.get(String(token));
    if (!s || s.expiresAt < Date.now()) {
      sessions.delete(String(token));
      return null;
    }
    return s;
  }

  function getByUsername(username) {
    return identities.get(String(username || '').toLowerCase()) || null;
  }

  function attachToSocket(userData, token) {
    const session = getSession(token);
    if (!session) return null;
    const rec = identities.get(session.username);
    if (!rec) return null;
    const view = publicView(rec);
    if (userData) {
      userData.audioIdentity = view;
      userData.nickname = rec.username;
    }
    return view;
  }

  async function register({ username, pin, nameColor, ip }) {
    await ensureHydrated();
    const name = String(username || '').trim();
    const pinStr = String(pin || '').trim();
    if (!USERNAME_RE.test(name)) {
      return { ok: false, error: 'Username: 3–20 chars, letters/numbers/underscore, start with a letter.' };
    }
    if (!PIN_RE.test(pinStr)) return { ok: false, error: 'PIN must be exactly 4 digits.' };
    const key = name.toLowerCase();

    if (identities.has(key)) return { ok: false, error: 'Username taken — try another.' };
    if (supabase) {
      const { data: existing } = await supabase
        .from('mm_audio_identities')
        .select('username_key')
        .eq('username_key', key)
        .maybeSingle();
      if (existing) return { ok: false, error: 'Username taken — try another.' };
    }

    const color = NAME_COLORS.includes(nameColor) ? nameColor : NAME_COLORS[Math.floor(Math.random() * NAME_COLORS.length)];
    const pinSalt = crypto.randomBytes(16).toString('hex');
    const rec = normalizeRecord({
      username: name,
      pinSalt,
      pinHash: hashPin(pinStr, pinSalt),
      nameColor: color,
      coins: 25,
      xp: 0,
      peakXp: 0,
      giftsReceived: 0,
      coinsRecharged: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    identities.set(key, rec);
    await persist(key, { registerIp: ip });
    await journalLedger(key, 25, 'registration_bonus', rec.coins, { ip });
    const token = createSession(key);
    audit?.('audio_identity_register', { username: name, ip });
    return { ok: true, token, identity: publicView(rec) };
  }

  async function login({ username, pin, ip }) {
    await ensureHydrated();
    if (!rateLogin(ip)) return { ok: false, error: 'Too many attempts — wait 15 minutes.' };
    const key = String(username || '').trim().toLowerCase();
    let rec = identities.get(key);
    if (!rec && supabase) {
      const { data } = await supabase.from('mm_audio_identities').select('*').eq('username_key', key).maybeSingle();
      if (data) {
        rec = rowToRecord(data);
        identities.set(key, rec);
      }
    }
    if (!rec) return { ok: false, error: 'Unknown username — create a new identity?' };
    const pinStr = String(pin || '').trim();
    if (!PIN_RE.test(pinStr)) return { ok: false, error: 'Enter your 4-digit PIN.' };
    const hash = hashPin(pinStr, rec.pinSalt);
    const ok = crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(rec.pinHash));
    if (!ok) return { ok: false, error: 'Wrong PIN.' };
    await persist(key, { loginIp: ip });
    const token = createSession(key);
    audit?.('audio_identity_login', { username: rec.username, ip });
    return { ok: true, token, identity: publicView(rec) };
  }

  function logout(token) {
    if (token) sessions.delete(String(token));
    return { ok: true };
  }

  async function credit(usernameKey, amount, reason, meta = {}) {
    return withLock(`audio:${usernameKey}`, async () => {
      await ensureHydrated();
      const rec = identities.get(usernameKey);
      if (!rec) return { ok: false, error: 'Identity not found' };
      const delta = Math.floor(Number(amount));
      if (!Number.isFinite(delta) || delta <= 0) return { ok: false, error: 'Invalid amount' };
      rec.coins += delta;
      if (reason?.includes('recharge') || reason?.includes('coin_pack') || meta?.recharge) {
        rec.coinsRecharged += delta;
        rec.xp += delta;
        rec.peakXp = Math.max(rec.peakXp, rec.xp);
      }
      await persist(usernameKey);
      await journalLedger(usernameKey, delta, reason, rec.coins, meta);
      return { ok: true, balance: rec.coins, identity: publicView(rec), meta };
    });
  }

  async function debit(usernameKey, amount, reason, meta = {}) {
    return withLock(`audio:${usernameKey}`, async () => {
      await ensureHydrated();
      const rec = identities.get(usernameKey);
      if (!rec) return { ok: false, error: 'Identity not found' };
      const delta = Math.floor(Number(amount));
      if (!Number.isFinite(delta) || delta <= 0) return { ok: false, error: 'Invalid amount' };
      if (rec.coins < delta) return { ok: false, error: 'Not enough coins' };
      rec.coins -= delta;
      await persist(usernameKey);
      await journalLedger(usernameKey, -delta, reason, rec.coins, meta);
      return { ok: true, balance: rec.coins, identity: publicView(rec), meta };
    });
  }

  async function giftXp(usernameKey, giftCost, share) {
    return withLock(`audio:${usernameKey}`, async () => {
      const rec = identities.get(usernameKey);
      if (!rec) return;
      const xpGain = Math.max(1, Math.floor(giftCost * 0.5) + Math.floor(share));
      rec.giftsReceived += 1;
      rec.xp += xpGain;
      rec.peakXp = Math.max(rec.peakXp, rec.xp);
      await persist(usernameKey);
      await journalLedger(usernameKey, 0, 'gift_xp', rec.coins, { giftCost, share, xpGain });
      return publicView(rec);
    });
  }

  async function recordPayment({ paymentRef, usernameKey, packageId, coins, amountInr, provider, orderId, meta }) {
    if (!supabase || !paymentRef) return;
    await supabase.from('mm_audio_payments').upsert({
      payment_ref: paymentRef,
      username_key: usernameKey,
      package_id: packageId,
      coins_credited: coins,
      amount_inr: amountInr,
      provider: provider || 'test',
      order_id: orderId || null,
      meta: meta || {},
    }).catch(() => {});
  }

  function resolveWalletKey(socket, users) {
    const u = users?.get(socket?.id);
    const key = u?.audioIdentity?.username;
    return key ? String(key).toLowerCase() : null;
  }

  function attachSocketHandlers(socket, ip, users) {
    socket.on('audio-identity:attach', (data, ack) => {
      const token = String(data?.token || '');
      const u = users.get(socket.id);
      const view = attachToSocket(u, token);
      if (view && u) {
        socket.emit('audio-identity:ready', view);
        if (typeof ack === 'function') ack({ ok: true, identity: view });
      } else if (typeof ack === 'function') ack({ ok: false, error: 'Session expired — sign in again.' });
    });

    socket.on('audio-identity:logout', (data) => {
      logout(String(data?.token || ''));
      const u = users.get(socket.id);
      if (u) {
        u.audioIdentity = null;
        u.nickname = 'Anonymous';
      }
      socket.emit('audio-identity:logged-out');
    });
  }

  app.post('/api/audio-identity/register', async (req, res) => {
    try {
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
      const result = await register({
        username: req.body?.username,
        pin: req.body?.pin,
        nameColor: req.body?.nameColor,
        ip,
      });
      if (!result.ok) return res.status(400).json(result);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Registration failed' });
    }
  });

  app.post('/api/audio-identity/login', async (req, res) => {
    try {
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
      const result = await login({
        username: req.body?.username,
        pin: req.body?.pin,
        ip,
      });
      if (!result.ok) return res.status(401).json(result);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Login failed' });
    }
  });

  app.post('/api/audio-identity/logout', (req, res) => {
    logout(String(req.body?.token || req.headers['x-audio-session'] || ''));
    res.json({ ok: true });
  });

  app.get('/api/audio-identity/me', async (req, res) => {
    await ensureHydrated();
    const token = String(req.headers['x-audio-session'] || req.query?.token || '');
    const session = getSession(token);
    if (!session) return res.status(401).json({ ok: false, error: 'Not signed in' });
    const rec = identities.get(session.username);
    if (!rec) return res.status(404).json({ ok: false, error: 'Identity not found' });
    res.json({ ok: true, identity: publicView(rec) });
  });

  app.get('/api/audio-identity/colors', (_req, res) => {
    res.json({ colors: NAME_COLORS });
  });

  return {
    register,
    login,
    logout,
    credit,
    debit,
    giftXp,
    recordPayment,
    getByUsername,
    getSession,
    attachToSocket,
    resolveWalletKey,
    publicView,
    attachSocketHandlers,
    ensureHydrated,
    NAME_COLORS,
  };
}

module.exports = { registerAudioIdentity, NAME_COLORS };
