import { useEffect, useState } from 'react';
import { useLivesList } from '../../hooks/useLiveStream';
import { AudioIdentityGate } from '../AudioIdentityGate';
import { NutsSymbol } from '../NutsSymbol';
import { isMobileLiveDevice } from '../../utils/liveDevice';

/**
 * Discovery page for active in-app lives.
 */
export default function LivesFeed({
  identityHook,
  onOpenLive,
  onExit,
  onGoLive,
  isCreator = false,
}) {
  const { isSignedIn } = identityHook;
  const { lives, loading, error, refresh, livekit } = useLivesList(6000);
  const [gate, setGate] = useState(false);

  useEffect(() => {
    document.body.classList.add('mm-lives-mode');
    return () => document.body.classList.remove('mm-lives-mode');
  }, []);

  if (!isMobileLiveDevice()) {
    return (
      <div className="mm-live-desktop-block">
        <NutsSymbol size={40} />
        <h1 className="mm-h2 mt-4 text-white">Lives are mobile-only</h1>
        <p className="mm-body mt-2">Open Helloooo on your phone to watch and gift creators.</p>
        <button type="button" className="mm-btn mm-btn--ghost mt-6" onClick={onExit}>Back home</button>
      </div>
    );
  }

  if (!isSignedIn || gate) {
    return (
      <AudioIdentityGate
        variant="fullscreen"
        identityHook={identityHook}
        onCancel={onExit}
        onSignedIn={() => setGate(false)}
      />
    );
  }

  return (
    <div className="mm-lives-feed">
      <header className="mm-lives-feed__hero">
        <button type="button" className="mm-live-icon-btn" onClick={onExit} aria-label="Back">←</button>
        <div>
          <p className="mm-eyebrow">Live now</p>
          <h1 className="mm-h2 text-white mt-1">Lives</h1>
        </div>
        <button type="button" className="mm-btn mm-btn--ghost text-xs" onClick={refresh}>↻</button>
      </header>

      {isCreator && (
        <button type="button" className="mm-lives-go-live" onClick={onGoLive}>
          <span className="mm-lives-go-live__dot" /> Go Live
        </button>
      )}

      {!livekit?.enabled && (
        <p className="mm-lives-feed__warn">LiveKit is not configured on the server — streams may not play.</p>
      )}
      {error && <p className="mm-audio-id-error px-4">{error}</p>}
      {loading && !lives.length && <p className="text-white/40 text-center py-10">Loading…</p>}

      <div className="mm-lives-feed__grid">
        {lives.map((live) => (
          <button
            key={live.id}
            type="button"
            className="mm-lives-card"
            onClick={() => onOpenLive(live.id)}
          >
            <div
              className="mm-lives-card__thumb"
              style={live.wallpaperUrl ? { backgroundImage: `url(${live.wallpaperUrl})` } : undefined}
            >
              <span className="mm-lives-card__live">LIVE</span>
              <span className="mm-lives-card__viewers">{live.viewerCount || 0}</span>
            </div>
            <div className="mm-lives-card__meta">
              <strong>@{live.handle}</strong>
              <span>{live.title}</span>
            </div>
          </button>
        ))}
      </div>

      {!loading && !lives.length && (
        <div className="text-center py-16 text-white/45">
          <p>No one is live yet.</p>
          {isCreator && (
            <button type="button" className="mm-btn mm-btn--primary mt-4" onClick={onGoLive}>
              Be the first — Go Live
            </button>
          )}
        </div>
      )}
    </div>
  );
}
