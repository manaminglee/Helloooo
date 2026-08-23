import { lazy } from 'react';

const RELOAD_KEY = 'helloooo_chunk_reload';

/**
 * React.lazy wrapper that reloads once when a hashed chunk fails to load
 * (stale deploy / MIME HTML fallback). Avoids infinite reload loops.
 */
export function lazyRetry(factory) {
  return lazy(() =>
    factory().catch((err) => {
      try {
        if (!sessionStorage.getItem(RELOAD_KEY)) {
          sessionStorage.setItem(RELOAD_KEY, '1');
          window.location.reload();
          return new Promise(() => {});
        }
      } catch {
        /* sessionStorage unavailable */
      }
      throw err;
    })
  );
}

/** Call after app mounts successfully so a later deploy can reload again. */
export function clearChunkReloadFlag() {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* ignore */
  }
}

export function isChunkLoadError(error) {
  const msg = String(error?.message || error || '');
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Loading chunk [\d]+ failed/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /MIME type of ["']?text\/html/i.test(msg)
  );
}
