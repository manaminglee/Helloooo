/**
 * Helloooo-native gift catalog — unique names, not generic fruit clones.
 * Costs in Nuts. creatorShare = fraction to recipient.
 */
function g(id, name, cost, icon, category, tier, creatorShare, anim = null) {
  return { id, name, cost, icon, category, tier, creatorShare, anim: anim || tier };
}

const GIFTS = [
  // Helloooo signature
  g('hello_halo', 'Hello Halo', 12, '💫', 'helloooo', 'basic', 0.65),
  g('oooo_orbit', 'Oooo Orbit', 28, '🌀', 'helloooo', 'basic', 0.65),
  g('night_nut', 'Night Nut', 45, '🌰', 'helloooo', 'rare', 0.7),
  g('wave_ring', 'Wave Ring', 60, '👋', 'helloooo', 'rare', 0.7),
  g('mirror_moon', 'Mirror Moon', 90, '🌙', 'helloooo', 'epic', 0.75),
  g('brand_burst', 'Brand Burst', 180, '✨', 'helloooo', 'epic', 0.75),

  // Spark / reactions
  g('soft_spark', 'Soft Spark', 8, '✴️', 'spark', 'basic', 0.6),
  g('pulse_heart', 'Pulse Heart', 20, '💗', 'spark', 'basic', 0.65),
  g('comet_kiss', 'Comet Kiss', 55, '☄️', 'spark', 'rare', 0.7),
  g('neon_flame', 'Neon Flame', 85, '🔥', 'spark', 'rare', 0.72),
  g('thunder_clap', 'Thunder Clap', 140, '⚡', 'spark', 'epic', 0.75),
  g('aurora_veil', 'Aurora Veil', 320, '🌈', 'spark', 'legendary', 0.8, 'legendary'),

  // Cosmic
  g('stardust', 'Stardust', 35, '✦', 'cosmic', 'basic', 0.65),
  g('lunar_gift', 'Lunar Gift', 75, '🌕', 'cosmic', 'rare', 0.7),
  g('nebula_note', 'Nebula Note', 160, '🎵', 'cosmic', 'epic', 0.75),
  g('gravity_crown', 'Gravity Crown', 400, '👑', 'cosmic', 'epic', 0.78),
  g('void_bloom', 'Void Bloom', 900, '🖤', 'cosmic', 'legendary', 0.82, 'legendary'),
  g('galaxy_gate', 'Galaxy Gate', 1500, '🌌', 'cosmic', 'legendary', 0.85, 'legendary'),

  // Partner / battle
  g('battle_spark', 'Battle Spark', 50, '⚔️', 'partner', 'rare', 0.7),
  g('duo_flare', 'Duo Flare', 120, '🤝', 'partner', 'epic', 0.75),
  g('hp_seal', 'HP Seal', 250, '🏅', 'partner', 'epic', 0.78),
  g('rematch_rose', 'Rematch Rose', 70, '🌹', 'partner', 'rare', 0.72),
  g('split_stage', 'Split Stage', 500, '🎭', 'partner', 'legendary', 0.8, 'legendary'),

  // Mega live takeovers
  g('nut_storm', 'Nut Storm', 2500, '🌰', 'mega', 'mega', 0.78, 'mega'),
  g('golden_nut', 'Golden Nut', 5000, '✨', 'mega', 'mega', 0.8, 'mega'),
  g('phoenix', 'Phoenix Rise', 10000, '🔥', 'mega', 'legendary', 0.82, 'legendary'),
  g('meteor', 'Meteor Parade', 15000, '☄️', 'mega', 'legendary', 0.85, 'legendary'),
  g('hello_castle', 'Hello Castle', 25000, '🏰', 'mega', 'legendary', 0.85, 'legendary'),
  g('universe', 'Universe Oooo', 50000, '🌌', 'mega', 'legendary', 0.88, 'legendary'),
];

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'helloooo', label: 'Helloooo' },
  { id: 'spark', label: 'Spark' },
  { id: 'cosmic', label: 'Cosmic' },
  { id: 'partner', label: 'Partner' },
  { id: 'mega', label: 'Mega' },
];

const COIN_PACKAGES = [
  { id: 'nuts_1k', name: 'Starter', coins: 1000, priceUsd: 0.99, priceInr: 99, icon: '🌰', label: 'Nuts' },
  { id: 'nuts_5k', name: 'Popular', coins: 5000, priceUsd: 4.99, priceInr: 449, icon: '✨', badge: 'Best', label: 'Nuts' },
  { id: 'nuts_10k', name: 'Fan Pack', coins: 10000, priceUsd: 9.99, priceInr: 899, icon: '💎', label: 'Nuts' },
  { id: 'nuts_25k', name: 'VIP Bundle', coins: 25000, priceUsd: 19.99, priceInr: 1799, icon: '👑', label: 'Nuts' },
  { id: 'nuts_50k', name: 'Whale Pack', coins: 50000, priceUsd: 39.99, priceInr: 3499, icon: '🚀', label: 'Nuts' },
  { id: 'nuts_100k', name: 'Agency Pack', coins: 100000, priceUsd: 69.99, priceInr: 5999, icon: '🏰', label: 'Nuts' },
];

const NUTS_PER_USD = 10000;
const DEFAULT_CREATOR_SHARE = Number(process.env.LIVE_GIFT_CREATOR_SHARE || 0.7);

module.exports = { GIFTS, CATEGORIES, COIN_PACKAGES, NUTS_PER_USD, DEFAULT_CREATOR_SHARE };
