/**
 * 1:1 matchmaking queue — Redis waiting lists with in-memory fallback.
 *
 *   User A → Redis waiting queue
 *   User B → Redis waiting queue
 *   Redis: A + B = MATCH → Socket.IO partner-found → WebRTC → Video
 *
 * Set REDIS_URL for cross-instance queues + Socket.IO adapter.
 */

const META_TTL_SEC = 600;
const PREFIX = (process.env.REDIS_PREFIX || 'helloooo').replace(/:$/, '');

function listKey(mode) {
  return `${PREFIX}:mq:${mode}`;
}

function metaKey(socketId) {
  return `${PREFIX}:mq:meta:${socketId}`;
}

function packEntry(entry) {
  const {
    socketId, userData, interest, region, language, conversationMode, topicContract,
    matchCountryOnly, matchRegionOnly, reconnectToUserId,
  } = entry;
  return {
    socketId,
    interest,
    region,
    language,
    conversationMode,
    topicContract,
    matchCountryOnly: !!matchCountryOnly,
    matchRegionOnly: !!matchRegionOnly,
    reconnectToUserId: reconnectToUserId || null,
    userData: userData
      ? {
          id: userData.id,
          nickname: userData.nickname,
          country: userData.country,
          isCreator: !!userData.isCreator,
          ip: userData.ip,
        }
      : null,
  };
}

function unpackEntry(raw) {
  if (!raw?.socketId) return null;
  return {
    socketId: raw.socketId,
    interest: raw.interest,
    region: raw.region,
    language: raw.language,
    conversationMode: raw.conversationMode,
    topicContract: raw.topicContract,
    matchCountryOnly: !!raw.matchCountryOnly,
    matchRegionOnly: !!raw.matchRegionOnly,
    reconnectToUserId: raw.reconnectToUserId || null,
    userData: raw.userData || {},
  };
}

function createMatchQueue() {
  let redis = null;
  let memoryQueues = null;
  let usingRedis = false;

  async function init({ io, redisUrl, memoryQueues: mq }) {
    memoryQueues = mq;
    if (!redisUrl) {
      console.log('[matchQueue] In-memory queues (set REDIS_URL for Redis matchmaking)');
      return { usingRedis: false };
    }
    try {
      const { createClient } = require('redis');
      const { createAdapter } = require('@socket.io/redis-adapter');
      const pub = createClient({ url: redisUrl });
      const sub = pub.duplicate();
      pub.on('error', (e) => console.error('[redis]', e.message));
      sub.on('error', (e) => console.error('[redis-sub]', e.message));
      await pub.connect();
      await sub.connect();
      redis = pub;
      io.adapter(createAdapter(pub, sub));
      usingRedis = true;
      console.log('[matchQueue] Redis waiting queues + Socket.IO adapter active');
      return { usingRedis: true };
    } catch (err) {
      console.error('[matchQueue] Redis init failed — in-memory fallback:', err.message);
      redis = null;
      usingRedis = false;
      return { usingRedis: false };
    }
  }

  async function shutdown() {
    if (redis) {
      try {
        await redis.quit();
      } catch {
        /* ignore */
      }
      redis = null;
    }
  }

  function isRedis() {
    return usingRedis;
  }

  async function removeFromQueues(socketId) {
    if (!usingRedis) {
      memoryQueues.text = memoryQueues.text.filter((e) => e.socketId !== socketId);
      memoryQueues.video = memoryQueues.video.filter((e) => e.socketId !== socketId);
      return;
    }
    await redis.del(metaKey(socketId));
    await Promise.all([
      redis.lRem(listKey('text'), 0, socketId),
      redis.lRem(listKey('video'), 0, socketId),
    ]);
  }

  async function clearAll() {
    if (!usingRedis) {
      memoryQueues.text = [];
      memoryQueues.video = [];
      return;
    }
    await redis.del(listKey('text'), listKey('video'));
  }

  async function getStats() {
    if (!usingRedis) {
      return {
        text: memoryQueues.text.length,
        video: memoryQueues.video.length,
        backend: 'memory',
      };
    }
    const [text, video] = await Promise.all([
      redis.lLen(listKey('text')),
      redis.lLen(listKey('video')),
    ]);
    return { text, video, backend: 'redis' };
  }

  async function findOrEnqueueMemory({
    mode,
    entry,
    isCreator,
    canMatch,
    isAvailable,
    pickSmartMatch,
    interest,
    region,
    language,
    repFn,
  }) {
    const queue = memoryQueues[mode];
    queue.splice(0, queue.length, ...queue.filter((e) => isAvailable(e)));

    let match = await pickSmartMatch(
      queue.filter((e) => e.interest === interest && isAvailable(e)),
      interest,
      region,
      language,
      canMatch,
      repFn
    );
    if (!match) {
      match = await pickSmartMatch(queue.filter(isAvailable), interest, region, language, canMatch, repFn);
    }

    if (match) {
      let idx = queue.indexOf(match);
      if (idx === -1) {
        match = await pickSmartMatch(queue.filter(isAvailable), interest, region, language, canMatch, repFn);
        idx = match ? queue.indexOf(match) : -1;
        if (idx === -1) match = null;
      }
      if (match) queue.splice(idx, 1);
    }

    if (match) return { status: 'matched', match };
    if (isCreator) queue.unshift(entry);
    else queue.push(entry);
    return { status: 'waiting' };
  }

  async function loadRedisQueue(mode, isAvailable) {
    const ids = await redis.lRange(listKey(mode), 0, -1);
    const entries = [];
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) {
        await redis.lRem(listKey(mode), 0, id);
        continue;
      }
      seen.add(id);
      const raw = await redis.get(metaKey(id));
      if (!raw) {
        await redis.lRem(listKey(mode), 0, id);
        continue;
      }
      let parsed;
      try {
        parsed = unpackEntry(JSON.parse(raw));
      } catch {
        await redis.lRem(listKey(mode), 0, id);
        await redis.del(metaKey(id));
        continue;
      }
      if (!parsed || !isAvailable(parsed)) {
        await redis.lRem(listKey(mode), 0, id);
        await redis.del(metaKey(id));
        continue;
      }
      entries.push(parsed);
    }
    return entries;
  }

  async function claimMatch(mode, matchSocketId) {
    const removed = await redis.lRem(listKey(mode), 1, matchSocketId);
    if (removed > 0) {
      await redis.del(metaKey(matchSocketId));
      return true;
    }
    return false;
  }

  async function enqueueRedis(mode, entry, isCreator) {
    const packed = packEntry(entry);
    await redis.set(metaKey(entry.socketId), JSON.stringify(packed), { EX: META_TTL_SEC });
    if (isCreator) await redis.lPush(listKey(mode), entry.socketId);
    else await redis.rPush(listKey(mode), entry.socketId);
  }

  async function findOrEnqueue(opts) {
    const {
      mode,
      entry,
      isCreator,
      canMatch,
      isAvailable,
      pickSmartMatch,
      interest,
      region,
      language,
      repFn,
    } = opts;

    await removeFromQueues(entry.socketId);

    if (!usingRedis) {
      return findOrEnqueueMemory(opts);
    }

    let entries = await loadRedisQueue(mode, isAvailable);

    let match = await pickSmartMatch(
      entries.filter((e) => e.interest === interest),
      interest,
      region,
      language,
      canMatch,
      repFn
    );
    if (!match) {
      match = await pickSmartMatch(entries, interest, region, language, canMatch, repFn);
    }

    if (match) {
      let claimed = await claimMatch(mode, match.socketId);
      if (!claimed) {
        entries = entries.filter((e) => e.socketId !== match.socketId);
        match = await pickSmartMatch(entries, interest, region, language, canMatch, repFn);
        claimed = match ? await claimMatch(mode, match.socketId) : false;
        if (!claimed) match = null;
      }
    }

    if (match) return { status: 'matched', match };
    await enqueueRedis(mode, entry, isCreator);
    return { status: 'waiting' };
  }

  return {
    init,
    shutdown,
    isRedis,
    findOrEnqueue,
    removeFromQueues,
    clearAll,
    getStats,
    /** Shared Redis client for infra (limits / room presence). */
    getClient: () => redis,
  };
}

module.exports = { createMatchQueue };
