import { useEffect, useState } from 'react';

const DISMISS_KEY = 'mm_pwa_dismissed';

export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch { /* ignore */ }

    const handler = (e) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!visible || !deferred) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[3000] max-w-md mx-auto rounded-xl border border-white/10 bg-[#161a22] p-4 shadow-xl mm-mobile-safe">
      <p className="text-sm text-white mb-3">Install Mana Mingle on your home screen for quick access.</p>
      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 min-h-[44px] rounded-lg bg-white text-black text-sm font-medium"
          onClick={async () => {
            await deferred.prompt();
            setVisible(false);
            setDeferred(null);
          }}
        >
          Install app
        </button>
        <button
          type="button"
          className="px-4 min-h-[44px] rounded-lg border border-white/15 text-sm text-white/70"
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
