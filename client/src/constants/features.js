/**
 * Feature phases and Pro feature gating
 */

export const PHASE_1 = {
  typingIndicator: true,
  conversationTimer: true,
  quickReactions: true,
};

export const PHASE_2 = {
  voiceMessages: true,
  conversationRating: true,
  smartMatching: true,
};

export const PHASE_3_PRO = {
  aiMoodDetection: true,
  reconnectToken: true,
  miniChatGames: true,
};

export const PHASE_4_UNIQUE = {
  mutualConsent: true,
  nvidiaCopilot: true,
  structuredModes: true,
  trustScore: true,
  liveCaptions: true,
  dataSaverHud: true,
  communityEvents: true,
  coOpStreak: true,
  calmMode: true,
};

export function isProUser(user) {
  return user?.isPro === true || user?.subscription === 'pro';
}
