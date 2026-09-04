/** Display helpers — storage may still use `coins`; UI says Nuts. */
export const NUTS_LABEL = 'Nuts';
export const NUTS_PER_USD = 10000;

export function formatNuts(amount) {
  return Math.max(0, Math.floor(Number(amount) || 0)).toLocaleString();
}

export function nutsToUsd(amount) {
  return (Math.max(0, Number(amount) || 0) / NUTS_PER_USD).toFixed(2);
}

export function labelCurrency(text) {
  return String(text || '')
    .replace(/\bcoins?\b/gi, 'Nuts')
    .replace(/\bCoins\b/g, 'Nuts');
}
