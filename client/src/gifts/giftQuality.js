function webglAvailable() {
  if (typeof document === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl', { failIfMajorPerformanceCaveat: false })
      || c.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

export function detectGiftQuality() {
  if (typeof window === 'undefined') return 'mid';
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 'low';
  if (document.documentElement.classList.contains('mm-low-power')) return 'low';
  const ios = document.documentElement.classList.contains('is-ios')
    || document.documentElement.classList.contains('is-ios-native');
  // iOS hides deviceMemory — do not treat "unknown" as a 2GB phone.
  const mem = Number(navigator.deviceMemory) || 4;
  const cores = Number(navigator.hardwareConcurrency) || (ios ? 6 : 4);
  if (!ios && (mem <= 2 || cores <= 2)) return 'low';
  if (!webglAvailable()) return ios ? 'mid' : 'low';
  if (ios) return document.documentElement.classList.contains('is-ios-native') ? 'high' : 'mid';
  if (mem >= 8 && cores >= 6) return 'high';
  return 'mid';
}

export function particleCap(quality) {
  if (quality === 'high') return 40;
  if (quality === 'low') return 6;
  return 18;
}

function hasVideo(gift, mode) {
  if (mode === 'celebration') return !!(gift.celebrationUrl || gift.previewUrl);
  return !!(gift.previewUrl || gift.celebrationUrl);
}

export function resolveRenderType(gift, { mode = 'preview', quality = 'mid' } = {}) {
  if (!gift) return 'css';
  // Video is optional — never pick 3d_video unless a real URL exists.
  if (gift.renderType === '3d_video' && hasVideo(gift, mode)) return '3d_video';
  if (mode === 'celebration' && gift.celebrationUrl) return '3d_video';
  if (mode === 'preview' && gift.previewUrl) return '3d_video';
  // iOS mid still runs WebGL (WebGL1, no antialias). Only skip on explicit low.
  if (quality === 'low' && (gift.renderType === 'webgl' || gift.renderType === '3d_video')) return 'css';
  if (gift.renderType === '3d_video') return 'webgl';
  return gift.renderType || 'css';
}

export function celebrationDuration(gift) {
  const rarity = gift?.rarity || gift?.tier || 'common';
  const fallback = {
    common: 1800,
    uncommon: 2000,
    rare: 2800,
    epic: 3500,
    premium: 4000,
    legendary: 5500,
    mega: 8000,
    ultra: 8000,
  };
  return gift?.durationMs || fallback[rarity] || 2000;
}
