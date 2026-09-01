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
 *   audio:lock {channelId, code}              — host sets/clears 4-digit join PIN
 *   audio:hello {channelId, targetSocketId}   — wave hello animation to a user
 *   audio:pa-invite {channelId, targetSocketId}
 *   audio:pa-respond {inviteId, accept}
 *   audio:make-public {channelId}             — PA host opens room to everyone
 *   audio:sticker {channelId, sticker}        — PA sticker burst
 *
 * Server -> client
 *   audio:channels, audio:joined, audio:state, audio:peer-joined,
 *   audio:peer-left, audio:signal, audio:speaking, audio:kicked, audio:error,
 *   audio:chat-message, audio:lock-required, audio:hello, audio:pa-invite,
 *   audio:pa-invite-result, audio:pa-invite-sent, audio:sticker
 */

const MAX_MEMBERS = Number(process.env.AUDIO_MAX_MEMBERS) || 24;
const MAX_SPEAKERS = Number(process.env.AUDIO_MAX_SPEAKERS) || 6;
const TOPIC_MAX = 48;
const CHAT_MAX = 280;
const WALLPAPER_MAX = 550 * 1024; // data-URL cap (~400KB image after base64)
const JOIN_WINDOW_MS = 10000;
const JOIN_MAX = 8;
const SIGNAL_WINDOW_MS = 10000;
const SIGNAL_MAX = 200;

const ROLE_RANK = { cohost: 0, listener: 0, speaker: 1, moderator: 2, host: 3 };
const PA_EMPTY_CLOSE_MS = Number(process.env.PA_EMPTY_CLOSE_MS) || 120000;
const PA_SESSION_MS = Number(process.env.PA_SESSION_MS) || 30 * 60 * 1000;
const HOST_BONUS_MINUTES = 30;
const HOST_BONUS_COINS = 15;
const ALLOWED_ENTRY_FEES = [0, 5, 10, 25, 50];

const livekitRooms = require('./livekitRooms');
const LIVEKIT_AUDIO_THRESHOLD = Number(process.env.LIVEKIT_AUDIO_THRESHOLD) || 4;

const ROOM_THEMES = {
  default: null,
  neon: 'linear-gradient(135deg, rgba(139,92,246,0.35), rgba(6,182,212,0.2))',
  sunset: 'linear-gradient(135deg, rgba(251,146,60,0.35), rgba(244,63,94,0.25))',
  forest: 'linear-gradient(135deg, rgba(16,185,129,0.3), rgba(5,46,22,0.4))',
  gold: 'linear-gradient(135deg, rgba(251,191,36,0.35), rgba(120,53,15,0.35))',
  couple: 'linear-gradient(135deg, rgba(244,114,182,0.35), rgba(167,139,250,0.3))',
};

const HELLO_EMOJI = { wave: '👋', fire: '🔥', heart: '❤️', sparkle: '✨' };

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
    onChannelChange,
    economy,
    screenText,
  } = deps;

  /** channelId -> channel */
  const channels = new Map();
  /** socketId -> Set(channelId) */
  const memberships = new Map();
  const joinRates = new Map();
  const signalRates = new Map();
  /** inviteId -> { fromSocketId, toSocketId, sourceChannelId, fromNickname, at } */
  const paInvites = new Map();
  const paCloseTimers = new Map();
  const paSessionTimers = new Map();
  const hostMinuteTimers = new Map();

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
    isPa: !!c.isPa,
    locked: c.locked || !!c.lockCode || !!c.isPa,
    hasLockCode: !!c.lockCode,
    memberCount: c.members.size,
    speakerCount: [...c.members.values()].filter((m) => ROLE_RANK[m.role] >= ROLE_RANK.speaker).length,
    maxMembers: c.maxMembers,
    maxSpeakers: c.maxSpeakers,
    gamesEnabled: !!c.gamesEnabled,
    wallpaper: c.wallpaper || null,
    themeId: c.themeId || 'default',
    createdAt: c.createdAt,
    hasActiveGame: !!c.gameId,
    entryFee: c.entryFee || 0,
    scheduledStartAt: c.scheduledStartAt || null,
    useSfu: !!c.useSfu,
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
    isCohost: m.role === 'cohost',
  });

  const channelState = (c) => ({
    channelId: c.id,
    topic: c.topic,
    locked: c.locked || !!c.lockCode || !!c.isPa,
    hasLockCode: !!c.lockCode,
    isPrivate: c.isPrivate,
    isPa: !!c.isPa,
    maxMembers: c.maxMembers,
    maxSpeakers: c.maxSpeakers || MAX_SPEAKERS,
    gamesEnabled: c.gamesEnabled !== false,
    wallpaper: c.wallpaper || null,
    themeId: c.themeId || 'default',
    pendingJoins: [...(c.pendingJoins || [])],
    pendingKnocks: [...(c.pendingKnocks || [])].map((k) => ({ socketId: k.socketId, nickname: k.nickname })),
    cohostEnabled: !!c.cohostEnabled,
    cohostJoined: !!c.cohostJoined,
    paEndsAt: c.isPa ? (c.paEndsAt || null) : null,
    paAloneCloseAt: c.isPa ? (c.paAloneCloseAt || null) : null,
    entryFee: c.entryFee || 0,
    scheduledStartAt: c.scheduledStartAt || null,
    useSfu: !!c.useSfu,
    members: [...c.members.values()].map(memberView),
  });

  const broadcastState = (c) => {
    io.to(c.id).emit('audio:state', channelState(c));
    if (typeof onChannelChange === 'function') {
      try {
        onChannelChange(c);
      } catch (_) {
        /* presence must never break room state */
      }
    }
  };

  const listChannels = () =>
    [...channels.values()]
      .filter((c) => !c.isPrivate && !c.isPa)
      .sort((a, b) => b.members.size - a.members.size || b.createdAt - a.createdAt)
      .slice(0, 60)
      .map(publicChannel);

  const listScheduled = () =>
    [...channels.values()]
      .filter((c) => !c.isPa && c.scheduledStartAt && c.scheduledStartAt > Date.now())
      .sort((a, b) => a.scheduledStartAt - b.scheduledStartAt)
      .slice(0, 20)
      .map((c) => ({
        id: c.id,
        topic: c.topic,
        scheduledStartAt: c.scheduledStartAt,
        memberCount: c.members.size,
        entryFee: c.entryFee || 0,
      }));

  const maybeEnableSfu = (c) => {
    if (!c || c.useSfu || c.isPa || !livekitRooms.isConfigured()) return;
    if (c.members.size < LIVEKIT_AUDIO_THRESHOLD) return;
    c.useSfu = true;
    io.to(c.id).emit('audio:sfu-mode', {
      channelId: c.id,
      enabled: true,
      url: livekitRooms.publicUrl(),
    });
    broadcastState(c);
  };

  const broadcastList = () => {
    const payload = { channels: listChannels(), events: listScheduled() };
    io.emit('audio:channels', payload);
    io.emit('audio:scheduled', { events: payload.events });
  };

  const getChannel = (id) => channels.get(String(id || ''));

  const speakerCount = (c) =>
    [...c.members.values()].filter((m) => ROLE_RANK[m.role] >= ROLE_RANK.speaker).length;

  const clearPaCloseTimer = (channelId) => {
    const t = paCloseTimers.get(channelId);
    if (t) clearTimeout(t);
    paCloseTimers.delete(channelId);
    const c = channels.get(channelId);
    if (c) c.paAloneCloseAt = null;
  };

  const clearPaSessionTimer = (channelId) => {
    const t = paSessionTimers.get(channelId);
    if (t) clearTimeout(t);
    paSessionTimers.delete(channelId);
  };

  const startPaSessionTimer = (channel) => {
    if (!channel?.isPa) return;
    clearPaSessionTimer(channel.id);
    channel.paStartedAt = channel.paStartedAt || Date.now();
    channel.paEndsAt = channel.paStartedAt + PA_SESSION_MS;
    const delay = Math.max(0, channel.paEndsAt - Date.now());
    paSessionTimers.set(channel.id, setTimeout(() => {
      const c = channels.get(channel.id);
      if (!c?.isPa) return;
      io.to(c.id).emit('audio:chat-message', {
        channelId: c.id,
        id: generateId('achm'),
        socketId: 'system',
        nickname: 'System',
        text: '⏱️ PA session ended (30 min limit)',
        system: true,
        ts: Date.now(),
      });
      for (const sid of [...c.members.keys()]) removeMember(c.id, sid, 'pa_session_end');
    }, delay));
  };

  const schedulePaClose = (channel) => {
    if (!channel?.isPa) return;
    clearPaCloseTimer(channel.id);
    channel.paAloneCloseAt = null;
    if (channel.members.size > 1) {
      broadcastState(channel);
      return;
    }
    channel.paAloneCloseAt = Date.now() + PA_EMPTY_CLOSE_MS;
    paCloseTimers.set(channel.id, setTimeout(() => {
      const c = channels.get(channel.id);
      if (!c?.isPa || c.members.size > 1) return;
      io.to(c.id).emit('audio:chat-message', {
        channelId: c.id,
        id: generateId('achm'),
        socketId: 'system',
        nickname: 'System',
        text: '⏱️ PA room closed — alone too long',
        system: true,
        ts: Date.now(),
      });
      for (const sid of [...c.members.keys()]) removeMember(c.id, sid, 'pa_timeout');
    }, PA_EMPTY_CLOSE_MS));
    broadcastState(channel);
  };

  const stopHostRewards = (channelId) => {
    const iv = hostMinuteTimers.get(channelId);
    if (iv) clearInterval(iv);
    hostMinuteTimers.delete(channelId);
  };

  const startHostRewards = (channel) => {
    if (!channel || hostMinuteTimers.has(channel.id) || !economy?.credit) return;
    channel.hostMinutes = channel.hostMinutes || 0;
    const iv = setInterval(async () => {
      const c = channels.get(channel.id);
      if (!c || c.members.size === 0) {
        stopHostRewards(channel.id);
        return;
      }
      const host = [...c.members.values()].find((m) => m.role === 'host');
      if (!host) return;
      const hostUser = users.get(host.socketId);
      if (!hostUser?.ip) return;
      c.hostMinutes += 1;
      if (c.hostMinutes > 0 && c.hostMinutes % HOST_BONUS_MINUTES === 0) {
        try {
          const res = await economy.credit(hostUser.ip, HOST_BONUS_COINS, 'audio_host_bonus', { channelId: c.id });
          if (res.ok) {
            io.to(c.id).emit('audio:host-bonus', { channelId: c.id, coins: HOST_BONUS_COINS, minutes: c.hostMinutes });
            io.to(c.id).emit('audio:chat-message', {
              channelId: c.id,
              id: generateId('achm'),
              socketId: host.socketId,
              nickname: host.nickname,
              text: `🪙 Host bonus +${HOST_BONUS_COINS} coins (${c.hostMinutes} min live)`,
              system: true,
              ts: Date.now(),
            });
          }
        } catch { /* ignore */ }
      }
    }, 60000);
    hostMinuteTimers.set(channel.id, iv);
  };

  /** Remove a member; promotes a new host and destroys empty channels. */
  function removeMember(channelId, socketId, reason = 'left') {
    const c = channels.get(channelId);
    if (!c) return;
    const member = c.members.get(socketId);
    if (!member) return;

    if (member.role === 'cohost') {
      c.cohostJoined = false;
      c.cohostSocketId = null;
    }

    c.members.delete(socketId);
    memberships.get(socketId)?.delete(channelId);

    const sock = io.sockets.sockets.get(socketId);
    if (sock) sock.leave(channelId);

    io.to(channelId).emit('audio:peer-left', { channelId, socketId, reason });

    if (c.members.size === 0) {
      clearPaCloseTimer(channelId);
      clearPaSessionTimer(channelId);
      stopHostRewards(channelId);
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

    // Host left — room stays open. Prefer co-taker, else longest-standing member.
    if (member.role === 'host') {
      const remaining = [...c.members.values()].sort((a, b) => a.joinedAt - b.joinedAt);
      const next = remaining.find((m) => m.role === 'moderator') || remaining[0];
      if (next) {
        next.role = 'host';
        next.forceMuted = false;
        if (next.slot == null) next.slot = 0;
        io.to(channelId).emit('audio:chat-message', {
          channelId,
          id: generateId('achm'),
          socketId: next.socketId,
          nickname: next.nickname,
          text: `👑 ${next.nickname} is now room admin — keep talking`,
          system: true,
          ts: Date.now(),
        });
      }
    }
    broadcastState(c);
    broadcastList();
    if (c.isPa) schedulePaClose(c);
  }

  /** Mutual-block check so blocked users never share a voice channel. */
  const blockedBetween = (ipA, ipB) => {
    if (!ipA || !ipB) return false;
    if (userBlocks?.get(ipA)?.has(ipB)) return true;
    if (userBlocks?.get(ipB)?.has(ipA)) return true;
    return false;
  };

  function joinChannel(socket, channel, userData, ip, opts = {}) {
    const lockCode = opts.lockCode;
    const paToken = opts.paToken;
    const knockBypass = !!opts.knockBypass;
    const asCohost = !!opts.asCohost;

    if (asCohost && channel.isPa) {
      if (channel.cohostJoined) {
        socket.emit('audio:error', { message: 'Co-host slot is already taken.' });
        return false;
      }
      const tokenOk = channel.paInviteToken && paToken && paToken === channel.paInviteToken;
      if (!tokenOk) {
        socket.emit('audio:error', { message: 'Invalid co-host invite link.' });
        return false;
      }
    } else if (channel.isPa && Array.isArray(channel.paMembers) && channel.paMembers.length) {
      const tokenOk = channel.paInviteToken && paToken && paToken === channel.paInviteToken;
      if (!channel.paMembers.includes(socket.id) && !tokenOk) {
        socket.emit('audio:error', { message: 'This private PA room is invite-only.' });
        return false;
      }
      if (tokenOk && !channel.paMembers.includes(socket.id)) {
        channel.paMembers.push(socket.id);
      }
    }

    if (channel.lockCode && !channel.members.has(socket.id) && !knockBypass) {
      const code = String(lockCode || '').replace(/\D/g, '');
      if (code !== channel.lockCode) {
        socket.emit('audio:lock-required', { channelId: channel.id, topic: channel.topic, isPa: !!channel.isPa });
        return false;
      }
    } else if (channel.locked && !channel.lockCode && !channel.isPa && !channel.members.has(socket.id)) {
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

    // Creator is host on stage; PA seats speakers; co-host is listen-only.
    const isFirst = channel.members.size === 0;
    let role = 'listener';
    if (isFirst) role = 'host';
    else if (asCohost && channel.isPa) role = 'cohost';
    else if (channel.isPa) role = 'speaker';

    const member = {
      socketId: socket.id,
      userId: userData.id,
      nickname: userData.nickname || 'Anonymous',
      country: userData.country,
      isCreator: !!userData.isCreator,
      verified: !!userData.verified,
      role,
      micMuted: true,
      forceMuted: role === 'cohost',
      handRaised: false,
      slot: role === 'cohost' ? null : isFirst ? 0 : channel.isPa && role === 'speaker' ? Math.min(channel.members.size, (channel.maxSpeakers || 2) - 1) : null,
      joinedAt: Date.now(),
    };
    channel.members.set(socket.id, member);
    if (asCohost) {
      channel.cohostJoined = true;
      channel.cohostSocketId = socket.id;
    }

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
      wallpaper: channel.wallpaper || null,
      gamesEnabled: channel.gamesEnabled !== false,
      pendingJoins: [...(channel.pendingJoins || [])],
      isPa: !!channel.isPa,
      hasLockCode: !!channel.lockCode,
      locked: channel.locked || !!channel.lockCode || !!channel.isPa,
      themeId: channel.themeId || 'default',
      paInviteToken: channel.isPa ? channel.paInviteToken : null,
      paEndsAt: channel.isPa ? (channel.paEndsAt || null) : null,
      paAloneCloseAt: channel.isPa ? (channel.paAloneCloseAt || null) : null,
      entryFee: channel.entryFee || 0,
      scheduledStartAt: channel.scheduledStartAt || null,
      useSfu: !!channel.useSfu,
      pendingKnocks: (channel.pendingKnocks || []).map((k) => ({ socketId: k.socketId, nickname: k.nickname })),
    });
    if (channel.isPa) startPaSessionTimer(channel);
    maybeEnableSfu(channel);
    socket.to(channel.id).emit('audio:peer-joined', { channelId: channel.id, member: memberView(member) });
    broadcastState(channel);
    broadcastList();
    if (channel.isPa) {
      if (channel.members.size >= 2) clearPaCloseTimer(channel.id);
      else schedulePaClose(channel);
    }
    if (isFirst || !hostMinuteTimers.has(channel.id)) startHostRewards(channel);
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
      socket.emit('audio:channels', { channels: listChannels(), events: listScheduled() });
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
        entryFee: 0,
        scheduledStartAt: null,
        useSfu: false,
      };
      channels.set(channel.id, channel);
      if (typeof data.nickname === 'string') userData.nickname = sanitize(data.nickname, 30);
      joinChannel(socket, channel, userData, ip);
      audit?.('audio_channel_created', { ip, channelId: channel.id, topic });
    });

    on('audio:join', async (data) => {
      if (!rateOk(joinRates, ip, JOIN_WINDOW_MS, JOIN_MAX)) {
        return socket.emit('audio:error', { message: 'Slow down — too many join attempts.' });
      }
      const userData = users.get(socket.id);
      const channel = getChannel(data.channelId);
      if (!userData || !channel) return socket.emit('audio:error', { message: 'Channel not found.' });
      if (typeof data.nickname === 'string') userData.nickname = sanitize(data.nickname, 30);

      // Re-sync if the client lost state but the server still has membership.
      if (channel.members.has(socket.id)) {
        const member = channel.members.get(socket.id);
        if (!memberships.has(socket.id)) memberships.set(socket.id, new Set());
        memberships.get(socket.id).add(channel.id);
        socket.join(channel.id);
        const peers = [...channel.members.values()]
          .filter((m) => m.socketId !== socket.id)
          .map(memberView);
        socket.emit('audio:joined', {
          channelId: channel.id,
          topic: channel.topic,
          you: memberView(member),
          peers,
          maxSpeakers: channel.maxSpeakers,
          wallpaper: channel.wallpaper || null,
          gamesEnabled: channel.gamesEnabled !== false,
          pendingJoins: [...(channel.pendingJoins || [])],
          isPa: !!channel.isPa,
          hasLockCode: !!channel.lockCode,
          locked: channel.locked || !!channel.lockCode || !!channel.isPa,
          themeId: channel.themeId || 'default',
          entryFee: channel.entryFee || 0,
          useSfu: !!channel.useSfu,
        });
        broadcastState(channel);
        return;
      }

      const fee = Number(channel.entryFee) || 0;
      if (fee > 0 && !channel.isPa && economy?.debit) {
        const hostMember = [...channel.members.values()].find((m) => m.role === 'host');
        const hostIp = hostMember && users.get(hostMember.socketId)?.ip;
        try {
          const spent = await economy.debit(ip, fee, 'audio_room_entry', { channelId: channel.id });
          if (!spent.ok) {
            return socket.emit('audio:error', {
              message: `This room costs ${fee} coins to enter.`,
              needCoins: fee,
            });
          }
          if (hostIp && hostIp !== ip && economy.credit) {
            const hostShare = Math.max(1, Math.floor(fee * 0.85));
            await economy.credit(hostIp, hostShare, 'audio_room_entry_host', { channelId: channel.id, from: ip });
            const hostSid = hostMember?.socketId;
            if (hostSid) {
              io.to(hostSid).emit('audio:entry-fee-earned', { channelId: channel.id, coins: hostShare });
            }
          }
        } catch {
          return socket.emit('audio:error', { message: 'Could not process entry fee.' });
        }
      }

      joinChannel(socket, channel, userData, ip, {
        lockCode: data.lockCode,
        paToken: data.paToken,
        asCohost: !!data.asCohost,
      });
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
      // Also push member list so UI badges stay correct for late joiners.
      broadcastState(channel);
    });

    on('audio:chat', async (data) => {
      if (!rateOk(signalRates, `${socket.id}:chat`, SIGNAL_WINDOW_MS, 40)) return;
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      if (!me) return;
      const text = sanitize(String(data.text || ''), CHAT_MAX).trim();
      if (!text) return;
      if (typeof screenText === 'function') {
        try {
          const verdict = await screenText(ip, text, 'audio_chat');
          if (verdict && verdict.allow === false) {
            return socket.emit('audio:error', { message: 'Message blocked by moderation.' });
          }
        } catch { /* fail open */ }
      }
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
      // `audio:join-request` announces the requester as `socketId`; accept that
      // spelling too so echoing the request payload back approves it.
      const targetId = String(data.targetSocketId || data.socketId || '');
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
      const targetId = String(data.targetSocketId || data.socketId || '');
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
        return socket.emit('audio:error', { message: 'Wallpaper must be a small image (under ~400KB). Try another photo.' });
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

    on('audio:lock', (data) => {
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      if (!me || me.role !== 'host') {
        return socket.emit('audio:error', { message: 'Only the room admin can lock the room.' });
      }
      if (channel.isPa) {
        return socket.emit('audio:error', { message: 'PA rooms are always private — use Make Public to open.' });
      }
      let code = data.code;
      if (code == null || code === '') {
        channel.lockCode = null;
        channel.locked = false;
      } else {
        code = String(code).replace(/\D/g, '').slice(0, 4);
        if (code.length !== 4) {
          return socket.emit('audio:error', { message: 'Lock code must be exactly 4 digits.' });
        }
        channel.lockCode = code;
        channel.locked = true;
      }
      broadcastState(channel);
      broadcastList();
      io.to(channel.id).emit('audio:chat-message', {
        channelId: channel.id,
        id: generateId('achm'),
        socketId: socket.id,
        nickname: me.nickname,
        text: channel.lockCode ? '🔒 Room locked with a 4-digit code' : '🔓 Room lock removed',
        system: true,
        ts: Date.now(),
      });
      audit?.('audio_lock', { by: me.userId, channelId: channel.id, locked: !!channel.lockCode });
    });

    on('audio:hello', (data) => {
      if (!rateOk(signalRates, `${socket.id}:hello`, SIGNAL_WINDOW_MS, 20)) return;
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      const targetId = String(data.targetSocketId || '');
      const target = channel?.members.get(targetId);
      if (!me || !target || targetId === socket.id) return;
      const helloType = String(data.helloType || 'wave').slice(0, 12);
      const emoji = HELLO_EMOJI[helloType] || HELLO_EMOJI.wave;
      io.to(channel.id).emit('audio:hello', {
        channelId: channel.id,
        fromSocketId: socket.id,
        fromNickname: me.nickname,
        toSocketId: targetId,
        toNickname: target.nickname,
        helloType,
        emoji,
      });
    });

    on('audio:knock', (data) => {
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      const userData = users.get(socket.id);
      if (!userData || channel.members.has(socket.id)) return;
      if (!channel?.lockCode && !channel?.locked) {
        return socket.emit('audio:error', { message: 'This room is not locked.' });
      }
      channel.pendingKnocks = channel.pendingKnocks || [];
      if (channel.pendingKnocks.some((k) => k.socketId === socket.id)) {
        return socket.emit('audio:error', { message: 'Already knocking — wait for admin.' });
      }
      channel.pendingKnocks.push({ socketId: socket.id, nickname: userData.nickname || 'Guest', at: Date.now() });
      broadcastState(channel);
      for (const m of channel.members.values()) {
        if (ROLE_RANK[m.role] >= ROLE_RANK.moderator) {
          io.to(m.socketId).emit('audio:knock-request', {
            channelId: channel.id,
            socketId: socket.id,
            nickname: userData.nickname || 'Guest',
          });
        }
      }
      socket.emit('audio:knock-sent', { channelId: channel.id });
    });

    on('audio:approve-knock', (data) => {
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      const targetId = String(data.targetSocketId || data.socketId || '');
      if (!me || ROLE_RANK[me.role] < ROLE_RANK.moderator) return;
      channel.pendingKnocks = (channel.pendingKnocks || []).filter((k) => k.socketId !== targetId);
      broadcastState(channel);
      const targetSock = io.sockets.sockets.get(targetId);
      const targetUser = users.get(targetId);
      if (targetSock && targetUser) {
        joinChannel(targetSock, channel, targetUser, targetUser.ip, { knockBypass: true });
      }
    });

    on('audio:deny-knock', (data) => {
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      const targetId = String(data.targetSocketId || data.socketId || '');
      if (!me || ROLE_RANK[me.role] < ROLE_RANK.moderator) return;
      channel.pendingKnocks = (channel.pendingKnocks || []).filter((k) => k.socketId !== targetId);
      broadcastState(channel);
      io.to(targetId).emit('audio:error', { message: 'Knock declined.' });
    });

    on('audio:set-theme', (data) => {
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      if (!me || me.role !== 'host') {
        return socket.emit('audio:error', { message: 'Only the room admin can set theme.' });
      }
      const themeId = String(data.themeId || 'default');
      channel.themeId = ROOM_THEMES[themeId] != null ? themeId : 'default';
      broadcastState(channel);
    });

    on('audio:set-entry-fee', (data) => {
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      if (!me || me.role !== 'host' || channel.isPa) {
        return socket.emit('audio:error', { message: 'Only the room admin can set entry fee.' });
      }
      const fee = ALLOWED_ENTRY_FEES.includes(Number(data.entryFee)) ? Number(data.entryFee) : 0;
      channel.entryFee = fee;
      broadcastState(channel);
      broadcastList();
      socket.emit('audio:chat-message', {
        channelId: channel.id,
        id: generateId('achm'),
        socketId: socket.id,
        nickname: me.nickname,
        text: fee > 0 ? `🪙 Entry fee set to ${fee} coins` : '🆓 Room is now free to enter',
        system: true,
        ts: Date.now(),
      });
    });

    on('audio:schedule-event', (data) => {
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      if (!me || me.role !== 'host' || channel.isPa) {
        return socket.emit('audio:error', { message: 'Only the room admin can schedule events.' });
      }
      const startsAt = Number(data.startsAt);
      if (!startsAt || startsAt <= Date.now()) {
        return socket.emit('audio:error', { message: 'Pick a future start time.' });
      }
      channel.scheduledStartAt = startsAt;
      channel.scheduledTopic = sanitize(String(data.topic || channel.topic), TOPIC_MAX);
      channel.reminderSent = false;
      broadcastState(channel);
      broadcastList();
      io.emit('audio:event-scheduled', {
        channelId: channel.id,
        topic: channel.scheduledTopic || channel.topic,
        startsAt: channel.scheduledStartAt,
        entryFee: channel.entryFee || 0,
      });
    });

    on('audio:sticker', (data) => {
      if (!rateOk(signalRates, `${socket.id}:sticker`, SIGNAL_WINDOW_MS, 24)) return;
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      if (!me) return;
      const sticker = sanitize(String(data.sticker || ''), 8).trim();
      if (!sticker) return;
      io.to(channel.id).emit('audio:sticker', {
        channelId: channel.id,
        fromSocketId: socket.id,
        fromNickname: me.nickname,
        sticker,
        ts: Date.now(),
      });
    });

    on('audio:pa-invite', (data) => {
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      const targetId = String(data.targetSocketId || '');
      const target = channel?.members.get(targetId);
      if (!me || !target || targetId === socket.id) {
        return socket.emit('audio:error', { message: 'Cannot invite that user.' });
      }
      if (channel.isPa) {
        return socket.emit('audio:error', { message: 'Already in a PA room.' });
      }
      const inviteId = generateId('pinv');
      paInvites.set(inviteId, {
        fromSocketId: socket.id,
        toSocketId: targetId,
        sourceChannelId: channel.id,
        fromNickname: me.nickname,
        at: Date.now(),
      });
      io.to(targetId).emit('audio:pa-invite', {
        inviteId,
        fromSocketId: socket.id,
        fromNickname: me.nickname,
        channelId: channel.id,
        notify: true,
      });
      socket.emit('audio:pa-invite-sent', { inviteId, targetNickname: target.nickname });
    });

    on('audio:pa-respond', (data) => {
      const inviteId = String(data.inviteId || '');
      const invite = paInvites.get(inviteId);
      if (!invite || invite.toSocketId !== socket.id) {
        return socket.emit('audio:error', { message: 'Invite expired or invalid.' });
      }
      paInvites.delete(inviteId);

      if (!data.accept) {
        io.to(invite.fromSocketId).emit('audio:pa-invite-result', {
          accepted: false,
          inviteId,
          targetNickname: users.get(socket.id)?.nickname || 'User',
        });
        return;
      }

      const source = getChannel(invite.sourceChannelId);
      const fromMember = source?.members.get(invite.fromSocketId);
      const toMember = source?.members.get(invite.toSocketId);
      const fromUser = users.get(invite.fromSocketId);
      const toUser = users.get(invite.toSocketId);
      if (!fromMember || !toMember || !fromUser || !toUser) {
        socket.emit('audio:error', { message: 'Could not start PA — someone left the room.' });
        io.to(invite.fromSocketId).emit('audio:pa-invite-result', { accepted: false, inviteId, reason: 'left' });
        return;
      }

      const topic = `🔒 PA · ${fromMember.nickname} & ${toMember.nickname}`;
      const paChannel = {
        id: generateId('ach'),
        topic,
        isPrivate: false,
        isPa: true,
        locked: true,
        lockCode: null,
        paInviteToken: generateId('pat'),
        paMembers: [invite.fromSocketId, invite.toSocketId],
        cohostEnabled: true,
        cohostJoined: false,
        cohostSocketId: null,
        maxMembers: 3,
        maxSpeakers: 2,
        members: new Map(),
        bannedIps: new Set(),
        pendingJoins: [],
        gamesEnabled: true,
        wallpaper: null,
        createdAt: Date.now(),
        gameId: null,
        paStartedAt: Date.now(),
        paEndsAt: Date.now() + PA_SESSION_MS,
      };
      channels.set(paChannel.id, paChannel);

      const fromSock = io.sockets.sockets.get(invite.fromSocketId);
      const toSock = io.sockets.sockets.get(invite.toSocketId);
      const fromIp = fromUser.ip;
      const toIp = toUser.ip;

      if (source) {
        removeMember(invite.sourceChannelId, invite.fromSocketId, 'pa_left');
        removeMember(invite.sourceChannelId, invite.toSocketId, 'pa_left');
      }

      if (fromSock) joinChannel(fromSock, paChannel, fromUser, fromIp);
      if (toSock) joinChannel(toSock, paChannel, toUser, toIp);

      io.to(invite.fromSocketId).emit('audio:pa-invite-result', {
        accepted: true,
        inviteId,
        channelId: paChannel.id,
        targetNickname: toMember.nickname,
      });
      io.to(invite.toSocketId).emit('audio:pa-invite-result', {
        accepted: true,
        inviteId,
        channelId: paChannel.id,
        targetNickname: fromMember.nickname,
      });
      audit?.('audio_pa_created', { channelId: paChannel.id, from: fromUser.id, to: toUser.id });
    });

    on('audio:make-public', (data) => {
      const channel = getChannel(data.channelId);
      const me = channel?.members.get(socket.id);
      if (!me || me.role !== 'host') {
        return socket.emit('audio:error', { message: 'Only the room admin can open this PA room.' });
      }
      if (!channel.isPa) {
        return socket.emit('audio:error', { message: 'This is not a PA room.' });
      }
      channel.isPa = false;
      channel.locked = false;
      channel.lockCode = null;
      channel.paMembers = null;
      channel.maxMembers = MAX_MEMBERS;
      channel.maxSpeakers = MAX_SPEAKERS;
      channel.topic = channel.topic.replace(/^🔒 PA · /, '').trim() || 'Open voice room';
      broadcastState(channel);
      broadcastList();
      io.to(channel.id).emit('audio:chat-message', {
        channelId: channel.id,
        id: generateId('achm'),
        socketId: socket.id,
        nickname: me.nickname,
        text: '🌐 PA room is now public — anyone can join',
        system: true,
        ts: Date.now(),
      });
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
        if (action === 'block' && targetIp && ip && targetIp !== ip) {
          if (!userBlocks.has(ip)) userBlocks.set(ip, new Set());
          userBlocks.get(ip).add(targetIp);
        }
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
    res.json({ channels: listChannels(), scheduled: listScheduled() });
  });

  // Remind subscribers ~15 min before scheduled events
  const reminderIv = setInterval(() => {
    const soon = Date.now() + 15 * 60 * 1000;
    for (const c of channels.values()) {
      if (c.isPa || !c.scheduledStartAt || c.reminderSent) continue;
      if (c.scheduledStartAt <= Date.now() || c.scheduledStartAt > soon) continue;
      c.reminderSent = true;
      io.emit('audio:event-reminder', {
        channelId: c.id,
        topic: c.scheduledTopic || c.topic,
        startsAt: c.scheduledStartAt,
        entryFee: c.entryFee || 0,
      });
    }
  }, 60000);
  if (typeof reminderIv.unref === 'function') reminderIv.unref();

  /** Kick a user from every voice channel (global block enforcement). */
  function kickByIp(targetIp, reason = 'blocked') {
    if (!targetIp) return;
    for (const c of channels.values()) {
      for (const sid of [...c.members.keys()]) {
        const memberIp = users.get(sid)?.ip;
        if (memberIp !== targetIp) continue;
        io.to(sid).emit('audio:kicked', { channelId: c.id, reason: 'You were blocked.' });
        removeMember(c.id, sid, reason);
      }
    }
  }

  return {
    attachSocketHandlers,
    channels,
    getChannel,
    listChannels,
    listScheduled,
    broadcastState,
    removeMember,
    kickByIp,
    publicChannel,
    ROLE_RANK,
  };
}

module.exports = { registerAudioChannels, MAX_MEMBERS, MAX_SPEAKERS };
