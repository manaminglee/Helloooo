import { useEffect, useState, useRef, useCallback } from 'react';
import { API_BASE } from '../config/apiBase';
import { useSocket } from './useSocket';

const RANGES = ['1H', '6H', '1D', '7D', '30D', '90D'];

/**
 * Live Platform Virtual Economy Rate — server is the only source of truth.
 * Never compute or invent rates on the client.
 */
export function useVirtualMarket({ range: initialRange = '1D', enabled = true } = {}) {
  const { socket, connected } = useSocket();
  const [range, setRange] = useState(initialRange);
  const [rate, setRate] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const rangeRef = useRef(range);
  rangeRef.current = range;

  const applyRate = useCallback((payload) => {
    if (!payload || payload.rate == null) return;
    setRate({
      rate: Number(payload.rate),
      previousRate: Number(payload.previousRate ?? payload.rate),
      change: Number(payload.change || 0),
      changePercent: Number(payload.changePercent || 0),
      timestamp: payload.timestamp || Date.now(),
      marketStatus: payload.marketStatus || 'NORMAL',
      minRate: payload.minRate,
      maxRate: payload.maxRate,
      disclaimer: payload.disclaimer,
      label: payload.label || 'Platform Virtual Economy Rate',
      updatedAgoMs: payload.updatedAgoMs,
    });
  }, []);

  const refreshDashboard = useCallback(async (r = rangeRef.current) => {
    try {
      const res = await fetch(`${API_BASE}/api/market/dashboard?range=${encodeURIComponent(r)}`);
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setError(data?.error || 'Market unavailable');
        return null;
      }
      setDashboard(data);
      if (data.rate) applyRate(data.rate);
      setError('');
      return data;
    } catch {
      setError('Network error loading market');
      return null;
    } finally {
      setLoading(false);
    }
  }, [applyRate]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/market/rate`);
        const data = await res.json();
        if (!cancelled && data?.ok) applyRate(data);
      } catch { /* */ }
      if (!cancelled) await refreshDashboard(range);
    })();
    const poll = setInterval(() => {
      if (!cancelled) refreshDashboard(rangeRef.current);
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [enabled, range, applyRate, refreshDashboard]);

  useEffect(() => {
    if (!enabled || !socket) return undefined;
    const onRate = (payload) => applyRate(payload);
    const onStatus = (payload) => {
      setRate((prev) => (prev ? { ...prev, marketStatus: payload?.marketStatus || prev.marketStatus } : prev));
    };
    const onVolume = (payload) => {
      setDashboard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          volumes: {
            ...prev.volumes,
            giftVolumeCoins: payload?.giftVolumeCoins ?? prev.volumes?.giftVolumeCoins,
            purchaseVolumeCoins: payload?.purchaseVolumeCoins ?? prev.volumes?.purchaseVolumeCoins,
          },
        };
      });
    };
    const onChat = (msg) => {
      setDashboard((prev) => {
        if (!prev) return prev;
        const chat = [...(prev.chat || []), msg].slice(-40);
        return { ...prev, chat };
      });
    };

    socket.emit('market:subscribe');
    socket.on('market:rate:update', onRate);
    socket.on('market:status:update', onStatus);
    socket.on('market:volume:update', onVolume);
    socket.on('market:chat', onChat);

    const onConnect = () => socket.emit('market:subscribe');
    socket.on('connect', onConnect);

    return () => {
      socket.emit('market:unsubscribe');
      socket.off('market:rate:update', onRate);
      socket.off('market:status:update', onStatus);
      socket.off('market:volume:update', onVolume);
      socket.off('market:chat', onChat);
      socket.off('connect', onConnect);
    };
  }, [enabled, socket, connected, applyRate]);

  const postChat = async (username, text) => {
    const res = await fetch(`${API_BASE}/api/market/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Chat failed');
    return data.message;
  };

  const formatUpdatedAgo = () => {
    const ms = rate?.updatedAgoMs != null
      ? rate.updatedAgoMs
      : Math.max(0, Date.now() - (rate?.timestamp || Date.now()));
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s ago`;
    return `${Math.floor(sec / 60)}m ago`;
  };

  return {
    rate,
    dashboard,
    loading,
    error,
    range,
    setRange,
    ranges: RANGES,
    refreshDashboard,
    postChat,
    formatUpdatedAgo,
    nutsToInr: (nuts) => {
      const r = rate?.rate;
      if (r == null) return null;
      return Math.round(((Number(nuts) || 0) / 10000) * r * 100) / 100;
    },
  };
}

export { RANGES };
