/**
 * Optional desktop notifications when the tab is in the background (match found, queue, etc.)
 * Honors the `notifyBrowser` user pref (utils/userPrefs).
 */
import { getPrefs } from './userPrefs';

export async function ensureNotifyPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (!getPrefs().notifyBrowser) return 'disabled';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const p = await Notification.requestPermission();
    return p;
  } catch {
    return 'denied';
  }
}

export function notifyIfBackground(title, body, opts = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (!getPrefs().notifyBrowser) return;
  if (Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  try {
    new Notification(title, { body, icon: '/apple-touch-icon.png', ...opts });
  } catch {
    /* ignore */
  }
}
