import React, { useEffect, useState, useRef } from 'react';
import { useAudioChannel } from '../hooks/useAudioChannel';
import { CoinRaceGame } from './CoinRaceGame';
import { GiftDrawer } from './GiftDrawer';

/**
 * Group AUDIO channel room — replaces the old group text room.
 *
 * Mobile-first layout:
 *   phone   → stage, then a "Race"/"People" tab switch, sticky control bar
 *   desktop → stage on the left, game rail on the right, same control bar
 */

const ROLE_LABEL = { host: 'Host', moderator: 'Mod', speaker: 'Speaker', listener: 'Listener' };

function Avatar({ member, speaking, size = 'md' }) {
  const dim = size === 'lg' ? 'w-16 h-16 text-xl' : 'w-12 h-12 text-base';
  return (
    <div
      className={`${dim} rounded-2xl grid place-items-center font-bold text-white relative transition-all duration-200 ${
        speaking
          ? 'bg-emerald-500/25 ring-2 ring-emerald-400 mm-speaking scale-105'
          : 'bg-white/[0.07] ring-1 ring-white/10'
      }`}
    >
      {(member.nickname || '?').slice(0, 1).toUpperCase()}
      {member.micMuted && member.role !== 'listener' && (
        <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#0d1016] grid place-items-center text-[9px] ring-1 ring-white/15">
          🔇
        </span>
      )}
      {member.handRaised && <span className="absolute -top-1.5 -left-1.5 text-sm">✋</span>}
    </div>
  );
}

function MemberTile({ member, speaking, canModerate, onModerate, onGrantSpeak, isSelf, size }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative flex flex-col items-center gap-1.5 w-[4.25rem] sm:w-20">
      <button
        type="button"
        onClick={() => canModerate && !isSelf && setMenuOpen((o) => !o)}
        className="mm-3d focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded-2xl"
        aria-label={canModerate && !isSelf ? `Manage ${member.nickname}` : member.nickname}
      >
        <span className="mm-3d-inner block">
          <Avatar member={member} speaking={speaking} size={size} />
        </span>
      </button>

      <span className="text-[10px] text-white/70 truncate max-w-full text-center leading-tight">
        {isSelf ? 'You' : member.nickname}
        {member.verified && <span className="text-sky-300 ml-0.5">✔</span>}
      </span>
      <span className="text-[9px] text-white/30 -mt-1">{ROLE_LABEL[member.role]}</span>

      {menuOpen && canModerate && !isSelf && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-20 cursor-default"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute top-full mt-1 z-30 w-36 rounded-xl border border-white/12 bg-[#171b24] p-1 shadow-2xl">
            <button
              type="button"
              onClick={() => {
                onGrantSpeak(member.socketId, member.role === 'listener');
                setMenuOpen(false);
              }}
              className="w-full text-left px-2.5 py-2 text-[11px] text-white/80 hover:bg-white/10 rounded-lg"
            >
              {member.role === 'listener' ? '🎙 Let them speak' : '👂 Move to listener'}
            </button>
            <button
              type="button"
              onClick={() => {
                onModerate(member.socketId, member.forceMuted ? 'unmute' : 'mute');
                setMenuOpen(false);
              }}
              className="w-full text-left px-2.5 py-2 text-[11px] text-white/80 hover:bg-white/10 rounded-lg"
            >
              {member.forceMuted ? '🔊 Unmute' : '🔇 Force mute'}
            </button>
            <button
              type="button"
              onClick={() => {
                onModerate(member.socketId, 'kick');
                setMenuOpen(false);
              }}
              className="w-full text-left px-2.5 py-2 text-[11px] text-rose-300 hover:bg-rose-500/10 rounded-lg"
            >
              🚫 Remove
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function GroupAudioRoom({ socket, iceServers, coins = 0, nickname = 'Anonymous', onExit }) {
  const {
    channel, members, micMuted, speakingIds, error, connecting, chatMessages,
    join, create, leave, toggleMic, requestSpeak, moderate, grantSpeak, sendChat, clearError,
  } = useAudioChannel(socket, iceServers);

  const [channels, setChannels] = useState([]);
  const [topic, setTopic] = useState('');
  const [giftOpen, setGiftOpen] = useState(false);
  const [raceOpen, setRaceOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);

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
  const canModerate = me && (me.role === 'host' || me.role === 'moderator');
  const speakers = members.filter((m) => m.role !== 'listener');
  const listeners = members.filter((m) => m.role === 'listener');

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sendChat(chatInput);
    setChatInput('');
  };

  const handleLeave = () => {
    leave();
    onExit?.();
  };

  // ---------------------------- Lobby ----------------------------
  if (!channel) {
    return (
      <div className="mm-shell mm-section">
        <header className="mb-6 text-center sm:text-left">
          <span className="mm-eyebrow">🎙️ Voice rooms</span>
          <h2 className="mm-h2 mt-3 text-white">Talk live, race together</h2>
          <p className="mm-body mt-1.5">Join a room to chat by voice and play coin races with everyone in it.</p>
        </header>

        <div className="flex flex-col sm:flex-row gap-2 mb-6">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What's your room about?"
            maxLength={48}
            className="flex-1 min-h-[var(--mm-tap)] bg-white/5 border border-white/12 rounded-xl px-4 text-[16px] sm:text-sm text-white outline-none focus:border-violet-400/60 transition-colors"
          />
          <button
            type="button"
            onClick={() => create(topic || 'Open voice room', false, nickname)}
            disabled={connecting}
            className="mm-btn mm-btn--primary sm:!px-6"
          >
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
            <button
              key={c.id}
              type="button"
              onClick={() => join(c.id, nickname)}
              className="mm-card mm-card-glow text-left p-4 group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-sm font-bold text-white truncate">{c.topic}</span>
                {c.hasActiveGame && (
                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 shrink-0">
                    🏁 racing
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-white/45">
                <span>🎙 {c.speakerCount} live</span>
                <span>👥 {c.memberCount}/{c.maxMembers}</span>
                {c.locked && <span>🔒</span>}
              </div>
              <div className="mt-2.5 h-1 rounded-full bg-white/8 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
                  style={{ width: `${Math.min(100, (c.memberCount / c.maxMembers) * 100)}%` }}
                />
              </div>
            </button>
          ))}
          {channels.length === 0 && (
            <div className="col-span-full text-center py-12">
              <div className="text-4xl mb-3" aria-hidden>🎙️</div>
              <p className="text-sm text-white/60 font-medium">No live rooms yet</p>
              <p className="mm-caption mt-1">Start the first one above.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // -------------------------- In channel --------------------------
  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#08090f] text-white">
      <header className="mm-audio-room-header">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold truncate">{channel.topic}</h2>
          <p className="text-[11px] text-white/40">
            {members.length} here · {speakers.length} on stage
          </p>
        </div>
        <span className="text-xs font-bold text-amber-300 shrink-0 tabular-nums">🪙 {coins}</span>
      </header>

      {error && (
        <div className="mx-4 mb-2 flex items-center justify-between gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5">
          <span className="text-xs text-amber-100">{error}</span>
          <button type="button" onClick={clearError} className="text-amber-100/70 text-lg leading-none px-1">×</button>
        </div>
      )}

      <main className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[1fr_20rem] lg:gap-4 px-4 pb-2">
        {/* Audio stage panel */}
        <section className="mm-audio-stage-panel flex-shrink-0 lg:flex-shrink min-h-0 overflow-y-auto">
          <h3 className="mm-audio-panel-label">On stage · {speakers.length}</h3>
          <div className="flex flex-wrap gap-3 mb-5">
            {speakers.map((m) => (
              <MemberTile
                key={m.socketId}
                member={m}
                speaking={speakingIds.has(m.socketId) && !m.micMuted}
                canModerate={canModerate}
                isSelf={m.socketId === socket?.id}
                onModerate={moderate}
                onGrantSpeak={grantSpeak}
                size="lg"
              />
            ))}
            {speakers.length === 0 && (
              <p className="text-xs text-white/35 py-4">No speakers yet — ask to speak or unmute.</p>
            )}
          </div>

          {listeners.length > 0 && (
            <>
              <h3 className="mm-audio-panel-label">Listening · {listeners.length}</h3>
              <div className="flex flex-wrap gap-2.5">
                {listeners.map((m) => (
                  <MemberTile
                    key={m.socketId}
                    member={m}
                    speaking={false}
                    canModerate={canModerate}
                    isSelf={m.socketId === socket?.id}
                    onModerate={moderate}
                    onGrantSpeak={grantSpeak}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        {/* Chat panel */}
        <aside className="mm-audio-chat-panel flex-1 min-h-0 flex flex-col mt-4 lg:mt-0">
          <div className="mm-audio-chat-panel__head">
            <span>Room chat</span>
            <span className="text-white/35">{chatMessages.length}</span>
          </div>
          <div className="mm-audio-chat-panel__messages custom-scrollbar">
            {chatMessages.length === 0 && (
              <p className="text-xs text-white/30 text-center py-6">Say hello to the room…</p>
            )}
            {chatMessages.map((m) => {
              const isMe = m.socketId === socket?.id;
              return (
                <div key={m.id} className={`mm-audio-chat-bubble ${isMe ? 'mm-audio-chat-bubble--me' : ''}`}>
                  <span className="mm-audio-chat-bubble__name">{isMe ? 'You' : m.nickname}</span>
                  <p className="mm-audio-chat-bubble__text">{m.text}</p>
                </div>
              );
            })}
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
            <button type="button" onClick={handleSendChat} className="mm-audio-chat-panel__send" aria-label="Send">
              →
            </button>
          </div>
        </aside>
      </main>

      {/* Control bar */}
      <div className="mm-actionbar sticky bottom-0">
        <div className="mm-shell mm-shell--wide flex items-center gap-2 !px-4">
          {me?.role === 'listener' ? (
            <button type="button" onClick={requestSpeak} className="mm-btn mm-btn--ghost flex-1">
              ✋ Ask to speak
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleMic}
              aria-pressed={!micMuted}
              className={`mm-btn flex-1 ${micMuted ? 'mm-btn--ghost' : '!bg-emerald-500 !text-black !border-emerald-400'}`}
            >
              {micMuted ? '🔇 Unmute' : '🎙 Live'}
            </button>
          )}

          <button
            type="button"
            onClick={() => setRaceOpen(true)}
            className="mm-btn !px-4 !bg-violet-500/15 !text-violet-200 !border-violet-400/25"
            aria-label="Coin race game"
          >
            🏁
          </button>

          <button
            type="button"
            onClick={() => setGiftOpen((o) => !o)}
            aria-label="Send a gift"
            className="mm-btn !px-4 !bg-amber-400/15 !text-amber-300 !border-amber-400/25"
          >
            🎁
          </button>

          <button type="button" onClick={handleLeave} className="mm-btn mm-btn--danger !px-4">
            Leave
          </button>
        </div>
      </div>

      {raceOpen && (
        <div
          className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={() => setRaceOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0f121a] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Coin race"
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-sm font-bold text-white">Coin race</h3>
              <button type="button" onClick={() => setRaceOpen(false)} className="w-8 h-8 rounded-lg bg-white/5 text-white/60">✕</button>
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
        onClose={() => setGiftOpen(false)}
      />
    </div>
  );
}

export default GroupAudioRoom;
