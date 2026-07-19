/**
 * userPrefs.js — Tiny persisted user preferences for Mana Mingle
 * localStorage-backed (single JSON blob), defensive parse, subscribe/notify
 * pattern plus a React `usePrefs()` hook.
 *
 * NOTE: keep this module dependency-free (no imports from components/) so it
 * can be consumed from anywhere without circular-import risk.
 */
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'mm_user_prefs_v1';

export const PREF_DEFAULTS = {
  soundFx: true,
  notifyBrowser: true,
  vanishMessages: true,
  enterToSend: true,
  showLatency: true,
  videoQuality: 'auto', // 'auto' | 'low' | 'hd'
};

const VALID_VIDEO_QUALITY = new Set(['auto', 'low', 'hd']);

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...PREF_DEFAULTS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...PREF_DEFAULTS };
    const merged = { ...PREF_DEFAULTS, ...parsed };
    // Sanitize values back onto defaults' types
    for (const k of Object.keys(PREF_DEFAULTS)) {
      if (typeof merged[k] !== typeof PREF_DEFAULTS[k]) merged[k] = PREF_DEFAULTS[k];
    }
    if (!VALID_VIDEO_QUALITY.has(merged.videoQuality)) merged.videoQuality = 'auto';
    return merged;
  } catch {
    return { ...PREF_DEFAULTS };
  }
}

let cache = load();
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => {
    try { fn(cache); } catch { /* ignore listener errors */ }
  });
}

/** Current snapshot of all prefs (object is replaced on every setPref). */
export function getPrefs() {
  return cache;
}

/** Convenience single-key getter. */
export function getPref(key) {
  return cache[key];
}

/** Persist a single pref and notify subscribers. */
export function setPref(key, value) {
  if (!(key in PREF_DEFAULTS)) return;
  cache = { ...cache, [key]: value };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch { /* storage full / private mode — prefs stay session-only */ }
  notify();
}

/** subscribe/notify pattern — returns an unsubscribe fn. */
export function subscribePrefs(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React hook — re-renders the component whenever any pref changes. */
export function usePrefs() {
  const [prefs, setPrefs] = useState(getPrefs);
  useEffect(() => subscribePrefs(() => setPrefs(getPrefs())), []);
  return prefs;
}
