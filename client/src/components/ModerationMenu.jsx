export function ModerationMenu({ onReport, onBlock, onMute, onKick, isHost = false, targetLabel = 'user' }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onReport} className="min-h-[40px] px-3 rounded-lg border border-amber-500/30 text-xs text-amber-300 hover:bg-amber-500/10">
        Report {targetLabel}
      </button>
      <button type="button" onClick={onBlock} className="min-h-[40px] px-3 rounded-lg border border-rose-500/30 text-xs text-rose-300 hover:bg-rose-500/10">
        Block
      </button>
      {onMute && (
        <button type="button" onClick={onMute} className="min-h-[40px] px-3 rounded-lg border border-white/15 text-xs text-white/70 hover:bg-white/10">
          Mute
        </button>
      )}
      {isHost && onKick && (
        <button type="button" onClick={onKick} className="min-h-[40px] px-3 rounded-lg border border-rose-500/40 text-xs text-rose-200 hover:bg-rose-500/10">
          Kick
        </button>
      )}
    </div>
  );
}

export function SafetyBanner({ onReport }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#161a22] px-3 py-2 text-xs text-white/60">
      <span>Be respectful. No harassment or explicit content.</span>
      {onReport && (
        <button type="button" onClick={onReport} className="min-h-[36px] px-3 rounded-md border border-white/15 text-white/80 hover:bg-white/10 shrink-0">
          Report
        </button>
      )}
    </div>
  );
}
