import { normalizeCountryCode, countryToFlag } from '../utils/countryFlag';

/** Renders a country flag (image on desktop for reliable display; emoji fallback on mobile). */
export function CountryFlag({ country, className = '', size = 16, title, preferImage = true }) {
  const code = normalizeCountryCode(country);
  if (!code) return null;
  const label = title || code;
  if (preferImage) {
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
      />
    );
  }
  const emoji = countryToFlag(code);
  if (!emoji) return null;
  return (
    <span className={className} title={label} role="img" aria-label={label}>
      {emoji}
    </span>
  );
}
