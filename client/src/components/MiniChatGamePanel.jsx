const GAMES = [
  { q: 'Would you rather travel to the mountains or the beach?', a: ['Mountains', 'Beach'] },
  { q: 'Would you rather watch a movie or play a game tonight?', a: ['Movie', 'Game'] },
  { q: 'Coffee or tea?', a: ['Coffee', 'Tea'] },
  { q: 'Cats or dogs?', a: ['Cats', 'Dogs'] },
  { q: 'Morning person or night owl?', a: ['Morning', 'Night'] },
];

export function MiniChatGamePanel({ onSendPrompt }) {
  const game = GAMES[Math.floor(Math.random() * GAMES.length)];

  return (
    <div className="rounded-xl border border-white/10 bg-[#161a22] p-4">
      <div className="text-xs text-white/50 mb-2">Mini game</div>
      <p className="text-sm text-white mb-3">{game.q}</p>
      <div className="flex flex-wrap gap-2">
        {game.a.map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => onSendPrompt(`I pick: ${choice}`)}
            className="min-h-[40px] px-4 rounded-lg border border-white/15 text-sm text-white/80 hover:bg-white/10"
          >
            {choice}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onSendPrompt(game.q)}
          className="min-h-[40px] px-4 rounded-lg bg-white/10 text-sm text-white"
        >
          Ask partner
        </button>
      </div>
    </div>
  );
}

/** Toggleable modal wrapper for mini games */
export function MiniChatGameModal({ open, onClose, onSendPrompt }) {
  if (!open) return null;

  const handleSend = (text) => {
    onSendPrompt?.(text);
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-[520] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0f121a] p-5 shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Mini game"
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-bold text-white">Mini game</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 text-white/60 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <MiniChatGamePanel onSendPrompt={handleSend} />
      </div>
    </div>
  );
}
