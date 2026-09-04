/**
 * Unique Nuts currency mark — not a generic coin emoji.
 * Use inline (badge) or with amount text.
 */
export function NutsSymbol({ size = 16, className = '', title = 'Nuts' }) {
  const s = Number(size) || 16;
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
        <linearGradient id="mmNutsGrad" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F5D78E" />
          <stop offset="0.45" stopColor="#D4A017" />
          <stop offset="1" stopColor="#8B5A00" />
        </linearGradient>
        <linearGradient id="mmNutsShine" x1="8" y1="4" x2="18" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="16" cy="17" rx="11" ry="12" fill="url(#mmNutsGrad)" stroke="#5C3A00" strokeWidth="1.2" />
      <path d="M16 5.5c0 0-3.5 4-3.5 11.5S16 28.5 16 28.5" stroke="#5C3A00" strokeWidth="1.1" strokeLinecap="round" opacity="0.55" />
      <path d="M16 5.5c0 0 3.5 4 3.5 11.5S16 28.5 16 28.5" stroke="#5C3A00" strokeWidth="1.1" strokeLinecap="round" opacity="0.35" />
      <path d="M11 9c2.2-1.8 5.5-2.2 8.2-.6" stroke="url(#mmNutsShine)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12.5" cy="13" r="1.2" fill="#fff" opacity="0.35" />
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
