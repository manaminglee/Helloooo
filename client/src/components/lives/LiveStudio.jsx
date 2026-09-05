import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../config/apiBase';
import { getCreatorAuthHeaders, getCreatorSessionToken } from '../../utils/creatorAuth';
import { emitCreatorAuth } from '../../hooks/useSocket';
import { isMobileLiveDevice } from '../../utils/liveDevice';
import { useMediaPreview } from '../../hooks/useMediaPreview';
import { useLiveBodyLock } from '../../hooks/useLiveViewport';
import { hapticTap } from '../../utils/haptics';
import CreatorVerifyModal from '../CreatorVerifyModal';
import { MmIcon } from '../icons/MmIcon';
import { Avatar } from './LiveBits';
import LiveRoom from './LiveRoom';
import { detectFaceInImage, preloadFaceDetection } from '../../utils/detectFaceInImage';

function validateTitle(raw) {
  const t = String(raw || '').trim();
  if (!t) return { ok: true, title: '' };
  if (t.length < 2) return { ok: false, error: 'Title is too short.' };
  if (t.length > 80) return { ok: false, error: 'Title max 80 characters.' };
  return { ok: true, title: t };
}

/** Profile photo for the header — never the cover/wallpaper thumbnail. */
function creatorAvatarUrl(creator, liveRow) {
  return creator?.avatar_url || liveRow?.avatarUrl || null;
}

/**
 * Creator go-live flow: setup card → the same full-screen room the audience
 * sees, in host mode. There is no separate host layout, so what the creator
 * frames in preview is exactly what viewers get.
 */
export default function LiveStudio({ socket, identityHook, creatorsHook = null, onExit, onStarted }) {
  useLiveBodyLock();
  const fileRef = useRef(null);
  const previewRef = useRef(null);
  const wallpaperReqRef = useRef(0);

  useEffect(() => { preloadFaceDetection(); }, []);

  const [title, setTitle] = useState('');
  const [wallpaperUrl, setWallpaperUrl] = useState('');
  /** @type {'missing'|'validating'|'ok'|'no_face'|'error'} */
  const [wallpaperStatus, setWallpaperStatus] = useState('missing');
  const [liveObj, setLiveObj] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needLogin, setNeedLogin] = useState(!getCreatorSessionToken());
  const [creator, setCreator] = useState(null);

  // --- wallpaper + face check -----------------------------------------------
  const validateWallpaper = useCallback(async (dataUrl, { persist = true } = {}) => {
    const req = ++wallpaperReqRef.current;
    setWallpaperUrl(dataUrl);
    setWallpaperStatus('validating');
    setError('');
    try {
      const hasFace = await detectFaceInImage(dataUrl);
      if (req !== wallpaperReqRef.current) return false;
      if (!hasFace) {
        setWallpaperStatus('no_face');
        setError('Cover photo must clearly show your face.');
        return false;
      }
      setWallpaperStatus('ok');
      if (persist) {
        try {
          await fetch(`${API_BASE}/api/lives/wallpaper`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getCreatorAuthHeaders() },
            credentials: 'include',
            body: JSON.stringify({ wallpaperUrl: dataUrl }),
          });
        } catch { /* saved locally — server sync is best-effort */ }
      }
      return true;
    } catch {
      if (req !== wallpaperReqRef.current) return false;
      setWallpaperStatus('error');
      setError('Could not verify cover photo — try another image.');
      return false;
    }
  }, []);

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
        setTitle((t) => t || `${data.data.handle_name} Live`);
        if (data.data.live_wallpaper_url) {
          void validateWallpaper(data.data.live_wallpaper_url, { persist: false });
        }
      } catch {
        if (!cancelled) setError('Could not verify creator session.');
      }
    })();
    return () => { cancelled = true; };
  }, [needLogin, validateWallpaper]);

  // If the profile photo arrives after go-live, patch it into the live header.
  useEffect(() => {
    if (!creator?.avatar_url) return;
    setLiveObj((prev) => {
      if (!prev || prev.avatarUrl) return prev;
      return { ...prev, avatarUrl: creator.avatar_url };
    });
  }, [creator?.avatar_url]);

  // --- camera + mic preview -------------------------------------------------
  const preview = useMediaPreview({
    enabled: !liveObj && !needLogin,
    videoRef: previewRef,
  });

  const [beautyOn, setBeautyOn] = useState(true);
  const [showGuide, setShowGuide] = useState(true);
  useEffect(() => {
    if (!preview.ready) return undefined;
    const t = setTimeout(() => setShowGuide(false), 5000);
    return () => clearTimeout(t);
  }, [preview.ready]);

  const onPickWallpaper = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file?.type?.startsWith('image/')) return;
    if (file.size > 1.5e6) { setError('Cover photo must be under 1.5MB'); return; }
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
        await validateWallpaper(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const openCoverPicker = () => fileRef.current?.click();

  // --- lifecycle ------------------------------------------------------------
  const start = async () => {
    if (!getCreatorSessionToken()) { setNeedLogin(true); return; }
    if (!socket?.id) { setError('Not connected yet — wait a moment and retry.'); return; }
    if (wallpaperStatus !== 'ok' || !wallpaperUrl) {
      setError('Upload a cover photo with your face visible before going live.');
      openCoverPicker();
      return;
    }
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
        // Resume path if server still returned the live payload
        if (data.live?.id) {
          preview.stop();
          await new Promise((r) => setTimeout(r, 160));
          setLiveObj({
            ...data.live,
            avatarUrl: creatorAvatarUrl(creator, data.live),
            displayName: creator?.display_name || creator?.handle_name || data.live.displayName,
            verified: true,
            beautyEnabled: beautyOn,
          });
          onStarted?.(data.live);
          return;
        }
        setError(data.error || 'Could not start live');
        if (res.status === 401) setNeedLogin(true);
        return;
      }
      preview.stop();   // release camera + mic so LiveKit can claim them
      // Safari needs a beat after stopping preview getUserMedia
      await new Promise((r) => setTimeout(r, 160));
      setLiveObj({
        ...data.live,
        avatarUrl: creatorAvatarUrl(creator, data.live),
        displayName: creator?.display_name || creator?.handle_name,
        verified: true,
        beautyEnabled: beautyOn,
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
    const hostLive = {
      ...liveObj,
      avatarUrl: creatorAvatarUrl(creator, liveObj),
    };
    return (
      <LiveRoom
        socket={socket}
        live={hostLive}
        mode="host"
        identity={identityHook?.identity}
        identityHook={identityHook}
        onExit={onExit}
        onEndLive={endLive}
      />
    );
  }

  // --- pre-live setup ------------------------------------------------------
  // Deliberately the same full-screen frame the audience will get, so what the
  // creator frames here is exactly what ships.
  const canStart = preview.ready && !busy && socket?.connected && wallpaperStatus === 'ok';
  const blocker = preview.error || (wallpaperStatus === 'no_face' || wallpaperStatus === 'error' ? error : '');
  const coverRequired = wallpaperStatus === 'missing' || wallpaperStatus === 'no_face';

  const goLiveLabel = (() => {
    if (busy) return 'Starting…';
    if (!socket?.connected) return 'Connecting…';
    if (!preview.ready) return 'Starting camera…';
    if (wallpaperStatus === 'validating') return 'Checking face…';
    if (coverRequired) return 'Upload cover photo';
    if (wallpaperStatus !== 'ok') return 'Upload cover photo';
    return 'Go Live';
  })();

  const onGoLiveClick = () => {
    if (wallpaperStatus !== 'ok') {
      openCoverPicker();
      return;
    }
    void start();
  };

  return (
    <div className="live-root">
      <div className="live-video-layer">
        {wallpaperUrl && (
          <div className="live-wallpaper" style={{ backgroundImage: `url(${wallpaperUrl})` }} />
        )}
        <video
          ref={previewRef}
          className="live-video"
          playsInline
          webkit-playsinline="true"
          muted
          autoPlay
        />
        {!preview.ready && !preview.error && (
          <div className="live-state live-state--transparent">
            <div className="live-state__spinner" aria-hidden />
            <p className="live-state__label">Starting camera…</p>
          </div>
        )}
      </div>

      <div className="live-scrim-top" />
      <div className="live-scrim-bottom" />

      {/* Framing guide: shows where the chat and controls will sit once live,
          so creators do not compose a shot the overlays then cover. */}
      {preview.ready && (
        <div className={`prelive-guide${showGuide ? '' : ' prelive-guide--faded'}`} aria-hidden>
          <div className="prelive-guide__frame">
            <i /><i /><i /><i />
            <span className="prelive-guide__label">Frame your face here</span>
          </div>
        </div>
      )}

      <div className="live-ui">
        <header className="live-top">
          <div className="live-host">
            <Avatar
              className={`live-host__avatar live-host__avatar--pop${wallpaperStatus === 'validating' ? ' live-host__avatar--busy' : ''}${coverRequired ? ' live-host__avatar--required' : ''}`}
              src={creator?.avatar_url || null}
              name={creator?.handle_name}
            />
            <span className="live-host__text">
              <span className="live-host__name">
                {creator?.display_name || creator?.handle_name || 'Your live'}
              </span>
              <span className="live-host__handle">@{creator?.handle_name || 'creator'}</span>
            </span>
          </div>
          <div className="live-top__right">
            <span className="prelive-chip">PREVIEW</span>
            <button
              type="button"
              className="live-icon-btn"
              onClick={() => { preview.stop(); onExit?.(); }}
              aria-label="Close"
            >
              <MmIcon name="close" size={15} />
            </button>
          </div>
        </header>

        {/* Same right rail as the live room, so the controls do not move when
            the stream starts. */}
        <div className="live-mid">
          <div className="live-left" />
          <div className="live-rail">
            <span className="live-rail__item">
              <button
                type="button"
                className="live-rail__btn"
                onClick={() => { hapticTap(); void preview.flip(); }}
                disabled={!preview.ready}
                aria-label="Flip camera"
              >
                <MmIcon name="cameraFlip" size={19} />
                <span className="live-rail__label">{preview.facing === 'user' ? 'Front' : 'Back'}</span>
              </button>
            </span>
            <span className="live-rail__item">
              <button
                type="button"
                className={`live-rail__btn${preview.micOn ? '' : ' live-rail__btn--off'}`}
                onClick={() => { hapticTap(); preview.toggleMic(); }}
                disabled={!preview.ready}
                aria-label={preview.micOn ? 'Mute microphone' : 'Unmute microphone'}
              >
                <MmIcon name={preview.micOn ? 'mic' : 'micOff'} size={19} />
              </button>
            </span>
            <span className="live-rail__item">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickWallpaper} />
              <button
                type="button"
                className={`live-rail__btn${coverRequired ? ' live-rail__btn--required' : ''}${wallpaperStatus === 'ok' ? ' live-rail__btn--ok' : ''}`}
                onClick={openCoverPicker}
                aria-label="Upload cover photo with your face"
              >
                <MmIcon name="image" size={19} />
                <span className="live-rail__label">
                  {wallpaperStatus === 'validating' ? 'Checking…' : coverRequired ? 'Cover *' : 'Cover'}
                </span>
              </button>
            </span>
          </div>
        </div>

        <div className="live-bottom" data-interactive>
          <div className="prelive-beauty">
            <span>Beauty filter {beautyOn ? 'ON' : 'OFF'}</span>
            <button
              type="button"
              className={`live-btn${beautyOn ? ' live-btn--primary' : ''}`}
              onClick={() => setBeautyOn((v) => !v)}
            >
              {beautyOn ? '✨ Soft look' : 'Raw camera'}
            </button>
          </div>
          {/* Mic check — a dead mic should be obvious here, not to an audience. */}
          <div className="prelive-mic">
            <span className="prelive-mic__icon">
              <MmIcon name={preview.micOn ? 'mic' : 'micOff'} size={14} />
            </span>
            <span className="prelive-mic__meter" aria-hidden>
              {Array.from({ length: 12 }, (_, i) => (
                <span
                  key={i}
                  className={`prelive-mic__seg${preview.micOn && preview.level > (i + 1) / 13 ? ' prelive-mic__seg--on' : ''}`}
                />
              ))}
            </span>
            <span className="prelive-mic__hint">
              {!preview.micOn ? 'Mic off' : preview.level > 0.06 ? 'Sounds good' : 'Say something'}
            </span>
          </div>

          <label className="prelive-field">
            <span className="prelive-field__label">
              Live title
              <span className="prelive-field__count">{title.length}/80</span>
            </span>
            <input
              className="prelive-field__input"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 80))}
              placeholder="What's this live about?"
              maxLength={80}
              enterKeyHint="done"
            />
          </label>

          {coverRequired && !preview.error && (
            <p className="prelive-wallpaper-hint">
              Upload a cover photo that shows your face — required before you can go live.
            </p>
          )}

          {blocker && (
            <p className="prelive-error">
              {blocker}
              {preview.error && (
                <button type="button" className="prelive-error__retry" onClick={preview.retry}>
                  Try again
                </button>
              )}
            </p>
          )}

          <button
            type="button"
            className={`prelive-go${coverRequired ? ' prelive-go--needs-cover' : ''}`}
            disabled={busy || wallpaperStatus === 'validating' || (!canStart && wallpaperStatus !== 'missing' && wallpaperStatus !== 'no_face')}
            onClick={onGoLiveClick}
          >
            {goLiveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
