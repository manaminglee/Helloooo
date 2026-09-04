import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

const TIER_STYLES = {
  basic: 'border-white/15',
  rare: 'border-sky-400/40 shadow-[0_0_12px_rgba(56,189,248,0.15)]',
  epic: 'border-fuchsia-400/40 shadow-[0_0_14px_rgba(232,121,249,0.18)]',
  legendary: 'border-amber-400/50 shadow-[0_0_18px_rgba(251,191,36,0.25)]',
  mega: 'border-rose-400/60 shadow-[0_0_22px_rgba(251,113,133,0.35)]',
};

const ROLE_SHORT = { host: 'Admin', moderator: 'Co', speaker: 'Stage', listener: 'View' };

/**
 * Gift picker with profile targets, send-to-one / send-to-all, and Nuts packages.
 */
export function GiftDrawer({
  socket,
  channelId,
  members = [],
  coins = 0,
  open,
  onClose,
  initialTarget = null,
}) {
  const [gifts, setGifts] = useState([]);
  const [categories, setCategories] = useState([{ id: 'all', label: 'All' }]);
  const [packages, setPackages] = useState([]);
  const [category, setCategory] = useState('all');
  const [target, setTarget] = useState(null);
  const [toAll, setToAll] = useState(false);
  const [tab, setTab] = useState('gifts');
  const [notice, setNotice] = useState(null);
  const [sending, setSending] = useState(false);
  const [displayCoins, setDisplayCoins] = useState(coins);

  useEffect(() => {
    setDisplayCoins(coins);
  }, [coins]);

  useEffect(() => {
    if (!socket) return undefined;
    const onCatalog = ({ gifts: g, categories: c, packages: p }) => {
      setGifts(g || []);
      if (c?.length) setCategories(c);
      setPackages(p || []);
    };
    const onError = ({ message }) => {
      setSending(false);
      setNotice({ type: 'err', text: message || 'Gift failed' });
      setTimeout(() => setNotice(null), 4000);
    };
    const onSent = ({ toAll: blast, count, balance }) => {
      setSending(false);
      if (balance !== undefined) setDisplayCoins(balance);
      setNotice({
        type: 'ok',
        text: blast ? `Gift sent to ${count || 'everyone'}!` : 'Gift sent!',
      });
      setTimeout(() => setNotice(null), 2500);
    };
    const onCoinsUpdated = ({ coins: next }) => {
      if (next !== undefined) setDisplayCoins(next);
    };
    const onBought = ({ coins: added, balance }) => {
      if (balance !== undefined) setDisplayCoins(balance);
      else if (added) setDisplayCoins((c) => c + added);
      setNotice({ type: 'ok', text: `+${added} Nuts added` });
      setTab('gifts');
      setTimeout(() => setNotice(null), 2500);
    };
    socket.on('gift:catalog', onCatalog);
    socket.on('gift:error', onError);
    socket.on('gift:sent', onSent);
    socket.on('gift:pack-bought', onBought);
    socket.on('coins-updated', onCoinsUpdated);
    socket.emit('gift:catalog');
    return () => {
      socket.off('gift:catalog', onCatalog);
      socket.off('gift:error', onError);
      socket.off('gift:sent', onSent);
      socket.off('gift:pack-bought', onBought);
      socket.off('coins-updated', onCoinsUpdated);
    };
  }, [socket]);

  useEffect(() => {
    if (!open || !socket) return;
    socket.emit('gift:catalog');
  }, [open, socket]);

  const others = useMemo(
    () => members.filter((m) => m.socketId !== socket?.id),
    [members, socket?.id]
  );
  const stagePeople = useMemo(
    () => members.filter((m) => m.role !== 'listener' && m.socketId !== socket?.id),
    [members, socket?.id]
  );

  useEffect(() => {
    if (!open) return;
    if (initialTarget && others.some((m) => m.socketId === initialTarget)) {
      setTarget(initialTarget);
      setToAll(false);
      return;
    }
    if (!target && others.length) setTarget(others[0].socketId);
    if (target && !others.some((m) => m.socketId === target)) {
      setTarget(others[0]?.socketId || null);
    }
  }, [open, initialTarget, others, target]);

  const filtered = useMemo(() => {
    if (category === 'all') return gifts;
    return gifts.filter((g) => g.category === category);
  }, [gifts, category]);

  if (!open) return null;

  const send = (giftId) => {
    if (!socket || !channelId) {
      setNotice({ type: 'err', text: 'Not connected to a voice room.' });
      return;
    }
    if (sending) return;
    setSending(true);
    if (toAll) {
      const ids = (stagePeople.length ? stagePeople : others).map((m) => m.socketId);
      if (!ids.length) {
        setSending(false);
        setNotice({ type: 'err', text: 'No one else here yet.' });
        return;
      }
      socket.emit('gift:send', { giftId, channelId, toAll: true, targetIds: ids });
      return;
    }
    if (!target) {
      setSending(false);
      setNotice({ type: 'err', text: 'Pick someone to gift first.' });
      return;
    }
    socket.emit('gift:send', { toSocketId: target, giftId, channelId });
  };

  const buyPack = (packageId) => {
    socket?.emit('coins:buy-package', { packageId });
  };

  const drawer = (
    <div className="fixed inset-x-0 bottom-0 z-[600] sm:inset-auto sm:right-4 sm:bottom-20 sm:w-[24rem]">
      <div className="rounded-t-2xl sm:rounded-2xl border border-white/12 bg-[#12151c] p-4 shadow-2xl max-h-[78dvh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-white">Gifts & coins</h4>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-amber-300 font-semibold">🪙 {displayCoins}</span>
            <button type="button" onClick={onClose} className="text-white/50 hover:text-white text-lg leading-none">×</button>
          </div>
        </div>

        <div className="flex gap-1 mb-3 p-0.5 rounded-xl bg-white/5">
          <button type="button" onClick={() => setTab('gifts')} className={`flex-1 text-[11px] font-bold py-2 rounded-lg ${tab === 'gifts' ? 'bg-amber-500/20 text-amber-200' : 'text-white/45'}`}>Send gifts</button>
          <button type="button" onClick={() => setTab('packs')} className={`flex-1 text-[11px] font-bold py-2 rounded-lg ${tab === 'packs' ? 'bg-amber-500/20 text-amber-200' : 'text-white/45'}`}>Buy coins</button>
        </div>

        {tab === 'packs' ? (
          <div className="grid gap-2 overflow-y-auto">
            {packages.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => buyPack(p.id)}
                className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/8 text-left"
              >
                <span className="text-2xl">{p.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-white">{p.name} {p.badge ? `· ${p.badge}` : ''}</span>
                  <span className="text-[11px] text-amber-300">{p.coins} coins</span>
                </span>
                <span className="text-xs font-bold text-white/70">${p.priceUsd}</span>
              </button>
            ))}
            <p className="text-[10px] text-white/35">Need coins to send gifts. Test packs credit instantly when enabled on the server.</p>
          </div>
        ) : (
          <>
            {coins <= 0 && displayCoins <= 0 && (
              <p className="mb-2 text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-400/25 rounded-lg px-3 py-2">
                You have 0 coins. Open <button type="button" className="underline font-bold" onClick={() => setTab('packs')}>Buy coins</button> or wait for your activity bonus.
              </p>
            )}

            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setToAll(false)}
                className={`flex-1 text-[10px] font-bold py-2 rounded-lg border ${!toAll ? 'border-amber-400/40 bg-amber-500/15 text-amber-200' : 'border-white/10 text-white/45'}`}
              >
                One person
              </button>
              <button
                type="button"
                onClick={() => setToAll(true)}
                className={`flex-1 text-[10px] font-bold py-2 rounded-lg border ${toAll ? 'border-amber-400/40 bg-amber-500/15 text-amber-200' : 'border-white/10 text-white/45'}`}
              >
                Everyone on stage
              </button>
            </div>

            {!toAll && (
              others.length > 0 ? (
                <div className="mm-gift-targets mb-3" role="listbox" aria-label="Gift recipient">
                  {others.map((m) => {
                    const selected = target === m.socketId;
                    return (
                      <button
                        key={m.socketId}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => setTarget(m.socketId)}
                        className={`mm-gift-target ${selected ? 'mm-gift-target--active' : ''}`}
                      >
                        <span className="mm-gift-target__avatar" data-gift-avatar={m.socketId}>
                          {(m.nickname || '?').slice(0, 1).toUpperCase()}
                          {m.role === 'host' && <span className="mm-gift-target__crown">👑</span>}
                          {m.role === 'moderator' && <span className="mm-gift-target__crown">🛡️</span>}
                        </span>
                        <span className="mm-gift-target__name truncate">{m.nickname}</span>
                        <span className="mm-gift-target__role">{ROLE_SHORT[m.role] || m.role}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mb-2 text-[11px] text-white/40">Invite someone to the room to send a gift.</p>
              )
            )}

            <div className="mm-gift-cats" role="tablist" aria-label="Gift categories">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={category === c.id}
                  onClick={() => setCategory(c.id)}
                  className={`mm-gift-cat ${category === c.id ? 'mm-gift-cat--active' : ''}`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-2 overflow-y-auto min-h-0 flex-1 pr-0.5">
              {filtered.map((g) => {
                const cost = toAll ? g.cost * Math.max(1, (stagePeople.length || others.length || 1)) : g.cost;
                const affordable = displayCoins >= cost;
                const canSend = !!channelId && (toAll ? others.length > 0 : !!target);
                return (
                  <button
                    key={g.id}
                    type="button"
                    disabled={sending || !affordable || !canSend}
                    onClick={() => send(g.id)}
                    className={`p-2 rounded-xl border bg-white/[0.03] hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                      TIER_STYLES[g.tier] || TIER_STYLES.basic
                    }`}
                    title={!affordable ? `Need ${cost} coins` : `${g.name} · ${cost} coins`}
                  >
                    <span className="block text-xl leading-none">{g.icon}</span>
                    <span className="block text-[8px] text-white/50 truncate mt-0.5">{g.name}</span>
                    <span className="block text-[9px] text-amber-300 font-semibold">{cost}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {notice && (
          <p className={`mt-2 text-[11px] ${notice.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>
            {notice.text}
          </p>
        )}
        <p className="mt-2 text-[10px] text-white/30">Tap a profile on stage to gift them · animation flies to their seat.</p>
      </div>
    </div>
  );

  return createPortal(drawer, document.body);
}

/** Full-screen animation that flies gifts toward the recipient&apos;s stage avatar. */
export function GiftOverlay({ socket }) {
  const [flying, setFlying] = useState([]);

  useEffect(() => {
    if (!socket) return undefined;
    const onGift = (payload) => {
      const id = `${payload.at}_${Math.random().toString(36).slice(2, 7)}`;
      let targetX = window.innerWidth / 2;
      let targetY = window.innerHeight * 0.35;
      const el =
        (payload.toSocketId && document.querySelector(`[data-audio-member="${payload.toSocketId}"]`)) ||
        (payload.toSocketId && document.querySelector(`[data-gift-avatar="${payload.toSocketId}"]`));
      if (el) {
        const r = el.getBoundingClientRect();
        targetX = r.left + r.width / 2;
        targetY = r.top + r.height / 2;
      }
      setFlying((prev) => [...prev.slice(-5), { ...payload, id, targetX, targetY }]);
      setTimeout(() => setFlying((prev) => prev.filter((g) => g.id !== id)), 2800);
    };
    socket.on('gift:received', onGift);
    return () => socket.off('gift:received', onGift);
  }, [socket]);

  if (!flying.length) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[650] overflow-hidden">
      {flying.map((g, i) => (
        <div
          key={g.id}
          className="mm-gift-fly"
          style={{
            '--gift-tx': `${g.targetX}px`,
            '--gift-ty': `${g.targetY}px`,
            animationDelay: `${i * 60}ms`,
          }}
        >
          <div className="mm-gift-fly__icon">{g.icon}</div>
          <div className="mm-gift-fly__label">
            {g.fromNickname} → {g.blast ? 'Everyone' : g.toNickname}
          </div>
        </div>
      ))}
    </div>
  );
}

export default GiftDrawer;
