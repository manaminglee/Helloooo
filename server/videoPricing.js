/**
 * Video + group-video pricing and session helpers.
 *
 * Payments are OPTIONAL and OFF by default. Flip VIDEO_PAYMENTS_ENABLED=true
 * to charge premium extras through the existing coin wallet. Price points live
 * here (overridable via env) so client and server stay on one catalog.
 *
 * When the flag is off every extra is free, no paywall should render, and
 * matching/session limits are not applied.
 */

function envFlag(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

function envNum(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const DEFAULTS = {
  video: {
    freeSessionSeconds: 300,
    extendSessionSeconds: 600,
    extendSessionCoins: 15,
    unlimitedSessionCoins: 50,
    genderFilterCoins: 10,
    countryFilterCoins: 8,
    regionFilterCoins: 12,
    reconnectCoins: 20,
  },
  groupVideo: {
    freeMaxSize: 4,
    creatorFreeMaxSize: 8,
    largeMaxSize: 8,
    largeRoomCoins: 25,
    extraLargeMaxSize: 12,
    extraLargeRoomCoins: 50,
    privateRoomCoins: 30,
    brandedRoomCoins: 0,
    allowedEntryFees: [0, 5, 10, 25, 50],
    hostEntryShare: 0.7,
  },
};

function getVideoPricing() {
  return {
    enabled: envFlag('VIDEO_PAYMENTS_ENABLED', false),
    currency: 'coins',
    video: {
      freeSessionSeconds: envNum('VIDEO_FREE_SESSION_SECONDS', DEFAULTS.video.freeSessionSeconds),
      extendSessionSeconds: envNum('VIDEO_EXTEND_SESSION_SECONDS', DEFAULTS.video.extendSessionSeconds),
      extendSessionCoins: envNum('VIDEO_EXTEND_SESSION_COINS', DEFAULTS.video.extendSessionCoins),
      unlimitedSessionCoins: envNum('VIDEO_UNLIMITED_SESSION_COINS', DEFAULTS.video.unlimitedSessionCoins),
      genderFilterCoins: envNum('VIDEO_GENDER_FILTER_COINS', DEFAULTS.video.genderFilterCoins),
      countryFilterCoins: envNum('VIDEO_COUNTRY_FILTER_COINS', DEFAULTS.video.countryFilterCoins),
      regionFilterCoins: envNum('VIDEO_REGION_FILTER_COINS', DEFAULTS.video.regionFilterCoins),
      reconnectCoins: envNum('VIDEO_RECONNECT_COINS', DEFAULTS.video.reconnectCoins),
    },
    groupVideo: {
      freeMaxSize: envNum('VIDEO_GROUP_FREE_MAX', DEFAULTS.groupVideo.freeMaxSize),
      creatorFreeMaxSize: envNum('VIDEO_GROUP_CREATOR_FREE_MAX', DEFAULTS.groupVideo.creatorFreeMaxSize),
      largeMaxSize: envNum('VIDEO_GROUP_LARGE_MAX', DEFAULTS.groupVideo.largeMaxSize),
      largeRoomCoins: envNum('VIDEO_GROUP_LARGE_COINS', DEFAULTS.groupVideo.largeRoomCoins),
      extraLargeMaxSize: envNum('VIDEO_GROUP_XL_MAX', DEFAULTS.groupVideo.extraLargeMaxSize),
      extraLargeRoomCoins: envNum('VIDEO_GROUP_XL_COINS', DEFAULTS.groupVideo.extraLargeRoomCoins),
      privateRoomCoins: envNum('VIDEO_GROUP_PRIVATE_COINS', DEFAULTS.groupVideo.privateRoomCoins),
      brandedRoomCoins: envNum('VIDEO_GROUP_BRANDED_COINS', DEFAULTS.groupVideo.brandedRoomCoins),
      allowedEntryFees: DEFAULTS.groupVideo.allowedEntryFees,
      hostEntryShare: DEFAULTS.groupVideo.hostEntryShare,
    },
  };
}

function paymentsEnabled() {
  return getVideoPricing().enabled;
}

function publicCatalog() {
  const pricing = getVideoPricing();
  return {
    enabled: pricing.enabled,
    currency: pricing.currency,
    video: { ...pricing.video },
    groupVideo: { ...pricing.groupVideo },
    // What the UI can offer without inventing prices itself.
    extras: {
      genderFilter: true,
      countryFilter: true,
      regionFilter: true,
      reconnect: true,
      sessionExtend: true,
      largeGroup: true,
      privateGroup: true,
      brandedGroup: true,
    },
  };
}

function normalizeGender(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'male' || v === 'm' || v === 'man') return 'male';
  if (v === 'female' || v === 'f' || v === 'woman') return 'female';
  if (v === 'other' || v === 'nonbinary' || v === 'non-binary' || v === 'nb' || v === 'non binary') return 'other';
  return '';
}

function gendersCompatible(myGender, myWant, theirGender, theirWant) {
  const want = normalizeGender(myWant);
  const theyWant = normalizeGender(theirWant);
  if (want && normalizeGender(theirGender) !== want) return false;
  if (theyWant && normalizeGender(myGender) !== theyWant) return false;
  return true;
}

function filterCost({
  matchGender,
  matchCountryOnly,
  matchRegionOnly,
  reconnectToUserId,
  isPro,
} = {}) {
  const pricing = getVideoPricing();
  const items = [];
  if (!pricing.enabled || isPro) {
    return { coins: 0, items, complimentary: true };
  }
  const v = pricing.video;
  if (normalizeGender(matchGender)) items.push({ id: 'gender', coins: v.genderFilterCoins, label: 'Gender filter' });
  if (matchCountryOnly) items.push({ id: 'country', coins: v.countryFilterCoins, label: 'Country filter' });
  if (matchRegionOnly) items.push({ id: 'region', coins: v.regionFilterCoins, label: 'Region filter' });
  if (reconnectToUserId) items.push({ id: 'reconnect', coins: v.reconnectCoins, label: 'Reconnect' });
  return {
    coins: items.reduce((sum, item) => sum + item.coins, 0),
    items,
    complimentary: false,
  };
}

function sessionLimitSeconds({ isPro } = {}) {
  const pricing = getVideoPricing();
  if (!pricing.enabled || isPro) return null;
  return pricing.video.freeSessionSeconds;
}

function freeGroupMaxSize(isCreator) {
  const g = getVideoPricing().groupVideo;
  return isCreator ? g.creatorFreeMaxSize : g.freeMaxSize;
}

function clampGroupMaxSize(requested, isCreator) {
  const g = getVideoPricing().groupVideo;
  const fallback = freeGroupMaxSize(isCreator);
  const raw = Number(requested);
  const allowed = [...new Set([g.freeMaxSize, g.creatorFreeMaxSize, g.largeMaxSize, g.extraLargeMaxSize])];
  if (!Number.isFinite(raw)) return fallback;
  if (allowed.includes(raw)) return Math.min(raw, g.extraLargeMaxSize);
  return fallback;
}

function groupCreateCost({ maxSize, isPrivate, isCreator } = {}) {
  const pricing = getVideoPricing();
  const items = [];
  if (!pricing.enabled) return { coins: 0, items, complimentary: true };
  const g = pricing.groupVideo;
  const freeCap = freeGroupMaxSize(isCreator);
  const size = clampGroupMaxSize(maxSize, isCreator);
  if (size > freeCap) {
    if (size <= g.largeMaxSize) items.push({ id: 'large', coins: g.largeRoomCoins, label: 'Larger room' });
    else items.push({ id: 'xl', coins: g.extraLargeRoomCoins, label: 'Extra-large room' });
  }
  if (isPrivate) items.push({ id: 'private', coins: g.privateRoomCoins, label: 'Private room' });
  return {
    coins: items.reduce((sum, item) => sum + item.coins, 0),
    items,
    complimentary: false,
  };
}

function assertEntryFee(raw) {
  const fee = Number(raw) || 0;
  const allowed = getVideoPricing().groupVideo.allowedEntryFees;
  return allowed.includes(fee) ? fee : 0;
}

function effectiveEntryFee(room) {
  if (!paymentsEnabled()) return 0;
  return assertEntryFee(room?.entryFee);
}

async function chargeIfNeeded(wallet, ctx, cost, reason, meta) {
  const coins = Math.floor(Number(cost?.coins) || 0);
  if (coins <= 0) {
    const balance = wallet?.getBalance ? await wallet.getBalance(ctx) : 0;
    return { ok: true, charged: 0, balance };
  }
  if (!wallet) return { ok: false, error: 'Wallet unavailable', needCoins: coins };
  const balance = await wallet.getBalance(ctx);
  if (balance < coins) {
    return { ok: false, error: 'Insufficient coins', needCoins: coins, balance, items: cost.items || [] };
  }
  const spend = await wallet.debit(ctx, coins, reason, meta);
  if (!spend?.ok) {
    return {
      ok: false,
      error: spend?.error || 'Payment failed',
      needCoins: coins,
      balance,
      items: cost.items || [],
    };
  }
  return {
    ok: true,
    charged: coins,
    balance: spend.balance ?? spend.identity?.coins ?? balance - coins,
    items: cost.items || [],
  };
}

function publicSessionState(room) {
  const session = room?.videoSession;
  if (!session) return { unlimited: true, remainingSeconds: null, paused: false, endsAt: null };
  const remaining = session.unlimited || !session.videoUntil
    ? null
    : Math.max(0, Math.ceil((session.videoUntil - Date.now()) / 1000));
  return {
    unlimited: !!session.unlimited,
    remainingSeconds: remaining,
    paused: !!session.paused,
    endsAt: session.unlimited ? null : (session.videoUntil || null),
  };
}

function clearVideoTimers(room) {
  if (!room) return;
  if (room._videoExpiryTimer) {
    clearTimeout(room._videoExpiryTimer);
    room._videoExpiryTimer = null;
  }
  if (room._videoWarnTimer) {
    clearTimeout(room._videoWarnTimer);
    room._videoWarnTimer = null;
  }
}

function scheduleVideoExpiry(room, io) {
  clearVideoTimers(room);
  const session = room?.videoSession;
  if (!session || session.unlimited || !session.videoUntil || !io) return;
  const ms = session.videoUntil - Date.now();
  if (ms > 60000) {
    room._videoWarnTimer = setTimeout(() => {
      if (!room.videoSession || room.videoSession.paused) return;
      io.to(room.id).emit('video:time-warning', {
        roomId: room.id,
        remainingSeconds: 60,
        session: publicSessionState(room),
      });
    }, ms - 60000);
  }
  room._videoExpiryTimer = setTimeout(() => {
    if (!room.videoSession) return;
    room.videoSession.paused = true;
    io.to(room.id).emit('video:session-paused', {
      roomId: room.id,
      reason: 'time_up',
      session: publicSessionState(room),
      pricing: publicCatalog(),
    });
  }, Math.max(0, ms));
}

function startVideoSession(room, { unlimited, freeSeconds, io } = {}) {
  if (!room) return null;
  clearVideoTimers(room);
  const open = !!unlimited || !freeSeconds;
  room.videoSession = {
    startedAt: Date.now(),
    unlimited: open,
    videoUntil: open ? null : Date.now() + freeSeconds * 1000,
    paused: false,
  };
  scheduleVideoExpiry(room, io);
  return publicSessionState(room);
}

function extendVideoSession(room, { seconds, unlimited, io } = {}) {
  if (!room?.videoSession) {
    room.videoSession = { startedAt: Date.now(), unlimited: false, videoUntil: Date.now(), paused: true };
  }
  if (unlimited) {
    room.videoSession.unlimited = true;
    room.videoSession.videoUntil = null;
    room.videoSession.paused = false;
    clearVideoTimers(room);
  } else {
    const extra = Math.max(0, Number(seconds) || 0) * 1000;
    const base = Math.max(Date.now(), room.videoSession.videoUntil || Date.now());
    room.videoSession.videoUntil = base + extra;
    room.videoSession.unlimited = false;
    room.videoSession.paused = false;
    scheduleVideoExpiry(room, io);
  }
  return publicSessionState(room);
}

function bumpCreatorStats(userData, field, amount = 1) {
  if (!userData?.isCreator) return null;
  if (!userData.creatorVideoStats) {
    userData.creatorVideoStats = { matches: 0, seconds: 0, followInvites: 0, followsGained: 0 };
  }
  if (field in userData.creatorVideoStats) {
    userData.creatorVideoStats[field] += amount;
  }
  return userData.creatorVideoStats;
}

function ensureAnonHandle(userData, randomBytes) {
  if (userData.anonHandle) return userData.anonHandle;
  const bytes = typeof randomBytes === 'function' ? randomBytes(3) : require('crypto').randomBytes(3);
  userData.anonHandle = `anon-${Buffer.from(bytes).toString('hex')}`;
  return userData.anonHandle;
}

function registerVideoPricing(app) {
  if (!app) return;
  app.get('/api/pricing/video', (_req, res) => {
    res.json({ ok: true, ...publicCatalog() });
  });
}

function attachSocketHandlers(socket, deps) {
  const {
    io,
    rooms,
    users,
    economy,
    socialFollow,
    sanitize,
    ip,
  } = deps || {};

  const wallet = economy?.wallet;

  socket.on('video:extend-session', async (data) => {
    if (!paymentsEnabled()) {
      return socket.emit('video:session-extended', { complimentary: true, session: { unlimited: true } });
    }
    const room = rooms?.get(String(data?.roomId || ''));
    if (!room || !room.users.has(socket.id) || (room.mode !== 'video' && room.mode !== 'group_video')) {
      return socket.emit('video:need-coins', { message: 'No active video session.' });
    }
    const pricing = getVideoPricing();
    const wantUnlimited = !!data?.unlimited;
    const cost = {
      coins: wantUnlimited ? pricing.video.unlimitedSessionCoins : pricing.video.extendSessionCoins,
      items: [{ id: wantUnlimited ? 'unlimited' : 'extend', coins: wantUnlimited ? pricing.video.unlimitedSessionCoins : pricing.video.extendSessionCoins }],
    };
    const ctx = wallet?.ctxFromSocket(socket.id, ip);
    const spend = await chargeIfNeeded(wallet, ctx, cost, wantUnlimited ? 'video_session_unlimited' : 'video_session_extend', { roomId: room.id });
    if (!spend.ok) {
      return socket.emit('video:need-coins', {
        message: spend.error || 'Not enough coins to extend.',
        needCoins: spend.needCoins,
        balance: spend.balance,
        items: spend.items,
      });
    }
    const session = extendVideoSession(room, {
      seconds: pricing.video.extendSessionSeconds,
      unlimited: wantUnlimited,
      io,
    });
    io.to(room.id).emit('video:session-extended', {
      roomId: room.id,
      session,
      unlimited: wantUnlimited,
      by: socket.id,
    });
  });

  socket.on('match-connect-request', (data) => {
    const room = rooms?.get(String(data?.roomId || ''));
    if (!room || !room.users.has(socket.id)) return;
    const me = users.get(socket.id);
    const kind = data?.kind === 'follow-creator' ? 'follow-creator' : 'friend';
    if (kind === 'follow-creator' && !me?.isCreator) return;
    if (!room.connectRequests) room.connectRequests = new Map();
    room.connectRequests.set(socket.id, { kind, at: Date.now() });
    if (kind === 'follow-creator') bumpCreatorStats(me, 'followInvites');
    const payload = {
      roomId: room.id,
      from: socket.id,
      kind,
      creatorBadge: !!me?.isCreator,
      creatorHandle: me?.isCreator
        ? String(me.creatorData?.handle_name || me.nickname || 'Creator').slice(0, 30)
        : undefined,
    };
    socket.to(room.id).emit('match-connect-request', payload);
    socket.emit('match-connect-sent', payload);
  });

  socket.on('match-connect-response', async (data) => {
    const room = rooms?.get(String(data?.roomId || ''));
    if (!room || !room.users.has(socket.id)) return;
    const accepted = !!data?.accepted;
    const fromId = String(data?.from || '');
    const pending = room.connectRequests?.get(fromId);
    if (!pending || !room.users.has(fromId)) return;
    room.connectRequests.delete(fromId);
    if (!accepted) {
      io.to(fromId).emit('match-connect-declined', { roomId: room.id, by: socket.id });
      return;
    }

    const me = users.get(socket.id);
    const them = users.get(fromId);
    const myAudio = me?.audioIdentity?.username ? String(me.audioIdentity.username).toLowerCase() : null;
    const theirAudio = them?.audioIdentity?.username ? String(them.audioIdentity.username).toLowerCase() : null;
    const creatorKey = them?.isCreator && them?.creatorData?.id
      ? socialFollow?.makeKey?.('creator', them.creatorData.id)
      : (me?.isCreator && me?.creatorData?.id ? socialFollow?.makeKey?.('creator', me.creatorData.id) : null);

    let followed = false;
    let needsIdentity = false;
    try {
      if (pending.kind === 'follow-creator' && creatorKey && socialFollow?.follow) {
        const followerKey = myAudio && them?.isCreator
          ? socialFollow.makeKey('audio', myAudio)
          : (theirAudio && me?.isCreator ? socialFollow.makeKey('audio', theirAudio) : null);
        if (!followerKey) needsIdentity = true;
        else {
          const result = await socialFollow.follow(followerKey, creatorKey);
          followed = !!result?.ok;
          if (followed) bumpCreatorStats(them?.isCreator ? them : me, 'followsGained');
        }
      } else if (myAudio && theirAudio && socialFollow?.follow) {
        const a = socialFollow.makeKey('audio', myAudio);
        const b = socialFollow.makeKey('audio', theirAudio);
        await socialFollow.follow(a, b);
        await socialFollow.follow(b, a);
        followed = true;
      } else {
        needsIdentity = true;
      }
    } catch {
      needsIdentity = true;
    }

    const payload = {
      roomId: room.id,
      accepted: true,
      followed,
      needsIdentity,
      kind: pending.kind,
      username: myAudio || null,
      partnerUsername: theirAudio || null,
      creatorHandle: them?.isCreator
        ? String(them.creatorData?.handle_name || '').slice(0, 30)
        : (me?.isCreator ? String(me.creatorData?.handle_name || '').slice(0, 30) : null),
    };
    io.to(room.id).emit('match-connect-accepted', payload);
  });

  socket.on('creator:reveal-profile', (data) => {
    const room = rooms?.get(String(data?.roomId || ''));
    const me = users.get(socket.id);
    if (!room || !room.users.has(socket.id) || !me?.isCreator) return;
    me.revealCreator = true;
    const handle = sanitize
      ? sanitize(String(me.creatorData?.handle_name || me.nickname || 'Creator'), 30)
      : String(me.creatorData?.handle_name || me.nickname || 'Creator').slice(0, 30);
    io.to(room.id).emit('creator:profile', {
      roomId: room.id,
      socketId: socket.id,
      creatorHandle: handle,
      creatorBadge: true,
    });
  });

  socket.on('creator:video-stats-get', () => {
    const me = users.get(socket.id);
    if (!me?.isCreator) return;
    socket.emit('creator:video-stats', me.creatorVideoStats || { matches: 0, seconds: 0, followInvites: 0, followsGained: 0 });
  });

  socket.on('group-video:configure', async (data) => {
    const room = rooms?.get(String(data?.roomId || ''));
    const me = users.get(socket.id);
    if (!room || room.hostId !== socket.id || room.mode !== 'group_video') {
      return socket.emit('error', { message: 'Only the host can update this room.' });
    }
    const nextPrivate = data?.isPrivate == null ? !!room.isPrivate : !!data.isPrivate;
    const nextBranded = !!(me?.isCreator && (data?.branded == null ? room.branded : data.branded));
    const nextMax = clampGroupMaxSize(data?.maxSize ?? room.maxSize, !!me?.isCreator);
    const title = data?.roomTitle != null
      ? (sanitize ? sanitize(String(data.roomTitle), 40) : String(data.roomTitle).slice(0, 40))
      : (room.roomTitle || '');

    const alreadyLarge = room.maxSize >= nextMax;
    const alreadyPrivate = !!room.isPrivate || !nextPrivate;
    const cost = groupCreateCost({
      maxSize: alreadyLarge ? freeGroupMaxSize(!!me?.isCreator) : nextMax,
      isPrivate: alreadyPrivate ? false : nextPrivate,
      isCreator: !!me?.isCreator,
    });
    if (cost.coins > 0) {
      const ctx = wallet?.ctxFromSocket(socket.id, ip);
      const spend = await chargeIfNeeded(wallet, ctx, cost, 'group_video_configure', { roomId: room.id });
      if (!spend.ok) {
        return socket.emit('video:need-coins', {
          message: spend.error || 'Not enough coins to update the room.',
          needCoins: spend.needCoins,
          balance: spend.balance,
          items: spend.items,
        });
      }
    }

    room.isPrivate = nextPrivate;
    room.maxSize = nextMax;
    room.branded = nextBranded;
    room.roomTitle = nextBranded ? (title || room.interest) : null;
    if (nextBranded && me?.isCreator) {
      room.creatorHost = {
        handle: String(me.creatorData?.handle_name || me.nickname || 'Creator').slice(0, 30),
        id: me.creatorData?.id || null,
      };
    }
    io.to(room.id).emit('group-video:updated', {
      roomId: room.id,
      isPrivate: room.isPrivate,
      maxSize: room.maxSize,
      branded: !!room.branded,
      roomTitle: room.roomTitle,
      creatorHost: room.creatorHost || null,
      entryFee: effectiveEntryFee(room),
    });
  });

  socket.on('group-video:set-entry-fee', (data) => {
    const room = rooms?.get(String(data?.roomId || ''));
    if (!room || room.hostId !== socket.id || room.mode !== 'group_video') {
      return socket.emit('error', { message: 'Only the host can set an entry fee.' });
    }
    if (!paymentsEnabled()) {
      room.entryFee = 0;
      return io.to(room.id).emit('group-video:updated', { roomId: room.id, entryFee: 0 });
    }
    room.entryFee = assertEntryFee(data?.entryFee);
    io.to(room.id).emit('group-video:updated', { roomId: room.id, entryFee: room.entryFee });
  });
}

module.exports = {
  DEFAULTS,
  getVideoPricing,
  paymentsEnabled,
  publicCatalog,
  normalizeGender,
  gendersCompatible,
  filterCost,
  sessionLimitSeconds,
  freeGroupMaxSize,
  clampGroupMaxSize,
  groupCreateCost,
  assertEntryFee,
  effectiveEntryFee,
  chargeIfNeeded,
  publicSessionState,
  startVideoSession,
  extendVideoSession,
  clearVideoTimers,
  bumpCreatorStats,
  ensureAnonHandle,
  registerVideoPricing,
  attachSocketHandlers,
};
