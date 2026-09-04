/**
 * Expanded gift catalog — fruits, flowers, landmarks, premium, mega live gifts.
 * Costs are in Nuts (stored as coins in wallets). creatorShare = fraction to recipient.
 */
function g(id, name, cost, icon, category, tier, creatorShare, anim = null) {
  return { id, name, cost, icon, category, tier, creatorShare, anim: anim || tier };
}

const GIFTS = [
  // Fruits (6)
  g('apple', 'Apple', 8, '🍎', 'fruits', 'basic', 0.6),
  g('mango', 'Mango', 12, '🥭', 'fruits', 'basic', 0.6),
  g('banana', 'Banana', 6, '🍌', 'fruits', 'basic', 0.6),
  g('grape', 'Grapes', 10, '🍇', 'fruits', 'basic', 0.6),
  g('watermelon', 'Watermelon', 15, '🍉', 'fruits', 'basic', 0.65),
  g('pineapple', 'Pineapple', 18, '🍍', 'fruits', 'basic', 0.65),

  // Flowers (6)
  g('rose', 'Rose', 5, '🌹', 'flowers', 'basic', 0.6),
  g('tulip', 'Tulip', 8, '🌷', 'flowers', 'basic', 0.6),
  g('sunflower', 'Sunflower', 10, '🌻', 'flowers', 'basic', 0.6),
  g('cherry_blossom', 'Cherry Blossom', 14, '🌸', 'flowers', 'basic', 0.65),
  g('bouquet', 'Bouquet', 40, '💐', 'flowers', 'rare', 0.7),
  g('lotus', 'Lotus', 55, '🪷', 'flowers', 'rare', 0.7),

  // Country / landmark specials (20)
  g('charminar', 'Charminar', 80, '🕌', 'landmarks', 'rare', 0.7),
  g('taj_mahal', 'Taj Mahal', 120, '🏛️', 'landmarks', 'epic', 0.75),
  g('berlin_gate', 'Brandenburg Gate', 90, '🚪', 'landmarks', 'rare', 0.7),
  g('eiffel', 'Eiffel Tower', 100, '🗼', 'landmarks', 'epic', 0.75),
  g('statue_liberty', 'Statue of Liberty', 110, '🗽', 'landmarks', 'epic', 0.75),
  g('colosseum', 'Colosseum', 95, '🏟️', 'landmarks', 'rare', 0.7),
  g('big_ben', 'Big Ben', 85, '🕰️', 'landmarks', 'rare', 0.7),
  g('sydney_opera', 'Sydney Opera', 100, '🐚', 'landmarks', 'epic', 0.75),
  g('fuji', 'Mount Fuji', 90, '🗻', 'landmarks', 'rare', 0.7),
  g('pyramids', 'Pyramids', 110, '🏜️', 'landmarks', 'epic', 0.75),
  g('great_wall', 'Great Wall', 105, '🧱', 'landmarks', 'epic', 0.75),
  g('christ_redeemer', 'Christ the Redeemer', 100, '✝️', 'landmarks', 'epic', 0.75),
  g('burj', 'Burj Khalifa', 130, '🏙️', 'landmarks', 'epic', 0.75),
  g('machu', 'Machu Picchu', 95, '⛰️', 'landmarks', 'rare', 0.7),
  g('niagara', 'Niagara Falls', 75, '💦', 'landmarks', 'rare', 0.7),
  g('acropolis', 'Acropolis', 88, '🏺', 'landmarks', 'rare', 0.7),
  g('golden_gate', 'Golden Gate', 92, '🌉', 'landmarks', 'rare', 0.7),
  g('petra', 'Petra', 98, '🏜️', 'landmarks', 'rare', 0.7),
  g('angkor', 'Angkor Wat', 90, '🛕', 'landmarks', 'rare', 0.7),
  g('stonehenge', 'Stonehenge', 70, '🪨', 'landmarks', 'basic', 0.65),

  // Spectacles / fun
  g('sunglasses', 'Sunglasses', 20, '🕶️', 'spectacles', 'basic', 0.6),
  g('glasses', 'Glasses', 15, '👓', 'spectacles', 'basic', 0.6),
  g('party_glasses', 'Party Specs', 35, '🥳', 'spectacles', 'rare', 0.7),
  g('monocle', 'Monocle', 45, '🧐', 'spectacles', 'rare', 0.7),
  g('vr', 'VR Headset', 150, '🥽', 'spectacles', 'epic', 0.75),

  // Classic / premium
  g('heart', 'Heart', 10, '💖', 'classic', 'basic', 0.6),
  g('star', 'Star', 25, '⭐', 'classic', 'basic', 0.65),
  g('fire', 'Fire', 50, '🔥', 'classic', 'rare', 0.7),
  g('crown', 'Crown', 100, '👑', 'premium', 'rare', 0.7),
  g('diamond', 'Diamond', 250, '💎', 'premium', 'epic', 0.75),
  g('rocket', 'Rocket', 500, '🚀', 'premium', 'epic', 0.75),
  g('galaxy', 'Galaxy', 1000, '🌌', 'premium', 'legendary', 0.8),
  g('trophy', 'Trophy', 200, '🏆', 'premium', 'epic', 0.75),
  g('unicorn', 'Unicorn', 350, '🦄', 'premium', 'epic', 0.75),
  g('dragon', 'Dragon', 750, '🐉', 'premium', 'legendary', 0.8),
  g('champagne', 'Champagne', 180, '🍾', 'premium', 'epic', 0.75),
  g('cake', 'Celebration Cake', 60, '🎂', 'classic', 'rare', 0.7),

  // Mega / live-tier Nuts gifts (big animations)
  g('nut_storm', 'Nut Storm', 2500, '🌰', 'mega', 'mega', 0.78, 'mega'),
  g('golden_nut', 'Golden Nut', 5000, '✨', 'mega', 'mega', 0.8, 'mega'),
  g('phoenix', 'Phoenix', 10000, '🔥', 'mega', 'legendary', 0.82, 'legendary'),
  g('meteor', 'Meteor Shower', 15000, '☄️', 'mega', 'legendary', 0.85, 'legendary'),
  g('castle', 'Royal Castle', 25000, '🏰', 'mega', 'legendary', 0.85, 'legendary'),
  g('universe', 'Universe', 50000, '🌌', 'mega', 'legendary', 0.88, 'legendary'),
];

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'fruits', label: 'Fruits' },
  { id: 'flowers', label: 'Flowers' },
  { id: 'landmarks', label: 'Landmarks' },
  { id: 'spectacles', label: 'Spectacles' },
  { id: 'classic', label: 'Classic' },
  { id: 'premium', label: 'Premium' },
  { id: 'mega', label: 'Mega Live' },
];

/** Nuts packages (~10,000 Nuts = $1). Field `coins` is wallet credit amount. */
const COIN_PACKAGES = [
  { id: 'nuts_1k', name: 'Starter', coins: 1000, priceUsd: 0.99, priceInr: 99, icon: '🌰', label: 'Nuts' },
  { id: 'nuts_5k', name: 'Popular', coins: 5000, priceUsd: 4.99, priceInr: 449, icon: '✨', badge: 'Best', label: 'Nuts' },
  { id: 'nuts_10k', name: 'Fan Pack', coins: 10000, priceUsd: 9.99, priceInr: 899, icon: '💎', label: 'Nuts' },
  { id: 'nuts_25k', name: 'VIP Bundle', coins: 25000, priceUsd: 19.99, priceInr: 1799, icon: '👑', label: 'Nuts' },
  { id: 'nuts_50k', name: 'Whale Pack', coins: 50000, priceUsd: 39.99, priceInr: 3499, icon: '🚀', label: 'Nuts' },
  { id: 'nuts_100k', name: 'Agency Pack', coins: 100000, priceUsd: 69.99, priceInr: 5999, icon: '🏰', label: 'Nuts' },
];

const NUTS_PER_USD = 10000;

module.exports = { GIFTS, CATEGORIES, COIN_PACKAGES, NUTS_PER_USD };
