/**
 * Live and Audio ship as ONE installable app.
 *
 * Both surfaces share an identity, a wallet and a gift economy, so splitting
 * them into two installs would mean two icons, two sessions and two places to
 * recharge. Instead the manifest is swapped at runtime: while a viewer is in
 * Live or Audio, the browser's install prompt offers "Helloooo Live & Audio"
 * and the installed app opens straight into it, rather than at the landing page.
 *
 * Swapping the <link rel="manifest"> is what the install prompt reads, so this
 * has to happen BEFORE the prompt fires — hence calling it on mode entry.
 */

const DEFAULT_MANIFEST = '/manifest.json';
const LIVE_MANIFEST = '/manifest-live.json';
const THEME = { default: '#7c3aed', live: '#ff2d6f' };

function linkEl() {
  let el = document.querySelector('link[rel="manifest"]');
  if (!el) {
    el = document.createElement('link');
    el.rel = 'manifest';
    document.head.appendChild(el);
  }
  return el;
}

function themeEl() {
  let el = document.querySelector('meta[name="theme-color"]');
  if (!el) {
    el = document.createElement('meta');
    el.name = 'theme-color';
    document.head.appendChild(el);
  }
  return el;
}

/** @param {'live'|'default'} which */
export function useLiveManifest(which = 'default') {
  try {
    const wantLive = which === 'live';
    const href = wantLive ? LIVE_MANIFEST : DEFAULT_MANIFEST;
    const link = linkEl();
    // Re-setting the same href would make some browsers re-fetch and drop a
    // pending install prompt, so only touch it on a real change.
    if (!link.href.endsWith(href)) link.href = href;
    themeEl().content = wantLive ? THEME.live : THEME.default;
  } catch { /* head manipulation blocked — the default manifest still applies */ }
}

/** True when running as an installed app rather than a browser tab. */
export function isInstalled() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  } catch {
    return false;
  }
}

/** Which surface a deep link asked for: /live and /audio open straight in. */
export function launchTarget() {
  try {
    const path = (window.location.pathname || '/').toLowerCase();
    if (path.startsWith('/live')) return 'live';
    if (path.startsWith('/audio')) return 'audio';
    return null;
  } catch {
    return null;
  }
}
