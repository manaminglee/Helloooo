import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, createLocalTracks, LocalVideoTrack } from 'livekit-client';
import { API_BASE } from '../config/apiBase';
import { mmDebug } from '../utils/mmDebug';

function subscribePublication(pub) {
  if (!pub || pub.isSubscribed) return;
  if (pub.kind === Track.Kind.Unknown) return;
  try {
    const done = pub.setSubscribed?.(true);
    if (done?.catch) done.catch(() => {});
  } catch { /* ignore */ }
}

function collectParticipantStream(participant) {
  const stream = new MediaStream();
  participant.trackPublications.forEach((pub) => {
    const media = pub.track?.mediaStreamTrack;
    if (media && media.readyState !== 'ended') {
      try { stream.addTrack(media); } catch { /* already added */ }
    }
  });
  return stream;
}

/**
 * LiveKit SFU media for group video.
 * Socket.IO still owns matchmaking, chat, gifts, and permissions.
 */
export function useLiveKitGroup({
  enabled = false,
  socket,
  roomId,
  nickname = 'Anonymous',
  active = true,
}) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [remotes, setRemotes] = useState([]); // { socketId, stream, nickname, country, isCreator }
  const [url, setUrl] = useState('');
  const roomRef = useRef(null);
  const localTracksRef = useRef([]);

  const disconnect = useCallback(async () => {
    try {
      localTracksRef.current.forEach((t) => {
        try { t.stop(); } catch { /* ignore */ }
      });
      localTracksRef.current = [];
      await roomRef.current?.disconnect();
    } catch { /* ignore */ }
    roomRef.current = null;
    setLocalStream(null);
    setRemotes([]);
    setConnected(false);
  }, []);

  const rebuildRemotes = useCallback((room) => {
    if (!room) {
      setRemotes([]);
      return;
    }
    const next = [];
    room.remoteParticipants.forEach((p) => {
      p.trackPublications.forEach(subscribePublication);
      const stream = collectParticipantStream(p);
      next.push({
        socketId: p.identity,
        stream,
        nickname: 'Anonymous',
        country: '',
        isCreator: false,
      });
    });
    setRemotes(next);
  }, []);

  useEffect(() => {
    if (!enabled || !active || !socket || !roomId) {
      disconnect();
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        setError('');
        const tokenRes = await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('LiveKit token timeout')), 12000);
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
          socket.emit('livekit-token', { roomId, nickname: 'Anonymous' });
        });

        if (cancelled) return;
        setUrl(tokenRes.url || '');

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          autoSubscribe: true,
          videoCaptureDefaults: {
            resolution: { width: 640, height: 360, frameRate: 24 },
          },
        });
        roomRef.current = room;

        const onRefresh = () => rebuildRemotes(room);
        const onPublished = (pub) => {
          subscribePublication(pub);
          onRefresh();
        };
        room.on(RoomEvent.TrackSubscribed, onRefresh);
        room.on(RoomEvent.TrackUnsubscribed, onRefresh);
        room.on(RoomEvent.TrackPublished, onPublished);
        room.on(RoomEvent.TrackUnpublished, onRefresh);
        room.on(RoomEvent.TrackMuted, onRefresh);
        room.on(RoomEvent.TrackUnmuted, onRefresh);
        room.on(RoomEvent.TrackStreamStateChanged, onRefresh);
        room.on(RoomEvent.ParticipantConnected, (participant) => {
          participant.trackPublications.forEach(subscribePublication);
          onRefresh();
        });
        room.on(RoomEvent.ParticipantDisconnected, onRefresh);
        room.on(RoomEvent.Disconnected, () => {
          setConnected(false);
          setRemotes([]);
        });

        await room.connect(tokenRes.url, tokenRes.token, { autoSubscribe: true });
        if (cancelled) {
          await room.disconnect();
          return;
        }

        room.remoteParticipants.forEach((p) => {
          p.trackPublications.forEach(subscribePublication);
        });

        const tracks = await createLocalTracks({
          audio: true,
          video: { resolution: { width: 640, height: 360, frameRate: 24 } },
        });
        localTracksRef.current = tracks;
        for (const track of tracks) {
          await room.localParticipant.publishTrack(track);
        }
        const localMs = new MediaStream(tracks.map((t) => t.mediaStreamTrack));
        setLocalStream(localMs);
        setConnected(true);
        rebuildRemotes(room);
        mmDebug('livekit.connected', tokenRes.roomName);
      } catch (err) {
        mmDebug('livekit.error', err?.message || err);
        if (!cancelled) setError(err?.message || 'Could not join LiveKit room');
      }
    })();

    return () => {
      cancelled = true;
      disconnect();
    };
  }, [enabled, active, socket, roomId, nickname, disconnect, rebuildRemotes]);

  const setMicEnabled = useCallback(async (enabledMic) => {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(enabledMic);
  }, []);

  const setCameraEnabled = useCallback(async (enabledCam) => {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setCameraEnabled(enabledCam);
  }, []);

  const replacePublishedVideo = useCallback(async (mediaStreamTrack) => {
    const room = roomRef.current;
    if (!room || !mediaStreamTrack) return;
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    if (pub?.track) {
      try { await room.localParticipant.unpublishTrack(pub.track, true); } catch { /* ignore */ }
    }
    localTracksRef.current = localTracksRef.current.filter((t) => t.kind !== Track.Kind.Video);
    const nextVideo = new LocalVideoTrack(mediaStreamTrack);
    localTracksRef.current.push(nextVideo);
    await room.localParticipant.publishTrack(nextVideo);
    const audioTracks = localTracksRef.current
      .filter((t) => t.kind === Track.Kind.Audio)
      .map((t) => t.mediaStreamTrack);
    setLocalStream(new MediaStream([...audioTracks, mediaStreamTrack]));
  }, []);

  return {
    connected,
    error,
    url,
    localStream,
    remotes,
    setMicEnabled,
    setCameraEnabled,
    replacePublishedVideo,
    disconnect,
  };
}

/** Probe whether the API has LiveKit configured (no secrets). */
export async function fetchLiveKitStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/livekit/status`, { credentials: 'include' });
    if (!res.ok) return { enabled: false };
    return await res.json();
  } catch {
    return { enabled: false };
  }
}
