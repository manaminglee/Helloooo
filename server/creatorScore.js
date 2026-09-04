/**
 * Creator score — the number behind "rank among all creators".
 *
 * Designed so it cannot be gamed by any single lever:
 *
 *   earnings   40%  coins actually received from gifts
 *   audience   25%  peak concurrent viewers, averaged across lives
 *   consistency 20% how many distinct days they went live in the last 30
 *   loyalty    15%  followers per live — do viewers come back, or just pass by
 *
 * Every input is compressed with log10 before weighting, so one whale gift or
 * one viral night lifts a creator without letting them lap the field. Raw
 * totals would make the board a list of whoever got lucky once.
 *
 * Two anti-gaming guards on top of that:
 *   · loyalty divides followers by at least 10 lives, so a single stream that
 *     picks up followers cannot report an enormous followers-per-live figure.
 *   · a maturity ramp scales the whole score until a creator has ~12 lives
 *     behind them. Without it, one lucky night outranks a year of work — the
 *     same reason a rating site does not trust a 5-star average from one review.
 *
 * Output is 0–1000. Rank is computed over approved creators only.
 */

const WEIGHTS = { earnings: 0.40, audience: 0.25, consistency: 0.20, loyalty: 0.15 };

/** log compression: 0 stays 0, and each 10× of input adds a fixed step. */
function compress(value, full) {
  const v = Math.max(0, Number(value) || 0);
  if (v <= 0) return 0;
  return Math.min(1, Math.log10(1 + v) / Math.log10(1 + full));
}

/**
 * @param {object} m
 * @param {number} m.coinsReceived   lifetime gift coins
 * @param {number} m.avgPeakViewers  mean peak viewers per live
 * @param {number} m.activeDays30    distinct days live in the last 30
 * @param {number} m.followers
 * @param {number} m.totalLives
 */
function scoreCreator(m = {}) {
  const earnings = compress(m.coinsReceived, 500_000);
  const audience = compress(m.avgPeakViewers, 2_000);
  const consistency = Math.min(1, (Number(m.activeDays30) || 0) / 20);
  const lives = Math.max(0, Number(m.totalLives) || 0);
  const perLive = (Number(m.followers) || 0) / Math.max(lives, 10);
  const loyalty = compress(perLive, 200);

  const raw =
    earnings * WEIGHTS.earnings +
    audience * WEIGHTS.audience +
    consistency * WEIGHTS.consistency +
    loyalty * WEIGHTS.loyalty;

  // Until there is enough history to judge, the score is held back.
  const maturity = 0.35 + 0.65 * Math.min(1, lives / 12);

  return {
    score: Math.round(raw * maturity * 1000),
    maturity: Math.round(maturity * 100),
    parts: {
      earnings: Math.round(earnings * 100),
      audience: Math.round(audience * 100),
      consistency: Math.round(consistency * 100),
      loyalty: Math.round(loyalty * 100),
    },
  };
}

/** Human label for the score band, used on the profile sheet. */
function scoreTier(score) {
  if (score >= 850) return { id: 'elite', label: 'Elite' };
  if (score >= 650) return { id: 'star', label: 'Star' };
  if (score >= 400) return { id: 'rising', label: 'Rising' };
  if (score >= 150) return { id: 'active', label: 'Active' };
  return { id: 'new', label: 'New' };
}

module.exports = { scoreCreator, scoreTier, WEIGHTS };
