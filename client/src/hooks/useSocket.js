import { useState, useEffect, useSyncExternalStore } from 'react';
import { API_BASE } from '../config/apiBase';

const BASE_URL = API_BASE;

let socket = null;
let socketInitPromise = null;
let state = {
  socket: null,
  connected: false,
  country: null,
  onlineCount: { count: 0, regions: { in: 0, us: 0, eu: 0, ot: 0 } },
  adsEnabled: false,
  adScripts: {
    hero: '',
    sidebar: '',
    footer: '',
    chat_banner: '',
    chat_sidebar: '',
  },
  allowDevTools: true,
  nickname: 'Anonymous',
  isCreator: false,
  contentFlagged: null,
  isBlocked: false,
  registered: false,
  activeSeconds: 0,
};

const listeners = new Set();
let flaggedTimeout = null;

function emit() {
  listeners.forEach((fn) => fn());
}

function patchState(next) {
  state = { ...state, ...next };
  emit();
}

async function ensureSocket() {
  if (socket) return socket;
  if (socketInitPromise) return socketInitPromise;

  socketInitPromise = (async () => {
    const { io } = await import('socket.io-client');
    const s = io(BASE_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    });

    socket = s;
    patchState({ socket: s });
    window.socket = s;

    s.on('connect', () => patchState({ connected: true, isBlocked: false }));
    s.on('disconnect', () => patchState({ connected: false }));
    s.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      patchState({ connected: false });
    });

    s.on('connected', (data) => {
      patchState({
        country: data?.country || null,
        nickname: data?.nickname || 'Anonymous',
        isCreator: !!data?.isCreator,
        registered: !!data?.registered,
        activeSeconds: data?.activeSeconds || 0,
      });
      if (data?.settings) {
        patchState({
          adsEnabled: !!data.settings.adsEnabled,
          allowDevTools: !!data.settings.allowDevTools,
          adScripts: data.settings.adScripts && typeof data.settings.adScripts === 'object'
            ? { ...state.adScripts, ...data.settings.adScripts }
            : state.adScripts,
        });
      }
    });

    s.on('online_count', (data) => {
      if (JSON.stringify(state.onlineCount) !== JSON.stringify(data)) {
        patchState({ onlineCount: data });
      }
    });

    s.on('blocked-ip', (data) => {
      console.warn('[Socket] Blocked by server:', data?.reason || 'No reason provided');
      patchState({ isBlocked: true });
    });

    s.on('content-flagged', (data) => {
      patchState({ contentFlagged: data?.message || 'Your content was flagged for review. Please follow community guidelines.' });
      clearTimeout(flaggedTimeout);
      flaggedTimeout = setTimeout(() => patchState({ contentFlagged: null }), 6000);
    });

    s.on('settings_updated', (data) => {
      if (!data) return;
      patchState({
        adsEnabled: typeof data.adsEnabled !== 'undefined' ? !!data.adsEnabled : state.adsEnabled,
        allowDevTools: typeof data.allowDevTools !== 'undefined' ? !!data.allowDevTools : state.allowDevTools,
        adScripts: data.adScripts && typeof data.adScripts === 'object'
          ? { ...state.adScripts, ...data.adScripts }
          : state.adScripts,
      });
    });

    s.on('coins-updated', (data) => {
      if (!data) return;
      patchState({
        registered: data.registered !== undefined ? !!data.registered : state.registered,
        activeSeconds: data.activeSeconds !== undefined ? data.activeSeconds : state.activeSeconds,
      });
    });

    return s;
  })();

  return socketInitPromise;
}

async function fetchInitialSettings() {
  try {
    const res = await fetch(`${BASE_URL}/api/settings`);
    if (!res.ok) return;
    const data = await res.json();
    patchState({
      adsEnabled: typeof data.adsEnabled !== 'undefined' ? !!data.adsEnabled : state.adsEnabled,
      allowDevTools: typeof data.allowDevTools !== 'undefined' ? !!data.allowDevTools : state.allowDevTools,
      adScripts: data.adScripts && typeof data.adScripts === 'object'
        ? { ...state.adScripts, ...data.adScripts }
        : state.adScripts,
    });
  } catch { /* offline */ }
}

let booted = false;
function boot() {
  if (booted) return;
  booted = true;
  ensureSocket();
  fetchInitialSettings();
}

function subscribe(fn) {
  boot();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot() {
  return state;
}

export function useSocket() {
  useEffect(() => { boot(); }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
