import { useEffect, useRef, useState } from 'react';

/**
 * ConnectionBanner — compact toast. Hidden while connected;
 * a short "Reconnected" pill auto-hides so it never covers the header.
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
      const t = setTimeout(() => setShowReconnected(false), 1800);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [connected]);

  if (connected && !showReconnected) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mm-conn-toast"
    >
      <div
        className={`mm-conn-toast__pill ${
          showReconnected ? 'mm-conn-toast__pill--ok' : 'mm-conn-toast__pill--warn'
        }`}
      >
        <span
          aria-hidden
          className={`mm-conn-toast__dot ${showReconnected ? 'mm-conn-toast__dot--ok' : 'mm-conn-toast__dot--warn'}`}
        />
        <span className="mm-conn-toast__label">
          {showReconnected ? 'Reconnected' : 'Reconnecting…'}
        </span>
      </div>
    </div>
  );
}

export default ConnectionBanner;
