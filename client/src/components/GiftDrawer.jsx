import React, { useEffect, useState } from 'react';

const TIER_STYLES = {
  basic: 'border-white/15',
  rare: 'border-sky-400/40 shadow-[0_0_12px_rgba(56,189,248,0.15)]',
  epic: 'border-fuchsia-400/40 shadow-[0_0_14px_rgba(232,121,249,0.18)]',
  legendary: 'border-amber-400/50 shadow-[0_0_18px_rgba(251,191,36,0.25)]',
};

/**
 * Gift picker + flying gift animation overlay.
 * The server validates affordability and pays the creator's share, so this
 * component only expresses intent and renders what the server confirms.
 */
export function GiftDrawer({ socket, channelId, members = [], coins = 0, open, onClose }) {
  const [gifts, setGifts] = useState([]);
  const [target, setTarget] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!socket) return undefined;
    const onCatalog = ({ gifts: g }) => setGifts(g || []);
    const onError = ({ message }) => {
      setError(message);
      setTimeout(() => setError(null), 3500);
    };
    socket.on('gift:catalog', onCatalog);
    socket.on('gift:error', onError);
    socket.emit('gift:catalog');
    return () => {
      socket.off('gift:catalog', onCatalog);
      socket.off('gift:error', onError);
    };
  }, [socket]);

  const others = members.filter((m) => m.socketId !== socket?.id);

  useEffect(() => {
    if (!target && others.length) setTarget(others[0].socketId);
  }, [others, target]);

  if (!open) return null;

  const send = (giftId) => {
    if (!target) return setError('Pick someone to gift first.');
    socket?.emit('gift:send', { toSocketId: target, giftId, channelId });
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] sm:inset-auto sm:right-4 sm:bottom-20 sm:w-[22rem]">
      <div className="rounded-t-2xl sm:rounded-2xl border border-white/12 bg-[#12151c] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-white">Send a gift</h4>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-amber-300 font-semibold">🪙 {coins}</span>
            <button type="button" onClick={onClose} className="text-white/50 hover:text-white text-lg leading-none">
              ×
            </button>
          </div>
        </div>

        {others.length > 0 ? (
          <select
            value={target || ''}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full mb-3 bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-amber-400/60"
          >
            {others.map((m) => (
              <option key={m.socketId} value={m.socketId} className="bg-[#12151c]">
                {m.nickname} {m.verified ? '✔' : ''}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-[11px] text-white/40 mb-3">No one else here yet.</p>
        )}

        <div className="grid grid-cols-4 gap-2">
          {gifts.map((g) => {
            const affordable = coins >= g.cost;
            return (
              <button
                key={g.id}
                type="button"
                disabled={!affordable || !target}
                onClick={() => send(g.id)}
                className={`p-2 rounded-xl border bg-white/[0.03] hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                  TIER_STYLES[g.tier] || TIER_STYLES.basic
                }`}
                title={`${g.name} · ${g.cost} coins`}
              >
                <span className="block text-xl leading-none">{g.icon}</span>
                <span className="block text-[9px] text-amber-300 font-semibold mt-1">{g.cost}</span>
              </button>
            );
          })}
        </div>

        {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
        <p className="mt-2 text-[10px] text-white/30">Creators keep 60–80% of every gift.</p>
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
      setFlying((prev) => [...prev.slice(-4), { ...payload, id }]);
      setTimeout(() => setFlying((prev) => prev.filter((g) => g.id !== id)), 3200);
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
          className="absolute left-1/2 -translate-x-1/2 text-center animate-[giftFloat_3.2s_ease-out_forwards]"
          style={{ bottom: '18%', animationDelay: `${i * 90}ms` }}
        >
          <div className="text-6xl drop-shadow-[0_0_18px_rgba(251,191,36,0.6)]">{g.icon}</div>
          <div className="mt-1 text-xs text-white/90 font-semibold bg-black/50 rounded-full px-3 py-1 backdrop-blur-sm">
            {g.fromNickname} → {g.toNickname}
          </div>
        </div>
      ))}
      <style>{`
        @keyframes giftFloat {
          0%   { opacity: 0; transform: translate(-50%, 40px) scale(0.6); }
          15%  { opacity: 1; transform: translate(-50%, 0) scale(1.15); }
          30%  { transform: translate(-50%, -10px) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -220px) scale(0.9); }
        }
      `}</style>
    </div>
  );
}

export default GiftDrawer;
