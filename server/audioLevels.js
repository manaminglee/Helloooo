/**
 * Audio room level system — 50 levels from gifts received + coin recharges.
 * Display level is hidden when wallet balance is 0 (badge dormant until recharge).
 */

const MAX_LEVEL = 50;

/** Cumulative XP required to reach each level (level 1 = 0). */
function xpForLevel(level) {
  if (level <= 1) return 0;
  return Math.floor(40 * Math.pow(level - 1, 2.15));
}

function levelFromXp(xp) {
  let lvl = 1;
  for (let l = 2; l <= MAX_LEVEL; l++) {
    if (xp >= xpForLevel(l)) lvl = l;
    else break;
  }
  return lvl;
}

function xpToNextLevel(xp) {
  const lvl = levelFromXp(xp);
  if (lvl >= MAX_LEVEL) return 0;
  return Math.max(0, xpForLevel(lvl + 1) - xp);
}

/** Active level shown in UI — dormant when coins are empty. */
function displayLevel(record) {
  const coins = Math.max(0, Number(record?.coins) || 0);
  const xp = Math.max(0, Number(record?.xp) || 0);
  if (coins <= 0) return 0;
  return levelFromXp(xp);
}

function levelBadgeLabel(level) {
  if (level <= 0) return null;
  if (level >= 45) return 'Standing O';
  if (level >= 40) return 'Encore';
  if (level >= 35) return 'Crescendo';
  if (level >= 30) return 'Overture';
  if (level >= 25) return 'Anthem';
  if (level >= 20) return 'Harmony';
  if (level >= 15) return 'Melody';
  if (level >= 10) return 'Chorus';
  if (level >= 5) return 'Hum';
  return 'Whisper';
}

function levelPerks(level) {
  return {
    profileBadge: level >= 5,
    entryAnimation: level >= 10,
    entryTier:
      level >= 40 ? 'legend'
        : level >= 30 ? 'elite'
          : level >= 20 ? 'vip'
            : level >= 10 ? 'grand'
              : level >= 5 ? 'spark'
                : null,
    giftBoost: level >= 30 ? 1.15 : level >= 20 ? 1.1 : level >= 10 ? 1.05 : 1,
    extraPaThemes: level >= 8,
    customHello: level >= 15,
    priorityKnock: level >= 25,
  };
}

module.exports = {
  MAX_LEVEL,
  xpForLevel,
  levelFromXp,
  xpToNextLevel,
  displayLevel,
  levelBadgeLabel,
  levelPerks,
};
