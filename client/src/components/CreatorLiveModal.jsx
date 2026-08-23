/**
 * Creator-only YouTube Live setup — stream key stays in memory for this session only.
 */
import { useEffect, useState } from 'react';

export function CreatorLiveModal({ open, onClose, isLive, onStart, onStop }) {
  const [streamKey, setStreamKey] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setStreamKey('');
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  const handleStart = async () => {
    const key = streamKey.trim();
    if (key.length < 10) return;
    setBusy(true);
    try {
      await onStart?.(key);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0a0c14] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-rose-400">YouTube Live</h3>
            <p className="text-xs text-white/50 mt-1">Streams only the 2×2 video grid — creators only.</p>
          </div>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white px-2" aria-label="Close">✕</button>
        </div>

        {isLive ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-sm font-bold text-rose-300">Broadcasting to YouTube</span>
            </div>
            <button
              type="button"
              onClick={() => onStop?.()}
              className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-widest"
            >
              Stop live stream
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">YouTube stream key</span>
              <input
                type="password"
                autoComplete="off"
                value={streamKey}
                onChange={(e) => setStreamKey(e.target.value)}
                placeholder="Paste from YouTube Studio → Go live"
                className="mt-2 w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:border-rose-500/50 outline-none"
              />
            </label>
            <p className="text-[10px] text-white/35 leading-relaxed">
              Your key is sent over encrypted WebSocket, used only for this broadcast, and is never stored on Helloooo servers.
            </p>
            <a
              href="https://studio.youtube.com/channel/livestreaming"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-sky-400 hover:text-sky-300 underline"
            >
              Open YouTube Studio live dashboard
            </a>
            <button
              type="button"
              disabled={busy || streamKey.trim().length < 10}
              onClick={handleStart}
              className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-black uppercase tracking-widest"
            >
              {busy ? 'Connecting…' : 'Go live'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
