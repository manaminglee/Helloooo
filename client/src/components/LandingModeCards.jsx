import { LANDING_MODE_CARDS } from '../constants/landingModes';

/** Warm chat chunks so the first join feels instant. */
function prefetchModeChunk(modeId) {
  try {
    if (modeId === 'video') import('./VideoChat');
    else if (modeId === 'text') import('./TextChat');
    else if (modeId === 'group_video') import('./GroupVideoRoom');
    else if (modeId === 'group_text') import('./GroupAudioRoom');
  } catch {
    /* ignore */
  }
}

export function LandingModeCards({ onStart, connected, isJoining, className = '' }) {
  return (
    <div className={`mm-landing-mode-grid ${className}`.trim()}>
      {LANDING_MODE_CARDS.map((m) => (
        <button
          key={m.id}
          type="button"
          disabled={!connected || isJoining}
          onClick={() => onStart(m.id)}
          onPointerEnter={() => prefetchModeChunk(m.id)}
          onFocus={() => prefetchModeChunk(m.id)}
          aria-label={`${m.name}: ${m.hint}`}
          className="group mm-landing-mode-card disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <div
            className={`mm-landing-mode-card__inner bg-gradient-to-br ${m.accent} ${m.ring}`}
          >
            <div className="mm-landing-mode-card__top">
              <span className="mm-landing-mode-card__icon" aria-hidden>{m.icon}</span>
              <span className="mm-landing-mode-card__tag">{m.tag}</span>
            </div>
            <div>
              <h3 className="mm-landing-mode-card__title">{m.name}</h3>
              <p className="mm-landing-mode-card__hint">{m.hint}</p>
            </div>
            <span className="mm-landing-mode-card__arrow" aria-hidden>→</span>
          </div>
        </button>
      ))}
    </div>
  );
}
