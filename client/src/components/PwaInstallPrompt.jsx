import { useEffect, useState } from 'react';
import { isInstalled } from '../utils/pwaManifest';
import { isAppleMobile, isCapacitorNative } from '../utils/iosPlatform';

const DISMISS_KEY = 'mm_pwa_dismissed';

export function PwaInstallPrompt({ variant = 'default' }) {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const iosGuide = isAppleMobile() && !isCapacitorNative();

  useEffect(() => {
    if (isInstalled() || isCapacitorNative()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch { /* ignore */ }

    if (iosGuide) {
      setVisible(true);
      return undefined;
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [iosGuide]);

  if (!visible || (!deferred && !iosGuide)) return null;

  const isLive = variant === 'live';

  return (
    <div className={`mm-pwa-prompt${isLive ? ' mm-pwa-prompt--live' : ''}`}>
      <div className="mm-pwa-prompt__glow" aria-hidden />
      <p className="mm-pwa-prompt__title">
        {isLive ? 'Install Helloooo Live & Audio' : 'Install Helloooo'}
      </p>
      <p className="mm-pwa-prompt__body">
        {iosGuide
          ? 'Add to Home Screen to unlock iOS notifications, full-screen layout, and gift sound after one tap.'
          : isLive
            ? 'Add Live and voice rooms to your home screen — one app, no browser bar.'
            : 'Add Helloooo to your home screen for quick access.'}
      </p>
      {iosGuide && (
        <ol className="mm-pwa-prompt__ios-steps">
          <li>Tap the Share button in Safari</li>
          <li>Scroll and tap Add to Home Screen</li>
          <li>Open Helloooo from the icon — then allow notifications</li>
        </ol>
      )}
      <div className="mm-pwa-prompt__actions">
        {!iosGuide && (
          <button
            type="button"
            className="mm-pwa-prompt__install"
            onClick={async () => {
              await deferred.prompt();
              setVisible(false);
              setDeferred(null);
            }}
          >
            Install app
          </button>
        )}
        <button
          type="button"
          className="mm-pwa-prompt__dismiss"
          onClick={() => {
            try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
            setVisible(false);
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
