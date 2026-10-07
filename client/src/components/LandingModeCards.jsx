import { motion } from 'framer-motion';
import { LANDING_MODE_CARDS } from '../constants/landingModes';
import { fadeUp, stagger, springSnappy } from '../utils/landingMotion';

/** Warm chat chunks so the first join feels instant. */
function prefetchModeChunk(modeId) {
  try {
    if (modeId === 'video') import('./VideoChat');
    else if (modeId === 'text') import('./TextChat');
    else if (modeId === 'group_video') import('./GroupVideoRoom');
    else if (modeId === 'group_text') import('./GroupAudioRoom');
    else if (modeId === 'lives') import('./lives/LivesApp');
  } catch {
    /* ignore */
  }
}

const CARD_GLOW = {
  video: 'lv2-mode-card--violet',
  text: 'lv2-mode-card--cyan',
  group_video: 'lv2-mode-card--indigo',
  group_text: 'lv2-mode-card--amber',
  lives: 'lv2-mode-card--rose',
};

export function LandingModeCards({ onStart, connected, isJoining, className = '' }) {
  return (
    <motion.div
      className={`lv2-mode-grid ${className}`.trim()}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      variants={stagger(0.07, 0.02)}
    >
      {LANDING_MODE_CARDS.map((m) => (
        <motion.button
          key={m.id}
          type="button"
          disabled={!connected || isJoining}
          onClick={() => onStart(m.id)}
          onPointerEnter={() => prefetchModeChunk(m.id)}
          onFocus={() => prefetchModeChunk(m.id)}
          aria-label={`${m.name}: ${m.hint}`}
          className={`lv2-mode-card ${CARD_GLOW[m.id] || ''} disabled:opacity-40 disabled:cursor-not-allowed`}
          variants={fadeUp}
          whileHover={connected && !isJoining ? { y: -6, scale: 1.02 } : undefined}
          whileTap={connected && !isJoining ? { scale: 0.98 } : undefined}
          transition={springSnappy}
        >
          <span className="lv2-mode-card__shine" aria-hidden />
          <span className="lv2-mode-card__glow" aria-hidden />
          <div className="lv2-mode-card__top">
            <span className="lv2-mode-card__icon" aria-hidden>{m.icon}</span>
            <span className="lv2-mode-card__tag">{m.tag}</span>
          </div>
          <div className="lv2-mode-card__body">
            <h3 className="lv2-mode-card__title">{m.name}</h3>
            <p className="lv2-mode-card__hint">{m.hint}</p>
          </div>
          <span className="lv2-mode-card__arrow" aria-hidden>→</span>
        </motion.button>
      ))}
    </motion.div>
  );
}
