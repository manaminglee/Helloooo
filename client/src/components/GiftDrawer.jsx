import React, { useEffect, useMemo, useState } from 'react';

const TIER_STYLES = {
  basic: 'border-white/15',
  rare: 'border-sky-400/40 shadow-[0_0_12px_rgba(56,189,248,0.15)]',
  epic: 'border-fuchsia-400/40 shadow-[0_0_14px_rgba(232,121,249,0.18)]',
  legendary: 'border-amber-400/50 shadow-[0_0_18px_rgba(251,191,36,0.25)]',
};

/**
 * Gift picker with categories, send-to-one / send-to-all, and coin packages.
 */
export function GiftDrawer({ socket, channelId, members = [], coins = 0, open, onClose }) {
  const [gifts, setGifts] = useState([]);
  const [categories, setCategories] = useState([{ id: 'all', label: 'All' }]);
  const [packages, setPackages] = useState([]);
  const [category, setCategory] = useState('all');
  const [target, setTarget] = useState(null);
  const [toAll, setToAll] = useState(false);
  const [tab, setTab] = useState('gifts'); // gifts | packs
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!socket) return undefined;
    const onCatalog = ({ gifts: g, categories: c, packages: p }) => {
      setGifts(g || []);
      if (c?.length) setCategories(c);
      setPackages(p || []);
    };
    const onError = ({ message }) => {
      setError(message);
      setTimeout(() => setError(null), 3500);
    };
    const onBought = ({ coins: added }) => {
      setError(null);
      setTab('gifts');
      setTimeout(() => setError(`+${added} coins added`), 50);
      setTimeout(() => setError(null), 2500);
    };
    socket.on('gift:catalog', onCatalog);
    socket.on('gift:error', onError);
    socket.on('gift:pack-bought', onBought);
    socket.emit('gift:catalog');
    return () => {
      socket.off('gift:catalog', onCatalog);
      socket.off('gift:error', onError);
      socket.off('gift:pack-bought', onBought);
    };
  }, [socket]);

  const others = members.filter((m) => m.socketId !== socket?.id);
  const stagePeople = members.filter((m) => m.role !== 'listener' && m.socketId !== socket?.id);

  useEffect(() => {
    if (!target && others.length) setTarget(others[0].socketId);
  }, [others, target]);

  const filtered = useMemo(() => {
    if (category === 'all') return gifts;
    return gifts.filter((g) => g.category === category);
  }, [gifts, category]);

  if (!open) return null;

  const send = (giftId) => {
    if (toAll) {
      const ids = (stagePeople.length ? stagePeople : others).map((m) => m.socketId);
      if (!ids.length) return setError('No one else here yet.');
      socket?.emit('gift:send', { giftId, channelId, toAll: true, targetIds: ids });
      return;
    }
    if (!target) return setError('Pick someone to gift first.');
    socket?.emit('gift:send', { toSocketId: target, giftId, channelId });
  };

  const buyPack = (packageId) => {
    socket?.emit('coins:buy-package', { packageId });
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] sm:inset-auto sm:right-4 sm:bottom-20 sm:w-[24rem]">
      <div className="rounded-t-2xl sm:rounded-2xl border border-white/12 bg-[#12151c] p-4 shadow-2xl max-h-[78dvh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-white">Gifts & coins</h4>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-amber-300 font-semibold">🪙 {coins}</span>
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
            <p className="text-[10px] text-white/35">Test packs work when the server allows virtual purchases.</p>
          </div>
        ) : (
          <>
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

            {!toAll && others.length > 0 && (
              <select
                value={target || ''}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full mb-2 bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-xs text-white outline-none"
              >
                {others.map((m) => (
                  <option key={m.socketId} value={m.socketId} className="bg-[#12151c]">
                    {m.nickname} · {m.role}
                  </option>
                ))}
              </select>
            )}

            <div className="flex gap-1 overflow-x-auto pb-2 mb-2 scrollbar-none">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                    category === c.id ? 'border-violet-400/50 bg-violet-500/20 text-violet-100' : 'border-white/10 text-white/45'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-2 overflow-y-auto min-h-0 flex-1 pr-0.5">
              {filtered.map((g) => {
                const cost = toAll ? g.cost * Math.max(1, (stagePeople.length || others.length)) : g.cost;
                const affordable = coins >= cost;
                return (
                  <button
                    key={g.id}
                    type="button"
                    disabled={!affordable || (!toAll && !target)}
                    onClick={() => send(g.id)}
                    className={`p-2 rounded-xl border bg-white/[0.03] hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                      TIER_STYLES[g.tier] || TIER_STYLES.basic
                    }`}
                    title={`${g.name} · ${cost} coins`}
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

        {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
        <p className="mt-2 text-[10px] text-white/30">Everyone sees the gift animation + chat line.</p>
      </div>
    </div>
  );
}

/** Full-screen animation layer for incoming gifts. */
export function GiftOverlay({ socket }) {
  const [flying, setFlying] = useState([]);

  useEffect(() => {
    if (!socket) return undefined;
    const onGift = (payload) => {
      const id = `${payload.at}_${Math.random().toString(36).slice(2, 7)}`;
      setFlying((prev) => [...prev.slice(-5), { ...payload, id }]);
      setTimeout(() => setFlying((prev) => prev.filter((g) => g.id !== id)), 3600);
    };
    socket.on('gift:received', onGift);
    return () => socket.off('gift:received', onGift);
  }, [socket]);

  if (!flying.length) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {flying.map((g, i) => (
        <div
          key={g.id}
          className="absolute left-1/2 -translate-x-1/2 text-center animate-[giftFloat_3.4s_ease-out_forwards]"
          style={{ bottom: `${16 + (i % 3) * 6}%`, animationDelay: `${i * 80}ms` }}
        >
          <div className="text-6xl drop-shadow-[0_0_18px_rgba(251,191,36,0.6)]">{g.icon}</div>
          <div className="mt-1 text-xs text-white/90 font-semibold bg-black/55 rounded-full px-3 py-1 backdrop-blur-sm">
            {g.fromNickname} → {g.blast ? 'Everyone' : g.toNickname} · {g.name}
          </div>
        </div>
      ))}
      <style>{`
        @keyframes giftFloat {
          0%   { opacity: 0; transform: translate(-50%, 40px) scale(0.6); }
          15%  { opacity: 1; transform: translate(-50%, 0) scale(1.15); }
          30%  { transform: translate(-50%, -10px) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -240px) scale(0.9); }
        }
      `}</style>
    </div>
  );
}

export default GiftDrawer;
