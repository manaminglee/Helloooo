import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../config/apiBase';
import { getCreatorAuthHeaders, getCreatorSessionToken } from '../utils/creatorAuth';
import { emitCreatorAuth } from './useSocket';

const STORAGE_KEY = 'mm_audio_session';
const USERNAME_KEY = 'mm_audio_username';
const CREATOR_SESSION_KEY = 'mm_creator_session';

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
  const [creatorLinkFailed, setCreatorLinkFailed] = useState(false);

  const attachSocket = useCallback((sessionToken) => {
    if (!socket || !sessionToken) return;
    socket.emit('audio-identity:attach', { token: sessionToken }, (res) => {
      if (res?.ok && res.identity) setIdentity(res.identity);
    });
  }, [socket]);

  const persistSession = useCallback((sessionToken, id) => {
    setToken(sessionToken);
    setIdentity(id);
    setCreatorLinkFailed(false);
    try { sessionStorage.setItem(STORAGE_KEY, sessionToken); } catch { /* ignore */ }
    if (id?.username) persistUsername(id.username);
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
      const res = await fetch(`${API_BASE}/api/audio-identity/from-creator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCreatorAuthHeaders() },
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.token || !data.identity) {
        setCreatorLinkFailed(true);
        setError(data.error || 'Could not sign in with creator account');
        return false;
      }
      persistSession(data.token, data.identity);
      setCreatorLinkFailed(false);
      setError('');
      return true;
    } catch {
      setCreatorLinkFailed(true);
      setError('Network error linking creator account');
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
    async function bootstrap() {
      setHydrating(true);
      setCreatorLinkFailed(false);
      try {
        // Approved creator session → skip PIN restore noise; go straight to linked identity
        if (getCreatorSessionToken()) {
          setHasCreatorSession(true);
          const ok = await loginFromCreator();
          if (!cancelled) {
            if (ok) return;
            setCreatorLinkFailed(true);
          }
          // Fall through to normal audio restore if creator link failed
        }

        if (token) {
          const res = await fetch(`${API_BASE}/api/audio-identity/me`, {
            headers: { 'x-audio-session': token },
            credentials: 'include',
          });
          if (!cancelled && res.ok) {
            const data = await res.json();
            if (data.identity) {
              setIdentity(data.identity);
              attachSocket(token);
              return;
            }
          }
        }
        const restore = await fetch(`${API_BASE}/api/audio-identity/restore-ip`, { credentials: 'include' });
        if (!cancelled && restore.ok) {
          const data = await restore.json();
          if (data.ok && data.token && data.identity) {
            setToken(data.token);
            setIdentity(data.identity);
            try { sessionStorage.setItem(STORAGE_KEY, data.token); } catch { /* ignore */ }
            if (data.identity?.username) persistUsername(data.identity.username);
            attachSocket(data.token);
            return;
          }
        }
        if (token && socket) attachSocket(token);
      } catch {
        if (token && socket) attachSocket(token);
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

  const register = async ({ username, pin, nameColor }) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/audio-identity/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, pin, nameColor }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Registration failed');
        return false;
      }
      persistSession(data.token, data.identity);
      return true;
    } catch {
      setError('Network error — try again');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const login = async ({ username, pin }) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/audio-identity/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, pin }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Login failed');
        return false;
      }
      persistSession(data.token, data.identity);
      return true;
    } catch {
      setError('Network error — try again');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const clearLocalIdentity = useCallback(() => {
    setIdentity(null);
    setToken(null);
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
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    try { localStorage.removeItem(USERNAME_KEY); } catch { /* ignore */ }
  }, [token, socket]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/audio-identity/me`, {
        headers: { 'x-audio-session': token },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.identity) setIdentity(data.identity);
      }
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
    savedUsername: readSavedUsername(),
    hydrating,
    isSignedIn: !!identity?.username,
    hasCreatorSession,
    creatorLinkFailed,
  };
}
