/**
 * Shared infra helpers for the platform architecture:
 *
 *   Redis  → Match · Rooms · Rate limits
 *   Postgres (Supabase) → Wallet · Coins · Gifts · Users · Audit
 *   Node gateway → AuthZ · Gift validation · Signaling → WebRTC
 */

const PREFIX = (process.env.REDIS_PREFIX || 'helloooo').replace(/:$/, '');

function createInfra() {
  let redis = null;

  function bindRedis(client) {
    redis = client || null;
  }

  function getRedis() {
    return redis;
  }

  /** Sliding-window style limiter via Redis INCR + EXPIRE (memory fallback). */
  const memBuckets = new Map();

  async function rateLimit(key, { windowMs = 10000, max = 20 } = {}) {
    const full = `${PREFIX}:rl:${key}`;
    if (redis) {
      try {
        const n = await redis.incr(full);
        if (n === 1) await redis.pExpire(full, windowMs);
        return { ok: n <= max, remaining: Math.max(0, max - n), backend: 'redis' };
      } catch {
        /* fall through to memory */
      }
    }
    const now = Date.now();
    let b = memBuckets.get(full);
    if (!b || now - b.start > windowMs) {
      b = { start: now, count: 0 };
      memBuckets.set(full, b);
    }
    b.count += 1;
    return { ok: b.count <= max, remaining: Math.max(0, max - b.count), backend: 'memory' };
  }

  async function setRoomPresence(roomId, payload, ttlSec = 3600) {
    if (!redis || !roomId) return;
    try {
      await redis.set(`${PREFIX}:room:${roomId}`, JSON.stringify({ ...payload, at: Date.now() }), {
        EX: ttlSec,
      });
    } catch {
      /* ignore */
    }
  }

  async function clearRoomPresence(roomId) {
    if (!redis || !roomId) return;
    try {
      await redis.del(`${PREFIX}:room:${roomId}`);
    } catch {
      /* ignore */
    }
  }

  async function getRoomPresence(roomId) {
    if (!redis || !roomId) return null;
    try {
      const raw = await redis.get(`${PREFIX}:room:${roomId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  return {
    bindRedis,
    getRedis,
    rateLimit,
    setRoomPresence,
    clearRoomPresence,
    getRoomPresence,
  };
}

module.exports = { createInfra };
