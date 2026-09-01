/**
 * ProFeaturesMenu – Phase 3 Pro features + activation + payments
 */
import { useState } from 'react';
import { ProBadge } from './ProFeatureGate';
import { PHASE_3_PRO } from '../constants/features';
import { API_BASE } from '../config/apiBase';
import { startPayment } from '../utils/paymentCheckout';

const PRO_FEATURE_LABELS = {
  aiMoodDetection: 'AI Mood Detection',
  reconnectToken: 'Reconnect Same Partner',
  countryMatch: 'Country-Only Matching',
  regionMatch: 'Region-Only Matching',
  miniChatGames: 'Mini Chat Games',
};

const PRO_FEATURE_DESC = {
  aiMoodDetection: 'Detect conversation vibe in real-time',
  reconnectToken: 'Skip sheet → reconnect with the same stranger',
  countryMatch: 'Only match people from your country',
  regionMatch: 'Only match people from your region',
  miniChatGames: 'Play quick games while chatting',
};

export function ProFeaturesMenu({ isProUser = false, onActivated }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [error, setError] = useState('');
  const [payMsg, setPayMsg] = useState('');

  const activate = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/pro/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Activation failed');
      onActivated?.(data);
      setOpen(false);
      setCode('');
    } catch (e) {
      setError(e.message || 'Could not activate Pro');
    } finally {
      setLoading(false);
    }
  };

  const payForPro = async () => {
    setPayLoading(true);
    setPayMsg('');
    setError('');
    try {
      await startPayment('pro', {
        onSuccess: (result) => {
          setPayMsg(result.testMode ? 'Test Pro activated!' : 'Pro activated!');
          onActivated?.(result);
          setTimeout(() => setOpen(false), 1200);
        },
      });
    } catch (e) {
      if (e.message !== 'Payment cancelled') setError(e.message || 'Payment failed');
    } finally {
      setPayLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${
          isProUser
            ? 'text-emerald-300 border-emerald-500/35 bg-emerald-500/10'
            : 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20'
        }`}
      >
        {isProUser ? '✓ Pro' : '✨ Pro Features'}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[150]" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full right-0 mb-2 z-[151] w-72 p-4 rounded-2xl bg-[#0d0f1c] border border-indigo-500/20 shadow-2xl animate-slide-in-up">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Pro Features</h4>
              <button type="button" onClick={() => setOpen(false)} className="text-white/40 hover:text-white text-lg leading-none">×</button>
            </div>
            <div className="space-y-2 mb-3">
              {Object.keys(PHASE_3_PRO).map((key) => (
                <div key={key} className="flex items-center justify-between gap-2 py-2 border-b border-white/5 last:border-0">
                  <div>
                    <p className="text-xs font-medium text-white">{PRO_FEATURE_LABELS[key]}</p>
                    <p className="text-[10px] text-white/50">{PRO_FEATURE_DESC[key]}</p>
                  </div>
                  {isProUser ? <span className="text-[10px] text-emerald-400 font-bold">Unlocked</span> : <ProBadge />}
                </div>
              ))}
            </div>
            {!isProUser && (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={payLoading}
                  onClick={payForPro}
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-xs font-bold text-white disabled:opacity-40"
                >
                  {payLoading ? 'Opening checkout…' : 'Pay for Pro — Stripe / Razorpay / Test'}
                </button>
                <p className="text-[9px] text-white/35 text-center">USD via Stripe · INR via Razorpay · Test mode in dev</p>
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
                  <p className="relative text-center text-[9px] text-white/30 bg-[#0d0f1c] px-2 mx-auto w-fit">or use code</p>
                </div>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Pro access code"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white outline-none focus:border-indigo-500/40"
                />
                {error && <p className="text-[10px] text-rose-400">{error}</p>}
                {payMsg && <p className="text-[10px] text-emerald-400">{payMsg}</p>}
                <button
                  type="button"
                  disabled={loading || !code.trim()}
                  onClick={activate}
                  className="w-full py-2 rounded-lg bg-white/10 text-xs font-bold text-white disabled:opacity-40"
                >
                  {loading ? 'Activating…' : 'Activate with code'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
