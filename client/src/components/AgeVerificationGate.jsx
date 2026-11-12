/**
 * Age verification + Cloudflare Turnstile - shown first before preloader
 */
import { useState, Suspense } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { lazyRetry } from '../utils/lazyRetry';
import { API_BASE } from '../config/apiBase';
import { HellooooBrand, HellooooLogo } from './HellooooBrand';
import { unlockIosMedia } from '../utils/iosMediaUnlock';

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
  const reduce = useReducedMotion();
  const skipTurnstile = shouldSkipTurnstile();
  const [turnstileToken, setTurnstileToken] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');

  const finishVerified = async () => {
    sessionStorage.setItem('wc_age', '1');
    sessionStorage.setItem('wc_bot', '1');
    await unlockIosMedia();
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
    <div className="studio-gate">
      <motion.div
        className="studio-gate__frame"
        role="dialog"
        aria-modal="true"
        aria-labelledby="age-gate-title"
        initial={reduce ? false : { opacity: 0, y: 28, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={reduce ? { duration: 0.01 } : { type: 'spring', stiffness: 380, damping: 30 }}
      >
        <div className="studio-gate__story">
          <HellooooLogo size={40} />
          <h2>Real people. Nothing saved.</h2>
          <p>Helloooo is a live social space. You choose a room, talk, and leave. Chats are not stored.</p>
          <ul className="studio-gate__points">
            <li>Anonymous unless you pick a name</li>
            <li>Report or skip anyone, anytime</li>
            <li>18+ only</li>
          </ul>
        </div>
        <div className="studio-gate__form">
        <HellooooBrand size="lg" className="mb-2" />
        <h3 id="age-gate-title">Age verification</h3>
        <p className="text-sm mb-6" style={{ color: 'rgba(246,241,232,0.62)' }}>
          Confirm you are 18 or older
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
          <p className="text-red-300 text-sm text-center mb-4" role="alert">{error}</p>
        )}

        <div className="flex flex-col gap-3">
          <button
            id="age-confirm-btn"
            type="button"
            onClick={handleAgeConfirm}
            disabled={(!skipTurnstile && turnstileSiteKey && !turnstileToken) || isVerifying}
            aria-busy={isVerifying}
            className="btn btn-primary w-full py-3 text-base rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isVerifying ? 'Verifying…' : 'I am 18 years or older'}
          </button>
          <button
            id="age-decline-btn"
            type="button"
            onClick={handleDecline}
            className="btn btn-ghost w-full py-3 text-base rounded-xl"
          >
            I am under 18 — Exit
          </button>
        </div>

        <p className="text-xs mt-5" style={{ color: 'rgba(246,241,232,0.45)' }}>
          By continuing you agree to our Terms of Service and Community Guidelines.
        </p>
        </div>
      </motion.div>
    </div>
  );
}
