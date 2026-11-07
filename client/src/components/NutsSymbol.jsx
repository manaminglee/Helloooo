import { useId } from 'react';

/**
 * Polished Nuts currency mark — original acorn-like seed with gold/pink sheen.
 * Unique gradient ids so multiple badges on one screen stay crisp.
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
        <linearGradient id={g} x1="6" y1="8" x2="26" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFE7A3" />
          <stop offset="0.42" stopColor="#E0A93A" />
          <stop offset="1" stopColor="#8A4B12" />
        </linearGradient>
        <linearGradient id={cap} x1="8" y1="2" x2="24" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF8AAB" />
          <stop offset="0.55" stopColor="#FF2D6F" />
          <stop offset="1" stopColor="#9F1239" />
        </linearGradient>
        <radialGradient id={shine} cx="38%" cy="32%" r="50%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="16" cy="29" rx="7.2" ry="1.6" fill="#000" opacity="0.22" />
      <path
        d="M16 8.2c6.4 0 11 4.6 11 11.2 0 6.2-4.4 11-11 11s-11-4.8-11-11C5 12.8 9.6 8.2 16 8.2Z"
        fill={`url(#${g})`}
      />
      <path d="M16 10.4c0 0-3.2 3.8-3.2 9.6S16 28.6 16 28.6" stroke="#6B3A10" strokeWidth="1.05" strokeLinecap="round" opacity="0.45" />
      <path d="M16 10.4c0 0 3.2 3.8 3.2 9.6S16 28.6 16 28.6" stroke="#6B3A10" strokeWidth="1.05" strokeLinecap="round" opacity="0.28" />
      <path
        d="M9.2 10.2C10.4 6.4 13 4 16 4c3 0 5.6 2.4 6.8 6.2-2 .8-4.4 1.2-6.8 1.2s-4.8-.4-6.8-1.2Z"
        fill={`url(#${cap})`}
      />
      <path d="M16 3.2c0 0-.2 2.4 0 3.6" stroke="#7F1D1D" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="16" cy="3.1" r="1.15" fill="#FF2D6F" />
      <ellipse cx="12.4" cy="16.5" rx="3.2" ry="4.4" fill={`url(#${shine})`} />
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
