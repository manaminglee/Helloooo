import { useEffect, useRef, useState } from 'react';

export function ThreeDVideoGiftRenderer({ gift, mode = 'preview', still = false, children = null }) {
  const ref = useRef(null);
  const src = mode === 'celebration' ? (gift?.celebrationUrl || gift?.previewUrl) : (gift?.previewUrl || gift?.celebrationUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (still) {
      el.pause();
      return undefined;
    }
    el.muted = true;
    el.playsInline = true;
    void el.play?.().catch(() => setFailed(true));
    return () => {
      try { el.pause(); } catch { /* */ }
    };
  }, [src, still]);

  if (!src || failed) return children || null;

  return (
    <video
      ref={ref}
      className="pg-video"
      src={src}
      muted
      loop={mode !== 'celebration'}
      playsInline
      preload={still ? 'none' : 'metadata'}
      onError={() => setFailed(true)}
    />
  );
}

export function LottieGiftRenderer({ gift }) {
  if (!gift?.previewUrl) return null;
  return <iframe title={gift.name} className="pg-lottie" src={gift.previewUrl} />;
}
