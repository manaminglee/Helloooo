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
    <div className="rounded-xl border border-white/10 bg-[#161a22] p-4 mb-3">
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
