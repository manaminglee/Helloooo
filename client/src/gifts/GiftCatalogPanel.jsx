import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '../config/apiBase';
import { GiftCard } from './GiftCard';
import { GiftRenderer } from './GiftRenderer';
import { GiftPreviewModal } from './GiftPreviewModal';
import { detectGiftQuality } from './giftQuality';
import {
  getFavoriteGiftIds, toggleFavoriteGift, getRecentGiftIds, rememberRecentGift,
  getGiftsMuted, setGiftsMuted,
} from './giftPrefs';
import { unlockGiftAudio } from './GiftSoundManager';
import { NutsSymbol } from '../components/NutsSymbol';
import './gifts.css';

let catalogCache = null;
let catalogPromise = null;

export function loadGiftCatalog() {
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

const PER_PAGE = 8;
const LOVE_IDS = new Set(['hug_heart', 'heart_wings', 'rose_bear', 'cupid_bolt', 'true_bloom', 'petal_mask']);

function nuts(n) {
  return Number(n || 0).toLocaleString('de-DE');
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function filterShelf(list, category, favorites, recent) {
  if (category === 'hot') {
    const flagged = list.filter((x) => x.hot).sort((a, b) => a.cost - b.cost);
    return flagged.length <= PER_PAGE ? flagged : [...flagged.slice(0, 6), ...flagged.slice(-2)];
  }
  if (category === 'favorites') return list.filter((g) => favorites.includes(g.id));
  if (category === 'recent') return recent.map((id) => list.find((g) => g.id === id)).filter(Boolean);
  if (category === 'love') return list.filter((g) => LOVE_IDS.has(g.id));
  if (category === 'premium') return list.filter((g) => ['epic', 'legendary', 'ultra', 'premium'].includes(g.rarity));
  if (category === 'legendary') return list.filter((g) => g.rarity === 'legendary' || g.rarity === 'ultra');
  if (!category || category === 'all') return list;
  return list.filter((x) => x.category === category).sort((a, b) => a.cost - b.cost);
}

/**
 * Shared premium gift browser used by the live tray and audio/group drawer.
 */
export function GiftCatalogPanel({
  open,
  balance = 0,
  level = 0,
  onSend,
  extraTabs = [],
  headerSlot = null,
  compact = false,
}) {
  const [catalog, setCatalog] = useState(catalogCache || { gifts: [], categories: [] });
  const [category, setCategory] = useState('hot');
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState(getFavoriteGiftIds);
  const [recent, setRecent] = useState(getRecentGiftIds);
  const [muted, setMuted] = useState(getGiftsMuted);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [page, setPage] = useState(0);
  const pagerRef = useRef(null);
  const quality = detectGiftQuality();

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    loadGiftCatalog().then((c) => { if (alive) setCatalog(c); });
    return () => { alive = false; };
  }, [open]);

  const tabs = useMemo(() => {
    const base = catalog.categories?.length ? catalog.categories : [{ id: 'hot', label: 'Hot' }];
    return [
      ...base,
      { id: 'love', label: 'Love' },
      { id: 'premium', label: 'Premium' },
      { id: 'legendary', label: 'Legendary' },
      { id: 'favorites', label: 'Favorites' },
      { id: 'recent', label: 'Recent' },
      ...extraTabs,
    ];
  }, [catalog.categories, extraTabs]);

  const shelf = useMemo(() => {
    let list = filterShelf(catalog.gifts || [], category, favorites, recent);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((g) => g.name.toLowerCase().includes(q) || g.id.includes(q));
    return list;
  }, [catalog.gifts, category, favorites, recent, query]);

  const pages = useMemo(() => chunk(shelf, PER_PAGE), [shelf]);

  useEffect(() => {
    setPage(0);
    if (pagerRef.current) pagerRef.current.scrollLeft = 0;
  }, [category, query]);

  const isLocked = useCallback((g) => (g.minLevel || 0) > level, [level]);
  const canAfford = selected ? balance >= selected.cost : false;
  const selectedLocked = selected ? isLocked(selected) : false;

  const sendGift = async (gift) => {
    if (!gift || sending || isLocked(gift)) return { ok: false };
    if (balance < gift.cost) return { ok: false, insufficient: true, needed: gift.cost, balance };
    setSending(true);
    unlockGiftAudio();
    const res = await onSend?.(gift);
    setSending(false);
    if (res?.ok) {
      setRecent(rememberRecentGift(gift.id));
      setPreviewOpen(false);
    }
    return res;
  };

  return (
    <div className={`pg-panel${compact ? ' pg-panel--compact' : ''}`}>
      {headerSlot}
      <div className="pg-toolbar">
        <input
          className="pg-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search gifts"
          aria-label="Search gifts"
        />
        <button
          type="button"
          className={`pg-mute${muted ? ' is-on' : ''}`}
          onClick={() => setMuted(setGiftsMuted(!muted))}
          aria-pressed={muted}
        >
          {muted ? 'Muted' : 'Sound'}
        </button>
      </div>

      <div className="gt-tabs pg-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={category === t.id}
            className={`gt-tab${category === t.id ? ' gt-tab--on' : ''}`}
            onClick={() => setCategory(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {selected && (
        <div className={`pg-showcase pg-card--${selected.rarity || 'common'}`}>
          <div className="pg-showcase__art">
            <GiftRenderer gift={selected} mode="preview" size={72} quality={quality} />
          </div>
          <div className="pg-showcase__meta">
            <strong>{selected.name}</strong>
            <span className="pg-showcase__rarity">{selected.rarity}</span>
            <span className="pg-showcase__cost"><NutsSymbol size={13} /> {nuts(selected.cost)}</span>
          </div>
          <button type="button" className="pg-showcase__more" onClick={() => setPreviewOpen(true)}>
            Preview
          </button>
        </div>
      )}

      <div
        className="gt-pager"
        ref={pagerRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const next = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          setPage((cur) => (cur === next ? cur : next));
        }}
      >
        {pages.map((rows, i) => (
          <div className="gt-page pg-page" key={i}>
            {rows.map((g) => (
              <GiftCard
                key={g.id}
                gift={g}
                selected={selected?.id === g.id}
                affordable={balance >= g.cost}
                locked={isLocked(g)}
                still={i !== page}
                favorited={favorites.includes(g.id)}
                quality={quality}
                onSelect={setSelected}
                onFavorite={(id) => setFavorites(toggleFavoriteGift(id))}
              />
            ))}
          </div>
        ))}
      </div>

      {pages.length > 1 && (
        <div className="gt-dots" role="tablist" aria-label="Gift pages">
          {pages.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`gt-dot${i === page ? ' gt-dot--on' : ''}`}
              onClick={() => pagerRef.current?.scrollTo({ left: i * pagerRef.current.clientWidth, behavior: 'smooth' })}
              aria-label={`Page ${i + 1}`}
            />
          ))}
        </div>
      )}

      {!shelf.length && <p className="gt-empty">{query ? 'No gifts match' : 'Loading gifts…'}</p>}

      <div className="pg-sendbar">
        <span className="pg-sendbar__bal"><NutsSymbol size={14} /> {nuts(balance)}</span>
        <button
          type="button"
          className="gt-send pg-send"
          disabled={!selected || sending || selectedLocked}
          onClick={() => sendGift(selected)}
        >
          {sending ? 'Sending…'
            : selectedLocked ? `Unlocks at Lv${selected.minLevel}`
            : selected ? `SEND • ${nuts(selected.cost)}`
            : 'Pick a gift'}
        </button>
      </div>

      {previewOpen && selected && (
        <GiftPreviewModal
          gift={selected}
          onClose={() => setPreviewOpen(false)}
          onSend={sendGift}
          sending={sending}
          locked={selectedLocked}
          canAfford={canAfford}
        />
      )}
    </div>
  );
}
