import { Suspense } from 'react';
import { motion } from 'framer-motion';
import { HellooooLockup } from './HellooooBrand';
import { lazyRetry } from '../utils/lazyRetry';
import { fadeUp, stagger, springSnappy } from '../utils/landingMotion';

const HeroScene3D = lazyRetry(() => import('./three/HeroScene3D'));

const TRUST = [
  { label: 'No account needed' },
  { label: 'Instant matching' },
  { label: 'AI safety' },
  { label: 'Gifts & Nuts' },
];

export function LandingHero({
  connected,
  isJoining,
  onlineCount = 0,
  lowPower = false,
  onGoLive,
  onVoice,
  onScrollToStart,
}) {
  return (
    <section className="lv2-hero relative overflow-hidden w-full">
      {!lowPower && (
        <div className="absolute inset-0 pointer-events-none opacity-[0.18]" aria-hidden>
          <Suspense fallback={null}>
            <HeroScene3D className="opacity-40" intensity={0.32} />
          </Suspense>
        </div>
      )}

      <div className="mm-shell mm-shell--wide relative z-10 w-full">
        <motion.div
          className="lv2-hero__inner"
          initial="hidden"
          animate="visible"
          variants={stagger(0.09, 0.04)}
        >
          <motion.div variants={fadeUp} className="lv2-hero__brand">
            <HellooooLockup logoSize={88} brandSize="xl" showTagline className="helloooo-lockup--hero" />
          </motion.div>

          <motion.div variants={fadeUp} className="lv2-hero__eyebrow-wrap">
            <span className="lv2-hero__eyebrow">
              <motion.span
                className="lv2-hero__live-dot"
                animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                aria-hidden
              />
              {onlineCount > 0
                ? `${onlineCount.toLocaleString()} online now`
                : 'Anonymous connections worldwide'}
            </span>
          </motion.div>

          <motion.p variants={fadeUp} className="lv2-hero__sub">
            Video, voice, text, and creator lives — match in seconds. No sign-up.
          </motion.p>

          <motion.div variants={fadeUp} className="lv2-hero__cta-row">
            <motion.button
              type="button"
              className="lv2-hero__cta lv2-hero__cta--live"
              disabled={!connected || isJoining}
              onClick={() => onGoLive?.()}
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
              transition={springSnappy}
            >
              <span className="lv2-hero__cta-glow" aria-hidden />
              <span className="lv2-hero__cta-dot" aria-hidden />
              Go Live
            </motion.button>
            <motion.button
              type="button"
              className="lv2-hero__cta lv2-hero__cta--voice"
              disabled={!connected || isJoining}
              onClick={() => onVoice?.()}
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              transition={springSnappy}
            >
              Voice rooms
            </motion.button>
            <motion.button
              type="button"
              className="lv2-hero__cta lv2-hero__cta--ghost"
              onClick={() => onScrollToStart?.()}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={springSnappy}
            >
              All modes
            </motion.button>
          </motion.div>

          <motion.ul variants={fadeUp} className="lv2-hero__trust" aria-label="Why Helloooo">
            {TRUST.map((t, i) => (
              <motion.li
                key={t.label}
                className="lv2-hero__trust-chip"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28 + i * 0.06, duration: 0.4 }}
              >
                {t.label}
              </motion.li>
            ))}
          </motion.ul>

          {!connected && (
            <motion.p variants={fadeUp} className="lv2-hero__status lv2-hero__status--warn">
              Connecting to servers…
            </motion.p>
          )}
          {connected && isJoining && (
            <motion.p variants={fadeUp} className="lv2-hero__status lv2-hero__status--join">
              Joining…
            </motion.p>
          )}
        </motion.div>
      </div>
    </section>
  );
}

export default LandingHero;
