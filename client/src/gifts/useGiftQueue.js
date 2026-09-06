import { useCallback, useRef, useState } from 'react';

function priority(payload) {
  const r = payload?.gift?.rarity || payload?.gift?.tier || '';
  if (r === 'ultra' || r === 'mega') return 3;
  if (r === 'legendary') return 2;
  return 1;
}

export function useGiftQueue() {
  const [current, setCurrent] = useState(null);
  const pending = useRef([]);
  const currentRef = useRef(null);

  const kick = useCallback(() => {
    if (currentRef.current) return;
    pending.current.sort((a, b) => b.pri - a.pri || a.at - b.at);
    const next = pending.current.shift();
    currentRef.current = next?.payload || null;
    setCurrent(currentRef.current);
  }, []);

  const enqueue = useCallback((payload) => {
    if (!payload) return;
    const rarity = payload.gift?.rarity || '';
    if (
      currentRef.current?.comboId
      && payload.comboId
      && currentRef.current.comboId === payload.comboId
      && rarity !== 'legendary'
      && rarity !== 'ultra'
    ) {
      return;
    }
    if (!currentRef.current) {
      currentRef.current = payload;
      setCurrent(payload);
      return;
    }
    pending.current.push({ payload, pri: priority(payload), at: Date.now() });
  }, []);

  const done = useCallback(() => {
    currentRef.current = null;
    setCurrent(null);
    queueMicrotask(kick);
  }, [kick]);

  const reset = useCallback(() => {
    pending.current = [];
    currentRef.current = null;
    setCurrent(null);
  }, []);

  return { current, enqueue, done, reset };
}
