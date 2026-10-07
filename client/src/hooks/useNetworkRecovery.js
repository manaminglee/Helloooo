import { useEffect, useRef } from 'react';

/**
 * Restart the media path as soon as the network changes underneath a call.
 *
 * Walking out of the house takes you from wifi to cellular, which changes your
 * local address and silently kills every ICE candidate pair the call was using.
 * WebRTC does notice — eventually. `iceConnectionState` has to go `disconnected`
 * and then `failed`, and browsers deliberately wait before declaring that,
 * because a brief blip usually recovers on its own. The result is roughly ten to
 * fifteen seconds of frozen video before anything tries to fix it.
 *
 * The browser knows about the handover immediately, so this listens for it and
 * restarts straight away, turning that freeze into a blip.
 *
 * Three things make this safe to be aggressive about:
 *
 *   · a short debounce, because a handover fires several events in a row and
 *     each restart is a fresh offer
 *   · a floor between restarts, so a flapping connection cannot turn this into
 *     an offer loop that is worse than the problem
 *   · `active`, so nothing fires when there is no call to rescue
 *
 * An ICE restart on a connection that turned out to be fine is cheap and
 * invisible, so a false positive costs far less than a missed handover.
 */

const DEBOUNCE_MS = 400;
const MIN_GAP_MS = 4000;

export function useNetworkRecovery(onRecover, active = true) {
  const cbRef = useRef(onRecover);
  cbRef.current = onRecover;

  const lastRunRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!active || typeof window === 'undefined') return undefined;

    const trigger = (why) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const now = Date.now();
        if (now - lastRunRef.current < MIN_GAP_MS) return;
        lastRunRef.current = now;
        try { cbRef.current?.(why); } catch { /* never let a restart throw into an event handler */ }
      }, DEBOUNCE_MS);
    };

    // Back from a dead connection: the old candidates are certainly stale.
    const onOnline = () => trigger('online');

    // Fired on a wifi/cellular handover and on effective-type changes. Not
    // available on Safari, which is why `online` is handled separately rather
    // than relying on this alone.
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const onConnChange = () => trigger('connection-change');

    window.addEventListener('online', onOnline);
    conn?.addEventListener?.('change', onConnChange);

    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener('online', onOnline);
      conn?.removeEventListener?.('change', onConnChange);
    };
  }, [active]);
}

export default useNetworkRecovery;
