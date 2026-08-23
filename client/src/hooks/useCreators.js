import { useState, useEffect, useCallback } from 'react';
import { getCreatorAuthHeaders } from '../utils/creatorAuth';
import { API_BASE } from '../config/apiBase';
import { mmDebug } from '../utils/mmDebug';
import {
  validateCreatorHandle,
  validateCreatorPlatform,
  validateCreatorLink,
  validateCreatorLogin,
  validateCreatorUpi,
  validateCreatorEmail,
  validateCreatorPassword,
} from '../utils/creatorValidation';

export function useCreators() {
  const [creatorStatus, setCreatorStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const storedId = window.localStorage.getItem('mm_creatorId');
      const logoutFlag = window.localStorage.getItem('mm_logout_flag');

      let url = `${API_BASE}/api/creators/status`;
      if (storedId) {
        url += `?id=${encodeURIComponent(storedId)}`;
        window.localStorage.removeItem('mm_logout_flag');
      } else if (logoutFlag) {
        setCreatorStatus(null);
        setLoading(false);
        return;
      }

      const res = await fetch(url);
      const data = await res.json();
      setCreatorStatus(data.data);
    } catch (e) {
      mmDebug('creators.status', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const registerCreator = async (handle, platform, link, email, password, confirmPassword) => {
    const handleCheck = validateCreatorHandle(handle);
    if (!handleCheck.ok) return { success: false, error: handleCheck.error };
    const platformCheck = validateCreatorPlatform(platform);
    if (!platformCheck.ok) return { success: false, error: platformCheck.error };
    const linkCheck = validateCreatorLink(link);
    if (!linkCheck.ok) return { success: false, error: linkCheck.error };
    const emailCheck = validateCreatorEmail(email);
    if (!emailCheck.ok) return { success: false, error: emailCheck.error };
    const passCheck = validateCreatorPassword(password, confirmPassword);
    if (!passCheck.ok) return { success: false, error: passCheck.error };

    try {
      const res = await fetch(`${API_BASE}/api/creators/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: handleCheck.handle,
          platform: platformCheck.platform,
          link: linkCheck.link,
          email: emailCheck.email || undefined,
          password: passCheck.password,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        try {
          window.localStorage.setItem('mm_creatorId', data.accessCode);
        } catch { /* ignore */ }
        return { success: true, accessCode: data.accessCode };
      }
      return { success: false, error: data.error || 'Registration failed' };
    } catch (e) {
      return { success: false, error: 'Network failure' };
    }
  };

  const checkStatus = useCallback(async (code) => {
    try {
      const res = await fetch(`${API_BASE}/api/creators/status?id=${encodeURIComponent(code)}`);
      const data = await res.json();
      return data.data;
    } catch (e) { return null; }
  }, []);

  const reRequestApproval = async (code) => {
    try {
      const res = await fetch(`${API_BASE}/api/creators/re-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      return await res.json();
    } catch (e) { return { error: 'Request failed' }; }
  };

  const verifyReferral = useCallback(async (code) => {
    try {
      const res = await fetch(`${API_BASE}/api/creators/verify-ref`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      return await res.json();
    } catch (e) {
      return { error: 'Verification failed' };
    }
  }, []);

  const requestWithdrawal = async (upi) => {
    const upiCheck = validateCreatorUpi(upi);
    if (!upiCheck.ok) return { error: upiCheck.error };
    try {
      const res = await fetch(`${API_BASE}/api/creators/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCreatorAuthHeaders() },
        body: JSON.stringify({ upi: upiCheck.upi }),
      });
      const data = await res.json();
      if (res.ok) fetchStatus();
      return data;
    } catch (e) {
      return { error: 'Withdrawal failed' };
    }
  };

  const login = async (handle, password) => {
    const check = validateCreatorLogin(handle, password);
    if (!check.ok) return { success: false, error: check.error };
    try {
      const res = await fetch(`${API_BASE}/api/creators/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: check.handle, password: check.password }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        window.localStorage.setItem('mm_creatorId', result.data.referral_code);
        window.localStorage.removeItem('mm_logout_flag');
        setCreatorStatus(result.data);
        return { success: true };
      }
      return { success: false, error: result.error || 'Invalid handle or password' };
    } catch (e) {
      return { success: false, error: 'Network failure' };
    }
  };

  const fetchMyActivity = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/creators/my-activity`, {
        headers: { ...getCreatorAuthHeaders() },
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
        headers: { ...getCreatorAuthHeaders() },
      });
      const data = await res.json();
      if (!res.ok) return { withdrawals: [], error: data.error };
      return { withdrawals: data.withdrawals || [] };
    } catch (e) {
      return { withdrawals: [], error: 'Network error' };
    }
  }, []);

  const fetchMyAnalytics = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/creators/my-analytics`, {
        headers: { ...getCreatorAuthHeaders() },
      });
      const data = await res.json();
      if (!res.ok) return { series: [], totals: {}, error: data.error };
      return { series: data.series || [], totals: data.totals || {} };
    } catch (e) {
      return { series: [], totals: {}, error: 'Network error' };
    }
  }, []);

  const fetchFeaturedCreators = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/creators/featured`);
      const data = await res.json();
      return { creators: data.creators || [] };
    } catch (e) {
      return { creators: [] };
    }
  }, []);

  const updateProfile = async (bio, avatar_url) => {
    try {
      const res = await fetch(`${API_BASE}/api/creators/update-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCreatorAuthHeaders() },
        body: JSON.stringify({ bio, avatar_url }),
      });
      const data = await res.json();
      if (res.ok) fetchStatus();
      return data;
    } catch (e) {
      return { error: 'Update failed' };
    }
  };

  const requestPasswordReset = async (handle, referralCode) => {
    const handleCheck = validateCreatorHandle(handle);
    if (!handleCheck.ok) return { success: false, error: handleCheck.error };
    if (!String(referralCode || '').trim()) return { success: false, error: 'Access code is required.' };
    try {
      const res = await fetch(`${API_BASE}/api/creators/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: handleCheck.handle, referral_code: String(referralCode).trim() }),
      });
      const data = await res.json();
      if (res.ok) return { success: true, message: data.message };
      return { success: false, error: data.error || 'Request failed' };
    } catch (e) {
      return { success: false, error: 'Network failure' };
    }
  };

  const resetPassword = async (token, password) => {
    if (!String(password || '').trim()) return { success: false, error: 'Password is required.' };
    if (String(password).length < 8) return { success: false, error: 'Password must be at least 8 characters.' };
    if (String(password).length > 128) return { success: false, error: 'Password is too long.' };
    try {
      const res = await fetch(`${API_BASE}/api/creators/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (res.ok) return { success: true, message: data.message };
      return { success: false, error: data.error || 'Reset failed' };
    } catch (e) {
      return { success: false, error: 'Network failure' };
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
    fetchMyWithdrawals,
    fetchMyAnalytics,
    fetchFeaturedCreators,
    requestPasswordReset,
    resetPassword,
  };
}
