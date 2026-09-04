import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../config/apiBase';
import { getCreatorAuthHeaders, getCreatorSessionToken } from '../../utils/creatorAuth';
import { emitCreatorAuth } from '../../hooks/useSocket';
import { isMobileLiveDevice } from '../../utils/liveDevice';
import CreatorVerifyModal from '../CreatorVerifyModal';
import LiveRoom from './LiveRoom';

function validateTitle(raw) {
  const t = String(raw || '').trim();
  if (!t) return { ok: true, title: '' };
  if (t.length < 2) return { ok: false, error: 'Title is too short.' };
  if (t.length > 80) return { ok: false, error: 'Title max 80 characters.' };
  return { ok: true, title: t };
}

/**
 * Creator go-live flow: setup card → the same full-screen room the audience
 * sees, in host mode. There is no separate host layout, so what the creator
 * frames in preview is exactly what viewers get.
 */
export default function LiveStudio({ socket, identityHook, creatorsHook = null, onExit, onStarted }) {
  const fileRef = useRef(null);
  const previewRef = useRef(null);
  const previewStream = useRef(null);

  const [title, setTitle] = useState('');
  const [wallpaperUrl, setWallpaperUrl] = useState('');
  const [liveObj, setLiveObj] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needLogin, setNeedLogin] = useState(!getCreatorSessionToken());
  const [creator, setCreator] = useState(null);

  // --- creator session ------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tok = getCreatorSessionToken();
      if (!tok) { setNeedLogin(true); return; }
      emitCreatorAuth(tok);
      try {
        const res = await fetch(`${API_BASE}/api/creators/status`, {
          headers: { ...getCreatorAuthHeaders() },
          credentials: 'include',
        });
        const data = await res.json();
        if (cancelled) return;
        if (data?.data?.status !== 'approved') {
          setNeedLogin(true);
          setError('Only approved creators can go live.');
          return;
        }
        setNeedLogin(false);
        setCreator(data.data);
        if (data.data.live_wallpaper_url) setWallpaperUrl(data.data.live_wallpaper_url);
        setTitle((t) => t || `${data.data.handle_name} Live`);
      } catch {
        if (!cancelled) setError('Could not verify creator session.');
      }
    })();
    return () => { cancelled = true; };
  }, [needLogin]);

  // --- camera preview before going live -------------------------------------
  useEffect(() => {
    if (liveObj || needLogin) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        previewStream.current = stream;
        if (previewRef.current) {
          previewRef.current.srcObject = stream;
          void previewRef.current.play?.().catch(() => {});
        }
      } catch {
        if (!cancelled) setError('Camera permission is needed to go live.');
      }
    })();
    return () => {
      cancelled = true;
      previewStream.current?.getTracks().forEach((t) => t.stop());
      previewStream.current = null;
    };
  }, [liveObj, needLogin]);

  const stopPreview = useCallback(() => {
    previewStream.current?.getTracks().forEach((t) => t.stop());
    previewStream.current = null;
  }, []);

  // --- wallpaper ------------------------------------------------------------
  const onPickWallpaper = (e) => {
    const file = e.target.files?.[0];
    if (!file?.type?.startsWith('image/')) return;
    if (file.size > 1.5e6) { setError('Wallpaper must be under 1.5MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 720 / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        setWallpaperUrl(dataUrl);
        try {
          await fetch(`${API_BASE}/api/lives/wallpaper`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getCreatorAuthHeaders() },
            credentials: 'include',
            body: JSON.stringify({ wallpaperUrl: dataUrl }),
          });
        } catch { /* wallpaper is cosmetic — never blocks going live */ }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // --- lifecycle ------------------------------------------------------------
  const start = async () => {
    if (!getCreatorSessionToken()) { setNeedLogin(true); return; }
    if (!socket?.id) { setError('Not connected yet — wait a moment and retry.'); return; }
    const check = validateTitle(title);
    if (!check.ok) { setError(check.error); return; }

    setBusy(true);
    setError('');
    try {
      emitCreatorAuth(getCreatorSessionToken());
      const res = await fetch(`${API_BASE}/api/lives/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCreatorAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          title: check.title || undefined,
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
      stopPreview();   // release the camera so LiveKit can claim it
      setLiveObj({
        ...data.live,
        avatarUrl: creator?.avatar_url || null,
        displayName: creator?.display_name || creator?.handle_name,
        verified: true,
      });
      onStarted?.(data.live);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  };

  const endLive = useCallback(async () => {
    const id = liveObj?.id;
    if (!id) { onExit?.(); return; }
    try {
      await fetch(`${API_BASE}/api/lives/${id}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCreatorAuthHeaders() },
        credentials: 'include',
      });
    } catch { /* the server also ends it on host disconnect */ }
  }, [liveObj, onExit]);

  // --- render ---------------------------------------------------------------
  if (!isMobileLiveDevice()) {
    return (
      <div className="live-desktop-block">
        <p style={{ fontSize: 17, fontWeight: 800 }}>Go live from your phone</p>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>
          The host studio is built for a portrait camera.
        </p>
        <button type="button" className="live-btn" onClick={onExit}>Back</button>
      </div>
    );
  }

  if (needLogin && creatorsHook) {
    return (
      <CreatorVerifyModal
        open
        onClose={() => { if (getCreatorSessionToken()) setNeedLogin(false); else onExit?.(); }}
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
      <div className="live-desktop-block">
        <p style={{ fontSize: 17, fontWeight: 800 }}>Creator login required</p>
        {error && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
        <button type="button" className="live-btn" onClick={onExit}>Back</button>
      </div>
    );
  }

  if (liveObj) {
    return (
      <LiveRoom
        socket={socket}
        live={liveObj}
        mode="host"
        identity={identityHook?.identity}
        identityHook={identityHook}
        onExit={onExit}
        onEndLive={endLive}
      />
    );
  }

  // --- pre-live setup: same full-screen frame, so the creator sees the crop --
  return (
    <div className="live-root">
      <div className="live-video-layer">
        {wallpaperUrl && (
          <div className="live-wallpaper" style={{ backgroundImage: `url(${wallpaperUrl})` }} />
        )}
        <video ref={previewRef} className="live-video live-video--mirror" playsInline muted autoPlay />
      </div>
      <div className="live-scrim-top" />
      <div className="live-scrim-bottom" />

      <div className="live-ui">
        <header className="live-top">
          <div className="live-host">
            <span className="live-host__avatar">{(creator?.handle_name || '?')[0]?.toUpperCase()}</span>
            <span className="live-host__text">
              <span className="live-host__name">Preview</span>
              <span className="live-host__handle">@{creator?.handle_name || 'creator'}</span>
            </span>
          </div>
          <div className="live-top__right">
            <button type="button" className="live-icon-btn" onClick={() => { stopPreview(); onExit?.(); }} aria-label="Close">✕</button>
          </div>
        </header>

        <div className="live-mid" />

        <div className="live-bottom" data-interactive>
          <input
            className="live-composer__field"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 80))}
            placeholder="What's this live about?"
            maxLength={80}
            aria-label="Live title"
          />

          <div className="live-composer">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickWallpaper} />
            <button
              type="button"
              className="live-btn"
              style={{ flex: '0 0 auto', height: 44 }}
              onClick={() => fileRef.current?.click()}
            >
              {wallpaperUrl ? '🖼 Change' : '🖼 Backdrop'}
            </button>
            <button
              type="button"
              className="live-btn live-btn--primary"
              style={{ flex: '1 1 auto' }}
              disabled={busy || !socket?.connected}
              onClick={start}
            >
              {busy ? 'Starting…' : 'Go Live'}
            </button>
          </div>

          {error && (
            <p style={{ fontSize: 12.5, color: '#f87171', textAlign: 'center', overflowWrap: 'anywhere' }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
