export function ConversationRatingModal({ open, onRate, onSkip }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2500] flex items-end sm:items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#161a22] p-6">
        <h3 className="text-lg font-semibold text-white mb-2">Rate this conversation</h3>
        <p className="text-sm text-white/50 mb-4">Your feedback helps improve matching.</p>
        <div className="flex justify-center gap-2 mb-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onRate(n)}
              className="min-h-[48px] min-w-[48px] rounded-xl border border-white/10 bg-white/5 text-lg hover:bg-white/15"
            >
              {n <= 2 ? '😞' : n === 3 ? '😐' : n === 4 ? '🙂' : '😍'}
            </button>
          ))}
        </div>
        <button type="button" onClick={onSkip} className="w-full min-h-[44px] text-sm text-white/50 hover:text-white">
          Skip
        </button>
      </div>
    </div>
  );
}
