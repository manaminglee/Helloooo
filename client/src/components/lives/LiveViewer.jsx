import { useEffect, useRef, useState } from 'react';
import { AudioIdentityGate, AudioName } from '../AudioIdentityGate';
import { NutsAmount, NutsSymbol } from '../NutsSymbol';
import { useLivesList, useLiveSession } from '../../hooks/useLiveStream';
import { useLiveKitLive } from '../../hooks/useLiveKitLive';
import { LiveGiftDrawer } from './LiveGiftDrawer';
import { isMobileLiveDevice } from '../../utils/liveDevice';
import { getCreatorSessionToken } from '../../utils/creatorAuth';

function LiveSlide({ live, socket, identity, identityHook, active, onBack }) {
  const videoRef = useRef(null);
  const inputRef = useRef(null);
  const [text, setText] = useState('');
  const [giftOpen, setGiftOpen] = useState(false);
  const [kbOffset, setKbOffset] = useState(0);
  const { comments, gifts, viewerCount, battle, ended, notice, sendComment, sendGift } = useLiveSession(
    active ? socket : null,
    active ? live.id : null,
  );
  const { connected, error } = useLiveKitLive({
    enabled: active && !ended,
    socket,
    liveId: live.id,
    asHost: false,
    videoElRef: videoRef,
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

  const onSubmit = (e) => {
    e.preventDefault();
    sendComment(text);
    setText('');
  };

  return (
    <div className="mm-live-slide">
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
          autoPlay
          muted={false}
        />
        <div className="mm-live-watermark" aria-hidden>
          @{identity?.username || 'guest'} · {live.id.slice(0, 6)}
        </div>
      </div>

      <header className="mm-live-slide__top">
        <button type="button" className="mm-live-icon-btn" onClick={onBack} aria-label="Back">←</button>
        <div className="mm-live-slide__host">
          <strong>@{live.handle}</strong>
          <span>{viewerCount} watching</span>
        </div>
        <NutsAmount amount={identity?.coins ?? 0} size={14} />
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
          <div key={c.id} className="mm-live-comment">
            <AudioName
              member={{
                audioUsername: c.username,
                nameColor: c.nameColor,
                levelBadge: c.levelBadge,
                displayLevel: c.displayLevel,
              }}
            />
            <span>{c.text}</span>
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

      {(ended || error) && (
        <div className="mm-live-slide__ended">
          {ended ? 'Live ended' : error}
          {!connected && !ended && <p className="text-xs mt-1 opacity-60">Connecting…</p>}
        </div>
      )}
      {notice && <div className="mm-live-toast">{notice}</div>}

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
        <button type="button" className="mm-live-icon-btn mm-live-icon-btn--gift" onClick={() => setGiftOpen(true)}>
          <NutsSymbol size={20} />
        </button>
        <button type="submit" className="mm-live-icon-btn" disabled={!text.trim()}>➤</button>
      </form>

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
  const { identity, isSignedIn, hydrating, loginFromCreator } = identityHook;
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
    if (isSignedIn || !creatorSession || hydrating) return undefined;
    let cancelled = false;
    setCreatorLinking(true);
    (async () => {
      const ok = await loginFromCreator?.();
      if (!cancelled) setCreatorLinking(false);
      if (ok) refresh?.();
    })();
    return () => { cancelled = true; };
  }, [isSignedIn, creatorSession, hydrating, loginFromCreator, refresh]);

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

  if (hydrating || creatorLinking || (creatorSession && !isSignedIn)) {
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
