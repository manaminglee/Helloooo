import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../config/apiBase';

const STORAGE_KEY = 'mm_audio_session';

export function useAudioIdentity(socket) {
  const [identity, setIdentity] = useState(null);
  const [token, setToken] = useState(() => {
    try { return sessionStorage.getItem(STORAGE_KEY) || null; }
    catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const attachSocket = useCallback((sessionToken) => {
    if (!socket || !sessionToken) return;
    socket.emit('audio-identity:attach', { token: sessionToken }, (res) => {
      if (res?.ok && res.identity) setIdentity(res.identity);
    });
  }, [socket]);

  useEffect(() => {
    if (!socket || !token) return undefined;
    const onReady = (payload) => setIdentity(payload);
    socket.on('audio-identity:ready', onReady);
    attachSocket(token);
    return () => socket.off('audio-identity:ready', onReady);
  }, [socket, token, attachSocket]);

  const persistSession = (sessionToken, id) => {
    setToken(sessionToken);
    setIdentity(id);
    try { sessionStorage.setItem(STORAGE_KEY, sessionToken); } catch { /* ignore */ }
    attachSocket(sessionToken);
  };

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
    logout,
    refresh,
    isSignedIn: !!identity?.username,
  };
}
