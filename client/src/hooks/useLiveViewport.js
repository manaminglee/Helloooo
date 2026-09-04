import { useEffect, useState } from 'react';

/**
 * Keeps the live shell glued to the real visible viewport on mobile.
 *
 *  --live-vh  1% of the visual viewport, for browsers without dvh (iOS < 15.4)
 *  --kb       height the on-screen keyboard is currently stealing
 *
 * Both are written straight to the element as CSS custom properties, so the
 * layout reacts without React re-rendering the video tree on every resize.
 */
export function useLiveViewport(rootRef) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const el = rootRef?.current;
    if (!el) return undefined;

    const vv = window.visualViewport;
    let frame = 0;

    const apply = () => {
      frame = 0;
      const h = vv ? vv.height : window.innerHeight;
      el.style.setProperty('--live-vh', `${h / 100}px`);

      // Keyboard height = what the layout viewport has that the visual one lost.
      const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      // Ignore sub-100px deltas: those are URL bars collapsing, not a keyboard.
      const effective = kb > 100 ? kb : 0;
      el.style.setProperty('--kb', `${effective}px`);
      setKeyboardOpen(effective > 0);
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(apply);
    };

    apply();
    vv?.addEventListener('resize', schedule);
    vv?.addEventListener('scroll', schedule);
    window.addEventListener('orientationchange', schedule);
    window.addEventListener('resize', schedule);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      vv?.removeEventListener('resize', schedule);
      vv?.removeEventListener('scroll', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [rootRef]);

  return { keyboardOpen };
}

/** Locks background scrolling + pull-to-refresh while the live shell is open. */
export function useLiveBodyLock() {
  useEffect(() => {
    const { body, documentElement: html } = document;
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      overscroll: html.style.overscrollBehavior,
    };
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.width = '100%';
    html.style.overscrollBehavior = 'none';
    body.classList.add('mm-lives-mode');
    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.width = '';
      html.style.overscrollBehavior = prev.overscroll;
      body.classList.remove('mm-lives-mode');
    };
  }, []);
}
