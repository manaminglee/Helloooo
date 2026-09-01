/**
 * Skip sheet — shown near chat input when user taps Skip / Next.
 * Pro: reconnect same partner, country-only, region-only matching.
 */
import { useEffect, useState } from 'react';
import { loadProMatchPrefs, saveProMatchPrefs } from '../utils/proMatchPrefs';
import { startPayment } from '../utils/paymentCheckout';
import { API_BASE } from '../config/apiBase';

export function SkipProSheet({
  open,
  onClose,
  onSkip,
  isPro = false,
  partnerName = 'stranger',
  partnerUserId = null,
  userCountry = '',
  onActivated,
}) {
  const [prefs, setPrefs] = useState(loadProMatchPrefs);
  const [payLoading, setPayLoading] = useState(false);
  const [code, setCode] = useState('');
  const [activateLoading, setActivateLoading] = useState(false);
  const [err, setErr] = useState('');
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    if (open) {
      setPrefs(loadProMatchPrefs());
      setErr('');
      setShowUpgrade(false);
    }
  }, [open]);

  const persistPrefs = (next) => {
    setPrefs(next);
    saveProMatchPrefs(next);
  };

  const toggleCountry = () => {
    if (!isPro) { setShowUpgrade(true); return; }
    persistPrefs({ ...prefs, matchCountryOnly: !prefs.matchCountryOnly, matchRegionOnly: false });
  };

  const toggleRegion = () => {
    if (!isPro) { setShowUpgrade(true); return; }
    persistPrefs({ ...prefs, matchRegionOnly: !prefs.matchRegionOnly, matchCountryOnly: false });
  };

  const doSkip = (opts = {}) => {
    onSkip?.({
      matchCountryOnly: isPro && prefs.matchCountryOnly,
      matchRegionOnly: isPro && prefs.matchRegionOnly,
      reconnectToUserId: opts.reconnect ? partnerUserId : null,
    });
    onClose?.();
  };

  const payForPro = async () => {
    setPayLoading(true);
    setErr('');
    try {
      await startPayment('pro', {
        onSuccess: (result) => {
          onActivated?.(result);
          setShowUpgrade(false);
        },
      });
    } catch (e) {
      if (e.message !== 'Payment cancelled') setErr(e.message || 'Payment failed');
    } finally {
      setPayLoading(false);
    }
  };

  const activateCode = async () => {
    setActivateLoading(true);
    setErr('');
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
      setShowUpgrade(false);
      setCode('');
    } catch (e) {
      setErr(e.message || 'Could not activate');
    } finally {
      setActivateLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="mm-skip-pro-sheet" role="dialog" aria-label="Skip options">
      <div className="mm-skip-pro-sheet__inner">
        <div className="mm-skip-pro-sheet__head">
          <span className="mm-skip-pro-sheet__title">Find next match</span>
          <button type="button" className="mm-skip-pro-sheet__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <button type="button" className="mm-skip-pro-sheet__action mm-skip-pro-sheet__action--primary" onClick={() => doSkip()}>
          <span>⏭️ Next stranger</span>
          <span className="mm-skip-pro-sheet__hint">Free · random match</span>
        </button>

        <div className="mm-skip-pro-sheet__divider">
          <span>Pro options</span>
          {!isPro && <span className="mm-skip-pro-sheet__pro-tag">✨ Pro</span>}
        </div>

        <button
          type="button"
          className={`mm-skip-pro-sheet__action${!isPro ? ' mm-skip-pro-sheet__action--locked' : ''}`}
          disabled={!partnerUserId}
          onClick={() => (isPro ? doSkip({ reconnect: true }) : setShowUpgrade(true))}
        >
          <span>🔄 Same partner again</span>
          <span className="mm-skip-pro-sheet__hint">
            {partnerUserId ? `Try reconnecting with ${partnerName}` : 'Need an active match'}
          </span>
          {!isPro && <span className="mm-skip-pro-sheet__lock" aria-hidden>🔒</span>}
        </button>

        <button
          type="button"
          className={`mm-skip-pro-sheet__action mm-skip-pro-sheet__action--toggle${prefs.matchCountryOnly ? ' mm-skip-pro-sheet__action--on' : ''}${!isPro ? ' mm-skip-pro-sheet__action--locked' : ''}`}
          onClick={toggleCountry}
        >
          <span>🌍 {userCountry ? `Match ${userCountry} only` : 'Match my country only'}</span>
          <span className="mm-skip-pro-sheet__hint">{prefs.matchCountryOnly && isPro ? 'On for next searches' : 'Same country strangers'}</span>
          {!isPro && <span className="mm-skip-pro-sheet__lock" aria-hidden>🔒</span>}
        </button>

        <button
          type="button"
          className={`mm-skip-pro-sheet__action mm-skip-pro-sheet__action--toggle${prefs.matchRegionOnly ? ' mm-skip-pro-sheet__action--on' : ''}${!isPro ? ' mm-skip-pro-sheet__action--locked' : ''}`}
          onClick={toggleRegion}
        >
          <span>📍 Match my region only</span>
          <span className="mm-skip-pro-sheet__hint">{prefs.matchRegionOnly && isPro ? 'On for next searches' : 'Closer regional matches'}</span>
          {!isPro && <span className="mm-skip-pro-sheet__lock" aria-hidden>🔒</span>}
        </button>

        {showUpgrade && !isPro && (
          <div className="mm-skip-pro-sheet__upgrade">
            <p className="text-[11px] text-violet-200/90 mb-2">Upgrade to Pro to unlock reconnect &amp; region filters</p>
            <button type="button" disabled={payLoading} className="mm-btn mm-btn--primary w-full !text-xs mb-2" onClick={payForPro}>
              {payLoading ? 'Opening checkout…' : 'Get Pro — Stripe / Razorpay'}
            </button>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Or enter Pro code"
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white mb-2"
            />
            <button type="button" disabled={activateLoading || !code.trim()} className="mm-btn mm-btn--ghost w-full !text-xs" onClick={activateCode}>
              {activateLoading ? 'Activating…' : 'Activate code'}
            </button>
            {err && <p className="text-[10px] text-rose-400 mt-2">{err}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export default SkipProSheet;
