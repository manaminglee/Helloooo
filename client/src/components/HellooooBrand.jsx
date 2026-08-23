/**
 * Helloooo brand — logo + gradient wordmark matching helloooo.site identity
 */

export const HELLOOOO_LOGO = '/helloooo-logo.png';
export const HELLOOOO_TAGLINE = 'Random people • Real conversations';
export const HELLOOOO_EMOJI = '👋';

export function HellooooLogo({ size = 40, className = '', alt = 'Helloooo' }) {
  return (
    <img
      src={HELLOOOO_LOGO}
      alt={alt}
      width={size}
      height={size}
      className={`helloooo-logo ${className}`.trim()}
      style={{ width: size, height: size, maxWidth: size, maxHeight: size }}
      decoding="async"
    />
  );
}

/** Styled wordmark: Hell (white) + oooo (gradient circles) */
export function HellooooBrand({ size = 'md', className = '', as: Tag = 'span' }) {
  const sizeClass = size === 'sm' ? 'helloooo-brand--sm' : size === 'lg' ? 'helloooo-brand--lg' : size === 'xl' ? 'helloooo-brand--xl' : '';
  return (
    <Tag className={`helloooo-brand ${sizeClass} ${className}`.trim()} aria-label="Helloooo">
      <span className="helloooo-brand__hell">Hell</span>
      <span className="helloooo-brand__o helloooo-brand__o1">o</span>
      <span className="helloooo-brand__o helloooo-brand__o2">o</span>
      <span className="helloooo-brand__o helloooo-brand__o3">o</span>
      <span className="helloooo-brand__o helloooo-brand__o4">o</span>
    </Tag>
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
