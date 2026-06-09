/**
 * PreloadSplash – Full-screen animated splash shown during initial app load
 */
import { useEffect, useState, useRef } from 'react';

const FALLBACK_MS = 1200;
const SKIP_AFTER_MS = 800;

const PRELOAD_MESSAGES = [
  'Connecting to Secure Network',
  'Optimizing Video Hub',
  'Syncing Platform Components...',
  'Initializing...',
  'Almost ready...',
];

export function PreloadSplash({ onReady, ready = false, onPreload }) {
  const alreadyShown = typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem('splashShown');
  const [visible, setVisible] = useState(!alreadyShown);
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);
  const [showSkip, setShowSkip] = useState(false);
  const [elapsed, setElapsed] = useState(0); // Added missing state
  const doneRef = useRef(false);
  const skipShownRef = useRef(false);

  // Skip re-show: call onReady immediately if splash was already shown this session
  useEffect(() => {
    if (alreadyShown) onReady?.();
  }, [alreadyShown, onReady]);

  // Optional preload callback (e.g. socket connect, ICE fetch)
  useEffect(() => {
    onPreload?.();
  }, [onPreload]);

  // Show skip button after 1.5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((e) => {
        const next = e + 200;
        if (next >= SKIP_AFTER_MS && !skipShownRef.current) {
          skipShownRef.current = true;
          setShowSkip(true);
        }
        return next;
      });
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // Rotating messages
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % PRELOAD_MESSAGES.length);
    }, 600);
    return () => clearInterval(interval);
  }, []);

  // Always dismiss splash — never block the app if socket is slow
  useEffect(() => {
    const t = setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('splashShown', 'true');
      setVisible(false);
      onReady?.();
    }, FALLBACK_MS + 400);
    return () => clearTimeout(t);
  }, [onReady]);

  // Fallback progress bar
  useEffect(() => {
    const t = setTimeout(() => {
      if (doneRef.current) return;
      setProgress(100);
    }, FALLBACK_MS);
    return () => clearTimeout(t);
  }, []);

  // Progress curve: Turbo mode when ready
  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          return 100;
        }
        if (p < 70) return Math.min(70, p + 25);
        if (p < 90) return Math.min(90, p + 15);
        return Math.min(100, p + 10);
      });
    }, 40);
    return () => clearInterval(interval);
  }, [ready]);

  useEffect(() => {
    if (progress >= 100 && !doneRef.current) {
      doneRef.current = true;
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('splashShown', 'true');
      setFading(true);
      const t = setTimeout(() => {
        setVisible(false);
        onReady?.();
      }, 400);
      return () => clearTimeout(t);
    }
  }, [progress, onReady]);

  const handleSkip = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('splashShown', 'true');
    setProgress(100);
    setFading(true);
    setTimeout(() => {
      setVisible(false);
      onReady?.();
    }, 400);
  };

  if (!visible) return null;
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('splashShown')) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-realm-void text-white transition-opacity duration-300 ease-out ${fading ? 'opacity-0' : 'opacity-100'}`}
      style={{ animation: !fading && !ready ? 'preload-fade-in 0.4s ease-out' : undefined }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 40%, rgba(167,139,250,0.2), transparent)',
        }}
      />
      <div className="absolute inset-0 overflow-hidden">
        <div className="preload-grid animate-preload-grid-drift" />
      </div>

      {/* Logo */}
      <div className="relative z-10 flex flex-col items-center gap-6">
        <div className="preload-logo animate-pulse">
          <span className="text-4xl font-black text-white">M</span>
        </div>
        <div className="text-center">
          <h1 className="font-display text-xl font-bold tracking-tight text-white">Mana Mingle</h1>
          <p className="text-xs mt-1 text-violet-200/50">Nocturne Bloom · anonymous discovery</p>
        </div>

        {/* Loading bar */}
        <div className="w-48 h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-emerald-400 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Loading dots + rotating message */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="preload-dots">
              <span /><span /><span />
            </div>
            <span className="text-xs text-white/50 min-w-[140px] text-left">
              {progress >= 100 ? 'Ready!' : PRELOAD_MESSAGES[messageIndex]}
            </span>
          </div>
          {showSkip && progress < 100 && (
            <button
              type="button"
              onClick={handleSkip}
              className="text-xs text-white/40 hover:text-violet-300 transition-colors mt-2"
            >
              Continue anyway →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
