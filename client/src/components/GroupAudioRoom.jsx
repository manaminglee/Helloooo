import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAudioChannel } from '../hooks/useAudioChannel';
import { useIceServers } from '../hooks/useIceServers';
import { useMessageTtl, formatTtl } from '../hooks/useMessageTtl';
import { useYoutubeLive } from '../hooks/useYoutubeLive';
import { CoinRaceGame } from './CoinRaceGame';
import { GiftDrawer } from './GiftDrawer';
import { CreatorLiveModal } from './CreatorLiveModal';

const STAGE_SLOTS = 6;
const ROLE_LABEL = { host: 'Admin', moderator: 'Co-taker', speaker: 'Speaker', listener: 'Viewer' };

/** Compress wallpaper so data-URLs stay under the server cap. */
function compressWallpaper(file, maxBytes = 380_000) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxSide = 1280;
      let { width, height } = img;
      if (width > maxSide || height > maxSide) {
        const scale = maxSide / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.82;
      let data = canvas.toDataURL('image/jpeg', quality);
      while (data.length > maxBytes && quality > 0.35) {
        quality -= 0.12;
        data = canvas.toDataURL('image/jpeg', quality);
      }
      if (data.length > maxBytes) {
        reject(new Error('Image still too large — try a smaller photo'));
        return;
      }
      resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}

function AudioChatBubble({ m, isMe }) {
  const timeLeft = useMessageTtl(m);
  if (!m.system && !m.kind && timeLeft <= 0) return null;
  return (
    <div className={`mm-audio-chat-bubble ${isMe ? 'mm-audio-chat-bubble--me' : ''} ${m.kind === 'gift' ? 'mm-audio-chat-bubble--gift' : ''}`}>
      <span className="mm-audio-chat-bubble__name">{isMe ? 'You' : m.nickname}</span>
      <p className="mm-audio-chat-bubble__text">{m.text}</p>
      {!m.system && (
        <span className={`mm-desk-bubble__ttl text-[9px] ${timeLeft <= 10 ? 'mm-desk-bubble__ttl--warn' : ''}`}>
          {formatTtl(timeLeft)}
        </span>
      )}
    </div>
  );
}

function StageAvatar({ member, speaking, size = 'lg', onGiftTap }) {
  const dim = size === 'lg' ? 'mm-audio-avatar mm-audio-avatar--lg' : 'mm-audio-avatar mm-audio-avatar--sm';
  const royal =
    member?.role === 'host'
      ? 'mm-audio-royal mm-audio-royal--host'
      : member?.role === 'moderator'
        ? 'mm-audio-royal mm-audio-royal--mod'
        : '';
  const showMuted = member?.role !== 'listener' && !!member?.micMuted;
  const live = member?.role !== 'listener' && !member?.micMuted;

  return (
    <button
      type="button"
      data-audio-member={member?.socketId || undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (member && onGiftTap) onGiftTap(member);
      }}
      className={`${dim} rounded-full grid place-items-center font-bold text-white relative transition-all duration-200 ${royal} ${
        speaking ? 'mm-audio-avatar--speaking bg-emerald-500/25 ring-2 ring-emerald-400 scale-105' : live ? 'bg-emerald-500/15 ring-2 ring-emerald-400/50' : 'bg-white/[0.07] ring-1 ring-white/10'
      }`}
      title={onGiftTap ? `Gift ${member?.nickname}` : member?.nickname}
    >
      {(member?.nickname || '?').slice(0, 1).toUpperCase()}
      {showMuted && (
        <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#0d1016] grid place-items-center text-[9px] ring-1 ring-white/15" aria-label="Muted">🔇</span>
      )}
      {live && (
        <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-emerald-500 grid place-items-center text-[8px] font-black text-black ring-1 ring-emerald-300/80" aria-label="Live">●</span>
      )}
      {member?.role === 'host' && <span className="mm-audio-badge mm-audio-badge--host" aria-label="Admin">👑</span>}
      {member?.role === 'moderator' && <span className="mm-audio-badge mm-audio-badge--mod" aria-label="Co-taker">🛡️</span>}
    </button>
  );
}

function StageSlot({
  index, occupant, speaking, canClaim, onClaim, canModerate, isSelf, onModerate, isHost, onGiftTap,
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  if (!occupant) {
    return (
      <button
        type="button"
        onClick={() => canClaim && onClaim(index)}
        disabled={!canClaim}
        className="mm-audio-slot mm-audio-slot--empty"
        aria-label={`Join stage slot ${index + 1}`}
      >
        <span className="mm-audio-slot__placeholder">+</span>
        <span className="mm-audio-slot__label">Join</span>
        <span className="mm-audio-slot__hint">Seat {index + 1}</span>
      </button>
    );
  }

  return (
    <div className="mm-audio-slot relative">
      <div className="flex flex-col items-center gap-1">
        <StageAvatar
          member={occupant}
          speaking={speaking}
          onGiftTap={!isSelf ? onGiftTap : undefined}
        />
        <button
          type="button"
          onClick={() => canModerate && !isSelf && setMenuOpen((o) => !o)}
          className="flex flex-col items-center focus:outline-none"
        >
          <span className="text-[10px] text-white/75 truncate max-w-full">{isSelf ? 'You' : occupant.nickname}</span>
          <span className={`text-[9px] ${occupant.role === 'host' ? 'text-amber-300 font-bold' : occupant.role === 'moderator' ? 'text-sky-300 font-bold' : 'text-white/35'}`}>
            {ROLE_LABEL[occupant.role]}
          </span>
        </button>
      </div>

      {menuOpen && canModerate && !isSelf && (
        <>
          <button type="button" className="fixed inset-0 z-20" aria-label="Close" onClick={() => setMenuOpen(false)} />
          <div
            className="absolute top-full mt-1 z-30 left-1/2 -translate-x-1/2 w-40 rounded-xl border border-white/12 bg-[#171b24] p-1 shadow-2xl"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button type="button" className="w-full text-left px-2.5 py-2 text-[11px] text-amber-200 hover:bg-amber-500/10 rounded-lg" onClick={() => { onGiftTap?.(occupant); setMenuOpen(false); }}>
              🎁 Send gift
            </button>
            <button type="button" className="w-full text-left px-2.5 py-2 text-[11px] text-white/80 hover:bg-white/10 rounded-lg" onClick={() => { onModerate(occupant.socketId, occupant.forceMuted ? 'unmute' : 'mute'); setMenuOpen(false); }}>
              {occupant.forceMuted ? '🔊 Unmute' : '🔇 Mute'}
            </button>
            <button type="button" className="w-full text-left px-2.5 py-2 text-[11px] text-white/80 hover:bg-white/10 rounded-lg" onClick={() => { onModerate(occupant.socketId, 'kick'); setMenuOpen(false); }}>
              🚫 Remove
            </button>
            <button type="button" className="w-full text-left px-2.5 py-2 text-[11px] text-rose-300 hover:bg-rose-500/10 rounded-lg" onClick={() => { onModerate(occupant.socketId, 'block'); setMenuOpen(false); }}>
              ⛔ Block
            </button>
            {isHost && occupant.role !== 'moderator' && (
              <button type="button" className="w-full text-left px-2.5 py-2 text-[11px] text-amber-200 hover:bg-amber-500/10 rounded-lg" onClick={() => { onModerate(occupant.socketId, 'promote'); setMenuOpen(false); }}>
                🛡️ Make co-taker
              </button>
            )}
            {isHost && occupant.role === 'moderator' && (
              <button type="button" className="w-full text-left px-2.5 py-2 text-[11px] text-white/80 hover:bg-white/10 rounded-lg" onClick={() => { onModerate(occupant.socketId, 'demote'); setMenuOpen(false); }}>
                Remove co-taker
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function GroupAudioRoom({ socket, iceServers: iceServersProp, coins = 0, nickname = 'Anonymous', initialChannelId = null, isCreator = false, onExit }) {
  const { iceServers: iceFromHook } = useIceServers();
  const iceServers = iceServersProp?.length ? iceServersProp : iceFromHook;
  const {
    channel, members, micMuted, speakingIds, error, connecting, chatMessages,
    join, create, leave, toggleMic, moderate, grantSpeak, claimSlot,
    approveJoin, denyJoin, renameRoom, setWallpaper, setGamesEnabled, sendChat, resumeRemoteAudio, clearError,
  } = useAudioChannel(socket, iceServers);

  const [channels, setChannels] = useState([]);
  const [topic, setTopic] = useState('');
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftTarget, setGiftTarget] = useState(null);
  const [raceOpen, setRaceOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [wallpaperBusy, setWallpaperBusy] = useState(false);
  const [wallpaperMsg, setWallpaperMsg] = useState(null);
  const [uiMsg, setUiMsg] = useState(null);
  const chatEndRef = useRef(null);
  const wallpaperInputRef = useRef(null);
  const liveCameraRef = useRef(null);
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [liveCamBusy, setLiveCamBusy] = useState(false);

  const youtubeLive = useYoutubeLive({
    socket,
    enabled: isCreator,
    roomId: channel?.channelId || channel?.id || null,
    onStop: () => {
      liveCameraRef.current?.getTracks().forEach((t) => t.stop());
      liveCameraRef.current = null;
    },
  });

  useEffect(() => {
    if (!socket) return undefined;
    const onList = ({ channels: c }) => setChannels(c || []);
    socket.on('audio:channels', onList);
    socket.emit('audio:list');
    const id = setInterval(() => socket.emit('audio:list'), 8000);

    let cancelled = false;
    (async () => {
      try {
        const { API_BASE } = await import('../config/apiBase');
        const res = await fetch(`${API_BASE}/api/audio/channels`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (Array.isArray(data.channels) && data.channels.length) {
            setChannels((prev) => (prev.length ? prev : data.channels));
          }
        }
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
      socket.off('audio:channels', onList);
      clearInterval(id);
    };
  }, [socket]);

  const autoJoinRef = useRef(false);
  useEffect(() => {
    if (!channel) autoJoinRef.current = false;
  }, [channel]);

  useEffect(() => {
    if (!socket || !initialChannelId || channel || autoJoinRef.current) return;
    autoJoinRef.current = true;
    join(initialChannelId, nickname);
  }, [socket, initialChannelId, channel, join, nickname]);

  const me = members.find((m) => m.socketId === socket?.id);
  const isHost = me?.role === 'host';
  const isMod = me?.role === 'moderator';
  const canModerate = isHost || isMod;
  // Raised hands float to the front so a moderator sees who is waiting
  // without scanning the whole audience.
  const listeners = members
    .filter((m) => m.role === 'listener')
    .sort((a, b) => (b.handRaised ? 1 : 0) - (a.handRaised ? 1 : 0));
  const raisedHands = listeners.filter((m) => m.handRaised).length;
  const pendingJoins = channel?.pendingJoins || [];
  const maxSlots = channel?.maxSpeakers || STAGE_SLOTS;

  const slots = useMemo(() => {
    const arr = Array.from({ length: maxSlots }, () => null);
    members.forEach((m) => {
      if (m.slot != null && m.slot >= 0 && m.slot < maxSlots) arr[m.slot] = m;
      else if (m.role === 'host' && m.slot == null) arr[0] = arr[0] || m;
    });
    members
      .filter((m) => m.role !== 'listener' && m.slot == null && m !== arr[0])
      .forEach((m) => {
        const i = arr.findIndex((x) => !x);
        if (i >= 0) arr[i] = m;
      });
    return arr;
  }, [members, maxSlots]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  useEffect(() => {
    if (channel?.topic) setRenameValue(channel.topic);
  }, [channel?.topic]);

  useEffect(() => {
    if (!uiMsg) return undefined;
    const t = setTimeout(() => setUiMsg(null), 2600);
    return () => clearTimeout(t);
  }, [uiMsg]);

  // Keyboard shortcuts for the live room:
  //   M / Space  toggle mic (speakers only)      Esc  leave the room
  const micRef = useRef(null);
  const leaveRef = useRef(null);
  useEffect(() => {
    if (!channel) return undefined;
    const handler = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        leaveRef.current?.();
        return;
      }
      // Space must still activate a focused button (keyboard a11y) — only
      // treat it as push-to-talk when nothing interactive has focus.
      const focused = document.activeElement;
      const focusInteractive = !!focused && focused !== document.body
        && /^(BUTTON|A|SELECT|SUMMARY)$/.test(focused.tagName);
      if (e.code === 'KeyM' || (e.code === 'Space' && !focusInteractive)) {
        e.preventDefault();
        micRef.current?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [channel]);

  const shareRoom = async () => {
    const rid = channel?.channelId || channel?.id;
    if (!rid) return;
    const url = `${window.location.origin}/join/${rid}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: channel.topic || 'Live voice room', text: 'Join my live voice room 🎙️', url });
        return;
      } catch {
        return; // user closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setUiMsg('Invite link copied — send it to friends');
    } catch {
      setUiMsg(url);
    }
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sendChat(chatInput);
    setChatInput('');
  };

  const handleLeave = () => {
    if (youtubeLive.isLive) youtubeLive.stopLive();
    liveCameraRef.current?.getTracks().forEach((t) => t.stop());
    liveCameraRef.current = null;
    leave();
    onExit?.();
  };

  leaveRef.current = handleLeave;
  // Listeners have no mic to toggle — the shortcut asks for a seat instead.
  micRef.current = me && me.role !== 'listener' ? toggleMic : null;

  const ensureLiveCamera = async () => {
    if (liveCameraRef.current) return liveCameraRef.current;
    setLiveCamBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      liveCameraRef.current = stream;
      return stream;
    } finally {
      setLiveCamBusy(false);
    }
  };

  const startYoutubeLive = async (streamKey) => {
    const stream = await ensureLiveCamera();
    await youtubeLive.startLive(streamKey, stream);
    setShowLiveModal(false);
  };

  const stopYoutubeLive = () => {
    youtubeLive.stopLive();
    setShowLiveModal(false);
  };

  const openGiftFor = (member) => {
    if (!member || member.socketId === socket?.id) return;
    setGiftTarget(member.socketId);
    setGiftOpen(true);
  };

  const onWallpaperFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setWallpaperMsg('Choose an image file');
      return;
    }
    setWallpaperBusy(true);
    setWallpaperMsg('Uploading…');
    try {
      const dataUrl = await compressWallpaper(file);
      setWallpaper(dataUrl);
      setWallpaperMsg('Wallpaper updated');
      setTimeout(() => setWallpaperMsg(null), 2500);
    } catch (err) {
      setWallpaperMsg(err?.message || 'Wallpaper failed');
    } finally {
      setWallpaperBusy(false);
    }
  };

  if (!channel) {
    return (
      <div className="mm-shell mm-section mm-voice-lobby">
        <header className="mm-voice-lobby__hero">
          <span className="mm-eyebrow">🎙️ Voice rooms</span>
          <h2 className="mm-h2 mt-3 text-white">Talk live · 6 stage seats</h2>
          <p className="mm-body mt-1.5">Create a room to become admin. Guests tap empty seats — you approve who joins the panel.</p>
        </header>

        <div className="mm-voice-lobby__create">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Room name (emojis ok) 🎉"
            maxLength={48}
            className="mm-voice-lobby__input"
          />
          <button type="button" onClick={() => create(topic || 'Open voice room', false, nickname)} disabled={connecting} className="mm-btn mm-btn--primary sm:!px-6">
            {connecting ? 'Starting…' : 'Start room'}
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5">
            <span className="text-xs text-rose-200">{error}</span>
            <button type="button" onClick={clearError} className="text-rose-200/70 text-lg leading-none px-1">×</button>
          </div>
        )}

        <div className="mm-voice-lobby__list-head">
          <h3>Live rooms</h3>
          <span>{channels.length} open</span>
        </div>

        <div className="mm-voice-room-grid">
          {channels.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={connecting}
              onClick={() => join(c.id, nickname)}
              className="mm-voice-room-card"
            >
              <div className="mm-voice-room-card__top">
                <span className="mm-voice-room-card__title">{c.topic}</span>
                {c.hasActiveGame && <span className="mm-voice-room-card__race">🏁 Race</span>}
              </div>
              <div className="mm-voice-room-card__meta">
                <span>🎙 {c.speakerCount}/{c.maxSpeakers || 6} stage</span>
                <span>👥 {c.memberCount}</span>
              </div>
              <span className="mm-voice-room-card__cta">Join →</span>
            </button>
          ))}
          {channels.length === 0 && (
            <div className="mm-voice-room-empty">
              <div className="text-4xl mb-3">🎙️</div>
              <p className="text-sm text-white/60 font-medium">No live rooms yet — start the first one</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const stageStyle = channel.wallpaper
    ? {
      backgroundImage: `linear-gradient(rgba(8,9,15,.55), rgba(8,9,15,.82)), url(${channel.wallpaper})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
    : undefined;

  return (
    <div
      className="min-h-[100dvh] max-w-[100vw] flex flex-col bg-[#08090f] text-white overflow-x-hidden mm-voice-room"
      onPointerDownCapture={() => resumeRemoteAudio?.()}
    >
      <header className="mm-audio-room-header">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold truncate">{channel.topic}</h2>
          <p className="text-[11px] text-white/40">
            {members.length} here · {slots.filter(Boolean).length}/{maxSlots} on stage
            {raisedHands > 0 && <span className="text-amber-300 font-semibold"> · ✋ {raisedHands} waiting</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={shareRoom}
            className="mm-btn mm-btn--ghost !px-3 !py-1.5 !text-xs"
            title="Share invite link"
            aria-label="Share invite link"
          >
            🔗 Invite
          </button>
          {canModerate && (
            <button type="button" onClick={() => setAdminOpen(true)} className={`mm-audio-role-pill ${isHost ? 'mm-audio-role-pill--host' : 'mm-audio-role-pill--mod'}`}>
              {isHost ? '👑 Admin' : '🛡️ Co-taker'}
            </button>
          )}
          <span className="text-xs font-bold text-amber-300 tabular-nums">🪙 {coins}</span>
        </div>
      </header>

      {error && (
        <div className="mx-4 mb-2 flex items-center justify-between gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5">
          <span className="text-xs text-amber-100">{error}</span>
          <button type="button" onClick={clearError} className="text-amber-100/70 text-lg leading-none px-1">×</button>
        </div>
      )}

      {uiMsg && (
        <div className="mx-4 mb-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-2.5">
          <span className="text-xs text-emerald-100 break-all">{uiMsg}</span>
        </div>
      )}

      {pendingJoins.length > 0 && canModerate && (
        <div className="mx-4 mb-2 rounded-xl border border-violet-400/30 bg-violet-500/10 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-200 mb-2">Join requests</p>
          <div className="flex flex-col gap-2">
            {pendingJoins.map((p) => (
              <div key={p.socketId} className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate text-white/80">{p.nickname} → seat {(p.slot ?? 0) + 1}</span>
                <button type="button" className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-200" onClick={() => approveJoin(p.socketId, p.slot)}>Approve</button>
                <button type="button" className="px-2 py-1 rounded-lg bg-white/5 text-white/50" onClick={() => denyJoin(p.socketId)}>Deny</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <main className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[1fr_20rem] lg:gap-4 px-3 sm:px-4 pb-2 overflow-x-hidden">
        <section className="mm-audio-stage-panel flex-shrink-0 lg:flex-shrink min-h-0 overflow-y-auto overflow-x-hidden" style={stageStyle}>
          <h3 className="mm-audio-panel-label">Stage · tap a profile to gift · {maxSlots} seats</h3>
          <div className="mm-audio-slot-grid">
            {slots.map((occupant, i) => (
              <StageSlot
                key={i}
                index={i}
                occupant={occupant}
                speaking={occupant && speakingIds.has(occupant.socketId) && !occupant.micMuted}
                canClaim={!occupant && !!me}
                onClaim={claimSlot}
                canModerate={canModerate}
                isSelf={occupant?.socketId === socket?.id}
                onModerate={moderate}
                isHost={isHost}
                onGiftTap={openGiftFor}
              />
            ))}
          </div>

          {listeners.length > 0 && (
            <>
              <h3 className="mm-audio-panel-label mt-5">
                Viewing · {listeners.length}
                {raisedHands > 0 && <span className="text-amber-300"> · {raisedHands} raised hand{raisedHands > 1 ? 's' : ''}</span>}
              </h3>
              <div className="flex flex-wrap gap-2">
                {listeners.map((m) => (
                  <div
                    key={m.socketId}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] ${
                      m.handRaised
                        ? 'bg-amber-400/12 border-amber-300/35 text-amber-100'
                        : 'bg-white/5 border-white/8 text-white/60'
                    }`}
                  >
                    {m.handRaised && <span aria-label="Hand raised" title="Wants to speak">✋</span>}
                    <StageAvatar member={m} speaking={false} size="sm" onGiftTap={m.socketId !== socket?.id ? openGiftFor : undefined} />
                    <button
                      type="button"
                      onClick={() => canModerate && grantSpeak(m.socketId, true)}
                      title={canModerate ? 'Invite to stage' : m.nickname}
                      className="truncate max-w-[6rem]"
                    >
                      {m.socketId === socket?.id ? 'You' : m.nickname}
                      {canModerate && <span className="text-emerald-300 ml-1">↗</span>}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <aside className="mm-audio-chat-panel flex-1 min-h-0 flex flex-col mt-4 lg:mt-0">
          <div className="mm-audio-chat-panel__head">
            <span>Room chat</span>
            <span className="text-white/35 text-[10px]">60s vanish</span>
          </div>
          <div className="mm-audio-chat-panel__messages custom-scrollbar">
            {chatMessages.length === 0 && <p className="text-xs text-white/30 text-center py-6">Say hello…</p>}
            {chatMessages.map((m) => (
              <AudioChatBubble key={m.id} m={m} isMe={m.socketId === socket?.id} />
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="mm-audio-chat-panel__input-row">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
              placeholder="Type a message…"
              className="mm-audio-chat-panel__input"
              maxLength={280}
            />
            <button type="button" onClick={handleSendChat} className="mm-audio-chat-panel__send" aria-label="Send">→</button>
          </div>
        </aside>
      </main>

      <div className="mm-actionbar sticky bottom-0">
        <div className="mm-shell mm-shell--wide flex items-center gap-2 !px-4">
          {me?.role === 'listener' ? (
            <button
              type="button"
              onClick={() => {
                const idx = slots.findIndex((s) => !s);
                if (idx === -1) setUiMsg('Stage is full — a seat will free up when someone steps down');
                else claimSlot(idx);
              }}
              className="mm-btn mm-btn--ghost flex-1"
            >
              Request a seat
            </button>
          ) : (
            <button type="button" onClick={toggleMic} className={`mm-btn flex-1 ${micMuted ? 'mm-btn--ghost' : '!bg-emerald-500 !text-black !border-emerald-400'}`}>
              {micMuted ? '🔇 Unmute' : '🎙 Live'}
            </button>
          )}
          {isCreator && (
            <button
              type="button"
              disabled={liveCamBusy}
              onClick={() => (youtubeLive.isLive ? stopYoutubeLive() : setShowLiveModal(true))}
              className={`mm-btn !px-4 ${youtubeLive.isLive ? '!bg-rose-500 !text-white !border-rose-400' : '!bg-rose-500/15 !text-rose-200 !border-rose-400/25'}`}
              title={youtubeLive.isLive ? 'Stop YouTube live' : 'Go live on YouTube (opens camera)'}
            >
              {youtubeLive.isLive ? '🔴 Live' : '📡 Live'}
            </button>
          )}
          {channel.gamesEnabled !== false && (
            <button type="button" onClick={() => setRaceOpen(true)} className="mm-btn !px-4 !bg-violet-500/15 !text-violet-200 !border-violet-400/25" aria-label="Coin race">🏁</button>
          )}
          <button
            type="button"
            onClick={() => { setGiftTarget(null); setGiftOpen((o) => !o); }}
            className="mm-btn !px-4 !bg-amber-400/15 !text-amber-300 !border-amber-400/25"
            aria-label="Gifts"
          >
            🎁
          </button>
          <button type="button" onClick={handleLeave} className="mm-btn mm-btn--danger !px-4">Leave</button>
        </div>
      </div>

      {adminOpen && canModerate && (
        <div className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center p-4 bg-black/75" onClick={() => setAdminOpen(false)} role="presentation">
          <div className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0f121a] p-4" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold">{isHost ? 'Room admin' : 'Co-taker tools'}</h3>
              <button type="button" onClick={() => setAdminOpen(false)} className="w-8 h-8 rounded-lg bg-white/5">✕</button>
            </div>

            {isHost && (
              <>
                <label className="block text-[10px] font-bold uppercase text-white/40 mb-1">Room name (emoji ok)</label>
                <div className="flex gap-2 mb-4">
                  <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={48} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  <button type="button" className="mm-btn mm-btn--primary !px-3" onClick={() => renameRoom(renameValue)}>Save</button>
                </div>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    className="mm-btn mm-btn--ghost flex-1"
                    disabled={wallpaperBusy}
                    onClick={() => wallpaperInputRef.current?.click()}
                  >
                    {wallpaperBusy ? '…' : '🖼 Wallpaper'}
                  </button>
                  <button type="button" className="mm-btn mm-btn--ghost flex-1" onClick={() => { setWallpaper(null); setWallpaperMsg('Wallpaper cleared'); }}>Clear</button>
                  <input ref={wallpaperInputRef} type="file" accept="image/*" className="hidden" onChange={onWallpaperFile} />
                </div>
                {wallpaperMsg && <p className="text-[11px] text-amber-200/90 mb-3">{wallpaperMsg}</p>}
                <button
                  type="button"
                  className="mm-btn mm-btn--ghost w-full mb-4"
                  onClick={() => setGamesEnabled(!(channel.gamesEnabled !== false))}
                >
                  {channel.gamesEnabled !== false ? '🎮 Games on — tap to disable' : '🎮 Games off — tap to enable'}
                </button>
              </>
            )}

            <p className="text-[10px] text-white/40 mb-2">Invite viewers to stage</p>
            <div className="flex flex-col gap-1 mb-3">
              {listeners.map((m) => (
                <button key={m.socketId} type="button" className="text-left text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10" onClick={() => grantSpeak(m.socketId, true)}>
                  ↗ Invite {m.nickname}
                </button>
              ))}
              {listeners.length === 0 && <p className="text-[11px] text-white/30">No viewers waiting.</p>}
            </div>

            {isHost && (
              <>
                <p className="text-[10px] text-white/40 mb-2">Assign co-taker (one at a time)</p>
                <div className="flex flex-col gap-1 mb-3">
                  {members
                    .filter((m) => m.socketId !== socket?.id && m.role !== 'host')
                    .map((m) => (
                      <div key={m.socketId} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5">
                        <span className="flex-1 min-w-0 text-xs truncate text-white/80">
                          {m.nickname}
                          <span className="text-white/35"> · {ROLE_LABEL[m.role] || m.role}</span>
                        </span>
                        {m.role === 'moderator' ? (
                          <button type="button" className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-md bg-white/10 text-white/70" onClick={() => moderate(m.socketId, 'demote')}>
                            Remove
                          </button>
                        ) : (
                          <button type="button" className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-md bg-amber-500/20 text-amber-200 border border-amber-400/30" onClick={() => moderate(m.socketId, 'promote')}>
                            Make co-taker
                          </button>
                        )}
                      </div>
                    ))}
                  {members.filter((m) => m.socketId !== socket?.id && m.role !== 'host').length === 0 && (
                    <p className="text-[11px] text-white/30">Need another person in the room.</p>
                  )}
                </div>
              </>
            )}

            {!isHost && <p className="text-[10px] text-white/35">Co-takers can mute, remove, approve seats, and invite — not rename, wallpaper, or assign co-takers.</p>}
          </div>
        </div>
      )}

      {raceOpen && channel.gamesEnabled !== false && (
        <div className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center p-4 bg-black/75" onClick={() => setRaceOpen(false)} role="presentation">
          <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0f121a] p-4" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold">Highway Heist · Coin Race</h3>
              <button type="button" onClick={() => setRaceOpen(false)} className="w-8 h-8 rounded-lg bg-white/5">✕</button>
            </div>
            <CoinRaceGame socket={socket} channelId={channel.channelId} coins={coins} />
          </div>
        </div>
      )}

      <GiftDrawer
        socket={socket}
        channelId={channel.channelId}
        members={members}
        coins={coins}
        open={giftOpen}
        initialTarget={giftTarget}
        onClose={() => { setGiftOpen(false); setGiftTarget(null); }}
      />

      {isCreator && (
        <CreatorLiveModal
          open={showLiveModal}
          onClose={() => setShowLiveModal(false)}
          isLive={youtubeLive.isLive}
          onStart={startYoutubeLive}
          onStop={stopYoutubeLive}
        />
      )}
    </div>
  );
}

export default GroupAudioRoom;
