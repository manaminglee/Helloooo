/**
 * Audio-room-only identity: username + 4-digit PIN, colored display name,
 * persistent coin wallet, and XP/level progression.
 * Durable storage: Supabase (mm_audio_identities) + local JSON fallback.
 */
const crypto = require('crypto');
const { displayLevel, levelFromXp, levelBadgeLabel, levelPerks, xpToNextLevel } = require('./audioLevels');
const { NAME_COLORS, NAME_GRADIENTS, isValidNameColor, pickNameColor } = require('./audioNameStyle');

const USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.\-!?@#$%&*]{2,19}$/;
const { createDeviceTrust } = require('./deviceTrust');

const PIN_RE = /^\d{4}$/;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const IP_SESSION_TTL_MS = 30 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const PIN_FINGERPRINT_SALT = 'mm_audio_pin_fp_v1';
const WEAK_PINS = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '1212', '1010', '2580',
]);

function registerAudioIdentity(app, io, deps) {
  const { saveLocalDb, localDb, audit, supabase, getCreatorForRequest } = deps;

  /* "Remember this device" — audio rooms and lives share this identity, and
     both handle real money, so the PIN is proven once and then a rotating,
     hashed device credential keeps the person signed in. */
  const deviceTrust = createDeviceTrust({ supabase, localDb, saveLocalDb, audit });

  const identities = new Map();
  const sessions = new Map();
  const ipSessions = new Map();
  const pinFingerprints = new Map();
  const loginAttempts = new Map();
  const locks = new Map();
  let hydrated = false;

  function ensureShape() {
    if (!localDb.audio_identities) localDb.audio_identities = {};
    if (!localDb.audio_ip_sessions) localDb.audio_ip_sessions = {};
  }

  function loadIpSessions() {
    ensureShape();
    const now = Date.now();
    for (const [ip, row] of Object.entries(localDb.audio_ip_sessions || {})) {
      if (!row?.expiresAt || row.expiresAt < now) continue;
      if (!row.token || !row.usernameKey) continue;
      if (!getSession(row.token)) continue;
      ipSessions.set(ip, row);
    }
  }

  function saveIpSessions() {
    ensureShape();
    const out = {};
    const now = Date.now();
    for (const [ip, row] of ipSessions.entries()) {
      if (row.expiresAt >= now) out[ip] = row;
    }
    localDb.audio_ip_sessions = out;
    saveLocalDb?.();
  }

  function pinFingerprint(pinStr) {
    return crypto.scryptSync(pinStr, PIN_FINGERPRINT_SALT, 16).toString('hex');
  }

  function registerPinFingerprint(usernameKey, pinStr) {
    const fp = pinFingerprint(pinStr);
    pinFingerprints.set(fp, usernameKey);
    const rec = identities.get(usernameKey);
    if (rec) rec.pinFingerprint = fp;
    return fp;
  }

  function isPinTaken(pinStr, exceptKey = null) {
    const fp = pinFingerprint(pinStr);
    const owner = pinFingerprints.get(fp);
    if (!owner) return false;
    if (exceptKey && owner === exceptKey) return false;
    return true;
  }

  function indexPinFingerprints() {
    pinFingerprints.clear();
    for (const [key, rec] of identities.entries()) {
      if (rec.pinFingerprint) pinFingerprints.set(rec.pinFingerprint, key);
    }
  }

  function bindIpSession(ip, usernameKey, token) {
    if (!ip || !usernameKey || !token) return;
    const row = {
      usernameKey,
      token,
      expiresAt: Date.now() + IP_SESSION_TTL_MS,
    };
    ipSessions.set(ip, row);
    saveIpSessions();
  }

  function touchIpSession(ip) {
    if (!ip) return null;
    const row = ipSessions.get(ip);
    if (!row || row.expiresAt < Date.now()) {
      ipSessions.delete(ip);
      saveIpSessions();
      return null;
    }
    if (!getSession(row.token)) {
      ipSessions.delete(ip);
      saveIpSessions();
      return null;
    }
    row.expiresAt = Date.now() + IP_SESSION_TTL_MS;
    ipSessions.set(ip, row);
    saveIpSessions();
    return row;
  }

  function rowToRecord(row) {
    return normalizeRecord({
      username: row.username,
      pinSalt: row.pin_salt,
      pinHash: row.pin_hash,
      pinFingerprint: row.pin_fingerprint || row.pinFingerprint || null,
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
    loadIpSessions();
    indexPinFingerprints();
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
      indexPinFingerprints();
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
      pinFingerprint: row.pinFingerprint || null,
      nameColor: isValidNameColor(row?.nameColor) ? row.nameColor : NAME_COLORS[0],
      coins,
      xp,
      peakXp,
      giftsReceived: Math.max(0, Number(row?.giftsReceived) || 0),
      coinsRecharged: Math.max(0, Number(row?.coinsRecharged) || 0),
      linkedCreatorId: row.linkedCreatorId || row.linked_creator_id || null,
      creatorProvisioned: !!(row.creatorProvisioned || row.creator_provisioned),
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
      pinFingerprint: rec.pinFingerprint || null,
      nameColor: rec.nameColor,
      coins: rec.coins,
      xp: rec.xp,
      peakXp: rec.peakXp,
      giftsReceived: rec.giftsReceived,
      coinsRecharged: rec.coinsRecharged,
      linkedCreatorId: rec.linkedCreatorId || null,
      creatorProvisioned: !!rec.creatorProvisioned,
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

  function verifyPin(pinStr, rec) {
    if (!rec?.pinHash || !rec?.pinSalt) return false;
    const hash = hashPin(pinStr, rec.pinSalt);
    try {
      const a = Buffer.from(hash);
      const b = Buffer.from(rec.pinHash);
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  function isWeakPin(pinStr) {
    return WEAK_PINS.has(pinStr);
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

  function createSession(usernameKey, ip) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { username: usernameKey, expiresAt: Date.now() + SESSION_TTL_MS });
    bindIpSession(ip, usernameKey, token);
    return token;
  }

  async function restoreByIp(ip) {
    await ensureHydrated();
    const row = touchIpSession(ip);
    if (!row) return { ok: false, error: 'No recent session on this connection.' };
    const rec = identities.get(row.usernameKey);
    if (!rec) return { ok: false, error: 'Identity not found.' };
    return { ok: true, token: row.token, identity: publicView(rec) };
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

  function findByLinkedCreatorId(creatorId) {
    const id = String(creatorId || '');
    if (!id) return null;
    for (const rec of identities.values()) {
      if (rec.linkedCreatorId === id) return rec;
    }
    return null;
  }

  function usernameFromCreatorHandle(handle) {
    let h = String(handle || '').replace(/^@+/, '').trim();
    h = h.replace(/[^a-zA-Z0-9_.\-!?@#$%&*]/g, '').slice(0, 20);
    if (!h || !/^[a-zA-Z0-9]/.test(h)) h = `c${h || 'reator'}`.slice(0, 20);
    if (h.length < 3) h = `${h}xxx`.slice(0, 20);
    if (!USERNAME_RE.test(h)) {
      h = `c${crypto.randomBytes(4).toString('hex')}`.slice(0, 20);
    }
    return h;
  }

  /**
   * Mint / reuse an audio identity for an approved creator session — no PIN required.
   * Used when creators open Lives or voice rooms from Creator Hub.
   */
  async function ensureFromCreator({ creator, ip }) {
    await ensureHydrated();
    if (!creator?.id || !creator?.handle_name) {
      return { ok: false, error: 'Invalid creator' };
    }

    let rec = findByLinkedCreatorId(creator.id);
    if (rec) {
      const token = createSession(rec.usernameKey, ip);
      audit?.('audio_identity_from_creator', { username: rec.username, creatorId: creator.id, ip, reused: true });
      return { ok: true, token, identity: publicView(rec), via: 'creator' };
    }

    const base = usernameFromCreatorHandle(creator.handle_name);
    let name = base;
    let key = base.toLowerCase();
    let n = 0;
    while (identities.has(key)) {
      const existing = identities.get(key);
      if (existing.linkedCreatorId === creator.id) {
        const token = createSession(key, ip);
        return { ok: true, token, identity: publicView(existing), via: 'creator' };
      }
      // Claim orphan handle that matches creator exactly (legacy / same person)
      if (n === 0 && key === String(creator.handle_name || '').toLowerCase() && !existing.linkedCreatorId) {
        existing.linkedCreatorId = creator.id;
        existing.creatorProvisioned = true;
        identities.set(key, existing);
        await persist(key, { linkCreatorId: creator.id });
        const token = createSession(key, ip);
        audit?.('audio_identity_from_creator', { username: existing.username, creatorId: creator.id, ip, linked: true });
        return { ok: true, token, identity: publicView(existing), via: 'creator' };
      }
      n += 1;
      name = `${base.slice(0, 16)}${n}`;
      key = name.toLowerCase();
      if (n > 99) return { ok: false, error: 'Could not allocate voice username for creator' };
    }

    const pinSalt = crypto.randomBytes(16).toString('hex');
    const secretPin = String(10000 + crypto.randomInt(90000)).slice(-4);
    rec = normalizeRecord({
      username: name,
      pinSalt,
      pinHash: hashPin(secretPin, pinSalt),
      nameColor: NAME_COLORS[Math.abs(crypto.createHash('sha1').update(creator.id).digest()[0]) % NAME_COLORS.length],
      coins: 50,
      xp: 0,
      peakXp: 0,
      giftsReceived: 0,
      coinsRecharged: 0,
      linkedCreatorId: creator.id,
      creatorProvisioned: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    // Do not register PIN fingerprint — creators never use this PIN; login is via creator session.
    identities.set(key, rec);
    await persist(key, { registerIp: ip, creatorId: creator.id });
    await journalLedger(key, 50, 'creator_provision_bonus', rec.coins, { ip, creatorId: creator.id });
    const token = createSession(key, ip);
    audit?.('audio_identity_from_creator', { username: name, creatorId: creator.id, ip, created: true });
    return { ok: true, token, identity: publicView(rec), via: 'creator' };
  }

  async function register({ username, pin, nameColor, ip }) {
    await ensureHydrated();
    const name = String(username || '').trim();
    const pinStr = String(pin || '').trim();
    if (!USERNAME_RE.test(name)) {
      return { ok: false, error: 'Username: 3–20 chars, start with a letter or number. You can use _ . - ! ? @ # $ % & *' };
    }
    if (!PIN_RE.test(pinStr)) return { ok: false, error: 'PIN must be exactly 4 digits.' };
    if (isWeakPin(pinStr)) return { ok: false, error: 'Pick a less obvious PIN — avoid 1234, 1111, etc.' };
    const key = name.toLowerCase();

    // PIN is checked with username on login — do not require globally unique PINs
    // (only ~9k non-weak 4-digit codes exist; uniqueness blocks new signups).
    if (identities.has(key)) return { ok: false, error: 'Username taken — try another.' };
    if (supabase) {
      const { data: existing } = await supabase
        .from('mm_audio_identities')
        .select('username_key')
        .eq('username_key', key)
        .maybeSingle();
      if (existing) return { ok: false, error: 'Username taken — try another.' };
    }

    const color = pickNameColor(nameColor);
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
    registerPinFingerprint(key, pinStr);
    await persist(key, { registerIp: ip });
    await journalLedger(key, 25, 'registration_bonus', rec.coins, { ip });
    const token = createSession(key, ip);
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
    const ok = verifyPin(pinStr, rec);
    if (!ok) return { ok: false, error: 'Wrong PIN.' };
    await persist(key, { loginIp: ip });
    const token = createSession(key, ip);
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

  /* ---------------------------------------------------------------- devices */

  const clientIp = (req) => req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

  /** Session token from the header, or nothing. Never trust a body-supplied id. */
  async function requireSession(req) {
    await ensureHydrated();
    const token = String(req.headers['x-audio-session'] || req.body?.token || '');
    const session = getSession(token);
    if (!session) return null;
    return { token, usernameKey: session.username };
  }

  // Opt in to staying signed in on this device. Requires a live session, which
  // means the PIN was just proven.
  app.post('/api/audio-identity/trust-device', async (req, res) => {
    try {
      const auth = await requireSession(req);
      if (!auth) return res.status(401).json({ ok: false, error: 'Sign in first.' });
      const result = await deviceTrust.issue({
        usernameKey: auth.usernameKey,
        ip: clientIp(req),
        userAgent: req.headers['user-agent'],
        label: req.body?.label,
      });
      if (!result.ok) return res.status(400).json(result);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Could not remember this device' });
    }
  });

  // Silent sign-in. Returns a fresh session AND a rotated device token; the
  // client must store the new one — the old is dead the moment this returns.
  app.post('/api/audio-identity/resume', async (req, res) => {
    try {
      await ensureHydrated();
      const result = await deviceTrust.resume({
        deviceToken: req.body?.deviceToken,
        ip: clientIp(req),
        userAgent: req.headers['user-agent'],
      });
      if (!result.ok) {
        // Soft miss — stale/expired device tokens are normal after logout or
        // server restart. Avoid noisy Safari/iOS console 401s on every load.
        return res.json({ ok: false, error: result.error, reason: result.reason });
      }
      const rec = identities.get(result.usernameKey);
      if (!rec) {
        await deviceTrust.revoke(result.usernameKey, result.deviceId);
        return res.json({ ok: false, error: 'Sign in again.' });
      }
      const token = createSession(result.usernameKey, clientIp(req));
      res.json({
        ok: true,
        token,
        deviceToken: result.deviceToken,
        deviceId: result.deviceId,
        identity: publicView(rec),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Resume failed' });
    }
  });

  app.get('/api/audio-identity/devices', async (req, res) => {
    const auth = await requireSession(req);
    if (!auth) return res.status(401).json({ ok: false, error: 'Sign in first.' });
    res.json({ ok: true, devices: await deviceTrust.list(auth.usernameKey) });
  });

  app.post('/api/audio-identity/devices/revoke', async (req, res) => {
    const auth = await requireSession(req);
    if (!auth) return res.status(401).json({ ok: false, error: 'Sign in first.' });
    const all = !!req.body?.all;
    const result = all
      ? await deviceTrust.revokeAll(auth.usernameKey)
      : await deviceTrust.revoke(auth.usernameKey, String(req.body?.deviceId || ''));
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  });

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
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
    const token = String(req.headers['x-audio-session'] || req.query?.token || '');
    if (!token) {
      // Soft miss — avoid noisy 401 in browser console on every page load
      return res.json({ ok: false, error: 'Not signed in' });
    }
    const session = getSession(token);
    if (!session) return res.json({ ok: false, error: 'Not signed in' });
    touchIpSession(ip);
    const rec = identities.get(session.username);
    if (!rec) return res.json({ ok: false, error: 'Identity not found' });
    res.json({ ok: true, identity: publicView(rec) });
  });

  app.get('/api/audio-identity/restore-ip', async (req, res) => {
    try {
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
      const result = await restoreByIp(ip);
      // Soft miss — guests without a recent IP session are normal
      if (!result.ok) return res.json({ ok: false, error: result.error || 'No session' });
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Restore failed' });
    }
  });

  app.get('/api/audio-identity/colors', (_req, res) => {
    res.json({
      colors: NAME_COLORS,
      gradients: NAME_GRADIENTS.map(({ id, label, css }) => ({ id, label, css })),
    });
  });

  app.post('/api/audio-identity/from-creator', async (req, res) => {
    try {
      if (typeof getCreatorForRequest !== 'function') {
        return res.status(501).json({ ok: false, error: 'Creator auth unavailable' });
      }
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
      const { creator, via } = await getCreatorForRequest(req);
      if (!creator || via !== 'session') {
        return res.status(401).json({ ok: false, error: 'Creator secure login required' });
      }
      if (creator.status !== 'approved') {
        return res.status(403).json({ ok: false, error: 'Only approved creators can skip voice login' });
      }
      const result = await ensureFromCreator({ creator, ip });
      if (!result.ok) return res.status(400).json(result);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Creator voice login failed' });
    }
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
    restoreByIp,
    bindIpSession,
    ensureFromCreator,
    createSession,
    deviceTrust,
  };
}

module.exports = { registerAudioIdentity, NAME_COLORS };
