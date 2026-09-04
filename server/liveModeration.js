/**
 * Live moderation primitives — banned-word filter, slow mode, mute registry.
 * Pure functions + tiny state holders so liveStreams.js stays readable.
 */

const DEFAULT_BANNED = [
  // Deliberately conservative starter list; ops can extend via settings.
  'fuck', 'shit', 'bitch', 'bastard', 'asshole', 'cunt', 'whore', 'slut',
  'randi', 'madarchod', 'behenchod', 'bhosdi', 'chutiya', 'gandu', 'lauda',
  'nigger', 'faggot', 'retard', 'rape', 'kill yourself', 'kys',
];

// Leet / spacing evasion: c-h-u-t, f u c k, f*ck, ch00t
function normalizeForFilter(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/[^a-zऀ-ॿఀ-౿ ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildWordList(extra = []) {
  const set = new Set(DEFAULT_BANNED);
  for (const w of extra || []) {
    const t = String(w || '').trim().toLowerCase();
    if (t.length >= 2) set.add(t);
  }
  return [...set];
}

/**
 * @returns {{ blocked:boolean, masked:string, hits:string[] }}
 */
function filterText(text, wordList) {
  const raw = String(text || '');
  const flat = normalizeForFilter(raw);
  const squished = flat.replace(/ /g, '');
  const hits = [];
  for (const word of wordList) {
    const w = normalizeForFilter(word);
    if (!w) continue;
    if (flat.includes(w) || squished.includes(w.replace(/ /g, ''))) hits.push(word);
  }
  if (!hits.length) return { blocked: false, masked: raw, hits };
  // Mask rather than silently drop so the sender sees their message land.
  let masked = raw;
  for (const word of hits) {
    const pattern = word
      .split('')
      .map((ch) => (/[a-z]/i.test(ch) ? `${ch}[\\W_]*` : '\\W*'))
      .join('');
    try {
      masked = masked.replace(new RegExp(pattern, 'gi'), (m) => '*'.repeat(Math.max(3, m.trim().length)));
    } catch { /* bad regex, skip */ }
  }
  return { blocked: true, masked, hits };
}

/** Rolling-window rate limiter with per-key buckets and automatic GC. */
function createRateLimiter({ max, windowMs, gcEveryMs = 60_000 }) {
  const buckets = new Map();
  let lastGc = Date.now();
  return {
    check(key) {
      const now = Date.now();
      if (now - lastGc > gcEveryMs) {
        for (const [k, b] of buckets) if (now - b.start > windowMs * 4) buckets.delete(k);
        lastGc = now;
      }
      let b = buckets.get(key);
      if (!b || now - b.start > windowMs) {
        b = { start: now, count: 0 };
        buckets.set(key, b);
      }
      b.count += 1;
      return { ok: b.count <= max, retryInMs: Math.max(0, windowMs - (now - b.start)) };
    },
    reset(key) { buckets.delete(key); },
    clear() { buckets.clear(); },
  };
}

module.exports = {
  DEFAULT_BANNED,
  normalizeForFilter,
  buildWordList,
  filterText,
  createRateLimiter,
};
