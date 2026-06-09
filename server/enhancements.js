/**
 * Server enhancements: smart match, rate limits, reconnect, moderation, public APIs
 */
const crypto = require('crypto');

const RECONNECT_TTL_MS = 60000;
const MESSAGE_RATE_WINDOW_MS = 10000;
const MESSAGE_RATE_MAX = 12;

function registerEnhancements(app, io, deps) {
  const {
    rooms,
    users,
    reports,
    blockedIps,
    sanitize,
    generateId,
    supabase,
    localDb,
    saveLocalDb,
    countryFromIP,
  } = deps;

  const reconnectTokens = new Map();
  const messageRates = new Map();
  const roomMutes = new Map(); // roomId -> Set of socketIds
  const conversationRatings = [];

  function issueReconnectToken(socketId, payload) {
    const token = crypto.randomBytes(16).toString('hex');
    reconnectTokens.set(token, { ...payload, socketId, expires: Date.now() + RECONNECT_TTL_MS });
    return token;
  }

  function checkMessageRate(socketId) {
    const now = Date.now();
    let bucket = messageRates.get(socketId);
    if (!bucket || now - bucket.start > MESSAGE_RATE_WINDOW_MS) {
      bucket = { start: now, count: 0 };
      messageRates.set(socketId, bucket);
    }
    bucket.count += 1;
    return bucket.count <= MESSAGE_RATE_MAX;
  }

  function smartMatchScore(entry, interest, region, language) {
    let score = 0;
    const eInterest = String(entry.interest || 'general').toLowerCase();
    const want = String(interest || 'general').toLowerCase();
    if (eInterest === want) score += 12;
    else if (eInterest.includes(want) || want.includes(eInterest)) score += 6;
    const u = entry.userData || users.get(entry.socketId);
    if (region && u?.region && u.region === region) score += 4;
    if (language && u?.language && u.language === language) score += 4;
    if (u?.country && region && u.country === region) score += 2;
    return score;
  }

  function pickSmartMatch(queue, interest, region, language, canMatch) {
    const eligible = queue.filter((e) => canMatch(e));
    if (!eligible.length) return null;
    eligible.sort((a, b) => smartMatchScore(b, interest, region, language) - smartMatchScore(a, interest, region, language));
    return eligible[0];
  }

  // --- REST ---

  app.get('/api/rooms/public', (req, res) => {
    const list = Array.from(rooms.values())
      .filter((r) => (r.mode === 'group_text' || r.mode === 'group_video') && r.users.size > 0 && r.users.size < r.maxSize)
      .map((r) => ({
        id: r.id,
        interest: r.interest,
        mode: r.mode,
        participantCount: r.users.size,
        maxSize: r.maxSize,
      }))
      .slice(0, 30);
    res.json({ rooms: list });
  });

  app.get('/api/rooms/:roomId', (req, res) => {
    const room = rooms.get(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json({
      id: room.id,
      interest: room.interest,
      mode: room.mode,
      participantCount: room.users.size,
      maxSize: room.maxSize,
      joinable: room.users.size < room.maxSize,
    });
  });

  app.get('/api/creators/public/:handle', async (req, res) => {
    const handle = String(req.params.handle || '').replace(/^@/, '').toLowerCase();
    try {
      let creator = null;
      if (supabase) {
        const { data } = await supabase.from('creators').select('handle_name, platform, link, bio, avatar_url, status, public_profile').eq('handle_name', handle).single();
        creator = data;
      } else {
        creator = localDb.creators.find((c) => c.handle_name === handle);
      }
      if (!creator || creator.status !== 'approved') return res.status(404).json({ error: 'Creator not found' });
      if (creator.public_profile === false) return res.status(403).json({ error: 'Profile is private' });
      res.json({ creator });
    } catch {
      res.status(500).json({ error: 'Failed to load profile' });
    }
  });

  app.get('/api/creators/:code/analytics', async (req, res) => {
    const code = String(req.params.code || '');
    try {
      let creator = null;
      if (supabase) {
        const { data } = await supabase.from('creators').select('*').eq('referral_code', code).single();
        creator = data;
      } else {
        creator = localDb.creators.find((c) => c.referral_code === code);
      }
      if (!creator) return res.status(404).json({ error: 'Not found' });
      let clicks = creator.referral_count || 0;
      let signups = 0;
      if (supabase) {
        const { count } = await supabase.from('referral_logs').select('*', { count: 'exact', head: true }).eq('creator_id', creator.id);
        clicks = count || clicks;
      } else {
        signups = localDb.referral_logs.filter((l) => l.creator_id === creator.id).length;
        clicks = Math.max(clicks, signups);
      }
      res.json({
        referral_code: creator.referral_code,
        clicks,
        signups: signups || clicks,
        coins_earned: creator.coins_earned || 0,
        earnings_rs: creator.earnings_rs || 0,
      });
    } catch {
      res.status(500).json({ error: 'Analytics unavailable' });
    }
  });

  app.post('/api/payment/unblock-intent', (req, res) => {
    const stripeUrl = (process.env.STRIPE_UNBLOCK_URL || '').trim();
    if (stripeUrl) {
      return res.json({ checkoutUrl: stripeUrl, message: 'Redirecting to secure checkout...' });
    }
    res.json({
      message: 'Online payment is not configured. Email manaminglee@gmail.com with your blocked IP to appeal or pay manually.',
    });
  });

  app.post('/api/referral/click', async (req, res) => {
    const { code } = req.body || {};
    const visitorIp = req.ip === '::1' ? '127.0.0.1' : req.ip;
    if (!code) return res.status(400).json({ error: 'Code required' });
    try {
      let creator = null;
      if (supabase) {
        const { data } = await supabase.from('creators').select('id, referral_count').eq('referral_code', code).single();
        creator = data;
        if (creator) {
          await supabase.from('referral_clicks').insert({ creator_id: creator.id, visitor_ip: visitorIp }).catch(() => {});
        }
      } else {
        creator = localDb.creators.find((c) => c.referral_code === code);
        if (creator) {
          if (!localDb.referral_clicks) localDb.referral_clicks = [];
          localDb.referral_clicks.push({ creator_id: creator.id, visitor_ip: visitorIp, created_at: new Date().toISOString() });
          saveLocalDb();
        }
      }
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Click not recorded' });
    }
  });

  // --- Socket handlers (called per connection) ---

  function attachSocketHandlers(socket, ip) {
    socket.on('reconnect-session', (data) => {
      const token = String(data?.token || '');
      const entry = reconnectTokens.get(token);
      if (!entry || entry.expires < Date.now()) {
        return socket.emit('reconnect-failed', { message: 'Session expired. Start a new chat.' });
      }
      const room = rooms.get(entry.roomId);
      if (!room || room.users.size >= room.maxSize) {
        reconnectTokens.delete(token);
        return socket.emit('reconnect-failed', { message: 'Room no longer available.' });
      }
      const userData = users.get(socket.id);
      if (!userData) return;
      userData.nickname = entry.nickname || userData.nickname;
      userData.rooms.add(entry.roomId);
      socket.join(entry.roomId);
      deps.addUserToRoom(room, socket.id, { id: userData.id, nickname: userData.nickname, country: userData.country, isCreator: userData.isCreator });
      reconnectTokens.delete(token);
      socket.emit('reconnect-success', { roomId: entry.roomId, mode: entry.mode, interest: room.interest });
    });

    socket.on('rate-conversation', (data) => {
      const rating = Number(data?.rating);
      if (!rating || rating < 1 || rating > 5) return;
      conversationRatings.push({ rating, roomId: data?.roomId, ip, ts: Date.now() });
      if (conversationRatings.length > 500) conversationRatings.shift();
    });

    socket.on('mute-user', (data) => {
      const { roomId, targetSocketId } = data || {};
      const room = rooms.get(roomId);
      if (!room || !room.users.has(socket.id)) return;
      if (!roomMutes.has(roomId)) roomMutes.set(roomId, new Set());
      roomMutes.get(roomId).add(targetSocketId);
      io.to(roomId).emit('user-muted', { targetSocketId });
    });

    socket.on('kick-user', (data) => {
      const { roomId, targetSocketId } = data || {};
      const room = rooms.get(roomId);
      if (!room || room.hostId !== socket.id) return;
      const target = io.sockets.sockets.get(targetSocketId);
      if (target) {
        target.emit('kicked-from-room', { roomId });
        deps.removeUserFromRoom(targetSocketId, roomId, io);
      }
    });
  }

  function isMuted(roomId, socketId) {
    return roomMutes.get(roomId)?.has(socketId);
  }

  function beforeSendMessage(socket, roomId) {
    if (!checkMessageRate(socket.id)) {
      socket.emit('error', { message: 'Slow down — too many messages.' });
      return false;
    }
    if (isMuted(roomId, socket.id)) {
      socket.emit('error', { message: 'You are muted in this room.' });
      return false;
    }
    const reportCount = reports.filter((r) => r.targetIp === users.get(socket.id)?.ip).length;
    if (reportCount >= 3) {
      socket.emit('error', { message: 'Messaging restricted due to reports.' });
      return false;
    }
    return true;
  }

  setInterval(() => {
    const now = Date.now();
    for (const [token, entry] of reconnectTokens.entries()) {
      if (entry.expires < now) reconnectTokens.delete(token);
    }
  }, 30000);

  return {
    issueReconnectToken,
    pickSmartMatch,
    attachSocketHandlers,
    beforeSendMessage,
    smartMatchScore,
  };
}

module.exports = { registerEnhancements };
