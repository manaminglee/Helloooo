/**
 * Mana Mingle unique differentiators: consent, trust, modes, events, co-op rewards.
 */
const crypto = require('crypto');
const nvidiaAi = require('./nvidiaAi');

const COMMUNITY_EVENTS = [
  { id: 'gaming-friday', title: 'Gaming Friday Pod', interest: 'gaming', mode: 'group_video', day: 'Fri', hourUtc: 18, badge: '🎮' },
  { id: 'lang-sunday', title: 'Language Exchange Hour', interest: 'chat', mode: 'video', day: 'Sun', hourUtc: 14, badge: '🌍' },
  { id: 'creator-showcase', title: 'Creator Showcase', interest: 'social', mode: 'group_video', day: 'Sat', hourUtc: 20, badge: '⭐' },
  { id: 'debate-night', title: 'Friendly Debate Night', interest: 'chat', mode: 'text', day: 'Wed', hourUtc: 19, badge: '⚖️' },
];

function registerUniqueFeatures(app, io, deps) {
  const { rooms, users, reports, sanitize, countryFromIP, persistence } = deps;

  const trustByHash = new Map();
  const vibePrefs = new Map();
  const roomConsent = new Map();
  const tipGoals = new Map();
  const coOpStreak = new Map();

  function ipHash(ip) {
    return crypto.createHash('sha256').update(String(ip || '') + (process.env.ADMIN_KEY || 'mm')).digest('hex').slice(0, 16);
  }

  function getTrust(ip) {
    const h = ipHash(ip);
    if (!trustByHash.has(h)) {
      trustByHash.set(h, { score: 50, sessions: 0, badges: [], reports: 0 });
      if (persistence?.loadTrust) {
        persistence.loadTrust(ip).then((t) => {
          if (t) trustByHash.set(h, { ...t });
        }).catch(() => {});
      }
    }
    return trustByHash.get(h);
  }

  function adjustTrust(ip, delta, badge) {
    const t = getTrust(ip);
    t.score = Math.max(0, Math.min(100, t.score + delta));
    t.sessions += delta > 0 ? 1 : 0;
    if (badge && !t.badges.includes(badge)) t.badges.push(badge);
    if (persistence?.saveTrust) persistence.saveTrust(ip, t).catch(() => {});
    return t;
  }

  function getRoomConsent(roomId) {
    if (!roomConsent.has(roomId)) {
      roomConsent.set(roomId, {
        ready: new Set(),
        contract: null,
        audioReady: new Set(),
        clipConsent: new Map(),
        mode: 'free',
      });
    }
    return roomConsent.get(roomId);
  }

  // --- REST ---

  app.get('/api/ai/status', (_req, res) => {
    res.json({
      online: nvidiaAi.isConfigured(),
      provider: 'NVIDIA NIM',
      models: ['meta/llama3-70b-instruct', 'mistralai/mistral-7b-instruct-v0.1'],
    });
  });

  app.post('/api/ai/copilot', async (req, res) => {
    const { silenceSeconds, mode, interest, lastMessages } = req.body || {};
    if (!nvidiaAi.isConfigured()) return res.json({ prompt: 'Break the ice — where are you from?', offline: true });
    const prompt = await nvidiaAi.copilot({ silenceSeconds, mode, interest, lastMessages });
    res.json({ prompt });
  });

  app.post('/api/ai/mode-prompt', async (req, res) => {
    const { mode, interest, language } = req.body || {};
    if (!nvidiaAi.isConfigured()) {
      return res.json({ prompt: 'Say hello and share one fun fact!', offline: true });
    }
    const prompt = await nvidiaAi.modePrompt(mode, interest, language);
    res.json({ prompt });
  });

  app.post('/api/ai/caption-polish', async (req, res) => {
    const { text } = req.body || {};
    if (!text) return res.json({ polished: '' });
    if (!nvidiaAi.isConfigured()) return res.json({ polished: text });
    const polished = await nvidiaAi.polishCaption(text);
    res.json({ polished });
  });

  app.post('/api/vibe/save', (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress;
    const tags = Array.isArray(req.body?.tags) ? req.body.tags.slice(0, 8).map((t) => sanitize(String(t), 20)) : [];
    const h = ipHash(ip);
    vibePrefs.set(h, { tags, updated: Date.now() });
    res.json({ ok: true, tags });
  });

  app.get('/api/trust/me', (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress;
    const t = getTrust(ip);
    res.json({ score: t.score, badges: t.badges, level: t.score >= 75 ? 'trusted' : t.score >= 40 ? 'neutral' : 'new' });
  });

  app.get('/api/events/public', (_req, res) => {
    const now = new Date();
    const enriched = COMMUNITY_EVENTS.map((e) => ({
      ...e,
      live: now.getUTCDay() === ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(e.day) && Math.abs(now.getUTCHours() - e.hourUtc) <= 1,
    }));
    res.json({ events: enriched });
  });

  app.get('/api/rooms/:roomId/tip-goal', (req, res) => {
    const goal = tipGoals.get(req.params.roomId);
    res.json(goal || { goal: 0, current: 0 });
  });

  // --- Socket (registered per connection in index or here via io.on) ---

  function attachSocketHandlers(socket, ip) {
    socket.on('session-consent-ready', (data) => {
      const { roomId } = data || {};
      const room = rooms.get(roomId);
      if (!room || !room.users.has(socket.id)) return;
      const c = getRoomConsent(roomId);
      c.ready.add(socket.id);
      io.to(roomId).emit('consent-status', {
        roomId,
        readyCount: c.ready.size,
        total: room.users.size,
        allReady: c.ready.size >= room.users.size,
      });
      if (c.ready.size >= room.users.size) {
        io.to(roomId).emit('consent-complete', { roomId, contract: c.contract, mode: c.mode });
      }
    });

    socket.on('session-set-contract', (data) => {
      const { roomId, contract, mode } = data || {};
      const room = rooms.get(roomId);
      if (!room || !room.users.has(socket.id)) return;
      const c = getRoomConsent(roomId);
      c.contract = sanitize(String(contract || 'chill'), 40);
      if (mode) c.mode = sanitize(String(mode), 30);
      socket.to(roomId).emit('session-contract-updated', { roomId, contract: c.contract, mode: c.mode });
    });

    socket.on('session-audio-intro-ready', (data) => {
      const { roomId } = data || {};
      const room = rooms.get(roomId);
      if (!room || !room.users.has(socket.id)) return;
      const c = getRoomConsent(roomId);
      c.audioReady.add(socket.id);
      io.to(roomId).emit('audio-intro-status', {
        roomId,
        count: c.audioReady.size,
        total: room.users.size,
        complete: c.audioReady.size >= room.users.size,
      });
    });

    socket.on('clip-consent-request', (data) => {
      const { roomId } = data || {};
      const room = rooms.get(roomId);
      if (!room || !room.users.has(socket.id)) return;
      socket.to(roomId).emit('clip-consent-request', { roomId, from: socket.id });
    });

    socket.on('clip-consent-response', (data) => {
      const { roomId, accepted } = data || {};
      const room = rooms.get(roomId);
      if (!room || !room.users.has(socket.id)) return;
      const c = getRoomConsent(roomId);
      c.clipConsent.set(socket.id, !!accepted);
      io.to(roomId).emit('clip-consent-update', {
        roomId,
        responses: Object.fromEntries(c.clipConsent),
        allAccepted: [...room.users].every((sid) => c.clipConsent.get(sid)),
      });
    });

    socket.on('co-op-streak-minute', (data) => {
      const { roomId } = data || {};
      const room = rooms.get(roomId);
      if (!room || room.users.size < 2 || !room.users.has(socket.id)) return;
      const key = roomId;
      const streak = coOpStreak.get(key) || { minutes: 0, participants: new Set() };
      streak.participants.add(socket.id);
      if (streak.participants.size >= Math.min(2, room.users.size)) {
        streak.minutes += 1;
        streak.participants.clear();
        coOpStreak.set(key, streak);
        if (streak.minutes % 5 === 0) {
          io.to(roomId).emit('co-op-reward', { roomId, minutes: streak.minutes, coins: 5 });
          adjustTrust(ip, 3, streak.minutes >= 10 ? 'great-listener' : null);
        }
      }
    });

    socket.on('tip-goal-set', (data) => {
      const { roomId, goal } = data || {};
      const room = rooms.get(roomId);
      if (!room || room.hostId !== socket.id) return;
      tipGoals.set(roomId, { goal: Math.min(Number(goal) || 0, 5000), current: tipGoals.get(roomId)?.current || 0 });
      io.to(roomId).emit('tip-goal-update', tipGoals.get(roomId));
    });

    socket.on('report-user', () => {
      adjustTrust(ip, -8);
    });

    socket.on('disconnect', () => {
      for (const [rid, c] of roomConsent.entries()) {
        c.ready.delete(socket.id);
        c.audioReady.delete(socket.id);
        c.clipConsent.delete(socket.id);
      }
    });
  }

  function enrichPartnerMatch(room, socketId, data) {
    const c = getRoomConsent(room.id);
    if (data?.topicContract) c.contract = sanitize(String(data.topicContract), 40);
    if (data?.conversationMode) c.mode = sanitize(String(data.conversationMode), 30);
    room.sessionMode = c.mode;
    room.sessionContract = c.contract;
  }

  function emitSessionConfig(roomId) {
    const c = getRoomConsent(roomId);
    return { conversationMode: c.mode, topicContract: c.contract };
  }

  function trustBoost(ip) {
    const h = ipHash(ip);
    const pref = vibePrefs.get(h);
    const trust = getTrust(ip);
    return { vibeTags: pref?.tags || [], trustScore: trust.score, badges: trust.badges };
  }

  function onGoodSession(ip, durationSec, topics) {
    adjustTrust(ip, durationSec > 300 ? 5 : 2, durationSec > 600 ? 'helpful-stranger' : null);
  }

  return {
    attachSocketHandlers,
    enrichPartnerMatch,
    emitSessionConfig,
    trustBoost,
    onGoodSession,
    getTrust,
    adjustTrust,
    COMMUNITY_EVENTS,
  };
}

module.exports = { registerUniqueFeatures };
