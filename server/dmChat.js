/**
 * Direct messages for Helloooo.
 *
 * A conversation is a pair of namespaced keys (see socialFollow.js):
 *   `audio:<username>` or `creator:<id>`.
 *
 * Messages come in three kinds:
 *   text  — plain text (sanitized)
 *   gift  — a catalog gift; sender is debited via audioIdentity, recipient
 *           credited when they have an audio wallet
 *   image — an imageUrl pointing at a Supabase storage object (bucket
 *           `dm-media`) or a compressed data URL when storage isn't configured
 *
 * A conversation carries a preset `themeId` for chat styling.
 *
 * State is in memory + local JSON mirror; Supabase (mm_conversations,
 * mm_messages) is the durable store when configured.
 */
const crypto = require('crypto');
const { GIFTS } = require('./giftCatalog');

const GIFT_BY_ID = new Map(GIFTS.map((g) => [g.id, g]));

const DM_THEMES = [
  { id: 'default', label: 'Classic' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'bubblegum', label: 'Bubblegum' },
  { id: 'forest', label: 'Forest' },
  { id: 'gold', label: 'Gold' },
];
const THEME_IDS = new Set(DM_THEMES.map((t) => t.id));

const KEY_RE = /^(audio|creator):.+$/;
const TEXT_MAX = 2000;
const MSG_HISTORY = 200;
const STORAGE_BUCKET = 'dm-media';

function normalizeKey(raw) {
  const s = String(raw || '').trim();
  if (!KEY_RE.test(s)) return null;
  const [kind, ...rest] = s.split(':');
  const value = rest.join(':').trim();
  if (!value) return null;
  return kind === 'creator' ? `creator:${value}` : `audio:${value.toLowerCase()}`;
}

/** Deterministic conversation id from an unordered key pair. */
function pairId(a, b) {
  const [lo, hi] = [a, b].sort();
  return crypto.createHash('sha1').update(`${lo}\u0000${hi}`).digest('hex').slice(0, 24);
}

function audioUsernameOf(key) {
  const k = normalizeKey(key);
  if (!k || !k.startsWith('audio:')) return null;
  return k.slice('audio:'.length);
}

function registerDmChat(app, io, deps = {}) {
  const {
    supabase,
    localDb,
    saveLocalDb,
    audioIdentity,
    getCreatorForRequest,
    sanitize,
    audit,
    users,
  } = deps;

  const rid = (n = 10) => crypto.randomBytes(n).toString('hex');
  const nowIso = () => new Date().toISOString();

  function ensureShape() {
    if (!Array.isArray(localDb.mm_conversations)) localDb.mm_conversations = [];
    if (!Array.isArray(localDb.mm_messages)) localDb.mm_messages = [];
  }

  // -------------------------------------------------------------------------
  // Conversations
  // -------------------------------------------------------------------------
  function findConversationLocal(id) {
    ensureShape();
    return localDb.mm_conversations.find((c) => c.id === id) || null;
  }

  async function ensureConversation(aRaw, bRaw) {
    const aKey = normalizeKey(aRaw);
    const bKey = normalizeKey(bRaw);
    if (!aKey || !bKey) return { ok: false, error: 'Invalid conversation keys' };
    if (aKey === bKey) return { ok: false, error: 'Cannot open a chat with yourself' };
    const id = pairId(aKey, bKey);

    let conv = findConversationLocal(id);
    if (!conv) {
      const [lo, hi] = [aKey, bKey].sort();
      conv = { id, a_key: lo, b_key: hi, theme_id: 'default', updated_at: nowIso() };
      ensureShape();
      localDb.mm_conversations.push(conv);
      saveLocalDb?.();
      if (supabase) {
        try {
          await supabase.from('mm_conversations').upsert(
            { id, a_key: lo, b_key: hi, theme_id: 'default', updated_at: conv.updated_at },
            { onConflict: 'id' },
          );
        } catch (e) { console.warn('[dmChat] conversation upsert failed:', e.message); }
      }
    }
    return { ok: true, conversation: conv };
  }

  function touchConversation(id, patch = {}) {
    const conv = findConversationLocal(id);
    if (!conv) return;
    Object.assign(conv, patch, { updated_at: nowIso() });
    saveLocalDb?.();
    if (supabase) {
      supabase.from('mm_conversations').update({ ...patch, updated_at: conv.updated_at })
        .eq('id', id).then(() => {}, () => {});
    }
  }

  function conversationsFor(key) {
    ensureShape();
    const k = normalizeKey(key);
    if (!k) return [];
    return localDb.mm_conversations
      .filter((c) => c.a_key === k || c.b_key === k)
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
      .map((c) => ({
        id: c.id,
        theme_id: c.theme_id || 'default',
        other: c.a_key === k ? c.b_key : c.a_key,
        updated_at: c.updated_at,
      }));
  }

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------
  function recordMessageLocal(msg) {
    ensureShape();
    localDb.mm_messages.push(msg);
    if (localDb.mm_messages.length > 20000) {
      localDb.mm_messages = localDb.mm_messages.slice(-12000);
    }
    saveLocalDb?.();
  }

  async function persistMessage(msg) {
    recordMessageLocal(msg);
    if (supabase) {
      try {
        await supabase.from('mm_messages').insert({
          id: msg.id,
          conversation_id: msg.conversation_id,
          sender_key: msg.sender_key,
          kind: msg.kind,
          body: msg.body,
          gift_id: msg.gift_id,
          image_url: msg.image_url,
          created_at: msg.created_at,
        });
      } catch (e) { console.warn('[dmChat] message insert failed:', e.message); }
    }
  }

  async function loadMessages(conversationId, limit = MSG_HISTORY) {
    if (supabase) {
      try {
        const { data } = await supabase.from('mm_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (data) {
          return data.reverse().map((m) => ({
            id: m.id, conversationId: m.conversation_id, senderKey: m.sender_key,
            kind: m.kind, body: m.body, giftId: m.gift_id, imageUrl: m.image_url,
            at: m.created_at,
          }));
        }
      } catch { /* fall back to local */ }
    }
    ensureShape();
    return localDb.mm_messages
      .filter((m) => m.conversation_id === conversationId)
      .slice(-limit)
      .map((m) => ({
        id: m.id, conversationId: m.conversation_id, senderKey: m.sender_key,
        kind: m.kind, body: m.body, giftId: m.gift_id, imageUrl: m.image_url,
        at: m.created_at,
      }));
  }

  function cleanText(v) {
    const raw = String(v || '').slice(0, TEXT_MAX);
    const out = sanitize ? sanitize(raw, TEXT_MAX) : raw.replace(/[<>]/g, '');
    return String(out || '').trim();
  }

  /**
   * Send a message. `senderKey` MUST already be an authenticated persona of the
   * caller — resolution happens in the REST/socket layer, never from the body.
   */
  async function sendMessage({ senderKeyRaw, toKeyRaw, kind, text, giftId, imageUrl }) {
    const senderKey = normalizeKey(senderKeyRaw);
    const toKey = normalizeKey(toKeyRaw);
    if (!senderKey) return { ok: false, error: 'Sign in to send messages' };
    if (!toKey) return { ok: false, error: 'Invalid recipient' };

    const convRes = await ensureConversation(senderKey, toKey);
    if (!convRes.ok) return convRes;
    const conv = convRes.conversation;

    const msg = {
      id: rid(),
      conversation_id: conv.id,
      sender_key: senderKey,
      kind: 'text',
      body: '',
      gift_id: null,
      image_url: null,
      created_at: nowIso(),
    };

    if (kind === 'gift') {
      const gift = GIFT_BY_ID.get(String(giftId || ''));
      if (!gift) return { ok: false, error: 'Unknown gift' };
      const senderAudio = audioUsernameOf(senderKey);
      if (!senderAudio) return { ok: false, error: 'Only audio identities can send gifts', needAuth: true };
      const debit = await audioIdentity?.debit?.(senderAudio, gift.cost, `dm_gift:${gift.id}`, {
        conversationId: conv.id, giftId: gift.id,
      });
      if (!debit?.ok) {
        const insufficient = /not enough/i.test(debit?.error || '');
        return { ok: false, error: insufficient ? 'Not enough coins' : (debit?.error || 'Gift failed'), insufficient, needed: gift.cost };
      }
      // Credit the recipient when they own an audio wallet.
      const recipientAudio = audioUsernameOf(toKey);
      if (recipientAudio && audioIdentity?.getByUsername?.(recipientAudio)) {
        const share = Math.floor(gift.cost * (gift.creatorShare || 0.7));
        try { await audioIdentity.credit(recipientAudio, share, `dm_gift_received:${gift.id}`, { conversationId: conv.id }); } catch { /* ledger holds truth */ }
        try { await audioIdentity.giftXp?.(recipientAudio, gift.cost, share); } catch { /* */ }
      }
      msg.kind = 'gift';
      msg.gift_id = gift.id;
      msg.body = gift.name;
      msg.balance = debit.balance;
    } else if (kind === 'image') {
      const url = String(imageUrl || '').trim().slice(0, 500000);
      const okUrl = url && (
        /^https:\/\//i.test(url)
        || url.startsWith('data:image/')
        || url.startsWith(`${STORAGE_BUCKET}/`)
      );
      if (!okUrl) return { ok: false, error: 'imageUrl must be https, a data URL, or a dm-media path' };
      msg.kind = 'image';
      msg.image_url = url;
    } else {
      const clean = cleanText(text);
      if (!clean) return { ok: false, error: 'Empty message' };
      msg.kind = 'text';
      msg.body = clean;
    }

    await persistMessage(msg);
    touchConversation(conv.id);

    const out = {
      id: msg.id,
      conversationId: conv.id,
      senderKey,
      kind: msg.kind,
      body: msg.body,
      giftId: msg.gift_id,
      imageUrl: msg.image_url,
      at: msg.created_at,
    };
    io.to(`dm:${conv.id}`).emit('dm:message', out);
    audit?.('dm_send', { conversationId: conv.id, senderKey, kind: msg.kind });
    return { ok: true, message: out, conversationId: conv.id, balance: msg.balance };
  }

  async function setTheme(conversationId, themeId) {
    const id = String(conversationId || '');
    const theme = String(themeId || '');
    if (!THEME_IDS.has(theme)) return { ok: false, error: 'Unknown theme' };
    const conv = findConversationLocal(id);
    if (!conv) return { ok: false, error: 'Conversation not found' };
    touchConversation(id, { theme_id: theme });
    io.to(`dm:${id}`).emit('dm:theme', { conversationId: id, themeId: theme });
    return { ok: true, themeId: theme };
  }

  // -------------------------------------------------------------------------
  // Identity resolution (never trust body-supplied ids)
  // -------------------------------------------------------------------------
  async function actorKeysForReq(req) {
    const keys = [];
    try {
      const token = String(req.headers['x-audio-session'] || req.body?.token || '');
      const session = audioIdentity?.getSession?.(token);
      if (session?.username) keys.push(normalizeKey(`audio:${session.username}`));
    } catch { /* */ }
    try {
      if (typeof getCreatorForRequest === 'function') {
        const { creator, via } = await getCreatorForRequest(req);
        if (creator && via === 'session') keys.push(normalizeKey(`creator:${creator.id}`));
      }
    } catch { /* */ }
    return keys.filter(Boolean);
  }

  function actorKeysForSocket(socket) {
    const keys = [];
    const u = users?.get?.(socket.id);
    if (u?.audioIdentity?.username) keys.push(normalizeKey(`audio:${u.audioIdentity.username}`));
    if (u?.isCreator && u?.creatorData?.id) keys.push(normalizeKey(`creator:${u.creatorData.id}`));
    return keys.filter(Boolean);
  }

  function pickActor(actors, requested) {
    const req = normalizeKey(requested);
    if (req) return actors.includes(req) ? req : null;
    return actors[0] || null;
  }

  function isMember(conv, key) {
    return conv && (conv.a_key === key || conv.b_key === key);
  }

  // -------------------------------------------------------------------------
  // REST
  // -------------------------------------------------------------------------
  app.get('/api/dm/inbox', async (req, res) => {
    try {
      const actors = await actorKeysForReq(req);
      const self = pickActor(actors, req.query?.as);
      if (!self) return res.status(401).json({ ok: false, error: 'Sign in to view messages' });
      res.json({ ok: true, conversations: conversationsFor(self), themes: DM_THEMES });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Inbox failed' });
    }
  });

  app.post('/api/dm/open', async (req, res) => {
    try {
      const actors = await actorKeysForReq(req);
      const self = pickActor(actors, req.body?.as);
      if (!self) return res.status(401).json({ ok: false, error: 'Sign in to open a chat' });
      const target = normalizeKey(req.body?.targetKey);
      if (!target) return res.status(400).json({ ok: false, error: 'targetKey required' });
      const convRes = await ensureConversation(self, target);
      if (!convRes.ok) return res.status(400).json(convRes);
      res.json({
        ok: true,
        conversation: {
          id: convRes.conversation.id,
          themeId: convRes.conversation.theme_id || 'default',
          other: target,
        },
        messages: await loadMessages(convRes.conversation.id),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Open failed' });
    }
  });

  app.post('/api/dm/send', async (req, res) => {
    try {
      const actors = await actorKeysForReq(req);
      const self = pickActor(actors, req.body?.as);
      if (!self) return res.status(401).json({ ok: false, error: 'Sign in to send messages' });
      const result = await sendMessage({
        senderKeyRaw: self,
        toKeyRaw: req.body?.targetKey,
        kind: req.body?.kind,
        text: req.body?.text,
        giftId: req.body?.giftId,
        imageUrl: req.body?.imageUrl,
      });
      if (!result.ok) return res.status(400).json(result);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Send failed' });
    }
  });

  app.post('/api/dm/theme', async (req, res) => {
    try {
      const actors = await actorKeysForReq(req);
      const self = pickActor(actors, req.body?.as);
      if (!self) return res.status(401).json({ ok: false, error: 'Sign in first' });
      const conv = findConversationLocal(String(req.body?.conversationId || ''));
      if (!conv || !isMember(conv, self)) return res.status(403).json({ ok: false, error: 'Not your conversation' });
      const result = await setTheme(conv.id, req.body?.themeId);
      if (!result.ok) return res.status(400).json(result);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Theme failed' });
    }
  });

  /**
   * Returns instructions the client uses to upload an image.
   * With Supabase storage: a signed upload URL for a path in bucket `dm-media`.
   * Without it: tells the client to send a compressed base64 data URL inline,
   * which is stored as the message's text image path.
   */
  app.post('/api/dm/upload-url', async (req, res) => {
    try {
      const actors = await actorKeysForReq(req);
      const self = pickActor(actors, req.body?.as);
      if (!self) return res.status(401).json({ ok: false, error: 'Sign in first' });

      const ext = String(req.body?.ext || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5).toLowerCase() || 'jpg';
      const path = `${self.replace(/[^a-z0-9]/gi, '_')}/${rid(8)}.${ext}`;

      if (supabase?.storage) {
        try {
          const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUploadUrl(path);
          if (!error && data) {
            return res.json({
              ok: true,
              mode: 'supabase',
              bucket: STORAGE_BUCKET,
              path,
              token: data.token,
              signedUrl: data.signedUrl,
              // store this value as message.imageUrl after upload succeeds:
              imagePath: `${STORAGE_BUCKET}/${path}`,
            });
          }
        } catch (e) { console.warn('[dmChat] signed upload url failed:', e.message); }
      }

      // Fallback: no storage configured — client compresses and sends a data URL.
      res.json({
        ok: true,
        mode: 'data-url',
        maxBytes: 300000,
        note: 'Storage not configured. Compress client-side and POST /api/dm/send with kind=image and imageUrl set to a data:image/... URL.',
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Upload URL failed' });
    }
  });

  // -------------------------------------------------------------------------
  // Sockets
  // -------------------------------------------------------------------------
  function attachSocketHandlers(socket) {
    const on = (evt, fn) => socket.on(evt, async (...args) => {
      const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
      try { await fn(...args); }
      catch (err) {
        console.error(`[dm] ${evt}`, err.message);
        if (cb) cb({ ok: false, error: err.message || 'Error' });
      }
    });

    on('dm:open', async (payload, cb) => {
      const actors = actorKeysForSocket(socket);
      const self = pickActor(actors, payload?.as);
      if (!self) { cb?.({ ok: false, error: 'Sign in to open a chat' }); return; }
      const target = normalizeKey(payload?.targetKey);
      if (!target) { cb?.({ ok: false, error: 'targetKey required' }); return; }
      const convRes = await ensureConversation(self, target);
      if (!convRes.ok) { cb?.(convRes); return; }
      socket.join(`dm:${convRes.conversation.id}`);
      cb?.({
        ok: true,
        conversationId: convRes.conversation.id,
        themeId: convRes.conversation.theme_id || 'default',
        messages: await loadMessages(convRes.conversation.id),
      });
    });

    on('dm:join', async (payload) => {
      const id = String(payload?.conversationId || '');
      const conv = findConversationLocal(id);
      if (!conv) return;
      const actors = actorKeysForSocket(socket);
      const self = pickActor(actors, payload?.as);
      if (!self || !isMember(conv, self)) return;
      socket.join(`dm:${conv.id}`);
    });

    on('dm:messages', async (payload, cb) => {
      const actors = actorKeysForSocket(socket);
      const self = pickActor(actors, payload?.as);
      const conv = findConversationLocal(String(payload?.conversationId || ''));
      if (!conv) { cb?.({ ok: false, error: 'Conversation not found' }); return; }
      if (!self || !isMember(conv, self)) { cb?.({ ok: false, error: 'Not your conversation' }); return; }
      socket.join(`dm:${conv.id}`);
      cb?.({ ok: true, messages: await loadMessages(conv.id) });
    });

    on('dm:list', async (payload, cb) => {
      const actors = actorKeysForSocket(socket);
      const self = pickActor(actors, payload?.as);
      if (!self) { cb?.({ ok: false, error: 'Sign in first' }); return; }
      cb?.({ ok: true, conversations: conversationsFor(self), themes: DM_THEMES });
    });

    on('dm:send', async (payload, cb) => {
      const actors = actorKeysForSocket(socket);
      const self = pickActor(actors, payload?.as);
      if (!self) { cb?.({ ok: false, error: 'Sign in to send messages' }); return; }
      const result = await sendMessage({
        senderKeyRaw: self,
        toKeyRaw: payload?.targetKey,
        kind: payload?.kind,
        text: payload?.text,
        giftId: payload?.giftId,
        imageUrl: payload?.imageUrl,
      });
      cb?.(result);
    });
  }

  return {
    ensureConversation,
    sendMessage,
    setTheme,
    loadMessages,
    conversationsFor,
    attachSocketHandlers,
    normalizeKey,
    THEMES: DM_THEMES,
  };
}

module.exports = { registerDmChat, normalizeKey };
