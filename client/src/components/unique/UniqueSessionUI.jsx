/** Shared UI for Mana Mingle unique session features + NVIDIA AI branding */

export function ConsentSessionGate({
  visible,
  partnerReady,
  totalPartners,
  topicContract,
  conversationMode,
  modePrompt,
  onReady,
  onAudioReady,
  audioIntroDone,
  aiOnline,
}) {
  if (!visible) return null;
  return (
    <div className="mm-neural-gate absolute inset-0 z-[200] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl">
      <div className="mm-neural-panel max-w-md w-full p-6 sm:p-8 text-center">
        <div className="mm-neural-badge mx-auto mb-4">NVIDIA AI · Mutual consent</div>
        <h2 className="text-lg font-black text-white mb-2 uppercase tracking-widest">Both ready?</h2>
        <p className="text-xs text-white/50 mb-4 leading-relaxed">
          Remote video stays blurred until you and your partner both tap ready. Rule: <strong className="text-[#76B900]">{topicContract}</strong> · Mode: <strong className="text-violet-300">{conversationMode}</strong>
        </p>
        {modePrompt && (
          <p className="text-sm text-white/80 mb-4 p-3 rounded-xl bg-white/5 border border-[#76B900]/20 italic">&ldquo;{modePrompt}&rdquo;</p>
        )}
        <div className="flex items-center justify-center gap-2 mb-6 text-[10px] font-black uppercase tracking-widest text-white/40">
          <span className={`w-2 h-2 rounded-full ${partnerReady >= 1 ? 'bg-[#76B900]' : 'bg-white/20'}`} /> You
          <span className="text-white/20">·</span>
          <span className={`w-2 h-2 rounded-full ${partnerReady >= totalPartners ? 'bg-[#76B900]' : 'bg-white/20 animate-pulse'}`} /> Partner ({partnerReady}/{totalPartners})
        </div>
        {!audioIntroDone ? (
          <button type="button" onClick={onAudioReady} className="mm-neural-btn w-full mb-2">Start audio intro (15s)</button>
        ) : null}
        <button type="button" onClick={onReady} className="mm-neural-btn mm-neural-btn--primary w-full">
          I&apos;m ready — show video
        </button>
        {aiOnline && <p className="mt-3 text-[9px] text-[#76B900]/80 uppercase tracking-widest">Powered by NVIDIA NIM</p>}
      </div>
    </div>
  );
}

export function NvidiaCopilotToast({ prompt, onUse, onDismiss }) {
  if (!prompt) return null;
  return (
    <div className="fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[190] w-[min(92vw,22rem)] mm-neural-panel p-4 animate-fade-in">
      <div className="mm-neural-badge mb-2">AI co-pilot</div>
      <p className="text-sm text-white/90 mb-3">{prompt}</p>
      <div className="flex gap-2">
        <button type="button" onClick={onUse} className="flex-1 mm-neural-btn mm-neural-btn--primary text-xs py-2">Use prompt</button>
        <button type="button" onClick={onDismiss} className="flex-1 mm-neural-btn text-xs py-2">Dismiss</button>
      </div>
    </div>
  );
}

export function TrustScoreChip({ trust }) {
  if (!trust) return null;
  const color = trust.level === 'trusted' ? 'text-[#76B900]' : trust.level === 'new' ? 'text-amber-400' : 'text-white/50';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/10 bg-black/40 text-[8px] font-black uppercase tracking-widest ${color}`} title="Anonymous trust score">
      🛡️ {trust.score}
      {trust.badges?.[0] && <span className="opacity-70">· {trust.badges[0]}</span>}
    </span>
  );
}

export function DataSaverHud({ bytesEstimate, ultraLow, onToggleUltra }) {
  const mb = (bytesEstimate / (1024 * 1024)).toFixed(1);
  return (
    <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-white/35">
      <span>📶 ~{mb} MB</span>
      <button type="button" onClick={onToggleUltra} className={`px-2 py-0.5 rounded-full border ${ultraLow ? 'border-[#76B900] text-[#76B900]' : 'border-white/15 text-white/40'}`}>
        Ultra-low {ultraLow ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}

export function LiveCaptionsBar({ caption, enabled, onToggle }) {
  return (
    <div className="absolute bottom-16 left-2 right-2 z-[60] pointer-events-none">
      {enabled && caption && (
        <p className="text-center text-sm font-medium text-white bg-black/70 backdrop-blur-md px-3 py-2 rounded-xl border border-[#76B900]/30 mb-2">{caption}</p>
      )}
      <button
        type="button"
        onClick={onToggle}
        className="pointer-events-auto mx-auto block text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-black/50 border border-white/15 text-white/60 hover:text-white"
      >
        {enabled ? 'Captions on' : 'Live captions'}
      </button>
    </div>
  );
}

export function EventsHubStrip({ events = [] }) {
  if (!events.length) return null;
  return (
    <section className="mm-neural-section w-full max-w-5xl mx-auto px-4 mb-10">
      <div className="flex items-center gap-2 mb-4">
        <span className="mm-neural-badge">Community events</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none]">
        {events.map((e) => (
          <div key={e.id} className={`mm-neural-card shrink-0 w-44 p-4 ${e.live ? 'mm-neural-card--live' : ''}`}>
            <span className="text-2xl">{e.badge}</span>
            <p className="text-xs font-bold text-white mt-2">{e.title}</p>
            <p className="text-[10px] text-white/40 mt-1">{e.day} · {e.hourUtc}:00 UTC</p>
            {e.live && <span className="text-[9px] font-black text-[#76B900] uppercase mt-2 block">Live now</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

import { CONVERSATION_MODES, TOPIC_CONTRACTS } from '../../constants/conversationModes';

export function ConversationModePicker({ mode, contract, onMode, onContract }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Conversation mode</p>
        <div className="flex flex-wrap gap-2">
          {CONVERSATION_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onMode(m.id)}
              className={`px-3 py-2 rounded-xl text-left border transition-all min-w-[7rem] ${mode === m.id ? 'border-[#76B900] bg-[#76B900]/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
            >
              <span className="text-lg">{m.icon}</span>
              <span className="block text-[10px] font-bold text-white mt-1">{m.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Topic contract</p>
        <div className="flex flex-wrap gap-2">
          {TOPIC_CONTRACTS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onContract(c.id)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-bold border ${contract === c.id ? 'border-violet-500 bg-violet-500/20 text-violet-200' : 'border-white/10 text-white/50'}`}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CoOpStreakBadge({ minutes }) {
  if (!minutes) return null;
  return (
    <span className="text-[9px] font-black uppercase tracking-widest text-amber-400/90 px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10">
      🤝 {minutes}m together
    </span>
  );
}

export function CalmModeToggle({ enabled, onToggle }) {
  return (
    <button type="button" onClick={onToggle} className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg border ${enabled ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' : 'border-white/10 text-white/40'}`}>
      {enabled ? 'Calm on' : 'Calm mode'}
    </button>
  );
}

export function AiStatusPill({ online }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${online ? 'border-[#76B900]/40 text-[#76B900] bg-[#76B900]/10' : 'border-white/15 text-white/30'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-[#76B900] animate-pulse' : 'bg-white/30'}`} />
      NVIDIA AI {online ? 'online' : 'offline'}
    </span>
  );
}
