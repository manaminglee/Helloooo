/** Session display names shown to the other person. Never a link or markup. */

const CONTROL = /[\u0000-\u001F\u007F]/g;
const INVISIBLE = /[\u200B-\u200D\uFEFF\u2060]/g;

export function sanitizeDisplayName(raw, { max = 30, fallback = 'Anonymous' } = {}) {
  const cleaned = String(raw ?? '')
    .replace(CONTROL, '')
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

  if (!cleaned) return { ok: true, name: fallback, empty: true };
  if (/^https?:\/\//i.test(cleaned) || /<[^>]+>/.test(cleaned)) {
    return { ok: false, error: 'Use a name, not a link or HTML.' };
  }
  return { ok: true, name: cleaned, empty: false };
}
