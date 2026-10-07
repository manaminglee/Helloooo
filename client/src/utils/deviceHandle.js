/**
 * A stable per-browser handle for anonymous surfaces.
 *
 * Video and group video have no account, so before this the only identifier was
 * the IP address — which fails in both directions. One mobile carrier IP is
 * shared by thousands of people behind CGNAT, so blocking it punishes strangers
 * who did nothing; and an IP changes on its own every day, so a block or a
 * suspension evaporates without the person doing anything.
 *
 * This is not an identity and is not security. Clearing site data produces a new
 * handle, and it should — it is a convenience for keeping "I never want to see
 * this person again" working across a reconnect, not a ban that must hold
 * against someone determined to evade it. The IP remains as the fallback for
 * anyone with no handle at all.
 */

const KEY = 'mm_device_handle';

function randomHandle() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Read the handle, creating one on first use.
 *
 * Private windows and storage-blocked browsers throw on access rather than
 * returning null, and a session with no handle must still work — it simply
 * falls back to the IP server-side. So every path here is wrapped, and the
 * in-memory value keeps one session consistent even when nothing persists.
 */
let cached = null;
export function deviceHandle() {
  if (cached) return cached;
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing && /^[0-9a-f]{32}$/.test(existing)) {
      cached = existing;
      return cached;
    }
  } catch { /* storage unavailable — fall through to a session-only handle */ }

  const fresh = randomHandle();
  cached = fresh;
  try { window.localStorage.setItem(KEY, fresh); } catch { /* session-only */ }
  return fresh;
}

export default deviceHandle;
