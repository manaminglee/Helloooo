import { Suspense } from 'react';
import { motion } from 'framer-motion';
import { HellooooLockup, HELLOOOO_EMOJI } from './HellooooBrand';
import { lazyRetry } from '../utils/lazyRetry';
import { fadeUp, stagger, springSnappy } from '../utils/landingMotion';

const HeroScene3D = lazyRetry(() => import('./three/HeroScene3D'));

const TRUST = [
  { icon: '🔒', label: 'No account needed' },
  { icon: '⚡', label: 'Instant matching' },
  { icon: '🛡️', label: 'AI safety monitoring' },
  { icon: '🎁', label: 'Live gifts & Nuts' },
];

export function LandingHero({
  connected,
  isJoining,
  onlineCount = 0,
  lowPower = false,
  onGoLive,
  onScrollToStart,
}) {
  return (
    <section className="lv2-hero relative overflow-hidden w-full">
      {!lowPower && (
        <div className="absolute inset-0 pointer-events-none opacity-[0.22]">
          <Suspense fallback={null}>
            <HeroScene3D className="opacity-40" intensity={0.35} />
          </Suspense>
        </div>
      )}

      <div className="mm-shell mm-shell--wide relative z-10 w-full">
        <motion.div
          className="lv2-hero__inner"
          initial="hidden"
          animate="visible"
          variants={stagger(0.1, 0.05)}
        >
          <motion.div variants={fadeUp} className="lv2-hero__brand">
            <HellooooLockup logoSize={88} brandSize="xl" showTagline className="helloooo-lockup--hero" />
          </motion.div>

          <motion.div variants={fadeUp} className="lv2-hero__eyebrow-wrap">
            <span className="lv2-hero__eyebrow">
              <motion.span
                className="lv2-hero__live-dot"
                animate={{ scale: [1, 1.35, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                aria-hidden
              />
              {onlineCount > 0
                ? `${onlineCount.toLocaleString()} people online now`
                : 'Live anonymous connections worldwide'}
            </span>
          </motion.div>

          <motion.h1 variants={fadeUp} className="lv2-hero__title">
            <span className="lv2-hero__title-emoji" aria-hidden>{HELLOOOO_EMOJI}</span>
            <span className="lv2-hero__title-line">Where strangers become</span>
            <span className="lv2-hero__title-line lv2-hero__gradient">your people</span>
          </motion.h1>

          <motion.p variants={fadeUp} className="lv2-hero__sub">
            Video, voice, text, and creator lives — one app. No sign-up.
            Pick your vibe, match in seconds, send gifts when it clicks.
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
              className="lv2-hero__cta lv2-hero__cta--ghost"
              onClick={() => onScrollToStart?.()}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={springSnappy}
            >
              Start chatting
            </motion.button>
          </motion.div>

          <motion.ul variants={fadeUp} className="lv2-hero__trust" aria-label="Why Helloooo">
            {TRUST.map((t, i) => (
              <motion.li
                key={t.label}
                className="lv2-hero__trust-chip"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 + i * 0.07, duration: 0.45 }}
                whileHover={{ y: -2, borderColor: 'rgba(255,255,255,0.22)' }}
              >
                <span className="lv2-hero__trust-icon" aria-hidden>{t.icon}</span>
                <span>{t.label}</span>
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
              Joining room…
            </motion.p>
          )}
        </motion.div>
      </div>
    </section>
  );
}

export default LandingHero;
