/**
 * Helloooo gift catalog.
 *
 * Five shelves the viewer actually browses by intent:
 *   funny      impulse gifts, a tap and a laugh
 *   lucky      chest gifts — every send rolls for a bonus payout
 *   luxury     the status ladder
 *   privilege  level-locked; you cannot buy your way past the gate
 *   hot        not a shelf of its own — a computed view of what is selling
 *
 * Prices sit on repeating 7/8/9 endings on purpose: those read as lucky in the
 * markets this ships to, and the ladder never has two neighbours close enough
 * to make the choice feel arbitrary.
 *
 * Every field the client needs to render a gift lives here, so the tray never
 * has to special-case a gift by id:
 *   art        key into components/icons/GiftArt
 *   motion     idle animation in the tray (float | spin | pulse | shimmer | orbit | bob)
 *   stage      centre-screen takeover on send: null | 'burst' | 'scene'
 *   lucky      draws the chest badge
 *   minLevel   privilege gate; the tray locks the card below this
 *   hot        eligible for the Hot shelf
 */

const RARITY_FOR = {
  basic: 'common',
  rare: 'uncommon',
  epic: 'epic',
  legendary: 'legendary',
  mega: 'ultra',
};

const DURATION_FOR = {
  common: 1800,
  uncommon: 2000,
  rare: 2800,
  epic: 3500,
  legendary: 5500,
  ultra: 8000,
};

const HERO_DIRECTION = {
  gold_watch: { scene: 'watch_orbit', renderType: 'webgl', description: 'Luxury watch in slow orbit with moving gold reflections.' },
  rose_bear: { scene: 'rose_ascent', renderType: 'webgl', description: 'Rose-covered bear rises as petals drift and a heart pulses.' },
  legend_crown: { scene: 'crown_rise', renderType: 'webgl', description: 'Royal crown rises with gem sparkle and golden rays.' },
  aeon_diamond: { scene: 'diamond_refract', renderType: 'webgl', description: 'Prism diamond rotates as light passes through the gem.' },
  neon_rider: { scene: 'rider_impact', renderType: 'webgl', description: 'Futuristic motorcycle enters with neon trails and impact.' },
  gold_rain: { scene: 'gold_cascade', renderType: 'webgl', description: 'Gold coins and bars fall, bounce, then explode.' },
  hyper_car: { scene: 'car_track', renderType: 'webgl', description: 'Hypercar tracks the camera with speed lines.' },
  dream_castle: { scene: 'castle_rise', renderType: 'webgl', description: 'Castle rises through clouds with a royal glow.' },
};

function g(id, name, cost, opts = {}) {
  const {
    category = 'funny',
    tier = 'basic',
    art = id,
    motion = 'bob',
    stage = null,
    creatorShare = null,
    lucky = false,
    minLevel = 0,
    hot = false,
    renderType: renderTypeOpt,
    scene: sceneOpt,
    thumbnailUrl = '',
    previewUrl = '',
    celebrationUrl = '',
    soundUrl = '',
    duration,
    enabled = true,
    sortOrder,
    description = '',
  } = opts;
  const rarity = opts.rarity || RARITY_FOR[tier] || 'common';
  const hero = HERO_DIRECTION[id] || null;
  const renderType = celebrationUrl
    ? '3d_video'
    : (renderTypeOpt || hero?.renderType || (stage === 'scene' && (rarity === 'legendary' || rarity === 'ultra') ? 'webgl' : 'css'));
  const scene = sceneOpt || hero?.scene || id;
  const durationMs = duration || DURATION_FOR[rarity] || 1800;
  return {
    id,
    name,
    cost,
    category,
    tier,
    art,
    motion,
    stage,
    lucky,
    minLevel,
    hot,
    creatorShare: creatorShare ?? DEFAULT_SHARE_FOR[tier] ?? 0.7,
    // Kept so older clients that still read `anim` keep working.
    anim: stage === 'scene' ? 'mega' : stage === 'burst' ? 'legendary' : tier,
    rarity,
    renderType,
    scene,
    thumbnailUrl,
    previewUrl,
    celebrationUrl,
    soundUrl,
    durationMs,
    previewDurationMs: Math.min(2400, durationMs),
    enabled,
    sortOrder: sortOrder ?? cost,
    description: description || hero?.description || '',
  };
}

/** Bigger gifts pay the creator a larger share — the reason to chase them. */
const DEFAULT_SHARE_FOR = {
  basic: 0.62,
  rare: 0.68,
  epic: 0.74,
  legendary: 0.80,
  mega: 0.86,
};

const GIFTS = [
  /* ---------------------------------------------------------------- funny */
  g('giggle_ears', 'Giggle Ears', 999, { category: 'funny', tier: 'basic', motion: 'bob', hot: true }),
  g('shady_specs', 'Shady Specs', 999, { category: 'funny', tier: 'basic', motion: 'shimmer' }),
  g('boom_star', 'Boom Star', 1999, { category: 'funny', tier: 'basic', motion: 'pulse', hot: true }),
  g('wink_wave', 'Wink Wave', 3999, { category: 'funny', tier: 'basic', motion: 'bob' }),
  g('petal_mask', 'Petal Mask', 5999, { category: 'funny', tier: 'rare', motion: 'float' }),
  g('cowboy_bear', 'Cowboy Bear', 9999, { category: 'funny', tier: 'rare', motion: 'bob', hot: true }),
  g('bloom_crown', 'Bloom Crown', 9999, { category: 'funny', tier: 'rare', motion: 'spin' }),
  g('hug_heart', 'Hug Heart', 9999, { category: 'funny', tier: 'rare', motion: 'pulse', hot: true }),

  /* ---------------------------------------------------------------- lucky */
  g('charm_donut', 'Charm Donut', 177, { category: 'lucky', tier: 'basic', motion: 'spin', lucky: true, hot: true }),
  g('charm_blush', 'Blush Charm', 177, { category: 'lucky', tier: 'basic', motion: 'pulse', lucky: true, hot: true }),
  g('charm_clap', 'Charm Clap', 277, { category: 'lucky', tier: 'basic', motion: 'bob', lucky: true }),
  g('charm_thumb', 'Charm Thumb', 377, { category: 'lucky', tier: 'basic', motion: 'bob', lucky: true, hot: true }),
  g('charm_fold', 'Fortune Fold', 388, { category: 'lucky', tier: 'basic', motion: 'pulse', lucky: true, hot: true }),
  g('charm_duck', 'Charm Duck', 577, { category: 'lucky', tier: 'basic', motion: 'float', lucky: true, hot: true }),
  g('charm_cheer', 'Charm Cheer', 588, { category: 'lucky', tier: 'rare', motion: 'bob', lucky: true, hot: true }),
  g('charm_bell', 'Charm Bell', 777, { category: 'lucky', tier: 'rare', motion: 'swing', lucky: true, hot: true }),
  g('charm_crystal', 'Charm Crystal', 977, { category: 'lucky', tier: 'rare', motion: 'shimmer', lucky: true }),
  g('glam_charm', 'Glam Charm', 7888, { category: 'lucky', tier: 'rare', motion: 'shimmer', lucky: true }),
  g('wish_lamp', 'Wish Lamp', 9777, { category: 'lucky', tier: 'epic', motion: 'shimmer', lucky: true }),
  g('hex_charm', 'Hex Charm', 9888, { category: 'lucky', tier: 'epic', motion: 'float', lucky: true }),
  g('wish_bottle', 'Wish Bottle', 17777, { category: 'lucky', tier: 'epic', motion: 'float', lucky: true }),
  g('fortune_tusk', 'Fortune Tusk', 18888, { category: 'lucky', tier: 'epic', motion: 'bob', lucky: true }),
  g('pearl_shell', 'Pearl Shell', 37777, { category: 'lucky', tier: 'epic', motion: 'shimmer', lucky: true }),
  g('cupid_bolt', 'Cupid Bolt', 38888, { category: 'lucky', tier: 'epic', motion: 'float', lucky: true, stage: 'burst' }),

  /* --------------------------------------------------------------- luxury */
  g('rose_bear', 'Rose Bear', 99999, { category: 'luxury', tier: 'epic', motion: 'bob', stage: 'burst', hot: true }),
  g('heart_wings', 'Heart Wings', 99999, { category: 'luxury', tier: 'epic', motion: 'float', stage: 'burst' }),
  g('gold_watch', 'Gold Watch', 199999, { category: 'luxury', tier: 'epic', motion: 'orbit', stage: 'burst' }),
  g('neon_rider', 'Neon Rider', 199999, { category: 'luxury', tier: 'epic', motion: 'shimmer', stage: 'burst' }),
  g('true_bloom', 'True Bloom', 299999, { category: 'luxury', tier: 'legendary', motion: 'float', stage: 'burst' }),
  g('gold_rain', 'Gold Rain', 399999, { category: 'luxury', tier: 'legendary', motion: 'shimmer', stage: 'burst' }),
  g('hyper_car', 'Hyper Car', 399999, { category: 'luxury', tier: 'legendary', motion: 'shimmer', stage: 'burst', hot: true }),
  g('skyline_glow', 'Skyline Glow', 499999, { category: 'luxury', tier: 'legendary', motion: 'shimmer', stage: 'scene' }),
  g('royal_lion', 'Royal Lion', 599999, { category: 'luxury', tier: 'legendary', motion: 'pulse', stage: 'scene' }),
  g('private_jet', 'Private Jet', 799999, { category: 'luxury', tier: 'legendary', motion: 'float', stage: 'scene' }),
  g('dream_castle', 'Dream Castle', 999999, { category: 'luxury', tier: 'mega', motion: 'shimmer', stage: 'scene' }),

  /* ------------------------------------------------------------ privilege */
  g('cloud_garden', 'Cloud Garden', 999999, { category: 'privilege', tier: 'mega', motion: 'float', stage: 'scene', minLevel: 9 }),
  g('tide_muse', 'Tide Muse', 1999999, { category: 'privilege', tier: 'mega', motion: 'float', stage: 'scene', minLevel: 10 }),
  g('aeon_diamond', 'Aeon Diamond', 3999999, { category: 'privilege', tier: 'mega', motion: 'shimmer', stage: 'scene', minLevel: 20 }),
  g('eternal_spire', 'Eternal Spire', 4999999, { category: 'privilege', tier: 'mega', motion: 'shimmer', stage: 'scene', minLevel: 30 }),
  g('legend_crown', 'Legend Crown', 9999999, { category: 'privilege', tier: 'mega', motion: 'orbit', stage: 'scene', minLevel: 40 }),
];

const CATEGORIES = [
  { id: 'hot', label: 'Hot' },
  { id: 'lucky', label: 'Lucky' },
  { id: 'funny', label: 'Funny' },
  { id: 'luxury', label: 'Luxury' },
  { id: 'privilege', label: 'Privilege' },
];

/**
 * Hot is a view, not a shelf. Six cheap movers plus the two priciest flagged
 * gifts — a shelf of only cheap items sells nothing bigger, and a shelf of only
 * expensive ones gets scrolled past.
 */
function hotGifts(list = GIFTS) {
  const flagged = list.filter((x) => x.hot).sort((a, b) => a.cost - b.cost);
  if (flagged.length <= 8) return flagged;
  return [...flagged.slice(0, 6), ...flagged.slice(-2)];
}

function giftsFor(categoryId, list = GIFTS) {
  if (categoryId === 'hot') return hotGifts(list);
  if (!categoryId || categoryId === 'all') return list;
  return list.filter((x) => x.category === categoryId);
}

/**
 * NUTS MARKET
 * ---------------------------------------------------------------------------
 * Every pack is priced off ONE base rate — 100 Nuts per rupee — and everything
 * above that is an explicit, visible bonus. Two reasons for that shape:
 *
 *   · the buyer can compare packs without arithmetic. "+18% bonus" and
 *     "118 Nuts per ₹" are the same fact said twice, and the UI shows both, so
 *     nobody has to divide to find the good deal.
 *   · the ceiling is a business constraint, not a taste. Creators cash out at
 *     NUTS_PAYOUT_PER_USD, and the top gift tier pays them 86% of what it cost.
 *     Push the bonus far enough and a whale buying the biggest pack to send the
 *     biggest gift costs the platform money on every send. MAX_NUTS_PER_INR is
 *     where that stops, and __paytest.js asserts every pack clears it with
 *     margin to spare.
 *
 * The old ladder gave 250 Nuts/₹ at the top, which was under water against the
 * payout rate. This one is narrower on purpose.
 */

const BASE_NUTS_PER_INR = 100;

/** Above this a top-tier gift pays out more than the Nuts cost to buy. */
const MAX_NUTS_PER_INR = 118;

function pack(id, name, priceInr, priceUsd, coins, extra = {}) {
  const base = priceInr * BASE_NUTS_PER_INR;
  return {
    id,
    name,
    label: 'Nuts',
    priceInr,
    priceUsd,
    coins,                                   // what actually lands in the wallet
    baseCoins: base,
    bonusCoins: coins - base,
    bonusPct: Math.round(((coins - base) / base) * 100),
    perRupee: Math.round((coins / priceInr) * 10) / 10,
    ...extra,
  };
}

const COIN_PACKAGES = [
  pack('nuts_5k', 'Taster', 49, 0.59, 5000),
  pack('nuts_10k', 'Starter', 99, 1.19, 10500),
  pack('nuts_32k', 'Regular', 299, 3.59, 32500),
  pack('nuts_68k', 'Popular', 599, 7.19, 68000, { badge: 'Most popular' }),
  pack('nuts_173k', 'Fan Pack', 1499, 17.99, 173000),
  pack('nuts_347k', 'VIP Bundle', 2999, 35.99, 347000),
  pack('nuts_936k', 'Whale Pack', 7999, 94.99, 936000, { badge: 'Best value' }),
  pack('nuts_2m', 'Legend Pack', 19999, 239.99, 2360000),
];

/**
 * Retired pack ids still resolve, so a checkout started before a price change
 * finishes at the price the buyer was shown rather than erroring out.
 */
const RETIRED_PACKS = {
  nuts_60k: 'nuts_68k',
  nuts_150k: 'nuts_173k',
  nuts_400k: 'nuts_347k',
  nuts_1m: 'nuts_936k',
  nuts_5m: 'nuts_2m',
};

function findCoinPackage(id) {
  const key = String(id || '');
  return COIN_PACKAGES.find((p) => p.id === key)
    || COIN_PACKAGES.find((p) => p.id === RETIRED_PACKS[key])
    || null;
}

/**
 * First purchase only, and deliberately small: a percentage with no cap turns
 * the biggest pack into the cheapest Nuts on the platform, which is exactly the
 * pack that has the least margin to give away.
 */
const FIRST_BUY_BONUS_PCT = 50;
const FIRST_BUY_BONUS_CAP = 8000;

function firstBuyBonus(coins) {
  return Math.min(FIRST_BUY_BONUS_CAP, Math.floor((Number(coins) || 0) * FIRST_BUY_BONUS_PCT / 100));
}

/** The cheapest pack that clears a shortfall — what the top-up sheet opens on. */
function packForShortfall(needed) {
  const n = Math.max(0, Number(needed) || 0);
  return COIN_PACKAGES.find((p) => p.coins >= n) || COIN_PACKAGES[COIN_PACKAGES.length - 1];
}

/** Creator cash-out rate. Not the purchase rate — see MAX_NUTS_PER_INR. */
const NUTS_PER_USD = 10000;
const DEFAULT_CREATOR_SHARE = Number(process.env.LIVE_GIFT_CREATOR_SHARE || 0.7);

function visualGiftFields(gift) {
  if (!gift) return null;
  return {
    id: gift.id,
    name: gift.name,
    art: gift.art || gift.id,
    motion: gift.motion || null,
    cost: gift.cost,
    tier: gift.tier,
    category: gift.category,
    lucky: !!gift.lucky,
    rarity: gift.rarity || RARITY_FOR[gift.tier] || 'common',
    renderType: gift.renderType || 'css',
    scene: gift.scene || gift.id,
    thumbnailUrl: gift.thumbnailUrl || '',
    previewUrl: gift.previewUrl || '',
    celebrationUrl: gift.celebrationUrl || '',
    soundUrl: gift.soundUrl || '',
    durationMs: gift.durationMs || DURATION_FOR[gift.rarity] || 1800,
    description: gift.description || '',
    minLevel: gift.minLevel || 0,
  };
}

module.exports = {
  GIFTS,
  CATEGORIES,
  COIN_PACKAGES,
  RETIRED_PACKS,
  findCoinPackage,
  packForShortfall,
  firstBuyBonus,
  BASE_NUTS_PER_INR,
  MAX_NUTS_PER_INR,
  FIRST_BUY_BONUS_PCT,
  FIRST_BUY_BONUS_CAP,
  NUTS_PER_USD,
  DEFAULT_CREATOR_SHARE,
  hotGifts,
  giftsFor,
  visualGiftFields,
  RARITY_FOR,
  DURATION_FOR,
  HERO_DIRECTION,
};
