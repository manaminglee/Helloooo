import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../config/apiBase';

export function useLivesList(pollMs = 8000) {
  const [lives, setLives] = useState([]);
  const [livekit, setLivekit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/lives`);
      const data = await res.json();
      if (data.ok) {
        setLives(data.lives || []);
        setLivekit(data.livekit || null);
        setError('');
      } else setError(data.error || 'Failed to load lives');
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  return { lives, livekit, loading, error, refresh };
}

export function useLiveSession(socket, liveId) {
  const [comments, setComments] = useState([]);
  const [gifts, setGifts] = useState([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [battle, setBattle] = useState(null);
  const [ended, setEnded] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!socket || !liveId) return undefined;
    setComments([]);
    setGifts([]);
    setEnded(false);
    setBattle(null);

    socket.emit('live:join', { liveId }, (res) => {
      if (res?.live) setViewerCount(res.live.viewerCount || 0);
    });

    const onComment = (msg) => {
      if (msg.liveId !== liveId) return;
      setComments((c) => [...c.slice(-40), msg]);
    };
    const onGift = (payload) => {
      if (payload.liveId !== liveId && !payload.fromBattle) {
        // still show if battle shared
      }
      setGifts((g) => [...g.slice(-8), payload]);
      setTimeout(() => {
        setGifts((g) => g.filter((x) => x !== payload));
      }, payload.anim === 'legendary' || payload.anim === 'mega' ? 6000 : 3200);
    };
    const onViewers = ({ liveId: id, count }) => {
      if (id === liveId) setViewerCount(count);
    };
    const onEnded = ({ liveId: id }) => {
      if (id === liveId) setEnded(true);
    };
    const onBattleStart = ({ battle: b }) => setBattle(b);
    const onBattleScore = ({ battle: b }) => setBattle(b);
    const onBattleEnd = ({ battle: b }) => {
      setBattle(b);
      setTimeout(() => setBattle(null), 5000);
    };
    const onErr = ({ message }) => {
      setNotice(message || 'Error');
      setTimeout(() => setNotice(''), 3000);
    };

    socket.on('live:comment', onComment);
    socket.on('live:gift', onGift);
    socket.on('live:viewers', onViewers);
    socket.on('live:ended', onEnded);
    socket.on('live:battle:start', onBattleStart);
    socket.on('live:battle:score', onBattleScore);
    socket.on('live:battle:end', onBattleEnd);
    socket.on('live:error', onErr);

    return () => {
      socket.emit('live:leave', { liveId });
      socket.off('live:comment', onComment);
      socket.off('live:gift', onGift);
      socket.off('live:viewers', onViewers);
      socket.off('live:ended', onEnded);
      socket.off('live:battle:start', onBattleStart);
      socket.off('live:battle:score', onBattleScore);
      socket.off('live:battle:end', onBattleEnd);
      socket.off('live:error', onErr);
    };
  }, [socket, liveId]);

  const sendComment = useCallback((text) => {
    if (!socket || !liveId || !text?.trim()) return;
    socket.emit('live:comment', { liveId, text });
  }, [socket, liveId]);

  const sendGift = useCallback((giftId, targetSide = 'A') => {
    if (!socket || !liveId || !giftId) return;
    socket.emit('live:gift', { liveId, giftId, targetSide });
  }, [socket, liveId]);

  return {
    comments,
    gifts,
    viewerCount,
    battle,
    ended,
    notice,
    sendComment,
    sendGift,
  };
}
