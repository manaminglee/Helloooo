/**
 * Age verification + Cloudflare Turnstile — shown first before the app.
 * Server verification is required whenever a real widget is shown. Leaving
 * the gate must not wait on bonus coin credit or an unbounded network call.
 */
import { useRef, useState, Suspense } from 'react';
import { lazyRetry } from '../utils/lazyRetry';
import { API_BASE } from '../config/apiBase';
import { HellooooBrand, HELLOOOO_EMOJI } from './HellooooBrand';
import { unlockIosMedia } from '../utils/iosMediaUnlock';

const Turnstile = lazyRetry(() =>
  import('react-turnstile').then((m) => ({ default: m.Turnstile }))
);

const apiBase = API_BASE;
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
const TURNSTILE_TEST_KEY = '1x00000000000000000000AA';
const VERIFY_TIMEOUT_MS = 15000;
const VERIFY_RETRIES = 1;

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

async function fetchJsonWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  } finally {
    clearTimeout(timer);
  }
}

function friendlyVerifyError(data, status) {
  const codes = data?.['error-codes'];
  if (Array.isArray(codes) && codes.some((c) => c === 'timeout-or-duplicate' || c === 'invalid-input-response')) {
    return 'Security check expired. Please complete it again.';
  }
  if (data?.error) return data.error;
  if (status === 503) return 'Security check is temporarily unavailable. Please try again.';
  return 'Security check failed. Please try again.';
}

export function AgeVerificationGate({ onVerified }) {
  const skipTurnstile = shouldSkipTurnstile();
  const [turnstileToken, setTurnstileToken] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');
  const [challengeId, setChallengeId] = useState(0);
  const submittingRef = useRef(false);

  const resetChallenge = () => {
    setTurnstileToken(null);
    setChallengeId((n) => n + 1);
  };

  const finishVerified = async () => {
    sessionStorage.setItem('wc_age', '1');
    sessionStorage.setItem('wc_bot', '1');
    try {
      await unlockIosMedia();
    } catch {
      /* media unlock is best-effort and must not block the session */
    }
    // Bonus daily credit — never hold the user on "Verifying..." if this hangs.
    void fetchJsonWithTimeout(`${apiBase}/api/user/credit-age`, { method: 'POST' }, 4000)
      .catch(() => {});
    onVerified?.();
  };

  const verifyTurnstileToken = async (token) => {
    let lastError = 'Could not verify. Check your connection and try again.';
    for (let attempt = 0; attempt <= VERIFY_RETRIES; attempt += 1) {
      try {
        const { res, data } = await fetchJsonWithTimeout(
          `${apiBase}/api/verify-turnstile`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          },
          VERIFY_TIMEOUT_MS,
        );
        if (data?.success) return { ok: true };
        const retryable = res.status >= 500 && res.status !== 503;
        lastError = friendlyVerifyError(data, res.status);
        if (!retryable) return { ok: false, error: lastError };
      } catch (err) {
        lastError = err?.name === 'AbortError'
          ? 'Verification timed out. Please try again.'
          : 'Could not verify. Check your connection and try again.';
      }
    }
    return { ok: false, error: lastError };
  };

  const submitVerification = async (token) => {
    if (submittingRef.current) return;
    if (!skipTurnstile && turnstileSiteKey && !token) {
      setError('Please complete the security check below first.');
      return;
    }
    submittingRef.current = true;
    setIsVerifying(true);
    setError('');
    try {
      if (skipTurnstile || !turnstileSiteKey) {
        await finishVerified();
        return;
      }
      const result = await verifyTurnstileToken(token);
      if (result.ok) {
        await finishVerified();
        return;
      }
      setError(result.error);
      resetChallenge();
    } catch {
      setError('Could not verify. Check your connection and try again.');
      resetChallenge();
    } finally {
      submittingRef.current = false;
      setIsVerifying(false);
    }
  };

  const handleAgeConfirm = () => {
    void submitVerification(turnstileToken);
  };

  const handleTurnstileVerify = (token) => {
    setTurnstileToken(token);
    setError('');
    void submitVerification(token);
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
                key={challengeId}
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
          <p className="text-red-400 text-sm text-center mb-4" role="alert">{error}</p>
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
            {isVerifying ? 'Verifying...' : '✓ I am 18 years or older'}
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

        <p className="text-xs mt-5 text-center" style={{ color: 'rgba(232,234,246,0.35)' }}>
          By continuing you agree to our Terms of Service and Community Guidelines.
        </p>
      </div>
    </div>
  );
}
