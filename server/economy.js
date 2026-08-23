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

const GIFTS = [
  { id: 'rose', name: 'Rose', cost: 5, icon: '🌹', tier: 'basic', creatorShare: 0.6 },
  { id: 'heart', name: 'Heart', cost: 10, icon: '💖', tier: 'basic', creatorShare: 0.6 },
  { id: 'star', name: 'Star', cost: 25, icon: '⭐', tier: 'basic', creatorShare: 0.65 },
  { id: 'fire', name: 'Fire', cost: 50, icon: '🔥', tier: 'rare', creatorShare: 0.7 },
  { id: 'crown', name: 'Crown', cost: 100, icon: '👑', tier: 'rare', creatorShare: 0.7 },
  { id: 'diamond', name: 'Diamond', cost: 250, icon: '💎', tier: 'epic', creatorShare: 0.75 },
  { id: 'rocket', name: 'Rocket', cost: 500, icon: '🚀', tier: 'epic', creatorShare: 0.75 },
  { id: 'galaxy', name: 'Galaxy', cost: 1000, icon: '🌌', tier: 'legendary', creatorShare: 0.8 },
];

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

  function pushBalance(ip, coins, reason) {
    for (const [sid, u] of users.entries()) {
      if (u.ip === ip) io.to(sid).emit('coins-updated', { coins, reason });
    }
  }

  async function getBalance(ip) {
    const u = await getCoinUser(ip);
    return Math.max(0, Number(u?.coins) || 0);
  }

  /** Atomic spend. Returns { ok, balance } or { ok:false, error }. */
  async function debit(ip, amount, reason, meta) {
    const amt = Math.floor(Number(amount) || 0);
    if (amt <= 0) return { ok: false, error: 'Invalid amount' };

    return withLock(ip, async () => {
      const u = await getCoinUser(ip);
      const balance = Math.max(0, Number(u.coins) || 0);
      if (balance < amt) return { ok: false, error: 'Insufficient coins', balance };

      const after = balance - amt;
      await updateCoinUser(ip, { coins: after });
      stats.totalSpent += amt;
      journalEntry({ ip, delta: -amt, reason, balanceAfter: after, meta });
      pushBalance(ip, after, reason);
      return { ok: true, balance: after };
    });
  }

  /** Atomic credit. */
  async function credit(ip, amount, reason, meta) {
    const amt = Math.floor(Number(amount) || 0);
    if (amt <= 0) return { ok: false, error: 'Invalid amount' };

    return withLock(ip, async () => {
      const u = await getCoinUser(ip);
      const balance = Math.max(0, Number(u.coins) || 0);
      const after = balance + amt;
      await updateCoinUser(ip, { coins: after });
      stats.totalEarned += amt;
      journalEntry({ ip, delta: amt, reason, balanceAfter: after, meta });
      pushBalance(ip, after, reason);
      return { ok: true, balance: after };
    });
  }

  function statsFor(ip) {
    if (!creatorStats.has(ip)) {
      creatorStats.set(ip, { earned: 0, giftsReceived: 0, giftsSent: 0, tier: 'none' });
    }
    return creatorStats.get(ip);
  }

  const tierFor = (ip) => TIERS[statsFor(ip).tier] || TIERS.none;

  /**
   * Send a gift. Atomically debits the sender, credits the recipient's share,
   * and books the creator's earnings. Returns the animation payload.
   */
  async function sendGift({ fromIp, fromSocketId, toSocketId, giftId, channelId }) {
    const gift = GIFTS.find((g) => g.id === giftId);
    if (!gift) return { ok: false, error: 'Unknown gift' };

    const recipient = users.get(toSocketId);
    if (!recipient) return { ok: false, error: 'Recipient not available' };
    if (recipient.ip === fromIp) return { ok: false, error: 'You cannot gift yourself' };

    const spend = await debit(fromIp, gift.cost, `gift_sent_${gift.id}`, { toSocketId, channelId });
    if (!spend.ok) return spend;

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
    };

    // Broadcast to the room (or just the pair) so everyone sees the animation.
    if (channelId) io.to(channelId).emit('gift:received', payload);
    else {
      io.to(toSocketId).emit('gift:received', payload);
      io.to(fromSocketId).emit('gift:received', payload);
    }

    audit?.('gift_sent', { from: sender?.id, to: recipient.id, gift: gift.id, cost: gift.cost });
    return { ok: true, balance: spend.balance, gift: payload, creatorEarned: share };
  }

  function attachSocketHandlers(socket, ip) {
    socket.on('gift:catalog', () => {
      socket.emit('gift:catalog', { gifts: GIFTS, tier: tierFor(ip) });
    });

    socket.on('gift:send', async (data) => {
      try {
        const res = await sendGift({
          fromIp: ip,
          fromSocketId: socket.id,
          toSocketId: String(data?.toSocketId || ''),
          giftId: String(data?.giftId || ''),
          channelId: data?.channelId ? String(data.channelId) : null,
        });
        if (!res.ok) socket.emit('gift:error', { message: res.error });
      } catch (_) {
        socket.emit('gift:error', { message: 'Gift failed. Please try again.' });
      }
    });

    socket.on('economy:me', async () => {
      socket.emit('economy:me', {
        coins: await getBalance(ip),
        tier: tierFor(ip),
        stats: statsFor(ip),
      });
    });
  }

  // ---------------- HTTP ----------------

  app.get('/api/economy/catalog', (_req, res) => {
    res.json({ gifts: GIFTS, tiers: Object.values(TIERS) });
  });

  app.get('/api/admin/economy', (req, res) => {
    if (!isAdminRequest(req)) return res.status(403).json({ error: 'Forbidden' });
    const creators = [...creatorStats.entries()]
      .map(([ip, s]) => ({ ip, ...s }))
      .sort((a, b) => b.earned - a.earned)
      .slice(0, 100);
    res.json({ stats, journal: journal.slice(0, 200), creators, gifts: GIFTS });
  });

  /** Admin: grant or revoke coins (support tooling, refunds). */
  app.post('/api/admin/economy/adjust', async (req, res) => {
    if (!isAdminRequest(req)) return res.status(403).json({ error: 'Forbidden' });
    const { ip, amount, reason } = req.body || {};
    const amt = Math.floor(Number(amount) || 0);
    if (!ip || !amt) return res.status(400).json({ error: 'ip and non-zero amount required' });

    const note = sanitize(String(reason || 'admin_adjustment'), 80);
    const result = amt > 0 ? await credit(ip, amt, note) : await debit(ip, Math.abs(amt), note);
    audit?.('admin_coin_adjust', { ip, amount: amt, reason: note });
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
    sendGift,
    tierFor,
    statsFor,
    GIFTS,
    TIERS,
    journal,
    stats,
  };
}

module.exports = { registerEconomy, GIFTS, TIERS };
