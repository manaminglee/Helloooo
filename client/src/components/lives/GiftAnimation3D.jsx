import { memo, useMemo } from 'react';
import { GiftArt } from '../icons/GiftArt';

/**
 * The big-gift takeover.
 *
 * Real CSS 3D — a perspective stage with `preserve-3d`, rings orbiting on
 * different axes and shards flying out along Z. Not a scaled 2D image.
 *
 * Budgets, because this lands mid-video on a mid-range phone:
 *   · one stage, ≤ 22 elements total, all composited (transform + opacity only)
 *   · everything is `pointer-events: none`, so the live controls stay live
 *   · it removes itself; the caller does not have to clean up
 *   · `prefers-reduced-motion` collapses it to a static card
 *
 * Two scenes: `legendary` (gold, single orbit) and `mega` (the full thing —
 * counter-rotating rings, a shockwave and a starfield). Everything below
 * legendary uses the small corner banner instead and never comes here.
 */

const SCENES = {
  legendary: {
    accent: '#fbbf24',
    accent2: '#f97316',
    rings: 2,
    shards: 10,
    starfield: false,
    hold: 4200,
  },
  mega: {
    accent: '#fb7185',
    accent2: '#a855f7',
    rings: 3,
    shards: 16,
    starfield: true,
    hold: 5200,
  },
};

export const GiftAnimation3D = memo(function GiftAnimation3D({ gift }) {
  const scene = SCENES[gift?.anim] || SCENES[gift?.gift?.tier] || null;

  // Shard angles are stable for the life of one animation, so React never
  // re-randomises them mid-flight on an unrelated re-render.
  const shards = useMemo(() => {
    if (!scene) return [];
    return Array.from({ length: scene.shards }, (_, i) => {
      const angle = (360 / scene.shards) * i;
      return {
        i,
        angle,
        depth: 90 + ((i * 37) % 120),
        delay: 120 + ((i * 53) % 420),
        size: 5 + ((i * 7) % 7),
      };
    });
  }, [scene]);

  const stars = useMemo(() => {
    if (!scene?.starfield) return [];
    return Array.from({ length: 14 }, (_, i) => ({
      i,
      x: ((i * 73) % 100),
      y: ((i * 41) % 100),
      delay: (i * 90) % 900,
      size: 2 + ((i * 3) % 4),
    }));
  }, [scene]);

  if (!scene || !gift) return null;

  const style = {
    '--g-accent': scene.accent,
    '--g-accent-2': scene.accent2,
    '--g-hold': `${scene.hold}ms`,
  };

  return (
    <div className={`g3d g3d--${gift.anim || 'legendary'}`} style={style} aria-hidden>
      <div className="g3d__wash" />

      {scene.starfield && (
        <div className="g3d__stars">
          {stars.map((s) => (
            <span
              key={s.i}
              className="g3d__star"
              style={{
                left: `${s.x}%`, top: `${s.y}%`,
                width: s.size, height: s.size,
                animationDelay: `${s.delay}ms`,
              }}
            />
          ))}
        </div>
      )}

      <div className="g3d__stage">
        {/* Rings orbit on different axes so the scene reads as depth rather
            than a flat spinning disc. */}
        {Array.from({ length: scene.rings }, (_, i) => (
          <span key={`r${i}`} className={`g3d__ring g3d__ring--${i + 1}`} />
        ))}

        <span className="g3d__shockwave" />

        <span className="g3d__gift">
          <GiftArt id={gift.gift?.id} tier={gift.gift?.tier} size={150} />
        </span>

        {shards.map((s) => (
          <span
            key={`s${s.i}`}
            className="g3d__shard"
            style={{
              width: s.size,
              height: s.size,
              transform: `rotateY(${s.angle}deg) translateZ(${s.depth}px)`,
              animationDelay: `${s.delay}ms`,
            }}
          />
        ))}
      </div>

      <div className="g3d__caption">
        <div className="g3d__name">{gift.gift?.name}</div>
        <div className="g3d__from">
          {gift.from}
          {gift.comboCount > 1 && <span className="g3d__combo">×{gift.comboCount}</span>}
        </div>
      </div>
    </div>
  );
});

export default GiftAnimation3D;
