/**
 * Minimal in-process stand-in for the node-redis v4 client — TEST SUPPORT ONLY.
 *
 * It implements exactly the commands server/liveStore.js issues, with the same
 * return shapes and TTL semantics, so the Redis code path can be exercised in
 * CI without a Redis server. It is not a general Redis implementation and is
 * never required by production code.
 */
function createFakeRedis() {
  const data = new Map();     // key -> value (string | Map | Set | Array)
  const ttl = new Map();      // key -> epoch ms

  const now = () => Date.now();

  function alive(key) {
    const exp = ttl.get(key);
    if (exp != null && exp <= now()) { data.delete(key); ttl.delete(key); return false; }
    return data.has(key);
  }
  function get(key, make) {
    if (!alive(key)) { if (!make) return null; data.set(key, make()); }
    return data.get(key);
  }

  const asArray = (k) => (Array.isArray(k) ? k : [k]);

  return {
    isOpen: true,
    _dump: () => data,

    /* ---- strings ---- */
    async set(key, value, opts = {}) {
      if (opts.NX && alive(key)) return null;
      data.set(key, String(value));
      if (opts.PX) ttl.set(key, now() + opts.PX);
      else ttl.delete(key);
      return 'OK';
    },
    async get(key) { return alive(key) ? data.get(key) : null; },
    async incr(key) {
      const n = (alive(key) ? Number(data.get(key)) : 0) + 1;
      data.set(key, String(n));
      return n;
    },
    async del(key) {
      let n = 0;
      for (const k of asArray(key)) { if (data.delete(k)) n += 1; ttl.delete(k); }
      return n;
    },
    async exists(key) { return alive(key) ? 1 : 0; },
    async expire(key, seconds) {
      if (!alive(key)) return 0;
      ttl.set(key, now() + seconds * 1000);
      return 1;
    },
    async pExpire(key, ms) {
      if (!alive(key)) return 0;
      ttl.set(key, now() + ms);
      return 1;
    },

    /* ---- hashes ---- */
    async hSet(key, fieldOrObj, value) {
      const h = get(key, () => new Map());
      if (typeof fieldOrObj === 'object') {
        for (const [k, v] of Object.entries(fieldOrObj)) h.set(k, String(v));
      } else h.set(fieldOrObj, String(value));
      return 1;
    },
    async hGet(key, field) { return alive(key) ? (data.get(key).get(field) ?? null) : null; },
    async hGetAll(key) {
      if (!alive(key)) return {};
      return Object.fromEntries(data.get(key));
    },
    async hmGet(key, fields) {
      const h = alive(key) ? data.get(key) : new Map();
      return fields.map((f) => h.get(f) ?? null);
    },
    async hDel(key, field) {
      if (!alive(key)) return 0;
      return data.get(key).delete(field) ? 1 : 0;
    },
    async hLen(key) { return alive(key) ? data.get(key).size : 0; },
    async hIncrBy(key, field, by) {
      const h = get(key, () => new Map());
      const n = (Number(h.get(field)) || 0) + by;
      h.set(field, String(n));
      return n;
    },
    async hScan(key, cursor, opts = {}) {
      const h = alive(key) ? data.get(key) : new Map();
      const all = [...h.entries()];
      const count = opts.COUNT || 10;
      const start = Number(cursor) || 0;
      const slice = all.slice(start, start + count);
      const next = start + count >= all.length ? 0 : start + count;
      return { cursor: next, tuples: slice.map(([field, value]) => ({ field, value })) };
    },

    /* ---- sets ---- */
    async sAdd(key, member) { get(key, () => new Set()).add(String(member)); return 1; },
    async sRem(key, member) { return alive(key) && data.get(key).delete(String(member)) ? 1 : 0; },
    async sIsMember(key, member) { return alive(key) && data.get(key).has(String(member)); },
    async sMembers(key) { return alive(key) ? [...data.get(key)] : []; },

    /* ---- sorted sets ---- */
    async zAdd(key, entry) {
      const z = get(key, () => new Map());
      for (const e of asArray(entry)) z.set(String(e.value), Number(e.score));
      return 1;
    },
    async zIncrBy(key, by, member) {
      const z = get(key, () => new Map());
      const n = (z.get(String(member)) || 0) + by;
      z.set(String(member), n);
      return n;
    },
    async zScore(key, member) { return alive(key) ? (data.get(key).get(String(member)) ?? null) : null; },
    async zRem(key, member) { return alive(key) && data.get(key).delete(String(member)) ? 1 : 0; },
    async zRange(key, start, stop, opts = {}) {
      if (!alive(key)) return [];
      const sorted = [...data.get(key).entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m);
      if (opts.REV) sorted.reverse();
      const end = stop === -1 ? sorted.length : stop + 1;
      return sorted.slice(start, end);
    },

    /* ---- hyperloglog (exact here; only the count matters) ---- */
    async pfAdd(key, member) { get(key, () => new Set()).add(String(member)); return 1; },
    async pfCount(key) { return alive(key) ? data.get(key).size : 0; },

    /* ---- lists ---- */
    async rPush(key, value) { const l = get(key, () => []); l.push(String(value)); return l.length; },
    async lRange(key, start, stop) {
      if (!alive(key)) return [];
      const l = data.get(key);
      const s = start < 0 ? Math.max(0, l.length + start) : start;
      const e = stop < 0 ? l.length + stop + 1 : stop + 1;
      return l.slice(s, e);
    },
    async lTrim(key, start, stop) {
      if (!alive(key)) return 'OK';
      const l = data.get(key);
      const s = start < 0 ? Math.max(0, l.length + start) : start;
      const e = stop < 0 ? l.length + stop + 1 : stop + 1;
      data.set(key, l.slice(s, e));
      return 'OK';
    },
    async lRem(key, count, value) {
      if (!alive(key)) return 0;
      const l = data.get(key);
      const i = l.indexOf(String(value));
      if (i < 0) return 0;
      l.splice(i, 1);
      return 1;
    },
  };
}

module.exports = { createFakeRedis };
