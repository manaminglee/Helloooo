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

/** Original illustrated pair — geometric, not a photograph. */
export function PairPortrait() {
  return (
    <svg viewBox="0 0 200 126" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="lv4room" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3a2a3c" />
          <stop offset="55%" stopColor="#2a2438" />
          <stop offset="100%" stopColor="#1c1828" />
        </linearGradient>
      </defs>
      <rect width="200" height="126" fill="url(#lv4room)" />
      <ellipse cx="28" cy="18" rx="40" ry="22" fill="#4a3450" opacity="0.55" />
      <rect x="142" y="0" width="58" height="46" fill="#44324a" opacity="0.45" />
      {/* person left */}
      <ellipse cx="72" cy="128" rx="42" ry="46" fill="#5c3d4a" />
      <path d="M46 54c4-22 22-32 38-28 10 3 16 14 18 26 1 10-4 16-12 18-9 2-16-1-22-8-5 6-12 8-20 5-7-3-8-8-2-13z" fill="#2b1c18" />
      <circle cx="74" cy="58" r="20" fill="#e0b094" />
      <path d="M56 50c6-16 22-22 36-14 4 2 8 8 8 14 0-10-8-20-20-22-14-3-26 6-24 22z" fill="#2b1c18" />
      <circle cx="68" cy="58" r="1.4" fill="#3a241c" />
      <circle cx="80" cy="58" r="1.4" fill="#3a241c" />
      <path d="M69 66c3 3 8 3 11 0" fill="none" stroke="#b57b68" strokeWidth="1.2" strokeLinecap="round" />
      {/* person right */}
      <ellipse cx="130" cy="132" rx="44" ry="48" fill="#3d4a62" />
      <circle cx="128" cy="56" r="21" fill="#c48a62" />
      <path d="M108 50c3-18 18-28 34-22 8 3 14 12 15 22 0-14-12-28-28-28-16 0-24 12-21 28z" fill="#1c1412" />
      <path d="M111 58c-2 10 0 18 6 22h24c5-4 8-14 5-24-4 8-14 10-22 6-5-3-10-4-13-4z" fill="#1c1412" opacity="0.35" />
      <circle cx="122" cy="56" r="1.5" fill="#3a241c" />
      <circle cx="135" cy="56" r="1.5" fill="#3a241c" />
      <path d="M123 66c4 3.2 10 3.2 14 0" fill="none" stroke="#8a5a42" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function MiniFace({ variant = 0 }) {
  const fills = ['#e0b094', '#c48a62', '#d7b08c'];
  const hair = ['#2b1c18', '#1c1412', '#4a3024'];
  return (
    <span className="lv4-mini-face">
      <svg viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" fill="#2a2436" />
        <circle cx="16" cy="14" r="8" fill={fills[variant % fills.length]} />
        <path d={`M8 12c2-8 14-8 16 0-1-6-5-9-8-9s-7 3-8 9z`} fill={hair[variant % hair.length]} />
        <ellipse cx="16" cy="30" rx="10" ry="7" fill={fills[variant % fills.length]} />
      </svg>
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
        <PairPortrait />
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
        <MiniFace variant={0} />
        <MiniFace variant={1} />
        <MiniFace variant={2} />
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
        <span className="lv4-named__thumb" aria-hidden>
          <PairPortrait />
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
