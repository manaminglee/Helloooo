import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, createLocalTracks, ConnectionState, LocalVideoTrack } from 'livekit-client';
import { getFilter } from '../utils/liveFilters';
import { drawFaceProcessedFrame, loadFaceLandmarker } from '../utils/faceBlurEngine';

const CLARITY_TIMEOUT_MS = 20_000;

function trackMediaId(track) {
  if (!track) return '';
  return track.mediaStreamTrack?.id || track.sid || track.id || '';
}

async function unpublishBySource(participant, source) {
  if (!participant) return;
  const pubs = [...participant.trackPublications.values()];
  await Promise.all(pubs.map(async (pub) => {
    if (pub.source !== source || !pub.track) return;
    try {
      await participant.unpublishTrack(pub.track, true);
    } catch { /* ignore */ }
  }));
}

async function safePublishTrack(participant, track, options = {}) {
  if (!participant || !track) return null;
  const msId = trackMediaId(track);
  for (const pub of participant.trackPublications.values()) {
    if (!pub.track) continue;
    if (msId && trackMediaId(pub.track) === msId) return pub;
  }
  if (options.source != null) {
    await unpublishBySource(participant, options.source);
  }
  try {
    return await participant.publishTrack(track, options);
  } catch (err) {
    const msg = String(err?.message || err);
    if (/same ID/i.test(msg) || err?.name === 'TrackInvalidError') return null;
    throw err;
  }
}

async function waitForRoomConnected(room, timeoutMs = 15000) {
  if (room.state === ConnectionState.Connected) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      room.off(RoomEvent.ConnectionStateChanged, onState);
      reject(new Error('Live connect timeout'));
    }, timeoutMs);
    const onState = (state) => {
      if (state === ConnectionState.Connected) {
        clearTimeout(timeout);
        room.off(RoomEvent.ConnectionStateChanged, onState);
        resolve();
      }
    };
    room.on(RoomEvent.ConnectionStateChanged, onState);
  });
}

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
  beautyEnabled = true,
  /* Look chosen by the creator. Held in a ref and read inside the render loop,
     so switching filter mid-broadcast costs one frame and never republishes. */
  filterId = 'natural',
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
  const beautyTsRef = useRef(0);
  /** @type {React.MutableRefObject<{ hidden: HTMLVideoElement, landmarker: object, outStream: MediaStream, rawTrack: import('livekit-client').LocalTrack } | null>} */
  const beautyPipelineRef = useRef(null);
  const connectGenRef = useRef(0);
  const publishingRef = useRef(false);
  const disconnectingRef = useRef(false);

  const beautyEnabledRef = useRef(beautyEnabled);
  beautyEnabledRef.current = beautyEnabled;
  const filterRef = useRef(getFilter(filterId));
  filterRef.current = beautyEnabled ? getFilter(filterId) : getFilter('off');
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
    beautyTsRef.current = 0;
    try { beautyCleanupRef.current?.(); } catch { /* */ }
    beautyCleanupRef.current = null;
    beautyPipelineRef.current = null;
  }, []);

  const disconnect = useCallback(async () => {
    if (disconnectingRef.current) return;
    disconnectingRef.current = true;
    connectGenRef.current += 1;
    if (clarityTimerRef.current) {
      clearTimeout(clarityTimerRef.current);
      clarityTimerRef.current = null;
    }
    stopBeautyPipeline();
    hasMediaRef.current = false;
    publishingRef.current = false;
    const room = roomRef.current;
    roomRef.current = null;
    try {
      if (room?.localParticipant) {
        const pubs = [...room.localParticipant.trackPublications.values()];
        await Promise.all(pubs.map(async (pub) => {
          if (!pub.track) return;
          try { await room.localParticipant.unpublishTrack(pub.track, true); } catch { /* */ }
        }));
      }
    } catch { /* */ }
    try {
      localTracksRef.current.forEach((t) => {
        try { t.stop(); } catch { /* */ }
      });
    } catch { /* */ }
    localTracksRef.current = [];
    clearRemoteAudio();
    try { await room?.disconnect(); } catch { /* */ }
    setConnected(false);
    setHasMedia(false);
    setConnecting(false);
    disconnectingRef.current = false;
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
    const gen = ++connectGenRef.current;
    const isStale = () => cancelled || connectGenRef.current !== gen || disconnectingRef.current;

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
        if (isStale()) return;

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
          if (isStale()) return;
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
        if (isStale()) {
          await room.disconnect();
          return;
        }
        await waitForRoomConnected(room);
        if (isStale()) {
          await room.disconnect();
          return;
        }
        setConnected(true);
        watch();

        if (asHost || asGuest) {
          if (publishingRef.current) return;
          publishingRef.current = true;
          try {
          // Let Safari finish releasing the studio preview camera handle.
          await new Promise((r) => setTimeout(r, 150));
          if (isStale()) return;

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
          if (isStale()) {
            tracks.forEach((t) => t.stop());
            return;
          }

          const audioTrack = tracks.find((t) => t.kind === Track.Kind.Audio || t.kind === 'audio');
          const videoTrack = tracks.find((t) => t.kind === Track.Kind.Video || t.kind === 'video');
          localTracksRef.current = tracks.filter(Boolean);

          const participant = room.localParticipant;
          if (audioTrack) {
            await safePublishTrack(participant, audioTrack, { source: Track.Source.Microphone });
          }
          if (isStale()) return;

          let publishVideo = videoTrack;

          /** Canvas pipeline — beauty toggles at runtime without republishing. */
          const startCameraPipeline = async (rawVideoTrack) => {
            const landmarker = await loadFaceLandmarker();
            if (isStale()) return false;
            const rawMsTrack = rawVideoTrack.mediaStreamTrack;
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

            await new Promise((resolve) => {
              if (hidden.videoWidth > 0) resolve();
              else hidden.addEventListener('loadedmetadata', resolve, { once: true });
            });

            const w = hidden.videoWidth || 720;
            const h = hidden.videoHeight || 1280;
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const blurCanvas = document.createElement('canvas');
            blurCanvas.width = w;
            blurCanvas.height = h;
            const ctx = canvas.getContext('2d', { alpha: false });
            const blurCtx = blurCanvas.getContext('2d', { alpha: false });
            const outStream = canvas.captureStream(24);
            const processedMsTrack = outStream.getVideoTracks()[0];
            const processedTrack = new LocalVideoTrack(processedMsTrack, undefined, false);
            beautyTsRef.current = 0;

            const loop = () => {
              if (hidden.readyState >= 2) {
                beautyTsRef.current += 33;
                const preset = filterRef.current;
                const styled = preset && preset.id !== 'off';
                drawFaceProcessedFrame(
                  ctx,
                  blurCtx,
                  hidden,
                  landmarker,
                  false,
                  beautyTsRef.current,
                  styled ? 'beauty' : 'off',
                  styled ? preset : null,
                );
              }
              beautyRafRef.current = requestAnimationFrame(loop);
            };
            beautyRafRef.current = requestAnimationFrame(loop);

            beautyPipelineRef.current = {
              hidden,
              landmarker,
              outStream,
              rawTrack: rawVideoTrack,
              processedTrack,
            };
            beautyCleanupRef.current = () => {
              cancelAnimationFrame(beautyRafRef.current);
              beautyRafRef.current = 0;
              beautyTsRef.current = 0;
              try { hidden.srcObject = null; hidden.remove(); } catch { /* */ }
              try { processedMsTrack.stop(); } catch { /* */ }
              try { processedTrack.stop(); } catch { /* */ }
              beautyPipelineRef.current = null;
            };

            if (isStale()) return false;
            await safePublishTrack(participant, processedTrack, {
              source: Track.Source.Camera,
              name: 'processed-cam',
            });

            if (vRef?.current) {
              const el = vRef.current;
              el.srcObject = outStream;
              el.muted = true;
              el.playsInline = true;
              el.setAttribute('playsinline', 'true');
              el.setAttribute('webkit-playsinline', 'true');
              el.style.transform = '';
              void el.play?.().catch(() => {});
            }
            return true;
          };

          if (videoTrack) {
            try {
              const piped = await startCameraPipeline(videoTrack);
              if (piped) publishVideo = null;
            } catch (err) {
              console.warn('[live] camera pipeline unavailable, using raw camera', err);
              stopBeautyPipeline();
              publishVideo = videoTrack;
            }
          }

          if (publishVideo && !isStale()) {
            await safePublishTrack(participant, publishVideo, {
              source: Track.Source.Camera,
            });
            if (vRef?.current) {
              publishVideo.attach(vRef.current);
              const el = vRef.current;
              el.muted = true;
              el.playsInline = true;
              el.setAttribute('playsinline', 'true');
              el.setAttribute('webkit-playsinline', 'true');
              el.style.transform = '';
              void el.play?.().catch(() => {});
            }
          }
          if (!isStale()) mark();
          } finally {
            publishingRef.current = false;
          }
        } else {
          room.remoteParticipants.forEach((p) => {
            p.trackPublications.forEach((pub) => {
              if (pub.track) attachRemote(pub.track);
            });
          });
        }
      } catch (e) {
        if (!isStale()) {
          setError(e.message || 'Live connect failed');
          setConnecting(false);
        }
        await disconnectRef.current();
      }
    })();

    return () => {
      cancelled = true;
      connectGenRef.current += 1;
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
    if (!room?.localParticipant || room.state !== ConnectionState.Connected) return camEnabled;
    const next = !camEnabled;
    const pipeline = beautyPipelineRef.current;
    try {
      if (pipeline?.processedTrack) {
        for (const pub of room.localParticipant.trackPublications.values()) {
          if (pub.source === Track.Source.Camera && pub.track) {
            if (next) await pub.track.unmute();
            else await pub.track.mute();
          }
        }
      } else {
        await room.localParticipant.setCameraEnabled(next);
      }
      setCamEnabled(next);
      return next;
    } catch {
      return camEnabled;
    }
  }, [camEnabled]);

  const switchCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room?.localParticipant || room.state !== ConnectionState.Connected) return;
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

      const pipeline = beautyPipelineRef.current;
      if (pipeline?.hidden) {
        if (oldTrack) {
          try { oldTrack.stop(); } catch { /* */ }
          localTracksRef.current = localTracksRef.current.filter((t) => t !== oldTrack);
        }
        localTracksRef.current.push(newTrack);
        pipeline.rawTrack = newTrack;
        pipeline.hidden.srcObject = new MediaStream([newTrack.mediaStreamTrack]);
        beautyTsRef.current = 0;
        await pipeline.hidden.play().catch(() => {});
      } else {
        if (oldTrack) {
          try { await room.localParticipant.unpublishTrack(oldTrack, true); } catch { /* */ }
          try { oldTrack.stop(); } catch { /* */ }
          localTracksRef.current = localTracksRef.current.filter((t) => t !== oldTrack);
        }
        await safePublishTrack(room.localParticipant, newTrack, { source: Track.Source.Camera });
        localTracksRef.current.push(newTrack);
        const el = videoElRefStable.current?.current;
        if (el) {
          newTrack.attach(el);
          el.muted = true;
          el.playsInline = true;
          el.setAttribute('playsinline', 'true');
          el.setAttribute('webkit-playsinline', 'true');
          el.style.transform = '';
          void el.play?.().catch(() => {});
        }
      }

      const el = videoElRefStable.current?.current;
      if (el && pipeline?.outStream) {
        el.srcObject = pipeline.outStream;
        el.style.transform = '';
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
