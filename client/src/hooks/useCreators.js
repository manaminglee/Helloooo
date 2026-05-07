import { useState, useEffect, useCallback } from 'react';
import { getCreatorAuthHeaders } from '../utils/creatorAuth';

const API_BASE = import.meta.env.VITE_SOCKET_URL || '';

export function useCreators() {
  const [creatorStatus, setCreatorStatus] = useState(null); // { handle_name, status, coins_earned, earnings_rs, referral_code }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const storedId = window.localStorage.getItem('mm_creatorId');
      const logoutFlag = window.localStorage.getItem('mm_logout_flag');

      let url = `${API_BASE}/api/creators/status`;
      if (storedId) {
        url += `?id=${storedId}`;
        // If we have an ID, we clear the logout flag because they've explicitly logged in or resumed
        window.localStorage.removeItem('mm_logout_flag');
      } else if (logoutFlag) {
        // If they manually logged out, don't auto-fetch by IP
        setCreatorStatus(null);
        setLoading(false);
        return;
      }

      const res = await fetch(url);
      const data = await res.json();
      setCreatorStatus(data.data);
    } catch (e) {
      console.error('Creator status fetch failed', e);
    } finally {
      setLoading(false);
    }
  };

  const registerCreator = async (handle, platform, link) => {
    try {
      const res = await fetch(`${API_BASE}/api/creators/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, platform, link })
      });
      const data = await res.json();
      if (res.ok) {
        return { success: true, accessCode: data.accessCode };
      }
      return { success: false, error: data.error };
    } catch (e) {
      return { success: false, error: 'Network failure' };
    }
  };

  const checkStatus = async (code) => {
    try {
      const res = await fetch(`${API_BASE}/api/creators/status?id=${code}`);
      const data = await res.json();
      return data.data;
    } catch (e) { return null; }
  };

  const reRequestApproval = async (code) => {
    try {
      const res = await fetch(`${API_BASE}/api/creators/re-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      return await res.json();
    } catch (e) { return { error: 'Request failed' }; }
  };

  const verifyReferral = async (code) => {
    try {
      const res = await fetch(`${API_BASE}/api/creators/verify-ref`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      return await res.json();
    } catch (e) {
      return { error: 'Verification failed' };
    }
  };

  const requestWithdrawal = async (upi) => {
    try {
      const res = await fetch(`${API_BASE}/api/creators/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCreatorAuthHeaders() },
        body: JSON.stringify({ upi })
      });
      const data = await res.json();
      if (res.ok) fetchStatus();
      return data;
    } catch (e) {
      return { error: 'Withdrawal failed' };
    }
  };

  const login = async (handle, password) => {
    try {
      const res = await fetch(`${API_BASE}/api/creators/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, password })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        window.localStorage.setItem('mm_creatorId', result.data.referral_code);
        window.localStorage.removeItem('mm_logout_flag');
        setCreatorStatus(result.data);
        return { success: true };
      }
      return { success: false, error: result.error || 'Credential Mismatch' };
    } catch (e) {
      return { success: false, error: 'Network Failure' };
    }
  };

  const fetchMyActivity = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/creators/my-activity`, {
        headers: { ...getCreatorAuthHeaders() }
      });
      const data = await res.json();
      if (!res.ok) return { entries: [], error: data.error };
      return { entries: data.entries || [] };
    } catch (e) {
      return { entries: [], error: 'Network error' };
    }
  }, []);

  const fetchMyWithdrawals = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/creators/my-withdrawals`, {
        headers: { ...getCreatorAuthHeaders() }
      });
      const data = await res.json();
      if (!res.ok) return { withdrawals: [], error: data.error };
      return { withdrawals: data.withdrawals || [] };
    } catch (e) {
      return { withdrawals: [], error: 'Network error' };
    }
  }, []);

  const updateProfile = async (bio, avatar_url) => {
    try {
      const res = await fetch(`${API_BASE}/api/creators/update-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCreatorAuthHeaders() },
        body: JSON.stringify({ bio, avatar_url })
      });
      const data = await res.json();
      if (res.ok) fetchStatus();
      return data;
    } catch (e) {
      return { error: 'Update Failed' };
    }
  };

  return {
    creatorStatus,
    loading,
    registerCreator,
    verifyReferral,
    requestWithdrawal,
    fetchStatus,
    login,
    checkStatus,
    reRequestApproval,
    updateProfile,
    fetchMyActivity,
    fetchMyWithdrawals
  };
}
