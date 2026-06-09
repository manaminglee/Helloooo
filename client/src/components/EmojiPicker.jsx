import { useState } from 'react';

const EMOJI_GROUPS = [
  ['😀', '😂', '🙂', '😉', '😍', '🥰', '😎', '🤔', '😮', '😢', '😡', '👍'],
  ['❤️', '🔥', '✨', '🎉', '👏', '🙏', '💯', '⭐', '🎵', '🎮', '⚽', '🍕'],
  ['👋', '🤝', '💬', '📹', '🎥', '👥', '🌍', '🇮🇳', '🇺🇸', '🇬🇧', '✅', '❌'],
];

export function EmojiPicker({ onPick, onClose, className = '' }) {
  const [tab, setTab] = useState(0);

  return (
    <div className={`rounded-xl border border-white/10 bg-[#161a22] p-3 shadow-xl z-[500] ${className}`} role="listbox" aria-label="Emoji picker">
      <div className="flex gap-1 mb-2">
        {EMOJI_GROUPS.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setTab(i)}
            className={`flex-1 py-1 text-xs rounded ${tab === i ? 'bg-white/15 text-white' : 'text-white/40'}`}
          >
            {i + 1}
          </button>
        ))}
        {onClose && (
          <button type="button" onClick={onClose} className="px-2 text-white/40 hover:text-white text-xs">✕</button>
        )}
      </div>
      <div className="grid grid-cols-6 gap-1 max-h-36 overflow-y-auto">
        {EMOJI_GROUPS[tab].map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onPick(emoji)}
            className="min-h-[44px] min-w-[44px] rounded-lg hover:bg-white/10 text-xl flex items-center justify-center"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
