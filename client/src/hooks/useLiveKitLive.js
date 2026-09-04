import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, createLocalTracks, ConnectionState } from 'livekit-client';
import { drawFaceProcessedFrame, loadFaceLandmarker } from '../utils/faceBlurEngine';

const CLARITY_TIMEOUT_MS = 20_000;

/**
 * Subscribe to (or publish) an in-app live via LiveKit.
 * Exposes media readiness for connecting UI + auto-end after clarity timeout.
 * Hosts can enable MediaPipe beauty on the published camera track.
 *
 * Connection effect deps are intentionally narrow — including callback
 * identities previously caused connect↔disconnect loops on iOS Safari.
 */
export function useLiveKitLive({
  enabled = false,
  socket,
  liveId,
  asHost = false,
  asGuest = false,
  videoElRef = null,
  mirrorLocal = false,
  beautyEnabled = true,
  onClarityTimeout = null,
}) {
  const [connected, setConnected] = useState(false);
  const [hasMedia, setHasMedia] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [facingMode, setFacingMode] = useState('user');
  const roomRef = useRef(null);
  const facingRef = useRef('user');
  const localTracksRef = useRef([]);
  const remoteAudioElsRef = useRef([]);
  const clarityTimerRef = useRef(null);
  const hasMediaRef = useRef(false);
  const beautyRafRef = useRef(0);
  const beautyCleanupRef = useRef(null);

  const beautyEnabledRef = useRef(beautyEnabled);
  beautyEnabledRef.current = beautyEnabled;
  const mirrorLocalRef = useRef(mirrorLocal);
  mirrorLocalRef.current = mirrorLocal;
  const onClarityTimeoutRef = useRef(onClarityTimeout);
  onClarityTimeoutRef.current = onClarityTimeout;
  const videoElRefStable = useRef(videoElRef);
  videoElRefStable.current = videoElRef;

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

  const stopBeautyPipeline = useCallback(() => {
    if (beautyRafRef.current) cancelAnimationFrame(beautyRafRef.current);
    beautyRafRef.current = 0;
    try { beautyCleanupRef.current?.(); } catch { /* */ }
    beautyCleanupRef.current = null;
  }, []);

  const disconnect = useCallback(async () => {
    if (clarityTimerRef.current) {
      clearTimeout(clarityTimerRef.current);
      clarityTimerRef.current = null;
    }
    stopBeautyPipeline();
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
  }, [clearRemoteAudio, stopBeautyPipeline]);

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
      onClarityTimeoutRef.current?.();
    }, CLARITY_TIMEOUT_MS);
  }, []);

  const disconnectRef = useRef(disconnect);
  disconnectRef.current = disconnect;
  const markMediaRef = useRef(markMedia);
  markMediaRef.current = markMedia;
  const startClarityWatchRef = useRef(startClarityWatch);
  startClarityWatchRef.current = startClarityWatch;

  useEffect(() => {
    if (!enabled || !socket || !liveId) {
      void disconnectRef.current();
      return undefined;
    }
    let cancelled = false;

    (async () => {
      try {
        setError('');
        setConnecting(true);
        setHasMedia(false);
        hasMediaRef.current = false;

        const requestToken = () => new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('Live token timeout')), 10000);
          socket.emit('live:token', { liveId, asHost, asGuest }, (payload) => {
            clearTimeout(t);
            if (payload?.ok) resolve(payload);
            else {
              const err = new Error(payload?.error || 'Token failed');
              err.retryable = !!payload?.retryable;
              reject(err);
            }
          });
        });

        let tokenRes = null;
        for (let attempt = 0; attempt < 4; attempt += 1) {
          try {
            tokenRes = await requestToken();
            break;
          } catch (err) {
            if (!err.retryable || attempt === 3 || cancelled) throw err;
            await new Promise((r) => setTimeout(r, 400 + attempt * 600));
          }
        }
        if (!tokenRes) throw new Error('Could not get a live token');
        if (cancelled) return;

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          videoCaptureDefaults: asHost
            ? { facingMode: 'user', resolution: { width: 720, height: 1280, frameRate: 24 } }
            : undefined,
        });
        roomRef.current = room;

        const mark = () => markMediaRef.current();
        const watch = () => startClarityWatchRef.current();
        const vRef = videoElRefStable.current;
        const mirror = mirrorLocalRef.current;

        const attachRemoteVideo = (track) => {
          const el = vRef?.current;
          if (!el) return;
          track.attach(el);
          el.playsInline = true;
          el.setAttribute('playsinline', 'true');
          el.setAttribute('webkit-playsinline', 'true');
          el.muted = true;
          el.autoplay = true;
          void el.play?.().catch(() => {});
          mark();
        };

        const attachRemoteAudio = (track) => {
          if (asHost) return;
          const audio = track.attach();
          audio.autoplay = true;
          audio.playsInline = true;
          audio.setAttribute('playsinline', 'true');
          audio.setAttribute('webkit-playsinline', 'true');
          audio.muted = false;
          audio.volume = 1;
          audio.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
          document.body.appendChild(audio);
          remoteAudioElsRef.current.push(audio);
          const tryPlay = () => { void audio.play?.().catch(() => {}); };
          tryPlay();
          const unlock = () => {
            tryPlay();
            window.removeEventListener('touchstart', unlock);
            window.removeEventListener('click', unlock);
          };
          window.addEventListener('touchstart', unlock, { once: true, passive: true });
          window.addEventListener('click', unlock, { once: true });
          mark();
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
          if (any) mark();
          else {
            hasMediaRef.current = false;
            setHasMedia(false);
            watch();
          }
        };

        room.on(RoomEvent.TrackSubscribed, (track) => attachRemote(track));
        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach().forEach((el) => { try { el.remove(); } catch { /* */ } });
          recheckRemoteMedia();
        });
        room.on(RoomEvent.TrackMuted, () => recheckRemoteMedia());
        room.on(RoomEvent.TrackUnmuted, (pub) => {
          if (pub?.track) attachRemote(pub.track);
          recheckRemoteMedia();
        });
        room.on(RoomEvent.ConnectionStateChanged, (state) => {
          if (cancelled) return;
          if (state === ConnectionState.Connected) {
            setConnected(true);
            return;
          }
          if (state === ConnectionState.Reconnecting) {
            setConnected(false);
            setConnecting(true);
            return;
          }
          // Soft disconnect — LiveKit may recover. Do not remount this effect.
          if (state === ConnectionState.Disconnected) setConnected(false);
        });

        await room.connect(tokenRes.url, tokenRes.token, { autoSubscribe: true });
        if (cancelled) {
          await room.disconnect();
          return;
        }
        setConnected(true);
        watch();

        if (asHost || asGuest) {
          // Let Safari finish releasing the studio preview camera handle.
          await new Promise((r) => setTimeout(r, 150));
          if (cancelled) return;

          const tracks = await createLocalTracks({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: {
              facingMode: facingRef.current,
              resolution: { width: 720, height: 1280, frameRate: 24 },
            },
          });
          if (cancelled) {
            tracks.forEach((t) => t.stop());
            return;
          }

          const audioTrack = tracks.find((t) => t.kind === Track.Kind.Audio || t.kind === 'audio');
          const videoTrack = tracks.find((t) => t.kind === Track.Kind.Video || t.kind === 'video');
          localTracksRef.current = tracks.filter(Boolean);

          if (audioTrack) {
            await room.localParticipant.publishTrack(audioTrack, { source: Track.Source.Microphone });
          }

          let publishVideo = videoTrack;
          if (videoTrack && beautyEnabledRef.current) {
            try {
              const landmarker = await loadFaceLandmarker();
              const rawMsTrack = videoTrack.mediaStreamTrack;
              const hidden = document.createElement('video');
              hidden.playsInline = true;
              hidden.muted = true;
              hidden.autoplay = true;
              hidden.setAttribute('playsinline', '');
              hidden.setAttribute('webkit-playsinline', 'true');
              hidden.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;left:-9999px';
              document.body.appendChild(hidden);
              hidden.srcObject = new MediaStream([rawMsTrack]);
              await hidden.play().catch(() => {});

              const canvas = document.createElement('canvas');
              const blurCanvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d', { alpha: false });
              const blurCtx = blurCanvas.getContext('2d', { alpha: false });
              const outStream = canvas.captureStream(24);
              const beautyMsTrack = outStream.getVideoTracks()[0];

              const loop = () => {
                if (hidden.readyState >= 2) {
                  drawFaceProcessedFrame(
                    ctx,
                    blurCtx,
                    hidden,
                    landmarker,
                    false,
                    performance.now(),
                    'beauty',
                  );
                }
                beautyRafRef.current = requestAnimationFrame(loop);
              };
              beautyRafRef.current = requestAnimationFrame(loop);
              beautyCleanupRef.current = () => {
                cancelAnimationFrame(beautyRafRef.current);
                beautyRafRef.current = 0;
                try { hidden.srcObject = null; hidden.remove(); } catch { /* */ }
                try { beautyMsTrack.stop(); } catch { /* */ }
              };

              await room.localParticipant.publishTrack(beautyMsTrack, {
                source: Track.Source.Camera,
                name: 'beauty-cam',
              });
              publishVideo = null;
              if (vRef?.current) {
                const el = vRef.current;
                el.srcObject = outStream;
                el.muted = true;
                el.playsInline = true;
                el.setAttribute('playsinline', 'true');
                el.setAttribute('webkit-playsinline', 'true');
                if (mirror && facingRef.current === 'user') el.style.transform = 'scaleX(-1)';
                void el.play?.().catch(() => {});
              }
            } catch {
              publishVideo = videoTrack;
            }
          }

          if (publishVideo) {
            await room.localParticipant.publishTrack(publishVideo, {
              source: Track.Source.Camera,
            });
            if (vRef?.current) {
              publishVideo.attach(vRef.current);
              const el = vRef.current;
              el.muted = true;
              el.playsInline = true;
              el.setAttribute('playsinline', 'true');
              el.setAttribute('webkit-playsinline', 'true');
              if (mirror && facingRef.current === 'user') el.style.transform = 'scaleX(-1)';
              void el.play?.().catch(() => {});
            }
          }
          mark();
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
        await disconnectRef.current();
      }
    })();

    return () => {
      cancelled = true;
      void disconnectRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, socket, liveId, asHost, asGuest]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room?.localParticipant) return micEnabled;
    const next = !micEnabled;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicEnabled(next);
      return next;
    } catch {
      return micEnabled;
    }
  }, [micEnabled]);

  const toggleCam = useCallback(async () => {
    const room = roomRef.current;
    if (!room?.localParticipant) return camEnabled;
    const next = !camEnabled;
    try {
      await room.localParticipant.setCameraEnabled(next);
      setCamEnabled(next);
      return next;
    } catch {
      return camEnabled;
    }
  }, [camEnabled]);

  const switchCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room?.localParticipant) return;
    const next = facingRef.current === 'user' ? 'environment' : 'user';
    try {
      const oldTrack = localTracksRef.current.find(
        (t) => t.kind === Track.Kind.Video || t.kind === 'video',
      );
      const [newTrack] = await createLocalTracks({
        audio: false,
        video: { facingMode: next, resolution: { width: 720, height: 1280, frameRate: 24 } },
      });
      if (!newTrack) return;
      if (oldTrack) {
        try { await room.localParticipant.unpublishTrack(oldTrack); } catch { /* */ }
        try { oldTrack.stop(); } catch { /* */ }
        localTracksRef.current = localTracksRef.current.filter((t) => t !== oldTrack);
      }
      await room.localParticipant.publishTrack(newTrack, { source: Track.Source.Camera });
      localTracksRef.current.push(newTrack);
      const el = videoElRefStable.current?.current;
      if (el) {
        newTrack.attach(el);
        el.muted = true;
        el.playsInline = true;
        el.setAttribute('playsinline', 'true');
        el.setAttribute('webkit-playsinline', 'true');
        el.style.transform = next === 'user' && mirrorLocalRef.current ? 'scaleX(-1)' : '';
        void el.play?.().catch(() => {});
      }
      facingRef.current = next;
      setFacingMode(next);
    } catch {
      /* keep existing camera */
    }
  }, []);

  return {
    connected,
    hasMedia,
    connecting: connecting && !hasMedia,
    error,
    disconnect,
    micEnabled,
    camEnabled,
    facingMode,
    toggleMic,
    toggleCam,
    switchCamera,
  };
}
