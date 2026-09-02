/**
 * Creator-only YouTube Live setup — stream key stays in memory for this session only.
 */
import { useEffect, useState } from 'react';

/** Accept raw key or full rtmp(s)://…/live2/KEY from YouTube Studio. */
export function normalizeYoutubeStreamKey(raw) {
  let s = String(raw || '').trim().replace(/^["']+|["']+$/g, '');
  if (!s) return '';
  const urlMatch = s.match(/rtmps?:\/\/[^\s/]+\/(?:live2?|live)\/([a-zA-Z0-9_-]+)/i);
  if (urlMatch) return urlMatch[1];
  const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    const keyLine = lines.find((l) => !/^rtmps?:\/\//i.test(l) && /^[a-zA-Z0-9_-]{8,}$/.test(l));
    if (keyLine) return keyLine;
  }
  s = s.replace(/^(?:live2?|live)\//i, '');
  if (/^rtmps?:\/\//i.test(s)) {
    const parts = s.split('/');
    s = parts[parts.length - 1] || '';
  }
  return s.trim();
}

export function CreatorLiveModal({ open, onClose, isLive, onStart, onStop }) {
  const [streamKey, setStreamKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setStreamKey('');
      setBusy(false);
      setError('');
    }
  }, [open]);

  if (!open) return null;

  const handleStart = async () => {
    const key = normalizeYoutubeStreamKey(streamKey);
    if (key.length < 8) {
      setError('Paste your YouTube stream key (or the full rtmp://…/live2/KEY URL).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onStart?.(key);
    } catch (e) {
      setError(e?.message || 'Could not go live. Check the key and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mm-modal-overlay z-[2500]" onClick={onClose}>
      <div
        className="mm-modal-surface max-w-md rounded-3xl"
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
                onChange={(e) => { setStreamKey(e.target.value); setError(''); }}
                placeholder="xxxx-xxxx-xxxx-xxxx-xxxx"
                className="mt-2 w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:border-rose-500/50 outline-none font-mono"
              />
            </label>
            <p className="text-[10px] text-white/35 leading-relaxed">
              In YouTube Studio → Create → Go live → Stream, copy the <strong className="text-white/55">Stream key</strong> (not only the Stream URL).
              Pasting the full <span className="text-white/50">rtmp://a.rtmp.youtube.com/live2/…</span> URL also works.
              Key is never stored on Helloooo.
            </p>
            {error && (
              <p className="text-[11px] text-rose-300/95 leading-relaxed rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2">
                {error}
              </p>
            )}
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
              disabled={busy || normalizeYoutubeStreamKey(streamKey).length < 8}
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
