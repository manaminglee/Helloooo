import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '../config/apiBase';

const MAX_COMMENTS = 40;        // DOM ceiling for the overlay stream
const FLUSH_MS = 140;           // incoming comments are batched into one render
const BANNER_TTL = 4200;
const BANNER_MAX = 3;
const FULLSCREEN_TTL = 4600;
const COMBO_WINDOW = 4000;
const JOIN_NOTICE_MS = 5000;    // at most one 'joined' line per this window

function newNonce() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch { /* */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The realtime half of a live room.
 *
 * Everything rendered here comes off the socket — the client never invents a
 * comment, a gift, a like total or a viewer count. Coin balances shown in the
 * UI are the ones the server returned from its own debit.
 *
 * Render discipline (perf requirement): comments arrive into a ref and are
 * flushed on a timer, so a busy room costs one render per FLUSH_MS instead of
 * one per message, and the video element never sits in a re-rendering subtree.
 */
export function useLiveRoom(socket, liveId, { asHost = false, onReaction, handle = null } = {}) {
  const [comments, setComments] = useState([]);
  const [pinnedComment, setPinnedComment] = useState(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [likes, setLikes] = useState(0);
  const [banners, setBanners] = useState([]);
  const [fullscreenGift, setFullscreenGift] = useState(null);
  const [battle, setBattle] = useState(null);
  const [topGifter, setTopGifter] = useState(null);
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState({ slowModeMs: 0, commentsDisabled: false });
  const [isModerator, setIsModerator] = useState(asHost);
  const [muted, setMuted] = useState(false);
  const [roomState, setRoomState] = useState('connecting'); // connecting|live|reconnecting|ended|removed
  const [endSummary, setEndSummary] = useState(null);
  const [notice, setNotice] = useState(null);
  const [following, setFollowing] = useState(false);
  const [followKnown, setFollowKnown] = useState(false);

  const pendingRef = useRef([]);
  const flushRef = useRef(null);
  const bannerTimers = useRef(new Map());
  const noticeTimer = useRef(null);
  const onReactionRef = useRef(onReaction);
  onReactionRef.current = onReaction;
  const joinNotice = useRef({ at: 0, pending: [] });

  const toast = useCallback((message, tone = 'info') => {
    if (!message) return;
    setNotice({ message, tone, at: Date.now() });
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3200);
  }, []);

  // --- batched comment flush ------------------------------------------------
  const scheduleFlush = useCallback(() => {
    if (flushRef.current) return;
    flushRef.current = setTimeout(() => {
      flushRef.current = null;
      const batch = pendingRef.current;
      if (!batch.length) return;
      pendingRef.current = [];
      setComments((prev) => {
        const next = prev.concat(batch);
        return next.length > MAX_COMMENTS ? next.slice(next.length - MAX_COMMENTS) : next;
      });
    }, FLUSH_MS);
  }, []);

  const pushLocal = useCallback((entry) => {
    pendingRef.current.push(entry);
    scheduleFlush();
  }, [scheduleFlush]);

  // --- gift banners with client-side combo merge ----------------------------
  const pushGift = useCallback((payload) => {
    setBanners((prev) => {
      // Same combo already on screen: bump its counter instead of stacking.
      const idx = prev.findIndex((b) => b.comboId === payload.comboId);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { ...next[idx], ...payload, bump: (next[idx].bump || 0) + 1 };
        clearTimeout(bannerTimers.current.get(payload.comboId));
        const t = setTimeout(() => {
          setBanners((cur) => cur.filter((b) => b.comboId !== payload.comboId));
          bannerTimers.current.delete(payload.comboId);
        }, BANNER_TTL);
        bannerTimers.current.set(payload.comboId, t);
        return next;
      }
      const t = setTimeout(() => {
        setBanners((cur) => cur.filter((b) => b.comboId !== payload.comboId));
        bannerTimers.current.delete(payload.comboId);
      }, BANNER_TTL);
      bannerTimers.current.set(payload.comboId, t);
      const next = prev.concat({ ...payload, bump: 0 });
      // Oldest banner is dropped so the stack never grows down the screen.
      if (next.length > BANNER_MAX) {
        const dropped = next.shift();
        clearTimeout(bannerTimers.current.get(dropped.comboId));
        bannerTimers.current.delete(dropped.comboId);
      }
      return next;
    });

    if (payload.fullscreen) {
      setFullscreenGift({ ...payload, key: `${payload.txId}` });
      setTimeout(() => {
        setFullscreenGift((cur) => (cur?.key === `${payload.txId}` ? null : cur));
      }, FULLSCREEN_TTL);
    }
  }, []);

  // --- socket wiring --------------------------------------------------------
  useEffect(() => {
    if (!socket || !liveId) return undefined;

    setComments([]);
    setBanners([]);
    setFullscreenGift(null);
    setEndSummary(null);
    setRoomState('connecting');
    pendingRef.current = [];

    const join = () => {
      socket.emit('live:join', { liveId }, (res) => {
        if (!res?.ok) {
          setRoomState('removed');
          toast(res?.error || 'Could not join this live');
          return;
        }
        setRoomState('live');
        setViewerCount(res.live?.viewerCount || 0);
        setLikes(res.live?.likes || 0);
        setPinnedComment(res.pinnedComment || null);
        setComments((res.comments || []).slice(-MAX_COMMENTS));
        setIsModerator(!!res.isModerator || asHost);
        setSettings({
          slowModeMs: res.live?.slowModeMs || 0,
          commentsDisabled: !!res.live?.commentsDisabled,
        });
        if (res.topGifter) setTopGifter(res.topGifter);
        if (res.stats) setStats(res.stats);
      });
    };

    join();

    const sameRoom = (p) => !p?.liveId || p.liveId === liveId;

    const handlers = {
      // Socket.IO reconnects on its own; we just rejoin the room and resync.
      connect: () => { setRoomState('live'); join(); },
      disconnect: () => setRoomState((s) => (s === 'ended' ? s : 'reconnecting')),

      'live:comment': (msg) => { if (sameRoom(msg)) pushLocal(msg); },
      'live:comment:deleted': (p) => {
        if (!sameRoom(p)) return;
        pendingRef.current = pendingRef.current.filter((c) => c.id !== p.commentId);
        setComments((prev) => prev.filter((c) => c.id !== p.commentId));
      },
      'live:pinned': (p) => { if (sameRoom(p)) setPinnedComment(p.pinnedComment || null); },
      'live:viewers': (p) => { if (sameRoom(p)) setViewerCount(p.count || 0); },
      'live:reaction': (p) => {
        if (!sameRoom(p)) return;
        if (typeof p.totalLikes === 'number') setLikes(p.totalLikes);
        onReactionRef.current?.(p.count || 1, p.colors || []);
      },
      'live:gift': (p) => { if (sameRoom(p)) pushGift(p); },
      'live:top-gifter': (p) => { if (sameRoom(p)) setTopGifter(p.topGifter || null); },
      'live:stats': (p) => { if (sameRoom(p)) setStats(p); },
      'live:settings': (p) => {
        if (!sameRoom(p)) return;
        setSettings({ slowModeMs: p.slowModeMs || 0, commentsDisabled: !!p.commentsDisabled });
      },
      'live:role': (p) => { if (sameRoom(p)) setIsModerator(!!p.isModerator); },
      'live:muted': (p) => {
        if (!sameRoom(p)) return;
        setMuted(!!p.muted);
        toast(p.muted ? 'You were muted by the host' : 'You can comment again');
      },
      'live:viewer-joined': (p) => {
        if (!sameRoom(p)) return;
        // A room with heavy churn would otherwise drown real comments in
        // "joined" lines, so they are coalesced into one line per window.
        const j = joinNotice.current;
        j.pending.push(p);
        const since = Date.now() - j.at;
        if (since < JOIN_NOTICE_MS) return;
        j.at = Date.now();
        const batch = j.pending.splice(0, j.pending.length);
        const first = batch[0];
        const others = batch.length - 1;
        pushLocal({
          id: `sys-join-${j.at}`,
          system: true,
          username: first.username,
          nameColor: first.nameColor,
          text: others > 0 ? `and ${others} more joined` : 'joined',
          at: j.at,
        });
      },
      'live:follow': (p) => {
        if (!sameRoom(p)) return;
        pushLocal({
          id: `flw-${p.username}-${p.at}`,
          system: true,
          username: p.username,
          nameColor: p.nameColor,
          text: 'started following',
          at: p.at,
        });
      },
      'live:host-reconnecting': (p) => { if (sameRoom(p)) setRoomState('reconnecting'); },
      'live:battle:start': (p) => setBattle(p.battle),
      'live:battle:score': (p) => setBattle(p.battle),
      'live:battle:end': (p) => { setBattle(p.battle); setTimeout(() => setBattle(null), 5000); },
      'live:ended': (p) => {
        if (!sameRoom(p)) return;
        setEndSummary(p.summary || null);
        setRoomState('ended');
      },
      'live:kicked': (p) => {
        if (!sameRoom(p)) return;
        setRoomState('removed');
        toast(p.reason || 'Removed by host', 'error');
      },
      'live:blocked': (p) => {
        if (!sameRoom(p)) return;
        setRoomState('removed');
        toast(p.reason || 'Blocked by host', 'error');
      },
      'live:error': (p) => toast(p?.message || p?.error, 'error'),
    };

    for (const [evt, fn] of Object.entries(handlers)) socket.on(evt, fn);

    return () => {
      socket.emit('live:leave', { liveId });
      for (const [evt, fn] of Object.entries(handlers)) socket.off(evt, fn);
      clearTimeout(flushRef.current);
      flushRef.current = null;
      for (const t of bannerTimers.current.values()) clearTimeout(t);
      bannerTimers.current.clear();
    };
  }, [socket, liveId, asHost, pushLocal, pushGift, toast]);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  // --- actions --------------------------------------------------------------
  const emit = useCallback((evt, payload) => new Promise((resolve) => {
    if (!socket || !liveId) { resolve({ ok: false, error: 'Not connected' }); return; }
    let settled = false;
    const done = (res) => { if (!settled) { settled = true; resolve(res || { ok: false }); } };
    setTimeout(() => done({ ok: false, error: 'Timed out' }), 8000);
    socket.emit(evt, { liveId, ...payload }, done);
  }), [socket, liveId]);

  const sendComment = useCallback(async (text, mention = null) => {
    const body = String(text || '').trim();
    if (!body) return { ok: false };
    const res = await emit('live:comment', { text: body, mention });
    if (!res.ok && res.error) toast(res.error, 'error');
    return res;
  }, [emit, toast]);

  const sendGift = useCallback(async (giftId, targetSide = 'A') => {
    // Nonce is generated per tap: a retried or duplicated packet can never
    // charge twice, and the server is the one that enforces it.
    const res = await emit('live:gift', { giftId, targetSide, nonce: newNonce() });
    if (!res.ok && res.error && !res.duplicate) toast(res.error, 'error');
    return res;
  }, [emit, toast]);

  const react = useCallback((count = 1) => {
    if (!socket || !liveId) return;
    // Fire-and-forget: no ack, no re-render. Local hearts spawn immediately so
    // the tap feels instant; the server's aggregate drives everyone else's.
    socket.emit('live:react', { liveId, count });
    onReactionRef.current?.(count, []);
    setLikes((n) => n + count);
  }, [socket, liveId]);

  /* The follow button must not lie to a returning viewer, so the real state is
     loaded once per room rather than defaulting to "Follow". */
  useEffect(() => {
    if (!handle) return undefined;
    let alive = true;
    setFollowKnown(false);
    fetch(`${API_BASE}/api/creators/follow-status?handle=${encodeURIComponent(handle)}`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((d) => { if (alive) { setFollowing(!!d?.following); setFollowKnown(true); } })
      .catch(() => { if (alive) setFollowKnown(true); })
    return () => { alive = false; };
  }, [handle, liveId]);

  const follow = useCallback(async (handleArg) => {
    const target = handleArg || handle;
    setFollowing(true);                       // optimistic
    try {
      const res = await fetch(`${API_BASE}/api/creators/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ handle: target }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFollowing(false);
        toast(data?.error || 'Could not follow', 'error');
        return { ok: false };
      }
      if (!data.already_following) await emit('live:follow', {});
      return { ok: true, count: data.count, already: data.already_following };
    } catch {
      setFollowing(false);
      toast('Network error', 'error');
      return { ok: false };
    }
  }, [emit, toast, handle]);

  const moderation = useMemo(() => ({
    deleteComment: (commentId) => emit('live:delete-comment', { commentId }),
    pin: (commentId) => emit('live:pin', { commentId }),
    unpin: () => emit('live:pin', { commentId: '' }),
    mute: (targetSocketId, unmute = false) => emit('live:mute', { targetSocketId, unmute }),
    kick: (targetSocketId) => emit('live:kick', { targetSocketId }),
    block: (targetSocketId) => emit('live:block', { targetSocketId }),
    promote: (targetSocketId, demote = false) => emit('live:promote-mod', { targetSocketId, demote }),
    slowMode: (seconds) => emit('live:slow-mode', { seconds }),
    toggleComments: (disabled) => emit('live:comments-toggle', { disabled }),
    report: (payload) => emit('live:report', payload),
    listViewers: () => emit('live:viewers:list', {}),
    refreshStats: async () => {
      const res = await emit('live:stats:get', {});
      if (res.ok) setStats(res.stats);
      return res;
    },
  }), [emit]);

  return {
    comments,
    pinnedComment,
    viewerCount,
    likes,
    banners,
    fullscreenGift,
    battle,
    topGifter,
    stats,
    settings,
    isModerator,
    muted,
    roomState,
    endSummary,
    notice,
    following,
    followKnown,
    sendComment,
    sendGift,
    react,
    follow,
    moderation,
    toast,
    dismissFullscreen: () => setFullscreenGift(null),
    COMBO_WINDOW,
  };
}

export default useLiveRoom;
