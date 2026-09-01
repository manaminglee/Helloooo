import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, createLocalTracks } from 'livekit-client';
import { mmDebug } from '../utils/mmDebug';

/**
 * LiveKit SFU for group audio rooms (audio-only tracks).
 * Socket.IO still owns room state, chat, gifts, and permissions.
 */
export function useLiveKitAudio({
  enabled = false,
  socket,
  channelId,
  nickname = 'Anonymous',
  active = true,
}) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  const roomRef = useRef(null);
  const localTrackRef = useRef(null);
  const remoteElsRef = useRef(new Map());

  const attachRemote = useCallback((identity, track) => {
    if (!track || track.kind !== 'audio') return;
    let el = remoteElsRef.current.get(identity);
    if (!el) {
      el = new Audio();
      el.autoplay = true;
      el.playsInline = true;
      el.setAttribute('playsinline', 'true');
      remoteElsRef.current.set(identity, el);
    }
    const stream = new MediaStream([track.mediaStreamTrack]);
    el.srcObject = stream;
    el.play().catch(() => {});
  }, []);

  const disconnect = useCallback(async () => {
    remoteElsRef.current.forEach((el) => {
      try { el.pause(); el.srcObject = null; } catch { /* ignore */ }
    });
    remoteElsRef.current.clear();
    try {
      localTrackRef.current?.stop?.();
    } catch { /* ignore */ }
    localTrackRef.current = null;
    try {
      await roomRef.current?.disconnect();
    } catch { /* ignore */ }
    roomRef.current = null;
    setConnected(false);
  }, []);

  useEffect(() => {
    if (!enabled || !active || !socket || !channelId) {
      disconnect();
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        setError('');
        const tokenRes = await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('LiveKit audio token timeout')), 12000);
          const onToken = (payload) => {
            clearTimeout(t);
            socket.off('livekit-token', onToken);
            socket.off('livekit-token-error', onErr);
            resolve(payload);
          };
          const onErr = (payload) => {
            clearTimeout(t);
            socket.off('livekit-token', onToken);
            socket.off('livekit-token-error', onErr);
            reject(new Error(payload?.message || 'LiveKit token failed'));
          };
          socket.once('livekit-token', onToken);
          socket.once('livekit-token-error', onErr);
          socket.emit('livekit-token', { roomId: channelId, nickname, kind: 'audio' });
        });

        if (cancelled) return;
        setUrl(tokenRes.url || '');

        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;

        room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          attachRemote(participant.identity, track);
        });
        room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
          if (track.kind !== 'audio') return;
          const el = remoteElsRef.current.get(participant.identity);
          if (el) {
            el.pause();
            el.srcObject = null;
          }
        });
        room.on(RoomEvent.Disconnected, () => setConnected(false));

        await room.connect(tokenRes.url, tokenRes.token);
        if (cancelled) {
          await room.disconnect();
          return;
        }

        const [mic] = await createLocalTracks({ audio: true, video: false });
        localTrackRef.current = mic;
        mic.mediaStreamTrack.enabled = false;
        await room.localParticipant.publishTrack(mic);
        setConnected(true);
        mmDebug('livekit.audio.connected', channelId);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not join LiveKit audio');
      }
    })();

    return () => {
      cancelled = true;
      disconnect();
    };
  }, [enabled, active, socket, channelId, nickname, disconnect, attachRemote]);

  const setMicEnabled = useCallback(async (enabledMic) => {
    const room = roomRef.current;
    if (!room) return;
    if (localTrackRef.current?.mediaStreamTrack) {
      localTrackRef.current.mediaStreamTrack.enabled = enabledMic;
    }
    await room.localParticipant.setMicrophoneEnabled(enabledMic);
  }, []);

  const resumeRemoteAudio = useCallback(() => {
    remoteElsRef.current.forEach((el) => {
      try { void el.play(); } catch { /* ignore */ }
    });
  }, []);

  return { connected, error, url, setMicEnabled, resumeRemoteAudio, disconnect };
}

export default useLiveKitAudio;
