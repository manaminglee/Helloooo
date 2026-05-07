import { useState, useEffect, useMemo, useRef } from 'react';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

// Fix #4 + minor: Single base URL — trim to avoid space-only env vars
const BASE_URL = SOCKET_URL?.trim() || (typeof window !== 'undefined' ? window.location.origin : '');

export function useSocket() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [country, setCountry] = useState(null);
  const [onlineCount, setOnlineCount] = useState({ count: 0, regions: { in: 0, us: 0, eu: 0, ot: 0 } });
  const [adsEnabled, setAdsEnabled] = useState(false);
  const [adScripts, setAdScripts] = useState({
    hero: '',
    sidebar: '',
    footer: '',
    chat_banner: '',
    chat_sidebar: '',
  });
  const [allowDevTools, setAllowDevTools] = useState(true);
  const [nickname, setNickname] = useState('Anonymous');
  const [isCreator, setIsCreator] = useState(false);
  const [contentFlagged, setContentFlagged] = useState(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [activeSeconds, setActiveSeconds] = useState(0);

  // Fix #6: Ref to track contentFlagged timeout for proper cleanup
  const flaggedTimeoutRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    let s = null;

    (async () => {
      const { io } = await import('socket.io-client');
      // Fix #3: Guard — if unmounted before import resolved, don't connect
      if (!mounted) return;

      s = io(BASE_URL, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        timeout: 20000,
      });

      setSocket(s);
      window.socket = s;

      s.on('connect', () => {
        if (!mounted) return;
        setConnected(true);
        setIsBlocked(false);
      });

      s.on('disconnect', () => {
        if (!mounted) return;
        setConnected(false);
      });

      // Fix #5: Handle connection errors so user isn't left with no feedback
      s.on('connect_error', (err) => {
        console.error('[Socket] Connection error:', err.message);
        if (!mounted) return;
        setConnected(false);
      });

      // Minor: Reconnect attempt feedback
      s.io.on('reconnect_attempt', (attempt) => {
        console.log(`[Socket] Reconnect attempt #${attempt}...`);
      });

      s.on('connected', (data) => {
        if (!mounted) return;
        setCountry(data?.country || null);
        setNickname(data?.nickname || 'Anonymous');
        setIsCreator(!!data?.isCreator);
        setRegistered(!!data?.registered);
        setActiveSeconds(data?.activeSeconds || 0);
        if (data?.settings) {
          setAdsEnabled(!!data.settings.adsEnabled);
          setAllowDevTools(!!data.settings.allowDevTools);
          if (data.settings.adScripts && typeof data.settings.adScripts === 'object') {
            setAdScripts((prev) => ({ ...prev, ...data.settings.adScripts }));
          }
        }
      });

      // Minor: Prevent unnecessary re-renders by comparing serialized value
      s.on('online_count', (data) => {
        if (!mounted) return;
        setOnlineCount(prev =>
          JSON.stringify(prev) === JSON.stringify(data) ? prev : data
        );
      });

      // Minor: Log reason for block
      s.on('blocked-ip', (data) => {
        if (!mounted) return;
        console.warn('[Socket] Blocked by server:', data?.reason || 'No reason provided');
        setIsBlocked(true);
      });

      s.on('content-flagged', (data) => {
        if (!mounted) return;
        setContentFlagged(data?.message || 'Your content was flagged for review. Please follow community guidelines.');
        // Fix #6: Clear previous timeout before setting a new one
        clearTimeout(flaggedTimeoutRef.current);
        flaggedTimeoutRef.current = setTimeout(() => {
          if (mounted) setContentFlagged(null);
        }, 6000);
      });

      s.on('settings_updated', (data) => {
        if (!mounted) return;
        if (data) {
          if (typeof data.adsEnabled !== 'undefined') setAdsEnabled(!!data.adsEnabled);
          if (typeof data.allowDevTools !== 'undefined') setAllowDevTools(!!data.allowDevTools);
          if (data.adScripts && typeof data.adScripts === 'object') {
            setAdScripts((prev) => ({ ...prev, ...data.adScripts }));
          }
        }
      });

      s.on('coins-updated', (data) => {
        if (!mounted) return;
        if (data?.registered !== undefined) setRegistered(!!data.registered);
        if (data?.activeSeconds !== undefined) setActiveSeconds(data.activeSeconds);
      });
    })();

    return () => {
      mounted = false;
      // Fix #1 + #2: Remove all listeners AND disconnect on unmount
      clearTimeout(flaggedTimeoutRef.current);
      if (s) {
        s.off(); // removes ALL event listeners
        s.disconnect();
      }
    };
  }, []);

  // Fetch initial settings on mount
  useEffect(() => {
    let cancelled = false;
    const fetchInitData = async () => {
      try {
        const settingsRes = await fetch(`${BASE_URL}/api/settings`);
        if (!cancelled && settingsRes.ok) {
          const data = await settingsRes.json();
          if (typeof data.adsEnabled !== 'undefined') setAdsEnabled(!!data.adsEnabled);
          if (typeof data.allowDevTools !== 'undefined') setAllowDevTools(!!data.allowDevTools);
          if (data.adScripts && typeof data.adScripts === 'object') {
            setAdScripts((prev) => ({ ...prev, ...data.adScripts }));
          }
        }
      } catch { }
    };
    fetchInitData();
    return () => { cancelled = true; };
  }, []);

  return useMemo(() => ({
    socket,
    connected,
    country,
    onlineCount,
    adsEnabled,
    adScripts,
    allowDevTools,
    nickname,
    isCreator,
    isBlocked,
    contentFlagged,
    registered,
    activeSeconds,
  }), [socket, connected, country, onlineCount, adsEnabled, adScripts, allowDevTools, nickname, isCreator, isBlocked, contentFlagged, registered, activeSeconds]);
}
