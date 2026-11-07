import { useId } from 'react';

/**
 * Premium Nuts currency mark. Designed to read clearly at 16–24px:
 * chunky gold seed, contrasting pink cap, one highlight, no hairlines.
 */
export function NutsSymbol({ size = 16, className = '', title = 'Nuts' }) {
  const s = Number(size) || 16;
  const uid = useId().replace(/:/g, '');
  const g = `nutsBody-${uid}`;
  const cap = `nutsCap-${uid}`;
  const shine = `nutsShine-${uid}`;
  return (
    <svg
      className={`mm-nuts-symbol ${className}`.trim()}
      width={s}
      height={s}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={g} x1="8" y1="10" x2="24" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF3C4" />
          <stop offset="0.38" stopColor="#F0BE4A" />
          <stop offset="0.72" stopColor="#C4841C" />
          <stop offset="1" stopColor="#7A3E0C" />
        </linearGradient>
        <linearGradient id={cap} x1="8" y1="2" x2="24" y2="15" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFB1C8" />
          <stop offset="0.45" stopColor="#FF2D6F" />
          <stop offset="1" stopColor="#9F1239" />
        </linearGradient>
        <radialGradient id={shine} cx="34%" cy="38%" r="42%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="16" cy="29.2" rx="7.4" ry="1.5" fill="#000" opacity="0.28" />
      <path
        d="M16 10.2c6.5 0 11.2 4.2 11.2 10.4 0 6.2-4.5 10.6-11.2 10.6S4.8 26.8 4.8 20.6C4.8 14.4 9.5 10.2 16 10.2Z"
        fill={`url(#${g})`}
      />
      <path
        d="M16 10.2c6.5 0 11.2 4.2 11.2 10.4 0 6.2-4.5 10.6-11.2 10.6S4.8 26.8 4.8 20.6C4.8 14.4 9.5 10.2 16 10.2Z"
        fill="none"
        stroke="#5A2E0C"
        strokeWidth="1.15"
        opacity="0.35"
      />
      <ellipse cx="12.4" cy="17.6" rx="3.5" ry="4.6" fill={`url(#${shine})`} />
      <path
        d="M6.6 12.4C8.6 6.2 12.1 3.2 16 3.2c3.9 0 7.4 3 9.4 9.2-2.7 1.25-5.8 1.9-9.4 1.9s-6.7-.65-9.4-1.9Z"
        fill={`url(#${cap})`}
      />
      <path
        d="M6.6 12.4C8.6 6.2 12.1 3.2 16 3.2c3.9 0 7.4 3 9.4 9.2-2.7 1.25-5.8 1.9-9.4 1.9s-6.7-.65-9.4-1.9Z"
        fill="none"
        stroke="#7F1D1D"
        strokeWidth="1.05"
        opacity="0.35"
      />
      <path
        d="M8.4 10.6c1.6-3.4 4.1-5.2 7.6-5.2"
        stroke="#FFD0DE"
        strokeWidth="1.15"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path d="M16 2.4v3.4" stroke="#7F1D1D" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="2.5" r="1.55" fill="#FF2D6F" stroke="#FFD0DE" strokeWidth="0.5" />
    </svg>
  );
}

export function NutsAmount({ amount, size = 14, className = '', showLabel = false }) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  return (
    <span className={`mm-nuts-amount ${className}`.trim()}>
      <NutsSymbol size={size} />
      <span className="mm-nuts-amount__num">{n.toLocaleString()}</span>
      {showLabel && <span className="mm-nuts-amount__label">Nuts</span>}
    </span>
  );
}

export default NutsSymbol;
