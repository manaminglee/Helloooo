import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Group audio channel client — WebRTC audio mesh driven by server signalling.
 *
 * Only speakers publish a track; listeners keep a recvonly transceiver so they
 * still hear the room without uploading anything. Mic starts muted, always.
 *
 * Fast-connect notes:
 *  - We create the peer connection immediately on peer-joined (no waiting for
 *    getUserMedia) so ICE gathering starts as early as possible.
 *  - Deterministic offer role (higher socketId offers) avoids glare/collisions.
 */
export function useAudioChannel(socket, iceServers) {
  const [channel, setChannel] = useState(null);      // { channelId, topic, you }
  const [members, setMembers] = useState([]);
  const [micMuted, setMicMuted] = useState(true);
  const [speakingIds, setSpeakingIds] = useState(() => new Set());
  const [error, setError] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);

  const pcsRef = useRef(new Map());        // socketId -> RTCPeerConnection
  const localStreamRef = useRef(null);
  const audioElsRef = useRef(new Map());   // socketId -> HTMLAudioElement
  const analysersRef = useRef(new Map());
  const channelIdRef = useRef(null);
  const rafRef = useRef(0);

  const iceConfig = useRef({ iceServers: iceServers || [{ urls: 'stun:stun.l.google.com:19302' }] });
  useEffect(() => {
    if (iceServers?.length) iceConfig.current = { iceServers };
  }, [iceServers]);

  /** Lazily acquire the mic — only speakers ever need it. */
  const ensureMic = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    // Join muted — the user explicitly unmutes.
    stream.getAudioTracks().forEach((t) => {
      t.enabled = false;
    });
    localStreamRef.current = stream;
    return stream;
  }, []);

  const attachRemote = useCallback((socketId, stream) => {
    let el = audioElsRef.current.get(socketId);
    if (!el) {
      el = new Audio();
      el.autoplay = true;
      el.playsInline = true;
      audioElsRef.current.set(socketId, el);
    }
    el.srcObject = stream;
    el.play().catch(() => {
      /* autoplay may need a gesture; the UI has an unmute affordance */
    });

    // Voice-activity detection for the speaking ring.
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC && !analysersRef.current.has(socketId)) {
        const ctx = new AC();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        analysersRef.current.set(socketId, { ctx, analyser, data: new Uint8Array(analyser.frequencyBinCount) });
      }
    } catch (_) {
      /* VAD is cosmetic */
    }
  }, []);

  const createPeer = useCallback(
    (peerId, shouldOffer) => {
      if (pcsRef.current.has(peerId)) return pcsRef.current.get(peerId);
      const pc = new RTCPeerConnection(iceConfig.current);
      pcsRef.current.set(peerId, pc);

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit('audio:signal', {
            channelId: channelIdRef.current,
            targetSocketId: peerId,
            signal: { type: 'candidate', candidate: e.candidate },
          });
        }
      };
      pc.ontrack = (e) => attachRemote(peerId, e.streams[0]);
      pc.onconnectionstatechange = () => {
        if (['failed', 'closed'].includes(pc.connectionState)) {
          pc.close();
          pcsRef.current.delete(peerId);
        }
      };

      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((t) => pc.addTrack(t, localStreamRef.current));
      } else {
        pc.addTransceiver('audio', { direction: 'recvonly' });
      }

      if (shouldOffer) {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer).then(() => offer))
          .then((offer) => {
            socket.emit('audio:signal', {
              channelId: channelIdRef.current,
              targetSocketId: peerId,
              signal: { type: 'offer', sdp: offer.sdp },
            });
          })
          .catch(() => {});
      }
      return pc;
    },
    [socket, attachRemote]
  );

  const teardown = useCallback(() => {
    pcsRef.current.forEach((pc) => pc.close());
    pcsRef.current.clear();
    audioElsRef.current.forEach((el) => {
      el.srcObject = null;
    });
    audioElsRef.current.clear();
    analysersRef.current.forEach(({ ctx }) => ctx.close?.().catch?.(() => {}));
    analysersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => {
      try {
        t.enabled = false;
        t.stop();
      } catch {
        /* ignore */
      }
    });
    localStreamRef.current = null;
    channelIdRef.current = null;
    cancelAnimationFrame(rafRef.current);
    setChatMessages([]);
  }, []);

  // ---- socket wiring ----
  useEffect(() => {
    if (!socket) return undefined;

    const onJoined = async ({ channelId, topic, you, peers }) => {
      channelIdRef.current = channelId;
      setChannel({ channelId, topic, you, wallpaper: null, gamesEnabled: true, pendingJoins: [] });
      setConnecting(false);
      setError(null);

      if (you.role !== 'listener') {
        try {
          await ensureMic();
        } catch (_) {
          setError('Microphone blocked — you joined as a listener.');
        }
      }
      // Deterministic offerer: avoids both sides offering at once.
      peers.forEach((p) => createPeer(p.socketId, String(you.socketId) > String(p.socketId)));
    };

    const onPeerJoined = ({ member }) => {
      const me = channelIdRef.current && member?.socketId;
      if (!me) return;
      createPeer(member.socketId, String(socket.id) > String(member.socketId));
    };

    const onPeerLeft = ({ socketId }) => {
      pcsRef.current.get(socketId)?.close();
      pcsRef.current.delete(socketId);
      audioElsRef.current.get(socketId)?.pause?.();
      audioElsRef.current.delete(socketId);
      analysersRef.current.get(socketId)?.ctx?.close?.().catch?.(() => {});
      analysersRef.current.delete(socketId);
    };

    const onSignal = async ({ fromSocketId, signal }) => {
      let pc = pcsRef.current.get(fromSocketId);
      if (!pc) pc = createPeer(fromSocketId, false);
      try {
        if (signal.type === 'offer') {
          await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('audio:signal', {
            channelId: channelIdRef.current,
            targetSocketId: fromSocketId,
            signal: { type: 'answer', sdp: answer.sdp },
          });
        } else if (signal.type === 'answer') {
          await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
        } else if (signal.type === 'candidate' && signal.candidate) {
          await pc.addIceCandidate(signal.candidate).catch(() => {});
        }
      } catch (_) {
        /* transient negotiation errors self-heal on the next signal */
      }
    };

    const onState = (state) => {
      setMembers(state.members || []);
      setChannel((prev) => prev ? {
        ...prev,
        topic: state.topic ?? prev.topic,
        wallpaper: state.wallpaper ?? null,
        gamesEnabled: state.gamesEnabled !== false,
        pendingJoins: state.pendingJoins || [],
        maxSpeakers: state.maxSpeakers || 6,
      } : prev);
    };
    const onSpeaking = ({ socketId, micMuted: muted }) => {
      setSpeakingIds((prev) => {
        const next = new Set(prev);
        if (muted) next.delete(socketId);
        else next.add(socketId);
        return next;
      });
    };
    const onKicked = ({ reason }) => {
      setError(reason || 'You were removed from the channel.');
      teardown();
      setChannel(null);
      setMembers([]);
    };
    const onError = ({ message }) => {
      setError(message);
      setConnecting(false);
    };

    const onChatMessage = (msg) => {
      if (!msg?.text) return;
      setChatMessages((prev) => [...prev.slice(-99), msg]);
    };

    socket.on('audio:joined', onJoined);
    socket.on('audio:peer-joined', onPeerJoined);
    socket.on('audio:peer-left', onPeerLeft);
    socket.on('audio:signal', onSignal);
    socket.on('audio:state', onState);
    socket.on('audio:speaking', onSpeaking);
    socket.on('audio:kicked', onKicked);
    socket.on('audio:error', onError);
    socket.on('audio:chat-message', onChatMessage);

    return () => {
      socket.off('audio:joined', onJoined);
      socket.off('audio:peer-joined', onPeerJoined);
      socket.off('audio:peer-left', onPeerLeft);
      socket.off('audio:signal', onSignal);
      socket.off('audio:state', onState);
      socket.off('audio:speaking', onSpeaking);
      socket.off('audio:kicked', onKicked);
      socket.off('audio:error', onError);
      socket.off('audio:chat-message', onChatMessage);
    };
  }, [socket, createPeer, ensureMic, teardown]);

  // Acquire mic when promoted onto stage
  useEffect(() => {
    const me = members.find((m) => m.socketId === socket?.id);
    if (me && me.role !== 'listener') {
      ensureMic().catch(() => {});
    }
  }, [members, socket?.id, ensureMic]);

  useEffect(() => () => teardown(), [teardown]);

  // ---- actions ----
  const join = useCallback(
    (channelId, nickname) => {
      setConnecting(true);
      socket?.emit('audio:join', { channelId, nickname });
    },
    [socket]
  );

  const create = useCallback(
    (topic, isPrivate, nickname) => {
      setConnecting(true);
      socket?.emit('audio:create', { topic, isPrivate, nickname });
    },
    [socket]
  );

  const leave = useCallback(() => {
    if (channelIdRef.current) socket?.emit('audio:leave', { channelId: channelIdRef.current });
    teardown();
    setChannel(null);
    setMembers([]);
    setMicMuted(true);
  }, [socket, teardown]);

  const toggleMic = useCallback(async () => {
    const next = !micMuted;
    try {
      const stream = await ensureMic();
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !next;
      });
      // If we acquired the mic after connecting, publish it now.
      if (!next) {
        pcsRef.current.forEach((pc) => {
          const hasAudio = pc.getSenders().some((s) => s.track?.kind === 'audio');
          if (!hasAudio) stream.getAudioTracks().forEach((t) => pc.addTrack(t, stream));
        });
      }
      setMicMuted(next);
      socket?.emit('audio:mic', { channelId: channelIdRef.current, muted: next });
    } catch (_) {
      setError('Microphone permission denied.');
    }
  }, [micMuted, ensureMic, socket]);

  const requestSpeak = useCallback(() => {
    socket?.emit('audio:request-speak', { channelId: channelIdRef.current });
  }, [socket]);

  const moderate = useCallback(
    (targetSocketId, action) => {
      socket?.emit('audio:moderate', { channelId: channelIdRef.current, targetSocketId, action });
    },
    [socket]
  );

  const grantSpeak = useCallback(
    (targetSocketId, grant) => {
      socket?.emit('audio:grant-speak', { channelId: channelIdRef.current, targetSocketId, grant });
    },
    [socket]
  );

  const claimSlot = useCallback(
    (slot) => {
      socket?.emit('audio:claim-slot', { channelId: channelIdRef.current, slot });
    },
    [socket]
  );

  const approveJoin = useCallback(
    (targetSocketId, slot) => {
      socket?.emit('audio:approve-join', { channelId: channelIdRef.current, targetSocketId, slot });
    },
    [socket]
  );

  const denyJoin = useCallback(
    (targetSocketId) => {
      socket?.emit('audio:deny-join', { channelId: channelIdRef.current, targetSocketId });
    },
    [socket]
  );

  const renameRoom = useCallback(
    (topic) => {
      socket?.emit('audio:rename', { channelId: channelIdRef.current, topic });
    },
    [socket]
  );

  const setWallpaper = useCallback(
    (wallpaper) => {
      socket?.emit('audio:wallpaper', { channelId: channelIdRef.current, wallpaper });
    },
    [socket]
  );

  const setGamesEnabled = useCallback(
    (enabled) => {
      socket?.emit('audio:set-games', { channelId: channelIdRef.current, enabled });
    },
    [socket]
  );

  const sendChat = useCallback(
    (text) => {
      const trimmed = String(text || '').trim();
      if (!trimmed || !channelIdRef.current) return;
      socket?.emit('audio:chat', { channelId: channelIdRef.current, text: trimmed });
    },
    [socket]
  );

  return {
    channel,
    members,
    micMuted,
    speakingIds,
    error,
    connecting,
    chatMessages,
    join,
    create,
    leave,
    toggleMic,
    requestSpeak,
    moderate,
    grantSpeak,
    claimSlot,
    approveJoin,
    denyJoin,
    renameRoom,
    setWallpaper,
    setGamesEnabled,
    sendChat,
    clearError: () => setError(null),
  };
}

export default useAudioChannel;
