import { useEffect } from 'react';

/**
 * Keep --vv-height and --kb-inset in sync with the visual viewport so
 * chat fields stay above the on-screen keyboard without covering controls.
 */
export function useVisualViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      const vv = window.visualViewport;
      const height = vv ? vv.height : window.innerHeight;
      const inset = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      root.style.setProperty('--vv-height', `${Math.round(height)}px`);
      root.style.setProperty('--kb-inset', `${Math.round(inset)}px`);
      root.classList.toggle('is-keyboard-open', inset > 80);
    };
    sync();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, []);
}

export default useVisualViewport;
