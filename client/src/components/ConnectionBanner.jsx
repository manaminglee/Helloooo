import { useEffect, useRef, useState } from 'react';

/**
 * ConnectionBanner.jsx — Slim fixed banner that surfaces socket connectivity.
 *
 * - While disconnected: "Connection lost — reconnecting…" with a pulsing dot.
 * - On reconnect: brief "Reconnected" success state (2s), then hides.
 * - Hidden entirely while connected normally.
 */
export function ConnectionBanner({ connected }) {
  const [showReconnected, setShowReconnected] = useState(false);
  const wasDisconnectedRef = useRef(false);

  useEffect(() => {
    if (!connected) {
      wasDisconnectedRef.current = true;
      setShowReconnected(false);
      return undefined;
    }
    if (wasDisconnectedRef.current) {
      wasDisconnectedRef.current = false;
      setShowReconnected(true);
      const t = setTimeout(() => setShowReconnected(false), 2000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [connected]);

  if (connected && !showReconnected) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[9997] flex justify-center px-3 pt-[calc(0.5rem+env(safe-area-inset-top))] pointer-events-none"
    >
      <div
        className={`flex items-center gap-2.5 rounded-full border px-4 py-1.5 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.45)] mm-conn-banner ${
          showReconnected
            ? 'border-emerald-500/25 bg-emerald-500/10'
            : 'border-amber-500/25 bg-black/80'
        }`}
      >
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${
            showReconnected
              ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
              : 'bg-amber-400 shadow-[0_0_8px_#fbbf24] animate-pulse'
          }`}
        />
        <span
          className={`text-[10px] font-black uppercase tracking-[0.25em] ${
            showReconnected ? 'text-emerald-300' : 'text-amber-200/90'
          }`}
        >
          {showReconnected ? 'Reconnected' : 'Connection lost — reconnecting…'}
        </span>
      </div>
    </div>
  );
}

export default ConnectionBanner;
