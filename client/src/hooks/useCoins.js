import { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../config/apiBase';
import { mmDebug } from '../utils/mmDebug';

const CLAIM_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function formatTimeUntilClaim(ms) {
    if (!ms || ms <= 0) return 'Available to collect';
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

export function useCoins() {
    const [balance, setBalance] = useState(0);
    const [history, setHistory] = useState(() => {
        try { return JSON.parse(localStorage.getItem('mm_coin_history')) || []; }
        catch { return []; }
    });

    const addHistory = (reason, amount) => {
        setHistory(prev => {
            const next = [{ id: Date.now() + Math.random(), reason, amount, date: Date.now() }, ...prev].slice(0, 50);
            localStorage.setItem('mm_coin_history', JSON.stringify(next));
            return next;
        });
    };
    const [streak, setStreak] = useState(1);
    const [nextClaim, setNextClaim] = useState(0);
    const [canClaim, setCanClaim] = useState(false);
    const [registered, setRegistered] = useState(false);
    const [activeSeconds, setActiveSeconds] = useState(0);
    const [loading, setLoading] = useState(true);
    const retryTimerRef = useRef(null);

    const fetchStatus = async (retries = 3) => {
        try {
            const res = await fetch(`${API_BASE}/api/user/coins`, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setBalance(data.coins);
                setStreak(data.streak);
                setCanClaim(data.canClaim);
                setNextClaim(data.nextClaim ?? 0);
                if (data.registered !== undefined) setRegistered(!!data.registered);
                if (data.activeSeconds !== undefined) setActiveSeconds(Number(data.activeSeconds) || 0);
            } else if (retries > 0) {
                retryTimerRef.current = setTimeout(() => fetchStatus(retries - 1), 2000);
            }
        } catch (e) {
            mmDebug('coins.fetch', e);
            if (retries > 0) {
                retryTimerRef.current = setTimeout(() => fetchStatus(retries - 1), 2000);
            }
        } finally {
            setLoading(false);
        }
    };

    const claimCoins = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/user/claim`, { method: 'POST', credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setBalance(data.coins);
                setStreak(data.streak);
                setCanClaim(false);
                setNextClaim(CLAIM_INTERVAL_MS);
                return true;
            }
        } catch (e) {
            mmDebug('coins.claim', e);
        }
        return false;
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 30000);
        return () => {
            clearInterval(interval);
            clearTimeout(retryTimerRef.current);
        };
    }, []);

    // Countdown every second when !canClaim
    useEffect(() => {
        if (canClaim || nextClaim <= 0) return;
        const t = setInterval(() => setNextClaim((p) => Math.max(0, p - 1000)), 1000);
        return () => clearInterval(t);
    }, [canClaim, nextClaim]);

    useEffect(() => {
        if (!canClaim && nextClaim <= 0) setCanClaim(true);
    }, [nextClaim]);

    return {
        balance,
        streak,
        nextClaim,
        canClaim,
        claimCoins,
        refresh: fetchStatus,
        setBalance,
        history,
        addHistory,
        registered,
        activeSeconds,
        loading,
    };
}
