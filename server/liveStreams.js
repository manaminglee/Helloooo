/**
 * In-app live streams.
 *
 * Media   : LiveKit SFU (host publishes, viewers subscribe)
 * Realtime: Socket.IO room `live:<id>` — comments, reactions, gifts, presence,
 *           follows, moderation, host stats.
 * State   : server/liveStore.js — memory on one instance, Redis across many.
 *           Socket.IO already fans broadcasts out through the Redis adapter, so
 *           putting room state in the same Redis makes the whole live layer
 *           horizontally scalable: any instance can serve any viewer of any
 *           room, and a room outlives the instance that started it.
 * Money   : every gift is validated and debited server-side; the client's
 *           balance is never an input. Transactions are append-only and
 *           idempotent by nonce (SET NX PX — one winner across all instances).
 */
const crypto = require('crypto');
const livekitRooms = require('./livekitRooms');
const { GIFTS } = require('./giftCatalog');
const { createLiveStore } = require('./liveStore');
const { buildWordList, filterText, createRateLimiter } = require('./liveModeration');

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const COMMENT_MAX = 200;
const COMMENT_HISTORY = 60;
const BATTLE_DURATION_MS = 7 * 60 * 1000;
const REMATCH_WINDOW_MS = 60 * 1000;   // both hosts must ask to rematch within this
const CREATOR_SHARE_DEFAULT = 0.7;     // fallback split when a gift lacks its own

const PRESENCE_FLUSH_MS = 1000;
const PRESENCE_LOCK_MS = 900;      // cross-instance dedupe of the count packet
const REACTION_FLUSH_MS = 350;
const COMBO_WINDOW_MS = 4000;
const NONCE_TTL_MS = 120_000;
const HOST_GRACE_MS = 25_000;
const HEARTBEAT_MS = 30_000;       // host instance refreshes the room TTL
const SWEEP_MS = 30_000;           // orphan check (one instance wins the lock)
const SLOW_STAMP_TTL_MS = 180_000; // per-commenter throttle stamps self-expire
const VIEWER_LIST_MAX = 200;

const LIMITS = {
  comment: { max: 8, windowMs: 10_000 },
  gift: { max: 20, windowMs: 10_000 },
  reaction: { max: 60, windowMs: 5_000 },
  join: { max: 25, windowMs: 60_000 },
  follow: { max: 10, windowMs: 60_000 },
  report: { max: 5, windowMs: 60_000 },
};

const GIFT_BY_ID = new Map(GIFTS.map((g) => [g.id, g]));
const FULLSCREEN_TIERS = new Set(['legendary', 'mega']);

// Platform-wide creator share for live gifts. A per-gift creatorShare still
// wins when present; this is the transparency baseline surfaced in stats.
function creatorSharePct() {
  const raw = Number(process.env.LIVE_GIFT_CREATOR_SHARE);
  if (Number.isFinite(raw) && raw > 0 && raw <= 1) return raw;
  return CREATOR_SHARE_DEFAULT;
}

/** Gift-cut transparency block for a given gross Nut amount. */
function giftCutBreakdown(grossNuts) {
  const share = creatorSharePct();
  const gross = Math.max(0, Math.floor(Number(grossNuts) || 0));
  const creatorNuts = Math.floor(gross * share);
  return {
    creatorSharePct: share,
    platformCutPct: Math.round((1 - share) * 10000) / 10000,
    grossNuts: gross,
    creatorNuts,
    platformNuts: gross - creatorNuts,
  };
}

const nowMs = () => Date.now();
const rid = (bytes = 8) => crypto.randomBytes(bytes).toString('hex');

function clampInt(v, min, max, fallback = min) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function socketIp(socket) {
  return (
    socket?.handshake?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
    || socket?.handshake?.address
    || socket?.id
    || 'unknown'
  );
}

function registerLiveStreams(app, io, deps) {
  const {
    users,
    sanitize,
    generateId,
    localDb,
    saveLocalDb,
    supabase,
    audioIdentity,
    getCreatorForRequest,
    getSettings,
    creditCreatorCoins,
    getRedis,
    persistence,          // optional: server/livePersistence.js
    audit,
    socialFollow,         // optional: server/socialFollow.js (mutual-follow gate)
    notifyFollowers,      // optional: (creator) => void, pings followers on go-live
    getMarket,            // optional: () => virtual market engine
  } = deps;

  const INSTANCE = process.env.INSTANCE_ID || `${process.pid}-${rid(3)}`;

  const store = createLiveStore({
    getRedis: getRedis || (() => null),
    onError: (err) => console.error('[liveStore] degraded to memory:', err.message),
  });

  /**
   * Per-instance scratch: timers and buffers that must NOT be shared, keyed by
   * live id. Room state itself lives in the store.
   */
  const local = new Map();

  // Pending rematch asks: battleId -> { [liveId]: askedAt }. When both sides of
  // a just-ended battle ask within REMATCH_WINDOW_MS, we start a fresh battle.
  const rematchAsks = new Map();

  function localOf(liveId) {
    let l = local.get(liveId);
    if (!l) {
      l = {
        hosted: false,
        presenceTimer: null,
        reactionTimer: null,
        reactionBuffer: { count: 0, colors: [] },
        hostGraceTimer: null,
        lastBroadcastViewers: -1,
        bannedWords: buildWordList(getSettings?.()?.liveBannedWords || []),
      };
      local.set(liveId, l);
    }
    return l;
  }

  function clearLocal(liveId) {
    const l = local.get(liveId);
    if (!l) return;
    clearTimeout(l.presenceTimer);
    clearTimeout(l.reactionTimer);
    clearTimeout(l.hostGraceTimer);
    local.delete(liveId);
  }

  const limiters = Object.fromEntries(
    Object.entries(LIMITS).map(([k, v]) => [k, createRateLimiter(v)]),
  );

  function ensureShape() {
    if (!localDb.live_streams) localDb.live_streams = [];
    if (!localDb.live_gift_tx) localDb.live_gift_tx = [];
    if (!localDb.live_reports) localDb.live_reports = [];
  }

  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------
  function walletKeyOf(socket) {
    return audioIdentity?.resolveWalletKey?.(socket, users) || null;
  }

  function viewerProfile(socket) {
    const u = users?.get?.(socket.id) || {};
    const ident = u.audioIdentity || {};
    return {
      socketId: socket.id,
      instance: INSTANCE,
      key: ident.username ? String(ident.username).toLowerCase() : null,
      username: ident.username || u.nickname || 'Guest',
      nameColor: ident.nameColor || '#e2e8f0',
      levelBadge: ident.levelBadge || null,
      displayLevel: ident.level || 0,
      avatarUrl: ident.avatarUrl || u.avatarUrl || null,
      country: u.country || '',
      ip: u.ip || socketIp(socket),
      joinedAt: nowMs(),
    };
  }

  async function badgesFor(room, viewer, topKey) {
    const badges = [];
    if (!viewer) return badges;
    if (viewer.socketId === room.hostSocketId) badges.push('creator');
    if (viewer.key && await store.has('mods', room.id, viewer.key)) badges.push('moderator');
    if (viewer.key && topKey && viewer.key === topKey) badges.push('top_gifter');
    if ((viewer.displayLevel || 0) >= 30) badges.push('vip');
    return badges;
  }

  function isHostSocket(room, socket) {
    if (!room || !socket) return false;
    if (room.hostSocketId === socket.id) return true;
    const u = users?.get?.(socket.id);
    return !!(u?.isCreator && u?.creatorData?.id === room.creatorId);
  }

  async function isModSocket(room, socket) {
    if (isHostSocket(room, socket)) return true;
    const key = walletKeyOf(socket);
    return !!(key && await store.has('mods', room.id, key));
  }

  // -------------------------------------------------------------------------
  // Projections
  // -------------------------------------------------------------------------
  function publicLive(room, viewerCount = 0) {
    if (!room) return null;
    return {
      id: room.id,
      creatorId: room.creatorId,
      handle: room.handle,
      displayName: room.displayName,
      avatarUrl: room.avatarUrl,
      verified: !!room.verified,
      title: room.title,
      wallpaperUrl: room.wallpaperUrl || null,
      viewerCount,
      startedAt: room.startedAt,
      status: room.status,
      battleId: room.battleId || null,
      guestSocketId: room.guestSocketId || null,
      levelBadge: room.levelBadge || null,
      displayLevel: room.displayLevel || 0,
      nutsEarned: room.nutsEarned || 0,
      likes: room.likes || 0,
      pinnedComment: room.pinnedComment || null,
      commentsDisabled: !!room.commentsDisabled,
      slowModeMs: room.slowModeMs || 0,
    };
  }

  async function listActive() {
    const rooms = await store.listActive();
    const withCounts = await Promise.all(
      rooms.map(async (r) => publicLive(r, await store.viewerCount(r.id))),
    );
    return withCounts.sort((a, b) => b.viewerCount - a.viewerCount);
  }

  async function getLive(id) {
    const room = await store.getRoom(String(id || ''));
    return room && room.status === 'live' ? room : (room || null);
  }

  async function hostStats(room) {
    if (!room) return null;
    const [viewers, unique, top] = await Promise.all([
      store.viewerCount(room.id),
      store.uniqueCount(room.id),
      store.topGifters(room.id, 10),
    ]);
    return {
      liveId: room.id,
      viewers,
      peakViewers: room.peakViewers || 0,
      uniqueViewers: unique,
      likes: room.likes || 0,
      giftCount: room.giftCount || 0,
      coinsReceived: room.coinsGross || 0,
      nutsEarned: room.nutsEarned || 0,
      topGifters: top,
      recentGift: room.recentGift ? JSON.parse(room.recentGift) : null,
      durationMs: nowMs() - (room.startedAt || nowMs()),
      ...giftCutBreakdown(room.coinsGross || 0),
    };
  }

  async function viewerList(room) {
    const [raw, top] = await Promise.all([
      store.listViewers(room.id, VIEWER_LIST_MAX),
      store.topGifters(room.id, 1),
    ]);
    const topKey = top[0]?.key || null;
    const rows = await Promise.all(raw.map(async (v) => ({
      socketId: v.socketId,
      username: v.username,
      nameColor: v.nameColor,
      avatarUrl: v.avatarUrl,
      displayLevel: v.displayLevel,
      levelBadge: v.levelBadge,
      country: v.country,
      badges: await badgesFor(room, v, topKey),
      muted: !!(v.key && await store.has('muted', room.id, v.key)),
      giftedCoins: v.key ? await store.gifterCoins(room.id, v.key) : 0,
    })));
    rows.sort((a, b) => (b.giftedCoins - a.giftedCoins) || (b.displayLevel - a.displayLevel));
    return rows;
  }

  function canCreatorGoLive(creator) {
    if (!creator) return false;
    const policy = getSettings?.()?.liveGoLivePolicy || 'approved';
    if (policy === 'applied') return creator.status === 'approved' || creator.status === 'pending';
    return creator.status === 'approved';
  }

  // -------------------------------------------------------------------------
  // Presence — coalesced locally, then deduped across instances so N boxes
  // produce one packet per tick, not N.
  // -------------------------------------------------------------------------
  function schedulePresence(liveId) {
    const l = localOf(liveId);
    if (l.presenceTimer) return;
    l.presenceTimer = setTimeout(async () => {
      l.presenceTimer = null;
      try {
        const room = await store.getRoom(liveId);
        if (!room || room.status !== 'live') return;
        const count = await store.viewerCount(liveId);
        if (count === l.lastBroadcastViewers) return;
        l.lastBroadcastViewers = count;
        await store.maxRoom(liveId, 'peakViewers', count);
        if (!await store.claimBroadcast(liveId, PRESENCE_LOCK_MS)) return;
        io.to(`live:${liveId}`).emit('live:viewers', { liveId, count });
        if (room.hostSocketId) {
          io.to(room.hostSocketId).emit('live:stats', await hostStats(await store.getRoom(liveId)));
        }
      } catch (e) {
        console.error('[live] presence flush', e.message);
      }
    }, PRESENCE_FLUSH_MS);
    if (l.presenceTimer.unref) l.presenceTimer.unref();
  }

  // -------------------------------------------------------------------------
  // Reactions — each instance aggregates its own viewers' taps into one packet.
  // -------------------------------------------------------------------------
  function scheduleReactions(liveId) {
    const l = localOf(liveId);
    if (l.reactionTimer) return;
    l.reactionTimer = setTimeout(async () => {
      l.reactionTimer = null;
      const burst = l.reactionBuffer;
      l.reactionBuffer = { count: 0, colors: [] };
      if (!burst.count) return;
      try {
        const total = await store.incrRoom(liveId, 'likes', burst.count);
        persistence?.recordReactions?.(liveId, burst.count);
        io.to(`live:${liveId}`).emit('live:reaction', {
          liveId,
          count: Math.min(burst.count, 40),
          colors: burst.colors.slice(0, 6),
          totalLikes: total,
        });
      } catch (e) {
        console.error('[live] reaction flush', e.message);
      }
    }, REACTION_FLUSH_MS);
    if (l.reactionTimer.unref) l.reactionTimer.unref();
  }

  // -------------------------------------------------------------------------
  // Gift ledger — append only.
  // -------------------------------------------------------------------------
  async function recordGiftTransaction(tx) {
    ensureShape();
    localDb.live_gift_tx.push(tx);
    if (localDb.live_gift_tx.length > 5000) {
      localDb.live_gift_tx = localDb.live_gift_tx.slice(-3000);
    }
    saveLocalDb?.();
    if (supabase) {
      try {
        await supabase.from('mm_live_gift_tx').insert({
          id: tx.id,
          live_id: tx.liveId,
          nonce: tx.nonce,
          sender_key: tx.senderKey,
          sender_name: tx.senderName,
          receiver_creator_id: tx.receiverCreatorId,
          gift_id: tx.giftId,
          gift_name: tx.giftName,
          coin_cost: tx.coinCost,
          creator_share: tx.creatorShare,
          combo_count: tx.comboCount,
          target_side: tx.targetSide,
          created_at: new Date(tx.at).toISOString(),
        });
      } catch { /* ledger stays local if Supabase rejects */ }
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------
  async function startLive({ creator, socketId, title, wallpaperUrl }) {
    if (!canCreatorGoLive(creator)) {
      return { ok: false, error: 'Only approved creators can go live right now.' };
    }
    if (!livekitRooms.isConfigured()) {
      return { ok: false, error: 'Live streaming is not configured (LiveKit).' };
    }
    for (const r of await store.listActive()) {
      if (r.creatorId === creator.id && r.status === 'live') {
        // Resume the existing live instead of 400 — common after a Safari
        // tab freeze / socket blip left the room open.
        await store.updateRoom(r.id, {
          hostSocketId: socketId,
          hostInstance: INSTANCE,
          ...(title ? { title: String(title).slice(0, 80) } : {}),
          ...(wallpaperUrl ? { wallpaperUrl } : {}),
        });
        const l = localOf(r.id);
        l.hosted = true;
        const fresh = await store.getRoom(r.id);
        return {
          ok: true,
          resumed: true,
          live: publicLive(fresh || r, await store.viewerCount(r.id)),
        };
      }
    }

    const id = generateId?.() || rid(8);
    const wall = wallpaperUrl || creator.live_wallpaper_url || null;
    if (wallpaperUrl && wallpaperUrl !== creator.live_wallpaper_url) {
      await persistWallpaper(creator.id, wallpaperUrl);
    }

    const room = {
      id,
      creatorId: creator.id,
      handle: creator.handle_name,
      displayName: creator.display_name || creator.handle_name,
      avatarUrl: creator.avatar_url || null,
      verified: creator.status === 'approved',
      hostSocketId: socketId,
      hostInstance: INSTANCE,
      title: String(title || `${creator.handle_name} Live`).slice(0, 80),
      wallpaperUrl: wall,
      roomName: `live_${id}`,
      startedAt: nowMs(),
      status: 'live',
      battleId: null,
      guestSocketId: null,
      pinnedComment: null,
      commentsDisabled: false,
      slowModeMs: 0,
      levelBadge: null,
      displayLevel: 0,
      likes: 0,
      giftCount: 0,
      coinsGross: 0,
      nutsEarned: 0,
      peakViewers: 0,
      recentGift: null,
    };

    await store.createRoom(room);
    const l = localOf(id);
    l.hosted = true;

    ensureShape();
    localDb.live_streams.push({
      id, creator_id: creator.id, handle: creator.handle_name,
      title: room.title, started_at: room.startedAt, status: 'live',
    });
    saveLocalDb?.();
    persistence?.openStream?.(room);

    audit?.('live_start', { liveId: id, creatorId: creator.id, handle: creator.handle_name });
    io.emit('live:list-updated', { lives: await listActive() });

    // Ping followers who are online so they can hop into the room.
    try { await notifyGoLive(creator, room); } catch (e) { console.error('[live] notifyGoLive', e.message); }

    return { ok: true, live: publicLive(room, 0) };
  }

  /**
   * Tell this creator's online followers that they went live. We resolve the
   * follower keys from the social graph, then map each key to any connected
   * socket by matching its audio identity or creator persona.
   */
  async function notifyGoLive(creator, room) {
    const payload = {
      liveId: room.id,
      creatorId: creator.id,
      handle: creator.handle_name,
      displayName: room.displayName,
      avatarUrl: room.avatarUrl,
      title: room.title,
      startedAt: room.startedAt,
    };

    // The host app may own the fan-out (push notifications, cross-instance,
    // etc.). When it provides notifyFollowers we defer to it to avoid emitting
    // the same event twice; otherwise we fan out here from the social graph.
    if (typeof notifyFollowers === 'function') {
      try { await notifyFollowers(creator, payload); } catch (e) { console.error('[live] notifyFollowers dep', e.message); }
      return;
    }

    if (socialFollow?.listFollowers) {
      const targetKey = socialFollow.makeKey
        ? socialFollow.makeKey('creator', creator.id)
        : `creator:${creator.id}`;
      const followerKeys = new Set(socialFollow.listFollowers(targetKey) || []);
      if (followerKeys.size) {
        try {
          for (const socket of io.sockets.sockets.values()) {
            const u = users?.get?.(socket.id);
            if (!u) continue;
            const uname = u.audioIdentity?.username
              ? `audio:${String(u.audioIdentity.username).toLowerCase()}` : null;
            const ckey = (u.isCreator && u.creatorData?.id) ? `creator:${u.creatorData.id}` : null;
            if ((uname && followerKeys.has(uname)) || (ckey && followerKeys.has(ckey))) {
              socket.emit('live:creator-started', payload);
            }
          }
        } catch (e) { console.error('[live] follower fanout', e.message); }
      }
    }
  }

  async function persistWallpaper(creatorId, url) {
    ensureShape();
    if (supabase) {
      await supabase.from('creators').update({ live_wallpaper_url: url }).eq('id', creatorId);
    }
    const c = (localDb.creators || []).find((x) => x.id === creatorId);
    if (c) { c.live_wallpaper_url = url; saveLocalDb?.(); }
  }

  async function endSummary(room) {
    const [unique, top] = await Promise.all([
      store.uniqueCount(room.id),
      store.topGifters(room.id, 1),
    ]);
    const t = top[0];
    return {
      liveId: room.id,
      handle: room.handle,
      displayName: room.displayName,
      avatarUrl: room.avatarUrl,
      creatorId: room.creatorId,
      durationMs: nowMs() - (room.startedAt || nowMs()),
      peakViewers: room.peakViewers || 0,
      totalViewers: unique,
      likes: room.likes || 0,
      giftCount: room.giftCount || 0,
      coinsReceived: room.coinsGross || 0,
      nutsEarned: room.nutsEarned || 0,
      topGifter: t ? { username: t.username, coins: t.coins, avatarUrl: t.avatarUrl || null } : null,
    };
  }

  async function endLive(liveId, reason = 'ended') {
    const room = await store.getRoom(liveId);
    if (!room) return { ok: false, error: 'Live not found' };

    await store.updateRoom(liveId, { status: 'ended' });
    if (room.battleId) await endBattle(room.battleId, 'live_ended');

    const summary = await endSummary(room);
    io.to(`live:${liveId}`).emit('live:ended', { liveId, reason, summary });

    // Flush analytics BEFORE the room keys go away.
    await persistence?.closeStream?.(room, summary, {
      viewers: await store.listViewers(liveId, VIEWER_LIST_MAX),
      topGifters: await store.topGifters(liveId, 20),
      moderators: await store.members('mods', liveId),
    });

    await store.deleteRoom(liveId);
    clearLocal(liveId);

    ensureShape();
    const row = (localDb.live_streams || []).find((r) => r.id === liveId);
    if (row) {
      row.status = 'ended';
      row.ended_at = nowMs();
      row.nuts_earned = summary.nutsEarned;
      row.peak_viewers = summary.peakViewers;
      row.likes = summary.likes;
      row.gift_count = summary.giftCount;
    }
    saveLocalDb?.();

    audit?.('live_end', { liveId, reason, nutsEarned: summary.nutsEarned });
    io.emit('live:list-updated', { lives: await listActive() });
    return { ok: true, summary };
  }

  async function joinViewer(room, socket) {
    if (!room || room.status !== 'live') return { ok: false, error: 'Live is offline' };
    const profile = viewerProfile(socket);
    if (await store.has('blocked', room.id, socket.id)
      || (profile.ip && await store.has('blocked', room.id, profile.ip))) {
      return { ok: false, error: 'You cannot join this live' };
    }

    await store.addViewer(room.id, socket.id, profile);
    await store.markUnique(room.id, profile.key || profile.ip);
    schedulePresence(room.id);

    const [comments, top, moderator] = await Promise.all([
      store.recentComments(room.id, COMMENT_HISTORY),
      store.topGifters(room.id, 1),
      isModSocket(room, socket),
    ]);

    io.to(`live:${room.id}`).emit('live:viewer-joined', {
      liveId: room.id,
      username: profile.username,
      nameColor: profile.nameColor,
      avatarUrl: profile.avatarUrl,
      badges: await badgesFor(room, profile, top[0]?.key),
    });

    return {
      ok: true,
      live: publicLive(room, await store.viewerCount(room.id)),
      comments,
      pinnedComment: room.pinnedComment || null,
      isModerator: moderator,
      isHost: isHostSocket(room, socket),
      topGifter: top[0] ? { username: top[0].username, coins: top[0].coins, avatarUrl: top[0].avatarUrl || null } : null,
      stats: moderator ? await hostStats(room) : null,
    };
  }

  async function leaveViewer(liveId, socketId) {
    const viewer = await store.getViewer(liveId, socketId);
    await store.removeViewer(liveId, socketId);
    if (viewer) persistence?.recordWatch?.(liveId, viewer);
    schedulePresence(liveId);
  }

  // -------------------------------------------------------------------------
  // Gift send — the only place coins move.
  // -------------------------------------------------------------------------
  async function sendGift(room, socket, { giftId, targetSide = 'A', nonce }) {
    if (!room || room.status !== 'live') return { ok: false, error: 'Live is offline' };

    const gift = GIFT_BY_ID.get(String(giftId || ''));
    if (!gift) return { ok: false, error: 'Unknown gift' };

    const walletKey = walletKeyOf(socket);
    if (!walletKey) return { ok: false, error: 'Sign in with your PIN to send gifts', needAuth: true };

    // Replay protection. SET NX PX means exactly one instance can win a nonce,
    // so a retried packet cannot double-charge even under a load balancer.
    const n = String(nonce || '').slice(0, 64);
    if (n && !await store.claimNonce(walletKey, n, NONCE_TTL_MS)) {
      return { ok: false, error: 'Duplicate gift ignored', duplicate: true };
    }

    if (!limiters.gift.check(`${room.id}:${walletKey}`).ok) {
      return { ok: false, error: 'Sending too fast — slow down' };
    }

    const debit = await audioIdentity.debit(walletKey, gift.cost, `live_gift:${gift.id}`, {
      liveId: room.id, giftId: gift.id,
    });
    if (!debit?.ok) {
      const insufficient = /not enough/i.test(debit?.error || '');
      return {
        ok: false,
        error: insufficient ? 'Not enough coins' : (debit?.error || 'Gift failed'),
        insufficient,
        needed: gift.cost,
        balance: debit?.balance,
      };
    }

    const share = Math.floor(gift.cost * (gift.creatorShare || creatorSharePct()));
    let receiverCreatorId = room.creatorId;

    if (room.battleId) {
      const battle = await store.getBlob(`battle:${room.battleId}`);
      if (battle) {
        const side = targetSide === 'B' ? 'B' : 'A';
        const targetRoom = await store.getRoom(side === 'B' ? battle.liveB : battle.liveA);
        if (targetRoom) receiverCreatorId = targetRoom.creatorId;
        if (side === 'B') battle.scoreB += gift.cost; else battle.scoreA += gift.cost;
        await store.setBlob(`battle:${battle.id}`, battle, BATTLE_DURATION_MS * 2);
        const payload = { battle };
        io.to(`live:${battle.liveA}`).emit('live:battle:score', payload);
        io.to(`live:${battle.liveB}`).emit('live:battle:score', payload);
      }
    }

    const profile = (await store.getViewer(room.id, socket.id)) || viewerProfile(socket);
    const combo = await store.bumpCombo(room.id, walletKey, gift.id, COMBO_WINDOW_MS);

    const tx = {
      id: rid(10),
      liveId: room.id,
      nonce: n || null,
      senderKey: walletKey,
      senderName: profile.username,
      receiverCreatorId,
      giftId: gift.id,
      giftName: gift.name,
      coinCost: gift.cost,
      creatorShare: share,
      comboCount: combo.count,
      targetSide,
      at: nowMs(),
    };
    await recordGiftTransaction(tx);

    if (typeof creditCreatorCoins === 'function') {
      const creatorRow = (localDb.creators || []).find((c) => c.id === receiverCreatorId);
      if (creatorRow) {
        try { await creditCreatorCoins(receiverCreatorId, share, `live_gift:${gift.id}`, creatorRow); }
        catch { /* the ledger already holds the truth */ }
      }
    }
    try {
      const market = typeof getMarket === 'function' ? getMarket() : null;
      market?.recordGiftEarnings?.({
        id: tx.id,
        giftId: gift.id,
        giftName: gift.name,
        liveId: room.id,
        senderKey: walletKey,
        creatorId: receiverCreatorId,
        giftCoins: gift.cost,
        creatorSharePct: gift.creatorShare || creatorSharePct(),
        creatorCoins: share,
        marketRate: market.getRate?.(),
      });
    } catch { /* market is optional */ }
    try { await audioIdentity.giftXp?.(walletKey, gift.cost, share); } catch { /* */ }

    const recentGift = {
      username: profile.username, giftId: gift.id, giftName: gift.name,
      icon: gift.icon, coins: gift.cost, at: tx.at,
    };
    await Promise.all([
      store.incrRoom(room.id, 'nutsEarned', share),
      store.incrRoom(room.id, 'giftCount', 1),
      store.incrRoom(room.id, 'coinsGross', gift.cost),
      store.updateRoom(room.id, { recentGift: JSON.stringify(recentGift) }),
      store.bumpGifter(room.id, walletKey, {
        username: profile.username,
        nameColor: profile.nameColor,
        avatarUrl: profile.avatarUrl,
      }, gift.cost),
    ]);

    const top = await store.topGifters(room.id, 1);
    const payload = {
      liveId: room.id,
      txId: tx.id,
      comboId: combo.id,
      comboCount: combo.count,
      gift: {
        id: gift.id, name: gift.name, icon: gift.icon,
        cost: gift.cost, tier: gift.tier, category: gift.category,
      },
      from: profile.username,
      fromKey: walletKey,
      avatarUrl: profile.avatarUrl,
      nameColor: profile.nameColor,
      levelBadge: profile.levelBadge,
      displayLevel: profile.displayLevel,
      badges: await badgesFor(room, profile, top[0]?.key),
      targetSide,
      anim: gift.anim || gift.tier,
      fullscreen: FULLSCREEN_TIERS.has(gift.anim || gift.tier),
      at: tx.at,
    };
    io.to(`live:${room.id}`).emit('live:gift', payload);

    if (room.battleId) {
      const battle = await store.getBlob(`battle:${room.battleId}`);
      const other = battle && (targetSide === 'A' ? battle.liveB : battle.liveA);
      if (other && other !== room.id) io.to(`live:${other}`).emit('live:gift', payload);
    }

    io.to(`live:${room.id}`).emit('live:top-gifter', {
      liveId: room.id,
      topGifter: top[0] ? { username: top[0].username, coins: top[0].coins, avatarUrl: top[0].avatarUrl || null } : null,
    });
    if (room.hostSocketId) {
      io.to(room.hostSocketId).emit('live:stats', await hostStats(await store.getRoom(room.id)));
    }

    return { ok: true, balance: debit.balance, identity: debit.identity, txId: tx.id, comboCount: combo.count };
  }

  // -------------------------------------------------------------------------
  // Battles
  // -------------------------------------------------------------------------
  async function startBattle(liveIdA, liveIdB) {
    const [a, b] = await Promise.all([store.getRoom(liveIdA), store.getRoom(liveIdB)]);
    if (!a || !b || a.status !== 'live' || b.status !== 'live') {
      return { ok: false, error: 'Both lives must be active' };
    }
    if (a.battleId || b.battleId) return { ok: false, error: 'Already in a battle' };

    const id = generateId?.() || rid(6);
    const battle = {
      id, liveA: a.id, liveB: b.id, handleA: a.handle, handleB: b.handle,
      scoreA: 0, scoreB: 0, startedAt: nowMs(),
      endsAt: nowMs() + BATTLE_DURATION_MS, status: 'active',
    };
    await store.setBlob(`battle:${id}`, battle, BATTLE_DURATION_MS * 2);
    await Promise.all([
      store.updateRoom(a.id, { battleId: id }),
      store.updateRoom(b.id, { battleId: id }),
    ]);

    const payload = { battle };
    io.to(`live:${a.id}`).emit('live:battle:start', payload);
    io.to(`live:${b.id}`).emit('live:battle:start', payload);
    const t = setTimeout(() => { void endBattle(id, 'timeout'); }, BATTLE_DURATION_MS + 500);
    if (t.unref) t.unref();
    return { ok: true, battle };
  }

  async function endBattle(battleId, reason = 'ended') {
    const battle = await store.getBlob(`battle:${battleId}`);
    if (!battle || battle.status !== 'active') return { ok: false };
    battle.status = 'ended';
    battle.reason = reason;
    battle.endedAt = nowMs();
    battle.winner = battle.scoreA === battle.scoreB ? null : (battle.scoreA > battle.scoreB ? 'A' : 'B');

    await Promise.all([
      store.updateRoom(battle.liveA, { battleId: null }),
      store.updateRoom(battle.liveB, { battleId: null }),
    ]);
    const payload = { battle };
    io.to(`live:${battle.liveA}`).emit('live:battle:end', payload);
    io.to(`live:${battle.liveB}`).emit('live:battle:end', payload);
    await store.delBlob(`battle:${battleId}`);
    return { ok: true, battle };
  }

  // -------------------------------------------------------------------------
  // Heartbeat + orphan sweeper
  //
  // The host's instance refreshes its room's TTL. If that instance dies, the
  // keys expire, and whichever instance wins the sweep lock tells the room the
  // live is over instead of leaving a ghost in the feed forever.
  // -------------------------------------------------------------------------
  const heartbeat = setInterval(async () => {
    for (const [liveId, l] of local) {
      if (!l.hosted) continue;
      try { await store.touchRoom(liveId); } catch { /* */ }
    }
  }, HEARTBEAT_MS);
  if (heartbeat.unref) heartbeat.unref();

  const sweeper = setInterval(async () => {
    try {
      if (!store.isRedis()) return;
      if (!await store.claimSweep(SWEEP_MS - 5000)) return;
      for (const liveId of await store.staleRooms()) {
        io.to(`live:${liveId}`).emit('live:ended', {
          liveId, reason: 'host_lost', summary: null,
        });
        await store.deleteRoom(liveId);
        clearLocal(liveId);
        audit?.('live_orphan_swept', { liveId });
      }
    } catch (e) {
      console.error('[live] sweep', e.message);
    }
  }, SWEEP_MS);
  if (sweeper.unref) sweeper.unref();

  // -------------------------------------------------------------------------
  // REST
  // -------------------------------------------------------------------------
  app.get('/api/lives', async (_req, res) => {
    try {
      res.json({
        ok: true,
        lives: await listActive(),
        livekit: livekitRooms.statusPayload(),
        scaling: store.isRedis() ? 'redis' : 'single-instance',
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'List failed' });
    }
  });

  app.get('/api/lives/:id', async (req, res) => {
    const room = await store.getRoom(req.params.id);
    if (!room) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, live: publicLive(room, await store.viewerCount(room.id)) });
  });

  app.get('/api/lives/:id/stats', async (req, res) => {
    try {
      const room = await store.getRoom(req.params.id);
      if (!room) return res.status(404).json({ ok: false, error: 'Not found' });
      const { creator, via } = await getCreatorForRequest(req);
      const isHost = creator && via === 'session' && creator.id === room.creatorId;
      if (!isHost && !req.adminAuthed && !req.agencyAuthed) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
      res.json({ ok: true, stats: await hostStats(room) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Stats failed' });
    }
  });

  app.post('/api/lives/start', async (req, res) => {
    try {
      const { creator, via } = await getCreatorForRequest(req);
      if (!creator || via !== 'session') {
        return res.status(401).json({
          ok: false,
          error: 'Creator secure login required. Open Creator Hub and log in again.',
        });
      }
      if (!canCreatorGoLive(creator)) {
        return res.status(403).json({
          ok: false,
          error: creator.status === 'pending'
            ? 'Your application is still pending approval.'
            : 'Only approved creators can go live.',
        });
      }
      const titleRaw = String(req.body?.title || '').trim();
      if (titleRaw && (titleRaw.length < 2 || titleRaw.length > 80)) {
        return res.status(400).json({ ok: false, error: 'Live title must be 2–80 characters.' });
      }
      const socketId = String(req.body?.socketId || '');
      if (!socketId) return res.status(400).json({ ok: false, error: 'Socket connection required to go live.' });
      if (!users?.get?.(socketId)) {
        return res.status(400).json({ ok: false, error: 'Socket not connected — refresh and try again.' });
      }
      const result = await startLive({
        creator, socketId,
        title: titleRaw || undefined,
        wallpaperUrl: req.body?.wallpaperUrl,
      });
      if (!result.ok) return res.status(400).json(result);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Start failed' });
    }
  });

  app.post('/api/lives/:id/end', async (req, res) => {
    try {
      const room = await store.getRoom(req.params.id);
      if (!room) return res.status(404).json({ ok: false, error: 'Not found' });
      const { creator, via } = await getCreatorForRequest(req);
      const isHost = creator && via === 'session' && creator.id === room.creatorId;
      if (!isHost && !(req.agencyAuthed || req.adminAuthed)) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
      res.json(await endLive(room.id));
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'End failed' });
    }
  });

  app.post('/api/lives/wallpaper', async (req, res) => {
    try {
      const { creator, via } = await getCreatorForRequest(req);
      if (!creator || via !== 'session') {
        return res.status(401).json({ ok: false, error: 'Creator secure login required' });
      }
      if (creator.status !== 'approved' && !canCreatorGoLive(creator)) {
        return res.status(403).json({ ok: false, error: 'Approved creator required' });
      }
      const url = String(req.body?.wallpaperUrl || '').trim().slice(0, 500000);
      if (!url) return res.status(400).json({ ok: false, error: 'wallpaperUrl required' });
      if (!url.startsWith('data:image/') && !/^https:\/\//i.test(url)) {
        return res.status(400).json({ ok: false, error: 'Wallpaper must be https or image data URL' });
      }
      await persistWallpaper(creator.id, url);
      res.json({ ok: true, wallpaperUrl: url });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Save failed' });
    }
  });

  app.post('/api/lives/battle/start', async (req, res) => {
    try {
      const result = await startBattle(String(req.body?.liveIdA || ''), String(req.body?.liveIdB || ''));
      if (!result.ok) return res.status(400).json(result);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Battle failed' });
    }
  });

  app.post('/api/lives/battle/:id/end', async (req, res) => {
    res.json(await endBattle(req.params.id, 'manual'));
  });

  // -------------------------------------------------------------------------
  // Socket handlers
  // -------------------------------------------------------------------------
  function attachSocketHandlers(socket) {
    const ip = socketIp(socket);

    const on = (evt, fn) => socket.on(evt, async (...args) => {
      const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
      try {
        await fn(...args);
      } catch (err) {
        console.error(`[live] ${evt}`, err.message);
        const payload = { ok: false, error: err.message || 'Error' };
        if (cb) cb(payload); else socket.emit('live:error', payload);
      }
    });

    const roomOf = (payload) => store.getRoom(String(payload?.liveId || ''));

    const requireMod = async (room, cb) => {
      if (!await isModSocket(room, socket)) {
        cb?.({ ok: false, error: 'Moderator only' });
        return false;
      }
      return true;
    };

    const requireHost = (room, cb) => {
      if (!isHostSocket(room, socket)) {
        cb?.({ ok: false, error: 'Host only' });
        return false;
      }
      return true;
    };

    // ---- presence ----------------------------------------------------------
    on('live:join', async (payload, cb) => {
      if (!limiters.join.check(ip).ok) {
        cb?.({ ok: false, error: 'Too many joins — wait a moment' });
        return;
      }
      const room = await roomOf(payload);
      if (!room) { cb?.({ ok: false, error: 'Live is offline' }); return; }
      const result = await joinViewer(room, socket);
      if (result.ok) socket.join(`live:${room.id}`);
      if (cb) cb(result); else if (!result.ok) socket.emit('live:error', result);
    });

    on('live:leave', async (payload) => {
      const liveId = String(payload?.liveId || '');
      if (!liveId) return;
      await leaveViewer(liveId, socket.id);
      socket.leave(`live:${liveId}`);
    });

    on('live:viewers:list', async (payload, cb) => {
      const room = await roomOf(payload);
      if (!room) { cb?.({ ok: false, error: 'Live is offline' }); return; }
      cb?.({ ok: true, viewers: await viewerList(room), total: await store.viewerCount(room.id) });
    });

    on('live:stats:get', async (payload, cb) => {
      const room = await roomOf(payload);
      if (!room) { cb?.({ ok: false, error: 'Live is offline' }); return; }
      if (!await requireMod(room, cb)) return;
      cb?.({ ok: true, stats: await hostStats(room) });
    });

    // ---- comments ----------------------------------------------------------
    on('live:comment', async (payload, cb) => {
      const room = await roomOf(payload);
      if (!room || room.status !== 'live') { cb?.({ ok: false, error: 'Live is offline' }); return; }

      const profile = (await store.getViewer(room.id, socket.id)) || viewerProfile(socket);
      const key = profile.key || ip;

      if (await store.has('blocked', room.id, socket.id) || await store.has('blocked', room.id, ip)) {
        cb?.({ ok: false, error: 'You cannot comment in this live' });
        return;
      }

      const moderator = await isModSocket(room, socket);

      if (room.commentsDisabled && !moderator) {
        const msg = 'Comments are turned off';
        cb?.({ ok: false, error: msg });
        socket.emit('live:error', { message: msg });
        return;
      }
      if (await store.has('muted', room.id, key)) {
        const msg = 'You are muted in this live';
        cb?.({ ok: false, error: msg });
        socket.emit('live:error', { message: msg });
        return;
      }
      if (room.slowModeMs && !moderator) {
        const last = await store.lastCommentAt(room.id, key);
        const wait = room.slowModeMs - (nowMs() - last);
        if (last && wait > 0) {
          const msg = `Slow mode — wait ${Math.ceil(wait / 1000)}s`;
          cb?.({ ok: false, error: msg });
          socket.emit('live:error', { message: msg });
          return;
        }
      }
      if (!moderator && !limiters.comment.check(`${room.id}:${key}`).ok) {
        cb?.({ ok: false, error: 'Slow down' });
        socket.emit('live:error', { message: 'Slow down' });
        return;
      }

      let text = sanitize
        ? sanitize(String(payload?.text || '').slice(0, COMMENT_MAX))
        : String(payload?.text || '').slice(0, COMMENT_MAX).replace(/[<>]/g, '');
      text = String(text || '').trim();
      if (!text) { cb?.({ ok: false, error: 'Empty' }); return; }

      const filtered = filterText(text, localOf(room.id).bannedWords);
      if (filtered.blocked) {
        text = filtered.masked;
        audit?.('live_comment_filtered', { liveId: room.id, key, hits: filtered.hits });
      }

      await store.stampComment(room.id, key, SLOW_STAMP_TTL_MS);

      const top = await store.topGifters(room.id, 1);
      const mention = String(payload?.mention || '').trim().replace(/^@/, '').slice(0, 30);
      const msg = {
        id: rid(6),
        liveId: room.id,
        text,
        username: profile.username,
        nameColor: profile.nameColor,
        levelBadge: profile.levelBadge,
        displayLevel: profile.displayLevel,
        avatarUrl: profile.avatarUrl,
        badges: await badgesFor(room, profile, top[0]?.key),
        mention: mention || null,
        socketId: socket.id,
        filtered: filtered.blocked,
        at: nowMs(),
      };
      await store.pushComment(room.id, msg);
      persistence?.recordComment?.(room.id, msg, profile.key);
      io.to(`live:${room.id}`).emit('live:comment', msg);
      cb?.({ ok: true, id: msg.id });
    });

    on('live:delete-comment', async (payload, cb) => {
      const room = await roomOf(payload);
      if (!room) { cb?.({ ok: false, error: 'Live offline' }); return; }
      if (!await requireMod(room, cb)) return;
      const commentId = String(payload?.commentId || '');
      await store.dropComment(room.id, commentId);
      persistence?.markCommentDeleted?.(commentId, walletKeyOf(socket) || 'host');
      if (room.pinnedComment?.id === commentId) {
        await store.updateRoom(room.id, { pinnedComment: null });
        io.to(`live:${room.id}`).emit('live:pinned', { liveId: room.id, pinnedComment: null });
      }
      io.to(`live:${room.id}`).emit('live:comment:deleted', { liveId: room.id, commentId });
      cb?.({ ok: true });
    });

    on('live:pin', async (payload, cb) => {
      const room = await roomOf(payload);
      if (!room) { cb?.({ ok: false, error: 'Live offline' }); return; }
      if (!await requireMod(room, cb)) return;
      const commentId = String(payload?.commentId || '');
      let pinned = null;
      if (commentId) {
        const found = await store.findComment(room.id, commentId);
        if (!found) { cb?.({ ok: false, error: 'Comment not found' }); return; }
        pinned = {
          id: found.id, text: found.text, username: found.username,
          nameColor: found.nameColor, at: nowMs(),
        };
      }
      await store.updateRoom(room.id, { pinnedComment: pinned });
      io.to(`live:${room.id}`).emit('live:pinned', { liveId: room.id, pinnedComment: pinned });
      cb?.({ ok: true, pinnedComment: pinned });
    });

    // ---- reactions ---------------------------------------------------------
    on('live:react', async (payload) => {
      const liveId = String(payload?.liveId || '');
      const room = await store.getRoom(liveId);
      if (!room || room.status !== 'live') return;
      const profile = (await store.getViewer(liveId, socket.id)) || viewerProfile(socket);
      const key = profile.key || ip;
      const count = clampInt(payload?.count, 1, 10, 1);
      if (!limiters.reaction.check(`${liveId}:${key}`).ok) return;
      const l = localOf(liveId);
      l.reactionBuffer.count += count;
      if (profile.nameColor && !l.reactionBuffer.colors.includes(profile.nameColor)) {
        l.reactionBuffer.colors.push(profile.nameColor);
      }
      scheduleReactions(liveId);
    });

    // ---- gifts -------------------------------------------------------------
    on('live:gift', async (payload, cb) => {
      const room = await roomOf(payload);
      if (!room) {
        const err = { ok: false, error: 'Live is offline' };
        if (cb) cb(err); else socket.emit('live:error', { message: err.error });
        return;
      }
      const result = await sendGift(room, socket, {
        giftId: payload?.giftId,
        targetSide: payload?.targetSide,
        nonce: payload?.nonce,
      });
      if (cb) cb(result);
      if (result.ok) socket.emit('live:gift:sent', result);
      else socket.emit('live:error', { message: result.error, insufficient: result.insufficient, needAuth: result.needAuth });
    });

    // ---- follow ------------------------------------------------------------
    on('live:follow', async (payload, cb) => {
      const room = await roomOf(payload);
      if (!room) { cb?.({ ok: false, error: 'Live offline' }); return; }
      if (!limiters.follow.check(`${room.id}:${ip}`).ok) {
        cb?.({ ok: false, error: 'Too many follow requests' });
        return;
      }
      const profile = (await store.getViewer(room.id, socket.id)) || viewerProfile(socket);
      io.to(`live:${room.id}`).emit('live:follow', {
        liveId: room.id,
        username: profile.username,
        nameColor: profile.nameColor,
        avatarUrl: profile.avatarUrl,
        at: nowMs(),
      });
      cb?.({ ok: true });
    });

    // ---- moderation --------------------------------------------------------
    on('live:mute', async (payload, cb) => {
      const room = await roomOf(payload);
      if (!room) { cb?.({ ok: false, error: 'Live offline' }); return; }
      if (!await requireMod(room, cb)) return;
      const targetSocketId = String(payload?.targetSocketId || '');
      const target = await store.getViewer(room.id, targetSocketId);
      const key = target?.key || targetSocketId;
      const muted = !payload?.unmute;
      if (muted) await store.addTo('muted', room.id, key);
      else await store.removeFrom('muted', room.id, key);
      io.to(targetSocketId).emit('live:muted', { liveId: room.id, muted });
      io.to(`live:${room.id}`).emit('live:moderation', {
        liveId: room.id, action: muted ? 'mute' : 'unmute', targetSocketId,
      });
      audit?.('live_mute', { liveId: room.id, key, muted });
      cb?.({ ok: true, muted });
    });

    on('live:slow-mode', async (payload, cb) => {
      const room = await roomOf(payload);
      if (!room) { cb?.({ ok: false, error: 'Live offline' }); return; }
      if (!await requireMod(room, cb)) return;
      const slowModeMs = clampInt(payload?.seconds, 0, 120, 0) * 1000;
      await store.updateRoom(room.id, { slowModeMs });
      io.to(`live:${room.id}`).emit('live:settings', {
        liveId: room.id, slowModeMs, commentsDisabled: !!room.commentsDisabled,
      });
      cb?.({ ok: true, slowModeMs });
    });

    on('live:comments-toggle', async (payload, cb) => {
      const room = await roomOf(payload);
      if (!room) { cb?.({ ok: false, error: 'Live offline' }); return; }
      if (!await requireMod(room, cb)) return;
      const commentsDisabled = !!payload?.disabled;
      await store.updateRoom(room.id, { commentsDisabled });
      io.to(`live:${room.id}`).emit('live:settings', {
        liveId: room.id, slowModeMs: room.slowModeMs || 0, commentsDisabled,
      });
      cb?.({ ok: true, commentsDisabled });
    });

    on('live:promote-mod', async (payload, cb) => {
      const room = await roomOf(payload);
      if (!room) { cb?.({ ok: false, error: 'Live offline' }); return; }
      if (!requireHost(room, cb)) return;
      const targetSocketId = String(payload?.targetSocketId || '');
      const target = await store.getViewer(room.id, targetSocketId);
      if (!target?.key) { cb?.({ ok: false, error: 'That viewer is not signed in' }); return; }
      const promote = !payload?.demote;
      if (promote) await store.addTo('mods', room.id, target.key);
      else await store.removeFrom('mods', room.id, target.key);
      persistence?.recordModerator?.(room.creatorId, target.key, promote);
      io.to(targetSocketId).emit('live:role', { liveId: room.id, isModerator: promote });
      cb?.({ ok: true, isModerator: promote });
    });

    async function removeViewer(room, targetSocketId, { block }) {
      const target = await store.getViewer(room.id, targetSocketId);
      await store.addTo('blocked', room.id, targetSocketId);
      if (block && target?.ip) await store.addTo('blocked', room.id, String(target.ip));
      await leaveViewer(room.id, targetSocketId);
      try {
        const s = io.sockets.sockets.get(targetSocketId);
        s?.leave(`live:${room.id}`);
      } catch { /* the socket may live on another instance */ }
      // Emitting to the socket id works cross-instance through the adapter.
      io.to(targetSocketId).emit(block ? 'live:blocked' : 'live:kicked', {
        liveId: room.id,
        reason: block ? 'Blocked by host' : 'Removed by host',
      });
      io.to(`live:${room.id}`).emit('live:moderation', {
        liveId: room.id, action: block ? 'block' : 'kick', targetSocketId,
      });
    }

    on('live:kick', async (payload, cb) => {
      const room = await roomOf(payload);
      if (!room) { cb?.({ ok: false, error: 'Live offline' }); return; }
      if (!await requireMod(room, cb)) return;
      const targetSocketId = String(payload?.targetSocketId || '');
      if (!targetSocketId || targetSocketId === socket.id) { cb?.({ ok: false, error: 'Invalid target' }); return; }
      await removeViewer(room, targetSocketId, { block: false });
      audit?.('live_kick', { liveId: room.id, targetSocketId });
      cb?.({ ok: true });
    });

    on('live:block', async (payload, cb) => {
      const room = await roomOf(payload);
      if (!room) { cb?.({ ok: false, error: 'Live offline' }); return; }
      if (!await requireMod(room, cb)) return;
      const targetSocketId = String(payload?.targetSocketId || '');
      if (!targetSocketId || targetSocketId === socket.id) { cb?.({ ok: false, error: 'Invalid target' }); return; }
      await removeViewer(room, targetSocketId, { block: true });
      audit?.('live_block', { liveId: room.id, targetSocketId });
      cb?.({ ok: true });
    });

    on('live:report', async (payload, cb) => {
      const room = await roomOf(payload);
      if (!room) { cb?.({ ok: false, error: 'Live offline' }); return; }
      if (!limiters.report.check(ip).ok) { cb?.({ ok: false, error: 'Too many reports' }); return; }
      const reporter = (await store.getViewer(room.id, socket.id)) || viewerProfile(socket);
      const report = {
        id: rid(8),
        liveId: room.id,
        creatorId: room.creatorId,
        targetSocketId: String(payload?.targetSocketId || '') || null,
        targetUsername: String(payload?.targetUsername || '').slice(0, 40) || null,
        reason: String(payload?.reason || 'other').slice(0, 40),
        note: String(payload?.note || '').slice(0, 300),
        reporterKey: reporter.key,
        reporterIp: ip,
        at: nowMs(),
      };
      ensureShape();
      localDb.live_reports.push(report);
      saveLocalDb?.();
      if (supabase) {
        supabase.from('mm_live_reports').insert({
          id: report.id, live_id: report.liveId, creator_id: report.creatorId,
          target_username: report.targetUsername, reason: report.reason,
          note: report.note, reporter_key: report.reporterKey,
        }).then(() => {}, () => {});
      }
      audit?.('live_report', report);
      cb?.({ ok: true });
    });

    // ---- HP battle invites -------------------------------------------------
    // The room this socket is currently hosting (a creator hosts at most one).
    async function myHostedRoom() {
      for (const r of await store.listActive()) {
        if (r.status === 'live' && isHostSocket(r, socket)) return r;
      }
      return null;
    }

    // List other live rooms a host can challenge to an HP battle.
    on('live:hp-list', async (_payload, cb) => {
      const mine = await myHostedRoom();
      const rooms = await store.listActive();
      const out = [];
      for (const r of rooms) {
        if (r.status !== 'live') continue;
        if (mine && r.id === mine.id) continue;
        if (mine && r.creatorId === mine.creatorId) continue;
        if (r.battleId) continue;                       // already battling
        out.push({
          id: r.id,
          handle: r.handle,
          title: r.title,
          viewerCount: await store.viewerCount(r.id),
        });
      }
      cb?.({ ok: true, lives: out });
    });

    on('live:hp-invite', async (payload, cb) => {
      const mine = await myHostedRoom();
      if (!mine) { cb?.({ ok: false, error: 'Start your live first' }); return; }
      const target = await store.getRoom(String(payload?.targetLiveId || ''));
      if (!target || target.status !== 'live') { cb?.({ ok: false, error: 'That live is offline' }); return; }
      if (target.id === mine.id || target.creatorId === mine.creatorId) {
        cb?.({ ok: false, error: 'Cannot battle yourself' }); return;
      }
      if (mine.battleId || target.battleId) { cb?.({ ok: false, error: 'Already in a battle' }); return; }
      if (!target.hostSocketId) { cb?.({ ok: false, error: 'Opponent host is not reachable' }); return; }
      io.to(target.hostSocketId).emit('live:hp-invite', {
        fromLiveId: mine.id,
        handle: mine.handle,
        displayName: mine.displayName,
        avatarUrl: mine.avatarUrl,
        targetLiveId: target.id,
        at: nowMs(),
      });
      audit?.('live_hp_invite', { fromLiveId: mine.id, targetLiveId: target.id });
      cb?.({ ok: true });
    });

    on('live:hp-accept', async (payload, cb) => {
      const mine = await myHostedRoom();
      if (!mine) { cb?.({ ok: false, error: 'Start your live first' }); return; }
      const fromLiveId = String(payload?.fromLiveId || '');
      const from = await store.getRoom(fromLiveId);
      if (!from || from.status !== 'live') { cb?.({ ok: false, error: 'Inviter is no longer live' }); return; }
      const result = await startBattle(fromLiveId, mine.id);
      if (!result.ok) { cb?.(result); return; }
      if (from.hostSocketId) {
        io.to(from.hostSocketId).emit('live:hp-accepted', { battle: result.battle, byLiveId: mine.id });
      }
      cb?.(result);
    });

    on('live:hp-decline', async (payload, cb) => {
      const mine = await myHostedRoom();
      const fromLiveId = String(payload?.fromLiveId || '');
      const from = await store.getRoom(fromLiveId);
      if (from?.hostSocketId) {
        io.to(from.hostSocketId).emit('live:hp-declined', {
          fromLiveId,
          byLiveId: mine?.id || null,
          handle: mine?.handle || null,
        });
      }
      cb?.({ ok: true });
    });

    // Both hosts must ask to rematch within REMATCH_WINDOW_MS to restart.
    on('live:battle-rematch', async (payload, cb) => {
      const mine = await myHostedRoom();
      if (!mine) { cb?.({ ok: false, error: 'Start your live first' }); return; }

      // Resolve the opponent: prefer battleId, else explicit opponentLiveId.
      let opponentLiveId = String(payload?.opponentLiveId || '');
      let key = String(payload?.battleId || '');
      if (!opponentLiveId && key) {
        const battle = await store.getBlob(`battle:${key}`);
        if (battle) opponentLiveId = battle.liveA === mine.id ? battle.liveB : battle.liveA;
      }
      if (!opponentLiveId) { cb?.({ ok: false, error: 'No opponent to rematch' }); return; }
      if (!key) key = [mine.id, opponentLiveId].sort().join(':');

      const opponent = await store.getRoom(opponentLiveId);
      if (!opponent || opponent.status !== 'live') { cb?.({ ok: false, error: 'Opponent is no longer live' }); return; }
      if (mine.battleId || opponent.battleId) { cb?.({ ok: false, error: 'Already in a battle' }); return; }

      const now = nowMs();
      const asks = rematchAsks.get(key) || {};
      // Drop stale asks outside the window.
      for (const k of Object.keys(asks)) if (now - asks[k] > REMATCH_WINDOW_MS) delete asks[k];
      asks[mine.id] = now;
      rematchAsks.set(key, asks);

      const bothAsked = asks[mine.id] && asks[opponentLiveId]
        && Math.abs(asks[mine.id] - asks[opponentLiveId]) <= REMATCH_WINDOW_MS;

      if (bothAsked) {
        rematchAsks.delete(key);
        const result = await startBattle(mine.id, opponentLiveId);
        if (!result.ok) { cb?.(result); return; }
        const payloadOut = { battle: result.battle, rematch: true };
        io.to(`live:${mine.id}`).emit('live:battle:start', payloadOut);
        io.to(`live:${opponentLiveId}`).emit('live:battle:start', payloadOut);
        cb?.(result);
        return;
      }

      // Notify the opponent host that a rematch was requested.
      if (opponent.hostSocketId) {
        io.to(opponent.hostSocketId).emit('live:battle-rematch', {
          fromLiveId: mine.id, handle: mine.handle, windowMs: REMATCH_WINDOW_MS, at: now,
        });
      }
      cb?.({ ok: true, pending: true, windowMs: REMATCH_WINDOW_MS });
    });

    // ---- co-live guest (mutual-follow gated) -------------------------------
    on('live:join-request', async (payload, cb) => {
      const room = await roomOf(payload);
      if (!room || room.status !== 'live') { cb?.({ ok: false, error: 'Live is offline' }); return; }
      if (room.guestSocketId) { cb?.({ ok: false, error: 'A guest is already on stage' }); return; }
      if (isHostSocket(room, socket)) { cb?.({ ok: false, error: 'You are the host' }); return; }

      const profile = (await store.getViewer(room.id, socket.id)) || viewerProfile(socket);
      const viewerKey = profile.key ? `audio:${profile.key}` : null;
      if (!viewerKey) { cb?.({ ok: false, error: 'Sign in to request co-live', needAuth: true }); return; }

      // Mutual follow between the viewer and the host creator is required.
      if (socialFollow?.isMutual) {
        const hostKey = socialFollow.makeKey
          ? socialFollow.makeKey('creator', room.creatorId)
          : `creator:${room.creatorId}`;
        if (!socialFollow.isMutual(viewerKey, hostKey)) {
          cb?.({ ok: false, error: 'You and the host must follow each other to join' });
          return;
        }
      }

      if (room.hostSocketId) {
        io.to(room.hostSocketId).emit('live:join-request', {
          liveId: room.id,
          socketId: socket.id,
          username: profile.username,
          avatarUrl: profile.avatarUrl,
          nameColor: profile.nameColor,
          key: profile.key,
          at: nowMs(),
        });
      }
      cb?.({ ok: true, pending: true });
    });

    on('live:join-accept', async (payload, cb) => {
      const room = await roomOf(payload);
      if (!room) { cb?.({ ok: false, error: 'Live offline' }); return; }
      if (!requireHost(room, cb)) return;
      const guestSocketId = String(payload?.socketId || '');
      if (!guestSocketId) { cb?.({ ok: false, error: 'guest socketId required' }); return; }
      const guest = await store.getViewer(room.id, guestSocketId);
      await store.updateRoom(room.id, { guestSocketId });
      io.to(guestSocketId).emit('live:join-accepted', { liveId: room.id });
      io.to(`live:${room.id}`).emit('live:guest-joined', {
        liveId: room.id,
        socketId: guestSocketId,
        username: guest?.username || 'Guest',
        avatarUrl: guest?.avatarUrl || null,
        nameColor: guest?.nameColor || null,
      });
      audit?.('live_guest_joined', { liveId: room.id, guestSocketId });
      cb?.({ ok: true });
    });

    on('live:join-decline', async (payload, cb) => {
      const room = await roomOf(payload);
      if (!room) { cb?.({ ok: false, error: 'Live offline' }); return; }
      if (!requireHost(room, cb)) return;
      const guestSocketId = String(payload?.socketId || '');
      if (guestSocketId) io.to(guestSocketId).emit('live:join-declined', { liveId: room.id });
      cb?.({ ok: true });
    });

    on('live:guest-leave', async (payload, cb) => {
      const room = await roomOf(payload);
      if (!room) { cb?.({ ok: false, error: 'Live offline' }); return; }
      const guestSocketId = room.guestSocketId;
      // The guest themselves, or the host, can end the co-live.
      if (socket.id !== guestSocketId && !isHostSocket(room, socket)) {
        cb?.({ ok: false, error: 'Not allowed' }); return;
      }
      if (guestSocketId) {
        await store.updateRoom(room.id, { guestSocketId: null });
        io.to(`live:${room.id}`).emit('live:guest-left', { liveId: room.id, socketId: guestSocketId });
        audit?.('live_guest_left', { liveId: room.id, guestSocketId });
      }
      cb?.({ ok: true });
    });

    // ---- media token -------------------------------------------------------
    on('live:token', async (payload, cb) => {
      const room = await roomOf(payload);
      const asHost = !!payload?.asHost;
      const asGuest = !!payload?.asGuest;
      if (!room || room.status !== 'live') {
        const err = { ok: false, error: 'Live offline' };
        if (cb) cb(err); else socket.emit('live:error', err);
        return;
      }
      if (asHost && !isHostSocket(room, socket)) {
        // The client retries: on reconnect the creator:auth ack can land after
        // the first token request, and that is a race, not a rejection.
        const err = { ok: false, error: 'Only the host creator can publish', retryable: true };
        if (cb) cb(err); else socket.emit('live:error', err);
        return;
      }
      // A co-live guest may publish only after the host accepted them.
      const isGuestPublisher = asGuest && room.guestSocketId === socket.id;
      if (asGuest && !isGuestPublisher) {
        const err = { ok: false, error: 'Ask the host to bring you on stage first', retryable: true };
        if (cb) cb(err); else socket.emit('live:error', err);
        return;
      }
      if (asHost) {
        await store.updateRoom(room.id, { hostSocketId: socket.id, hostInstance: INSTANCE });
        const l = localOf(room.id);
        l.hosted = true;
        clearTimeout(l.hostGraceTimer);
        l.hostGraceTimer = null;
      }
      const canPublish = asHost || isGuestPublisher;
      const u = users?.get?.(socket.id);
      const tokenPayload = await livekitRooms.mintParticipantToken({
        socketId: socket.id,
        roomId: room.roomName,
        nickname: u?.audioIdentity?.username || u?.nickname || room.handle,
        country: u?.country || '',
        isCreator: asHost,
        canPublish,
        canSubscribe: true,
        roomAdmin: asHost,
      });
      const out = { ok: true, ...tokenPayload, liveId: room.id };
      if (cb) cb(out); else socket.emit('live:token', out);
    });

    // ---- disconnect --------------------------------------------------------
    socket.on('disconnect', async () => {
      try {
        // Only rooms this instance knows about — a disconnect here cannot
        // affect a room whose viewers live on another box.
        for (const [liveId, l] of local) {
          const viewer = await store.getViewer(liveId, socket.id);
          if (viewer) await leaveViewer(liveId, socket.id);

          const room = await store.getRoom(liveId);
          if (!room || room.status !== 'live') continue;

          // A co-live guest dropping off ends the co-live cleanly.
          if (room.guestSocketId === socket.id) {
            await store.updateRoom(liveId, { guestSocketId: null });
            io.to(`live:${liveId}`).emit('live:guest-left', { liveId, socketId: socket.id });
          }

          if (room.hostSocketId !== socket.id) continue;

          io.to(`live:${liveId}`).emit('live:host-reconnecting', { liveId, graceMs: HOST_GRACE_MS });
          const staleSocketId = socket.id;
          clearTimeout(l.hostGraceTimer);
          l.hostGraceTimer = setTimeout(async () => {
            const r = await store.getRoom(liveId);
            if (r && r.hostSocketId === staleSocketId && r.status === 'live') {
              await endLive(liveId, 'host_disconnect');
            }
          }, HOST_GRACE_MS);
          if (l.hostGraceTimer.unref) l.hostGraceTimer.unref();
        }
      } catch (e) {
        console.error('[live] disconnect', e.message);
      }
    });
  }

  function shutdown() {
    clearInterval(heartbeat);
    clearInterval(sweeper);
    for (const liveId of [...local.keys()]) clearLocal(liveId);
    return store.close?.();
  }

  return {
    listActive,
    getLive,
    startLive,
    endLive,
    startBattle,
    endBattle,
    attachSocketHandlers,
    publicLive,
    canCreatorGoLive,
    hostStats,
    viewerList,
    notifyGoLive,
    giftCutBreakdown,
    creatorSharePct,
    store,
    shutdown,
  };
}

module.exports = { registerLiveStreams };
