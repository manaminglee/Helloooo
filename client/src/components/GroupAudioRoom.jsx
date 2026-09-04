import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAudioChannel } from '../hooks/useAudioChannel';
import { useIceServers } from '../hooks/useIceServers';
import { useMessageTtl, formatTtl } from '../hooks/useMessageTtl';
import { useYoutubeLive } from '../hooks/useYoutubeLive';
import { CoinRaceGame } from './CoinRaceGame';
import { GiftDrawer } from './GiftDrawer';
import { CreatorLiveModal } from './CreatorLiveModal';
import { playLockSound, playUnlockSound } from '../utils/sounds';
import { countryToFlag } from '../utils/countryFlag';
import { AudioName, AudioCoinShop, AudioIdentityGate } from './AudioIdentityGate';
import { primaryNameColor, resolveNameStyle, isGradientNameColor } from '../utils/audioNameStyle';

const LOBBY_FEATURES = [
  { icon: '👤', label: 'Tap any speaker', hint: 'PA invite · gift · hello' },
  { icon: '🎙', label: 'Private Audio (PA)', hint: '2 people — invite from avatar menu' },
  { icon: '🚪', label: 'Knock to join', hint: 'Locked rooms · admin approves' },
  { icon: '💜', label: 'PA themes', hint: 'Hearts · neon · galaxy in PA' },
  { icon: '🪙', label: 'Entry fee', hint: 'Paid rooms in admin' },
  { icon: '📅', label: 'Events', hint: 'Schedule + reminders' },
];

const PA_THEMES = [
  { id: 'hearts', label: '💕 Hearts' },
  { id: 'couple', label: '💜 Couple' },
  { id: 'neon', label: '✨ Neon' },
  { id: 'galaxy', label: '🌌 Galaxy' },
  { id: 'sunset', label: '🌅 Sunset' },
  { id: 'gold', label: '👑 Gold' },
];
const STAGE_SLOTS = 6;
const ROLE_LABEL = { host: 'Admin', moderator: 'Co-taker', speaker: 'Speaker', listener: 'Guest', cohost: 'Guest', pa_waiting: 'Waiting' };
const PA_STICKERS = ['👋', '✨', '💜', '🔥', '😂', '💎', '🎉', '❤️', '🌟', '🎵'];

const ROOM_THEMES_CLIENT = [
  { id: 'default', label: 'Classic' },
  { id: 'neon', label: 'Neon' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'forest', label: 'Forest' },
  { id: 'gold', label: 'Gold' },
  { id: 'couple', label: 'Couple' },
];

const THEME_STYLES = {
  neon: 'linear-gradient(135deg, rgba(139,92,246,0.35), rgba(6,182,212,0.2))',
  sunset: 'linear-gradient(135deg, rgba(251,146,60,0.35), rgba(244,63,94,0.25))',
  forest: 'linear-gradient(135deg, rgba(16,185,129,0.3), rgba(5,46,22,0.4))',
  gold: 'linear-gradient(135deg, rgba(251,191,36,0.35), rgba(120,53,15,0.35))',
  couple: 'linear-gradient(135deg, rgba(244,114,182,0.35), rgba(167,139,250,0.3))',
};

const THEME_FRAMES = {
  gold: 'mm-audio-frame--gold',
  neon: 'mm-audio-frame--neon',
  couple: 'mm-audio-frame--couple',
  forest: 'mm-audio-frame--forest',
};

function isUserChatMessage(m) {
  return m.kind !== 'join' && !m.system;
}

function AudioRoomToast({ children, className = '' }) {
  return (
    <div className={`mm-audio-room-toast ${className}`.trim()} role="status" aria-live="polite">
      {children}
    </div>
  );
}

function LockCodeModal({ open, topic, onSubmit, onClose, onKnock }) {
  const [digits, setDigits] = useState('');
  useEffect(() => { if (open) setDigits(''); }, [open]);
  useEffect(() => {
    if (!open || digits.length !== 4) return;
    const t = setTimeout(() => onSubmit(digits), 120);
    return () => clearTimeout(t);
  }, [open, digits, onSubmit]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="mm-modal-overlay z-[600]" onClick={onClose}>
      <div className="mm-audio-room-modal mm-audio-room-modal--center text-center" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Enter room code">
        <span className="mm-audio-lock-modal__icon" aria-hidden>🔒</span>
        <h3 className="mm-audio-lock-modal__title">Locked room</h3>
        <p className="mm-audio-lock-modal__sub">{topic ? `Enter the 4-digit code for “${topic}”` : 'Enter the 4-digit admin code'}</p>
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={digits}
          onChange={(e) => setDigits(e.target.value.replace(/\D/g, '').slice(0, 4))}
          className="mm-audio-lock-modal__input"
          placeholder="••••"
          autoFocus
        />
        <div className="flex gap-2 mt-4">
          <button type="button" className="mm-btn mm-btn--ghost flex-1" onClick={onClose}>Cancel</button>
          {onKnock && (
            <button type="button" className="mm-btn mm-btn--ghost flex-1" onClick={onKnock}>🚪 Knock</button>
          )}
          <button type="button" className="mm-btn mm-btn--primary flex-1" disabled={digits.length !== 4} onClick={() => onSubmit(digits)}>Join</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ProfileMiniCard({ member, frameClass = '' }) {
  if (!member) return null;
  const roleLabel = ROLE_LABEL[member.role] || member.role;
  return (
    <div className="mm-profile-mini-card">
      <div className={`mm-profile-mini-card__avatar ${frameClass}`} style={member.nameColor ? { boxShadow: `0 0 0 2px ${primaryNameColor(member.nameColor)}55` } : undefined}>
        <span>{(member.audioUsername || member.nickname || '?').slice(0, 1).toUpperCase()}</span>
        {member.isCreator && <span className="mm-profile-mini-card__badge mm-profile-mini-card__badge--creator" title="Creator">✓</span>}
        {member.verified && <span className="mm-profile-mini-card__badge mm-profile-mini-card__badge--verified" title="Verified">★</span>}
      </div>
      <div className="mm-profile-mini-card__body">
        <p className="mm-profile-mini-card__name"><AudioName member={member} /></p>
        <p className="mm-profile-mini-card__meta">
          {member.country ? `${countryToFlag(member.country)} ${member.country} · ` : ''}{roleLabel}
          {member.displayLevel > 0 && <span className="text-white/40"> · Lv {member.displayLevel}</span>}
        </p>
      </div>
    </div>
  );
}

function UserActionMenu({ member, frameClass, onHello, onPa, onGift, onReport, onBlock, onClose, showPa = true }) {
  if (!member) return null;
  const helloTypes = [
    { id: 'wave', label: '👋 Wave' },
    { id: 'fire', label: '🔥 Fire' },
    { id: 'purple', label: '💜 Purple' },
    { id: 'sparkle', label: '✨ Sparkle' },
  ];
  return (
    <div className="mm-modal-overlay mm-modal-overlay--sheet z-[450]" onClick={onClose}>
      <div className="mm-audio-room-modal mm-audio-user-menu w-full max-w-xs" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <ProfileMiniCard member={member} frameClass={frameClass} />
        <div className="grid grid-cols-2 gap-1 mb-2 mt-3">
          {helloTypes.map((h) => (
            <button key={h.id} type="button" className="mm-audio-user-menu__item !py-2 !text-xs" onClick={() => { onHello?.(member, h.id); onClose(); }}>
              {h.label}
            </button>
          ))}
        </div>
        {showPa && (
          <button type="button" className="mm-audio-user-menu__item mm-audio-user-menu__item--pa" onClick={() => { onPa?.(member); onClose(); }}>
            🎙 Invite to PA <span className="mm-audio-user-menu__hint">Private audio for 2</span>
          </button>
        )}
        <button type="button" className="mm-audio-user-menu__item" onClick={() => { onGift?.(member); onClose(); }}>
          🎁 Send gift
        </button>
        <button type="button" className="mm-audio-user-menu__item text-rose-300" onClick={() => { onReport?.(member); onClose(); }}>
          🚩 Report
        </button>
        <button type="button" className="mm-audio-user-menu__item text-rose-400" onClick={() => { onBlock?.(member); onClose(); }}>
          ⛔ Block &amp; never match
        </button>
      </div>
    </div>
  );
}

function HelloAnimation({ event, onDone }) {
  useEffect(() => {
    if (!event) return undefined;
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [event, onDone]);
  if (!event) return null;
  return (
    <div className="mm-audio-hello-overlay" aria-live="polite">
      <div className="mm-audio-hello-burst">
        <span className="mm-audio-hello-burst__wave">{event.emoji || '👋'}</span>
        <p className="mm-audio-hello-burst__text">
          <strong>{event.fromNickname}</strong> says hello to <strong>{event.toNickname}</strong>
        </p>
      </div>
    </div>
  );
}

function StickerBurst({ event, onDone }) {
  useEffect(() => {
    if (!event) return undefined;
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [event, onDone]);
  if (!event) return null;
  return (
    <div className="mm-audio-sticker-overlay" aria-live="polite">
      <div className="mm-audio-sticker-burst">
        <span className="mm-audio-sticker-burst__emoji">{event.sticker}</span>
        <p className="mm-audio-sticker-burst__text">{event.fromNickname}</p>
      </div>
    </div>
  );
}

function GiftStreakBurst({ event, onDone }) {
  useEffect(() => {
    if (!event) return undefined;
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [event, onDone]);
  if (!event) return null;
  return (
    <div className="mm-gift-streak-overlay" aria-live="polite">
      <div className="mm-gift-streak-burst">
        <span className="mm-gift-streak-burst__icon">{event.icon || '🎁'}</span>
        <p className="mm-gift-streak-burst__title">Gift streak ×{event.streak}!</p>
        <p className="mm-gift-streak-burst__sub">
          {event.fromNickname} → {event.toNickname}
        </p>
      </div>
    </div>
  );
}

function GiftBonusToast({ bonus, onDone }) {
  useEffect(() => {
    if (!bonus) return undefined;
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [bonus, onDone]);
  if (!bonus) return null;
  return (
    <div className="mm-host-bonus-toast" aria-live="polite">
      <span className="mm-host-bonus-toast__icon">🎁</span>
      <div>
        <p className="mm-host-bonus-toast__title">Gift bonus +{bonus.coins} coins</p>
        <p className="mm-host-bonus-toast__sub">{bonus.giftName || 'Nice gift!'}</p>
      </div>
    </div>
  );
}

function HostBonusToast({ bonus, onDone }) {
  useEffect(() => {
    if (!bonus) return undefined;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [bonus, onDone]);
  if (!bonus) return null;
  return (
    <div className="mm-host-bonus-toast" aria-live="polite">
      <span className="mm-host-bonus-toast__icon">🪙</span>
      <div>
        <p className="mm-host-bonus-toast__title">
          {bonus.entryFee ? 'Entry fee earned' : 'Host bonus'} +{bonus.coins} coins
        </p>
        <p className="mm-host-bonus-toast__sub">
          {bonus.entryFee ? 'Someone joined your room' : `${bonus.minutes} minutes live`}
        </p>
      </div>
    </div>
  );
}

function PaThemeBackground({ themeId = 'hearts' }) {
  const particles = themeId === 'hearts' || themeId === 'couple'
    ? ['💕', '💖', '💗', '💜', '❤️']
    : themeId === 'galaxy'
      ? ['✨', '⭐', '🌟', '💫']
      : themeId === 'neon'
        ? ['⚡', '✨', '💎', '🔮']
        : ['✨', '🌸', '💫'];
  return (
    <div className={`mm-pa-theme-bg mm-pa-theme-bg--${themeId}`} aria-hidden>
      {particles.map((p, i) => (
        <span key={`${p}-${i}`} className="mm-pa-theme-bg__particle" style={{ '--i': i, '--delay': `${(i * 0.7) % 5}s` }}>{p}</span>
      ))}
    </div>
  );
}

function PaInviteModal({ invite, onAccept, onReject }) {
  if (!invite || typeof document === 'undefined') return null;
  return createPortal(
    <div className="mm-pa-invite-modal mm-modal-overlay" role="dialog" aria-modal="true" aria-label="PA invite">
      <div className="mm-audio-pa-invite mm-audio-pa-invite--animated" onClick={(e) => e.stopPropagation()}>
        <div className="mm-audio-pa-invite__glow" aria-hidden />
        <span className="mm-audio-pa-invite__icon mm-audio-pa-invite__icon--pulse">🎙</span>
        <h3 className="mm-audio-pa-invite__title">Private Audio invite</h3>
        <p className="mm-audio-pa-invite__text">
          <strong>{invite.fromNickname}</strong> is inviting you to a PA room together
        </p>
        <p className="mm-audio-pa-invite__sub">Just you two — guests can join later with your link</p>
        <div className="mm-pa-invite-actions">
          <button
            type="button"
            className="mm-btn mm-btn--ghost flex-1"
            onClick={(e) => { e.stopPropagation(); onReject?.(); }}
          >
            Decline
          </button>
          <button
            type="button"
            className="mm-btn mm-btn--primary flex-1 mm-audio-pa-invite__accept"
            onClick={(e) => { e.stopPropagation(); onAccept?.(); }}
          >
            Accept PA
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PaWaitingOverlay() {
  return (
    <div className="mm-pa-waiting-overlay">
      <div className="mm-pa-waiting-card">
        <span className="mm-pa-waiting-card__icon">⏳</span>
        <h3>Waiting for PA hosts</h3>
        <p>They&apos;ll let you in when ready — stay on this screen</p>
        <div className="mm-pa-waiting-dots"><span /><span /><span /></div>
      </div>
    </div>
  );
}

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
  const isGift = m.kind === 'gift';
  const isJoin = m.kind === 'join';
  if (!m.system && !isGift && !isJoin && timeLeft <= 0) return null;
  return (
    <div className={`mm-audio-chat-bubble ${isMe ? 'mm-audio-chat-bubble--me' : ''} ${isGift ? 'mm-audio-chat-bubble--gift' : ''} ${isJoin ? 'mm-audio-chat-bubble--join' : ''}`}>
      {!isJoin && (
        <span className="mm-audio-chat-bubble__name">{isMe ? 'You' : <AudioName member={m} />}</span>
      )}
      {isJoin ? (
        <p className="mm-audio-chat-bubble__join-text">
          <AudioName member={m} /> <span className="text-white/50">joined the room</span>
        </p>
      ) : (
        <p className="mm-audio-chat-bubble__text">{m.text || (m.gift ? `${m.gift.icon} ${m.gift.name}` : '')}</p>
      )}
      {!m.system && !isGift && !isJoin && (
        <span className={`mm-desk-bubble__ttl text-[9px] ${timeLeft <= 10 ? 'mm-desk-bubble__ttl--warn' : ''}`}>
          {formatTtl(timeLeft)}
        </span>
      )}
    </div>
  );
}

function EntryAnimation({ event, onDone }) {
  useEffect(() => {
    if (!event) return undefined;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [event, onDone]);
  if (!event) return null;
  return (
    <div className={`mm-audio-entry-overlay mm-audio-entry-overlay--${event.tier || 'grand'}`} aria-live="polite">
      <div className="mm-audio-entry-banner">
        <span className="mm-audio-entry-banner__spark">✨</span>
        <p
          className={`mm-audio-entry-banner__title${isGradientNameColor(event.nameColor) ? ' mm-audio-name--gradient' : ''}`}
          style={resolveNameStyle(event.nameColor || '#f472b6')}
        >
          @{event.username}
        </p>
        <p className="mm-audio-entry-banner__sub">Level {event.level} has entered</p>
      </div>
    </div>
  );
}

function StageAvatar({ member, speaking, size = 'lg', onUserTap, isPa = false, frameClass = '' }) {
  const dim = size === 'lg' ? 'mm-audio-avatar mm-audio-avatar--lg' : 'mm-audio-avatar mm-audio-avatar--sm';
  const royal =
    member?.role === 'host'
      ? 'mm-audio-royal mm-audio-royal--host'
      : member?.role === 'moderator'
        ? 'mm-audio-royal mm-audio-royal--mod'
        : '';
  const showMuted = member?.role !== 'listener' && member?.role !== 'cohost' && !!member?.micMuted;
  const live = member?.role !== 'listener' && member?.role !== 'cohost' && !member?.micMuted;

  return (
    <button
      type="button"
      data-audio-member={member?.socketId || undefined}
      data-gift-avatar={member?.socketId || undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (member && onUserTap) onUserTap(member, e);
      }}
      className={`${dim} rounded-full grid place-items-center font-bold text-white relative transition-all duration-200 ${royal} ${frameClass} ${isPa ? 'mm-audio-avatar--pa' : ''} ${
        speaking ? 'mm-audio-avatar--speaking bg-emerald-500/25 ring-2 ring-emerald-400 scale-105' : live ? 'bg-emerald-500/15 ring-2 ring-emerald-400/50' : 'bg-white/[0.07] ring-1 ring-white/10'
      }`}
      title={onUserTap ? `Tap ${member?.nickname}` : member?.nickname}
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
  index, occupant, speaking, canClaim, onClaim, canModerate, isSelf, onModerate, isHost, onUserTap, isPa, frameClass = '',
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
    <div
      className={`mm-audio-slot relative${!isSelf && onUserTap ? ' mm-audio-slot--tappable' : ''}`}
      onClick={(e) => {
        if (isSelf || !onUserTap || !occupant) return;
        if (e.target.closest('button[data-audio-member]')) return;
        onUserTap(occupant, e);
      }}
    >
      <div className="flex flex-col items-center gap-1">
        <StageAvatar
          member={occupant}
          speaking={speaking}
          isPa={isPa}
          frameClass={frameClass}
          onUserTap={!isSelf ? onUserTap : undefined}
        />
        <button
          type="button"
          onClick={() => canModerate && !isSelf && setMenuOpen((o) => !o)}
          className="flex flex-col items-center focus:outline-none"
        >
          <span className="text-[10px] truncate max-w-full">{isSelf ? 'You' : <AudioName member={occupant} className="!text-[10px]" />}</span>
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
            <button type="button" className="w-full text-left px-2.5 py-2 text-[11px] text-amber-200 hover:bg-amber-500/10 rounded-lg" onClick={() => { onUserTap?.(occupant); setMenuOpen(false); }}>
              👋 Hello / PA / Gift
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

export function GroupAudioRoom({
  socket, iceServers: iceServersProp, coins = 0, nickname = 'Anonymous',
  audioIdentity = null, audioIdentityHook = null, onIdentityUpdate,
  initialChannelId = null, initialPaToken = null, initialAsCohost = false, isCreator = false, onExit,
}) {
  const { iceServers: iceFromHook } = useIceServers();
  const iceServers = iceServersProp?.length ? iceServersProp : iceFromHook;
  const {
    channel, members, micMuted, speakingIds, error, connecting, chatMessages,
    lockRequired, paInvite, helloEvent, stickerBurst, giftStreak, hostBonus, giftBonus,
    scheduledEvents, useSfu, knockStatus, audioBlocked, livekitConnected,
    join, create, leave, toggleMic, moderate, grantSpeak, claimSlot,
    approveJoin, denyJoin, renameRoom, setWallpaper, setGamesEnabled, sendChat,
    sendSticker, sendHello, invitePa, respondPa, setRoomLock, makePublic,
    knockRoom, approveKnock, denyKnock, setTheme, setPaTheme, setEntryFee, scheduleEvent,
    approvePaGuest, denyPaGuest,
    resumeRemoteAudio, clearError, dismissLockRequired, dismissHello, dismissSticker, dismissPaInvite,
    dismissGiftStreak, dismissHostBonus, dismissGiftBonus, clearKnockStatus,
  } = useAudioChannel(socket, iceServers, nickname);

  const [showRoomTips, setShowRoomTips] = useState(() => localStorage.getItem('mm_audio_tips') !== '0');

  const [channels, setChannels] = useState([]);
  const [topic, setTopic] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftTarget, setGiftTarget] = useState(null);
  const [userMenu, setUserMenu] = useState(null); // { member, x, y }
  const [lockCodeInput, setLockCodeInput] = useState('');
  const [pendingJoinId, setPendingJoinId] = useState(null);
  const [raceOpen, setRaceOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [wallpaperBusy, setWallpaperBusy] = useState(false);
  const [wallpaperMsg, setWallpaperMsg] = useState(null);
  const [uiMsg, setUiMsg] = useState(null);
  const [joinToast, setJoinToast] = useState(null);
  const lastJoinToastIdRef = useRef(null);
  const chatScrollRef = useRef(null);
  const chatEndRef = useRef(null);
  const wallpaperInputRef = useRef(null);
  const liveCameraRef = useRef(null);
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [liveCamBusy, setLiveCamBusy] = useState(false);
  const [lobbyScheduled, setLobbyScheduled] = useState([]);
  const [coinBalance, setCoinBalance] = useState(coins);
  const [coinShopOpen, setCoinShopOpen] = useState(false);
  const [entryAnim, setEntryAnim] = useState(null);
  const [localIdentity, setLocalIdentity] = useState(audioIdentity);
  const isSignedIn = !!(audioIdentityHook?.isSignedIn && (localIdentity?.username || audioIdentity?.username));
  const identityHydrating = !!(audioIdentityHook?.hydrating || (audioIdentityHook?.token && !isSignedIn));

  useEffect(() => { setCoinBalance(coins); }, [coins]);
  useEffect(() => { setLocalIdentity(audioIdentity); }, [audioIdentity]);

  useEffect(() => {
    if (isSignedIn || !audioIdentityHook) return undefined;
    const hasCreator = !!audioIdentityHook.hasCreatorSession;
    if (!hasCreator || audioIdentityHook.hydrating || audioIdentityHook.creatorLinkFailed) return undefined;
    let cancelled = false;
    void (async () => {
      const ok = await audioIdentityHook.loginFromCreator?.();
      if (!cancelled && ok) {
        audioIdentityHook.refresh?.();
        onIdentityUpdate?.();
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, audioIdentityHook?.hasCreatorSession, audioIdentityHook?.hydrating, audioIdentityHook?.creatorLinkFailed]);

  useEffect(() => {
    if (paInvite) setUserMenu(null);
  }, [paInvite]);

  useEffect(() => {
    if (!socket) return undefined;
    const onIdentity = (payload) => {
      setLocalIdentity(payload);
      if (payload?.coins != null) setCoinBalance(payload.coins);
      onIdentityUpdate?.();
    };
    const onCoins = (p) => {
      if (p?.audio) setCoinBalance(p.coins);
    };
    const onEntry = (payload) => {
      if (payload?.channelId && channel?.channelId && payload.channelId !== channel.channelId) return;
      setEntryAnim({ ...payload, id: `${payload.socketId}-${Date.now()}` });
    };
    socket.on('audio-identity:ready', onIdentity);
    socket.on('coins-updated', onCoins);
    socket.on('audio:entry-animation', onEntry);
    return () => {
      socket.off('audio-identity:ready', onIdentity);
      socket.off('coins-updated', onCoins);
      socket.off('audio:entry-animation', onEntry);
    };
  }, [socket, channel?.channelId, onIdentityUpdate]);

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
    if (!socket || !isSignedIn) return undefined;
    const onList = ({ channels: c, events }) => {
      setChannels(c || []);
      if (events?.length) setLobbyScheduled(events);
    };
    const onScheduled = ({ events }) => setLobbyScheduled(events || []);
    socket.on('audio:channels', onList);
    socket.on('audio:scheduled', onScheduled);
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
          if (Array.isArray(data.scheduled)) setLobbyScheduled(data.scheduled);
        }
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
      socket.off('audio:channels', onList);
      socket.off('audio:scheduled', onScheduled);
      clearInterval(id);
    };
  }, [socket, isSignedIn]);

  const autoJoinRef = useRef(false);
  useEffect(() => {
    if (!channel) autoJoinRef.current = false;
  }, [channel]);

  useEffect(() => {
    if (!socket || !initialChannelId || channel || autoJoinRef.current || !isSignedIn) return;
    autoJoinRef.current = true;
    join(initialChannelId, nickname, undefined, initialPaToken, initialAsCohost);
  }, [socket, initialChannelId, initialPaToken, initialAsCohost, channel, join, nickname, isSignedIn]);

  const me = useMemo(
    () => members.find((m) => m.socketId === socket?.id) || channel?.you || null,
    [members, socket?.id, channel?.you]
  );
  const isHost = me?.role === 'host';
  const isMod = me?.role === 'moderator';
  const canModerate = isHost || isMod;
  // Raised hands float to the front so a moderator sees who is waiting
  // without scanning the whole audience.
  const listeners = members
    .filter((m) => m.role === 'listener' || m.role === 'cohost')
    .sort((a, b) => (b.handRaised ? 1 : 0) - (a.handRaised ? 1 : 0));
  const raisedHands = listeners.filter((m) => m.handRaised).length;
  const pendingJoins = channel?.pendingJoins || [];
  const pendingKnocks = channel?.pendingKnocks || [];
  const pendingPaGuests = channel?.pendingPaGuests || [];
  const isPaCore = !!(channel?.paMembers?.includes(socket?.id));
  const modQueueCount = canModerate ? pendingKnocks.length + pendingJoins.length : 0;
  const paGuestQueueCount = isPaCore ? pendingPaGuests.length : 0;
  const isPaWaiting = me?.role === 'pa_waiting';
  const paThemeId = channel?.paThemeId || 'hearts';
  const themeOverlay = THEME_STYLES[channel?.themeId] || null;
  const frameClass = THEME_FRAMES[channel?.themeId] || '';
  const maxSlots = channel?.maxSpeakers || STAGE_SLOTS;

  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    if (!channel?.isPa) return undefined;
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, [channel?.isPa]);

  const paCountdown = useMemo(() => {
    if (!channel?.isPa) return null;
    const alone = members.length < 2 && channel.paAloneCloseAt;
    const endsAt = alone ? channel.paAloneCloseAt : channel.paEndsAt;
    if (!endsAt) return null;
    const sec = Math.max(0, Math.ceil((endsAt - clock) / 1000));
    const min = Math.floor(sec / 60);
    const s = String(sec % 60).padStart(2, '0');
    return {
      label: alone ? `Closes in ${min}:${s} (alone)` : `PA ends in ${min}:${s}`,
      urgent: sec <= 60,
    };
  }, [channel, members.length, clock]);

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
    const box = chatScrollRef.current;
    if (!box) return;
    box.scrollTop = box.scrollHeight;
  }, [chatMessages.length]);

  // Lock page scroll — only the chat message list should scroll.
  useEffect(() => {
    if (!channel) return undefined;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, [channel]);

  useEffect(() => {
    if (channel?.topic) setRenameValue(channel.topic);
  }, [channel?.topic]);

  useEffect(() => {
    if (!uiMsg) return undefined;
    const t = setTimeout(() => setUiMsg(null), 2600);
    return () => clearTimeout(t);
  }, [uiMsg]);

  useEffect(() => {
    const latestJoin = [...chatMessages].reverse().find((m) => m.kind === 'join');
    if (!latestJoin || latestJoin.id === lastJoinToastIdRef.current) return undefined;
    lastJoinToastIdRef.current = latestJoin.id;
    setJoinToast(latestJoin);
    const t = setTimeout(() => setJoinToast(null), 3200);
    return () => clearTimeout(t);
  }, [chatMessages]);

  const visibleChatMessages = useMemo(
    () => chatMessages.filter(isUserChatMessage),
    [chatMessages],
  );

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

  const shareRoom = async (cohostLink = false) => {
    const rid = channel?.channelId || channel?.id;
    if (!rid) return;
    const token = channel?.paInviteToken;
    const url = token
      ? `${window.location.origin}/join/${rid}?pa=${token}${cohostLink ? '&cohost=1' : ''}`
      : `${window.location.origin}/join/${rid}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: channel.topic || 'Live voice room',
          text: isPaRoom && isPaCore ? 'Join our PA room as a guest (hosts approve) 🎙️' : (token ? 'Join my private PA room 🎙️' : 'Join my live voice room 🎙️'),
          url,
        });
        setUiMsg(cohostLink ? 'Co-host link shared' : (token ? 'PA link shared' : 'Invite link shared'));
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setUiMsg(isPaRoom && isPaCore ? 'Guest link copied — they wait until you approve' : (token ? 'PA link copied' : 'Invite link copied'));
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

  const handleToggleMic = () => {
    resumeRemoteAudio?.();
    toggleMic();
  };

  leaveRef.current = handleLeave;
  // Listeners have no mic to toggle — the shortcut asks for a seat instead.
  micRef.current = me && me.role !== 'listener' && me.role !== 'cohost' ? handleToggleMic : null;

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

  const openUserMenu = (member, e) => {
    if (!member || member.socketId === socket?.id) return;
    const rect = e?.currentTarget?.getBoundingClientRect?.();
    setUserMenu({
      member,
      x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
      y: rect ? rect.bottom + 8 : window.innerHeight / 2,
    });
  };

  const handleHello = (member, helloType = 'wave') => {
    if (!member) return;
    sendHello(member.socketId, helloType);
    setUiMsg(`Hello sent to ${member.nickname}`);
  };

  const handleReportUser = (member) => {
    if (!member || !socket) return;
    socket.emit('report-user', {
      roomId: channel?.channelId,
      targetSocketId: member.socketId,
      reason: 'audio_room_user',
    });
    setUiMsg(`Reported ${member.nickname}`);
  };

  const handleBlockUser = (member) => {
    if (!member || !socket) return;
    socket.emit('report-user', {
      roomId: channel?.channelId,
      targetSocketId: member.socketId,
      reason: 'audio_room_block',
      block: true,
    });
    setUiMsg(`Blocked ${member.nickname} — you won't match again`);
  };

  const handleKnock = () => {
    const id = pendingJoinId || lockRequired?.channelId;
    if (!id) return;
    knockRoom(id);
    setUiMsg('🚪 Knocking — waiting for admin…');
    setPendingJoinId(null);
    dismissLockRequired();
  };

  const handlePaInvite = (member) => {
    if (!member) return;
    invitePa(member.socketId);
    setUiMsg(`🎙 PA invite sent to ${member.nickname}`);
  };

  const tryJoinRoom = (channelId, hasLock, entryFee = 0) => {
    if (entryFee > 0 && coins < entryFee) {
      setUiMsg(`This room costs ${entryFee} coins — you have ${coins}`);
      return;
    }
    if (hasLock) {
      setPendingJoinId(channelId);
      return;
    }
    if (entryFee > 0) setUiMsg(`Joining — ${entryFee} coins entry fee`);
    join(channelId, nickname);
  };

  useEffect(() => {
    if (!lockRequired) return;
    setPendingJoinId(lockRequired.channelId);
  }, [lockRequired]);

  const submitLockCode = (code) => {
    const id = pendingJoinId || lockRequired?.channelId;
    if (!id) return;
    join(id, nickname, code);
    setPendingJoinId(null);
    dismissLockRequired();
  };

  const isPaRoom = !!channel?.isPa;

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
    const creatorSession = !!audioIdentityHook?.hasCreatorSession;
    const linkFailed = !!audioIdentityHook?.creatorLinkFailed;

    if (!isSignedIn && audioIdentityHook && (audioIdentityHook.hydrating || (creatorSession && !linkFailed))) {
      return (
        <div className="mm-shell mm-section mm-voice-lobby mm-voice-lobby--locked flex items-center justify-center min-h-[50dvh]">
          <p className="mm-body text-white/60">
            {creatorSession ? 'Signing in with your creator account…' : 'Restoring your voice identity…'}
          </p>
        </div>
      );
    }

    if (!isSignedIn && audioIdentityHook) {
      if (identityHydrating && !linkFailed) {
        return (
          <div className="mm-shell mm-section mm-voice-lobby mm-voice-lobby--locked flex items-center justify-center min-h-[50dvh]">
            <p className="mm-body text-white/60">Restoring your voice identity…</p>
          </div>
        );
      }
      return (
        <div className="mm-shell mm-section mm-voice-lobby mm-voice-lobby--locked">
          <header className="mm-voice-lobby__hero mm-voice-lobby__hero--dim">
            <span className="mm-eyebrow">🎙️ Voice rooms</span>
            <h2 className="mm-h2 mt-3 text-white">Talk live · 6 stage seats</h2>
            <p className="mm-body mt-1.5">Sign in to see live rooms and join the stage.</p>
          </header>
          <AudioIdentityGate
            variant="popup"
            identityHook={audioIdentityHook}
            onSignedIn={() => {
              audioIdentityHook.refresh?.();
              onIdentityUpdate?.();
            }}
            onCancel={onExit}
          />
        </div>
      );
    }

    return (
      <div className="mm-shell mm-section mm-voice-lobby">
        <header className="mm-voice-lobby__hero">
          <span className="mm-eyebrow">🎙️ Voice rooms</span>
          <h2 className="mm-h2 mt-3 text-white">Talk live · 6 stage seats</h2>
          <p className="mm-body mt-1.5">
            Welcome, <strong className={isGradientNameColor(localIdentity?.nameColor) ? 'mm-audio-name--gradient' : ''} style={resolveNameStyle(localIdentity?.nameColor || '#f472b6')}>@{localIdentity?.username || nickname}</strong>
            {' '}· Create a room or join one below.
          </p>
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

        <div className="mm-voice-lobby__features">
          <p className="mm-voice-lobby__features-title">In-room features</p>
          <div className="mm-voice-lobby__features-grid">
            {LOBBY_FEATURES.map((f) => (
              <div key={f.label} className="mm-voice-lobby__feature-chip">
                <span className="mm-voice-lobby__feature-icon">{f.icon}</span>
                <div>
                  <p className="mm-voice-lobby__feature-label">{f.label}</p>
                  <p className="mm-voice-lobby__feature-hint">{f.hint}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {knockStatus?.waiting && (
          <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 flex items-center justify-between gap-2">
            <span className="text-xs text-amber-100">🚪 Knocking — waiting for admin to let you in…</span>
            <button type="button" className="text-amber-200/70 text-lg leading-none px-1" onClick={clearKnockStatus}>×</button>
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5">
            <span className="text-xs text-rose-200">{error}</span>
            <button type="button" onClick={clearError} className="text-rose-200/70 text-lg leading-none px-1">×</button>
          </div>
        )}

        {lobbyScheduled.length > 0 && (
          <div className="mm-voice-lobby__scheduled mb-4 p-4 rounded-xl border border-violet-400/20 bg-violet-500/5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-200/80 mb-2">Upcoming events</p>
            {lobbyScheduled.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between gap-2 text-xs py-1">
                <span className="truncate">{ev.topic}</span>
                <span className="text-white/45 shrink-0">{new Date(ev.scheduledStartAt).toLocaleString()}</span>
                <button type="button" className="mm-btn mm-btn--ghost !px-2 !py-1 !text-[10px]" onClick={() => tryJoinRoom(ev.id, false, ev.entryFee || 0)}>
                  Join
                </button>
              </div>
            ))}
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
              onClick={() => tryJoinRoom(c.id, c.hasLockCode, c.entryFee || 0)}
              className={`mm-voice-room-card${c.isPa ? ' mm-voice-room-card--pa' : ''}${c.locked || c.hasLockCode ? ' mm-voice-room-card--locked' : ''}`}
            >
              <div className="mm-voice-room-card__top">
                <span className="mm-voice-room-card__title">
                  {(c.locked || c.hasLockCode || c.isPa) && <span className="mm-voice-room-card__lock" aria-label="Locked">🔒</span>}
                  {c.topic}
                </span>
                {c.isPa && <span className="mm-voice-room-card__pa">PA</span>}
                {c.hasActiveGame && <span className="mm-voice-room-card__race">🏁 Race</span>}
              </div>
              <div className="mm-voice-room-card__meta">
                <span>🎙 {c.speakerCount}/{c.maxSpeakers || 6} stage</span>
                <span>👥 {c.memberCount}</span>
                {c.entryFee > 0 && <span>🪙 {c.entryFee}</span>}
              </div>
              <span className="mm-voice-room-card__cta">{c.hasLockCode ? 'Enter code →' : 'Join →'}</span>
            </button>
          ))}
          {channels.length === 0 && (
            <div className="mm-voice-room-empty">
              <div className="text-4xl mb-3">🎙️</div>
              <p className="text-sm text-white/60 font-medium">No live rooms yet</p>
              <p className="text-xs text-white/40 mt-1 mb-3">Start a public room or a PA room and share the link</p>
              <div className="flex flex-wrap gap-2 justify-center">
                <button type="button" className="mm-btn mm-btn--primary !text-xs" onClick={() => create(topic || 'Open voice room 🎙️', false, nickname)}>Start room</button>
              </div>
            </div>
          )}
        </div>

        <LockCodeModal
          open={!!pendingJoinId || !!lockRequired}
          topic={lockRequired?.topic || channels.find((c) => c.id === pendingJoinId)?.topic}
          onSubmit={submitLockCode}
          onKnock={pendingJoinId || lockRequired?.channelId ? handleKnock : undefined}
          onClose={() => { setPendingJoinId(null); dismissLockRequired(); }}
        />

        {channels.length < 3 && (
          <div className="mm-voice-lobby__cta mt-4 p-4 rounded-xl border border-violet-500/20 bg-violet-500/5 text-center">
            <p className="text-sm text-white/70 mb-2">Few rooms live — join one, tap someone&apos;s avatar, then invite to PA</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button type="button" className="mm-btn mm-btn--primary !text-xs" onClick={() => create(topic || 'Open voice room 🎙️', false, nickname)}>Start a room</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const stageStyle = channel.wallpaper
    ? {
      backgroundImage: `linear-gradient(rgba(8,9,15,.55), rgba(8,9,15,.82)), url(${channel.wallpaper})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
    : themeOverlay
      ? { backgroundImage: themeOverlay }
      : undefined;

  return (
    <div
      className={`h-[100dvh] max-h-[100dvh] flex flex-col bg-[#08090f] text-white overflow-hidden mm-voice-room${isPaRoom ? ` mm-voice-room--pa mm-voice-room--pa-${paThemeId}` : ''}`}
      onPointerDownCapture={() => resumeRemoteAudio?.()}
    >
      {isPaRoom && <PaThemeBackground themeId={paThemeId} />}
      {isPaWaiting && <PaWaitingOverlay />}
      <header className="mm-audio-room-header">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold truncate flex items-center gap-2">
            {isPaRoom && <span className="mm-audio-pa-badge" title="Private Audio">🔒 PA</span>}
            {useSfu && <span className="mm-audio-sfu-badge" title="LiveKit SFU">📡 SFU</span>}
            {channel.topic}
          </h2>
          <p className="text-[11px] text-white/40">
            {members.length} here · {slots.filter(Boolean).length}/{maxSlots} on stage
            {raisedHands > 0 && <span className="text-amber-300 font-semibold"> · ✋ {raisedHands} waiting</span>}
            {paCountdown && (
              <span className={`block mt-0.5 ${paCountdown.urgent ? 'text-rose-300 font-semibold' : 'text-violet-300/80'}`}>
                ⏱ {paCountdown.label}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end max-w-[55%] sm:max-w-none">
          <button
            type="button"
            onClick={() => shareRoom(false)}
            className={`mm-btn mm-btn--ghost !px-3 !py-1.5 !text-xs${isPaRoom ? ' !border-violet-400/40 !text-violet-200' : ''}`}
            title={isPaRoom ? 'Share PA invite link' : 'Share invite link'}
            aria-label={isPaRoom ? 'Share PA link' : 'Share invite link'}
          >
            {isPaRoom && isPaCore ? '🔗 Guest link' : isPaRoom ? '🔗 PA' : '🔗 Invite'}
          </button>
          {canModerate && (
            <button type="button" onClick={() => setAdminOpen(true)} className={`mm-audio-role-pill ${isHost ? 'mm-audio-role-pill--host' : 'mm-audio-role-pill--mod'} relative`}>
              {isHost ? '👑 Admin' : '🛡️ Co-taker'}
              {modQueueCount > 0 && (
                <span className="mm-audio-admin-badge">{modQueueCount}</span>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => setCoinShopOpen(true)}
            className="mm-btn mm-btn--ghost !px-2.5 !py-1.5 !text-xs !border-amber-400/30 !text-amber-200"
            title="Recharge coins"
          >
            🪙 {coinBalance}
            {localIdentity?.level > 0 && <span className="ml-1 text-[10px] opacity-70">Lv{localIdentity.level}</span>}
          </button>
        </div>
      </header>

      {error && (
        <div className="mx-4 mb-2 flex items-center justify-between gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5">
          <span className="text-xs text-amber-100">{error}</span>
          <button type="button" onClick={clearError} className="text-amber-100/70 text-lg leading-none px-1">×</button>
        </div>
      )}

      {joinToast && (
        <AudioRoomToast className="mm-audio-room-toast--join">
          <AudioName member={joinToast} /> <span className="text-white/50">joined the room</span>
        </AudioRoomToast>
      )}

      {uiMsg && (
        <AudioRoomToast>
          <span className="break-all">{uiMsg}</span>
        </AudioRoomToast>
      )}

      {(audioBlocked || (me?.role === 'listener' || me?.role === 'cohost')) && (
        <div className="mx-4 mb-2">
          <button
            type="button"
            className="mm-audio-unlock-btn w-full"
            onClick={() => resumeRemoteAudio?.()}
          >
            🔊 Tap to enable audio
          </button>
        </div>
      )}

      {modQueueCount > 0 && canModerate && !adminOpen && (
        <div className="mx-4 mb-2">
          <button
            type="button"
            className="mm-audio-mod-alert w-full"
            onClick={() => setAdminOpen(true)}
          >
            🚪 {pendingKnocks.length > 0 && `${pendingKnocks.length} knocking`}
            {pendingKnocks.length > 0 && pendingJoins.length > 0 && ' · '}
            {pendingJoins.length > 0 && `${pendingJoins.length} seat request${pendingJoins.length > 1 ? 's' : ''}`}
            <span className="mm-audio-mod-alert__cta">Review in Admin →</span>
          </button>
        </div>
      )}

      {paGuestQueueCount > 0 && isPaCore && (
        <div className="mx-4 mb-2 mm-pa-guest-queue">
          <p className="mm-pa-guest-queue__title">👥 Guests waiting ({paGuestQueueCount})</p>
          {pendingPaGuests.map((g) => (
            <div key={g.socketId} className="mm-pa-guest-queue__row">
              <span className="truncate">{g.nickname}</span>
              <button type="button" className="mm-pa-guest-queue__approve" onClick={() => approvePaGuest(g.socketId)}>Let in</button>
              <button type="button" className="mm-pa-guest-queue__deny" onClick={() => denyPaGuest(g.socketId)}>Deny</button>
            </div>
          ))}
        </div>
      )}

      {isPaRoom && isPaCore && (
        <div className="mx-4 mb-2 mm-pa-theme-picker">
          {PA_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`mm-pa-theme-picker__btn${paThemeId === t.id ? ' mm-pa-theme-picker__btn--on' : ''}`}
              onClick={() => setPaTheme(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {showRoomTips && (
        <div className="mx-4 mb-2 mm-audio-room-tips">
          <div className="mm-audio-room-tips__inner">
            <span className="mm-audio-room-tips__text">
              👤 {isPaRoom ? 'PA for 2 · share guest link for +2' : 'Tap any speaker for PA · gift · hello'} · {canModerate && !isPaRoom ? '👑 Admin for lock/events' : ''}
            </span>
            <button
              type="button"
              className="mm-audio-room-tips__dismiss"
              onClick={() => { setShowRoomTips(false); localStorage.setItem('mm_audio_tips', '0'); }}
              aria-label="Dismiss tips"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[1fr_20rem] lg:gap-4 px-3 sm:px-4 pb-2 overflow-hidden">
        <section className={`mm-audio-stage-panel flex-shrink-0 lg:flex-shrink lg:min-h-0 lg:overflow-y-auto overflow-x-hidden${isPaRoom ? ' mm-audio-stage-panel--pa' : ''}`} style={stageStyle}>
          <h3 className="mm-audio-panel-label">
            {isPaRoom ? 'Private Audio · 2 speakers' : 'Stage · tap a speaker for PA · gift · hello'}
          </h3>
          <div className={`mm-audio-slot-grid${isPaRoom ? ' mm-audio-slot-grid--pa' : ''}`}>
            {slots.map((occupant, i) => (
              <StageSlot
                key={i}
                index={i}
                occupant={occupant}
                speaking={occupant && speakingIds.has(occupant.socketId) && !occupant.micMuted}
                canClaim={!occupant && !!me && !isPaRoom}
                onClaim={claimSlot}
                canModerate={canModerate}
                isSelf={occupant?.socketId === socket?.id}
                onModerate={moderate}
                isHost={isHost}
                isPa={isPaRoom}
                frameClass={frameClass}
                onUserTap={openUserMenu}
              />
            ))}
          </div>

          {!isPaRoom && listeners.length > 0 && (
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
                    <StageAvatar member={m} speaking={false} size="sm" frameClass={frameClass} onUserTap={m.socketId !== socket?.id ? openUserMenu : undefined} />
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
          {isPaRoom && (
            <div className="mm-audio-pa-stickers">
              {PA_STICKERS.map((s) => (
                <button key={s} type="button" className="mm-audio-pa-stickers__btn" onClick={() => sendSticker(s)} aria-label={`Send ${s}`}>{s}</button>
              ))}
            </div>
          )}
        </section>

        <aside className="mm-audio-chat-panel flex-1 min-h-0 flex flex-col mt-3 lg:mt-0">
          <div className="mm-audio-chat-panel__head">
            <span>Room chat</span>
            <span className="text-white/35 text-[10px]">60s vanish</span>
          </div>
          <div className="mm-audio-chat-panel__messages custom-scrollbar" ref={chatScrollRef}>
            {visibleChatMessages.length === 0 && <p className="text-xs text-white/30 text-center py-6">Say hello…</p>}
            {visibleChatMessages.map((m) => (
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

      <div className="mm-actionbar mm-actionbar--voice flex-shrink-0">
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
            <button
              type="button"
              onClick={handleToggleMic}
              className={`mm-btn flex-1 ${micMuted ? 'mm-btn--ghost' : '!bg-emerald-500 !text-black !border-emerald-400'}`}
            >
              {micMuted ? '🔇 Unmute' : '🎙 Live'}
            </button>
          )}
          {canModerate && (
            <button
              type="button"
              onClick={() => setAdminOpen(true)}
              className={`mm-btn !px-3 relative ${isHost ? '!bg-amber-500/15 !text-amber-200 !border-amber-400/30' : '!bg-sky-500/15 !text-sky-200 !border-sky-400/30'}`}
              aria-label={isHost ? 'Room admin' : 'Co-taker tools'}
              title={isHost ? 'Room admin' : 'Co-taker tools'}
            >
              {isHost ? '👑' : '🛡️'}
              {modQueueCount > 0 && <span className="mm-audio-admin-badge mm-audio-admin-badge--sm">{modQueueCount}</span>}
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
        <div className="mm-modal-overlay z-[500]" onClick={() => setAdminOpen(false)} role="presentation">
          <div className="mm-audio-room-modal w-full max-w-md" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold">{isHost ? 'Room admin' : 'Co-taker tools'}</h3>
              <button type="button" onClick={() => setAdminOpen(false)} className="w-8 h-8 rounded-lg bg-white/5">✕</button>
            </div>

            {canModerate && (pendingKnocks.length > 0 || pendingJoins.length > 0) && (
              <div className="mb-4 p-3 rounded-xl border border-amber-400/25 bg-amber-500/8">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-200 mb-2">Pending requests</p>
                {pendingKnocks.map((k) => (
                  <div key={k.socketId} className="flex items-center gap-2 text-xs mb-2">
                    <span className="flex-1 truncate">🚪 {k.nickname}</span>
                    <button type="button" className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-200" onClick={() => approveKnock(k.socketId)}>Let in</button>
                    <button type="button" className="px-2 py-1 rounded-lg bg-white/5 text-white/50" onClick={() => denyKnock(k.socketId)}>Deny</button>
                  </div>
                ))}
                {pendingJoins.map((p) => (
                  <div key={p.socketId} className="flex items-center gap-2 text-xs mb-2">
                    <span className="flex-1 truncate text-white/80">✋ {p.nickname} → seat {(p.slot ?? 0) + 1}</span>
                    <button type="button" className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-200" onClick={() => approveJoin(p.socketId, p.slot)}>Approve</button>
                    <button type="button" className="px-2 py-1 rounded-lg bg-white/5 text-white/50" onClick={() => denyJoin(p.socketId)}>Deny</button>
                  </div>
                ))}
              </div>
            )}

            {isHost && !isPaRoom && (
              <>
                <label className="block text-[10px] font-bold uppercase text-white/40 mb-1">Room name (emoji ok)</label>
                <div className="flex gap-2 mb-4">
                  <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={48} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  <button type="button" className="mm-btn mm-btn--primary !px-3" onClick={() => { renameRoom(renameValue); setUiMsg(`Room renamed to “${renameValue.trim()}”`); }}>Save</button>
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
                <label className="block text-[10px] font-bold uppercase text-white/40 mb-1">Room lock (4-digit code)</label>
                <div className="flex gap-2 mb-2">
                  <input
                    value={lockCodeInput}
                    onChange={(e) => setLockCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="1234"
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm tracking-[0.3em] text-center"
                  />
                  <button type="button" className="mm-btn mm-btn--primary !px-3" onClick={() => { setRoomLock(lockCodeInput); playLockSound(); setUiMsg('🔒 Room lock updated'); setLockCodeInput(''); }}>Lock</button>
                </div>
                <button type="button" className="mm-btn mm-btn--ghost w-full mb-4" onClick={() => { setRoomLock(''); playUnlockSound(); setUiMsg('🔓 Room unlocked'); }}>
                  Remove lock
                </button>
                <label className="block text-[10px] font-bold uppercase text-white/40 mb-1">Room theme</label>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {ROOM_THEMES_CLIENT.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border ${channel.themeId === t.id ? 'border-violet-400 bg-violet-500/20 text-violet-200' : 'border-white/10 bg-white/5 text-white/50'}`}
                      onClick={() => setTheme(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {!isPaRoom && (
                  <>
                    <label className="block text-[10px] font-bold uppercase text-white/40 mb-1">Entry fee (coins)</label>
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {[0, 5, 10, 25, 50].map((fee) => (
                        <button
                          key={fee}
                          type="button"
                          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border ${ (channel.entryFee || 0) === fee ? 'border-amber-400 bg-amber-500/20 text-amber-200' : 'border-white/10 bg-white/5 text-white/50'}`}
                          onClick={() => { setEntryFee(fee); setUiMsg(fee ? `Entry fee set to ${fee} coins` : 'Room is free to enter'); }}
                        >
                          {fee === 0 ? 'Free' : `${fee} 🪙`}
                        </button>
                      ))}
                    </div>
                    <label className="block text-[10px] font-bold uppercase text-white/40 mb-1">Schedule event</label>
                    <input
                      type="datetime-local"
                      value={scheduleAt}
                      onChange={(e) => setScheduleAt(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm mb-2"
                    />
                    <button
                      type="button"
                      className="mm-btn mm-btn--ghost w-full mb-4"
                      disabled={!scheduleAt}
                      onClick={() => {
                        const ts = new Date(scheduleAt).getTime();
                        if (!Number.isFinite(ts) || ts <= Date.now()) {
                          setUiMsg('Pick a future date/time');
                          return;
                        }
                        scheduleEvent(ts, renameValue || channel.topic);
                        setUiMsg('📅 Event scheduled — reminder 15 min before');
                        setScheduleAt('');
                      }}
                    >
                      📅 Schedule room opening
                    </button>
                  </>
                )}
              </>
            )}

            {!isPaRoom && (
            <>
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
            </>
            )}

            {!isHost && <p className="text-[10px] text-white/35">Co-takers can mute, remove, approve seats, and invite — not rename, wallpaper, or assign co-takers.</p>}
          </div>
        </div>
      )}

      {raceOpen && channel.gamesEnabled !== false && (
        <div className="mm-modal-overlay z-[500]" onClick={() => setRaceOpen(false)} role="presentation">
          <div className="mm-audio-room-modal mm-audio-room-modal--wide w-full max-w-lg max-h-[90dvh]" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-white">Highway Heist</h3>
                <p className="text-[10px] text-violet-200/60 mt-0.5">Coin Race · boost near loot · dodge hazards</p>
              </div>
              <button type="button" onClick={() => setRaceOpen(false)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/70">✕</button>
            </div>
            <CoinRaceGame socket={socket} channelId={channel.channelId} coins={coinBalance} />
          </div>
        </div>
      )}

      <GiftDrawer
        socket={socket}
        channelId={channel.channelId}
        members={members}
        coins={coinBalance}
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

      {userMenu && (
        <UserActionMenu
          member={userMenu.member}
          frameClass={frameClass}
          onHello={handleHello}
          showPa={!isPaRoom}
          onPa={handlePaInvite}
          onGift={openGiftFor}
          onReport={handleReportUser}
          onBlock={handleBlockUser}
          onClose={() => setUserMenu(null)}
        />
      )}

      <PaInviteModal
        invite={paInvite}
        onAccept={() => paInvite && respondPa(paInvite.inviteId, true)}
        onReject={() => paInvite && respondPa(paInvite.inviteId, false)}
      />

      <HelloAnimation event={helloEvent} onDone={dismissHello} />
      <StickerBurst event={stickerBurst} onDone={dismissSticker} />
      <GiftStreakBurst event={giftStreak} onDone={dismissGiftStreak} />
      <HostBonusToast bonus={hostBonus} onDone={dismissHostBonus} />
      <GiftBonusToast bonus={giftBonus} onDone={dismissGiftBonus} />
      <EntryAnimation event={entryAnim} onDone={() => setEntryAnim(null)} />
      <AudioCoinShop
        open={coinShopOpen}
        onClose={() => setCoinShopOpen(false)}
        identity={localIdentity}
        onBalanceUpdate={(id) => { setLocalIdentity(id); setCoinBalance(id?.coins ?? 0); onIdentityUpdate?.(); }}
      />
    </div>
  );
}

export default GroupAudioRoom;
