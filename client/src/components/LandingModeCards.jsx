import { motion, useReducedMotion } from 'framer-motion';
import { LANDING_MODE_CARDS } from '../constants/landingModes';
import { MmIcon } from './icons/MmIcon';

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

const CARD_ICON = {
  video: 'camera',
  text: 'chat',
  group_video: 'users',
  group_text: 'mic',
  lives: 'broadcast',
};

const ORDER = ['video', 'text', 'group_video', 'group_text', 'lives'];

const PREVIEW_VIDEO_SRC = '/assets/landing/preview-video.webp';

export function Waveform() {
  return null;
}

export function PairPortrait({
  alt = 'Two people talking on a video call',
  loading = 'lazy',
}) {
  return (
    <img
      src={PREVIEW_VIDEO_SRC}
      alt={alt}
      width={800}
      height={450}
      decoding="async"
      loading={loading}
    />
  );
}

const cardSpring = { type: 'spring', stiffness: 420, damping: 28 };

function ModeCard({ mode, onStart, connected, isJoining, count }) {
  const reduce = useReducedMotion();
  const meta = LANDING_MODE_CARDS.find((m) => m.id === mode);
  if (!meta) return null;
  const disabled = !connected || isJoining;
  const shown = Number(count) > 0 ? Number(count) : 0;

  return (
    <motion.button
      type="button"
      layoutId={reduce ? undefined : `studio-mode-${mode}`}
      disabled={disabled}
      onClick={() => onStart?.(mode)}
      onPointerEnter={() => prefetchModeChunk(mode)}
      onFocus={() => prefetchModeChunk(mode)}
      aria-label={`${meta.name}: ${meta.hint}`}
      className={`studio-card studio-card--${mode === 'group_text' ? 'audio' : mode === 'group_video' ? 'group' : mode}`}
      variants={reduce ? undefined : {
        hidden: { opacity: 0, y: 26, scale: 0.96 },
        visible: { opacity: 1, y: 0, scale: 1, transition: cardSpring },
      }}
      whileHover={disabled || reduce ? undefined : { y: -6 }}
      whileTap={disabled || reduce ? undefined : { scale: 0.98 }}
    >
      {mode === 'video' ? (
        <span className="studio-card__media" aria-hidden>
          <PairPortrait alt="" loading="eager" />
        </span>
      ) : null}
      <span className="studio-card__top">
        <span className="studio-card__icon" aria-hidden>
          <MmIcon name={CARD_ICON[mode] || 'sparkle'} size={18} />
        </span>
        <span className="studio-card__tag">{meta.tag}</span>
      </span>
      <span className="studio-card__name">{meta.name}</span>
      <span className="studio-card__hint">{meta.hint}</span>
      {shown > 0 ? (
        <span className="studio-card__count">{shown} here now</span>
      ) : null}
    </motion.button>
  );
}

export function LandingMorphStage({
  onStart,
  connected,
  isJoining,
  counts = {},
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="studio-bento"
      data-landing-stage=""
      data-cards="1"
      initial="hidden"
      animate="visible"
      variants={reduce ? undefined : {
        hidden: {},
        visible: { transition: { staggerChildren: 0.07, delayChildren: 0.12 } },
      }}
    >
      {ORDER.map((mode) => (
        <ModeCard
          key={mode}
          mode={mode}
          onStart={onStart}
          connected={connected}
          isJoining={isJoining}
          count={counts[mode]}
        />
      ))}
    </motion.div>
  );
}

export function LandingModeCards(props) {
  return <LandingMorphStage {...props} />;
}

export default LandingModeCards;
