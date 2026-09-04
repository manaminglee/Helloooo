import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE } from '../../config/apiBase';
import { NutsAmount, NutsSymbol } from '../NutsSymbol';

const TIER_STYLES = {
  basic: 'border-white/15',
  rare: 'border-sky-400/40',
  epic: 'border-fuchsia-400/40',
  legendary: 'border-amber-400/50 shadow-[0_0_24px_rgba(251,191,36,0.35)]',
  mega: 'border-rose-400/60 shadow-[0_0_28px_rgba(251,113,133,0.4)]',
};

export function LiveGiftDrawer({
  open,
  onClose,
  onSend,
  nuts = 0,
  battle = null,
  sending = false,
}) {
  const [gifts, setGifts] = useState([]);
  const [category, setCategory] = useState('all');
  const [targetSide, setTargetSide] = useState('A');

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    fetch(`${API_BASE}/api/economy/catalog`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.gifts) setGifts(d.gifts);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  const filtered = category === 'all'
    ? gifts
    : gifts.filter((g) => g.category === category || g.tier === category);

  if (!open) return null;

  return createPortal(
    <div className="mm-live-gift-drawer" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="mm-live-gift-drawer__panel" onClick={(e) => e.stopPropagation()}>
        <div className="mm-live-gift-drawer__head">
          <span>Send Nuts gifts</span>
          <NutsAmount amount={nuts} size={16} showLabel />
        </div>
        {battle && (
          <div className="mm-live-gift-drawer__battle">
            <button type="button" className={targetSide === 'A' ? 'on' : ''} onClick={() => setTargetSide('A')}>
              @{battle.handleA}
            </button>
            <button type="button" className={targetSide === 'B' ? 'on' : ''} onClick={() => setTargetSide('B')}>
              @{battle.handleB}
            </button>
          </div>
        )}
        <div className="mm-live-gift-drawer__cats">
          {['all', 'classic', 'premium', 'mega'].map((c) => (
            <button key={c} type="button" className={category === c ? 'on' : ''} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="mm-live-gift-drawer__grid">
          {filtered.map((g) => (
            <button
              key={g.id}
              type="button"
              disabled={sending || nuts < g.cost}
              className={`mm-live-gift-card ${TIER_STYLES[g.tier] || TIER_STYLES[g.anim] || ''}`}
              onClick={() => onSend?.(g.id, targetSide)}
            >
              <span className="text-2xl">{g.icon}</span>
              <span className="text-[10px] font-bold text-white/80">{g.name}</span>
              <span className="mm-live-gift-card__cost">
                <NutsSymbol size={12} /> {g.cost.toLocaleString()}
              </span>
            </button>
          ))}
          {!filtered.length && (
            <p className="text-white/40 text-xs col-span-full text-center py-6">Loading gifts…</p>
          )}
        </div>
        <button type="button" className="mm-btn mm-btn--ghost w-full mt-2" onClick={onClose}>Close</button>
      </div>
    </div>,
    document.body,
  );
}
