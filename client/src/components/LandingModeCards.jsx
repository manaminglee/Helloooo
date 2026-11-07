import { motion } from 'framer-motion';
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

const WAVE = [0.35, 0.7, 0.48, 0.92, 0.55, 0.8, 0.4, 0.88, 0.62, 0.3, 0.75, 0.5, 0.95, 0.42, 0.68, 0.58, 0.82, 0.38, 0.72, 0.5, 0.6, 0.44];

export function Waveform({ bars = 22, className = '' }) {
  return (
    <span className={`lv4-wave ${className}`.trim()} aria-hidden>
      {WAVE.slice(0, bars).map((h, i) => (
        <span key={i} className="lv4-wave__bar" style={{ '--i': i, '--h': h }} />
      ))}
    </span>
  );
}

const PREVIEW_VIDEO_SRC = '/assets/landing/preview-video.webp';
const AUDIO_AVATARS = [
  {
    src: '/assets/landing/avatar-01.webp',
    alt: 'Young woman in warm indoor light, listening in an audio room',
  },
  {
    src: '/assets/landing/avatar-02.webp',
    alt: 'Young man in a gray hoodie, joining an audio room from home',
  },
  {
    src: '/assets/landing/avatar-03.webp',
    alt: 'Young woman with freckles smiling during an audio chat',
  },
];

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

function MiniFace({ src, alt, loading = 'lazy' }) {
  return (
    <span className="lv4-mini-face">
      <img src={src} alt={alt} width={128} height={128} decoding="async" loading={loading} />
    </span>
  );
}

function ArrowIcon() {
  return (
    <svg className="lv4-named__arrow" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M5 3.5 10.5 8 5 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
      <path d="M3 12h1.4M7.2 8v8M11.2 5v14M15.2 8.5v7M19.2 10v4M22 12h-1" />
    </svg>
  );
}

function PreviewVideo() {
  return (
    <span className="lv4-card__face lv4-card__preview lv4-preview-video">
      <span className="lv4-preview-video__scene">
        <PairPortrait alt="Two people meeting face to face on a video call" loading="eager" />
        <span className="lv4-preview-video__rec" />
      </span>
      <span className="lv4-preview-video__bar">
        <span className="lv4-ctrl">
          <MmIcon name="chat" size={14} />
        </span>
        <span className="lv4-ctrl">
          <MmIcon name="mic" size={14} />
        </span>
        <span className="lv4-ctrl">
          <MmIcon name="volume" size={14} />
        </span>
      </span>
    </span>
  );
}

function PreviewText() {
  return (
    <span className="lv4-card__face lv4-card__preview lv4-preview-text">
      <p>
        <em>stranger:</em> what&apos;s something small that makes you happy?
      </p>
      <span className="lv4-preview-text__meta">
        just now
        <span className="lv4-preview-text__dot" />
      </span>
    </span>
  );
}

function PreviewAudio({ count }) {
  const showCount = Number.isFinite(count) && count > 0;
  return (
    <span className="lv4-card__face lv4-card__preview lv4-preview-audio">
      <span className="lv4-preview-audio__title">Audio room</span>
      {showCount ? (
        <span className="lv4-preview-audio__count">
          <i />
          {count.toLocaleString()} here
        </span>
      ) : null}
      <Waveform bars={18} />
      <span className="lv4-preview-audio__people">
        {AUDIO_AVATARS.map((person) => (
          <MiniFace key={person.src} src={person.src} alt={person.alt} loading="eager" />
        ))}
      </span>
    </span>
  );
}

function NamedFace({ mode, title, hint }) {
  const isVideo = mode === 'video';
  const isLive = mode === 'lives';
  const isAudio = mode === 'group_text';
  return (
    <span className={`lv4-card__face lv4-card__named lv4-named${isVideo ? ' lv4-named--video' : ''}`}>
      <span className="lv4-named__icon" aria-hidden>
        {isAudio ? <WaveIcon /> : <MmIcon name={CARD_ICON[mode] || 'sparkle'} size={24} />}
      </span>
      <span className="lv4-named__copy">
        <h3 className="lv4-named__title">
          {title}
          {isLive ? (
            <span className="lv4-live-flag">
              <span className="lv4-live-dot" />
              LIVE
            </span>
          ) : null}
        </h3>
        <p className="lv4-named__hint">{hint}</p>
        {isAudio ? <Waveform bars={16} /> : null}
      </span>
      {isVideo ? (
        <span className="lv4-named__thumb">
          <PairPortrait alt="" loading="lazy" />
        </span>
      ) : null}
      <ArrowIcon />
    </span>
  );
}

function ModeMorphCard({ mode, variant, onStart, connected, isJoining, count }) {
  const meta = LANDING_MODE_CARDS.find((m) => m.id === mode);
  if (!meta) return null;
  const disabled = !connected || isJoining;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onStart?.(mode)}
      onPointerEnter={() => prefetchModeChunk(mode)}
      onFocus={() => prefetchModeChunk(mode)}
      aria-label={`${meta.name}: ${meta.hint}`}
      className={`lv4-card lv4-card--${variant}${variant === 'group' || variant === 'live' ? ' lv4-card--enter' : ''}`}
    >
      <span className="lv4-card__inner">
        {variant === 'video' ? <PreviewVideo /> : null}
        {variant === 'text' ? <PreviewText /> : null}
        {variant === 'audio' ? <PreviewAudio count={count} /> : null}
        <NamedFace mode={mode} title={meta.name} hint={meta.hint} />
      </span>
    </button>
  );
}

export function LandingMorphStage({
  morphStyle,
  cardsOn = false,
  onStart,
  connected,
  isJoining,
  counts = {},
}) {
  return (
    <motion.div
      className="lv4-stage"
      style={morphStyle}
      data-landing-stage=""
      data-cards={cardsOn ? '1' : '0'}
    >
      <ModeMorphCard
        mode="video"
        variant="video"
        onStart={onStart}
        connected={connected}
        isJoining={isJoining}
      />
      <ModeMorphCard
        mode="text"
        variant="text"
        onStart={onStart}
        connected={connected}
        isJoining={isJoining}
      />
      <ModeMorphCard
        mode="group_text"
        variant="audio"
        onStart={onStart}
        connected={connected}
        isJoining={isJoining}
        count={Number(counts.group_text)}
      />
      <ModeMorphCard
        mode="group_video"
        variant="group"
        onStart={onStart}
        connected={connected}
        isJoining={isJoining}
      />
      <ModeMorphCard
        mode="lives"
        variant="live"
        onStart={onStart}
        connected={connected}
        isJoining={isJoining}
      />
    </motion.div>
  );
}

export function LandingModeCards(props) {
  return (
    <LandingMorphStage
      morphStyle={{ '--lv4-morph': 1 }}
      cardsOn
      {...props}
    />
  );
}

export default LandingModeCards;
