import { useState } from 'react';
import { normalizeCountryCode, countryToFlag } from '../utils/countryFlag';

/**
 * Renders a country flag.
 *
 * The image is preferred because emoji flags do not render at all on most
 * Windows builds. But the image comes from a third-party CDN, which can be
 * slow, blocked by a network, or unreachable offline — and a flag that
 * silently becomes a blank gap is worse than an emoji. So a failed load falls
 * back to the emoji, and if that is unavailable too, to the country code, so
 * something always tells you where the stranger is.
 */
export function CountryFlag({ country, className = '', size = 16, title, preferImage = true }) {
  const [imageFailed, setImageFailed] = useState(false);
  const code = normalizeCountryCode(country);
  if (!code) return null;
  const label = title || code;

  if (preferImage && !imageFailed) {
    return (
      <img
        src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
        srcSet={`https://flagcdn.com/w80/${code.toLowerCase()}.png 2x`}
        alt=""
        title={label}
        width={size}
        height={Math.round(size * 0.75)}
        className={`inline-block rounded-[2px] object-cover shrink-0 ${className}`}
        loading="lazy"
        onError={() => setImageFailed(true)}
      />
    );
  }

  const emoji = countryToFlag(code);
  return (
    <span className={className} title={label} role="img" aria-label={label}>
      {emoji || code}
    </span>
  );
}
