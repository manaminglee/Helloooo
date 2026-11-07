import { useEffect, useRef, useState } from 'react';
import { loadFaceLandmarker } from '../../utils/faceBlurEngine';

const HOLD_MS = 5000;
const EXIT_MS = 480;
const LEFT_OUTER = 33;
const LEFT_INNER = 133;
const RIGHT_INNER = 362;
const RIGHT_OUTER = 263;

function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function fallbackPose() {
  return { x: 0.5, y: 0.38, width: 0.42, rotate: 0 };
}

function poseFromLandmarks(landmarks) {
  const lo = landmarks[LEFT_OUTER];
  const li = landmarks[LEFT_INNER];
  const ri = landmarks[RIGHT_INNER];
  const ro = landmarks[RIGHT_OUTER];
  if (!lo || !li || !ri || !ro) return null;
  const left = mid(lo, li);
  const right = mid(ri, ro);
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.02) return null;
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
    width: Math.min(0.72, dist * 2.55),
    rotate: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

export function SpecsArt({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 160 56" fill="none" aria-hidden>
      <defs>
        <linearGradient id="specsRim" x1="0" y1="0" x2="160" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f8fafc" />
          <stop offset="0.45" stopColor="#94a3b8" />
          <stop offset="1" stopColor="#334155" />
        </linearGradient>
        <linearGradient id="specsLens" x1="20" y1="8" x2="70" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1e293b" />
          <stop offset="0.55" stopColor="#0f172a" />
          <stop offset="1" stopColor="#020617" />
        </linearGradient>
        <linearGradient id="specsShine" x1="24" y1="10" x2="64" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M8 22h18" stroke="url(#specsRim)" strokeWidth="5" strokeLinecap="round" />
      <path d="M134 22h18" stroke="url(#specsRim)" strokeWidth="5" strokeLinecap="round" />
      <rect x="22" y="10" width="48" height="34" rx="14" fill="url(#specsLens)" stroke="url(#specsRim)" strokeWidth="5" />
      <rect x="90" y="10" width="48" height="34" rx="14" fill="url(#specsLens)" stroke="url(#specsRim)" strokeWidth="5" />
      <path d="M70 24h20" stroke="url(#specsRim)" strokeWidth="5" strokeLinecap="round" />
      <path d="M30 16c8-2 22-2 32 6" stroke="url(#specsShine)" strokeWidth="3" strokeLinecap="round" />
      <path d="M98 16c8-2 22-2 32 6" stroke="url(#specsShine)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Sunglasses fly onto the creator's face for 5 seconds.
 * Uses MediaPipe Face Landmarker when a face is visible; otherwise a
 * centered fallback on the creator tile. pointer-events: none.
 */
export function SpecsOnFaceOverlay({
  videoRef,
  active,
  effectKey,
  mirrored = false,
  onDone,
}) {
  const [pose, setPose] = useState(fallbackPose);
  const [phase, setPhase] = useState('in');
  const rafRef = useRef(0);

  useEffect(() => {
    if (!active) return undefined;
    setPhase('in');
    setPose(fallbackPose());
    let cancelled = false;
    let landmarker = null;

    const tick = (now) => {
      if (cancelled) return;
      const video = videoRef?.current;
      if (landmarker && video && video.readyState >= 2 && video.videoWidth) {
        try {
          const result = landmarker.detectForVideo(video, now);
          const face = result?.faceLandmarks?.[0];
          const next = face ? poseFromLandmarks(face) : null;
          if (next) {
            const mapped = mirrored ? { ...next, x: 1 - next.x, rotate: -next.rotate } : next;
            setPose(mapped);
          }
        } catch {
          /* keep last pose / fallback */
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    loadFaceLandmarker()
      .then((lm) => {
        if (cancelled) return;
        landmarker = lm;
        rafRef.current = requestAnimationFrame(tick);
      })
      .catch(() => {
        /* fallback pose already showing */
      });

    const hold = setTimeout(() => setPhase('out'), HOLD_MS);
    const done = setTimeout(() => onDone?.(), HOLD_MS + EXIT_MS);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      clearTimeout(hold);
      clearTimeout(done);
    };
  }, [active, effectKey, mirrored, videoRef, onDone]);

  if (!active) return null;

  const widthPct = Math.round(pose.width * 1000) / 10;
  const style = {
    left: `${pose.x * 100}%`,
    top: `${pose.y * 100}%`,
    width: `${widthPct}%`,
    '--specs-rot': `${pose.rotate}deg`,
  };

  return (
    <div className={`specs-face specs-face--${phase}`} aria-hidden>
      <div className="specs-face__pair" style={style}>
        <SpecsArt />
      </div>
    </div>
  );
}

export default SpecsOnFaceOverlay;
