import { useEffect, useState } from 'react';

/** Default vanishing window for all chat messages (seconds). */
export const MESSAGE_TTL_SEC = 60;

/**
 * Countdown for a chat message. Returns remaining seconds (0 = vanished).
 * System / gift system lines can pass `{ system: true }` to skip vanishing.
 */
export function useMessageTtl(m, ttlSec = MESSAGE_TTL_SEC) {
  const [timeLeft, setTimeLeft] = useState(ttlSec);

  useEffect(() => {
    if (m?.system || m?.persist || m?.kind === 'gift') {
      setTimeLeft(ttlSec);
      return undefined;
    }
    const age = Math.floor((Date.now() - (m?.ts || Date.now())) / 1000);
    const rem = Math.max(0, ttlSec - age);
    setTimeLeft(rem);
    if (rem <= 0) return undefined;
    const int = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(int);
  }, [m?.ts, m?.system, m?.persist, ttlSec]);

  return timeLeft;
}

export function formatTtl(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export default useMessageTtl;
