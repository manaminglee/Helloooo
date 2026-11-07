/**
 * Helloooo brand — logo + gradient wordmark matching helloooo.site identity
 */

export const HELLOOOO_LOGO = '/helloooo-logo.png';
export const HELLOOOO_ICON = '/helloooo-icon.svg';
export const HELLOOOO_ICON_SIMPLE = '/favicon.svg';
export const HELLOOOO_WORDMARK = '/helloooo-wordmark.svg';
export const HELLOOOO_WORDMARK_DARK = '/helloooo-wordmark-dark.svg';
export const HELLOOOO_TAGLINE = 'Random people • Real conversations';
export const HELLOOOO_EMOJI = '👋';

export function HellooooLogo({ size = 40, className = '', alt = 'Helloooo' }) {
  const src = size <= 32 ? HELLOOOO_ICON_SIMPLE : HELLOOOO_ICON;
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={`helloooo-logo ${className}`.trim()}
      style={{ width: size, height: size, maxWidth: size, maxHeight: size }}
      decoding="async"
    />
  );
}

/** Concept E wordmark: capital H + ell + four icon o-circles. */
export function HellooooBrand({ size = 'md', className = '', as: Tag = 'span', variant = 'dark' }) {
  const sizeClass = size === 'sm' ? 'helloooo-brand--sm' : size === 'lg' ? 'helloooo-brand--lg' : size === 'xl' ? 'helloooo-brand--xl' : '';
  const src = variant === 'light' ? HELLOOOO_WORDMARK : HELLOOOO_WORDMARK_DARK;
  return (
    <Tag className={`helloooo-brand helloooo-brand--mark ${sizeClass} ${className}`.trim()} aria-label="Helloooo">
      <img src={src} alt="Helloooo" className="helloooo-wordmark" decoding="async" />
    </Tag>
  );
}

/**
 * Circular Helloooo loader — orbit ring with brand core.
 */
export function HellooooLoader({
  label = 'Connecting…',
  hint = '',
  size = 148,
  className = '',
  transparent = false,
}) {
  const text = 'Helloooo · Helloooo · ';
  return (
    <div
      className={`helloooo-loader${transparent ? ' helloooo-loader--transparent' : ''} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="helloooo-loader__ring" style={{ width: size, height: size }}>
        <div className="helloooo-loader__halo" aria-hidden />
        <svg className="helloooo-loader__svg" viewBox="0 0 100 100" aria-hidden>
          <defs>
            <path id="helloooo-circle" d="M 50,50 m -36,0 a 36,36 0 1,1 72,0 a 36,36 0 1,1 -72,0" />
          </defs>
          <text className="helloooo-loader__path-text">
            <textPath href="#helloooo-circle" startOffset="0%">
              {text}
            </textPath>
          </text>
        </svg>
        <div className="helloooo-loader__core">
          <HellooooLogo size={Math.max(28, Math.round(size * 0.28))} />
        </div>
      </div>
      {label ? <p className="helloooo-loader__label">{label}</p> : null}
      {hint ? <p className="helloooo-loader__hint">{hint}</p> : null}
      <div className="helloooo-loader__bar" aria-hidden>
        <span />
      </div>
    </div>
  );
}

export function HellooooLockup({ logoSize = 40, brandSize = 'lg', showTagline = false, className = '' }) {
  return (
    <div className={`helloooo-lockup ${className}`.trim()}>
      <HellooooLogo size={logoSize} className="helloooo-lockup__logo" />
      <div className="helloooo-lockup__text">
        <HellooooBrand size={brandSize} as="h1" />
        {showTagline && (
          <p className="helloooo-lockup__tagline">
            {HELLOOOO_EMOJI} {HELLOOOO_TAGLINE}
          </p>
        )}
      </div>
    </div>
  );
}
