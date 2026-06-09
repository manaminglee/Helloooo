/** Structured conversation modes — Mana Mingle differentiators */
export const CONVERSATION_MODES = [
  { id: 'free', label: 'Free Chat', icon: '💬', desc: 'Open conversation' },
  { id: 'language_exchange', label: 'Language Exchange', icon: '🌍', desc: '5 min each language' },
  { id: 'debate', label: 'Friendly Debate', icon: '⚖️', desc: 'Light topics only' },
  { id: 'interview', label: 'Interview Practice', icon: '🎯', desc: 'Mock Q&A' },
  { id: 'speed_mingle', label: 'Speed Mingle', icon: '⚡', desc: '3-min rounds' },
  { id: 'story_chain', label: 'Story Chain', icon: '📖', desc: 'Build a tale together' },
  { id: 'two_truths', label: 'Two Truths & a Lie', icon: '🎭', desc: 'Guess the lie' },
];

export const TOPIC_CONTRACTS = [
  { id: 'chill', label: 'Chill vibes only', icon: '😌' },
  { id: 'gaming', label: 'Gaming talk', icon: '🎮' },
  { id: 'no-flirt', label: 'No flirting', icon: '🚫' },
  { id: 'learn', label: 'Learning & ideas', icon: '📚' },
  { id: 'creative', label: 'Creative collab', icon: '✨' },
];

export const MM_SESSION_PREFS_KEY = 'mm_session_prefs_v2';

export function loadSessionPrefs() {
  try {
    return JSON.parse(localStorage.getItem(MM_SESSION_PREFS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveSessionPrefs(prefs) {
  try {
    localStorage.setItem(MM_SESSION_PREFS_KEY, JSON.stringify(prefs));
  } catch { /* ignore */ }
}
