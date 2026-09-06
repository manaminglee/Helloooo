/**
 * Merged gift catalog: hardcoded GIFTS + admin overlay.
 * Overlay wins on the same id. New ids can be added without a frontend rewrite.
 */
const fs = require('fs');
const path = require('path');
const { GIFTS, CATEGORIES, visualGiftFields } = require('./giftCatalog');

const OVERLAY_PATH = path.join(__dirname, 'data', 'gift-catalog-overlay.json');
const RENDER_TYPES = new Set(['static', 'css', 'lottie', '3d_video', 'webgl']);
const RARITIES = new Set(['common', 'uncommon', 'rare', 'epic', 'premium', 'legendary', 'ultra']);
const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id).concat(['love', 'premium']));

let overlay = {};
let cached = null;

function loadOverlay() {
  try {
    const raw = fs.readFileSync(OVERLAY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    overlay = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    overlay = {};
  }
  cached = null;
}

function saveOverlay() {
  const dir = path.dirname(OVERLAY_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OVERLAY_PATH, JSON.stringify(overlay, null, 2));
  cached = null;
}

try { loadOverlay(); } catch { overlay = {}; }

function sanitizeUrl(url) {
  const s = String(url || '').trim().slice(0, 500);
  if (!s) return '';
  if (s.startsWith('/gifts/')) return s;
  if (/^https:\/\//i.test(s)) return s;
  return '';
}

function sanitizePatch(body, { creating = false } = {}) {
  const id = String(body.id || '').trim().slice(0, 48).replace(/[^a-z0-9_]/gi, '_');
  if (!id) return { error: 'id required' };

  const patch = { id };
  if (body.name != null) patch.name = String(body.name).trim().slice(0, 48);
  if (body.cost != null) {
    const cost = Math.floor(Number(body.cost));
    if (!Number.isFinite(cost) || cost < 1 || cost > 99_999_999) return { error: 'invalid cost' };
    patch.cost = cost;
  } else if (creating) {
    return { error: 'cost required' };
  }
  if (body.category != null) {
    const cat = String(body.category);
    if (!CATEGORY_IDS.has(cat) && cat !== 'funny' && cat !== 'lucky' && cat !== 'luxury' && cat !== 'privilege') {
      return { error: 'unknown category' };
    }
    patch.category = cat;
  }
  if (body.tier != null) patch.tier = String(body.tier).slice(0, 16);
  if (body.rarity != null) {
    if (!RARITIES.has(String(body.rarity))) return { error: 'unknown rarity' };
    patch.rarity = String(body.rarity);
  }
  if (body.renderType != null) {
    if (!RENDER_TYPES.has(String(body.renderType))) return { error: 'unknown renderType' };
    patch.renderType = String(body.renderType);
  }
  if (body.scene != null) patch.scene = String(body.scene).slice(0, 48);
  if (body.motion != null) patch.motion = String(body.motion).slice(0, 24);
  if (body.art != null) patch.art = String(body.art).slice(0, 48);
  if (body.description != null) patch.description = String(body.description).slice(0, 180);
  if (body.thumbnailUrl != null) patch.thumbnailUrl = sanitizeUrl(body.thumbnailUrl);
  if (body.previewUrl != null) patch.previewUrl = sanitizeUrl(body.previewUrl);
  if (body.celebrationUrl != null) patch.celebrationUrl = sanitizeUrl(body.celebrationUrl);
  if (body.soundUrl != null) patch.soundUrl = sanitizeUrl(body.soundUrl);
  if (body.durationMs != null) {
    const d = Math.floor(Number(body.durationMs));
    if (!Number.isFinite(d) || d < 400 || d > 20_000) return { error: 'duration 400–20000ms' };
    patch.durationMs = d;
  }
  if (body.sortOrder != null) patch.sortOrder = Math.floor(Number(body.sortOrder)) || 0;
  if (body.minLevel != null) patch.minLevel = Math.max(0, Math.floor(Number(body.minLevel)) || 0);
  if (body.enabled != null) patch.enabled = !!body.enabled;
  if (body.hot != null) patch.hot = !!body.hot;
  if (body.lucky != null) patch.lucky = !!body.lucky;
  if (body.creatorShare != null) {
    const share = Number(body.creatorShare);
    if (!Number.isFinite(share) || share <= 0 || share > 1) return { error: 'creatorShare must be 0–1' };
    patch.creatorShare = share;
  }
  if (patch.celebrationUrl && !patch.renderType) patch.renderType = '3d_video';
  return { patch };
}

function getMergedGifts({ includeDisabled = false } = {}) {
  if (cached && !includeDisabled) return cached;
  const byId = new Map(GIFTS.map((g) => [g.id, { ...g }]));
  for (const [id, patch] of Object.entries(overlay)) {
    const base = byId.get(id) || { id, art: id, motion: 'bob', category: 'funny', tier: 'basic', rarity: 'common', renderType: 'css', scene: id, enabled: true, lucky: false, hot: false, minLevel: 0, creatorShare: 0.7, cost: 1, name: id };
    byId.set(id, { ...base, ...patch, id });
  }
  let list = [...byId.values()];
  if (!includeDisabled) list = list.filter((g) => g.enabled !== false);
  list.sort((a, b) => (a.sortOrder || a.cost) - (b.sortOrder || b.cost));
  if (!includeDisabled) cached = list;
  return list;
}

function getGiftById(id) {
  const key = String(id || '');
  return getMergedGifts({ includeDisabled: true }).find((g) => g.id === key && g.enabled !== false) || null;
}

function upsertGift(body, { creating = false } = {}) {
  const { patch, error } = sanitizePatch(body, { creating });
  if (error) return { ok: false, error };
  const existing = overlay[patch.id] || {};
  overlay[patch.id] = { ...existing, ...patch };
  saveOverlay();
  return { ok: true, gift: getMergedGifts({ includeDisabled: true }).find((g) => g.id === patch.id) };
}

function deactivateGift(id) {
  const key = String(id || '');
  if (!key) return { ok: false, error: 'id required' };
  overlay[key] = { ...(overlay[key] || {}), id: key, enabled: false };
  saveOverlay();
  return { ok: true };
}

function registerGiftAdmin(app, { isAdminRequest }) {
  app.get('/api/admin/gifts', (req, res) => {
    if (!isAdminRequest(req)) return res.status(403).json({ error: 'Forbidden' });
    res.json({ gifts: getMergedGifts({ includeDisabled: true }), categories: CATEGORIES });
  });

  app.post('/api/admin/gifts', (req, res) => {
    if (!isAdminRequest(req)) return res.status(403).json({ error: 'Forbidden' });
    const creating = !overlay[String(req.body?.id || '')] && !GIFTS.some((g) => g.id === req.body?.id);
    const result = upsertGift(req.body || {}, { creating });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true, gift: visualGiftFields(result.gift) || result.gift });
  });

  app.post('/api/admin/gifts/disable', (req, res) => {
    if (!isAdminRequest(req)) return res.status(403).json({ error: 'Forbidden' });
    const result = deactivateGift(req.body?.id);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true });
  });
}

module.exports = {
  getMergedGifts,
  getGiftById,
  upsertGift,
  deactivateGift,
  registerGiftAdmin,
  visualGiftFields,
  loadOverlay,
};
