import { memo, useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../../config/apiBase';
import { NutsSymbol } from '../NutsSymbol';
import { Sheet, compact } from './LiveBits';

/* Catalog is fetched once per page load, then reused. Gift art is emoji glyphs
   rendered by the OS — nothing to download, nothing to lazy-load, and no
   third-party assets. Heavy animations are CSS and only mount when a gift
   actually lands. */
let catalogCache = null;
let catalogPromise = null;

function loadCatalog() {
  if (catalogCache) return Promise.resolve(catalogCache);
  if (!catalogPromise) {
    catalogPromise = fetch(`${API_BASE}/api/economy/catalog`)
      .then((r) => r.json())
      .then((d) => {
        catalogCache = { gifts: d.gifts || [], categories: d.categories || [] };
        return catalogCache;
      })
      .catch(() => ({ gifts: [], categories: [] }));
  }
  return catalogPromise;
}

const RARITY_ORDER = { basic: 0, rare: 1, epic: 2, legendary: 3, mega: 4 };

const GiftCard = memo(function GiftCard({ gift, selected, affordable, onSelect }) {
  return (
    <button
      type="button"
      className={[
        'live-gift-card',
        `live-gift-card--${gift.tier}`,
        selected ? 'live-gift-card--on' : '',
        affordable ? '' : 'live-gift-card--poor',
      ].filter(Boolean).join(' ')}
      onClick={() => onSelect(gift)}
      aria-pressed={selected}
    >
      <span className={`live-gift-card__rarity rarity--${gift.tier}`} aria-label={gift.tier} />
      <span className="live-gift-card__icon">{gift.icon}</span>
      <span className="live-gift-card__name">{gift.name}</span>
      <span className="live-gift-card__cost">
        <NutsSymbol size={10} />
        {compact(gift.cost)}
      </span>
    </button>
  );
});

/**
 * Gift tray — a bottom sheet, never a full page.
 *
 * Selecting is separate from sending: the viewer picks a gift, sees the price
 * against their balance, then confirms. Repeat sends happen from the combo
 * button on the room, so the tray does not have to reopen.
 */
export function LiveGiftTray({
  open,
  onClose,
  onSend,
  balance = 0,
  battle = null,
  onRecharge,
}) {
  const [catalog, setCatalog] = useState(catalogCache || { gifts: [], categories: [] });
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState(null);
  const [side, setSide] = useState('A');
  const [sending, setSending] = useState(false);
  const [shortfall, setShortfall] = useState(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    loadCatalog().then((c) => { if (alive) setCatalog(c); });
    return () => { alive = false; };
  }, [open]);

  useEffect(() => {
    if (!open) { setShortfall(null); setSending(false); }
  }, [open]);

  const tabs = useMemo(() => {
    const fromServer = catalog.categories?.length
      ? catalog.categories
      : [{ id: 'all', label: 'All' }];
    return fromServer;
  }, [catalog.categories]);

  const gifts = useMemo(() => {
    const list = category === 'all'
      ? catalog.gifts
      : catalog.gifts.filter((g) => g.category === category || g.tier === category);
    // Cheapest first inside a rarity band — the order people actually browse.
    return [...list].sort(
      (a, b) => (RARITY_ORDER[a.tier] ?? 9) - (RARITY_ORDER[b.tier] ?? 9) || a.cost - b.cost,
    );
  }, [catalog.gifts, category]);

  const canAfford = selected ? balance >= selected.cost : false;

  const send = async () => {
    if (!selected || sending) return;
    if (!canAfford) {
      setShortfall(selected.cost - balance);
      return;
    }
    setSending(true);
    const res = await onSend?.(selected.id, battle ? side : 'A', selected);
    setSending(false);
    if (res?.insufficient) {
      setShortfall(Math.max(1, (res.needed || selected.cost) - (res.balance ?? balance)));
      return;
    }
    if (res?.ok) onClose?.();
  };

  return (
    <Sheet
      open={open}
      title="Send a gift"
      onClose={onClose}
      tall
      foot={shortfall ? null : (
        <div className="live-gift-foot">
          <span className="live-gift-balance">
            <NutsSymbol size={14} />
            {compact(balance)}
            <button
              type="button"
              className="live-chip"
              style={{ marginLeft: 6 }}
              onClick={onRecharge}
            >
              + Top up
            </button>
          </span>
          <button
            type="button"
            className="live-gift-send"
            disabled={!selected || sending}
            onClick={send}
          >
            {sending ? 'Sending…' : selected ? `Send · ${compact(selected.cost)}` : 'Pick a gift'}
          </button>
        </div>
      )}
    >
      {shortfall ? (
        <div className="live-recharge">
          <span style={{ fontSize: 40 }}>🪙</span>
          <p className="live-recharge__title">Not enough coins</p>
          <p className="live-recharge__sub">
            You need {compact(shortfall)} more to send {selected?.name}.
          </p>
          <button type="button" className="live-recharge__btn" onClick={onRecharge}>
            Recharge
          </button>
          <button
            type="button"
            className="live-chip"
            onClick={() => setShortfall(null)}
          >
            Pick another gift
          </button>
        </div>
      ) : (
        <>
          {battle && (
            <div className="live-gift-tabs">
              <button
                type="button"
                className={`live-gift-tab${side === 'A' ? ' live-gift-tab--on' : ''}`}
                onClick={() => setSide('A')}
              >
                @{battle.handleA}
              </button>
              <button
                type="button"
                className={`live-gift-tab${side === 'B' ? ' live-gift-tab--on' : ''}`}
                onClick={() => setSide('B')}
              >
                @{battle.handleB}
              </button>
            </div>
          )}

          <div className="live-gift-tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={category === t.id}
                className={`live-gift-tab${category === t.id ? ' live-gift-tab--on' : ''}`}
                onClick={() => setCategory(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="live-gift-grid">
            {gifts.map((g) => (
              <GiftCard
                key={g.id}
                gift={g}
                selected={selected?.id === g.id}
                affordable={balance >= g.cost}
                onSelect={setSelected}
              />
            ))}
          </div>

          {!gifts.length && (
            <p style={{ textAlign: 'center', padding: 28, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
              Loading gifts…
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}

export default LiveGiftTray;
