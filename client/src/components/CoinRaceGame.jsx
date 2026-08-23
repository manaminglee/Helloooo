import React, { useEffect, useRef, useState } from 'react';
import RaceTrackCanvas from './RaceTrackCanvas';

/**
 * Shared coin race — every member of the audio channel sees the SAME race,
 * driven entirely by the server's `game:tick`. This component renders state
 * and sends intent (join / ready / boost); it never computes positions.
 */

const ENTRY_FEES = [0, 10, 25, 50, 100, 250];

export function CoinRaceGame({ socket, channelId, coins = 0 }) {
  const [game, setGame] = useState(null);
  const [error, setError] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [flash, setFlash] = useState(null);
  const boostLockRef = useRef(0);

  useEffect(() => {
    if (!socket || !channelId) return undefined;

    const onState = (state) => {
      const next = state && state.channelId === channelId ? state : null;
      setGame(next);
      if (next?.startsInMs) setCountdown(Math.ceil(next.startsInMs / 1000));
    };
    const onTick = (t) => {
      if (t.channelId !== channelId) return;
      setGame((prev) => {
        if (!prev) return prev;
        const byId = new Map(t.players.map((p) => [p.socketId, p]));
        return {
          ...prev,
          status: 'racing',
          elapsedMs: t.t,
          players: prev.players.map((p) => ({ ...p, ...(byId.get(p.socketId) || {}) })),
        };
      });
    };
    const onFinished = (payload) => {
      if (payload.channelId !== channelId) return;
      setGame((prev) => (prev ? { ...prev, status: 'finished', results: payload.results } : prev));
      const mine = payload.results?.find((r) => r.socketId === socket.id);
      if (mine?.prize > 0) {
        setFlash(`+${mine.prize} 🪙`);
        setTimeout(() => setFlash(null), 3000);
      }
    };
    const onError = ({ message }) => {
      setError(message);
      setTimeout(() => setError(null), 4000);
    };

    socket.on('game:state', onState);
    socket.on('game:tick', onTick);
    socket.on('game:finished', onFinished);
    socket.on('game:error', onError);
    socket.emit('game:info', { channelId });

    return () => {
      socket.off('game:state', onState);
      socket.off('game:tick', onTick);
      socket.off('game:finished', onFinished);
      socket.off('game:error', onError);
    };
  }, [socket, channelId]);

  useEffect(() => {
    if (game?.status !== 'lobby') return undefined;
    const id = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [game?.status]);

  const me = game?.players?.find((p) => p.socketId === socket?.id);
  const inRace = !!me;
  const emit = (evt, extra = {}) => socket?.emit(evt, { channelId, ...extra });

  /** Local cooldown mirrors the server's so the button feels honest. */
  const boost = () => {
    const now = Date.now();
    if (now - boostLockRef.current < 900) return;
    boostLockRef.current = now;
    emit('game:boost');
  };

  useEffect(() => {
    if (game?.status !== 'racing' || !inRace) return undefined;
    const onKey = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        boost();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.status, inRace]);

  // ---------- No active race: entry-fee picker ----------
  if (!game) {
    return (
      <div className="mm-card mm-card-glow overflow-hidden">
        <div className="relative px-4 pt-4 pb-3">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="min-w-0">
              <h4 className="mm-h3 text-white flex items-center gap-2">🏁 Coin Race</h4>
              <p className="mm-caption mt-0.5">Everyone in this channel races together.</p>
            </div>
            <span className="text-xs font-bold text-amber-300 shrink-0 tabular-nums">🪙 {coins}</span>
          </div>
        </div>
        <div className="px-4 pb-4">
          <p className="text-[11px] uppercase tracking-wider text-white/35 mb-2">Choose stake</p>
          <div className="grid grid-cols-3 gap-2">
            {ENTRY_FEES.map((fee) => (
              <button
                key={fee}
                type="button"
                disabled={fee > coins}
                onClick={() => emit('game:create', { entryFee: fee })}
                className="mm-btn mm-btn--ghost !px-2 !text-xs flex-col !gap-0.5 !min-h-[3.25rem]"
              >
                <span className="text-sm font-black">{fee === 0 ? 'FREE' : fee}</span>
                <span className="text-[9px] font-semibold opacity-55">
                  {fee === 0 ? 'practice' : 'coins'}
                </span>
              </button>
            ))}
          </div>
          {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
        </div>
      </div>
    );
  }

  const sorted = [...game.players].sort((a, b) => (b.progress || 0) - (a.progress || 0));

  return (
    <div className="mm-card overflow-hidden relative">
      {/* Win flash */}
      {flash && (
        <div className="absolute inset-0 z-20 grid place-items-center pointer-events-none">
          <span className="text-4xl font-black text-amber-300 drop-shadow-[0_0_20px_rgba(251,191,36,0.8)] mm-rise">
            {flash}
          </span>
        </div>
      )}

      {/* HUD */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-white/8 bg-white/[0.02]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm">🏁</span>
          <span className="text-xs font-bold text-white truncate">Coin Race</span>
          <span
            className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
              game.status === 'racing'
                ? 'bg-emerald-400/20 text-emerald-300'
                : game.status === 'finished'
                ? 'bg-white/10 text-white/60'
                : 'bg-amber-400/20 text-amber-300'
            }`}
          >
            {game.status === 'lobby' ? `starts ${countdown}s` : game.status}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-[11px] font-bold">
          <span className="text-amber-300 tabular-nums">POT {game.pot}</span>
          <span className="text-white/25">|</span>
          <span className="text-white/60 tabular-nums">🪙 {coins}</span>
        </div>
      </div>

      {/* Track */}
      <RaceTrackCanvas
        players={game.players}
        trackLength={game.trackLength}
        status={game.status}
        mySocketId={socket?.id}
        height={game.players.length > 4 ? 300 : 240}
      />

      {/* Standings */}
      <div className="px-3 py-2 border-t border-white/8 space-y-1">
        {sorted.slice(0, 4).map((p, i) => (
          <div key={p.socketId} className="flex items-center gap-2 text-[11px]">
            <span className="w-4 text-white/35 tabular-nums">{i + 1}</span>
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: p.car?.color || '#8b5cf6' }}
            />
            <span className={`flex-1 truncate ${p.socketId === socket?.id ? 'text-amber-300 font-bold' : 'text-white/70'}`}>
              {p.socketId === socket?.id ? 'You' : p.nickname}
            </span>
            {game.status === 'lobby' ? (
              <span className={p.ready ? 'text-emerald-300' : 'text-white/30'}>
                {p.ready ? 'ready' : 'waiting'}
              </span>
            ) : (
              <span className="text-white/40 tabular-nums">
                {Math.round(((p.progress || 0) / game.trackLength) * 100)}%
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="p-3 pt-2 flex flex-wrap gap-2 border-t border-white/8">
        {!inRace && game.status === 'lobby' && (
          <button
            type="button"
            onClick={() => emit('game:join')}
            disabled={game.entryFee > coins}
            className="mm-btn mm-btn--primary mm-btn--full"
          >
            {game.entryFee > 0 ? `Join · ${game.entryFee} 🪙` : 'Join free race'}
          </button>
        )}

        {inRace && game.status === 'lobby' && (
          <>
            <button
              type="button"
              onClick={() => emit('game:ready', { ready: !me.ready })}
              className={`mm-btn flex-1 ${me.ready ? 'mm-btn--primary' : 'mm-btn--ghost'}`}
            >
              {me.ready ? '✓ Ready' : 'Ready up'}
            </button>
            <button type="button" onClick={() => emit('game:leave')} className="mm-btn mm-btn--ghost">
              Leave
            </button>
          </>
        )}

        {inRace && game.status === 'racing' && !me.finished && (
          <button
            type="button"
            onClick={boost}
            disabled={me.boostCharges <= 0}
            className="mm-btn mm-btn--full !min-h-[3.5rem] bg-gradient-to-r from-amber-400 to-orange-500 text-black !text-base font-black"
          >
            ⚡ BOOST
            <span className="ml-1 flex gap-0.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <span
                  key={i}
                  className={`w-1.5 h-4 rounded-sm ${i < me.boostCharges ? 'bg-black/70' : 'bg-black/20'}`}
                />
              ))}
            </span>
          </button>
        )}

        {inRace && me?.finished && game.status === 'racing' && (
          <p className="w-full text-center text-xs text-emerald-300 font-bold py-2">
            Finished #{me.place} — waiting for others…
          </p>
        )}
      </div>

      {/* Results */}
      {game.status === 'finished' && game.results && (
        <div className="px-3 pb-3">
          <p className="text-[10px] uppercase tracking-wider text-white/35 mb-1.5">Final results</p>
          <div className="space-y-1">
            {game.results.map((r) => (
              <div key={r.userId} className="flex items-center justify-between text-xs">
                <span className="text-white/80">
                  {['🥇', '🥈', '🥉'][r.place - 1] || `#${r.place}`} {r.nickname}
                </span>
                <span className={r.prize > 0 ? 'text-amber-300 font-bold' : 'text-white/30'}>
                  {r.prize > 0 ? `+${r.prize} 🪙` : '—'}
                </span>
              </div>
            ))}
          </div>
          <p className="mm-caption mt-2">Next race can start in a moment.</p>
        </div>
      )}

      {error && <p className="px-3 pb-3 text-[11px] text-rose-300">{error}</p>}
    </div>
  );
}

export default CoinRaceGame;
