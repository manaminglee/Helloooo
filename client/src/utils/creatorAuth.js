/** Headers for creator-authenticated API calls (referral code from login). */
export function getCreatorAuthHeaders() {
  try {
    const token = typeof localStorage !== 'undefined' && localStorage.getItem('mm_creatorId');
    if (!token) return {};
    return { 'X-Creator-Token': token };
  } catch {
    return {};
  }
}

export const CREATOR_MIN_WITHDRAWAL_COINS = 2000;
