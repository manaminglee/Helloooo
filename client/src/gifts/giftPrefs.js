const FAV_KEY = 'mm_gift_favorites_v1';
const RECENT_KEY = 'mm_gift_recent_v1';
const MUTE_KEY = 'mm_gift_mute_v1';

function readList(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch {
    return [];
  }
}

export function getFavoriteGiftIds() {
  return readList(FAV_KEY);
}

export function toggleFavoriteGift(id) {
  const key = String(id || '');
  if (!key) return getFavoriteGiftIds();
  const cur = getFavoriteGiftIds();
  const next = cur.includes(key) ? cur.filter((x) => x !== key) : [key, ...cur].slice(0, 40);
  try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* */ }
  return next;
}

export function getRecentGiftIds() {
  return readList(RECENT_KEY);
}

export function rememberRecentGift(id) {
  const key = String(id || '');
  if (!key) return getRecentGiftIds();
  const next = [key, ...getRecentGiftIds().filter((x) => x !== key)].slice(0, 16);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* */ }
  return next;
}

export function getGiftsMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

export function setGiftsMuted(muted) {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* */ }
  return !!muted;
}
