import { useEffect, useState } from 'react';
import { API_BASE } from '../config/apiBase';

/**
 * Real lobby numbers only — never invent per-mode counts.
 * Modes without an API signal stay unset so the UI can hide them.
 */
export function useLandingPresence(pollMs = 15000) {
  const [counts, setCounts] = useState({});
  const [lives, setLives] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [roomsRes, voiceRes, livesRes] = await Promise.all([
          fetch(`${API_BASE}/api/rooms/public`),
          fetch(`${API_BASE}/api/audio/channels`),
          fetch(`${API_BASE}/api/lives`),
        ]);

        const rooms = roomsRes.ok ? ((await roomsRes.json()).rooms || []) : [];
        const channels = voiceRes.ok ? ((await voiceRes.json()).channels || []) : [];
        const liveJson = livesRes.ok ? await livesRes.json() : {};
        const liveList = liveJson?.ok ? (liveJson.lives || []) : [];

        const groupVideo = rooms
          .filter((r) => r.mode === 'group_video')
          .reduce((sum, r) => sum + (Number(r.participantCount) || 0), 0);
        const audio = channels
          .filter((c) => !c.isPrivate && !c.locked)
          .reduce((sum, c) => sum + (Number(c.memberCount) || 0), 0);
        const liveViewers = liveList.reduce((sum, l) => sum + (Number(l.viewerCount) || 0), 0);
        const liveCount = liveViewers > 0 ? liveViewers : liveList.length;

        if (cancelled) return;
        setLives(liveList);
        setCounts({
          group_video: groupVideo > 0 ? groupVideo : undefined,
          group_text: audio > 0 ? audio : undefined,
          lives: liveCount > 0 ? liveCount : undefined,
        });
      } catch {
        /* leave counts hidden */
      }
    };

    load();
    const t = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pollMs]);

  return { counts, lives };
}

export default useLandingPresence;
