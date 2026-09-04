/**
 * Live room state store.
 *
 * One async interface, two backends:
 *   memory — single process (dev, and prod on one instance). Zero dependencies.
 *   redis  — many instances share room state. Socket.IO already fans broadcasts
 *            out through the Redis adapter (see matchQueue.js), so the only
 *            thing that had to move off the heap is the STATE those broadcasts
 *            are derived from.
 *
 * The engine never branches on which backend is live; it just awaits the store.
 * If Redis is configured but a call fails, the memory mirror answers instead —
 * a room degrades to single-instance rather than disappearing.
 *
 * Key layout (redis), all prefixed and TTL'd so a crashed instance self-cleans:
 *   live:room:<id>        HASH   room config + counters
 *   live:active           ZSET   live room ids, scored by started_at
 *   live:viewers:<id>     HASH   socketId -> viewer profile JSON
 *   live:uniq:<id>        PFADD  HyperLogLog of unique viewer keys
 *   live:muted:<id>       SET
 *   live:mods:<id>        SET
 *   live:blocked:<id>     SET    socket ids and ips
 *   live:gifters:<id>     ZSET   wallet key -> coins, with a companion HASH
 *   live:gifterinfo:<id>  HASH   wallet key -> {username,nameColor,avatarUrl,count}
 *   live:comments:<id>    LIST   recent comments for replay
 *   live:nonce:<key>      STRING SET NX PX — the idempotency primitive
 *   live:combo:<...>      STRING INCR + PEXPIRE
 *   live:slowat:<id>:<k>  STRING per-commenter throttle stamp (TTL = its own GC)
 */

const ROOM_TTL_MS = 90_000;        // refreshed by the host's instance heartbeat
const COMMENT_REPLAY = 60;
const VIEWER_LIST_MAX = 200;

const K = {
  room: (id) => `live:room:${id}`,
  active: () => 'live:active',
  viewers: (id) => `live:viewers:${id}`,
  uniq: (id) => `live:uniq:${id}`,
  muted: (id) => `live:muted:${id}`,
  mods: (id) => `live:mods:${id}`,
  blocked: (id) => `live:blocked:${id}`,
  gifters: (id) => `live:gifters:${id}`,
  gifterInfo: (id) => `live:gifterinfo:${id}`,
  comments: (id) => `live:comments:${id}`,
  nonce: (owner, n) => `live:nonce:${owner}:${n}`,
  combo: (id, owner, giftId) => `live:combo:${id}:${owner}:${giftId}`,
  slowAt: (id, key) => `live:slowat:${id}:${key}`,
  presenceLock: (id) => `live:plock:${id}`,
  sweepLock: () => 'live:sweeplock',
};

const COUNTERS = ['likes', 'giftCount', 'coinsGross', 'nutsEarned', 'peakViewers'];
const NUMERIC = new Set([...COUNTERS, 'startedAt', 'slowModeMs', 'displayLevel']);
const BOOLEAN = new Set(['verified', 'commentsDisabled']);

function decodeRoom(flat) {
  if (!flat || !flat.id) return null;
  const out = {};
  for (const [k, v] of Object.entries(flat)) {
    if (NUMERIC.has(k)) out[k] = Number(v) || 0;
    else if (BOOLEAN.has(k)) out[k] = v === '1' || v === 'true';
    else if (k === 'pinnedComment') out[k] = v && v !== 'null' ? safeParse(v) : null;
    else out[k] = v === '' ? null : v;
  }
  for (const c of COUNTERS) if (out[c] == null) out[c] = 0;
  return out;
}

function encodeRoom(room) {
  const out = {};
  for (const [k, v] of Object.entries(room)) {
    if (v == null) out[k] = '';
    else if (typeof v === 'boolean') out[k] = v ? '1' : '0';
    else if (typeof v === 'object') out[k] = JSON.stringify(v);
    else out[k] = String(v);
  }
  return out;
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

/* ========================================================================== */
/* Memory backend                                                             */
/* ========================================================================== */

function createMemoryBackend() {
  const rooms = new Map();       // id -> room object
  const viewers = new Map();     // id -> Map(socketId -> profile)
  const uniq = new Map();        // id -> Set(key)   (capped, see markUnique)
  const muted = new Map();       // id -> Set
  const mods = new Map();        // id -> Set
  const blocked = new Map();     // id -> Set
  const gifters = new Map();     // id -> Map(key -> {coins,count,...})
  const comments = new Map();    // id -> array
  const expiring = new Map();    // key -> expiresAt   (nonces, combos, stamps)
  const combos = new Map();      // key -> {count, id}
  const blobs = new Map();       // key -> arbitrary JSON (battles)

  const UNIQ_CAP = 20_000;       // beyond this we keep counting, stop storing

  const set = (map, id) => {
    if (!map.has(id)) map.set(id, new Set());
    return map.get(id);
  };

  function sweep() {
    const now = Date.now();
    for (const [k, exp] of expiring) {
      if (exp <= now) { expiring.delete(k); combos.delete(k); }
    }
  }
  const sweeper = setInterval(sweep, 30_000);
  if (sweeper.unref) sweeper.unref();

  const alive = (k) => {
    const exp = expiring.get(k);
    if (exp == null) return false;
    if (exp <= Date.now()) { expiring.delete(k); combos.delete(k); return false; }
    return true;
  };

  return {
    kind: 'memory',

    async createRoom(room) {
      rooms.set(room.id, { ...room });
      viewers.set(room.id, new Map());
      uniq.set(room.id, new Set());
      comments.set(room.id, []);
      gifters.set(room.id, new Map());
    },
    async getRoom(id) {
      const r = rooms.get(id);
      return r ? { ...r } : null;
    },
    async updateRoom(id, patch) {
      const r = rooms.get(id);
      if (!r) return;
      Object.assign(r, patch);
    },
    async incrRoom(id, field, by) {
      const r = rooms.get(id);
      if (!r) return 0;
      r[field] = (Number(r[field]) || 0) + by;
      return r[field];
    },
    async maxRoom(id, field, value) {
      const r = rooms.get(id);
      if (!r) return 0;
      if ((Number(r[field]) || 0) < value) r[field] = value;
      return r[field];
    },
    async listActive() {
      return [...rooms.values()].filter((r) => r.status === 'live').map((r) => ({ ...r }));
    },
    async deleteRoom(id) {
      rooms.delete(id); viewers.delete(id); uniq.delete(id);
      muted.delete(id); mods.delete(id); blocked.delete(id);
      gifters.delete(id); comments.delete(id);
    },
    async touchRoom() { /* memory rooms never expire */ },
    async staleRooms() { return []; },

    async addViewer(id, socketId, profile) {
      const m = viewers.get(id);
      if (!m) return 0;
      m.set(socketId, profile);
      return m.size;
    },
    async removeViewer(id, socketId) {
      const m = viewers.get(id);
      if (!m) return 0;
      m.delete(socketId);
      return m.size;
    },
    async viewerCount(id) { return viewers.get(id)?.size || 0; },
    async getViewer(id, socketId) { return viewers.get(id)?.get(socketId) || null; },
    async listViewers(id, limit = VIEWER_LIST_MAX) {
      return [...(viewers.get(id)?.values() || [])].slice(0, limit);
    },
    async markUnique(id, key) {
      const s = uniq.get(id);
      if (s && s.size < UNIQ_CAP) s.add(key);
      else if (s) s.overflow = (s.overflow || 0) + 1;
    },
    async uniqueCount(id) {
      const s = uniq.get(id);
      return s ? s.size + (s.overflow || 0) : 0;
    },

    async addTo(kind, id, member) { set(kind === 'muted' ? muted : kind === 'mods' ? mods : blocked, id).add(member); },
    async removeFrom(kind, id, member) { set(kind === 'muted' ? muted : kind === 'mods' ? mods : blocked, id).delete(member); },
    async has(kind, id, member) { return set(kind === 'muted' ? muted : kind === 'mods' ? mods : blocked, id).has(member); },
    async members(kind, id) { return [...set(kind === 'muted' ? muted : kind === 'mods' ? mods : blocked, id)]; },

    async bumpGifter(id, key, info, coins) {
      const m = gifters.get(id);
      if (!m) return null;
      const row = m.get(key) || { key, ...info, coins: 0, count: 0 };
      row.coins += coins;
      row.count += 1;
      Object.assign(row, info, { coins: row.coins, count: row.count, key });
      m.set(key, row);
      return row;
    },
    async topGifters(id, n = 10) {
      return [...(gifters.get(id)?.values() || [])]
        .sort((a, b) => b.coins - a.coins).slice(0, n).map((g) => ({ ...g }));
    },
    async gifterCoins(id, key) { return gifters.get(id)?.get(key)?.coins || 0; },

    async pushComment(id, comment) {
      const list = comments.get(id);
      if (!list) return;
      list.push(comment);
      if (list.length > COMMENT_REPLAY) list.splice(0, list.length - COMMENT_REPLAY);
    },
    async recentComments(id, n = COMMENT_REPLAY) {
      return (comments.get(id) || []).slice(-n);
    },
    async dropComment(id, commentId) {
      const list = comments.get(id);
      if (!list) return;
      const i = list.findIndex((c) => c.id === commentId);
      if (i >= 0) list.splice(i, 1);
    },
    async findComment(id, commentId) {
      return (comments.get(id) || []).find((c) => c.id === commentId) || null;
    },

    async claimNonce(owner, nonce, ttlMs) {
      const key = K.nonce(owner, nonce);
      if (alive(key)) return false;
      expiring.set(key, Date.now() + ttlMs);
      return true;
    },
    async bumpCombo(id, owner, giftId, windowMs) {
      const key = K.combo(id, owner, giftId);
      if (alive(key)) {
        const c = combos.get(key);
        c.count += 1;
        expiring.set(key, Date.now() + windowMs);
        return { ...c };
      }
      const fresh = { count: 1, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
      combos.set(key, fresh);
      expiring.set(key, Date.now() + windowMs);
      return { ...fresh };
    },
    async lastCommentAt(id, key) {
      const k = K.slowAt(id, key);
      return alive(k) ? Number(combos.get(k)?.at || 0) : 0;
    },
    async stampComment(id, key, ttlMs) {
      const k = K.slowAt(id, key);
      combos.set(k, { at: Date.now() });
      expiring.set(k, Date.now() + ttlMs);
    },
    // Single process: the engine's own flush timer is already the throttle,
    // so there is nobody to dedupe against.
    async claimBroadcast() { return true; },
    async claimSweep() { return true; },

    async setBlob(key, value, ttlMs) {
      blobs.set(key, value);
      if (ttlMs) expiring.set(`blob:${key}`, Date.now() + ttlMs);
    },
    async getBlob(key) {
      const k = `blob:${key}`;
      if (expiring.has(k) && !alive(k)) { blobs.delete(key); return null; }
      return blobs.has(key) ? JSON.parse(JSON.stringify(blobs.get(key))) : null;
    },
    async delBlob(key) { blobs.delete(key); expiring.delete(`blob:${key}`); },
    async close() { clearInterval(sweeper); },
  };
}

/* ========================================================================== */
/* Redis backend                                                              */
/* ========================================================================== */

function createRedisBackend(client) {
  const px = (ms) => ({ PX: Math.max(1, Math.round(ms)) });

  const setName = (kind, id) => (kind === 'muted' ? K.muted(id) : kind === 'mods' ? K.mods(id) : K.blocked(id));

  /** Every room-scoped key gets the same TTL, so a lost instance self-cleans. */
  async function expireAll(id) {
    const ttl = Math.round(ROOM_TTL_MS / 1000);
    await Promise.all([
      client.expire(K.room(id), ttl),
      client.expire(K.viewers(id), ttl),
      client.expire(K.uniq(id), ttl),
      client.expire(K.muted(id), ttl),
      client.expire(K.mods(id), ttl),
      client.expire(K.blocked(id), ttl),
      client.expire(K.gifters(id), ttl),
      client.expire(K.gifterInfo(id), ttl),
      client.expire(K.comments(id), ttl),
    ].map((p) => p.catch(() => {})));
  }

  return {
    kind: 'redis',

    async createRoom(room) {
      await client.hSet(K.room(room.id), encodeRoom(room));
      await client.zAdd(K.active(), { score: room.startedAt, value: room.id });
      await expireAll(room.id);
    },
    async getRoom(id) {
      return decodeRoom(await client.hGetAll(K.room(id)));
    },
    async updateRoom(id, patch) {
      await client.hSet(K.room(id), encodeRoom(patch));
    },
    async incrRoom(id, field, by) {
      return client.hIncrBy(K.room(id), field, by);
    },
    async maxRoom(id, field, value) {
      // Stats only — a lost race costs at most an understated peak.
      const cur = Number(await client.hGet(K.room(id), field)) || 0;
      if (value > cur) { await client.hSet(K.room(id), field, String(value)); return value; }
      return cur;
    },
    async listActive() {
      const ids = await client.zRange(K.active(), 0, -1);
      if (!ids.length) return [];
      const rows = await Promise.all(ids.map((id) => client.hGetAll(K.room(id)).catch(() => null)));
      const out = [];
      for (let i = 0; i < ids.length; i += 1) {
        const room = decodeRoom(rows[i]);
        if (room && room.status === 'live') out.push(room);
        else if (!room) await client.zRem(K.active(), ids[i]).catch(() => {});  // expired
      }
      return out;
    },
    async deleteRoom(id) {
      await client.zRem(K.active(), id).catch(() => {});
      await client.del([
        K.room(id), K.viewers(id), K.uniq(id), K.muted(id), K.mods(id),
        K.blocked(id), K.gifters(id), K.gifterInfo(id), K.comments(id),
      ]).catch(() => {});
    },
    async touchRoom(id) { await expireAll(id); },

    /** Rooms whose host instance stopped heartbeating — the orphan sweeper. */
    async staleRooms() {
      const ids = await client.zRange(K.active(), 0, -1);
      const stale = [];
      for (const id of ids) {
        const exists = await client.exists(K.room(id)).catch(() => 1);
        if (!exists) stale.push(id);
      }
      return stale;
    },

    async addViewer(id, socketId, profile) {
      await client.hSet(K.viewers(id), socketId, JSON.stringify(profile));
      return client.hLen(K.viewers(id));
    },
    async removeViewer(id, socketId) {
      await client.hDel(K.viewers(id), socketId).catch(() => {});
      return client.hLen(K.viewers(id));
    },
    async viewerCount(id) { return client.hLen(K.viewers(id)); },
    async getViewer(id, socketId) {
      const raw = await client.hGet(K.viewers(id), socketId);
      return raw ? safeParse(raw) : null;
    },
    async listViewers(id, limit = VIEWER_LIST_MAX) {
      // HSCAN, never HGETALL: a 50k-viewer room must not be pulled into memory.
      const out = [];
      let cursor = 0;
      do {
        const res = await client.hScan(K.viewers(id), cursor, { COUNT: 200 });
        cursor = Number(res.cursor);
        for (const entry of res.tuples || []) {
          const v = safeParse(entry.value);
          if (v) out.push(v);
          if (out.length >= limit) return out;
        }
      } while (cursor !== 0);
      return out;
    },
    async markUnique(id, key) { await client.pfAdd(K.uniq(id), key); },
    async uniqueCount(id) { return client.pfCount(K.uniq(id)); },

    async addTo(kind, id, member) { await client.sAdd(setName(kind, id), member); },
    async removeFrom(kind, id, member) { await client.sRem(setName(kind, id), member); },
    async has(kind, id, member) { return !!(await client.sIsMember(setName(kind, id), member)); },
    async members(kind, id) { return client.sMembers(setName(kind, id)); },

    async bumpGifter(id, key, info, coins) {
      const total = await client.zIncrBy(K.gifters(id), coins, key);
      const prev = safeParse(await client.hGet(K.gifterInfo(id), key)) || { count: 0 };
      const row = { key, ...info, coins: Number(total) || coins, count: (prev.count || 0) + 1 };
      await client.hSet(K.gifterInfo(id), key, JSON.stringify(row));
      return row;
    },
    async topGifters(id, n = 10) {
      const keys = await client.zRange(K.gifters(id), 0, n - 1, { REV: true });
      if (!keys.length) return [];
      const infos = await client.hmGet(K.gifterInfo(id), keys);
      return keys.map((k, i) => safeParse(infos[i]) || { key: k, username: k, coins: 0, count: 0 });
    },
    async gifterCoins(id, key) {
      return Number(await client.zScore(K.gifters(id), key)) || 0;
    },

    async pushComment(id, comment) {
      await client.rPush(K.comments(id), JSON.stringify(comment));
      await client.lTrim(K.comments(id), -COMMENT_REPLAY, -1);
    },
    async recentComments(id, n = COMMENT_REPLAY) {
      const raw = await client.lRange(K.comments(id), -n, -1);
      return raw.map(safeParse).filter(Boolean);
    },
    async dropComment(id, commentId) {
      const raw = await client.lRange(K.comments(id), 0, -1);
      const hit = raw.find((r) => safeParse(r)?.id === commentId);
      if (hit) await client.lRem(K.comments(id), 1, hit);
    },
    async findComment(id, commentId) {
      const raw = await client.lRange(K.comments(id), 0, -1);
      for (const r of raw) {
        const c = safeParse(r);
        if (c?.id === commentId) return c;
      }
      return null;
    },

    /* SET NX PX is the whole idempotency guarantee: exactly one caller across
       every instance can claim a nonce, and it evaporates on its own. */
    async claimNonce(owner, nonce, ttlMs) {
      const res = await client.set(K.nonce(owner, nonce), '1', { NX: true, ...px(ttlMs) });
      return res === 'OK';
    },
    async bumpCombo(id, owner, giftId, windowMs) {
      const key = K.combo(id, owner, giftId);
      const idKey = `${key}:id`;
      const count = await client.incr(key);
      await client.pExpire(key, windowMs);
      let comboId;
      if (count === 1) {
        comboId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        await client.set(idKey, comboId, px(windowMs));
      } else {
        comboId = (await client.get(idKey)) || `${key}`;
        await client.pExpire(idKey, windowMs);
      }
      return { count, id: comboId };
    },
    async lastCommentAt(id, key) {
      return Number(await client.get(K.slowAt(id, key))) || 0;
    },
    async stampComment(id, key, ttlMs) {
      await client.set(K.slowAt(id, key), String(Date.now()), px(ttlMs));
    },
    /** One instance wins the right to broadcast this tick; the rest stay quiet. */
    async claimBroadcast(id, ttlMs) {
      const res = await client.set(K.presenceLock(id), '1', { NX: true, ...px(ttlMs) });
      return res === 'OK';
    },
    async claimSweep(ttlMs) {
      const res = await client.set(K.sweepLock(), '1', { NX: true, ...px(ttlMs) });
      return res === 'OK';
    },

    async setBlob(key, value, ttlMs) {
      await client.set(`live:blob:${key}`, JSON.stringify(value), ttlMs ? px(ttlMs) : undefined);
    },
    async getBlob(key) {
      const raw = await client.get(`live:blob:${key}`);
      return raw ? safeParse(raw) : null;
    },
    async delBlob(key) { await client.del(`live:blob:${key}`).catch(() => {}); },
    async close() { /* the client is owned by matchQueue */ },
  };
}

/* ========================================================================== */
/* Facade — Redis when available, memory mirror underneath                    */
/* ========================================================================== */

const MIRRORED = new Set([
  'createRoom', 'updateRoom', 'incrRoom', 'maxRoom', 'deleteRoom',
  'addViewer', 'removeViewer', 'markUnique', 'addTo', 'removeFrom',
  'bumpGifter', 'pushComment', 'dropComment', 'setBlob', 'delBlob',
]);

/**
 * @param {object} opts
 * @param {() => object|null} opts.getRedis  resolved lazily — Redis connects
 *        after the live module is registered.
 */
function createLiveStore({ getRedis = () => null, onError = null } = {}) {
  const memory = createMemoryBackend();
  let redisBackend = null;
  let lastClient = null;
  let degraded = false;

  function backend() {
    const client = getRedis?.();
    if (!client || !client.isOpen) return null;
    if (client !== lastClient) {
      lastClient = client;
      redisBackend = createRedisBackend(client);
    }
    return redisBackend;
  }

  const store = { get kind() { return backend() ? 'redis' : 'memory'; } };

  for (const name of Object.keys(memory)) {
    if (typeof memory[name] !== 'function') continue;
    store[name] = async (...args) => {
      const rb = backend();
      if (!rb) return memory[name](...args);
      // With Redis live, writes go to both — so a Redis outage leaves each
      // instance able to keep serving the rooms it already knows about
      // instead of losing them. (Never mirror when memory IS the backend, or
      // every mutation would be applied twice.)
      if (MIRRORED.has(name)) Promise.resolve(memory[name](...args)).catch(() => {});
      try {
        const out = await rb[name](...args);
        degraded = false;
        return out;
      } catch (err) {
        if (!degraded) {
          degraded = true;
          onError?.(err);
        }
        return memory[name](...args);
      }
    };
  }

  // Redis-only helpers; memory answers "yes, you're the only instance".
  store.claimSweep = async (ttlMs) => {
    const rb = backend();
    if (!rb) return true;
    try { return await rb.claimSweep(ttlMs); } catch { return true; }
  };
  store.staleRooms = async () => {
    const rb = backend();
    if (!rb) return [];
    try { return await rb.staleRooms(); } catch { return []; }
  };
  store.isRedis = () => !!backend();

  return store;
}

module.exports = {
  createLiveStore,
  createMemoryBackend,
  createRedisBackend,
  ROOM_TTL_MS,
  COMMENT_REPLAY,
  VIEWER_LIST_MAX,
};
