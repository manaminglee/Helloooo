/**
 * Age verification gate shown before preloader
 */
import { useState } from 'react';

const apiBase = import.meta.env.VITE_SOCKET_URL || '';

export function AgeVerificationGate({ onVerified }) {
  const [error, setError] = useState('');

  const handleAgeConfirm = async () => {
    setError('');
    try {
      sessionStorage.setItem('wc_age', '1');
      sessionStorage.setItem('wc_bot', '1');
      await fetch(`${apiBase}/api/user/credit-age`, { method: 'POST' }).catch(() => {});
      onVerified?.();
    } catch (e) {
      setError('Connection error. Please try again.');
    }
  };

  const handleDecline = () => {
    window.location.href = 'https://www.google.com';
  };

  return (
    <div className="min-h-[100dvh] bg-realm-void flex items-center justify-center p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] relative overflow-hidden">
      <div className="hero-glow hero-glow-1" />
      <div className="hero-glow hero-glow-2" />
      <div className="gate-card relative z-10 max-w-md w-full">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-violet-600/35 to-fuchsia-500/25 border border-violet-400/35 flex items-center justify-center text-3xl shadow-[0_0_28px_rgba(167,139,250,0.2)]">
          🔞
        </div>
        <h2 className="text-2xl font-bold text-white mb-2 text-center">Age Verification</h2>
        <p className="text-sm mb-6 text-center" style={{ color: 'rgba(232,234,246,0.55)' }}>
          Mana Mingle (SynKora) is an 18+ platform. You must confirm your age to continue.
        </p>

        {error && (
          <p className="text-red-400 text-sm text-center mb-4">{error}</p>
        )}

        <div className="flex flex-col gap-3">
          <button
            id="age-confirm-btn"
            onClick={handleAgeConfirm}
            className="btn btn-primary w-full py-3 text-base rounded-xl"
          >
            ✓ I am 18 years or older
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
