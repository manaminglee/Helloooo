import { useCallback, useEffect, useRef, useState } from 'react';
import { hapticNotify, hapticSuccess, hapticTap } from '../utils/haptics';
import { playInviteSound, playKnockSound, playStickerSound, playStreakSound, playWaveSound } from '../utils/sounds';
import { ensureNotifyPermission, notifyUser } from '../utils/browserNotify';
import { useLiveKitAudio } from './useLiveKitAudio';

const ROLE_RANK = { pa_waiting: 0, cohost: 0, listener: 0, speaker: 1, moderator: 2, host: 3 };

/** Higher role (speaker/host) initiates WebRTC offers so listeners can receive audio. */
function shouldInitiateOffer(myRole, peerRole, myId, peerId) {
  const a = ROLE_RANK[myRole] ?? 0;
  const b = ROLE_RANK[peerRole] ?? 0;
  if (a !== b) return a > b;
  return String(myId) > String(peerId);
}

/**
 * Group audio channel client — WebRTC audio mesh driven by server signalling.
 * Falls back to LiveKit SFU when the room hits the server threshold (large rooms).
 */
export function useAudioChannel(socket, iceServers, nickname = 'Anonymous') {
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
  const [giftBonus, setGiftBonus] = useState(null);
  const [scheduledEvents, setScheduledEvents] = useState([]);
  const [useSfu, setUseSfu] = useState(false);
  const [knockStatus, setKnockStatus] = useState(null); // { channelId, waiting } | null
  const [audioBlocked, setAudioBlocked] = useState(false);
  const channelIdRef = useRef(null);
  const membersRef = useRef([]);
  const youRef = useRef(null);

  const livekit = useLiveKitAudio({
    enabled: useSfu,
    socket,
    channelId: channel?.channelId || channel?.id || channelIdRef.current,
    nickname,
    active: !!channel,
  });
  const useSfuRef = useRef(false);
  useEffect(() => { useSfuRef.current = useSfu; }, [useSfu]);

  const pcsRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const audioElsRef = useRef(new Map());
  const analysersRef = useRef(new Map());
  const rafRef = useRef(0);

  const iceConfig = useRef({ iceServers: iceServers || [{ urls: 'stun:stun.l.google.com:19302' }] });
  useEffect(() => {
    if (iceServers?.length) iceConfig.current = { iceServers };
  }, [iceServers]);

  const audioMountRef = useRef(null);

  useEffect(() => {
    let mount = document.getElementById('mm-audio-remote-mount');
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'mm-audio-remote-mount';
      mount.setAttribute('aria-hidden', 'true');
      mount.style.cssText = 'position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;opacity:0';
      document.body.appendChild(mount);
    }
    audioMountRef.current = mount;
    return () => {
      audioElsRef.current.forEach((el) => {
        try { el.pause(); el.srcObject = null; el.remove(); } catch { /* ignore */ }
      });
      audioElsRef.current.clear();
    };
  }, []);

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
    let blocked = false;
    audioElsRef.current.forEach((el) => {
      try {
        el.muted = false;
        el.volume = 1;
        const p = el.play();
        if (p?.catch) p.catch(() => { blocked = true; });
      } catch {
        blocked = true;
      }
    });
    analysersRef.current.forEach(({ ctx }) => {
      if (ctx?.state === 'suspended') ctx.resume?.().catch?.(() => {});
    });
    livekitRef.current?.resumeRemoteAudio?.();
    setAudioBlocked(blocked);
  }, []);

  const attachRemote = useCallback((socketId, stream) => {
    if (!stream) return;
    let el = audioElsRef.current.get(socketId);
    if (!el) {
      el = document.createElement('audio');
      el.autoplay = true;
      el.playsInline = true;
      el.setAttribute('playsinline', 'true');
      el.setAttribute('webkit-playsinline', 'true');
      el.preload = 'auto';
      audioElsRef.current.set(socketId, el);
      audioMountRef.current?.appendChild(el);
    }
    if (el.srcObject !== stream) el.srcObject = stream;
    el.muted = false;
    el.volume = 1;
    const play = () => {
      void el.play().catch(() => setAudioBlocked(true));
    };
    play();
    el.onloadedmetadata = play;

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
    } catch {
      /* VAD is cosmetic */
    }
  }, []);

  const createPeer = useCallback(
    (peerId, shouldOffer) => {
      if (useSfuRef.current) return null;
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
      pc.ontrack = (e) => {
        const stream = e.streams?.[0] || (e.track ? new MediaStream([e.track]) : null);
        if (stream) attachRemote(peerId, stream);
      };
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

  const livekitRef = useRef(livekit);
  useEffect(() => { livekitRef.current = livekit; }, [livekit]);

  const closeMeshPeers = useCallback(() => {
    pcsRef.current.forEach((pc) => pc.close());
    pcsRef.current.clear();
    audioElsRef.current.forEach((el) => {
      el.srcObject = null;
    });
    audioElsRef.current.clear();
    analysersRef.current.forEach(({ ctx }) => ctx.close?.().catch?.(() => {}));
    analysersRef.current.clear();
  }, []);

  const teardown = useCallback(() => {
    closeMeshPeers();
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
    setUseSfu(false);
    livekitRef.current?.disconnect?.();
  }, [closeMeshPeers]);

  // ---- socket wiring ----
  useEffect(() => {
    if (!socket) return undefined;

    const onJoined = async ({ channelId, topic, you, peers, maxSpeakers, wallpaper, gamesEnabled, pendingJoins, pendingKnocks, pendingPaGuests, isPa, hasLockCode, locked, themeId, paThemeId, paMembers, paInviteToken, paEndsAt, paAloneCloseAt, useSfu: sfu, entryFee, scheduledStartAt }) => {
      setKnockStatus(null);
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
        paThemeId: paThemeId || 'hearts',
        paMembers: paMembers || [],
        paInviteToken: paInviteToken || null,
        paEndsAt: paEndsAt || null,
        paAloneCloseAt: paAloneCloseAt || null,
        entryFee: entryFee || 0,
        scheduledStartAt: scheduledStartAt || null,
        useSfu: !!sfu,
        pendingKnocks: pendingKnocks || [],
        pendingPaGuests: pendingPaGuests || [],
      });
      setUseSfu(!!sfu);
      setMembers([you, ...(peers || [])].filter(Boolean));
      youRef.current = you;
      membersRef.current = [you, ...(peers || [])].filter(Boolean);
      setMicMuted(you?.micMuted !== false);
      setConnecting(false);
      setError(null);
      setLockRequired(null);

      if (you.role !== 'listener' && you.role !== 'cohost' && you.role !== 'pa_waiting') {
        try {
          await ensureMic();
        } catch (_) {
          setError('Microphone blocked — you joined as a listener.');
        }
      }
      // Mesh WebRTC only when SFU is off — large rooms switch to LiveKit.
      if (!sfu) {
        peers.forEach((p) => createPeer(
          p.socketId,
          shouldInitiateOffer(you.role, p.role, you.socketId, p.socketId)
        ));
      }
      resumeRemoteAudio();
    };

    const onPeerJoined = ({ member }) => {
      if (useSfuRef.current) return;
      if (!member?.socketId || member.socketId === socket.id) return;
      if (member.role === 'pa_waiting') return;
      const me = youRef.current || membersRef.current.find((m) => m.socketId === socket.id);
      if (!me || me.role === 'pa_waiting') return;
      membersRef.current = [...membersRef.current.filter((m) => m.socketId !== member.socketId), member];
      createPeer(
        member.socketId,
        shouldInitiateOffer(me.role, member.role, socket.id, member.socketId)
      );
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
      if (useSfuRef.current) return;
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
      const nextMembers = state.members || [];
      setMembers(nextMembers);
      membersRef.current = nextMembers;
      youRef.current = nextMembers.find((m) => m.socketId === socket?.id) || youRef.current;
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
        paThemeId: state.paThemeId ?? prev?.paThemeId ?? 'hearts',
        paMembers: state.paMembers ?? prev?.paMembers ?? [],
        pendingKnocks: state.pendingKnocks || [],
        pendingPaGuests: state.pendingPaGuests || [],
        paEndsAt: state.paEndsAt ?? prev?.paEndsAt ?? null,
        paAloneCloseAt: state.paAloneCloseAt ?? prev?.paAloneCloseAt ?? null,
        entryFee: state.entryFee ?? prev?.entryFee ?? 0,
        scheduledStartAt: state.scheduledStartAt ?? prev?.scheduledStartAt ?? null,
        useSfu: !!state.useSfu,
      } : prev);
      if (state.useSfu != null) setUseSfu(!!state.useSfu);
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
      playWaveSound();
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

    const onGiftBonus = (payload) => {
      if (payload?.channelId && channelIdRef.current && payload.channelId !== channelIdRef.current) return;
      hapticSuccess();
      setGiftBonus(payload);
    };

    const onSfuMode = (payload) => {
      if (payload?.channelId && channelIdRef.current && payload.channelId !== channelIdRef.current) return;
      setUseSfu(!!payload.enabled);
    };

    const onEntryFeeEarned = (payload) => {
      if (payload?.channelId && channelIdRef.current && payload.channelId !== channelIdRef.current) return;
      hapticSuccess();
      setHostBonus({ coins: payload.coins, entryFee: true });
    };

    const onScheduled = ({ events }) => setScheduledEvents(events || []);
    const onEventReminder = (payload) => {
      notifyUser('Voice event starting soon', `${payload.topic || 'Live room'} · ${new Date(payload.startsAt).toLocaleTimeString()}`);
    };

    const onKnockRequest = (payload) => {
      if (payload?.channelId && channelIdRef.current && payload.channelId !== channelIdRef.current) return;
      hapticNotify();
      playKnockSound();
      notifyUser('Someone is knocking', `${payload.nickname || 'Guest'} wants to join your room`);
      setChannel((prev) => {
        if (!prev) return prev;
        const existing = prev.pendingKnocks || [];
        if (existing.some((k) => k.socketId === payload.socketId)) return prev;
        return {
          ...prev,
          pendingKnocks: [...existing, { socketId: payload.socketId, nickname: payload.nickname || 'Guest' }],
        };
      });
    };

    const onPaGuestApproved = ({ channelId }) => {
      if (channelId && channelIdRef.current && channelId !== channelIdRef.current) return;
      const me = youRef.current || membersRef.current.find((m) => m.socketId === socket?.id);
      if (!me || useSfuRef.current) return;
      membersRef.current
        .filter((p) => p.socketId !== socket.id && p.role === 'speaker')
        .forEach((p) => {
          if (!pcsRef.current.has(p.socketId)) {
            createPeer(p.socketId, shouldInitiateOffer(me.role, p.role, socket.id, p.socketId));
          }
        });
      resumeRemoteAudio();
    };

    const onPaGuestRequest = (payload) => {
      if (payload?.channelId && channelIdRef.current && payload.channelId !== channelIdRef.current) return;
      hapticNotify();
      playInviteSound();
      notifyUser('PA guest waiting', `${payload.nickname || 'Someone'} wants to join your PA room`);
      setChannel((prev) => {
        if (!prev) return prev;
        const existing = prev.pendingPaGuests || [];
        if (existing.some((g) => g.socketId === payload.socketId)) return prev;
        return {
          ...prev,
          pendingPaGuests: [...existing, { socketId: payload.socketId, nickname: payload.nickname || 'Guest' }],
        };
      });
    };

    const onKnockSent = (payload) => {
      setKnockStatus({ channelId: payload.channelId, waiting: true });
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
    socket.on('audio:gift-bonus', onGiftBonus);
    socket.on('audio:sfu-mode', onSfuMode);
    socket.on('audio:scheduled', onScheduled);
    socket.on('audio:event-reminder', onEventReminder);
    socket.on('audio:knock-request', onKnockRequest);
    socket.on('audio:knock-sent', onKnockSent);
    socket.on('audio:pa-guest-request', onPaGuestRequest);
    socket.on('audio:pa-guest-approved', onPaGuestApproved);
    socket.on('audio:entry-fee-earned', onEntryFeeEarned);

    ensureNotifyPermission().catch(() => {});

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
      socket.off('audio:gift-bonus', onGiftBonus);
      socket.off('audio:sfu-mode', onSfuMode);
      socket.off('audio:scheduled', onScheduled);
      socket.off('audio:event-reminder', onEventReminder);
      socket.off('audio:knock-request', onKnockRequest);
      socket.off('audio:knock-sent', onKnockSent);
      socket.off('audio:pa-guest-request', onPaGuestRequest);
      socket.off('audio:pa-guest-approved', onPaGuestApproved);
      socket.off('audio:entry-fee-earned', onEntryFeeEarned);
    };
  }, [socket, createPeer, ensureMic, teardown, closeMeshPeers, resumeRemoteAudio]);

  // Tear down mesh only after LiveKit is connected; fall back if SFU fails.
  useEffect(() => {
    if (useSfu && livekit.connected) {
      closeMeshPeers();
      return;
    }
    if (!useSfu || !livekit.error || !socket || !channelIdRef.current) return;
    setUseSfu(false);
    const myId = socket.id;
    const me = youRef.current || membersRef.current.find((m) => m.socketId === myId);
    membersRef.current.forEach((p) => {
      if (p.socketId && p.socketId !== myId && !pcsRef.current.has(p.socketId)) {
        createPeer(
          p.socketId,
          shouldInitiateOffer(me?.role, p.role, myId, p.socketId)
        );
      }
    });
    resumeRemoteAudio();
  }, [useSfu, livekit.connected, livekit.error, members, socket, createPeer, closeMeshPeers, resumeRemoteAudio]);

  // Keep LiveKit mic in sync after SFU handoff.
  useEffect(() => {
    if (!useSfu || !livekit.connected || micMuted) return;
    livekit.setMicEnabled(true).catch(() => {});
  }, [useSfu, livekit.connected, micMuted, livekit]);

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

  const createPaRoom = useCallback(
    (nickname) => {
      setConnecting(true);
      socket?.emit('audio:create-pa', { nickname });
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
      if (useSfuRef.current && livekit.connected) {
        livekit.resumeRemoteAudio();
        await livekit.setMicEnabled(!next);
        setMicMuted(next);
        socket?.emit('audio:mic', { channelId: channelIdRef.current, muted: next });
        return;
      }
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
  }, [micMuted, ensureMic, socket, publishAudioToAllPeers, resumeRemoteAudio, livekit]);

  const setEntryFee = useCallback(
    (entryFee) => {
      socket?.emit('audio:set-entry-fee', { channelId: channelIdRef.current, entryFee });
    },
    [socket]
  );

  const scheduleEvent = useCallback(
    (startsAt, topic) => {
      socket?.emit('audio:schedule-event', { channelId: channelIdRef.current, startsAt, topic });
    },
    [socket]
  );

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

  const setPaTheme = useCallback(
    (themeId) => {
      socket?.emit('audio:set-pa-theme', { channelId: channelIdRef.current, themeId });
    },
    [socket]
  );

  const approvePaGuest = useCallback(
    (targetSocketId) => {
      socket?.emit('audio:approve-pa-guest', { channelId: channelIdRef.current, targetSocketId });
    },
    [socket]
  );

  const denyPaGuest = useCallback(
    (targetSocketId) => {
      socket?.emit('audio:deny-pa-guest', { channelId: channelIdRef.current, targetSocketId });
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
  const dismissGiftBonus = useCallback(() => setGiftBonus(null), []);

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
    giftBonus,
    scheduledEvents,
    useSfu,
    knockStatus,
    audioBlocked,
    livekitConnected: livekit.connected,
    join,
    create,
    createPaRoom,
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
    setPaTheme,
    setEntryFee,
    scheduleEvent,
    approvePaGuest,
    denyPaGuest,
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
    dismissGiftBonus,
    clearKnockStatus: () => setKnockStatus(null),
  };
}

export default useAudioChannel;
