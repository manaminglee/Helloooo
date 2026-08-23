/**
 * Group AUDIO channels — replaces group text rooms with live voice channels.
 *
 * Design notes:
 *  - Audio-only WebRTC mesh (no SFU dependency). Mesh is capped at
 *    MAX_SPEAKERS so bandwidth stays sane; extra members join as listeners.
 *  - Roles: host > moderator > speaker > listener. Only speakers publish audio.
 *  - Every mutating action is validated server-side (never trust the client).
 *  - Admin can lock, mute, kick, or destroy any channel; all actions are audited.
 *
 * Socket API (client -> server)
 *   audio:list                      -> audio:channels
 *   audio:create {topic, isPrivate} -> audio:joined | error
 *   audio:join {channelId}          -> audio:joined | error
 *   audio:leave {channelId}
 *   audio:signal {channelId, targetSocketId, signal}   (relayed, audio-only)
 *   audio:mic {channelId, muted}
 *   audio:request-speak {channelId}
 *   audio:grant-speak {channelId, targetSocketId, grant}
 *   audio:moderate {channelId, targetSocketId, action} (mute|kick|promote|demote)
 *   audio:chat {channelId, text}
 *
 * Server -> client
 *   audio:channels, audio:joined, audio:state, audio:peer-joined,
 *   audio:peer-left, audio:signal, audio:speaking, audio:kicked, audio:error,
 *   audio:chat-message
 */

const MAX_MEMBERS = Number(process.env.AUDIO_MAX_MEMBERS) || 24;
const MAX_SPEAKERS = Number(process.env.AUDIO_MAX_SPEAKERS) || 6;
const TOPIC_MAX = 48;
const CHAT_MAX = 280;
const WALLPAPER_MAX = 400 * 1024; // data-URL cap ~400KB
const JOIN_WINDOW_MS = 10000;
const JOIN_MAX = 8;
const SIGNAL_WINDOW_MS = 10000;
const SIGNAL_MAX = 200;

const ROLE_RANK = { listener: 0, speaker: 1, moderator: 2, host: 3 };

function registerAudioChannels(app, io, deps) {
  const {
    users,
    sanitize,
    generateId,
    blockedIps,
    userBlocks,
    isAdminRequest,
    audit,
    onChannelEmpty,
  } = deps;

  /** channelId -> channel */
  const channels = new Map();
  /** socketId -> Set(channelId) */
  const memberships = new Map();
  const joinRates = new Map();
  const signalRates = new Map();

  const rateOk = (map, key, windowMs, max) => {
    const now = Date.now();
    const b = map.get(key);
    if (!b || now - b.start > windowMs) {
      map.set(key, { start: now, count: 1 });
      return true;
    }
    b.count += 1;
    return b.count <= max;
  };

  const publicChannel = (c) => ({
    id: c.id,
    topic: c.topic,
    isPrivate: c.isPrivate,
    locked: c.locked,
    memberCount: c.members.size,
    speakerCount: [...c.members.values()].filter((m) => ROLE_RANK[m.role] >= ROLE_RANK.speaker).length,
    maxMembers: c.maxMembers,
    maxSpeakers: c.maxSpeakers,
    gamesEnabled: !!c.gamesEnabled,
    wallpaper: c.wallpaper || null,
    createdAt: c.createdAt,
    hasActiveGame: !!c.gameId,
  });

  const memberView = (m) => ({
    socketId: m.socketId,
    userId: m.userId,
    nickname: m.nickname,
    country: m.country,
    role: m.role,
    micMuted: m.micMuted,
    forceMuted: m.forceMuted,
    isCreator: m.isCreator,
    verified: m.verified,
    handRaised: m.handRaised,
    joinedAt: m.joinedAt,
    slot: m.slot ?? null,
  });

  const channelState = (c) => ({
    channelId: c.id,
    topic: c.topic,
    locked: c.locked,
    isPrivate: c.isPrivate,
    maxMembers: c.maxMembers,
    maxSpeakers: c.maxSpeakers || MAX_SPEAKERS,
    gamesEnabled: c.gamesEnabled !== false,
    wallpaper: c.wallpaper || null,
    pendingJoins: [...(c.pendingJoins || [])],
    members: [...c.members.values()].map(memberView),
  });

  const broadcastState = (c) => {
    io.to(c.id).emit('audio:state', channelState(c));
  };

  const listChannels = () =>
    [...channels.values()]
      .filter((c) => !c.isPrivate)
      .sort((a, b) => b.members.size - a.members.size || b.createdAt - a.createdAt)
      .slice(0, 60)
      .map(publicChannel);

  const broadcastList = () => {
    io.emit('audio:channels', { channels: listChannels() });
  };

  const getChannel = (id) => channels.get(String(id || ''));

  const speakerCount = (c) =>
    [...c.members.values()].filter((m) => ROLE_RANK[m.role] >= ROLE_RANK.speaker).length;

  /** Remove a member; promotes a new host and destroys empty channels. */
  function removeMember(channelId, socketId, reason = 'left') {
    const c = channels.get(channelId);
    if (!c) return;
    const member = c.members.get(socketId);
    if (!member) return;

    c.members.delete(socketId);
    memberships.get(socketId)?.delete(channelId);

    const sock = io.sockets.sockets.get(socketId);
    if (sock) sock.leave(channelId);

    io.to(channelId).emit('audio:peer-left', { channelId, socketId, reason });

    if (c.members.size === 0) {
      channels.delete(channelId);
      if (typeof onChannelEmpty === 'function') {
        try {
          onChannelEmpty(channelId);
        } catch (_) {
          /* game cleanup must never break teardown */
        }
      }
      broadcastList();
      return;
    }

    // Host left — promote the longest-standing remaining member.
    if (member.role === 'host') {
      const next = [...c.members.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if (next) {
        next.role = 'host';
        next.forceMuted = false;
      }
    }
    broadcastState(c);
    broadcastList();
  }

  /** Mutual-block check so blocked users never share a voice channel. */
  const blockedBetween = (ipA, ipB) => {
    if (!ipA || !ipB) return false;
    if (userBlocks?.get(ipA)?.has(ipB)) return true;
    if (userBlocks?.get(ipB)?.has(ipA)) return true;
    return false;
  };

  function joinChannel(socket, channel, userData, ip) {
    if (channel.locked && !channel.members.has(socket.id)) {
      socket.emit('audio:error', { message: 'This channel is locked.' });
      return false;
    }
    if (channel.members.size >= channel.maxMembers) {
      socket.emit('audio:error', { message: 'Channel is full.' });
      return false;
    }
    if (channel.bannedIps.has(ip)) {
      socket.emit('audio:error', { message: 'You cannot rejoin this channel.' });
      return false;
    }
    for (const m of channel.members.values()) {
      const otherIp = users.get(m.socketId)?.ip;
      if (blockedBetween(ip, otherIp)) {
        socket.emit('audio:error', { message: 'Cannot join — a member here is on your block list.' });
        return false;
      }
    }

    // Creator is host on stage; everyone else starts as listener until approved onto a slot.
    const isFirst = channel.members.size === 0;
    const role = isFirst ? 'host' : 'listener';

    const member = {
      socketId: socket.id,
      userId: userData.id,
      nickname: userData.nickname || 'Anonymous',
      country: userData.country,
      isCreator: !!userData.isCreator,
      verified: !!userData.verified,
      role,
      micMuted: true, // always join muted — never surprise-broadcast a mic
      forceMuted: false,
      handRaised: false,
      slot: isFirst ? 0 : null,
      joinedAt: Date.now(),
    };
    channel.members.set(socket.id, member);

    if (!memberships.has(socket.id)) memberships.set(socket.id, new Set());
    memberships.get(socket.id).add(channel.id);
    socket.join(channel.id);

    // Only existing speakers need a peer connection (audio mesh).
    const peers = [...channel.members.values()]
      .filter((m) => m.socketId !== socket.id)
      .map(memberView);

    socket.emit('audio:joined', {
      channelId: channel.id,
      topic: channel.topic,
      you: memberView(member),
      peers,
      maxSpeakers: channel.maxSpeakers,
    });
    socket.to(channel.id).emit('audio:peer-joined', { channelId: channel.id, member: memberView(member) });
    broadcastState(channel);
    broadcastList();
    return true;
  }

  function attachSocketHandlers(socket, ip) {
    const on = (evt, fn) => {
      socket.on(evt, (data) => {
        try {
          fn(data || {});
        } catch (err) {
          socket.emit('audio:error', { message: 'Audio action failed.' });
          if (process.env.NODE_ENV !== 'production') console.error(`[audio:${evt}]`, err);
        }
      });
    };

    on('audio:list', () => {
      socket.emit('audio:channels', { channels: listChannels() });
    });

    on('audio:create', (data) => {
      if (!rateOk(joinRates, ip, JOIN_WINDOW_MS, JOIN_MAX)) {
        return socket.emit('audio:error', { message: 'Slow down — too many channel actions.' });
      }
      const userData = users.get(socket.id);
      if (!userData) return;
      if (blockedIps.has(ip)) return socket.emit('audio:error', { message: 'Account restricted.' });

      const topic = sanitize(data.topic || 'Open voice room', TOPIC_MAX);
      const channel = {
        id: generateId('ach'),
        topic,
        isPrivate: !!data.isPrivate,
        locked: false,
        maxMembers: MAX_MEMBERS,
        maxSpeakers: MAX_SPEAKERS,
        members: new Map(),
        bannedIps: new Set(),
        pendingJoins: [],
        gamesEnabled: true,
        wallpaper: null,
        createdAt: Date.now(),
        gameId: null,
      };
      channels.set(channel.id, channel);
      if (typeof data.nickname === 'string') userData.nickname = sanitize(data.nickname, 30);
      joinChannel(socket, channel, userData, ip);
      audit?.('audio_channel_created', { ip, channelId: channel.id, topic });
    });

    on('audio:join', (data) => {
      if (!rateOk(joinRates, ip, JOIN_WINDOW_MS, JOIN_MAX)) {
        return socket.emit('audio:error', { message: 'Slow down — too many join attempts.' });
      }
      const userData = users.get(socket.id);
      const channel = getChannel(data.channelId);
      if (!userData || !channel) return socket.emit('audio:error', { message: 'Channel not found.' });
      if (channel.members.has(socket.id)) return;
      if (typeof data.nickname === 'string') userData.nickname = sanitize(data.nickname, 30);
      joinChannel(socket, channel, userData, ip);
    });

    on('audio:leave', (data) => {
      removeMember(String(data.channelId || ''), socket.id, 'left');
    });

    /**
     * WebRTC signalling relay — audio only. We validate that both parties are
     * in the channel so signals can't be used to probe arbitrary sockets.
     */
    on('audio:signal', (data) => {
      if (!rateOk(signalRates, socket.id, SIGNAL_WINDOW_MS, SIGNAL_MAX)) return;
      const channel = getChannel(data.channelId);
      const target = String(data.targetSocketId || '');
      if (!channel || !channel.members.has(socket.id) || !channel.members.has(target)) return;

      const me = channel.members.get(socket.id);
      // Listeners may receive but never publish: drop offers from muted listeners.
      if (ROLE_RANK[me.role] < ROLE_RANK.speaker && data.signal?.type === 'offer') return;

      io.to(target).emit('audio:signal', {
        channelId: channel.id,
        fromSocketId: socket.id,
        signal: data.signal,
      });
    });

    on('audio:mic', (data) => {
      const channel = getChannel(data.channelId);
      if (!channel) return;
      const me = channel.members.get(socket.id);
      if (!me) return;
      if (ROLE_RANK[me.role] < ROLE_RANK.speaker) {
        return socket.emit('audio:error', { message: 'You are a listener — request to speak first.' });
      }
      if (me.forceMuted && data.muted === false) {
        return socket.emit('audio:error', { message: 'You were muted by a moderator.' });
      }
      me.micMuted = !!data.muted;
      io.to(channel.id).emit('audio:speaking', {
        channelId: channel.id,
        socketId: socket.id,
        micMuted: me.micMuted,
      });
    });

    on('audio:chat', (data) => {
      if (!rateOk(signalRates, `${socket.id}:chat`, SIGNAL_WINDOW_MS, 40)) return;
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      if (!me) return;
      const text = sanitize(String(data.text || ''), CHAT_MAX).trim();
      if (!text) return;
      io.to(channel.id).emit('audio:chat-message', {
        channelId: channel.id,
        id: generateId('achm'),
        socketId: socket.id,
        nickname: me.nickname,
        text,
        ts: Date.now(),
      });
    });

    on('audio:request-speak', (data) => {
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      if (!me) return;
      me.handRaised = true;
      const slot = Number.isInteger(data.slot) ? Math.max(0, Math.min(MAX_SPEAKERS - 1, data.slot)) : null;
      if (slot != null) {
        const taken = [...channel.members.values()].some((m) => m.slot === slot);
        if (taken) return socket.emit('audio:error', { message: 'That stage slot is taken.' });
        channel.pendingJoins = channel.pendingJoins || [];
        channel.pendingJoins = channel.pendingJoins.filter((p) => p.socketId !== socket.id);
        channel.pendingJoins.push({
          socketId: socket.id,
          nickname: me.nickname,
          slot,
          at: Date.now(),
        });
      }
      broadcastState(channel);
    });

    on('audio:claim-slot', (data) => {
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      if (!me) return;
      const slot = Math.max(0, Math.min((channel.maxSpeakers || MAX_SPEAKERS) - 1, Number(data.slot) || 0));
      const taken = [...channel.members.values()].some((m) => m.slot === slot && m.socketId !== socket.id);
      if (taken) return socket.emit('audio:error', { message: 'That stage slot is taken.' });

      // Host can self-seat; others need approval unless they are already speaker/mod.
      if (me.role === 'host' || (ROLE_RANK[me.role] >= ROLE_RANK.speaker && me.slot == null)) {
        me.slot = slot;
        if (ROLE_RANK[me.role] < ROLE_RANK.speaker) me.role = 'speaker';
        me.handRaised = false;
        channel.pendingJoins = (channel.pendingJoins || []).filter((p) => p.socketId !== socket.id);
        broadcastState(channel);
        return;
      }

      me.handRaised = true;
      channel.pendingJoins = channel.pendingJoins || [];
      channel.pendingJoins = channel.pendingJoins.filter((p) => p.socketId !== socket.id);
      channel.pendingJoins.push({ socketId: socket.id, nickname: me.nickname, slot, at: Date.now() });
      broadcastState(channel);
      for (const m of channel.members.values()) {
        if (ROLE_RANK[m.role] >= ROLE_RANK.moderator) {
          io.to(m.socketId).emit('audio:join-request', { channelId: channel.id, socketId: socket.id, nickname: me.nickname, slot });
        }
      }
    });

    on('audio:approve-join', (data) => {
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      const targetId = String(data.targetSocketId || '');
      const target = channel?.members.get(targetId);
      if (!me || !target) return;
      if (ROLE_RANK[me.role] < ROLE_RANK.moderator) {
        return socket.emit('audio:error', { message: 'Only the host or co-taker can approve joins.' });
      }
      const pending = (channel.pendingJoins || []).find((p) => p.socketId === targetId);
      const slot = Number.isInteger(data.slot) ? data.slot : pending?.slot;
      if (slot == null) return socket.emit('audio:error', { message: 'No slot requested.' });
      if (speakerCount(channel) >= channel.maxSpeakers && ROLE_RANK[target.role] < ROLE_RANK.speaker) {
        return socket.emit('audio:error', { message: 'Stage is full.' });
      }
      const taken = [...channel.members.values()].some((m) => m.slot === slot && m.socketId !== targetId);
      if (taken) return socket.emit('audio:error', { message: 'Slot already filled.' });
      target.role = target.role === 'host' ? 'host' : 'speaker';
      target.slot = slot;
      target.handRaised = false;
      target.forceMuted = false;
      channel.pendingJoins = (channel.pendingJoins || []).filter((p) => p.socketId !== targetId);
      broadcastState(channel);
    });

    on('audio:deny-join', (data) => {
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      if (!me || ROLE_RANK[me.role] < ROLE_RANK.moderator) return;
      const targetId = String(data.targetSocketId || '');
      channel.pendingJoins = (channel.pendingJoins || []).filter((p) => p.socketId !== targetId);
      const target = channel.members.get(targetId);
      if (target) target.handRaised = false;
      broadcastState(channel);
      io.to(targetId).emit('audio:error', { message: 'Stage join was declined.' });
    });

    on('audio:rename', (data) => {
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      if (!me || me.role !== 'host') {
        return socket.emit('audio:error', { message: 'Only the room admin can rename the room.' });
      }
      const topic = sanitize(String(data.topic || ''), TOPIC_MAX);
      if (!topic) return socket.emit('audio:error', { message: 'Name too short.' });
      channel.topic = topic;
      broadcastState(channel);
      broadcastList();
      io.to(channel.id).emit('audio:chat-message', {
        channelId: channel.id,
        id: generateId('achm'),
        socketId: socket.id,
        nickname: me.nickname,
        text: `✏️ renamed the room to “${topic}”`,
        system: true,
        ts: Date.now(),
      });
    });

    on('audio:wallpaper', (data) => {
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      if (!me || me.role !== 'host') {
        return socket.emit('audio:error', { message: 'Only the room admin can set wallpaper.' });
      }
      const wallpaper = data.wallpaper == null ? null : String(data.wallpaper);
      if (wallpaper && (!wallpaper.startsWith('data:image/') || wallpaper.length > WALLPAPER_MAX)) {
        return socket.emit('audio:error', { message: 'Wallpaper must be a small image (max ~300KB).' });
      }
      channel.wallpaper = wallpaper;
      broadcastState(channel);
    });

    on('audio:set-games', (data) => {
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      if (!me || me.role !== 'host') {
        return socket.emit('audio:error', { message: 'Only the room admin can toggle games.' });
      }
      channel.gamesEnabled = !!data.enabled;
      broadcastState(channel);
    });

    on('audio:grant-speak', (data) => {
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      const target = channel?.members.get(String(data.targetSocketId || ''));
      if (!me || !target) return;
      if (ROLE_RANK[me.role] < ROLE_RANK.moderator) {
        return socket.emit('audio:error', { message: 'Only hosts and co-takers can manage speakers.' });
      }
      if (data.grant) {
        if (speakerCount(channel) >= channel.maxSpeakers && ROLE_RANK[target.role] < ROLE_RANK.speaker) {
          return socket.emit('audio:error', { message: 'Speaker slots are full.' });
        }
        target.role = target.role === 'host' ? 'host' : 'speaker';
        target.handRaised = false;
        target.forceMuted = false;
        if (target.slot == null) {
          const used = new Set([...channel.members.values()].map((m) => m.slot).filter((s) => s != null));
          for (let i = 0; i < channel.maxSpeakers; i++) {
            if (!used.has(i)) { target.slot = i; break; }
          }
        }
      } else {
        if (target.role === 'host') return socket.emit('audio:error', { message: 'Cannot move the admin off stage this way.' });
        target.role = 'listener';
        target.micMuted = true;
        target.slot = null;
      }
      channel.pendingJoins = (channel.pendingJoins || []).filter((p) => p.socketId !== target.socketId);
      broadcastState(channel);
    });

    on('audio:moderate', (data) => {
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      const targetId = String(data.targetSocketId || '');
      const target = channel?.members.get(targetId);
      if (!channel || !me) {
        return socket.emit('audio:error', { message: 'Not in this voice room.' });
      }
      if (!target) {
        return socket.emit('audio:error', { message: 'That person is no longer in the room.' });
      }

      const action = String(data.action || '');

      // Host-only: assign / remove co-taker (skip the generic rank gate so host can always promote speakers).
      if (action === 'promote' || action === 'demote') {
        if (me.role !== 'host') {
          return socket.emit('audio:error', { message: 'Only the room admin can assign a co-taker.' });
        }
        if (target.role === 'host' || target.socketId === socket.id) {
          return socket.emit('audio:error', { message: 'Cannot change the admin role.' });
        }
        if (action === 'promote') {
          for (const m of channel.members.values()) {
            if (m.role === 'moderator') m.role = 'speaker';
          }
          target.role = 'moderator';
          if (target.slot == null) {
            const used = new Set([...channel.members.values()].map((m) => m.slot).filter((s) => s != null));
            for (let i = 0; i < channel.maxSpeakers; i++) {
              if (!used.has(i)) { target.slot = i; break; }
            }
          }
          target.micMuted = target.forceMuted ? true : target.micMuted;
          io.to(channel.id).emit('audio:chat-message', {
            channelId: channel.id,
            id: `mod_${Date.now()}`,
            socketId: socket.id,
            nickname: me.nickname || 'Admin',
            text: `🛡️ ${target.nickname} is now co-taker`,
            system: true,
            ts: Date.now(),
          });
        } else {
          target.role = target.slot != null ? 'speaker' : 'listener';
        }
        broadcastState(channel);
        audit?.(`audio_${action}`, { by: me.userId, channelId: channel.id, target: target.userId });
        return;
      }

      if (ROLE_RANK[me.role] < ROLE_RANK.moderator || ROLE_RANK[me.role] <= ROLE_RANK[target.role]) {
        return socket.emit('audio:error', { message: 'Insufficient permissions.' });
      }

      if (action === 'mute') {
        target.forceMuted = true;
        target.micMuted = true;
        io.to(channel.id).emit('audio:speaking', { channelId: channel.id, socketId: targetId, micMuted: true });
      } else if (action === 'unmute') {
        target.forceMuted = false;
      } else if (action === 'kick' || action === 'block') {
        const targetIp = users.get(targetId)?.ip;
        if (targetIp) channel.bannedIps.add(targetIp);
        io.to(targetId).emit('audio:kicked', {
          channelId: channel.id,
          reason: action === 'block' ? 'Blocked from this room.' : 'Removed by a moderator.',
        });
        removeMember(channel.id, targetId, action);
        audit?.(`audio_${action}`, { by: me.userId, channelId: channel.id, target: target.userId });
        return;
      } else {
        return socket.emit('audio:error', { message: 'Unknown moderation action.' });
      }
      broadcastState(channel);
      audit?.(`audio_${action}`, { by: me.userId, channelId: channel.id, target: target.userId });
    });

    socket.on('disconnect', () => {
      const mine = memberships.get(socket.id);
      if (mine) {
        for (const cid of [...mine]) removeMember(cid, socket.id, 'disconnected');
        memberships.delete(socket.id);
      }
      signalRates.delete(socket.id);
    });
  }

  // ---------------- Admin HTTP surface ----------------

  app.get('/api/admin/audio/channels', (req, res) => {
    if (!isAdminRequest(req)) return res.status(403).json({ error: 'Forbidden' });
    res.json({
      channels: [...channels.values()].map((c) => ({
        ...publicChannel(c),
        members: [...c.members.values()].map(memberView),
      })),
    });
  });

  app.post('/api/admin/audio/:channelId/action', (req, res) => {
    if (!isAdminRequest(req)) return res.status(403).json({ error: 'Forbidden' });
    const channel = channels.get(req.params.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const { action, targetSocketId } = req.body || {};
    if (action === 'lock' || action === 'unlock') {
      channel.locked = action === 'lock';
      broadcastState(channel);
    } else if (action === 'destroy') {
      io.to(channel.id).emit('audio:kicked', { channelId: channel.id, reason: 'Channel closed by admin.' });
      for (const sid of [...channel.members.keys()]) removeMember(channel.id, sid, 'admin_closed');
    } else if (action === 'mute' && targetSocketId) {
      const m = channel.members.get(targetSocketId);
      if (m) {
        m.forceMuted = true;
        m.micMuted = true;
        broadcastState(channel);
      }
    } else if (action === 'kick' && targetSocketId) {
      io.to(targetSocketId).emit('audio:kicked', { channelId: channel.id, reason: 'Removed by admin.' });
      removeMember(channel.id, targetSocketId, 'admin_kick');
    } else {
      return res.status(400).json({ error: 'Unknown action' });
    }

    audit?.('admin_audio_action', { channelId: channel.id, action, targetSocketId });
    res.json({ ok: true });
  });

  // Public channel list for the lobby.
  app.get('/api/audio/channels', (_req, res) => {
    res.json({ channels: listChannels() });
  });

  return {
    attachSocketHandlers,
    channels,
    getChannel,
    listChannels,
    broadcastState,
    removeMember,
    publicChannel,
    ROLE_RANK,
  };
}

module.exports = { registerAudioChannels, MAX_MEMBERS, MAX_SPEAKERS };
