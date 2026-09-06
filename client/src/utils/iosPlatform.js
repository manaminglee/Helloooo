/**
 * iOS / Capacitor detection. Used for layout chrome, media unlock, and push.
 */
export function isAppleMobile() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iPadDesktop = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  return /iPhone|iPod|iPad/i.test(ua) || iPadDesktop;
}

export function isIosStandalone() {
  try {
    return window.navigator.standalone === true
      || window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: fullscreen)').matches;
  } catch {
    return false;
  }
}

export function isCapacitorNative() {
  try {
    return !!window.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

export function markIosPlatformClasses() {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (isAppleMobile()) html.classList.add('is-ios');
  if (isIosStandalone()) html.classList.add('is-ios-standalone');
  if (isCapacitorNative()) html.classList.add('is-ios-native');
}

export async function iosHaptic(style = 'light') {
  try {
    const cap = window.Capacitor;
    if (cap?.isNativePlatform?.()) {
      const mod = await import('@capacitor/haptics');
      const map = { light: 'LIGHT', medium: 'MEDIUM', heavy: 'HEAVY' };
      await mod.Haptics.impact({ style: mod.ImpactStyle[map[style] || 'LIGHT'] });
      return;
    }
  } catch { /* web or plugin missing */ }
  try {
    if (!isAppleMobile()) navigator.vibrate?.(10);
  } catch { /* */ }
}
