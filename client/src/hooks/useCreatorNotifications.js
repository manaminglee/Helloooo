import { useState, useEffect, useCallback } from 'react';
import { getCreatorAuthHeaders } from '../utils/creatorAuth';
import { API_BASE } from '../config/apiBase';

function sortNotifications(list) {
  return [...(list || [])].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );
}

export function useCreatorNotifications(referralCode, socket) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!referralCode) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/creators/notifications`, {
        headers: { ...getCreatorAuthHeaders() },
      });
      const data = await res.json();
      if (res.ok) {
        setNotifications(sortNotifications(data.notifications));
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (e) {
      console.error('Notifications fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, [referralCode]);

  const markRead = useCallback(async (ids, options = {}) => {
    const { all = false } = options;
    if (!referralCode) return;
    try {
      const res = await fetch(`${API_BASE}/api/creators/notifications/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCreatorAuthHeaders() },
        body: JSON.stringify({ ids: all ? undefined : ids, all }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({
            ...n,
            read: all || (Array.isArray(ids) ? ids.includes(n.id) : n.id === ids) ? true : n.read,
          }))
        );
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (e) {
      console.error('Mark read failed', e);
    }
  }, [referralCode]);

  const pushNotification = useCallback((notification) => {
    if (!notification?.id) return;
    setNotifications((prev) => {
      if (prev.some((n) => n.id === notification.id)) return prev;
      return sortNotifications([notification, ...prev]).slice(0, 50);
    });
    if (!notification.read) {
      setUnreadCount((c) => c + 1);
    }
  }, []);

  useEffect(() => {
    if (!referralCode) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    fetchNotifications();
  }, [referralCode, fetchNotifications]);

  useEffect(() => {
    if (!socket || !referralCode) return;
    const handler = (data) => {
      if (data?.referral_code !== referralCode || !data?.notification) return;
      pushNotification(data.notification);
    };
    socket.on('creator-notification', handler);
    return () => socket.off('creator-notification', handler);
  }, [socket, referralCode, pushNotification]);

  return {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markRead,
  };
}
