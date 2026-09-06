export function detectGiftQuality() {
  if (typeof window === 'undefined') return 'mid';
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 'low';
  if (document.documentElement.classList.contains('mm-low-power')) return 'low';
  const mem = Number(navigator.deviceMemory) || 4;
  const cores = Number(navigator.hardwareConcurrency) || 4;
  if (mem <= 2 || cores <= 2) return 'low';
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
