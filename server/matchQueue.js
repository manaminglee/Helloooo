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
    socketId, userData, interest, interests, region, language, conversationMode, topicContract,
    matchCountryOnly, matchRegionOnly, reconnectToUserId, enqueuedAt,
  } = entry;
  return {
    socketId,
    enqueuedAt: enqueuedAt || Date.now(),
    interest,
    interests: Array.isArray(interests) ? interests.slice(0, 12) : [],
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
          // Carried so a candidate loaded from Redis can be keyed for blocks
          // and suspensions without a live socket lookup on this instance.
          deviceHandle: userData.deviceHandle || null,
        }
      : null,
  };
}

function unpackEntry(raw) {
  if (!raw?.socketId) return null;
  return {
    socketId: raw.socketId,
    enqueuedAt: Number(raw.enqueuedAt) || Date.now(),
    interest: raw.interest,
    interests: Array.isArray(raw.interests) ? raw.interests : [],
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

/**
 * How deep to look before giving up on a search.
 *
 * A search that reads the whole queue is O(waiting) per person, so a busy night
 * makes every match slower for everyone — exactly backwards. The head of the
 * queue is also the people who have waited longest, so a bounded scan is the
 * fairer half of the queue anyway.
 */
const SCAN_LIMIT = Number(process.env.MATCH_SCAN_LIMIT || 80);

const GENERIC_INTERESTS = new Set(['', 'general', 'any', 'anything', 'random']);

function interestsOf(entry) {
  const out = new Set();
  for (const x of [entry?.interest, ...(Array.isArray(entry?.interests) ? entry.interests : [])]) {
    const v = String(x || '').trim().toLowerCase();
    if (v && !GENERIC_INTERESTS.has(v)) out.add(v);
  }
  return out;
}

/**
 * Tier 1 of the two-pass search: people who share at least one real interest.
 * 'general' does not count — it is the default, so counting it would put
 * everybody in tier 1 and the preference would mean nothing.
 */
function sharesInterest(candidate, wanted) {
  if (!wanted.size) return false;
  for (const v of interestsOf(candidate)) if (wanted.has(v)) return true;
  return false;
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

    const wanted = interestsOf({ interest, interests: entry.interests });
    const pool = queue.slice(0, SCAN_LIMIT);
    const opts = { interests: entry.interests };

    // Tier 1: shared interest. Tier 2: anyone. Never leave someone waiting
    // because nobody shares their hobby.
    let match = await pickSmartMatch(
      pool.filter((e) => sharesInterest(e, wanted)),
      interest, region, language, canMatch, repFn, opts,
    );
    if (!match) {
      match = await pickSmartMatch(pool, interest, region, language, canMatch, repFn, opts);
    }

    if (match) {
      let idx = queue.indexOf(match);
      if (idx === -1) {
        match = await pickSmartMatch(pool, interest, region, language, canMatch, repFn, opts);
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

  /**
   * Read the head of the waiting list.
   *
   * One LRANGE and one MGET, not a GET per waiting person: the old shape cost a
   * network round trip per entry, so the busier the queue the slower every
   * single search became. Stale ids are swept in one pipeline afterwards, off
   * the path that the waiting user is blocked on.
   */
  async function loadRedisQueue(mode, isAvailable) {
    const ids = await redis.lRange(listKey(mode), 0, SCAN_LIMIT - 1);
    if (!ids.length) return [];

    const unique = [];
    const seen = new Set();
    const dupes = [];
    for (const id of ids) {
      if (seen.has(id)) { dupes.push(id); continue; }
      seen.add(id);
      unique.push(id);
    }

    const raws = await redis.mGet(unique.map(metaKey));
    const entries = [];
    const stale = [];
    for (let i = 0; i < unique.length; i += 1) {
      const raw = raws[i];
      if (!raw) { stale.push(unique[i]); continue; }
      let parsed = null;
      try { parsed = unpackEntry(JSON.parse(raw)); } catch { parsed = null; }
      if (!parsed || !isAvailable(parsed)) { stale.push(unique[i]); continue; }
      entries.push(parsed);
    }

    if (dupes.length || stale.length) {
      const sweep = redis.multi();
      for (const id of dupes) sweep.lRem(listKey(mode), 0, id);
      for (const id of stale) { sweep.lRem(listKey(mode), 0, id); sweep.del(metaKey(id)); }
      sweep.exec().catch(() => {});
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
    const wanted = interestsOf({ interest, interests: entry.interests });
    const pickOpts = { interests: entry.interests };

    // Tier 1: shared interest. Tier 2: anyone.
    let match = await pickSmartMatch(
      entries.filter((e) => sharesInterest(e, wanted)),
      interest, region, language, canMatch, repFn, pickOpts,
    );
    if (!match) {
      match = await pickSmartMatch(entries, interest, region, language, canMatch, repFn, pickOpts);
    }

    // A claim can lose to another instance picking the same person. Retry down
    // the list instead of dropping the seeker back into the queue — on a busy
    // night that race is common, and re-queueing turns it into a visible stall.
    let claimed = false;
    for (let attempt = 0; match && attempt < 4; attempt += 1) {
      claimed = await claimMatch(mode, match.socketId);
      if (claimed) break;
      entries = entries.filter((e) => e.socketId !== match.socketId);
      match = await pickSmartMatch(
        entries.filter((e) => sharesInterest(e, wanted)),
        interest, region, language, canMatch, repFn, pickOpts,
      ) || await pickSmartMatch(entries, interest, region, language, canMatch, repFn, pickOpts);
    }
    if (!claimed) match = null;

    if (match) return { status: 'matched', match };
    await enqueueRedis(mode, entry, isCreator);
    return { status: 'waiting' };
  }

  return {
    init,
    SCAN_LIMIT,
    shutdown,
    isRedis,
    findOrEnqueue,
    removeFromQueues,
    clearAll,
    getStats,
    /** Shared Redis client for infra (limits / room presence). */
    getClient: () => redis,
    /** Test seam: drive the Redis code path against a stand-in client. */
    __setRedisForTest: (client) => { redis = client; usingRedis = !!client; },
  };
}

module.exports = { createMatchQueue, sharesInterest, interestsOf, SCAN_LIMIT };
