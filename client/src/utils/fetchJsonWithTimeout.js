/**
 * Bounded JSON fetch used by session-critical flows (voice identity, wallets).
 * Callers must not retry account-creation blindly after a timeout — the
 * server may already have succeeded.
 */
export async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  } catch (e) {
    if (e?.name === 'AbortError') {
      const err = new Error('timeout');
      err.code = 'timeout';
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function isTimeoutError(err) {
  return err?.code === 'timeout' || err?.name === 'AbortError';
}
