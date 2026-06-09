const KEY = 'mm_reconnect_session';
const MAX_AGE_MS = 60000;

export function saveReconnectSession(payload) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...payload, savedAt: Date.now() }));
  } catch { /* ignore */ }
}

export function loadReconnectSession() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.roomId || Date.now() - (data.savedAt || 0) > MAX_AGE_MS) {
      clearReconnectSession();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearReconnectSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch { /* ignore */ }
}
