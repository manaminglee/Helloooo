import { useState, useEffect, useCallback } from 'react';
import {
  getCreatorAuthHeaders,
  setCreatorSessionToken,
  clearCreatorSession,
  getCreatorSessionToken,
} from '../utils/creatorAuth';
import { API_BASE } from '../config/apiBase';
import { mmDebug } from '../utils/mmDebug';
import { emitCreatorAuth } from './useSocket';
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
      const logoutFlag = window.localStorage.getItem('mm_logout_flag');
      const session = getCreatorSessionToken();

      if (!session && logoutFlag) {
        setCreatorStatus(null);
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_BASE}/api/creators/status`, {
        headers: { ...getCreatorAuthHeaders() },
        credentials: 'include',
      });
      const data = await res.json();
      setCreatorStatus(data.data);
      if (data.data) window.localStorage.removeItem('mm_logout_flag');
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
    const emailCheck = validateCreatorEmail(email, { required: true });
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
          email: emailCheck.email,
          password: passCheck.password,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        return {
          success: true,
          accessCode: data.accessCode,
          handle: data.handle,
          email: data.email,
          status: data.status || 'pending',
          message: data.message,
        };
      }
      return { success: false, error: data.error || 'Registration failed' };
    } catch (e) {
      return { success: false, error: 'Network failure' };
    }
  };

  const checkStatus = useCallback(async (codeOrHandle) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/creators/status?id=${encodeURIComponent(codeOrHandle)}`,
      );
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
      const body = check.viaEmail
        ? { email: check.handle, password: check.password }
        : { handle: check.handle, password: check.password };
      const res = await fetch(`${API_BASE}/api/creators/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (res.ok && result.success && result.sessionToken) {
        setCreatorSessionToken(result.sessionToken);
        try { localStorage.removeItem('mm_creatorId'); } catch { /* */ }
        setCreatorStatus(result.data);
        emitCreatorAuth(result.sessionToken);
        return { success: true };
      }
      if (res.status === 403) {
        return {
          success: false,
          error: result.error || 'Application still pending approval.',
          status: result.status || 'pending',
        };
      }
      return { success: false, error: result.error || 'Invalid handle or password', status: result.status };
    } catch (e) {
      return { success: false, error: 'Network failure' };
    }
  };

  const logout = async () => {
    try {
      await fetch(`${API_BASE}/api/creators/logout`, {
        method: 'POST',
        headers: { ...getCreatorAuthHeaders() },
      });
    } catch { /* ignore */ }
    clearCreatorSession();
    setCreatorStatus(null);
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

  const updateProfile = async (bio, avatar_url, preferred_upi) => {
    try {
      const body = { bio, avatar_url };
      if (preferred_upi !== undefined) body.preferred_upi = preferred_upi;
      const res = await fetch(`${API_BASE}/api/creators/update-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCreatorAuthHeaders() },
        body: JSON.stringify(body),
      });
      let data = {};
      try { data = await res.json(); } catch { /* */ }
      if (res.ok) {
        await fetchStatus();
        return { success: true };
      }
      return { success: false, error: data.error || 'Update failed' };
    } catch (e) {
      return { success: false, error: 'Network failure' };
    }
  };

  const requestPasswordReset = async ({ handle, email, referral_code }) => {
    try {
      const res = await fetch(`${API_BASE}/api/creators/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, email, referral_code }),
      });
      return await res.json();
    } catch {
      return { error: 'Network failure' };
    }
  };

  const resetPassword = async (token, password, confirmPassword) => {
    const passCheck = validateCreatorPassword(password, confirmPassword);
    if (!passCheck.ok) return { success: false, error: passCheck.error };
    try {
      const res = await fetch(`${API_BASE}/api/creators/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: passCheck.password }),
      });
      const data = await res.json();
      return res.ok ? { success: true, ...data } : { success: false, error: data.error };
    } catch {
      return { success: false, error: 'Network failure' };
    }
  };

  return {
    creatorStatus,
    loading,
    registerCreator,
    verifyReferral,
    requestWithdrawal,
    login,
    logout,
    checkStatus,
    reRequestApproval,
    updateProfile,
    fetchStatus,
    fetchMyActivity,
    fetchMyWithdrawals,
    fetchMyAnalytics,
    fetchFeaturedCreators,
    requestPasswordReset,
    resetPassword,
  };
}
