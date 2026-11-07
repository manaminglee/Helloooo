import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from '../config/apiBase';
import { getCreatorAuthHeaders, getCreatorSessionToken } from '../utils/creatorAuth';
import { emitCreatorAuth } from './useSocket';
import { fetchJsonWithTimeout, isTimeoutError } from '../utils/fetchJsonWithTimeout';

const BOOTSTRAP_TIMEOUT_MS = 8000;
const AUTH_TIMEOUT_MS = 12000;
const TRUST_TIMEOUT_MS = 5000;

const STORAGE_KEY = 'mm_audio_session';
const USERNAME_KEY = 'mm_audio_username';
const CREATOR_SESSION_KEY = 'mm_creator_session';

/* The session token stays in sessionStorage — short-lived, dies with the tab.
   The DEVICE token is the durable half and lives in localStorage: it is
   rotated on every use and is useless without this browser, so persisting it
   is what lets someone stay signed in without retyping a PIN that guards real
   money. */
const DEVICE_KEY = 'mm_audio_device';
const DEVICE_ID_KEY = 'mm_audio_device_id';

function readDeviceToken() {
  try { return localStorage.getItem(DEVICE_KEY) || null; }
  catch { return null; }
}

function persistDeviceToken(value, deviceId) {
  try {
    if (value) localStorage.setItem(DEVICE_KEY, value);
    else localStorage.removeItem(DEVICE_KEY);
    if (deviceId) localStorage.setItem(DEVICE_ID_KEY, deviceId);
    else if (!value) localStorage.removeItem(DEVICE_ID_KEY);
  } catch { /* private mode — trust simply will not persist */ }
}

function readDeviceId() {
  try { return localStorage.getItem(DEVICE_ID_KEY) || null; }
  catch { return null; }
}

function readSavedUsername() {
  try { return localStorage.getItem(USERNAME_KEY) || ''; }
  catch { return ''; }
}

function persistUsername(username) {
  try {
    if (username) localStorage.setItem(USERNAME_KEY, username);
    else localStorage.removeItem(USERNAME_KEY);
  } catch { /* ignore */ }
}

export function useAudioIdentity(socket) {
  const [identity, setIdentity] = useState(null);
  const [token, setToken] = useState(() => {
    try { return sessionStorage.getItem(STORAGE_KEY) || null; }
    catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [error, setError] = useState('');
  const [hasCreatorSession, setHasCreatorSession] = useState(() => !!getCreatorSessionToken());
  const [deviceTrusted, setDeviceTrusted] = useState(() => !!readDeviceToken());
  const [creatorLinkFailed, setCreatorLinkFailed] = useState(false);
  const [savedUsername, setSavedUsername] = useState(() => readSavedUsername());
  const sessionGenRef = useRef(0);
  const inflightRef = useRef(null);

  const attachSocket = useCallback((sessionToken) => {
    if (!socket || !sessionToken) return;
    socket.emit('audio-identity:attach', { token: sessionToken }, (res) => {
      if (res?.ok && res.identity) setIdentity(res.identity);
    });
  }, [socket]);

  /* Shared by register/login so opting in works the same on both paths. */
  const rememberThisDevice = useCallback(async (sessionToken) => {
    if (!sessionToken) return false;
    try {
      const { data } = await fetchJsonWithTimeout(`${API_BASE}/api/audio-identity/trust-device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-audio-session': sessionToken },
        credentials: 'include',
        body: JSON.stringify({ label: navigator.platform || 'This device' }),
      }, TRUST_TIMEOUT_MS);
      if (!data?.ok || !data.deviceToken) return false;
      persistDeviceToken(data.deviceToken, data.deviceId);
      setDeviceTrusted(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const persistSession = useCallback((sessionToken, id) => {
    sessionGenRef.current += 1;
    setToken(sessionToken);
    setIdentity(id);
    setCreatorLinkFailed(false);
    try { sessionStorage.setItem(STORAGE_KEY, sessionToken); } catch { /* ignore */ }
    if (id?.username) {
      persistUsername(id.username);
      setSavedUsername(id.username);
    }
    attachSocket(sessionToken);
  }, [attachSocket]);

  /** Approved creator session → voice/Lives identity without PIN. */
  const loginFromCreator = useCallback(async () => {
    const creatorTok = getCreatorSessionToken();
    if (!creatorTok) {
      setHasCreatorSession(false);
      return false;
    }
    setHasCreatorSession(true);
    try {
      emitCreatorAuth(creatorTok);
      const { res, data } = await fetchJsonWithTimeout(`${API_BASE}/api/audio-identity/from-creator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCreatorAuthHeaders() },
        credentials: 'include',
      }, AUTH_TIMEOUT_MS);
      if (!res.ok || !data.ok || !data.token || !data.identity) {
        setCreatorLinkFailed(true);
        setError(data.error || 'Could not sign in with creator account');
        return false;
      }
      persistSession(data.token, data.identity);
      setCreatorLinkFailed(false);
      setError('');
      return true;
    } catch (err) {
      setCreatorLinkFailed(true);
      setError(isTimeoutError(err)
        ? 'Creator sign-in timed out — use your voice username and PIN, or try again.'
        : 'Network error linking creator account');
      return false;
    }
  }, [persistSession]);

  // Keep hasCreatorSession in sync across tabs / after login elsewhere
  useEffect(() => {
    const sync = () => {
      const tok = getCreatorSessionToken();
      setHasCreatorSession(!!tok);
    };
    const onStorage = (e) => {
      if (!e.key || e.key === CREATOR_SESSION_KEY) sync();
    };
    const onCustom = () => sync();
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', sync);
    window.addEventListener('mm-creator-session', onCustom);
    const t = setInterval(sync, 4000);
    sync();
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', sync);
      window.removeEventListener('mm-creator-session', onCustom);
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const bootGen = sessionGenRef.current;
    const stale = () => cancelled || sessionGenRef.current !== bootGen;
    async function bootstrap() {
      setHydrating(true);
      setCreatorLinkFailed(false);
      try {
        // Approved creator session → skip PIN restore noise; go straight to linked identity
        if (getCreatorSessionToken()) {
          setHasCreatorSession(true);
          const ok = await loginFromCreator();
          if (stale()) return;
          if (ok) return;
          setCreatorLinkFailed(true);
          // Fall through to normal audio restore if creator link failed
        }

        let currentToken = token;
        if (currentToken) {
          try {
            const { data } = await fetchJsonWithTimeout(`${API_BASE}/api/audio-identity/me`, {
              headers: { 'x-audio-session': currentToken },
              credentials: 'include',
            }, BOOTSTRAP_TIMEOUT_MS);
            if (stale()) return;
            if (data?.ok && data.identity) {
              setIdentity(data.identity);
              if (data.identity.username) {
                persistUsername(data.identity.username);
                setSavedUsername(data.identity.username);
              }
              attachSocket(currentToken);
              return;
            }
            // Explicit miss — stale after server restart
            currentToken = null;
            setToken(null);
            try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
          } catch {
            if (stale()) return;
            // Timeout/network: keep the token; show sign-in if identity never loaded.
          }
        }

        // Trusted device → exchange the rotating device token for a session.
        // No PIN, no prompt. ok:false means the token was revoked/expired —
        // drop it and fall through to a normal sign-in (server returns 200).
        const deviceToken = readDeviceToken();
        if (deviceToken) {
          try {
            const { data } = await fetchJsonWithTimeout(`${API_BASE}/api/audio-identity/resume`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ deviceToken }),
            }, BOOTSTRAP_TIMEOUT_MS);
            if (stale()) return;
            if (data?.ok && data.token && data.identity) {
              persistDeviceToken(data.deviceToken, data.deviceId);  // rotated — old one is dead
              setDeviceTrusted(true);
              persistSession(data.token, data.identity);
              return;
            }
          } catch {
            if (stale()) return;
            // Timeout/network — keep the device token so a later visit can retry.
            return;
          }
          if (stale()) return;
          // Explicit failed resume — clear device trust and continue bootstrap
          persistDeviceToken(null);
          setDeviceTrusted(false);
        }

        // Do not restore-by-IP — another phone on the same network must stay signed out.
      } catch {
        /* offline / network — leave signed-out */
      } finally {
        if (!cancelled) setHydrating(false);
      }
    }
    bootstrap();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  useEffect(() => {
    if (!socket || !token || identity) return undefined;
    const onReady = (payload) => setIdentity(payload);
    socket.on('audio-identity:ready', onReady);
    attachSocket(token);
    return () => socket.off('audio-identity:ready', onReady);
  }, [socket, token, attachSocket, identity]);

  // If creator session appears after bootstrap (login from hub), auto-link once
  useEffect(() => {
    if (hydrating || identity?.username || !hasCreatorSession || creatorLinkFailed) return undefined;
    let cancelled = false;
    void (async () => {
      const ok = await loginFromCreator();
      if (!cancelled && !ok) setCreatorLinkFailed(true);
    })();
    return () => { cancelled = true; };
  }, [hasCreatorSession, hydrating, identity?.username, creatorLinkFailed, loginFromCreator]);

  const register = async ({ username, pin, nameColor, remember = true }) => {
    if (inflightRef.current) return false;
    inflightRef.current = 'register';
    setLoading(true);
    setError('');
    try {
      const { res, data } = await fetchJsonWithTimeout(`${API_BASE}/api/audio-identity/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, pin, nameColor }),
      }, AUTH_TIMEOUT_MS);
      if (!res.ok || !data.ok) {
        setError(data.error || 'Registration failed');
        return false;
      }
      if (!data.token || !data.identity?.username) {
        setError('Registration failed');
        return false;
      }
      persistSession(data.token, data.identity);
      if (remember) void rememberThisDevice(data.token);
      return true;
    } catch (err) {
      setError(isTimeoutError(err)
        ? 'The request timed out. If this username was just created, sign in with your PIN instead of creating again.'
        : 'Network error — try again');
      return false;
    } finally {
      inflightRef.current = null;
      setLoading(false);
    }
  };

  const login = async ({ username, pin, remember = true }) => {
    if (inflightRef.current) return false;
    inflightRef.current = 'login';
    setLoading(true);
    setError('');
    try {
      const { res, data } = await fetchJsonWithTimeout(`${API_BASE}/api/audio-identity/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, pin }),
      }, AUTH_TIMEOUT_MS);
      if (!res.ok || !data.ok) {
        setError(data.error || 'Login failed');
        return false;
      }
      if (!data.token || !data.identity?.username) {
        setError('Login failed');
        return false;
      }
      persistSession(data.token, data.identity);
      if (remember) void rememberThisDevice(data.token);
      return true;
    } catch (err) {
      setError(isTimeoutError(err)
        ? 'Sign-in timed out. Check your connection and try again.'
        : 'Network error — try again');
      return false;
    } finally {
      inflightRef.current = null;
      setLoading(false);
    }
  };

  const clearLocalIdentity = useCallback(() => {
    setIdentity(null);
    setToken(null);
    setSavedUsername('');
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(USERNAME_KEY);
    } catch { /* ignore */ }
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      try {
        await fetch(`${API_BASE}/api/audio-identity/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-audio-session': token },
          credentials: 'include',
          body: JSON.stringify({ token }),
        });
      } catch { /* ignore */ }
      socket?.emit('audio-identity:logout', { token });
    }
    setIdentity(null);
    setToken(null);
    persistDeviceToken(null);
    setDeviceTrusted(false);
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    try { localStorage.removeItem(USERNAME_KEY); } catch { /* ignore */ }
    setSavedUsername('');
  }, [token, socket]);

  /** Opt in to staying signed in here. Only meaningful with a live session. */
  const trustDevice = useCallback(
    (sessionToken = token) => rememberThisDevice(sessionToken),
    [token, rememberThisDevice],
  );

  /** Stop trusting this device, and tell the server to burn the record. */
  const forgetDevice = useCallback(async ({ all = false } = {}) => {
    const deviceId = readDeviceId();
    persistDeviceToken(null);
    setDeviceTrusted(false);
    if (!token) return true;
    try {
      await fetch(`${API_BASE}/api/audio-identity/devices/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-audio-session': token },
        credentials: 'include',
        body: JSON.stringify(all || !deviceId ? { all: true } : { deviceId }),
      });
    } catch { /* the local token is already gone */ }
    return true;
  }, [token]);

  const listDevices = useCallback(async () => {
    if (!token) return [];
    try {
      const res = await fetch(`${API_BASE}/api/audio-identity/devices`, {
        headers: { 'x-audio-session': token },
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      return data?.devices || [];
    } catch {
      return [];
    }
  }, [token]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/audio-identity/me`, {
        headers: { 'x-audio-session': token },
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok && data.identity) {
        setIdentity(data.identity);
        return;
      }
      setIdentity(null);
      setToken(null);
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    } catch { /* ignore */ }
  }, [token]);

  return {
    identity,
    token,
    loading,
    error,
    setError,
    register,
    login,
    loginFromCreator,
    logout,
    refresh,
    clearLocalIdentity,
    savedUsername,
    hydrating,
    isSignedIn: !!identity?.username,
    hasCreatorSession,
    creatorLinkFailed,
    deviceTrusted,
    trustDevice,
    forgetDevice,
    listDevices,
  };
}
