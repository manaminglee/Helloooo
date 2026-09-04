import { memo } from 'react';

/**
 * The verification badge.
 *
 * The rosette is generated geometry, not a hand-drawn outline: 12 identical
 * lobes on a circle, each a quadratic arc between an outer tip and an inner
 * valley. Hand-drawn scallops are never quite even, and unevenness is exactly
 * what makes a trust mark look counterfeit at 14px.
 *
 * `state` decides the colour, so the same shape carries every meaning:
 *   verified  blue   — identity confirmed
 *   creator   violet — an approved creator without identity verification
 *   staff     amber  — platform staff
 */
const ROSETTE = 'M 12.00 0.40 Q 14.41 3.02 17.80 1.95 Q 18.58 5.42 22.05 6.20 Q 20.98 9.59 23.60 12.00 Q 20.98 14.41 22.05 17.80 Q 18.58 18.58 17.80 22.05 Q 14.41 20.98 12.00 23.60 Q 9.59 20.98 6.20 22.05 Q 5.42 18.58 1.95 17.80 Q 3.02 14.41 0.40 12.00 Q 3.02 9.59 1.95 6.20 Q 5.42 5.42 6.20 1.95 Q 9.59 3.02 12.00 0.40 Z';

const PALETTE = {
  verified: { from: '#4cc4ff', to: '#1d8fe1', tick: '#05233a' },
  creator: { from: '#c98bff', to: '#8b3ff0', tick: '#25073f' },
  staff: { from: '#ffd66b', to: '#e08a00', tick: '#3a2100' },
};

export const VerifiedBadge = memo(function VerifiedBadge({
  size = 14,
  state = 'verified',
  className = '',
  title = 'Verified',
}) {
  const c = PALETTE[state] || PALETTE.verified;
  const s = Number(size) || 14;
  const gid = `mmvb-${state}`;

  return (
    <svg
      className={`mm-verified ${className}`.trim()}
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label={title}
      focusable="false"
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={gid} x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor={c.from} />
          <stop offset="1" stopColor={c.to} />
        </linearGradient>
      </defs>
      <path d={ROSETTE} fill={`url(#${gid})`} />
      {/* The tick is a dark cut-out rather than white, so the badge keeps its
          weight on both light and dark surfaces. */}
      <path
        d="M8.4 12.3 10.9 14.8 15.7 9.5"
        stroke={c.tick}
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
});

export default VerifiedBadge;
