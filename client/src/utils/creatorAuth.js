/** Secure creator session headers (opaque token from login). */

const SESSION_KEY = 'mm_creator_session';
const LEGACY_REF_KEY = 'mm_creatorId';

export function getCreatorSessionToken() {
  try {
    return (typeof localStorage !== 'undefined' && localStorage.getItem(SESSION_KEY)) || '';
  } catch {
    return '';
  }
}

export function setCreatorSessionToken(token) {
  try {
    if (token) {
      localStorage.setItem(SESSION_KEY, token);
      localStorage.removeItem('mm_logout_flag');
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
    try {
      window.dispatchEvent(new CustomEvent('mm-creator-session', { detail: { token: token || '' } }));
    } catch { /* ignore */ }
  } catch { /* ignore */ }
}

export function clearCreatorSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LEGACY_REF_KEY);
    localStorage.setItem('mm_logout_flag', '1');
    try {
      window.dispatchEvent(new CustomEvent('mm-creator-session', { detail: { token: '' } }));
    } catch { /* ignore */ }
  } catch { /* ignore */ }
}

/** Headers for creator-authenticated API calls. */
export function getCreatorAuthHeaders() {
  try {
    const session = getCreatorSessionToken();
    if (session) {
      return {
        'X-Creator-Session': session,
        'X-Creator-Token': session,
        Authorization: `Bearer ${session}`,
      };
    }
    // Legacy referral code — only until user re-logs in
    const legacy = typeof localStorage !== 'undefined' && localStorage.getItem(LEGACY_REF_KEY);
    if (legacy && !String(legacy).startsWith('cs_')) {
      return { 'X-Creator-Referral': legacy };
    }
    return {};
  } catch {
    return {};
  }
}

export const CREATOR_MIN_WITHDRAWAL_COINS = 10000;
export const CREATOR_SESSION_KEY = SESSION_KEY;
