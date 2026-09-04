import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, ConnectionState } from 'livekit-client';

/**
 * Watch-only connection to an HP opponent's LiveKit room.
 *
 * During a battle both creators keep publishing to their own room; this opens
 * a second, subscribe-only session against the other one so the two cameras
 * can sit side by side. The token is minted by the server from its own battle
 * record and carries no publish rights, so this can never push media into
 * someone else's live.
 *
 * Audio stays muted here — the opponent's sound already reaches viewers
 * through whichever room they are actually watching, and doubling it up would
 * echo.
 */
export function useLiveKitOpponent({
  enabled = false,
  socket,
  liveId,
  battleId = null,
  videoElRef = null,
}) {
  const [connected, setConnected] = useState(false);
  const [hasMedia, setHasMedia] = useState(false);
  const [error, setError] = useState('');
  const roomRef = useRef(null);
  const videoElRefStable = useRef(videoElRef);
  videoElRefStable.current = videoElRef;

  const disconnect = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    try {
      const el = videoElRefStable.current?.current;
      if (el) { el.srcObject = null; }
    } catch { /* */ }
    try { await room?.disconnect(); } catch { /* */ }
    setConnected(false);
    setHasMedia(false);
  }, []);

  const disconnectRef = useRef(disconnect);
  disconnectRef.current = disconnect;

  useEffect(() => {
    if (!enabled || !socket || !liveId || !battleId) {
      void disconnectRef.current();
      return undefined;
    }
    let cancelled = false;

    (async () => {
      try {
        setError('');
        const tokenRes = await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('HP token timeout')), 10000);
          socket.emit('live:hp-token', { liveId }, (payload) => {
            clearTimeout(t);
            if (payload?.ok) resolve(payload);
            else reject(new Error(payload?.error || 'HP token failed'));
          });
        });
        if (cancelled) return;

        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;

        const attach = (track) => {
          if (track?.kind !== Track.Kind.Video && track?.kind !== 'video') return;
          const el = videoElRefStable.current?.current;
          if (!el) return;
          track.attach(el);
          el.muted = true;
          el.playsInline = true;
          el.setAttribute('playsinline', 'true');
          el.setAttribute('webkit-playsinline', 'true');
          void el.play?.().catch(() => {});
          setHasMedia(true);
        };

        room.on(RoomEvent.TrackSubscribed, attach);
        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          try { track.detach(); } catch { /* */ }
          setHasMedia(false);
        });
        room.on(RoomEvent.TrackUnmuted, (pub) => { if (pub?.track) attach(pub.track); });
        room.on(RoomEvent.ConnectionStateChanged, (state) => {
          if (cancelled) return;
          setConnected(state === ConnectionState.Connected);
        });

        await room.connect(tokenRes.url, tokenRes.token, { autoSubscribe: true });
        if (cancelled) { await room.disconnect(); return; }
        setConnected(true);

        room.remoteParticipants.forEach((p) => {
          p.trackPublications.forEach((pub) => { if (pub.track) attach(pub.track); });
        });
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load opponent');
        await disconnectRef.current();
      }
    })();

    return () => {
      cancelled = true;
      void disconnectRef.current();
    };
  }, [enabled, socket, liveId, battleId]);

  return { connected, hasMedia, error, disconnect };
}
