/**
 * Next-match sheet — filters are always available.
 * Coin prices only appear when the server says VIDEO_PAYMENTS_ENABLED.
 */
import { useEffect, useRef, useState } from 'react';
import { useDialogEffects } from '../motion/MotionDialog';
import { MmIcon } from './icons/MmIcon';
import { loadProMatchPrefs, saveProMatchPrefs } from '../utils/proMatchPrefs';
import { startPayment } from '../utils/paymentCheckout';
import { API_BASE } from '../config/apiBase';
import { priceLabel } from '../hooks/useVideoPricing';

const GENDER_OPTIONS = [
  { id: '', label: 'Anyone' },
  { id: 'female', label: 'Women' },
  { id: 'male', label: 'Men' },
  { id: 'other', label: 'Other' },
];

export function SkipProSheet({
  open,
  onClose,
  onSkip,
  isPro = false,
  partnerName = 'stranger',
  partnerUserId = null,
  userCountry = '',
  onActivated,
  pricing,
}) {
  const [prefs, setPrefs] = useState(loadProMatchPrefs);
  const [payLoading, setPayLoading] = useState(false);
  const [code, setCode] = useState('');
  const [activateLoading, setActivateLoading] = useState(false);
  const [err, setErr] = useState('');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const paymentsOn = !!pricing?.enabled;
  const costs = pricing?.video || {};

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

  const paidFor = (coins) => {
    if (!paymentsOn) return false;
    if (isPro) return false;
    return (Number(coins) || 0) > 0;
  };

  const costHint = (coins, freeCopy) => {
    if (!paymentsOn) return freeCopy;
    if (isPro) return `${freeCopy} · included with Pro`;
    return `${freeCopy} · ${priceLabel(pricing, coins)}`;
  };

  const toggleCountry = () => {
    persistPrefs({ ...prefs, matchCountryOnly: !prefs.matchCountryOnly, matchRegionOnly: false });
  };

  const toggleRegion = () => {
    persistPrefs({ ...prefs, matchRegionOnly: !prefs.matchRegionOnly, matchCountryOnly: false });
  };

  const setGender = (matchGender) => {
    persistPrefs({ ...prefs, matchGender });
  };

  const doSkip = (opts = {}) => {
    onSkip?.({
      matchCountryOnly: prefs.matchCountryOnly,
      matchRegionOnly: prefs.matchRegionOnly,
      matchGender: prefs.matchGender || '',
      gender: prefs.gender || '',
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

  const panelRef = useRef(null);
  useDialogEffects(open, onClose, panelRef);

  if (!open) return null;

  return (
    <div ref={panelRef} className="mm-skip-pro-sheet" role="dialog" aria-modal="true" aria-label="Skip options">
      <div className="mm-skip-pro-sheet__inner">
        <div className="mm-skip-pro-sheet__head">
          <span className="mm-skip-pro-sheet__title">Find next match</span>
          <button type="button" className="mm-skip-pro-sheet__close ui-icon-btn" onClick={onClose} aria-label="Close"><MmIcon name="close" size={16} /></button>
        </div>

        <button type="button" className="mm-skip-pro-sheet__action mm-skip-pro-sheet__action--primary" onClick={() => doSkip()}>
          <span>Next stranger</span>
          <span className="mm-skip-pro-sheet__hint">
            {prefs.matchCountryOnly || prefs.matchRegionOnly || prefs.matchGender
              ? 'Uses the filters below'
              : 'Free · anyone, anywhere'}
          </span>
        </button>

        <div className="mm-skip-pro-sheet__divider">
          <span>Match filters</span>
        </div>

        <div className="mm-video-gender-row" role="group" aria-label="Who to match with">
          {GENDER_OPTIONS.map((opt) => (
            <button
              key={opt.id || 'any'}
              type="button"
              className={`mm-video-gender-chip${(prefs.matchGender || '') === opt.id ? ' is-on' : ''}`}
              onClick={() => setGender(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {prefs.matchGender && (
          <p className="mm-skip-pro-sheet__hint" style={{ margin: '0 0 8px' }}>
            {costHint(costs.genderFilterCoins, 'Prefers people who shared that option')}
          </p>
        )}

        <button
          type="button"
          className={`mm-skip-pro-sheet__action mm-skip-pro-sheet__action--toggle${prefs.matchCountryOnly ? ' mm-skip-pro-sheet__action--on' : ''}`}
          onClick={toggleCountry}
        >
          <span>{userCountry ? `Match ${userCountry} only` : 'Match my country only'}</span>
          <span className="mm-skip-pro-sheet__hint">{costHint(costs.countryFilterCoins, 'Same country strangers')}</span>
        </button>

        <button
          type="button"
          className={`mm-skip-pro-sheet__action mm-skip-pro-sheet__action--toggle${prefs.matchRegionOnly ? ' mm-skip-pro-sheet__action--on' : ''}`}
          onClick={toggleRegion}
        >
          <span>Match my region only</span>
          <span className="mm-skip-pro-sheet__hint">{costHint(costs.regionFilterCoins, 'Closer regional matches')}</span>
        </button>

        <button
          type="button"
          className="mm-skip-pro-sheet__action"
          disabled={!partnerUserId}
          onClick={() => doSkip({ reconnect: true })}
        >
          <span>Same partner again</span>
          <span className="mm-skip-pro-sheet__hint">
            {partnerUserId
              ? costHint(costs.reconnectCoins, `Try reconnecting with ${partnerName}`)
              : 'Need an active match'}
          </span>
        </button>

        {paymentsOn && !isPro && (prefs.matchCountryOnly || prefs.matchRegionOnly || prefs.matchGender) && (
          <p className="text-[11px] text-white/45 mt-2">
            Prices sit on each option and are confirmed when the next match starts.
            {paidFor(costs.genderFilterCoins) ? '' : ''}
          </p>
        )}

        {paymentsOn && !isPro && (
          <button type="button" className="mm-skip-pro-sheet__action" onClick={() => setShowUpgrade((v) => !v)}>
            <span>Get Pro for included filters</span>
            <span className="mm-skip-pro-sheet__hint">Optional — filters also work with coins</span>
          </button>
        )}

        {showUpgrade && !isPro && (
          <div className="mm-skip-pro-sheet__upgrade">
            <p className="text-[11px] text-violet-200/90 mb-2">Pro includes filters and reconnect without spending coins</p>
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
