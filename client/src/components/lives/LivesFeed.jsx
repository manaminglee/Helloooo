import { useEffect, useState } from 'react';
import { useLivesList } from '../../hooks/useLiveStream';
import { AudioIdentityGate } from '../AudioIdentityGate';
import { isMobileLiveDevice } from '../../utils/liveDevice';
import { getCreatorSessionToken } from '../../utils/creatorAuth';
import { useLiveBodyLock } from '../../hooks/useLiveViewport';
import { Avatar, compact } from './LiveBits';

function elapsed(startedAt) {
  const mins = Math.max(0, Math.round((Date.now() - (startedAt || Date.now())) / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function LiveCard({ live, onOpen }) {
  return (
    <button type="button" className="feed-card" onClick={() => onOpen(live.id)}>
      <div
        className="feed-card__thumb"
        style={live.wallpaperUrl ? { backgroundImage: `url(${live.wallpaperUrl})` } : undefined}
      >
        {!live.wallpaperUrl && (
          <Avatar className="feed-card__ghost" src={live.avatarUrl} name={live.handle} />
        )}
        <span className="feed-card__badge">
          <span className="live-badge-live__dot" />
          LIVE
        </span>
        <span className="feed-card__viewers">👥 {compact(live.viewerCount || 0)}</span>
        <span className="feed-card__time">{elapsed(live.startedAt)}</span>
      </div>

      <div className="feed-card__meta">
        <Avatar className="feed-card__avatar" src={live.avatarUrl} name={live.handle} />
        <span className="feed-card__text">
          <span className="feed-card__name">{live.displayName || live.handle}</span>
          <span className="feed-card__title">{live.title}</span>
        </span>
      </div>
    </button>
  );
}

/**
 * Discovery grid for active lives. Same visual language as the room, so the
 * transition into a stream does not feel like entering a different product.
 */
export default function LivesFeed({
  identityHook,
  onOpenLive,
  onExit,
  onGoLive,
  isCreator = false,
  canCreateLive = false,
}) {
  const { isSignedIn, hydrating, loginFromCreator, creatorLinkFailed } = identityHook;
  const { lives, loading, error, refresh, livekit } = useLivesList(6000);
  const [creatorLinking, setCreatorLinking] = useState(false);
  const showCreate = canCreateLive || isCreator;
  const creatorSession = !!getCreatorSessionToken();

  useLiveBodyLock();

  useEffect(() => {
    if (isSignedIn || !creatorSession || hydrating || creatorLinkFailed) return undefined;
    let cancelled = false;
    setCreatorLinking(true);
    (async () => {
      await loginFromCreator?.();
      if (!cancelled) setCreatorLinking(false);
    })();
    return () => { cancelled = true; };
  }, [isSignedIn, creatorSession, hydrating, loginFromCreator, creatorLinkFailed]);

  if (!isMobileLiveDevice()) {
    return (
      <div className="live-desktop-block">
        <p style={{ fontSize: 18, fontWeight: 800 }}>Lives are mobile-only</p>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, maxWidth: 300 }}>
          Open this page on your phone to watch and gift creators.
        </p>
        {showCreate && (
          <button type="button" className="live-btn live-btn--primary" onClick={onGoLive}>
            Open host studio
          </button>
        )}
        <button type="button" className="live-btn" onClick={onExit}>Back home</button>
      </div>
    );
  }

  if ((hydrating || creatorLinking) && !creatorLinkFailed && !isSignedIn) {
    return (
      <div className="live-desktop-block">
        <div className="live-state__spinner" />
        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14 }}>
          {creatorSession ? 'Signing in with your creator account…' : 'Restoring identity…'}
        </p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <AudioIdentityGate
        variant="fullscreen"
        identityHook={identityHook}
        onCancel={onExit}
        onSignedIn={refresh}
      />
    );
  }

  return (
    <div className="feed-root">
      <header className="feed-top">
        <button type="button" className="live-icon-btn" onClick={onExit} aria-label="Back">←</button>
        <div className="feed-top__title">
          <span className="feed-top__eyebrow">Live now</span>
          <h1 className="feed-top__h1">Lives</h1>
        </div>
        <button type="button" className="live-icon-btn" onClick={refresh} aria-label="Refresh">↻</button>
      </header>

      <div className="feed-body">
        {showCreate && (
          <button type="button" className="feed-golive" onClick={onGoLive}>
            <span className="feed-golive__dot" />
            Go Live
          </button>
        )}

        {!livekit?.enabled && (
          <p className="feed-warn">Streaming isn&apos;t configured on the server — playback may fail.</p>
        )}
        {error && <p className="feed-warn feed-warn--error">{error}</p>}

        {loading && !lives.length && (
          <div className="feed-empty"><div className="live-state__spinner" /></div>
        )}

        <div className="feed-grid">
          {lives.map((live) => (
            <LiveCard key={live.id} live={live} onOpen={onOpenLive} />
          ))}
        </div>

        {!loading && !lives.length && (
          <div className="feed-empty">
            <span style={{ fontSize: 40 }}>📡</span>
            <p style={{ fontSize: 15, fontWeight: 700 }}>No one is live yet</p>
            {showCreate && (
              <button type="button" className="live-btn live-btn--primary" onClick={onGoLive}>
                Be the first
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
