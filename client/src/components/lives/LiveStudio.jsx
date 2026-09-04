import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../config/apiBase';
import { getCreatorAuthHeaders, getCreatorSessionToken } from '../../utils/creatorAuth';
import { useLiveKitLive } from '../../hooks/useLiveKitLive';
import CreatorVerifyModal from '../CreatorVerifyModal';
import { emitCreatorAuth } from '../../hooks/useSocket';

function validateLiveTitle(raw) {
  const t = String(raw || '').trim();
  if (!t) return { ok: true, title: '' }; // optional — server fills default
  if (t.length < 2) return { ok: false, error: 'Title is too short.' };
  if (t.length > 80) return { ok: false, error: 'Title max 80 characters.' };
  return { ok: true, title: t };
}

/**
 * Creator go-live studio — requires secure creator session + LiveKit publish.
 */
export default function LiveStudio({
  socket,
  onExit,
  onStarted,
  creatorsHook = null,
}) {
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const [title, setTitle] = useState('');
  const [wallpaperUrl, setWallpaperUrl] = useState('');
  const [liveId, setLiveId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [needLogin, setNeedLogin] = useState(!getCreatorSessionToken());
  const [creatorHandle, setCreatorHandle] = useState('');

  const { connected, error: mediaError } = useLiveKitLive({
    enabled: !!liveId,
    socket,
    liveId,
    asHost: true,
    videoElRef: videoRef,
  });

  useEffect(() => {
    const tok = getCreatorSessionToken();
    if (tok) emitCreatorAuth(tok);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getCreatorSessionToken()) {
        setNeedLogin(true);
        return;
      }
      emitCreatorAuth(getCreatorSessionToken());
      try {
        const res = await fetch(`${API_BASE}/api/creators/status`, {
          headers: { ...getCreatorAuthHeaders() },
          credentials: 'include',
        });
        const data = await res.json();
        if (cancelled) return;
        if (!data?.data || data.data.status !== 'approved') {
          setNeedLogin(true);
          setError('Only approved creators can go live. Log in with your creator account.');
          return;
        }
        setNeedLogin(false);
        setCreatorHandle(data.data.handle_name || '');
        if (data.data.live_wallpaper_url) setWallpaperUrl(data.data.live_wallpaper_url);
        if (!title) setTitle(`${data.data.handle_name} Live`);
      } catch {
        if (!cancelled) setError('Could not verify creator session.');
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needLogin]);

  useEffect(() => {
    if (!socket || !liveId) return undefined;
    const onViewers = ({ liveId: id, count }) => {
      if (id === liveId) setViewerCount(count);
    };
    const onEnded = ({ liveId: id }) => {
      if (id === liveId) {
        setLiveId(null);
        setError('Live ended.');
      }
    };
    socket.on('live:viewers', onViewers);
    socket.on('live:ended', onEnded);
    return () => {
      socket.off('live:viewers', onViewers);
      socket.off('live:ended', onEnded);
    };
  }, [socket, liveId]);

  const saveWallpaper = async (dataUrl) => {
    setWallpaperUrl(dataUrl);
    try {
      const res = await fetch(`${API_BASE}/api/lives/wallpaper`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCreatorAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ wallpaperUrl: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Could not save wallpaper');
    } catch {
      setError('Network error saving wallpaper');
    }
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
    if (!getCreatorSessionToken()) {
      setNeedLogin(true);
      setError('Creator login required');
      return;
    }
    if (!socket?.id) {
      setError('Socket not connected — wait a moment and retry.');
      return;
    }
    const titleCheck = validateLiveTitle(title);
    if (!titleCheck.ok) {
      setError(titleCheck.error);
      return;
    }
    setBusy(true);
    setError('');
    try {
      emitCreatorAuth(getCreatorSessionToken());
      const res = await fetch(`${API_BASE}/api/lives/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCreatorAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          title: titleCheck.title || undefined,
          wallpaperUrl: wallpaperUrl || undefined,
          socketId: socket.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Could not start live');
        if (res.status === 401) setNeedLogin(true);
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

  if (needLogin && creatorsHook) {
    return (
      <CreatorVerifyModal
        open
        onClose={() => {
          if (getCreatorSessionToken()) setNeedLogin(false);
          else onExit?.();
        }}
        registerCreator={creatorsHook.registerCreator}
        login={async (...args) => {
          const res = await creatorsHook.login(...args);
          if (res.success) setNeedLogin(false);
          return res;
        }}
        checkStatus={creatorsHook.checkStatus}
        requestPasswordReset={creatorsHook.requestPasswordReset}
        showAlert={() => {}}
        onOpenDashboard={() => setNeedLogin(false)}
      />
    );
  }

  if (needLogin) {
    return (
      <div className="mm-live-shell mm-live-shell--center">
        <p className="text-white font-bold">Creator login required</p>
        <button type="button" className="mm-btn mm-btn--ghost mt-4" onClick={onExit}>Back</button>
      </div>
    );
  }

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
          <h1 className="text-white font-black text-sm">
            {liveId ? 'You are LIVE' : 'Create Live'}
            {creatorHandle ? ` · @${creatorHandle}` : ''}
          </h1>
          {liveId ? <span className="text-xs text-white/50">{viewerCount} watching</span> : <span />}
        </header>

        {!liveId ? (
          <div className="space-y-3 mt-4">
            <label className="mm-audio-id-label">
              Live title
              <input
                className="mm-audio-id-input"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 80))}
                placeholder="Tonight's vibe…"
                maxLength={80}
              />
            </label>
            <div>
              <p className="mm-audio-id-label !mb-2">Wallpaper (saved for next live)</p>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickWall} />
              <button type="button" className="mm-btn mm-btn--ghost w-full" onClick={() => fileRef.current?.click()}>
                {wallpaperUrl ? 'Change wallpaper' : 'Upload wallpaper'}
              </button>
            </div>
            {(error || mediaError) && <p className="mm-audio-id-error">{error || mediaError}</p>}
            <button type="button" className="mm-btn mm-btn--primary w-full" disabled={busy || !socket?.connected} onClick={start}>
              {busy ? 'Starting…' : 'Start live now'}
            </button>
            <p className="text-[10px] text-white/35 text-center">
              Requires approved creator session + LiveKit. Viewers gift Nuts to you.
            </p>
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
