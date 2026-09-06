/**
 * Web Push — creator went live, scheduled reminders, DM alerts.
 * Requires VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (+ optional VAPID_SUBJECT).
 */
const crypto = require('crypto');

let webpush = null;
try { webpush = require('web-push'); } catch { /* optional at install time */ }

const BUCKET = 'push_subscriptions';

function registerPushNotifications(app, deps) {
  const {
    supabase,
    localDb,
    saveLocalDb,
    sanitize,
    rateLimit,
    getCreatorForRequest,
    audioIdentity,
  } = deps;

  const vapidPublic = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const vapidPrivate = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const vapidSubject = (process.env.VAPID_SUBJECT || 'mailto:support@helloooo.app').trim();
  const enabled = !!(webpush && vapidPublic && vapidPrivate);

  if (enabled) {
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  }

  function ensureShape() {
    if (!localDb[BUCKET]) localDb[BUCKET] = [];
  }

  function subRow(sub, ownerKey, meta = {}) {
    return {
      id: crypto.randomBytes(12).toString('hex'),
      owner_key: ownerKey,
      endpoint: sub.endpoint,
      p256dh: sub.keys?.p256dh || '',
      auth: sub.keys?.auth || '',
      user_agent: String(meta.userAgent || '').slice(0, 200),
      created_at: new Date().toISOString(),
    };
  }

  async function saveSubscription(ownerKey, subscription, meta = {}) {
    if (!ownerKey || !subscription?.endpoint) return { ok: false, error: 'Invalid subscription' };
    ensureShape();
    const row = subRow(subscription, ownerKey, meta);

    if (supabase) {
      await supabase.from(BUCKET).upsert({
        owner_key: ownerKey,
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
        user_agent: row.user_agent,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
    }

    localDb[BUCKET] = (localDb[BUCKET] || []).filter((s) => s.endpoint !== row.endpoint);
    localDb[BUCKET].push(row);
    if (localDb[BUCKET].length > 5000) localDb[BUCKET] = localDb[BUCKET].slice(-4000);
    saveLocalDb?.();
    return { ok: true };
  }

  async function removeSubscription(endpoint) {
    ensureShape();
    localDb[BUCKET] = (localDb[BUCKET] || []).filter((s) => s.endpoint !== endpoint);
    saveLocalDb?.();
    if (supabase) {
      await supabase.from(BUCKET).delete().eq('endpoint', endpoint);
    }
    return { ok: true };
  }

  async function listForOwner(ownerKey) {
    ensureShape();
    if (supabase) {
      const { data } = await supabase.from(BUCKET).select('*').eq('owner_key', ownerKey);
      if (data?.length) return data;
    }
    return (localDb[BUCKET] || []).filter((s) => s.owner_key === ownerKey);
  }

  async function sendToOwner(ownerKey, payload) {
    if (!enabled) return { ok: false, skipped: true, reason: 'push_disabled' };
    const subs = await listForOwner(ownerKey);
    if (!subs.length) return { ok: true, sent: 0 };

    const body = JSON.stringify(payload);
    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        }, body, { TTL: 3600, urgency: 'high' });
        sent += 1;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          await removeSubscription(sub.endpoint);
        }
      }
    }
    return { ok: true, sent };
  }

  /** Fan-out to many follower keys (creator went live, reminders). */
  async function sendToKeys(keys, payload) {
    const unique = [...new Set((keys || []).map(String).filter(Boolean))];
    let total = 0;
    for (const key of unique) {
      const r = await sendToOwner(key, payload);
      total += r.sent || 0;
    }
    return { ok: true, sent: total };
  }

  app.get('/api/push/vapid-public', (_req, res) => {
    res.json({ ok: true, enabled, publicKey: enabled ? vapidPublic : null });
  });

  app.post('/api/push/subscribe', async (req, res) => {
    try {
      if (typeof rateLimit === 'function') {
        const rl = await rateLimit(`push:sub:${req.ip}`, { windowMs: 60_000, max: 10 });
        if (!rl.ok) return res.status(429).json({ ok: false, error: 'Too many requests' });
      }
      const subscription = req.body?.subscription;
      let ownerKey = sanitize(String(req.body?.ownerKey || ''), 80);
      if (!ownerKey) {
        const tok = String(req.headers['x-audio-token'] || req.body?.audioToken || '').trim();
        const sess = tok && audioIdentity?.getSession?.(tok);
        if (sess?.username) ownerKey = `audio:${String(sess.username).toLowerCase()}`;
      }
      if (!ownerKey) return res.status(401).json({ ok: false, error: 'Sign in first' });
      const result = await saveSubscription(ownerKey, subscription, { userAgent: req.headers['user-agent'] });
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Subscribe failed' });
    }
  });

  app.post('/api/push/unsubscribe', async (req, res) => {
    const endpoint = String(req.body?.endpoint || '');
    if (!endpoint) return res.status(400).json({ ok: false, error: 'endpoint required' });
    res.json(await removeSubscription(endpoint));
  });

  /** Device token from the Capacitor iOS app (APNs). */
  app.post('/api/push/apns', async (req, res) => {
    try {
      const token = String(req.body?.token || '').trim();
      if (!token || token.length < 16) return res.status(400).json({ ok: false, error: 'token required' });
      let ownerKey = sanitize(String(req.body?.ownerKey || ''), 80);
      if (!ownerKey) {
        const tok = String(req.headers['x-audio-token'] || req.body?.audioToken || '').trim();
        const sess = tok && audioIdentity?.getSession?.(tok);
        if (sess?.username) ownerKey = `audio:${String(sess.username).toLowerCase()}`;
      }
      if (!ownerKey) return res.status(401).json({ ok: false, error: 'Sign in first' });
      if (!localDb.apns_tokens) localDb.apns_tokens = [];
      localDb.apns_tokens = localDb.apns_tokens.filter((t) => t.token !== token);
      localDb.apns_tokens.push({
        owner_key: ownerKey,
        token,
        platform: 'ios',
        updated_at: new Date().toISOString(),
      });
      if (localDb.apns_tokens.length > 5000) localDb.apns_tokens = localDb.apns_tokens.slice(-4000);
      saveLocalDb?.();
      if (supabase) {
        try {
          await supabase.from('mm_apns_tokens').upsert({
            owner_key: ownerKey,
            token,
            platform: 'ios',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'token' });
        } catch { /* table optional until migration */ }
      }
      res.json({ ok: true, ready: !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_BUNDLE_ID) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'APNs save failed' });
    }
  });

  return {
    enabled,
    publicKey: vapidPublic,
    saveSubscription,
    removeSubscription,
    sendToOwner,
    sendToKeys,
  };
}

module.exports = { registerPushNotifications };
