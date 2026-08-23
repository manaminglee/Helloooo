/**
 * Clickable coin badge — balance, streak, and activity / verification progress.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const CLAIM_INTERVAL_MS = 60 * 60 * 1000;
const VERIFY_SECONDS = 180;
const HOURLY_SECONDS = 3600;

function formatMmSs(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function CoinBadge({
  balance = 0,
  streak = 1,
  canClaim,
  nextClaim = 0,
  claimCoins,
  compact = false,
  registered = false,
  currentActiveSeconds = 0,
  isCreator = false,
}) {
  const [showPopover, setShowPopover] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [showClaimFeedback, setShowClaimFeedback] = useState(false);
  const [deduction, setDeduction] = useState(null);
  const [localActive, setLocalActive] = useState(currentActiveSeconds);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const prevBalance = useRef(balance);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);

  const rewardDur = registered ? HOURLY_SECONDS : VERIFY_SECONDS;
  const rewardLabel = registered ? '+30 coins / hour active' : '+40 coins when verified';

  useEffect(() => {
    setLocalActive(currentActiveSeconds);
  }, [currentActiveSeconds]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && localActive < rewardDur) {
        setLocalActive((prev) => Math.min(rewardDur, prev + 1));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [localActive, rewardDur]);

  useEffect(() => {
    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible' && window.socket) {
        window.socket.emit('accumulate-activity', { seconds: 10 });
      }
    }, 10000);
    return () => clearInterval(heartbeat);
  }, []);

  useEffect(() => {
    if (balance < prevBalance.current) {
      const diff = prevBalance.current - balance;
      setDeduction(diff);
      setTimeout(() => setDeduction(null), 1500);
    }
    prevBalance.current = balance;
  }, [balance]);

  const updatePopoverPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = 280;
    const margin = 8;
    let left = rect.right - width;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    const top = rect.bottom + margin;
    setPopoverPos({ top, left });
  }, []);

  useEffect(() => {
    if (!showPopover) return undefined;
    updatePopoverPos();
    const close = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      const pop = document.getElementById('mm-coin-popover-root');
      if (pop?.contains(e.target)) return;
      setShowPopover(false);
    };
    const onScroll = () => updatePopoverPos();
    document.addEventListener('pointerdown', close);
    window.addEventListener('resize', updatePopoverPos);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('resize', updatePopoverPos);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [showPopover, updatePopoverPos]);

  const handleClaim = async () => {
    if (!canClaim || isClaiming) return;
    setIsClaiming(true);
    const ok = await claimCoins();
    setIsClaiming(false);
    if (ok) {
      setShowClaimFeedback(true);
      setTimeout(() => setShowClaimFeedback(false), 1200);
      setShowPopover(false);
    }
  };

  const progressPct = Math.min(100, Math.round((localActive / rewardDur) * 100));
  const remaining = Math.max(0, rewardDur - localActive);

  const popover = showPopover && typeof document !== 'undefined'
    ? createPortal(
        <div
          id="mm-coin-popover-root"
          className="mm-coin-popover"
          style={{ top: popoverPos.top, left: popoverPos.left }}
          role="dialog"
          aria-label={registered ? 'Hourly activity reward' : 'Verification progress'}
        >
          <div className="mm-coin-popover__head">
            <span className="mm-coin-popover__icon" aria-hidden>{registered ? '🚀' : '🎁'}</span>
            <div className="mm-coin-popover__titles">
              <p className="mm-coin-popover__title">
                {registered ? 'Hourly activity reward' : 'Verification progress'}
              </p>
              <p className="mm-coin-popover__subtitle">{rewardLabel}</p>
            </div>
          </div>

          <div className="mm-coin-popover__stats">
            <span className="mm-coin-popover__time">
              {formatMmSs(localActive)}
              <span className="mm-coin-popover__time-denom"> / {formatMmSs(rewardDur)}</span>
            </span>
            <span className={`mm-coin-popover__pct ${registered ? 'mm-coin-popover__pct--pro' : ''}`}>
              {progressPct}%
            </span>
          </div>

          <div className="mm-coin-popover__track" aria-hidden>
            <div
              className={`mm-coin-popover__fill ${registered ? 'mm-coin-popover__fill--pro' : ''}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <p className="mm-coin-popover__remaining">
            {remaining > 0
              ? `${formatMmSs(remaining)} remaining`
              : registered
                ? 'Hourly reward ready on next cycle'
                : 'Verification complete — coins credited'}
          </p>

          {canClaim && (
            <button
              type="button"
              className="mm-coin-popover__claim"
              disabled={isClaiming}
              onClick={handleClaim}
            >
              {isClaiming ? 'Claiming…' : 'Claim daily bonus'}
            </button>
          )}

          {!canClaim && nextClaim > 0 && (
            <p className="mm-coin-popover__hint">
              Daily streak claim in {Math.ceil(nextClaim / 60000)}m
            </p>
          )}

          <p className="mm-coin-popover__footnote">
            Time counts while you stay active on Helloooo
          </p>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="relative flex items-center gap-2" ref={rootRef}>
      {showClaimFeedback && (
        <span className="absolute -top-10 left-1/2 -translate-x-1/2 text-amber-400 font-black text-xs animate-float-up pointer-events-none z-[101] whitespace-nowrap bg-black/60 px-2 py-1 rounded-full border border-amber-500/20">
          🪙 +{registered ? 30 : 40} COINS
        </span>
      )}
      {deduction && (
        <span className="absolute top-0 left-1/2 -translate-x-1/2 text-rose-500 font-black text-sm z-[101] pointer-events-none animate-deduct-coins">
          -{deduction} 🪙
        </span>
      )}
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={() => !compact && setShowPopover(true)}
        onClick={() => {
          if (!showPopover) updatePopoverPos();
          setShowPopover((v) => !v);
        }}
        className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all cursor-pointer group ${
          isCreator
            ? 'bg-gradient-to-r from-violet-500/15 to-indigo-500/10 border-violet-400/35 shadow-[0_0_20px_rgba(167,139,250,0.15)] hover:border-violet-300/50'
            : 'bg-white/5 border-white/10 hover:border-violet-500/40 hover:bg-violet-500/10'
        }`}
        title={isCreator ? 'Creator account — bonus visibility in rooms' : undefined}
        aria-expanded={showPopover}
        aria-haspopup="dialog"
      >
        {isCreator && (
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-violet-400 ring-2 ring-black shadow-[0_0_8px_#c4b5fd]" aria-hidden />
        )}
        <span className="text-sm group-hover:rotate-12 transition-transform">🪙</span>
        <span className="font-black text-xs text-white tabular-nums">{balance}</span>
        <div className="w-px h-3 bg-white/10 mx-1" />
        <span className="text-[9px] font-black uppercase text-white/30 tracking-tighter italic">🔥 {streak}d</span>

        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ${registered ? 'bg-violet-500' : 'bg-emerald-500'}`}
            style={{ width: `${Math.min(100, (localActive / rewardDur) * 100)}%` }}
          />
        </div>
      </button>

      {popover}
    </div>
  );
}
