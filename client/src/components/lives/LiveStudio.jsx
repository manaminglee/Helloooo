import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../config/apiBase';
import { getCreatorAuthHeaders } from '../../utils/creatorAuth';
import { useLiveKitLive } from '../../hooks/useLiveKitLive';
import { NutsAmount } from '../NutsSymbol';

/**
 * Creator go-live studio — publish camera via LiveKit, wallpaper, end live.
 */
export default function LiveStudio({ socket, onExit, onStarted }) {
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const [title, setTitle] = useState('');
  const [wallpaperUrl, setWallpaperUrl] = useState('');
  const [liveId, setLiveId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [viewerCount, setViewerCount] = useState(0);

  const { connected, error: mediaError } = useLiveKitLive({
    enabled: !!liveId,
    socket,
    liveId,
    asHost: true,
    videoElRef: videoRef,
  });

  useEffect(() => {
    if (!socket || !liveId) return undefined;
    const onViewers = ({ liveId: id, count }) => {
      if (id === liveId) setViewerCount(count);
    };
    socket.on('live:viewers', onViewers);
    return () => socket.off('live:viewers', onViewers);
  }, [socket, liveId]);

  const saveWallpaper = async (dataUrl) => {
    setWallpaperUrl(dataUrl);
    try {
      await fetch(`${API_BASE}/api/lives/wallpaper`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCreatorAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ wallpaperUrl: dataUrl }),
      });
    } catch { /* ignore */ }
  };

  const onPickWall = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 1.5e6) {
      setError('Wallpaper must be under 1.5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const max = 720;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        void saveWallpaper(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/lives/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCreatorAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          title: title.trim() || undefined,
          wallpaperUrl: wallpaperUrl || undefined,
          socketId: socket?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Could not start live');
        return;
      }
      setLiveId(data.live.id);
      onStarted?.(data.live);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    if (!liveId) {
      onExit?.();
      return;
    }
    setBusy(true);
    try {
      await fetch(`${API_BASE}/api/lives/${liveId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCreatorAuthHeaders() },
        credentials: 'include',
      });
    } catch { /* */ }
    setLiveId(null);
    setBusy(false);
    onExit?.();
  };

  return (
    <div className="mm-live-studio mm-live-nocapture">
      <div className="mm-live-studio__preview">
        {wallpaperUrl && !connected && (
          <div className="mm-live-slide__wallpaper" style={{ backgroundImage: `url(${wallpaperUrl})` }} />
        )}
        <video ref={videoRef} className="mm-live-slide__video" playsInline muted autoPlay />
      </div>

      <div className="mm-live-studio__panel">
        <header className="flex items-center justify-between gap-2">
          <button type="button" className="mm-live-icon-btn" onClick={end}>←</button>
          <h1 className="text-white font-black text-sm">{liveId ? 'You are LIVE' : 'Go Live'}</h1>
          {liveId ? <span className="text-xs text-white/50">{viewerCount} watching</span> : <span />}
        </header>

        {!liveId ? (
          <div className="space-y-3 mt-4">
            <label className="mm-audio-id-label">
              Title
              <input
                className="mm-audio-id-input"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 80))}
                placeholder="Tonight's vibe…"
              />
            </label>
            <div>
              <p className="mm-audio-id-label !mb-2">Wallpaper (saved for next time)</p>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickWall} />
              <button type="button" className="mm-btn mm-btn--ghost w-full" onClick={() => fileRef.current?.click()}>
                {wallpaperUrl ? 'Change wallpaper' : 'Upload wallpaper'}
              </button>
            </div>
            {(error || mediaError) && <p className="mm-audio-id-error">{error || mediaError}</p>}
            <button type="button" className="mm-btn mm-btn--primary w-full" disabled={busy} onClick={start}>
              {busy ? 'Starting…' : 'Start live'}
            </button>
          </div>
        ) : (
          <div className="space-y-3 mt-4">
            <p className="text-center text-rose-300 font-bold text-sm animate-pulse">● Broadcasting</p>
            {(error || mediaError) && <p className="mm-audio-id-error">{error || mediaError}</p>}
            <button type="button" className="mm-btn mm-btn--ghost w-full border-rose-400/40 text-rose-200" disabled={busy} onClick={end}>
              End live
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
