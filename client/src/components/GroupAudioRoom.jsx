import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAudioChannel } from '../hooks/useAudioChannel';
import { useMessageTtl, formatTtl } from '../hooks/useMessageTtl';
import { CoinRaceGame } from './CoinRaceGame';
import { GiftDrawer } from './GiftDrawer';

const STAGE_SLOTS = 6;
const ROLE_LABEL = { host: 'Admin', moderator: 'Co-taker', speaker: 'Speaker', listener: 'Viewer' };

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

function StageAvatar({ member, speaking, size = 'lg' }) {
  const dim = size === 'lg' ? 'w-[4.5rem] h-[4.5rem] text-xl' : 'w-12 h-12 text-base';
  const royal = member?.role === 'host' ? 'mm-audio-royal mm-audio-royal--host' : member?.role === 'moderator' ? 'mm-audio-royal mm-audio-royal--mod' : '';
  return (
    <div
      className={`${dim} rounded-full grid place-items-center font-bold text-white relative transition-all duration-200 ${royal} ${
        speaking ? 'bg-emerald-500/25 ring-2 ring-emerald-400 scale-105' : 'bg-white/[0.07] ring-1 ring-white/10'
      }`}
    >
      {(member?.nickname || '?').slice(0, 1).toUpperCase()}
      {member?.micMuted && member?.role !== 'listener' && (
        <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#0d1016] grid place-items-center text-[9px] ring-1 ring-white/15">🔇</span>
      )}
      {member?.role === 'host' && <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[10px]">👑</span>}
      {member?.role === 'moderator' && <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[10px]">🛡️</span>}
    </div>
  );
}

function StageSlot({ index, occupant, speaking, canClaim, onClaim, canModerate, isSelf, onModerate, isHost }) {
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
      <button
        type="button"
        onClick={() => canModerate && !isSelf && setMenuOpen((o) => !o)}
        className="flex flex-col items-center gap-1 focus:outline-none"
      >
        <StageAvatar member={occupant} speaking={speaking} />
        <span className="text-[10px] text-white/75 truncate max-w-full">{isSelf ? 'You' : occupant.nickname}</span>
        <span className="text-[9px] text-white/35">{ROLE_LABEL[occupant.role]}</span>
      </button>

      {menuOpen && canModerate && !isSelf && (
        <>
          <button type="button" className="fixed inset-0 z-20" aria-label="Close" onClick={() => setMenuOpen(false)} />
          <div className="absolute top-full mt-1 z-30 left-1/2 -translate-x-1/2 w-40 rounded-xl border border-white/12 bg-[#171b24] p-1 shadow-2xl">
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

export function GroupAudioRoom({ socket, iceServers, coins = 0, nickname = 'Anonymous', onExit }) {
  const {
    channel, members, micMuted, speakingIds, error, connecting, chatMessages,
    join, create, leave, toggleMic, moderate, grantSpeak, claimSlot,
    approveJoin, denyJoin, renameRoom, setWallpaper, setGamesEnabled, sendChat, clearError,
  } = useAudioChannel(socket, iceServers);

  const [channels, setChannels] = useState([]);
  const [topic, setTopic] = useState('');
  const [giftOpen, setGiftOpen] = useState(false);
  const [raceOpen, setRaceOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);
  const wallpaperInputRef = useRef(null);

  useEffect(() => {
    if (!socket) return undefined;
    const onList = ({ channels: c }) => setChannels(c || []);
    socket.on('audio:channels', onList);
    socket.emit('audio:list');
    const id = setInterval(() => socket.emit('audio:list'), 8000);
    return () => {
      socket.off('audio:channels', onList);
      clearInterval(id);
    };
  }, [socket]);

  const me = members.find((m) => m.socketId === socket?.id);
  const isHost = me?.role === 'host';
  const isMod = me?.role === 'moderator';
  const canModerate = isHost || isMod;
  const listeners = members.filter((m) => m.role === 'listener');
  const pendingJoins = channel?.pendingJoins || [];
  const maxSlots = channel?.maxSpeakers || STAGE_SLOTS;

  const slots = useMemo(() => {
    const arr = Array.from({ length: maxSlots }, () => null);
    members.forEach((m) => {
      if (m.slot != null && m.slot >= 0 && m.slot < maxSlots) arr[m.slot] = m;
      else if (m.role === 'host' && m.slot == null) arr[0] = arr[0] || m;
    });
    // Place speakers without slots into first free seats for display
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

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sendChat(chatInput);
    setChatInput('');
  };

  const handleLeave = () => {
    leave();
    onExit?.();
  };

  const onWallpaperFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 280 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => setWallpaper(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  if (!channel) {
    return (
      <div className="mm-shell mm-section">
        <header className="mb-6 text-center sm:text-left">
          <span className="mm-eyebrow">🎙️ Voice rooms</span>
          <h2 className="mm-h2 mt-3 text-white">Talk live · 6 stage seats</h2>
          <p className="mm-body mt-1.5">Create a room to become admin. Guests tap empty seats — you approve who joins the panel.</p>
        </header>

        <div className="flex flex-col sm:flex-row gap-2 mb-6">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Room name (emojis ok) 🎉"
            maxLength={48}
            className="flex-1 min-h-[var(--mm-tap)] bg-white/5 border border-white/12 rounded-xl px-4 text-[16px] sm:text-sm text-white outline-none focus:border-violet-400/60"
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

        <div className="mm-grid-auto">
          {channels.map((c) => (
            <button key={c.id} type="button" onClick={() => join(c.id, nickname)} className="mm-card mm-card-glow text-left p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-sm font-bold text-white truncate">{c.topic}</span>
                {c.hasActiveGame && <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300">🏁</span>}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-white/45">
                <span>🎙 {c.speakerCount}/{c.maxSpeakers || 6}</span>
                <span>👥 {c.memberCount}</span>
              </div>
            </button>
          ))}
          {channels.length === 0 && (
            <div className="col-span-full text-center py-12">
              <div className="text-4xl mb-3">🎙️</div>
              <p className="text-sm text-white/60 font-medium">No live rooms yet</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const stageStyle = channel.wallpaper
    ? { backgroundImage: `linear-gradient(rgba(8,9,15,.72), rgba(8,9,15,.88)), url(${channel.wallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : undefined;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#08090f] text-white">
      <header className="mm-audio-room-header">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold truncate">{channel.topic}</h2>
          <p className="text-[11px] text-white/40">{members.length} here · {slots.filter(Boolean).length}/{maxSlots} on stage</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canModerate && (
            <button type="button" onClick={() => setAdminOpen(true)} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-200 border border-amber-400/25">
              {isHost ? 'Admin' : 'Co-taker'}
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

      <main className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[1fr_20rem] lg:gap-4 px-4 pb-2">
        <section className="mm-audio-stage-panel flex-shrink-0 lg:flex-shrink min-h-0 overflow-y-auto" style={stageStyle}>
          <h3 className="mm-audio-panel-label">Stage · {maxSlots} seats</h3>
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
              />
            ))}
          </div>

          {listeners.length > 0 && (
            <>
              <h3 className="mm-audio-panel-label mt-5">Viewing · {listeners.length}</h3>
              <div className="flex flex-wrap gap-2">
                {listeners.map((m) => (
                  <button
                    key={m.socketId}
                    type="button"
                    className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/5 border border-white/8 text-[10px] text-white/60"
                    onClick={() => canModerate && grantSpeak(m.socketId, true)}
                    title={canModerate ? 'Invite to stage' : m.nickname}
                  >
                    <StageAvatar member={m} speaking={false} size="sm" />
                    {m.socketId === socket?.id ? 'You' : m.nickname}
                    {canModerate && <span className="text-emerald-300">↗</span>}
                  </button>
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
            <button type="button" onClick={() => claimSlot(slots.findIndex((s) => !s))} className="mm-btn mm-btn--ghost flex-1">
              Request a seat
            </button>
          ) : (
            <button type="button" onClick={toggleMic} className={`mm-btn flex-1 ${micMuted ? 'mm-btn--ghost' : '!bg-emerald-500 !text-black !border-emerald-400'}`}>
              {micMuted ? '🔇 Unmute' : '🎙 Live'}
            </button>
          )}
          {channel.gamesEnabled !== false && (
            <button type="button" onClick={() => setRaceOpen(true)} className="mm-btn !px-4 !bg-violet-500/15 !text-violet-200 !border-violet-400/25" aria-label="Coin race">🏁</button>
          )}
          <button type="button" onClick={() => setGiftOpen((o) => !o)} className="mm-btn !px-4 !bg-amber-400/15 !text-amber-300 !border-amber-400/25" aria-label="Gifts">🎁</button>
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
                <div className="flex gap-2 mb-4">
                  <button type="button" className="mm-btn mm-btn--ghost flex-1" onClick={() => wallpaperInputRef.current?.click()}>🖼 Wallpaper</button>
                  <button type="button" className="mm-btn mm-btn--ghost flex-1" onClick={() => setWallpaper(null)}>Clear</button>
                  <input ref={wallpaperInputRef} type="file" accept="image/*" className="hidden" onChange={onWallpaperFile} />
                </div>
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
            {!isHost && <p className="text-[10px] text-white/35">Co-takers can mute, remove, approve seats, and invite — not rename, wallpaper, or assign co-takers.</p>}
          </div>
        </div>
      )}

      {raceOpen && channel.gamesEnabled !== false && (
        <div className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center p-4 bg-black/75" onClick={() => setRaceOpen(false)} role="presentation">
          <div className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0f121a] p-4" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold">Coin race</h3>
              <button type="button" onClick={() => setRaceOpen(false)} className="w-8 h-8 rounded-lg bg-white/5">✕</button>
            </div>
            <CoinRaceGame socket={socket} channelId={channel.channelId} coins={coins} />
          </div>
        </div>
      )}

      <GiftDrawer socket={socket} channelId={channel.channelId} members={members} coins={coins} open={giftOpen} onClose={() => setGiftOpen(false)} />
    </div>
  );
}

export default GroupAudioRoom;
