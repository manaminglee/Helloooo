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

const CARD_TITLE = {
  video: '1:1 Video',
  text: 'Text Chat',
  group_video: 'Group Video',
  group_text: 'Audio Rooms',
  lives: 'Go Live',
};

export function LandingModeCards({ onStart, connected, isJoining, counts = {}, className = '' }) {
  return (
    <div id="lv3-modes" className={`lv3-modes ${className}`.trim()}>
      {LANDING_MODE_CARDS.map((m) => {
        const count = Number(counts[m.id]);
        const showCount = Number.isFinite(count) && count > 0;
        return (
          <button
            key={m.id}
            type="button"
            disabled={!connected || isJoining}
            onClick={() => onStart(m.id)}
            onPointerEnter={() => prefetchModeChunk(m.id)}
            onFocus={() => prefetchModeChunk(m.id)}
            aria-label={`${m.name}: ${m.hint}`}
            className={`lv3-mode lv3-mode--${m.id}`}
          >
            <span className="lv3-mode__icon" aria-hidden>
              <MmIcon name={CARD_ICON[m.id] || 'sparkle'} size={26} />
            </span>
            <span className="lv3-mode__meta">
              <h3 className="lv3-mode__title">{CARD_TITLE[m.id] || m.name}</h3>
              {showCount ? (
                <span className="lv3-mode__count">
                  <span className="lv3-mode__dot" aria-hidden />
                  {count.toLocaleString()} online
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
