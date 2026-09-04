import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioIdentityGate, AudioName } from '../AudioIdentityGate';
import { NutsAmount, NutsSymbol } from '../NutsSymbol';
import { useLivesList, useLiveSession } from '../../hooks/useLiveStream';
import { useLiveKitLive } from '../../hooks/useLiveKitLive';
import { LiveGiftDrawer } from './LiveGiftDrawer';
import { isMobileLiveDevice } from '../../utils/liveDevice';
import { getCreatorSessionToken } from '../../utils/creatorAuth';

function ConnectingOverlay({ label = 'Connecting…' }) {
  return (
    <div className="mm-live-connecting" aria-live="polite">
      <div className="mm-live-connecting__pulse" />
      <p>{label}</p>
      <span>Waiting for clear video & audio</span>
    </div>
  );
}

function UserActionSheet({ open, user, isHost, onClose, onMention, onDelete, onKick, onBlock }) {
  if (!open || !user) return null;
  return (
    <div className="mm-live-user-sheet" role="dialog" onClick={onClose}>
      <div className="mm-live-user-sheet__panel" onClick={(e) => e.stopPropagation()}>
        <p className="mm-live-user-sheet__name">@{user.username}</p>
        <button type="button" onClick={() => { onMention?.(user.username); onClose(); }}>
          Mention @{user.username}
        </button>
        {isHost && user.socketId && (
          <>
            {user.commentId && (
              <button type="button" onClick={() => { onDelete?.(user.commentId); onClose(); }}>
                Delete comment
              </button>
            )}
            <button type="button" className="warn" onClick={() => { onKick?.(user.socketId); onClose(); }}>
              Kick out
            </button>
            <button type="button" className="danger" onClick={() => { onBlock?.(user.socketId); onClose(); }}>
              Block user
            </button>
          </>
        )}
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function LiveSlide({ live, socket, identity, identityHook, active, onBack, isHostViewer = false }) {
  const videoRef = useRef(null);
  const inputRef = useRef(null);
  const [text, setText] = useState('');
  const [giftOpen, setGiftOpen] = useState(false);
  const [kbOffset, setKbOffset] = useState(0);
  const [sheetUser, setSheetUser] = useState(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const {
    comments, gifts, viewerCount, battle, ended, notice, kicked,
    sendComment, sendGift, deleteComment, kickUser, blockUser,
  } = useLiveSession(active ? socket : null, active ? live.id : null, { isHost: isHostViewer });

  const onClarityTimeout = useCallback(() => {
    // Viewers just leave; hosts end via studio path
    onBack?.();
  }, [onBack]);

  const { connected, hasMedia, connecting, error } = useLiveKitLive({
    enabled: active && !ended && !kicked,
    socket,
    liveId: live.id,
    asHost: false,
    videoElRef: videoRef,
    onClarityTimeout,
  });

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const onResize = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbOffset(offset);
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    onResize();
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
    };
  }, []);

  const unlockAudio = () => {
    setAudioUnlocked(true);
    document.querySelectorAll('audio').forEach((a) => {
      void a.play?.().catch(() => {});
    });
    const v = videoRef.current;
    if (v) void v.play?.().catch(() => {});
  };

  const onSubmit = (e) => {
    e.preventDefault();
    unlockAudio();
    const mentionMatch = text.match(/@([a-zA-Z0-9_]{2,30})/);
    sendComment(text, mentionMatch?.[1] || null);
    setText('');
  };

  const mentionUser = (username) => {
    const tag = `@${username} `;
    setText((t) => (t.includes(tag) ? t : `${tag}${t}`.slice(0, 120)));
    inputRef.current?.focus();
  };

  return (
    <div className="mm-live-slide" onClick={unlockAudio}>
      <div className="mm-live-slide__video-layer" aria-hidden={!active}>
        {live.wallpaperUrl && (
          <div
            className="mm-live-slide__wallpaper"
            style={{ backgroundImage: `url(${live.wallpaperUrl})` }}
          />
        )}
        <video
          ref={videoRef}
          className="mm-live-slide__video"
          playsInline
          webkit-playsinline="true"
          autoPlay
          muted
        />
        {(connecting || (!hasMedia && !ended && !error)) && (
          <ConnectingOverlay label={connected ? 'Improving clarity…' : 'Connecting…'} />
        )}
      </div>

      <header className="mm-live-slide__top">
        <div className="mm-live-slide__host-chip">
          <strong>@{live.handle}</strong>
          <span>{viewerCount} watching</span>
        </div>
        <div className="mm-live-slide__top-right">
          <NutsAmount amount={identity?.coins ?? 0} size={14} />
          <button type="button" className="mm-live-icon-btn" onClick={onBack} aria-label="Back">✕</button>
        </div>
      </header>

      {battle && (
        <div className="mm-live-battle-bar">
          <div className="mm-live-battle-bar__a" style={{ flex: Math.max(1, battle.scoreA) }}>
            @{battle.handleA} · {battle.scoreA}
          </div>
          <div className="mm-live-battle-bar__b" style={{ flex: Math.max(1, battle.scoreB) }}>
            @{battle.handleB} · {battle.scoreB}
          </div>
        </div>
      )}

      <div className="mm-live-comments">
        {comments.map((c) => (
          <div key={c.id} className={`mm-live-comment${c.mention ? ' mm-live-comment--mention' : ''}`}>
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
            <span>
              {c.mention ? <em className="mm-live-mention">@{c.mention} </em> : null}
              {c.text.replace(new RegExp(`^@${c.mention}\\s*`, 'i'), '')}
            </span>
          </div>
        ))}
      </div>

      <div className="mm-live-gift-fly">
        {gifts.map((g, i) => (
          <div key={`${g.at}-${i}`} className={`mm-live-gift-fly__item mm-live-gift-fly__item--${g.anim || 'basic'}`}>
            <span className="text-3xl">{g.gift?.icon}</span>
            <span>{g.from} sent {g.gift?.name}</span>
          </div>
        ))}
      </div>

      {(ended || kicked || error) && (
        <div className="mm-live-slide__ended">
          {kicked ? (notice || 'Removed from live') : ended ? 'Live ended' : error}
        </div>
      )}
      {notice && !kicked && <div className="mm-live-toast">{notice}</div>}
      {!audioUnlocked && hasMedia && (
        <button type="button" className="mm-live-tap-audio" onClick={unlockAudio}>
          Tap for sound
        </button>
      )}

      {!ended && !kicked && (
        <form
          className="mm-live-composer"
          style={{ transform: kbOffset ? `translateY(-${kbOffset}px)` : undefined }}
          onSubmit={onSubmit}
        >
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 120))}
            placeholder="Say something…"
            className="mm-live-composer__input"
            enterKeyHint="send"
          />
          <button type="button" className="mm-live-icon-btn mm-live-icon-btn--gift" onClick={() => { unlockAudio(); setGiftOpen(true); }}>
            <NutsSymbol size={20} />
          </button>
          <button type="submit" className="mm-live-icon-btn" disabled={!text.trim()}>➤</button>
        </form>
      )}

      <LiveGiftDrawer
        open={giftOpen}
        onClose={() => setGiftOpen(false)}
        nuts={identity?.coins ?? 0}
        battle={battle}
        onSend={(giftId, side) => {
          sendGift(giftId, side);
          identityHook?.refresh?.();
        }}
      />

      <UserActionSheet
        open={!!sheetUser}
        user={sheetUser}
        isHost={isHostViewer}
        onClose={() => setSheetUser(null)}
        onMention={mentionUser}
        onDelete={deleteComment}
        onKick={kickUser}
        onBlock={blockUser}
      />
    </div>
  );
}

/**
 * TikTok-style vertical swipe stack of lives — mobile only, fixed video layer.
 */
export default function LiveViewer({
  socket,
  identityHook,
  initialLiveId = null,
  onExit,
}) {
  const { identity, isSignedIn, hydrating, loginFromCreator, creatorLinkFailed } = identityHook;
  const { lives, loading, refresh } = useLivesList(10000);
  const [index, setIndex] = useState(0);
  const [creatorLinking, setCreatorLinking] = useState(false);
  const touchY = useRef(null);
  const creatorSession = !!getCreatorSessionToken();

  const ordered = useMemoLives(lives, initialLiveId);

  useEffect(() => {
    if (!initialLiveId || !ordered.length) return;
    const i = ordered.findIndex((l) => l.id === initialLiveId);
    if (i >= 0) setIndex(i);
  }, [initialLiveId, ordered]);

  useEffect(() => {
    if (isSignedIn || !creatorSession || hydrating || creatorLinkFailed) return undefined;
    let cancelled = false;
    setCreatorLinking(true);
    (async () => {
      const ok = await loginFromCreator?.();
      if (!cancelled) setCreatorLinking(false);
      if (ok) refresh?.();
    })();
    return () => { cancelled = true; };
  }, [isSignedIn, creatorSession, hydrating, loginFromCreator, refresh, creatorLinkFailed]);

  const onTouchStart = (e) => {
    touchY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e) => {
    if (touchY.current == null) return;
    const dy = e.changedTouches[0].clientY - touchY.current;
    touchY.current = null;
    if (Math.abs(dy) < 56) return;
    if (dy < 0 && index < ordered.length - 1) setIndex((i) => i + 1);
    if (dy > 0 && index > 0) setIndex((i) => i - 1);
  };

  if (!isMobileLiveDevice()) {
    return (
      <div className="mm-live-desktop-block">
        <p>Lives are mobile-only. Open this page on your phone.</p>
        <button type="button" className="mm-btn mm-btn--ghost mt-4" onClick={onExit}>Back</button>
      </div>
    );
  }

  if ((hydrating || creatorLinking) && !creatorLinkFailed && !isSignedIn) {
    return (
      <div className="mm-live-shell mm-live-shell--center">
        <p className="text-white/70 text-sm">Signing in with your creator account…</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <AudioIdentityGate
        variant="fullscreen"
        identityHook={identityHook}
        onCancel={onExit}
        onSignedIn={() => refresh()}
      />
    );
  }

  if (loading && !ordered.length) {
    return <div className="mm-live-shell mm-live-shell--center">Loading lives…</div>;
  }

  if (!ordered.length) {
    return (
      <div className="mm-live-shell mm-live-shell--center">
        <p>No creators are live right now.</p>
        <button type="button" className="mm-btn mm-btn--primary mt-4" onClick={refresh}>Refresh</button>
        <button type="button" className="mm-btn mm-btn--ghost mt-2" onClick={onExit}>Back</button>
      </div>
    );
  }

  const current = ordered[Math.min(index, ordered.length - 1)];

  return (
    <div
      className="mm-live-shell mm-live-nocapture"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <LiveSlide
        key={current.id}
        live={current}
        socket={socket}
        identity={identity}
        identityHook={identityHook}
        active
        onBack={onExit}
      />
      <div className="mm-live-swipe-hint" aria-hidden>Swipe for next live</div>
    </div>
  );
}

function useMemoLives(lives, initialLiveId) {
  return [...lives].sort((a, b) => {
    if (a.id === initialLiveId) return -1;
    if (b.id === initialLiveId) return 1;
    return (b.viewerCount || 0) - (a.viewerCount || 0);
  });
}
