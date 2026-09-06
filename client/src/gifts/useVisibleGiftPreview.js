import { useEffect, useRef, useState } from 'react';

export function useVisibleGiftPreview(active = true) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return undefined;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const io = new IntersectionObserver(([entry]) => {
      setVisible(!!entry?.isIntersecting);
    }, { root: null, threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [active]);

  return { ref, visible };
}
