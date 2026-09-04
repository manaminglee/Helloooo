import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';

const PREVIEW_MS = 5000;

/**
 * Five seconds of muted live video on a feed card, then back to the wallpaper.
 *
 * Deliberately austere:
 *   · ONE preview across the whole feed at a time. A grid of simultaneous
 *     LiveKit subscriptions would melt a mid-range phone's decoder and burn
 *     the user's data on cards they are scrolling past.
 *   · video only — `autoSubscribe` is off and audio publications are never
 *     subscribed, so a feed can never make noise.
 *   · lowest simulcast layer; this is a thumbnail, not a viewing experience.
 *   · torn down on timeout, on scroll-away and on tab-hide.
 */

// Module-level, so two cards cannot both think they own the preview slot.
let activeSlot = null;

export function useLivePreview({ socket, liveId, enabled, videoRef }) {
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  const roomRef = useRef(null);
  const timerRef = useRef(null);
  const slotRef = useRef(null);

  useEffect(() => {
    if (!enabled || !socket || !liveId || done) return undefined;

    let cancelled = false;
    const slot = Symbol(liveId);
    slotRef.current = slot;

    const teardown = () => {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      try { roomRef.current?.disconnect(); } catch { /* */ }
      roomRef.current = null;
      if (activeSlot === slot) activeSlot = null;
      setPlaying(false);
    };

    (async () => {
      // Wait our turn rather than fighting for the slot.
      if (activeSlot) return;
      activeSlot = slot;

      try {
        const tokenRes = await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('timeout')), 6000);
          socket.emit('live:token', { liveId, asHost: false }, (payload) => {
            clearTimeout(t);
            if (payload?.ok) resolve(payload); else reject(new Error(payload?.error || 'token'));
          });
        });
        if (cancelled) { teardown(); return; }

        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;

        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind !== Track.Kind.Video && track.kind !== 'video') return;
          const el = videoRef?.current;
          if (!el) return;
          track.attach(el);
          el.muted = true;
          el.playsInline = true;
          el.setAttribute('playsinline', 'true');
          void el.play?.().catch(() => {});
          setPlaying(true);
        });

        await room.connect(tokenRes.url, tokenRes.token, { autoSubscribe: false });
        if (cancelled) { teardown(); return; }

        // Subscribe to video publications only — never audio.
        room.remoteParticipants.forEach((p) => {
          p.trackPublications.forEach((pub) => {
            if (pub.kind === Track.Kind.Video || pub.kind === 'video') {
              pub.setSubscribed(true);
              pub.setVideoQuality?.(0);   // lowest simulcast layer
            }
          });
        });
        room.on(RoomEvent.TrackPublished, (pub) => {
          if (pub.kind === Track.Kind.Video || pub.kind === 'video') pub.setSubscribed(true);
        });

        timerRef.current = setTimeout(() => {
          if (cancelled) return;
          setDone(true);      // hand the card back to its wallpaper
          teardown();
        }, PREVIEW_MS);
      } catch {
        teardown();
      }
    })();

    return () => { cancelled = true; teardown(); };
  }, [enabled, socket, liveId, done, videoRef]);

  // A backgrounded tab must not hold a video subscription open.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && roomRef.current) {
        try { roomRef.current.disconnect(); } catch { /* */ }
        roomRef.current = null;
        if (activeSlot === slotRef.current) activeSlot = null;
        setPlaying(false);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return { playing, done };
}

export default useLivePreview;
