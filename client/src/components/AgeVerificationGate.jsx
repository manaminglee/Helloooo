/**
 * Age verification + Cloudflare Turnstile - shown first before preloader
 */
import { useState, Suspense } from 'react';
import { lazyRetry } from '../utils/lazyRetry';
import { API_BASE } from '../config/apiBase';
import { HellooooBrand, HellooooLogo, HELLOOOO_EMOJI } from './HellooooBrand';

const Turnstile = lazyRetry(() =>
  import('react-turnstile').then((m) => ({ default: m.Turnstile }))
);

const apiBase = API_BASE;
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
const TURNSTILE_TEST_KEY = '1x00000000000000000000AA';

/** Skip Turnstile when CAPTCHA cannot run (local dev, Render, or no real site key). */
function shouldSkipTurnstile() {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
  // Turnstile clearance only works on Cloudflare-proxied zones — not on Render direct URLs.
  if (host.endsWith('.onrender.com')) return true;
  const key = turnstileSiteKey.trim();
  if (!key || key === TURNSTILE_TEST_KEY) return true;
  return false;
}

export function AgeVerificationGate({ onVerified }) {
  const skipTurnstile = shouldSkipTurnstile();
  const [turnstileToken, setTurnstileToken] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');

  const finishVerified = async () => {
    sessionStorage.setItem('wc_age', '1');
    sessionStorage.setItem('wc_bot', '1');
    await fetch(`${apiBase}/api/user/credit-age`, { method: 'POST' }).catch(() => {});
    onVerified?.();
  };

  const handleAgeConfirm = async () => {
    if (skipTurnstile || !turnstileSiteKey) {
      setIsVerifying(true);
      setError('');
      try {
        await finishVerified();
      } finally {
        setIsVerifying(false);
      }
      return;
    }
    if (!turnstileToken) {
      setError('Please complete the security check below first.');
      return;
    }
    setIsVerifying(true);
    setError('');
    try {
      const res = await fetch(`${apiBase}/api/verify-turnstile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: turnstileToken }),
      });
      const data = await res.json();
      if (data.success) {
        await finishVerified();
      } else {
        setError(data.error || 'Security check failed. Please try again.');
        setTurnstileToken(null);
      }
    } catch {
      setError('Could not verify. Check your connection and try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleTurnstileVerify = (token) => {
    setTurnstileToken(token);
    setError('');
  };

  const handleTurnstileError = () => {
    setTurnstileToken(null);
  };

  const handleDecline = () => {
    window.location.href = 'https://www.google.com';
  };

  return (
    <div className="min-h-[100dvh] bg-realm-void flex items-center justify-center p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] relative overflow-hidden">
      <div className="gate-card relative z-10 max-w-md w-full">
        <HellooooLogo size={40} className="mx-auto mb-5" />
        <HellooooBrand size="lg" className="justify-center mb-2" />
        <h2 className="text-lg font-bold text-white/80 mb-2 text-center">Age Verification</h2>
        <p className="text-sm mb-6 text-center" style={{ color: 'rgba(232,234,246,0.55)' }}>
          {HELLOOOO_EMOJI} Helloooo is an 18+ platform. Confirm your age
          {skipTurnstile ? ' to continue.' : ' and complete the security check to continue.'}
        </p>

        {!skipTurnstile && (
          <div className="flex justify-center mb-6 min-h-[65px]">
            <Suspense fallback={<div className="text-xs text-white/40 py-4">Loading security check…</div>}>
              <Turnstile
                sitekey={turnstileSiteKey}
                onVerify={handleTurnstileVerify}
                onError={handleTurnstileError}
                onExpire={handleTurnstileError}
                theme="dark"
                size="normal"
              />
            </Suspense>
          </div>
        )}

        {error && (
          <p className="text-red-400 text-sm text-center mb-4">{error}</p>
        )}

        <div className="flex flex-col gap-3">
          <button
            id="age-confirm-btn"
            onClick={handleAgeConfirm}
            disabled={(!skipTurnstile && turnstileSiteKey && !turnstileToken) || isVerifying}
            className="btn btn-primary w-full py-3 text-base rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isVerifying ? 'Verifying...' : '✓ I am 18 years or older'}
          </button>
          <button
            id="age-decline-btn"
            onClick={handleDecline}
            className="btn btn-ghost w-full py-3 text-base rounded-xl"
          >
            I am under 18 — Exit
          </button>
        </div>

        <p className="text-xs mt-5 text-center" style={{ color: 'rgba(232,234,246,0.35)' }}>
          By continuing you agree to our Terms of Service and Community Guidelines.
        </p>
      </div>
    </div>
  );
}
