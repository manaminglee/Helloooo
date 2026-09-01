/** Light haptic feedback for mobile taps (hello, PA invite, stickers). */
export function hapticTap(pattern = 12) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(Array.isArray(pattern) ? pattern : [pattern]);
    }
  } catch { /* ignore */ }
}

export function hapticSuccess() {
  hapticTap([10, 40, 14]);
}

export function hapticNotify() {
  hapticTap([18, 60, 22, 60, 18]);
}
