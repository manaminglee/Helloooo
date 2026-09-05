/**
 * Live and Audio ship as ONE installable PWA.
 *
 * The unified manifest opens at /live and includes shortcuts to voice rooms.
 * Theme colour shifts to live pink while the person is on either surface.
 */

const UNIFIED_MANIFEST = '/manifest.json';
const THEME = { default: '#ff2d6f', live: '#ff2d6f' };

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
    const link = linkEl();
    if (!link.href.endsWith(UNIFIED_MANIFEST)) link.href = UNIFIED_MANIFEST;
    themeEl().content = which === 'live' ? THEME.live : THEME.default;
  } catch { /* head manipulation blocked */ }
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

export function isLiveAudioSurface(mode) {
  return mode === 'lives' || mode === 'group_text';
}
