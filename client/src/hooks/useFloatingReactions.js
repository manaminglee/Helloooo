import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_ON_SCREEN = 26;   // hard DOM cap — a like storm cannot exceed this
const MAX_QUEUE = 60;       // anything beyond this is dropped, not buffered
const DRAIN_MS = 70;        // one heart spawned per tick
const LIFETIME_MS = 2900;

const GLYPHS = ['❤️', '💗', '💖', '💘', '💕', '✨'];

let seq = 0;

function makeHeart(color) {
  seq += 1;
  const drift = () => `${Math.round((Math.random() - 0.5) * 54)}px`;
  return {
    id: seq,
    glyph: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
    style: {
      '--x1': drift(),
      '--x2': drift(),
      '--x3': drift(),
      '--scale': (0.62 + Math.random() * 0.75).toFixed(2),
      '--rot': `${Math.round((Math.random() - 0.5) * 34)}deg`,
      '--dur': `${Math.round(2200 + Math.random() * 1300)}ms`,
      color: color || undefined,
    },
    bornAt: Date.now(),
  };
}

/**
 * Floating heart engine.
 *
 * A burst of N likes is queued, not rendered at once: the queue drains on a
 * single shared interval so rapid taps stay smooth, the live DOM count is
 * capped, and expired nodes are swept even if their animationend never fires
 * (backgrounded tab, reduced motion).
 */
export function useFloatingReactions({ enabled = true } = {}) {
  const [hearts, setHearts] = useState([]);
  const queueRef = useRef([]);
  const timerRef = useRef(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const stopDrain = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startDrain = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      const next = queueRef.current.shift();
      if (!next) { stopDrain(); return; }
      setHearts((list) => {
        const trimmed = list.length >= MAX_ON_SCREEN ? list.slice(1) : list;
        return [...trimmed, next];
      });
    }, DRAIN_MS);
  }, []);

  const burst = useCallback((count = 1, colors = []) => {
    if (!enabledRef.current || document.hidden) return;
    const n = Math.min(Math.max(1, Math.floor(count)), 40);
    for (let i = 0; i < n; i += 1) {
      if (queueRef.current.length >= MAX_QUEUE) break;
      queueRef.current.push(makeHeart(colors[i % Math.max(1, colors.length)]));
    }
    startDrain();
  }, [startDrain]);

  const remove = useCallback((id) => {
    setHearts((list) => list.filter((h) => h.id !== id));
  }, []);

  // Safety sweep: nothing can leak past its lifetime.
  useEffect(() => {
    const sweep = setInterval(() => {
      const cutoff = Date.now() - LIFETIME_MS;
      setHearts((list) => (list.some((h) => h.bornAt < cutoff)
        ? list.filter((h) => h.bornAt >= cutoff)
        : list));
    }, 1200);
    return () => clearInterval(sweep);
  }, []);

  // Stop spawning while the tab is hidden; flush what is queued on return.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        queueRef.current = [];
        stopDrain();
        setHearts([]);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => () => { stopDrain(); queueRef.current = []; }, []);

  return { hearts, burst, remove };
}
