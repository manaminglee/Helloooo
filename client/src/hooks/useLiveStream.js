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

export function useLiveSession(socket, liveId, { isHost = false } = {}) {
  const [comments, setComments] = useState([]);
  const [gifts, setGifts] = useState([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [battle, setBattle] = useState(null);
  const [ended, setEnded] = useState(false);
  const [notice, setNotice] = useState('');
  const [kicked, setKicked] = useState(false);

  useEffect(() => {
    if (!socket || !liveId) return undefined;
    setComments([]);
    setGifts([]);
    setEnded(false);
    setBattle(null);
    setKicked(false);

    socket.emit('live:join', { liveId }, (res) => {
      if (res?.ok === false) {
        setNotice(res.error || 'Could not join');
        setKicked(true);
        return;
      }
      if (res?.live) setViewerCount(res.live.viewerCount || 0);
    });

    const onComment = (msg) => {
      if (msg.liveId !== liveId) return;
      setComments((c) => [...c.slice(-40), msg]);
    };
    const onCommentDeleted = ({ liveId: id, commentId }) => {
      if (id !== liveId) return;
      setComments((c) => c.filter((x) => x.id !== commentId));
    };
    const onGift = (payload) => {
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
    const onKicked = ({ liveId: id, reason }) => {
      if (id !== liveId) return;
      setKicked(true);
      setEnded(true);
      setNotice(reason || 'Removed by host');
    };
    const onBlocked = ({ liveId: id, reason }) => {
      if (id !== liveId) return;
      setKicked(true);
      setEnded(true);
      setNotice(reason || 'Blocked by host');
    };

    socket.on('live:comment', onComment);
    socket.on('live:comment:deleted', onCommentDeleted);
    socket.on('live:gift', onGift);
    socket.on('live:viewers', onViewers);
    socket.on('live:ended', onEnded);
    socket.on('live:battle:start', onBattleStart);
    socket.on('live:battle:score', onBattleScore);
    socket.on('live:battle:end', onBattleEnd);
    socket.on('live:error', onErr);
    socket.on('live:kicked', onKicked);
    socket.on('live:blocked', onBlocked);

    return () => {
      socket.emit('live:leave', { liveId });
      socket.off('live:comment', onComment);
      socket.off('live:comment:deleted', onCommentDeleted);
      socket.off('live:gift', onGift);
      socket.off('live:viewers', onViewers);
      socket.off('live:ended', onEnded);
      socket.off('live:battle:start', onBattleStart);
      socket.off('live:battle:score', onBattleScore);
      socket.off('live:battle:end', onBattleEnd);
      socket.off('live:error', onErr);
      socket.off('live:kicked', onKicked);
      socket.off('live:blocked', onBlocked);
    };
  }, [socket, liveId]);

  const sendComment = useCallback((text, mention = null) => {
    if (!socket || !liveId || !text?.trim()) return;
    socket.emit('live:comment', { liveId, text, mention });
  }, [socket, liveId]);

  const sendGift = useCallback((giftId, targetSide = 'A') => {
    if (!socket || !liveId || !giftId) return;
    socket.emit('live:gift', { liveId, giftId, targetSide });
  }, [socket, liveId]);

  const deleteComment = useCallback((commentId) => {
    if (!socket || !liveId || !commentId || !isHost) return;
    socket.emit('live:delete-comment', { liveId, commentId });
  }, [socket, liveId, isHost]);

  const kickUser = useCallback((targetSocketId) => {
    if (!socket || !liveId || !targetSocketId || !isHost) return;
    socket.emit('live:kick', { liveId, targetSocketId });
  }, [socket, liveId, isHost]);

  const blockUser = useCallback((targetSocketId) => {
    if (!socket || !liveId || !targetSocketId || !isHost) return;
    socket.emit('live:block', { liveId, targetSocketId });
  }, [socket, liveId, isHost]);

  return {
    comments,
    gifts,
    viewerCount,
    battle,
    ended,
    notice,
    kicked,
    sendComment,
    sendGift,
    deleteComment,
    kickUser,
    blockUser,
    isHost,
  };
}
