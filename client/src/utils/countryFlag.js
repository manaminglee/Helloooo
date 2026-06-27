/** Convert ISO 3166-1 alpha-2 country code to flag emoji (e.g. "US" -> "🇺🇸") */
const NAME_TO_CODE = {
  india: 'IN',
  'united states': 'US',
  usa: 'US',
  'united kingdom': 'GB',
  uk: 'GB',
  canada: 'CA',
  australia: 'AU',
  germany: 'DE',
  france: 'FR',
  japan: 'JP',
  brazil: 'BR',
  mexico: 'MX',
  spain: 'ES',
  italy: 'IT',
  china: 'CN',
  russia: 'RU',
  pakistan: 'PK',
  bangladesh: 'BD',
  indonesia: 'ID',
  nigeria: 'NG',
  'south africa': 'ZA',
  'south korea': 'KR',
  korea: 'KR',
  telugu: 'IN',
};

export function normalizeCountryCode(cc) {
  if (!cc || typeof cc !== 'string') return '';
  const raw = cc.trim();
  if (raw.length === 2) return raw.toUpperCase();
  const named = NAME_TO_CODE[raw.toLowerCase()];
  if (named) return named;
  if (raw.length === 3) {
    // ISO 3166-1 alpha-3 common cases
    const a3 = { IND: 'IN', USA: 'US', GBR: 'GB', CAN: 'CA', AUS: 'AU', DEU: 'DE', FRA: 'FR' };
    if (a3[raw.toUpperCase()]) return a3[raw.toUpperCase()];
  }
  return '';
}

export function countryToFlag(cc) {
  const code = normalizeCountryCode(cc);
  if (!code) return '';
  return code
    .split('')
    .map((c) => String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0)))
    .join('');
}

export function countryFlagImageUrl(cc, width = 40) {
  const code = normalizeCountryCode(cc);
  if (!code) return null;
  return `https://flagcdn.com/w${width}/${code.toLowerCase()}.png`;
}
