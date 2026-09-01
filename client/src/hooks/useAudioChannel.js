import { useCallback, useEffect, useRef, useState } from 'react';
import { hapticNotify, hapticSuccess, hapticTap } from '../utils/haptics';
import { playInviteSound, playStickerSound, playStreakSound } from '../utils/sounds';
import { ensureNotifyPermission, notifyUser } from '../utils/browserNotify';

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
  const [lockRequired, setLockRequired] = useState(null); // { channelId, topic, isPa }
  const [paInvite, setPaInvite] = useState(null);
  const [helloEvent, setHelloEvent] = useState(null);
  const [stickerBurst, setStickerBurst] = useState(null);
  const [giftStreak, setGiftStreak] = useState(null);
  const [hostBonus, setHostBonus] = useState(null);

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

  /** Resume remote playback after a user gesture (mobile autoplay policies). */
  const resumeRemoteAudio = useCallback(() => {
    audioElsRef.current.forEach((el) => {
      try {
        el.muted = false;
        el.volume = 1;
        void el.play();
      } catch {
        /* ignore */
      }
    });
    analysersRef.current.forEach(({ ctx }) => {
      if (ctx?.state === 'suspended') ctx.resume?.().catch?.(() => {});
    });
  }, []);

  const attachRemote = useCallback((socketId, stream) => {
    let el = audioElsRef.current.get(socketId);
    if (!el) {
      el = new Audio();
      el.autoplay = true;
      el.playsInline = true;
      el.setAttribute('playsinline', 'true');
      audioElsRef.current.set(socketId, el);
    }
    el.srcObject = stream;
    el.muted = false;
    el.play().catch(() => {
      /* autoplay may need a gesture; resumeRemoteAudio on unmute/tap */
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
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
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

    const onJoined = async ({ channelId, topic, you, peers, maxSpeakers, wallpaper, gamesEnabled, pendingJoins, pendingKnocks, isPa, hasLockCode, locked, themeId, paInviteToken }) => {
      if (channelIdRef.current && channelIdRef.current !== channelId) {
        pcsRef.current.forEach((pc) => pc.close());
        pcsRef.current.clear();
        audioElsRef.current.forEach((el) => { el.srcObject = null; });
        audioElsRef.current.clear();
        analysersRef.current.forEach(({ ctx }) => ctx.close?.().catch?.(() => {}));
        analysersRef.current.clear();
        setChatMessages([]);
      }
      channelIdRef.current = channelId;
      setChannel({
        channelId,
        topic,
        you,
        wallpaper: wallpaper || null,
        gamesEnabled: gamesEnabled !== false,
        pendingJoins: pendingJoins || [],
        maxSpeakers: maxSpeakers || 6,
        isPa: !!isPa,
        hasLockCode: !!hasLockCode,
        locked: !!locked,
        themeId: themeId || 'default',
        paInviteToken: paInviteToken || null,
        pendingKnocks: pendingKnocks || [],
      });
      setMembers([you, ...(peers || [])].filter(Boolean));
      setMicMuted(you?.micMuted !== false);
      setConnecting(false);
      setError(null);
      setLockRequired(null);

      if (you.role !== 'listener' && you.role !== 'cohost') {
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
          if (pc.signalingState === 'have-local-offer') {
            try {
              await pc.setLocalDescription({ type: 'rollback' });
            } catch {
              /* some browsers lack rollback — ignore glare */
            }
          }
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
        isPa: !!state.isPa,
        hasLockCode: !!state.hasLockCode,
        locked: !!state.locked,
        themeId: state.themeId || 'default',
        pendingKnocks: state.pendingKnocks || [],
        cohostEnabled: !!state.cohostEnabled,
        cohostJoined: !!state.cohostJoined,
      } : prev);
    };
    const onSpeaking = ({ socketId, micMuted: muted }) => {
      // Keep member.micMuted in sync — otherwise avatars stay "muted" forever
      // because audio:mic only emits speaking events, not a full state dump.
      setMembers((prev) =>
        prev.map((m) => (m.socketId === socketId ? { ...m, micMuted: !!muted } : m))
      );
      if (socketId === socket.id) setMicMuted(!!muted);
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

    const onLockRequired = (payload) => {
      setLockRequired(payload);
      setConnecting(false);
    };

    const onHello = (payload) => {
      hapticTap();
      setHelloEvent({ ...payload, id: `${payload.fromSocketId}-${Date.now()}` });
    };

    const onPaInvite = (payload) => {
      hapticNotify();
      playInviteSound();
      if (payload?.notify) {
        notifyUser('Private Audio invite', `${payload.fromNickname || 'Someone'} invited you to a PA room`);
      }
      setPaInvite(payload);
    };

    const onPaInviteResult = (payload) => {
      if (!payload.accepted) {
        setError(payload.reason === 'left'
          ? 'PA invite failed — they left the room.'
          : `${payload.targetNickname || 'User'} declined your PA invite.`);
        return;
      }
      setPaInvite(null);
    };

    const onSticker = (payload) => {
      hapticTap(8);
      playStickerSound();
      setStickerBurst({ ...payload, id: `${payload.fromSocketId}-${Date.now()}` });
    };

    const onGiftStreak = (payload) => {
      hapticSuccess();
      playStreakSound();
      setGiftStreak({ ...payload, id: `${payload.fromSocketId}-${payload.streak}-${Date.now()}` });
    };

    const onHostBonus = (payload) => {
      if (payload?.channelId && channelIdRef.current && payload.channelId !== channelIdRef.current) return;
      hapticSuccess();
      setHostBonus(payload);
    };

    const onChatMessage = (msg) => {
      if (msg?.channelId && channelIdRef.current && msg.channelId !== channelIdRef.current) return;
      if (!msg?.text && msg?.kind !== 'gift') return;
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
    socket.on('audio:lock-required', onLockRequired);
    socket.on('audio:hello', onHello);
    socket.on('audio:pa-invite', onPaInvite);
    socket.on('audio:pa-invite-result', onPaInviteResult);
    socket.on('audio:sticker', onSticker);
    socket.on('gift:streak', onGiftStreak);
    socket.on('audio:host-bonus', onHostBonus);

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
      socket.off('audio:lock-required', onLockRequired);
      socket.off('audio:hello', onHello);
      socket.off('audio:pa-invite', onPaInvite);
      socket.off('audio:pa-invite-result', onPaInviteResult);
      socket.off('audio:sticker', onSticker);
      socket.off('gift:streak', onGiftStreak);
      socket.off('audio:host-bonus', onHostBonus);
    };
  }, [socket, createPeer, ensureMic, teardown]);

  useEffect(() => {
    ensureNotifyPermission().catch(() => {});
  }, []);

  /**
   * Publish mic to every peer and renegotiate. Required when we started as
   * recvonly (listener) then got a stage seat — addTrack alone does not update SDP.
   */
  const publishAudioToAllPeers = useCallback(async () => {
    if (!socket) return;
    let stream;
    try {
      stream = await ensureMic();
    } catch {
      return;
    }
    const track = stream.getAudioTracks()[0];
    if (!track) return;

    for (const [peerId, pc] of [...pcsRef.current.entries()]) {
      if (!pc || pc.signalingState === 'closed') continue;
      try {
        let needOffer = false;
        const existing = pc.getSenders().find((s) => s.track?.kind === 'audio');
        if (existing) {
          if (existing.track?.id !== track.id) await existing.replaceTrack(track);
        } else {
          const recvOnly = pc.getTransceivers().find(
            (t) => t.direction === 'recvonly' || t.direction === 'inactive'
          );
          if (recvOnly) {
            recvOnly.direction = 'sendrecv';
            await recvOnly.sender.replaceTrack(track);
          } else {
            pc.addTrack(track, stream);
          }
          needOffer = true;
        }
        if (!needOffer) continue;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('audio:signal', {
          channelId: channelIdRef.current,
          targetSocketId: peerId,
          signal: { type: 'offer', sdp: offer.sdp },
        });
      } catch {
        /* next unmute / peer-join will retry */
      }
    }
  }, [ensureMic, socket]);

  const roleRef = useRef(null);

  // Acquire mic + republish when promoted onto stage
  useEffect(() => {
    const me = members.find((m) => m.socketId === socket?.id);
    const role = me?.role || null;
    const wasListener = !roleRef.current || roleRef.current === 'listener';
    roleRef.current = role;
    if (me && me.role !== 'listener' && me.role !== 'cohost') {
      ensureMic()
        .then(() => {
          if (wasListener && role !== 'listener' && role !== 'cohost') return publishAudioToAllPeers();
          return undefined;
        })
        .catch(() => {});
    }
  }, [members, socket?.id, ensureMic, publishAudioToAllPeers]);

  const teardownRef = useRef(teardown);
  teardownRef.current = teardown;
  useEffect(() => () => { teardownRef.current?.(); }, []);

  // ---- actions ----
  const join = useCallback(
    (channelId, nickname, lockCode, paToken, asCohost = false) => {
      setConnecting(true);
      setLockRequired(null);
      socket?.emit('audio:join', { channelId, nickname, lockCode, paToken, asCohost: !!asCohost });
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
    roleRef.current = null;
  }, [socket, teardown]);

  const toggleMic = useCallback(async () => {
    const next = !micMuted;
    try {
      resumeRemoteAudio();
      const stream = await ensureMic();
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !next;
      });
      // Unmute: ensure every peer has our send track (renegotiate if needed).
      if (!next) {
        await publishAudioToAllPeers();
        stream.getAudioTracks().forEach((t) => {
          t.enabled = true;
        });
      }
      setMicMuted(next);
      socket?.emit('audio:mic', { channelId: channelIdRef.current, muted: next });
    } catch (_) {
      setError('Microphone permission denied.');
    }
  }, [micMuted, ensureMic, socket, publishAudioToAllPeers, resumeRemoteAudio]);

  const requestSpeak = useCallback(() => {
    socket?.emit('audio:request-speak', { channelId: channelIdRef.current });
  }, [socket]);

  const moderate = useCallback(
    (targetSocketId, action) => {
      const channelId = channelIdRef.current;
      if (!socket || !channelId) {
        setError('Not connected to a voice room.');
        return;
      }
      socket.emit('audio:moderate', { channelId, targetSocketId, action });
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

  const sendSticker = useCallback(
    (sticker) => {
      if (!channelIdRef.current) return;
      socket?.emit('audio:sticker', { channelId: channelIdRef.current, sticker });
    },
    [socket]
  );

  const sendHello = useCallback(
    (targetSocketId, helloType = 'wave') => {
      if (!channelIdRef.current) return;
      socket?.emit('audio:hello', { channelId: channelIdRef.current, targetSocketId, helloType });
    },
    [socket]
  );

  const knockRoom = useCallback(
    (channelId) => {
      socket?.emit('audio:knock', { channelId });
    },
    [socket]
  );

  const approveKnock = useCallback(
    (targetSocketId) => {
      socket?.emit('audio:approve-knock', { channelId: channelIdRef.current, targetSocketId });
    },
    [socket]
  );

  const denyKnock = useCallback(
    (targetSocketId) => {
      socket?.emit('audio:deny-knock', { channelId: channelIdRef.current, targetSocketId });
    },
    [socket]
  );

  const setTheme = useCallback(
    (themeId) => {
      socket?.emit('audio:set-theme', { channelId: channelIdRef.current, themeId });
    },
    [socket]
  );

  const invitePa = useCallback(
    (targetSocketId) => {
      if (!channelIdRef.current) return;
      socket?.emit('audio:pa-invite', { channelId: channelIdRef.current, targetSocketId });
    },
    [socket]
  );

  const respondPa = useCallback(
    (inviteId, accept) => {
      socket?.emit('audio:pa-respond', { inviteId, accept });
      setPaInvite(null);
    },
    [socket]
  );

  const setRoomLock = useCallback(
    (code) => {
      socket?.emit('audio:lock', { channelId: channelIdRef.current, code });
    },
    [socket]
  );

  const makePublic = useCallback(() => {
    socket?.emit('audio:make-public', { channelId: channelIdRef.current });
  }, [socket]);

  const dismissLockRequired = useCallback(() => setLockRequired(null), []);
  const dismissHello = useCallback(() => setHelloEvent(null), []);
  const dismissSticker = useCallback(() => setStickerBurst(null), []);
  const dismissPaInvite = useCallback(() => setPaInvite(null), []);
  const dismissGiftStreak = useCallback(() => setGiftStreak(null), []);
  const dismissHostBonus = useCallback(() => setHostBonus(null), []);

  return {
    channel,
    members,
    micMuted,
    speakingIds,
    error,
    connecting,
    chatMessages,
    lockRequired,
    paInvite,
    helloEvent,
    stickerBurst,
    giftStreak,
    hostBonus,
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
    sendSticker,
    sendHello,
    knockRoom,
    approveKnock,
    denyKnock,
    setTheme,
    invitePa,
    respondPa,
    setRoomLock,
    makePublic,
    resumeRemoteAudio,
    clearError: () => setError(null),
    dismissLockRequired,
    dismissHello,
    dismissSticker,
    dismissPaInvite,
    dismissGiftStreak,
    dismissHostBonus,
  };
}

export default useAudioChannel;
