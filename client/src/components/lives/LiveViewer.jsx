import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioIdentityGate } from '../AudioIdentityGate';
import { useLivesList } from '../../hooks/useLiveStream';
import { isMobileLiveDevice } from '../../utils/liveDevice';
import { getCreatorSessionToken } from '../../utils/creatorAuth';
import LiveRoom from './LiveRoom';

const SWIPE_THRESHOLD = 64;

/**
 * Vertical swipe stack of lives.
 *
 * Only the active room is mounted: a live that is swiped away is torn down so
 * we never hold two LiveKit subscriptions (and two decoders) at once — that is
 * what keeps the feed smooth on mid-range Android.
 */
export default function LiveViewer({ socket, identityHook, initialLiveId = null, onExit }) {
  const { identity, isSignedIn, hydrating, loginFromCreator, creatorLinkFailed } = identityHook;
  const { lives, loading, refresh } = useLivesList(10000);
  const [index, setIndex] = useState(0);
  const [creatorLinking, setCreatorLinking] = useState(false);
  const touch = useRef(null);
  const creatorSession = !!getCreatorSessionToken();

  const ordered = useMemo(() => (
    [...lives].sort((a, b) => {
      if (a.id === initialLiveId) return -1;
      if (b.id === initialLiveId) return 1;
      return (b.viewerCount || 0) - (a.viewerCount || 0);
    })
  ), [lives, initialLiveId]);

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

  const onTouchStart = useCallback((e) => {
    touch.current = { y: e.touches[0].clientY, t: Date.now() };
  }, []);

  const onTouchEnd = useCallback((e) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    // Ignore anything that started on a control — sheets and the comment list
    // handle their own gestures.
    if (e.target?.closest?.('[data-interactive], button, input, .live-sheet')) return;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dy) < SWIPE_THRESHOLD) return;
    setIndex((i) => {
      if (dy < 0) return Math.min(i + 1, ordered.length - 1);
      return Math.max(i - 1, 0);
    });
  }, [ordered.length]);

  if (!isMobileLiveDevice()) {
    return (
      <div className="live-desktop-block">
        <p style={{ fontSize: 17, fontWeight: 800 }}>Lives are mobile-only</p>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>
          Open this page on your phone to watch and gift creators.
        </p>
        <button type="button" className="live-btn" onClick={onExit}>Back</button>
      </div>
    );
  }

  if ((hydrating || creatorLinking) && !creatorLinkFailed && !isSignedIn) {
    return (
      <div className="live-desktop-block">
        <div className="live-state__spinner" />
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>
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
        onSignedIn={() => refresh()}
      />
    );
  }

  if (loading && !ordered.length) {
    return (
      <div className="live-desktop-block">
        <div className="live-state__spinner" />
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Loading lives…</p>
      </div>
    );
  }

  if (!ordered.length) {
    return (
      <div className="live-desktop-block">
        <p style={{ fontSize: 17, fontWeight: 800 }}>No one is live right now</p>
        <button type="button" className="live-btn live-btn--primary" onClick={refresh}>Refresh</button>
        <button type="button" className="live-btn" onClick={onExit}>Back</button>
      </div>
    );
  }

  const current = ordered[Math.min(index, ordered.length - 1)];

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <LiveRoom
        key={current.id}
        socket={socket}
        live={current}
        mode="viewer"
        identity={identity}
        identityHook={identityHook}
        onExit={onExit}
      />
    </div>
  );
}
