/** Lives UI is mobile-first. Treat real phones/tablets (incl. iPadOS desktop UA) as mobile. */
export function isMobileLiveDevice() {
  if (typeof window === 'undefined') return true;
  const ua = navigator.userAgent || '';
  // iPadOS 13+ often reports as Macintosh + touch
  const iPadDesktopUa = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  const appleMobile = /iPhone|iPod|iPad/i.test(ua) || iPadDesktopUa;
  if (appleMobile) return true;

  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.matchMedia('(max-width: 900px)').matches;
  const uaMobile = /Android|Mobile/i.test(ua);
  return (coarse && narrow) || uaMobile;
}

/** Safari (iOS or macOS) — used for media / autoplay quirks. */
export function isSafariBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS|OPiOS|Android/i.test(ua);
  const isIOS = /iPhone|iPod|iPad/i.test(ua)
    || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  return isSafari || isIOS;
}
