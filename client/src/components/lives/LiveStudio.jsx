import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../config/apiBase';
import { getCreatorAuthHeaders, getCreatorSessionToken } from '../../utils/creatorAuth';
import { useLiveKitLive } from '../../hooks/useLiveKitLive';
import { useLiveSession } from '../../hooks/useLiveStream';
import CreatorVerifyModal from '../CreatorVerifyModal';
import { emitCreatorAuth } from '../../hooks/useSocket';
import { AudioName } from '../AudioIdentityGate';

function validateLiveTitle(raw) {
  const t = String(raw || '').trim();
  if (!t) return { ok: true, title: '' };
  if (t.length < 2) return { ok: false, error: 'Title is too short.' };
  if (t.length > 80) return { ok: false, error: 'Title max 80 characters.' };
  return { ok: true, title: t };
}

/**
 * Creator go-live studio — mirrored camera, handle badge, host moderation.
 */
export default function LiveStudio({
  socket,
  onExit,
  onStarted,
  creatorsHook = null,
}) {
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  const [title, setTitle] = useState('');
  const [wallpaperUrl, setWallpaperUrl] = useState('');
  const [liveId, setLiveId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needLogin, setNeedLogin] = useState(!getCreatorSessionToken());
  const [creatorHandle, setCreatorHandle] = useState('');
  const [text, setText] = useState('');
  const [sheetUser, setSheetUser] = useState(null);

  const endLiveHttp = useCallback(async (id) => {
    if (!id) return;
    try {
      await fetch(`${API_BASE}/api/lives/${id}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCreatorAuthHeaders() },
        credentials: 'include',
      });
    } catch { /* */ }
  }, []);

  const onClarityTimeout = useCallback(() => {
    const id = liveId;
    setError('No clear video/audio for 20s — ending live');
    void endLiveHttp(id);
    setLiveId(null);
    setTimeout(() => onExit?.(), 1200);
  }, [liveId, endLiveHttp, onExit]);

  const { connected, hasMedia, connecting, error: mediaError } = useLiveKitLive({
    enabled: !!liveId,
    socket,
    liveId,
    asHost: true,
    videoElRef: videoRef,
    mirrorLocal: true,
    onClarityTimeout,
  });

  const {
    comments, viewerCount, notice,
    sendComment, deleteComment, kickUser, blockUser,
  } = useLiveSession(liveId ? socket : null, liveId, { isHost: true });

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
    const onEnded = ({ liveId: id }) => {
      if (id === liveId) {
        setLiveId(null);
        setError('Live ended.');
      }
    };
    socket.on('live:ended', onEnded);
    return () => socket.off('live:ended', onEnded);
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
    await endLiveHttp(liveId);
    setLiveId(null);
    setBusy(false);
    onExit?.();
  };

  const mentionUser = (username) => {
    const tag = `@${username} `;
    setText((t) => (t.includes(tag) ? t : `${tag}${t}`.slice(0, 120)));
    inputRef.current?.focus();
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
        {wallpaperUrl && !hasMedia && (
          <div className="mm-live-slide__wallpaper" style={{ backgroundImage: `url(${wallpaperUrl})` }} />
        )}
        <video
          ref={videoRef}
          className="mm-live-slide__video mm-live-slide__video--mirror"
          playsInline
          muted
          autoPlay
        />
        {liveId && connecting && (
          <div className="mm-live-connecting">
            <div className="mm-live-connecting__pulse" />
            <p>{connected ? 'Improving clarity…' : 'Going live…'}</p>
            <span>Ends automatically if no clear feed in 20s</span>
          </div>
        )}
      </div>

      {/* Handle top-left */}
      <div className="mm-live-studio__host-badge">
        <strong>@{creatorHandle || 'creator'}</strong>
        {liveId ? (
          <span className="mm-live-studio__live-dot">LIVE · {viewerCount}</span>
        ) : (
          <span>Preview</span>
        )}
      </div>

      <button type="button" className="mm-live-studio__close" onClick={end} aria-label="Close">✕</button>

      {!liveId ? (
        <div className="mm-live-studio__panel">
          <h1 className="text-white font-black text-sm mb-3">Create Live</h1>
          <div className="space-y-3">
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
          </div>
        </div>
      ) : (
        <>
          <div className="mm-live-comments mm-live-comments--host">
            {comments.map((c) => (
              <div key={c.id} className="mm-live-comment">
                <button
                  type="button"
                  className="mm-live-comment__user"
                  onClick={() => setSheetUser({
                    username: c.username,
                    socketId: c.socketId,
                    commentId: c.id,
                  })}
                >
                  <AudioName
                    member={{
                      audioUsername: c.username,
                      nameColor: c.nameColor,
                      levelBadge: c.levelBadge,
                      displayLevel: c.displayLevel,
                    }}
                  />
                </button>
                <span>{c.text}</span>
              </div>
            ))}
          </div>

          <form
            className="mm-live-composer"
            onSubmit={(e) => {
              e.preventDefault();
              const m = text.match(/@([a-zA-Z0-9_]{2,30})/);
              sendComment(text, m?.[1] || null);
              setText('');
            }}
          >
            <input
              ref={inputRef}
              className="mm-live-composer__input"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 120))}
              placeholder="Reply or @mention…"
            />
            <button type="submit" className="mm-live-icon-btn" disabled={!text.trim()}>➤</button>
            <button type="button" className="mm-live-icon-btn mm-live-icon-btn--end" onClick={end} disabled={busy}>
              End
            </button>
          </form>

          {(error || mediaError || notice) && (
            <div className="mm-live-toast">{error || mediaError || notice}</div>
          )}

          {sheetUser && (
            <div className="mm-live-user-sheet" onClick={() => setSheetUser(null)}>
              <div className="mm-live-user-sheet__panel" onClick={(e) => e.stopPropagation()}>
                <p className="mm-live-user-sheet__name">@{sheetUser.username}</p>
                <button type="button" onClick={() => { mentionUser(sheetUser.username); setSheetUser(null); }}>
                  Mention @{sheetUser.username}
                </button>
                <button type="button" onClick={() => { deleteComment(sheetUser.commentId); setSheetUser(null); }}>
                  Delete comment
                </button>
                {sheetUser.socketId && (
                  <>
                    <button type="button" className="warn" onClick={() => { kickUser(sheetUser.socketId); setSheetUser(null); }}>
                      Kick out
                    </button>
                    <button type="button" className="danger" onClick={() => { blockUser(sheetUser.socketId); setSheetUser(null); }}>
                      Block user
                    </button>
                  </>
                )}
                <button type="button" className="ghost" onClick={() => setSheetUser(null)}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
