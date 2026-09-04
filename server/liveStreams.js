/**
 * In-app live streams — LiveKit host publish / viewer subscribe + Socket.IO chat/gifts/battles.
 */
const crypto = require('crypto');
const livekitRooms = require('./livekitRooms');
const { GIFTS } = require('./giftCatalog');

const COMMENT_MAX = 120;
const COMMENT_RATE = { max: 8, windowMs: 10000 };
const GIFT_RATE = { max: 6, windowMs: 8000 };
const BATTLE_DURATION_MS = 5 * 60 * 1000;

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
    rateLimit,
    audit,
  } = deps;

  const lives = new Map(); // liveId -> session
  const battles = new Map(); // battleId -> battle
  const commentBuckets = new Map();
  const giftBuckets = new Map();

  function ensureShape() {
    if (!localDb.live_streams) localDb.live_streams = [];
    if (!localDb.live_battles) localDb.live_battles = [];
  }

  function publicLive(session) {
    if (!session) return null;
    return {
      id: session.id,
      creatorId: session.creatorId,
      handle: session.handle,
      title: session.title,
      wallpaperUrl: session.wallpaperUrl || null,
      viewerCount: session.viewers?.size || 0,
      startedAt: session.startedAt,
      status: session.status,
      battleId: session.battleId || null,
      levelBadge: session.levelBadge || null,
      displayLevel: session.displayLevel || 0,
      nutsEarned: session.nutsEarned || 0,
    };
  }

  function listActive() {
    return [...lives.values()]
      .filter((s) => s.status === 'live')
      .sort((a, b) => (b.viewers?.size || 0) - (a.viewers?.size || 0))
      .map(publicLive);
  }

  function getLive(id) {
    return lives.get(String(id || ''));
  }

  function canCreatorGoLive(creator) {
    if (!creator) return false;
    const policy = getSettings?.()?.liveGoLivePolicy || 'approved';
    if (policy === 'applied') return creator.status === 'approved' || creator.status === 'pending';
    return creator.status === 'approved';
  }

  function rateOk(map, key, { max, windowMs }) {
    const now = Date.now();
    let b = map.get(key);
    if (!b || now - b.start > windowMs) {
      b = { start: now, count: 0 };
      map.set(key, b);
    }
    b.count += 1;
    return b.count <= max;
  }

  async function persistWallpaper(creatorId, url) {
    ensureShape();
    if (supabase) {
      await supabase.from('creators').update({ live_wallpaper_url: url }).eq('id', creatorId);
    }
    const c = (localDb.creators || []).find((x) => x.id === creatorId);
    if (c) {
      c.live_wallpaper_url = url;
      saveLocalDb?.();
    }
  }

  async function startLive({ creator, socketId, title, wallpaperUrl }) {
    if (!canCreatorGoLive(creator)) {
      return { ok: false, error: 'Only approved creators can go live right now.' };
    }
    if (!livekitRooms.isConfigured()) {
      return { ok: false, error: 'Live streaming is not configured (LiveKit).' };
    }
    for (const s of lives.values()) {
      if (s.creatorId === creator.id && s.status === 'live') {
        return { ok: false, error: 'You already have an active live.', live: publicLive(s) };
      }
    }
    const id = generateId?.() || crypto.randomBytes(8).toString('hex');
    const wall = wallpaperUrl || creator.live_wallpaper_url || null;
    if (wallpaperUrl && wallpaperUrl !== creator.live_wallpaper_url) {
      await persistWallpaper(creator.id, wallpaperUrl);
    }
    const session = {
      id,
      creatorId: creator.id,
      handle: creator.handle_name,
      hostSocketId: socketId,
      title: String(title || `${creator.handle_name} Live`).slice(0, 80),
      wallpaperUrl: wall,
      viewers: new Set(),
      startedAt: Date.now(),
      status: 'live',
      battleId: null,
      nutsEarned: 0,
      levelBadge: null,
      displayLevel: 0,
      roomName: `live_${id}`,
    };
    lives.set(id, session);
    ensureShape();
    localDb.live_streams.push({
      id,
      creator_id: creator.id,
      handle: creator.handle_name,
      title: session.title,
      started_at: session.startedAt,
      status: 'live',
    });
    saveLocalDb?.();
    audit?.('live_start', { liveId: id, creatorId: creator.id, handle: creator.handle_name });
    io.emit('live:list-updated', { lives: listActive() });
    return { ok: true, live: publicLive(session) };
  }

  async function endLive(liveId, reason = 'ended') {
    const session = getLive(liveId);
    if (!session) return { ok: false, error: 'Live not found' };
    session.status = 'ended';
    if (session.battleId) await endBattle(session.battleId, 'live_ended');
    io.to(`live:${session.id}`).emit('live:ended', { liveId: session.id, reason });
    lives.delete(session.id);
    ensureShape();
    const row = (localDb.live_streams || []).find((r) => r.id === session.id);
    if (row) {
      row.status = 'ended';
      row.ended_at = Date.now();
      row.nuts_earned = session.nutsEarned;
    }
    saveLocalDb?.();
    audit?.('live_end', { liveId: session.id, reason, nutsEarned: session.nutsEarned });
    io.emit('live:list-updated', { lives: listActive() });
    return { ok: true };
  }

  function joinViewer(liveId, socketId) {
    const session = getLive(liveId);
    if (!session || session.status !== 'live') return { ok: false, error: 'Live is offline' };
    session.viewers.add(socketId);
    io.to(`live:${liveId}`).emit('live:viewers', { liveId, count: session.viewers.size });
    return { ok: true, live: publicLive(session) };
  }

  function leaveViewer(liveId, socketId) {
    const session = getLive(liveId);
    if (!session) return;
    session.viewers.delete(socketId);
    io.to(`live:${liveId}`).emit('live:viewers', { liveId, count: session.viewers.size });
  }

  async function startBattle(liveIdA, liveIdB) {
    const a = getLive(liveIdA);
    const b = getLive(liveIdB);
    if (!a || !b || a.status !== 'live' || b.status !== 'live') {
      return { ok: false, error: 'Both lives must be active' };
    }
    if (a.battleId || b.battleId) return { ok: false, error: 'Already in a battle' };
    const id = generateId?.() || crypto.randomBytes(6).toString('hex');
    const battle = {
      id,
      liveA: a.id,
      liveB: b.id,
      handleA: a.handle,
      handleB: b.handle,
      scoreA: 0,
      scoreB: 0,
      startedAt: Date.now(),
      endsAt: Date.now() + BATTLE_DURATION_MS,
      status: 'active',
    };
    a.battleId = id;
    b.battleId = id;
    battles.set(id, battle);
    const payload = { battle };
    io.to(`live:${a.id}`).emit('live:battle:start', payload);
    io.to(`live:${b.id}`).emit('live:battle:start', payload);
    setTimeout(() => {
      void endBattle(id, 'timeout');
    }, BATTLE_DURATION_MS + 500);
    return { ok: true, battle };
  }

  async function endBattle(battleId, reason = 'ended') {
    const battle = battles.get(battleId);
    if (!battle || battle.status !== 'active') return { ok: false };
    battle.status = 'ended';
    battle.reason = reason;
    battle.endedAt = Date.now();
    const winner =
      battle.scoreA === battle.scoreB ? null : battle.scoreA > battle.scoreB ? 'A' : 'B';
    battle.winner = winner;
    const a = getLive(battle.liveA);
    const b = getLive(battle.liveB);
    if (a) a.battleId = null;
    if (b) b.battleId = null;
    const payload = { battle };
    if (a) io.to(`live:${a.id}`).emit('live:battle:end', payload);
    if (b) io.to(`live:${b.id}`).emit('live:battle:end', payload);
    battles.delete(battleId);
    return { ok: true, battle };
  }

  // --- REST ---
  app.get('/api/lives', (_req, res) => {
    res.json({ ok: true, lives: listActive(), livekit: livekitRooms.statusPayload() });
  });

  app.get('/api/lives/:id', (req, res) => {
    const live = publicLive(getLive(req.params.id));
    if (!live) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, live });
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
      if (!socketId) {
        return res.status(400).json({ ok: false, error: 'Socket connection required to go live.' });
      }
      const hostUser = users?.get?.(socketId);
      if (!hostUser) {
        return res.status(400).json({ ok: false, error: 'Socket not connected — refresh and try again.' });
      }
      const result = await startLive({
        creator,
        socketId,
        title: titleRaw || undefined,
        wallpaperUrl: req.body?.wallpaperUrl,
      });
      if (!result.ok) return res.status(400).json(result);
      audit?.('live_start', { creatorId: creator.id, liveId: result.live?.id, ip: req.ip });
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Start failed' });
    }
  });

  app.post('/api/lives/:id/end', async (req, res) => {
    try {
      const { creator, via } = await getCreatorForRequest(req);
      const session = getLive(req.params.id);
      if (!session) return res.status(404).json({ ok: false, error: 'Not found' });
      const isHost = creator && via === 'session' && creator.id === session.creatorId;
      const agency = !!(req.agencyAuthed || req.adminAuthed);
      if (!isHost && !agency) return res.status(403).json({ ok: false, error: 'Forbidden' });
      const result = await endLive(session.id);
      res.json(result);
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
      // Allow data URLs (compressed) or https
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
      const liveIdA = String(req.body?.liveIdA || '');
      const liveIdB = String(req.body?.liveIdB || '');
      const result = await startBattle(liveIdA, liveIdB);
      if (!result.ok) return res.status(400).json(result);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Battle failed' });
    }
  });

  app.post('/api/lives/battle/:id/end', async (req, res) => {
    const result = await endBattle(req.params.id, 'manual');
    res.json(result);
  });

  function attachSocketHandlers(socket) {
    const on = (evt, fn) => socket.on(evt, async (...args) => {
      try { await fn(...args); }
      catch (err) {
        try { socket.emit('live:error', { message: err.message || 'Error' }); } catch { /* */ }
      }
    });

    on('live:join', async (payload, cb) => {
      const liveId = String(payload?.liveId || '');
      const result = joinViewer(liveId, socket.id);
      if (result.ok) socket.join(`live:${liveId}`);
      if (typeof cb === 'function') cb(result);
      else if (!result.ok) socket.emit('live:error', result);
    });

    on('live:leave', async (payload) => {
      const liveId = String(payload?.liveId || '');
      leaveViewer(liveId, socket.id);
      socket.leave(`live:${liveId}`);
    });

    on('live:comment', async (payload) => {
      const liveId = String(payload?.liveId || '');
      const session = getLive(liveId);
      if (!session || session.status !== 'live') return;
      const ip = socket.handshake.address || socket.id;
      if (!rateOk(commentBuckets, `${liveId}:${ip}`, COMMENT_RATE)) {
        socket.emit('live:error', { message: 'Slow down comments' });
        return;
      }
      const userData = users.get(socket.id);
      const identity = userData?.audioIdentity;
      const text = sanitize
        ? sanitize(String(payload?.text || '').slice(0, COMMENT_MAX))
        : String(payload?.text || '').slice(0, COMMENT_MAX).replace(/[<>]/g, '');
      if (!text.trim()) return;
      const msg = {
        id: crypto.randomBytes(4).toString('hex'),
        liveId,
        text: text.trim(),
        username: identity?.username || userData?.nickname || 'Guest',
        nameColor: identity?.nameColor || '#e2e8f0',
        levelBadge: identity?.levelBadge || null,
        displayLevel: identity?.level || 0,
        at: Date.now(),
      };
      io.to(`live:${liveId}`).emit('live:comment', msg);
    });

    on('live:gift', async (payload) => {
      const liveId = String(payload?.liveId || '');
      const giftId = String(payload?.giftId || '');
      const targetSide = payload?.targetSide === 'B' ? 'B' : 'A';
      const session = getLive(liveId);
      if (!session || session.status !== 'live') {
        socket.emit('live:error', { message: 'Live is offline' });
        return;
      }
      const ip = socket.handshake.address || socket.id;
      if (!rateOk(giftBuckets, `${liveId}:${ip}`, GIFT_RATE)) {
        socket.emit('live:error', { message: 'Gift rate limit' });
        return;
      }
      const gift = GIFTS.find((g) => g.id === giftId);
      if (!gift) {
        socket.emit('live:error', { message: 'Unknown gift' });
        return;
      }
      const userData = users.get(socket.id);
      const walletKey = audioIdentity?.resolveWalletKey?.(socket, users);
      if (!walletKey) {
        socket.emit('live:error', { message: 'Sign in with your PIN to gift Nuts' });
        return;
      }
      const debit = await audioIdentity.debit(walletKey, gift.cost, `live_gift:${gift.id}`, {
        liveId,
        giftId: gift.id,
      });
      if (!debit?.ok) {
        socket.emit('live:error', { message: debit?.error || 'Not enough Nuts' });
        return;
      }
      const share = Math.floor(gift.cost * (gift.creatorShare || 0.7));
      let creditCreatorId = session.creatorId;
      if (session.battleId) {
        const battle = battles.get(session.battleId);
        if (battle) {
          if (targetSide === 'B') {
            creditCreatorId = getLive(battle.liveB)?.creatorId || creditCreatorId;
            battle.scoreB += gift.cost;
          } else {
            creditCreatorId = getLive(battle.liveA)?.creatorId || creditCreatorId;
            battle.scoreA += gift.cost;
          }
          const scorePayload = { battle: { ...battle } };
          io.to(`live:${battle.liveA}`).emit('live:battle:score', scorePayload);
          io.to(`live:${battle.liveB}`).emit('live:battle:score', scorePayload);
        }
      }
      if (typeof creditCreatorCoins === 'function') {
        let creatorRow = (localDb.creators || []).find((c) => c.id === creditCreatorId);
        if (creatorRow) await creditCreatorCoins(creditCreatorId, share, `live_gift:${gift.id}`, creatorRow);
      }
      session.nutsEarned = (session.nutsEarned || 0) + share;
      const fromName = userData?.audioIdentity?.username || userData?.nickname || 'Guest';
      const giftPayload = {
        liveId,
        gift,
        from: fromName,
        nameColor: userData?.audioIdentity?.nameColor,
        levelBadge: userData?.audioIdentity?.levelBadge,
        displayLevel: userData?.audioIdentity?.level || 0,
        targetSide,
        anim: gift.anim || gift.tier,
        at: Date.now(),
      };
      io.to(`live:${liveId}`).emit('live:gift', giftPayload);
      if (session.battleId) {
        const battle = battles.get(session.battleId);
        if (battle) {
          const other = targetSide === 'A' ? battle.liveB : battle.liveA;
          if (other !== liveId) io.to(`live:${other}`).emit('live:gift', giftPayload);
        }
      }
      socket.emit('live:gift:sent', {
        ok: true,
        balance: debit.balance,
        identity: debit.identity,
      });
    });

    on('live:token', async (payload, cb) => {
      const liveId = String(payload?.liveId || '');
      const asHost = !!payload?.asHost;
      const session = getLive(liveId);
      if (!session || session.status !== 'live') {
        const err = { ok: false, error: 'Live offline' };
        if (typeof cb === 'function') cb(err);
        else socket.emit('live:error', err);
        return;
      }
      const userData = users.get(socket.id);
      if (asHost && session.hostSocketId && session.hostSocketId !== socket.id) {
        // Allow rebind if creator reconnects
        session.hostSocketId = socket.id;
      }
      try {
        const tokenPayload = await livekitRooms.mintParticipantToken({
          socketId: socket.id,
          roomId: session.roomName,
          nickname: userData?.audioIdentity?.username || userData?.nickname || session.handle,
          country: userData?.country || '',
          isCreator: asHost,
          canPublish: asHost,
          canSubscribe: true,
          roomAdmin: asHost,
        });
        const out = { ok: true, ...tokenPayload, liveId };
        if (typeof cb === 'function') cb(out);
        else socket.emit('live:token', out);
      } catch (e) {
        const err = { ok: false, error: e.message || 'Token failed' };
        if (typeof cb === 'function') cb(err);
        else socket.emit('live:error', err);
      }
    });

    socket.on('disconnect', () => {
      for (const session of lives.values()) {
        if (session.viewers?.has(socket.id)) {
          leaveViewer(session.id, socket.id);
        }
        if (session.hostSocketId === socket.id && session.status === 'live') {
          // Grace period: end after 20s if host does not reconnect
          const liveId = session.id;
          setTimeout(() => {
            const s = getLive(liveId);
            if (s && s.hostSocketId === socket.id && s.status === 'live') {
              void endLive(liveId, 'host_disconnect');
            }
          }, 20000);
        }
      }
    });
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
  };
}

module.exports = { registerLiveStreams };
