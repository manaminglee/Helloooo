/**
 * Economy: atomic coin ledger, gift catalog, creator benefits, verification tiers.
 *
 * Ledger safety:
 *  - Every balance change goes through debit()/credit(), never direct writes.
 *  - Per-IP async mutex serialises concurrent mutations so two simultaneous
 *    spends can't both read the same stale balance (the classic double-spend).
 *  - Balances are clamped at 0 and every movement is journaled for audit.
 *
 * Coins are VIRTUAL in this build — no cash-out path is exposed. Creator
 * earnings accrue in a separate `earned` bucket ready for a future payout flow.
 */

const { GIFTS, CATEGORIES, COIN_PACKAGES } = require('./giftCatalog');

/** Verification tiers unlock perks; `paid` marks the premium tier. */
const TIERS = {
  none: { id: 'none', label: 'Unverified', dailyBonus: 0, giftBoost: 1, badge: null, paid: false },
  verified: { id: 'verified', label: 'Verified', dailyBonus: 20, giftBoost: 1, badge: '✔', paid: false },
  creator: { id: 'creator', label: 'Creator', dailyBonus: 50, giftBoost: 1.1, badge: '★', paid: false },
  pro: { id: 'pro', label: 'Pro', dailyBonus: 100, giftBoost: 1.25, badge: '💠', paid: true },
};

const MAX_JOURNAL = 500;

function registerEconomy(app, io, deps) {
  const {
    users,
    getCoinUser,
    updateCoinUser,
    supabase,
    saveLocalDb,
    isAdminRequest,
    sanitize,
    audit,
    getAudioChannel,
    rateLimit: rateLimitFn,
  } = deps;

  /** ip -> Promise chain (async mutex) */
  const locks = new Map();
  /** In-memory journal mirror for the admin dashboard. */
  const journal = [];
  /** ip -> { earned, giftsReceived, giftsSent, tier } */
  const creatorStats = new Map();

  const stats = { totalSpent: 0, totalEarned: 0, giftsSent: 0 };

  /** Serialise all mutations for a given IP. */
  function withLock(ip, fn) {
    const prev = locks.get(ip) || Promise.resolve();
    const next = prev.then(fn, fn);
    // Keep the chain alive but don't leak rejections.
    locks.set(
      ip,
      next.then(
        () => {},
        () => {}
      )
    );
    return next;
  }

  function journalEntry(entry) {
    journal.unshift({ ...entry, at: Date.now() });
    if (journal.length > MAX_JOURNAL) journal.length = MAX_JOURNAL;
    if (supabase) {
      supabase
        .from('coin_ledger')
        .insert({
          ip: entry.ip,
          delta: entry.delta,
          reason: entry.reason,
          balance_after: entry.balanceAfter,
          meta: entry.meta || null,
        })
        .then(() => {})
        .catch(() => {});
    }
  }

  async function pushBalance(ip, coins, reason) {
    const u = await getCoinUser(ip);
    for (const [sid, user] of users.entries()) {
      if (user.ip === ip) {
        io.to(sid).emit('coins-updated', {
          coins,
          reason,
          registered: !!u?.registered,
          activeSeconds: u?.active_seconds || 0,
        });
      }
    }
  }

  async function getBalance(ip) {
    const u = await getCoinUser(ip);
    return Math.max(0, Number(u?.coins) || 0);
  }

  /**
   * Apply debit assuming the caller already holds the per-IP lock
   * (e.g. inside runLocked). Prefer debit() for normal call sites.
   */
  async function applyDebit(ip, amount, reason, meta) {
    const amt = Math.floor(Number(amount) || 0);
    if (amt <= 0) return { ok: false, error: 'Invalid amount' };
    const u = await getCoinUser(ip);
    const balance = Math.max(0, Number(u.coins) || 0);
    if (balance < amt) return { ok: false, error: 'Insufficient coins', balance };
    const after = balance - amt;
    await updateCoinUser(ip, { coins: after });
    stats.totalSpent += amt;
    journalEntry({ ip, delta: -amt, reason, balanceAfter: after, meta });
    await pushBalance(ip, after, reason);
    return { ok: true, balance: after };
  }

  /**
   * Apply credit assuming the caller already holds the per-IP lock.
   * Prefer credit() for normal call sites.
   */
  async function applyCredit(ip, amount, reason, meta) {
    const amt = Math.floor(Number(amount) || 0);
    if (amt <= 0) return { ok: false, error: 'Invalid amount' };
    const u = await getCoinUser(ip);
    const balance = Math.max(0, Number(u.coins) || 0);
    const after = balance + amt;
    await updateCoinUser(ip, { coins: after });
    stats.totalEarned += amt;
    journalEntry({ ip, delta: amt, reason, balanceAfter: after, meta });
    await pushBalance(ip, after, reason);
    return { ok: true, balance: after };
  }

  /** Atomic spend. Returns { ok, balance } or { ok:false, error }. */
  async function debit(ip, amount, reason, meta) {
    const amt = Math.floor(Number(amount) || 0);
    if (amt <= 0) return { ok: false, error: 'Invalid amount' };
    return withLock(ip, () => applyDebit(ip, amt, reason, meta));
  }

  /** Atomic credit. */
  async function credit(ip, amount, reason, meta) {
    const amt = Math.floor(Number(amount) || 0);
    if (amt <= 0) return { ok: false, error: 'Invalid amount' };
    return withLock(ip, () => applyCredit(ip, amt, reason, meta));
  }

  /** Set absolute balance (admin). Clamped at 0. */
  async function setBalance(ip, amount, reason, meta) {
    const target = Math.max(0, Math.floor(Number(amount) || 0));
    return withLock(ip, async () => {
      const u = await getCoinUser(ip);
      const balance = Math.max(0, Number(u.coins) || 0);
      const delta = target - balance;
      await updateCoinUser(ip, { coins: target });
      if (delta > 0) stats.totalEarned += delta;
      else if (delta < 0) stats.totalSpent += Math.abs(delta);
      journalEntry({
        ip,
        delta,
        reason: reason || 'admin_set_balance',
        balanceAfter: target,
        meta: { ...(meta || {}), set: true, previous: balance },
      });
      await pushBalance(ip, target, reason || 'Admin set balance');
      return { ok: true, balance: target, previous: balance, delta };
    });
  }

  /** Run arbitrary mutations under the per-IP mutex (claim / registration). */
  function runLocked(ip, fn) {
    return withLock(ip, fn);
  }

  function statsFor(ip) {
    if (!creatorStats.has(ip)) {
      creatorStats.set(ip, { earned: 0, giftsReceived: 0, giftsSent: 0, tier: 'none' });
    }
    return creatorStats.get(ip);
  }

  const tierFor = (ip) => TIERS[statsFor(ip).tier] || TIERS.none;

  /** ip -> gift rate bucket */
  const giftRates = new Map();
  /** `${from}:${to}` -> { count, lastAt } */
  const giftStreaks = new Map();
  const GIFT_WINDOW_MS = 8000;
  const GIFT_MAX = 6;
  const GIFT_STREAK_WINDOW_MS = 90000;
  const GIFT_RECEIVE_BONUS = 3;

  const giftRateOk = (key) => {
    const now = Date.now();
    const b = giftRates.get(key);
    if (!b || now - b.start > GIFT_WINDOW_MS) {
      giftRates.set(key, { start: now, count: 1 });
      return true;
    }
    b.count += 1;
    return b.count <= GIFT_MAX;
  };

  /** When gifting inside a voice room, both parties must be members. */
  const assertChannelGift = (channelId, fromSocketId, toSocketId) => {
    if (!channelId) return { ok: true };
    if (typeof getAudioChannel !== 'function') return { ok: true };
    const channel = getAudioChannel(channelId);
    if (!channel) return { ok: false, error: 'Voice room not found' };
    if (!channel.members.has(fromSocketId)) return { ok: false, error: 'Join the voice room first' };
    if (!channel.members.has(toSocketId)) return { ok: false, error: 'That person left the room' };
    return { ok: true };
  };

  /**
   * Send a gift. Atomically debits the sender, credits the recipient's share,
   * and books the creator's earnings. Returns the animation payload.
   */
  async function sendGift({ fromIp, fromSocketId, toSocketId, giftId, channelId }) {
    const gift = GIFTS.find((g) => g.id === giftId);
    if (!gift) return { ok: false, error: 'Unknown gift' };

    const recipient = users.get(toSocketId);
    if (!recipient) return { ok: false, error: 'Recipient not available' };
    // Same browser/NAT can share an IP — only block true self-gifts.
    if (toSocketId === fromSocketId) return { ok: false, error: 'You cannot gift yourself' };

    const membership = assertChannelGift(channelId, fromSocketId, toSocketId);
    if (!membership.ok) return membership;

    const streakKey = `${fromSocketId}:${toSocketId}`;
    const now = Date.now();
    const prev = giftStreaks.get(streakKey);
    let streak = 1;
    if (prev && now - prev.lastAt < GIFT_STREAK_WINDOW_MS) streak = prev.count + 1;
    giftStreaks.set(streakKey, { count: streak, lastAt: now });

    const spend = await debit(fromIp, gift.cost, `gift_sent_${gift.id}`, { toSocketId, channelId });
    if (!spend.ok) return spend;

    const recipientTier = tierFor(recipient.ip);
    const share = Math.floor(gift.cost * gift.creatorShare * recipientTier.giftBoost);
    await credit(recipient.ip, share, `gift_received_${gift.id}`, { fromSocketId, channelId });

    if (channelId && share > 0) {
      try {
        const bonus = await credit(recipient.ip, GIFT_RECEIVE_BONUS, 'audio_gift_receive_bonus', { channelId, giftId: gift.id });
        if (bonus.ok) {
          io.to(channelId).emit('audio:gift-bonus', {
            channelId,
            toSocketId,
            toNickname: recipient.nickname,
            coins: GIFT_RECEIVE_BONUS,
            giftName: gift.name,
          });
          io.to(toSocketId).emit('coins-updated', {
            coins: bonus.balance,
            reason: 'Gift receive bonus',
          });
        }
      } catch { /* bonus is best-effort */ }
    }

    const rStats = statsFor(recipient.ip);
    rStats.earned += share;
    rStats.giftsReceived += 1;
    statsFor(fromIp).giftsSent += 1;
    stats.giftsSent += 1;

    const sender = users.get(fromSocketId);
    const payload = {
      giftId: gift.id,
      name: gift.name,
      icon: gift.icon,
      tier: gift.tier,
      cost: gift.cost,
      fromSocketId,
      fromNickname: sender?.nickname || 'Someone',
      toSocketId,
      toNickname: recipient.nickname || 'Someone',
      channelId: channelId || null,
      streak,
      at: Date.now(),
    };

    // Broadcast to the room (or just the pair) so everyone sees the animation.
    if (channelId) {
      io.to(channelId).emit('gift:received', payload);
      if (streak >= 2) {
        io.to(channelId).emit('gift:streak', { ...payload, streak });
      }
      io.to(channelId).emit('audio:chat-message', {
        channelId,
        id: `gift_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        socketId: fromSocketId,
        nickname: payload.fromNickname,
        text: `🎁 sent ${gift.icon} ${gift.name} to ${payload.toNickname}`,
        kind: 'gift',
        persist: true,
        gift: payload,
        ts: Date.now(),
      });
    } else {
      io.to(toSocketId).emit('gift:received', payload);
      io.to(fromSocketId).emit('gift:received', payload);
    }

    audit?.('gift_sent', { from: sender?.id, to: recipient.id, gift: gift.id, cost: gift.cost });

    if (supabase) {
      supabase
        .from('gift_events')
        .insert({
          gift_id: gift.id,
          gift_name: gift.name,
          cost: gift.cost,
          from_socket_id: fromSocketId,
          to_socket_id: toSocketId,
          from_user_id: sender?.id || null,
          to_user_id: recipient.id || null,
          from_ip: fromIp,
          to_ip: recipient.ip || null,
          channel_id: channelId || null,
          creator_earned: share,
          blast: false,
          meta: { icon: gift.icon, tier: gift.tier },
        })
        .then(() => {})
        .catch(() => {});
    }

    return { ok: true, balance: spend.balance, gift: payload, creatorEarned: share };
  }

  async function sendGiftToAll({ fromIp, fromSocketId, giftId, channelId, targetIds }) {
    const gift = GIFTS.find((g) => g.id === giftId);
    if (!gift) return { ok: false, error: 'Unknown gift' };

    let ids = [...new Set((targetIds || []).map(String))].filter((id) => id && id !== fromSocketId);
    if (channelId && typeof getAudioChannel === 'function') {
      const channel = getAudioChannel(channelId);
      if (!channel) return { ok: false, error: 'Voice room not found' };
      if (!channel.members.has(fromSocketId)) return { ok: false, error: 'Join the voice room first' };
      // Never trust client target list — only charge for real members.
      ids = ids.filter((id) => channel.members.has(id));
    }
    if (!ids.length) return { ok: false, error: 'No recipients' };

    const total = gift.cost * ids.length;
    const spend = await debit(fromIp, total, `gift_all_${gift.id}`, { count: ids.length, channelId });
    if (!spend.ok) return spend;

    const results = [];
    for (const toSocketId of ids) {
      const recipient = users.get(toSocketId);
      if (!recipient || toSocketId === fromSocketId) continue;
      const recipientTier = tierFor(recipient.ip);
      const share = Math.floor(gift.cost * gift.creatorShare * recipientTier.giftBoost);
      await credit(recipient.ip, share, `gift_received_${gift.id}`, { fromSocketId, channelId });
      const rStats = statsFor(recipient.ip);
      rStats.earned += share;
      rStats.giftsReceived += 1;
      statsFor(fromIp).giftsSent += 1;
      stats.giftsSent += 1;
      const sender = users.get(fromSocketId);
      const payload = {
        giftId: gift.id,
        name: gift.name,
        icon: gift.icon,
        tier: gift.tier,
        cost: gift.cost,
        fromSocketId,
        fromNickname: sender?.nickname || 'Someone',
        toSocketId,
        toNickname: recipient.nickname || 'Someone',
        channelId: channelId || null,
        at: Date.now(),
        blast: true,
      };
      results.push(payload);
      if (channelId) io.to(channelId).emit('gift:received', payload);
      else {
        io.to(toSocketId).emit('gift:received', payload);
        io.to(fromSocketId).emit('gift:received', payload);
      }
    }

    if (channelId && results.length) {
      const sender = users.get(fromSocketId);
      io.to(channelId).emit('audio:chat-message', {
        channelId,
        id: `giftall_${Date.now()}`,
        socketId: fromSocketId,
        nickname: sender?.nickname || 'Someone',
        text: `🎁 sent ${gift.icon} ${gift.name} to everyone (${results.length})`,
        kind: 'gift',
        persist: true,
        ts: Date.now(),
      });
    }

    return { ok: true, balance: spend.balance, count: results.length };
  }

  function attachSocketHandlers(socket, ip) {
    socket.on('gift:catalog', () => {
      socket.emit('gift:catalog', {
        gifts: GIFTS,
        categories: CATEGORIES,
        packages: COIN_PACKAGES,
        tier: tierFor(ip),
      });
    });

    socket.on('gift:send', async (data) => {
      try {
        if (typeof rateLimitFn === 'function') {
          const rl = await rateLimitFn(`gift:${ip}`, { windowMs: 8000, max: 6 });
          if (!rl.ok) {
            return socket.emit('gift:error', { message: 'Slow down — too many gifts.' });
          }
        } else if (!giftRateOk(ip)) {
          return socket.emit('gift:error', { message: 'Slow down — too many gifts.' });
        }
        if (data?.toAll && data?.channelId) {
          const res = await sendGiftToAll({
            fromIp: ip,
            fromSocketId: socket.id,
            giftId: String(data?.giftId || ''),
            channelId: String(data.channelId),
            targetIds: Array.isArray(data.targetIds) ? data.targetIds : [],
          });
          if (!res.ok) socket.emit('gift:error', { message: res.error });
          else socket.emit('gift:sent', { ok: true, toAll: true, count: res.count, balance: res.balance });
          return;
        }
        const res = await sendGift({
          fromIp: ip,
          fromSocketId: socket.id,
          toSocketId: String(data?.toSocketId || ''),
          giftId: String(data?.giftId || ''),
          channelId: data?.channelId ? String(data.channelId) : null,
        });
        if (!res.ok) socket.emit('gift:error', { message: res.error });
        else socket.emit('gift:sent', { ok: true, gift: res.gift, balance: res.balance });
      } catch (_) {
        socket.emit('gift:error', { message: 'Gift failed. Please try again.' });
      }
    });

    socket.on('coins:buy-package', async (data) => {
      try {
        const pack = COIN_PACKAGES.find((p) => p.id === String(data?.packageId || ''));
        if (!pack) return socket.emit('gift:error', { message: 'Unknown coin package.' });
        const allow =
          process.env.PAYMENTS_TEST_MODE === '1' ||
          process.env.NODE_ENV !== 'production' ||
          String(process.env.ALLOW_VIRTUAL_COIN_BUY || '') === '1';
        if (!allow) {
          return socket.emit('gift:error', {
            message: 'Coin checkout opens soon — earn coins in rooms for now.',
          });
        }
        const res = await credit(ip, pack.coins, `coin_pack_${pack.id}`, { packageId: pack.id });
        if (res.ok) {
          socket.emit('coins-updated', { coins: res.balance, reason: `Bought ${pack.name}` });
          socket.emit('gift:pack-bought', { packageId: pack.id, coins: pack.coins, balance: res.balance });
        }
      } catch (_) {
        socket.emit('gift:error', { message: 'Could not buy package.' });
      }
    });

    socket.on('economy:me', async () => {
      socket.emit('economy:me', {
        coins: await getBalance(ip),
        tier: tierFor(ip),
        stats: statsFor(ip),
        packages: COIN_PACKAGES,
      });
    });
  }

  // ---------------- HTTP ----------------

  app.get('/api/economy/catalog', (_req, res) => {
    res.json({ gifts: GIFTS, categories: CATEGORIES, packages: COIN_PACKAGES, tiers: Object.values(TIERS) });
  });

  app.get('/api/admin/economy', (req, res) => {
    if (!isAdminRequest(req)) return res.status(403).json({ error: 'Forbidden' });
    const creators = [...creatorStats.entries()]
      .map(([ip, s]) => ({ ip, ...s }))
      .sort((a, b) => b.earned - a.earned)
      .slice(0, 100);
    res.json({ stats, journal: journal.slice(0, 200), creators, gifts: GIFTS });
  });

  /** Admin: grant, revoke, or set coins (support tooling, refunds). */
  app.post('/api/admin/economy/adjust', async (req, res) => {
    if (!isAdminRequest(req)) return res.status(403).json({ error: 'Forbidden' });
    const { ip, amount, reason, set } = req.body || {};
    const rawIp = String(ip || '').trim().slice(0, 64);
    if (!rawIp) return res.status(400).json({ error: 'ip required' });

    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt)) return res.status(400).json({ error: 'amount required' });
    const MAX = 100000;
    if (Math.abs(amt) > MAX) return res.status(400).json({ error: `Amount capped at ±${MAX}` });

    const note = sanitize(String(reason || 'admin_adjustment'), 80);
    let result;
    if (set) {
      if (amt < 0) return res.status(400).json({ error: 'Set balance cannot be negative' });
      result = await setBalance(rawIp, amt, note, { admin: true });
    } else {
      if (!amt) return res.status(400).json({ error: 'non-zero amount required' });
      result = amt > 0 ? await credit(rawIp, amt, note, { admin: true }) : await debit(rawIp, Math.abs(amt), note, { admin: true });
    }
    audit?.('admin_coin_adjust', { ip: rawIp, amount: amt, set: !!set, reason: note });
    res.json(result);
  });

  /** Admin: set a verification tier (verified / creator / pro). */
  app.post('/api/admin/economy/tier', (req, res) => {
    if (!isAdminRequest(req)) return res.status(403).json({ error: 'Forbidden' });
    const { ip, tier } = req.body || {};
    if (!ip || !TIERS[tier]) return res.status(400).json({ error: 'Valid ip and tier required' });

    statsFor(ip).tier = tier;
    for (const [sid, u] of users.entries()) {
      if (u.ip === ip) {
        u.verified = tier !== 'none';
        u.tier = tier;
        io.to(sid).emit('economy:tier', { tier: TIERS[tier] });
      }
    }
    audit?.('admin_tier_set', { ip, tier });
    if (!supabase && typeof saveLocalDb === 'function') saveLocalDb();
    res.json({ ok: true, tier: TIERS[tier] });
  });

  return {
    attachSocketHandlers,
    getBalance,
    debit,
    credit,
    applyDebit,
    applyCredit,
    setBalance,
    runLocked,
    sendGift,
    tierFor,
    statsFor,
    GIFTS,
    TIERS,
    journal,
    stats,
  };
}

module.exports = { registerEconomy, GIFTS, CATEGORIES, COIN_PACKAGES, TIERS };
