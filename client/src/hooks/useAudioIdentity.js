import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../config/apiBase';
import { getCreatorAuthHeaders, getCreatorSessionToken } from '../utils/creatorAuth';

const STORAGE_KEY = 'mm_audio_session';
const USERNAME_KEY = 'mm_audio_username';

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

  const attachSocket = useCallback((sessionToken) => {
    if (!socket || !sessionToken) return;
    socket.emit('audio-identity:attach', { token: sessionToken }, (res) => {
      if (res?.ok && res.identity) setIdentity(res.identity);
    });
  }, [socket]);

  const persistSession = useCallback((sessionToken, id) => {
    setToken(sessionToken);
    setIdentity(id);
    try { sessionStorage.setItem(STORAGE_KEY, sessionToken); } catch { /* ignore */ }
    if (id?.username) persistUsername(id.username);
    attachSocket(sessionToken);
  }, [attachSocket]);

  /** Approved creator session → voice/Lives identity without PIN. */
  const loginFromCreator = useCallback(async () => {
    if (!getCreatorSessionToken()) return false;
    try {
      const res = await fetch(`${API_BASE}/api/audio-identity/from-creator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCreatorAuthHeaders() },
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.token || !data.identity) return false;
      persistSession(data.token, data.identity);
      return true;
    } catch {
      return false;
    }
  }, [persistSession]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      setHydrating(true);
      try {
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
        // Creator already logged in — skip PIN / access-code gate
        if (!cancelled && getCreatorSessionToken()) {
          const ok = await loginFromCreator();
          if (ok) return;
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
    hasCreatorSession: !!getCreatorSessionToken(),
  };
}
