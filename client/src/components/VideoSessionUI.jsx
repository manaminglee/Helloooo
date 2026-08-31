/**
 * Shared UI for VideoChat + GroupVideoRoom: rating, more menu, reactions, devices, banners.
 */
import { useEffect, useRef, useState } from 'react';
import { MiniChatGamePanel } from './MiniChatGamePanel';
import { PHASE_3_PRO } from '../constants/features';

const REACTION_EMOJIS = ['😂', '🔥', '👏', '❤️', '😮', '🎉'];

export function ConversationRatingModal({ open, onClose, onRate, title = 'How was your chat?' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-black/90 backdrop-blur-3xl animate-fade-in" onClick={onClose}>
      <div className="bg-black border border-white/10 rounded-[32px] p-8 max-w-sm w-full text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-4xl mb-4">⭐</div>
        <h3 className="text-lg font-black uppercase tracking-tight text-white mb-2">{title}</h3>
        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-8">Anonymous feedback helps improve matches.</p>
        <div className="flex gap-2">
          {['Poor', 'Neutral', 'Elite'].map((label, idx) => (
            <button
              key={label}
              type="button"
              onClick={() => onRate(idx + 1)}
              className={`flex-1 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all ${idx === 2 ? 'bg-violet-500 text-black hover:bg-white' : 'bg-white/5 border border-white/5 hover:border-white/20 text-white/70'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="mt-4 text-[10px] text-white/30 hover:text-white/60 uppercase tracking-widest">Skip</button>
      </div>
    </div>
  );
}

export function VideoMoreSheet({
  open,
  onClose,
  isMobile,
  isTranslatorActive,
  onToggleTranslate,
  isScreenSharing,
  onToggleScreenShare,
  onFlipCamera,
  onOpenDevices,
  onIcebreaker,
  onCopyLink,
  onHandRaise,
  handRaised,
  onPinLocal,
  pinnedId,
  peerOptions = [],
  onPinPeer,
  onTip,
  onToggleBandwidth,
  autoBandwidth,
  lowBandwidth,
  onToggleAutoBlur,
  autoStrangerBlur,
  onHidePip,
  pipHidden,
  onCyclePipSize,
  pipSize,
  showGames,
  onRoomBoost,
  balance = 0,
  essentialOnly = false,
}) {
  if (!open) return null;
  const Item = ({ onClick, label, sub, active, disabled }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => { onClick?.(); onClose?.(); }}
      className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${active ? 'bg-violet-500/20 border-violet-500/40 text-violet-200' : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'} ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
    >
      <div className="text-sm font-bold">{label}</div>
      {sub && <div className="text-[10px] text-white/40 mt-0.5">{sub}</div>}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-[#0a0c14] border border-white/10 rounded-t-3xl sm:rounded-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-white/50">More options</h3>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white px-2">✕</button>
        </div>
        <div className="grid gap-2">
          {essentialOnly ? (
            <>
              {onOpenDevices && <Item onClick={onOpenDevices} label="Mic & camera" sub="Choose devices" />}
              {onToggleTranslate && <Item onClick={onToggleTranslate} label="Live translation" sub="Translate incoming messages" active={isTranslatorActive} />}
              {onToggleBandwidth && (
                <Item
                  onClick={onToggleBandwidth}
                  label={autoBandwidth ? 'Bandwidth: Auto' : (lowBandwidth ? 'Bandwidth: Low' : 'Bandwidth: High')}
                  sub="Tap to cycle quality"
                  active={!autoBandwidth && lowBandwidth}
                />
              )}
              {onToggleAutoBlur && <Item onClick={onToggleAutoBlur} label="Auto-blur strangers" sub="Blur new matches briefly" active={autoStrangerBlur} />}
            </>
          ) : (
            <>
          {onToggleTranslate && <Item onClick={onToggleTranslate} label="Live translation" sub="Translate incoming messages" active={isTranslatorActive} />}
          {onToggleScreenShare && <Item onClick={onToggleScreenShare} label={isScreenSharing ? 'Stop screen share' : 'Share screen'} sub="50 coins in group" active={isScreenSharing} />}
          {onFlipCamera && isMobile && <Item onClick={onFlipCamera} label="Flip camera" sub="Front / back" />}
          {onOpenDevices && <Item onClick={onOpenDevices} label="Mic & camera" sub="Choose devices" />}
          {onIcebreaker && <Item onClick={onIcebreaker} label="AI icebreaker" sub="Get a conversation starter" />}
          {onCopyLink && <Item onClick={onCopyLink} label="Copy room link" sub="Invite friends to this pod" />}
          {onHandRaise && <Item onClick={onHandRaise} label={handRaised ? 'Lower hand' : 'Raise hand'} sub="Signal you want to speak" active={handRaised} />}
          {onTip && <Item onClick={onTip} label="Tip creator" sub={`Balance: ${balance} coins`} disabled={balance < 10} />}
          {onToggleBandwidth && (
            <Item
              onClick={onToggleBandwidth}
              label={autoBandwidth ? 'Bandwidth: Auto' : (lowBandwidth ? 'Bandwidth: Low' : 'Bandwidth: High')}
              sub="Tap to cycle quality"
              active={!autoBandwidth && lowBandwidth}
            />
          )}
          {onToggleAutoBlur && <Item onClick={onToggleAutoBlur} label="Auto-blur strangers" sub="Blur new matches for 5 seconds" active={autoStrangerBlur} />}
          {isMobile && onHidePip && <Item onClick={onHidePip} label={pipHidden ? 'Show self view' : 'Hide self view'} sub="Picture-in-picture" active={pipHidden} />}
          {isMobile && onCyclePipSize && <Item onClick={onCyclePipSize} label={`PIP size: ${pipSize || 'md'}`} sub="Small / medium / large" />}
          {onRoomBoost && <Item onClick={onRoomBoost} label="Boost room visibility" sub="25 coins — public browser" disabled={balance < 25} />}
          {peerOptions.length > 0 && (
            <div className="pt-2 border-t border-white/10">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2 px-1">Pin speaker</p>
              {peerOptions.map((p) => (
                <Item key={p.id} onClick={() => onPinPeer?.(p.id)} label={p.label} active={pinnedId === p.id} />
              ))}
              {onPinLocal && <Item onClick={() => onPinPeer?.('local')} label="Pin yourself" active={pinnedId === 'local'} />}
            </div>
          )}
            </>
          )}
        </div>
        {!essentialOnly && showGames && PHASE_3_PRO.miniChatGames && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <MiniChatGamePanel onSendPrompt={(text) => { onIcebreaker?.(text, true); onClose?.(); }} />
          </div>
        )}
      </div>
    </div>
  );
}

export function VideoReactionBar({ onReact, disabled }) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10">
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          disabled={disabled}
          onClick={() => onReact(emoji)}
          className="w-8 h-8 rounded-lg hover:bg-white/10 text-lg transition-transform hover:scale-110 disabled:opacity-30"
          aria-label={`React ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export function FloatingVideoReactions({ reactions }) {
  if (!reactions?.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[70] overflow-hidden">
      {reactions.map((r) => (
        <span
          key={r.id}
          className="absolute text-3xl animate-[mm-float-up_3s_ease-out_forwards]"
          style={{ left: `${r.x}%`, top: `${r.y}%` }}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );
}

export function DevicePickerSheet({ open, onClose, videoDevices, audioDevices, selectedVideoId, selectedAudioId, onSelectVideo, onSelectAudio }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[520] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-[#0a0c14] border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xs font-black uppercase tracking-widest text-white/50 mb-4">Audio & video devices</h3>
        <label className="block text-[10px] font-bold text-white/40 uppercase mb-2">Camera</label>
        <select
          value={selectedVideoId || ''}
          onChange={(e) => onSelectVideo(e.target.value)}
          className="w-full mb-4 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500/50"
        >
          {videoDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId} className="bg-[#111]">{d.label || `Camera ${d.deviceId.slice(0, 6)}`}</option>
          ))}
        </select>
        <label className="block text-[10px] font-bold text-white/40 uppercase mb-2">Microphone</label>
        <select
          value={selectedAudioId || ''}
          onChange={(e) => onSelectAudio(e.target.value)}
          className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500/50"
        >
          {audioDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId} className="bg-[#111]">{d.label || `Mic ${d.deviceId.slice(0, 6)}`}</option>
          ))}
        </select>
        <button type="button" onClick={onClose} className="mt-4 w-full py-3 rounded-xl bg-violet-600 text-white text-sm font-bold">Done</button>
      </div>
    </div>
  );
}

export function VideoSessionBanners({
  showSafetyNudge,
  onDismissSafety,
  peerRecording,
  showStayConnected,
  onStayConnected,
  onDismissStayConnected,
  matchedInterests = [],
  hideMatchedInterests = false,
}) {
  return (
    <>
      {showSafetyNudge && (
        <div className="shrink-0 px-3 py-1.5 flex items-center gap-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-100 text-[10px]">
          <span aria-hidden>🛡️</span>
          <p className="flex-1 leading-snug"><strong className="font-bold uppercase tracking-wide">Stay safe:</strong> Don’t share personal info — report or skip anytime.</p>
          <button type="button" onClick={onDismissSafety} className="shrink-0 text-amber-300/80 hover:text-white min-h-[28px] min-w-[28px]" aria-label="Dismiss">✕</button>
        </div>
      )}
      {peerRecording && (
        <div className="shrink-0 px-3 py-1 text-center text-[9px] font-bold uppercase tracking-widest bg-rose-500/15 border-b border-rose-500/25 text-rose-200" role="status">
          Partner may be recording this session
        </div>
      )}
      {!hideMatchedInterests && matchedInterests.length > 0 && (
        <div className="shrink-0 px-3 py-1 flex flex-wrap gap-1.5 justify-center border-b border-violet-500/15 bg-violet-500/5">
          <span className="text-[9px] font-bold uppercase text-white/30 tracking-widest">Also into</span>
          {matchedInterests.map((tag) => (
            <span key={tag} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300">#{tag}</span>
          ))}
        </div>
      )}
      {showStayConnected && (
        <div className="fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[180] w-[min(92vw,20rem)] p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 backdrop-blur-xl shadow-2xl animate-fade-in">
          <p className="text-sm font-bold text-emerald-100 mb-3 text-center">Good vibes match! Follow this creator?</p>
          <div className="flex gap-2">
            <button type="button" onClick={onDismissStayConnected} className="flex-1 py-2 rounded-xl bg-white/10 text-xs font-bold text-white/70">Maybe later</button>
            <button type="button" onClick={onStayConnected} className="flex-1 py-2 rounded-xl bg-emerald-500 text-black text-xs font-black uppercase">Follow</button>
          </div>
        </div>
      )}
    </>
  );
}

export function TipCreatorModal({ open, onClose, onTip, balance, creatorName }) {
  const [amount, setAmount] = useState(10);
  if (!open) return null;
  const options = [10, 25, 50];
  return (
    <div className="fixed inset-0 z-[530] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xs bg-[#0a0c14] border border-amber-500/20 rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-black text-amber-400 uppercase tracking-widest mb-1">Tip creator</h3>
        <p className="text-xs text-white/50 mb-4">Send coins to @{creatorName || 'creator'}</p>
        <div className="flex gap-2 mb-4">
          {options.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setAmount(n)}
              className={`flex-1 py-2 rounded-xl text-sm font-bold border ${amount === n ? 'bg-amber-500 text-black border-amber-500' : 'border-white/10 text-white/70'}`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-white/30 mb-4 text-center">Your balance: {balance} coins</p>
        <button
          type="button"
          disabled={balance < amount}
          onClick={() => { onTip(amount); onClose(); }}
          className="w-full py-3 rounded-xl bg-amber-500 text-black font-black uppercase text-xs disabled:opacity-40"
        >
          Send {amount} coins
        </button>
      </div>
    </div>
  );
}

export function ConnectionQualityBadge({ quality, latency }) {
  const label = quality === 'good' ? 'HD' : quality === 'ok' ? 'OK' : quality === 'poor' ? 'Low' : '…';
  const color = quality === 'good' ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' : quality === 'ok' ? 'text-amber-300 bg-amber-500/15 border-amber-500/30' : 'text-rose-300 bg-rose-500/15 border-rose-500/30';
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-widest ${color}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      {label}
      {latency != null && <span className="opacity-60 tabular-nums">{Math.round(latency)}ms</span>}
    </div>
  );
}

export function CollapsibleMobileChatHeader({ collapsed, onToggle, unread, title = 'Chat' }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="sm:hidden flex items-center justify-between w-full px-4 py-2 border-b border-white/10 bg-black/30 shrink-0"
    >
      <span className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
        {title}
        {unread > 0 && !collapsed && (
          <span className="min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-violet-500 text-black text-[9px] font-black flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>
        )}
      </span>
      <span className="text-white/30 text-xs">{collapsed ? 'Show ▲' : 'Hide ▼'}</span>
    </button>
  );
}

/** Swipe-down on chat panel to collapse (mobile). */
export function useChatSwipeCollapse(ref, onCollapse) {
  const startY = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !onCollapse) return;
    const onStart = (e) => { startY.current = e.touches?.[0]?.clientY ?? null; };
    const onMove = (e) => {
      if (startY.current == null) return;
      const y = e.touches[0].clientY;
      if (y - startY.current > 60) {
        onCollapse();
        startY.current = null;
      }
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
    };
  }, [ref, onCollapse]);
}

export function StrangerRevealOverlay({ show, onReveal }) {
  if (!show) return null;
  return (
    <div className="absolute inset-0 z-[45] flex flex-col items-center justify-center bg-black/40 backdrop-blur-xl">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-4">Stranger connected</p>
      <button type="button" onClick={onReveal} className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-black uppercase tracking-widest shadow-xl">
        Show video
      </button>
    </div>
  );
}

export function AudioOnlyFallback({ nickname, onRetryCamera, onAudioOnly, micBlocked = false }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-gradient-to-b from-[#0a0a12] to-black p-6 text-center">
      <div className="w-20 h-20 rounded-full bg-violet-500/20 border-2 border-violet-500/40 flex items-center justify-center text-3xl mb-4">🎙️</div>
      <p className="text-sm font-bold text-white mb-1">Camera unavailable</p>
      <p className="text-xs text-white/50 mb-1 max-w-[16rem]">You can retry camera access, or continue with voice only.</p>
      {micBlocked && (
        <p className="text-[11px] text-rose-400 font-bold mb-1 max-w-[16rem]">Microphone is blocked too — check browser/site permissions, then retry.</p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
        {onRetryCamera && (
          <button type="button" onClick={onRetryCamera} className="px-4 py-2 rounded-xl bg-white/10 text-xs font-bold text-white hover:bg-white/20">Retry camera</button>
        )}
        {onAudioOnly && !micBlocked && (
          <button type="button" onClick={onAudioOnly} className="px-4 py-2 rounded-xl bg-violet-600 text-xs font-bold text-white hover:bg-violet-500">Continue audio-only</button>
        )}
      </div>
    </div>
  );
}

const VIDEO_CONNECT_STEPS = [
  { id: 'boot', label: 'Open Helloooo' },
  { id: 'media', label: 'Camera & mic' },
  { id: 'webrtc', label: 'WebRTC ready' },
  { id: 'signaling', label: 'Signaling' },
  { id: 'matching', label: 'Find match' },
  { id: 'matched', label: 'Match found' },
  { id: 'negotiating', label: 'SDP / ICE' },
  { id: 'video', label: 'Video live' },
];

/** Simple searching / connecting UI — no technical step checklist. */
export function VideoSearchingOverlay({
  label = 'Searching…',
  sublabel = 'Finding someone for you',
  compact = false,
  fill = false,
}) {
  if (compact) {
    return (
      <div className="mm-video-connecting-badge" aria-live="polite">
        <span className="mm-omegle-search__spinner mm-omegle-search__spinner--sm" aria-hidden />
        <span>{label}</span>
      </div>
    );
  }

  const inner = (
    <>
      <div className="mm-omegle-search__spinner" aria-hidden />
      <p className="text-sm font-semibold text-white mb-1">{label}</p>
      {sublabel ? (
        <p className="text-xs text-white/45 text-center max-w-[16rem]">{sublabel}</p>
      ) : null}
      <div className="mm-search-dots" aria-hidden>
        <span /><span /><span />
      </div>
    </>
  );

  if (fill) {
    return (
      <div className="mm-omegle-search" aria-live="polite">
        {inner}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center text-center py-2" aria-live="polite">
      {inner}
    </div>
  );
}

/** @deprecated UI removed from video chat — kept for reference */
export function VideoConnectPipeline({ phase = 'boot', compact = false }) {
  const idx = Math.max(0, VIDEO_CONNECT_STEPS.findIndex((s) => s.id === phase));
  const current = VIDEO_CONNECT_STEPS[idx] || VIDEO_CONNECT_STEPS[0];

  if (compact) {
    return (
      <div className="mm-connect-pipeline mm-connect-pipeline--compact" aria-live="polite">
        <span className="mm-connect-pipeline__pulse" aria-hidden />
        <span className="mm-connect-pipeline__label">{current.label}</span>
        {phase === 'matched' && <span className="mm-connect-pipeline__flash">⚡</span>}
      </div>
    );
  }

  return (
    <div className="mm-connect-pipeline" aria-live="polite">
      <p className="mm-connect-pipeline__title">Connecting</p>
      <ol className="mm-connect-pipeline__steps">
        {VIDEO_CONNECT_STEPS.map((step, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <li
              key={step.id}
              className={`mm-connect-pipeline__step ${done ? 'mm-connect-pipeline__step--done' : ''} ${active ? 'mm-connect-pipeline__step--active' : ''}`}
            >
              <span className="mm-connect-pipeline__dot" aria-hidden>
                {done ? '✓' : active && step.id === 'matched' ? '⚡' : i + 1}
              </span>
              <span className="mm-connect-pipeline__text">{step.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
