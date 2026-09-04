import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, createLocalTracks } from 'livekit-client';

/**
 * Subscribe to (or publish) an in-app live via LiveKit.
 */
export function useLiveKitLive({
  enabled = false,
  socket,
  liveId,
  asHost = false,
  videoElRef = null,
}) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const roomRef = useRef(null);
  const localTracksRef = useRef([]);

  const disconnect = useCallback(async () => {
    try {
      localTracksRef.current.forEach((t) => {
        try { t.stop(); } catch { /* */ }
      });
    } catch { /* */ }
    localTracksRef.current = [];
    try { await roomRef.current?.disconnect(); } catch { /* */ }
    roomRef.current = null;
    setConnected(false);
  }, []);

  useEffect(() => {
    if (!enabled || !socket || !liveId) {
      disconnect();
      return undefined;
    }
    let cancelled = false;

    (async () => {
      try {
        setError('');
        const tokenRes = await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('Live token timeout')), 8000);
          socket.emit('live:token', { liveId, asHost }, (payload) => {
            clearTimeout(t);
            if (payload?.ok) resolve(payload);
            else reject(new Error(payload?.error || 'Token failed'));
          });
        });
        if (cancelled) return;

        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;

        const attachRemote = (track, participant) => {
          if (track.kind !== Track.Kind.Video && track.kind !== Track.Kind.Audio) return;
          const el = videoElRef?.current;
          if (track.kind === Track.Kind.Video && el) {
            track.attach(el);
            el.playsInline = true;
            el.setAttribute('playsinline', 'true');
            el.muted = asHost;
            void el.play?.().catch(() => {});
          } else if (track.kind === Track.Kind.Audio && !asHost) {
            const audio = track.attach();
            audio.autoplay = true;
            audio.style.display = 'none';
            document.body.appendChild(audio);
          }
        };

        room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          attachRemote(track, participant);
        });
        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach().forEach((el) => el.remove());
        });

        await room.connect(tokenRes.url, tokenRes.token);
        if (cancelled) {
          await room.disconnect();
          return;
        }

        if (asHost) {
          const tracks = await createLocalTracks({ audio: true, video: { facingMode: 'user' } });
          localTracksRef.current = tracks;
          for (const track of tracks) {
            await room.localParticipant.publishTrack(track);
            if (track.kind === 'video' && videoElRef?.current) {
              track.attach(videoElRef.current);
              videoElRef.current.muted = true;
              videoElRef.current.playsInline = true;
            }
          }
        } else {
          room.remoteParticipants.forEach((p) => {
            p.trackPublications.forEach((pub) => {
              if (pub.track) attachRemote(pub.track, p);
            });
          });
        }

        setConnected(true);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Live connect failed');
        await disconnect();
      }
    })();

    return () => {
      cancelled = true;
      disconnect();
    };
  }, [enabled, socket, liveId, asHost, videoElRef, disconnect]);

  return { connected, error, disconnect };
}
