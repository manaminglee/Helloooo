/**
 * API + Socket base URL for production (GitHub Pages) and local dev.
 * Falls back to Render when VITE_SOCKET_URL is missing from the build.
 */
const PRODUCTION_API = 'https://manamingle-73gd.onrender.com';

export function getApiBase() {
  const env = (import.meta.env.VITE_SOCKET_URL || '').trim();
  if (env) return env.replace(/\/$/, '');
  if (import.meta.env.PROD && typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'manamingle.site' || host === 'www.manamingle.site' || host.endsWith('.github.io')) {
      return PRODUCTION_API;
    }
  }
  if (typeof window !== 'undefined') return window.location.origin.replace(/\/$/, '');
  return '';
}

export const API_BASE = getApiBase();
