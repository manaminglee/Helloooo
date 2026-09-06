import { useEffect, useRef, useState } from 'react';

const EDGE = 28;
const COMMIT = 72;

/**
 * iOS interactive pop: swipe from the left edge to go back.
 */
export function useIosSwipeBack(enabled, onBack) {
  const ref = useRef(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      if (t.clientX > EDGE) return;
      startX = t.clientX;
      startY = t.clientY;
      tracking = true;
      setDragging(true);
    };
    const onMove = (e) => {
      if (!tracking) return;
      const t = e.touches?.[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (dy > 48 && dx < 24) {
        tracking = false;
        setDragging(false);
        setOffset(0);
        return;
      }
      setOffset(Math.max(0, Math.min(dx, window.innerWidth)));
    };
    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      setDragging(false);
      setOffset((cur) => {
        if (cur >= COMMIT) onBack?.();
        return 0;
      });
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled, onBack]);

  return { ref, offset, dragging };
}
