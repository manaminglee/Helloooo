import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, createLocalTracks, ConnectionState } from 'livekit-client';

const CLARITY_TIMEOUT_MS = 20_000;

/**
 * Subscribe to (or publish) an in-app live via LiveKit.
 * Exposes media readiness for connecting UI + auto-end after clarity timeout.
 */
export function useLiveKitLive({
  enabled = false,
  socket,
  liveId,
  asHost = false,
  videoElRef = null,
  mirrorLocal = false,
  onClarityTimeout = null,
}) {
  const [connected, setConnected] = useState(false);
  const [hasMedia, setHasMedia] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const roomRef = useRef(null);
  const localTracksRef = useRef([]);
  const remoteAudioElsRef = useRef([]);
  const clarityTimerRef = useRef(null);
  const hasMediaRef = useRef(false);

  const clearRemoteAudio = useCallback(() => {
    remoteAudioElsRef.current.forEach((el) => {
      try {
        el.pause();
        el.srcObject = null;
        el.remove();
      } catch { /* */ }
    });
    remoteAudioElsRef.current = [];
  }, []);

  const disconnect = useCallback(async () => {
    if (clarityTimerRef.current) {
      clearTimeout(clarityTimerRef.current);
      clarityTimerRef.current = null;
    }
    hasMediaRef.current = false;
    try {
      localTracksRef.current.forEach((t) => {
        try { t.stop(); } catch { /* */ }
      });
    } catch { /* */ }
    localTracksRef.current = [];
    clearRemoteAudio();
    try { await roomRef.current?.disconnect(); } catch { /* */ }
    roomRef.current = null;
    setConnected(false);
    setHasMedia(false);
    setConnecting(false);
  }, [clearRemoteAudio]);

  const markMedia = useCallback(() => {
    hasMediaRef.current = true;
    setHasMedia(true);
    setConnecting(false);
    if (clarityTimerRef.current) {
      clearTimeout(clarityTimerRef.current);
      clarityTimerRef.current = null;
    }
  }, []);

  const startClarityWatch = useCallback(() => {
    if (clarityTimerRef.current) clearTimeout(clarityTimerRef.current);
    setConnecting(true);
    clarityTimerRef.current = setTimeout(() => {
      if (hasMediaRef.current) return;
      setError('Connection too weak — ending live');
      setConnecting(false);
      onClarityTimeout?.();
    }, CLARITY_TIMEOUT_MS);
  }, [onClarityTimeout]);

  useEffect(() => {
    if (!enabled || !socket || !liveId) {
      disconnect();
      return undefined;
    }
    let cancelled = false;

    (async () => {
      try {
        setError('');
        setConnecting(true);
        setHasMedia(false);
        hasMediaRef.current = false;

        const tokenRes = await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('Live token timeout')), 10000);
          socket.emit('live:token', { liveId, asHost }, (payload) => {
            clearTimeout(t);
            if (payload?.ok) resolve(payload);
            else reject(new Error(payload?.error || 'Token failed'));
          });
        });
        if (cancelled) return;

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          // Prefer higher clarity when available
          videoCaptureDefaults: asHost
            ? { facingMode: 'user', resolution: { width: 720, height: 1280, frameRate: 30 } }
            : undefined,
        });
        roomRef.current = room;

        const attachRemoteVideo = (track) => {
          const el = videoElRef?.current;
          if (!el) return;
          track.attach(el);
          el.playsInline = true;
          el.setAttribute('playsinline', 'true');
          el.setAttribute('webkit-playsinline', 'true');
          // Keep video element muted for autoplay; audio comes from dedicated elements
          el.muted = true;
          el.autoplay = true;
          void el.play?.().catch(() => {});
          markMedia();
        };

        const attachRemoteAudio = (track) => {
          if (asHost) return;
          const audio = track.attach();
          audio.autoplay = true;
          audio.playsInline = true;
          audio.setAttribute('playsinline', 'true');
          audio.muted = false;
          audio.volume = 1;
          audio.style.position = 'fixed';
          audio.style.width = '1px';
          audio.style.height = '1px';
          audio.style.opacity = '0';
          audio.style.pointerEvents = 'none';
          document.body.appendChild(audio);
          remoteAudioElsRef.current.push(audio);
          const tryPlay = () => {
            void audio.play?.().catch(() => {});
          };
          tryPlay();
          // Unlock on first user gesture (iOS/Android autoplay policy)
          const unlock = () => {
            tryPlay();
            window.removeEventListener('touchstart', unlock);
            window.removeEventListener('click', unlock);
          };
          window.addEventListener('touchstart', unlock, { once: true, passive: true });
          window.addEventListener('click', unlock, { once: true });
          markMedia();
        };

        const attachRemote = (track) => {
          const kind = track?.kind;
          if (kind === Track.Kind.Video || kind === 'video') attachRemoteVideo(track);
          else if (kind === Track.Kind.Audio || kind === 'audio') attachRemoteAudio(track);
        };

        const recheckRemoteMedia = () => {
          if (asHost) return;
          let any = false;
          room.remoteParticipants.forEach((p) => {
            p.trackPublications.forEach((pub) => {
              if (pub.track && !pub.isMuted) any = true;
            });
          });
          if (any) {
            markMedia();
          } else {
            hasMediaRef.current = false;
            setHasMedia(false);
            startClarityWatch();
          }
        };

        room.on(RoomEvent.TrackSubscribed, (track) => {
          attachRemote(track);
        });
        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach().forEach((el) => {
            try { el.remove(); } catch { /* */ }
          });
          recheckRemoteMedia();
        });
        room.on(RoomEvent.TrackMuted, () => recheckRemoteMedia());
        room.on(RoomEvent.TrackUnmuted, (pub) => {
          if (pub?.track) attachRemote(pub.track);
          recheckRemoteMedia();
        });
        room.on(RoomEvent.ConnectionStateChanged, (state) => {
          if (state === ConnectionState.Connected) setConnected(true);
          if (state === ConnectionState.Disconnected && !cancelled) {
            setConnected(false);
            hasMediaRef.current = false;
            setHasMedia(false);
            startClarityWatch();
          }
        });

        await room.connect(tokenRes.url, tokenRes.token, {
          autoSubscribe: true,
        });
        if (cancelled) {
          await room.disconnect();
          return;
        }
        setConnected(true);
        startClarityWatch();

        if (asHost) {
          const tracks = await createLocalTracks({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: {
              facingMode: 'user',
              resolution: { width: 720, height: 1280, frameRate: 30 },
            },
          });
          if (cancelled) {
            tracks.forEach((t) => t.stop());
            return;
          }
          localTracksRef.current = tracks;
          for (const track of tracks) {
            const isVideo = track.kind === Track.Kind.Video || track.kind === 'video';
            await room.localParticipant.publishTrack(track, {
              source: isVideo ? Track.Source.Camera : Track.Source.Microphone,
            });
            if (isVideo && videoElRef?.current) {
              track.attach(videoElRef.current);
              const el = videoElRef.current;
              el.muted = true;
              el.playsInline = true;
              el.setAttribute('playsinline', 'true');
              if (mirrorLocal) el.style.transform = 'scaleX(-1)';
              void el.play?.().catch(() => {});
              markMedia();
            }
          }
          // Host needs clear cam+mic; if publish succeeded, media is ready
          if (tracks.length) markMedia();
        } else {
          room.remoteParticipants.forEach((p) => {
            p.trackPublications.forEach((pub) => {
              if (pub.track) attachRemote(pub.track);
            });
          });
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Live connect failed');
          setConnecting(false);
        }
        await disconnect();
      }
    })();

    return () => {
      cancelled = true;
      disconnect();
    };
  }, [enabled, socket, liveId, asHost, videoElRef, mirrorLocal, disconnect, markMedia, startClarityWatch]);

  return {
    connected,
    hasMedia,
    connecting: connecting && !hasMedia,
    error,
    disconnect,
  };
}
