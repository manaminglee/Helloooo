import { CreatorAvatar } from './CreatorAvatar';
import { MmIcon } from './icons/MmIcon';

export function LandingLiveNow({ lives = [], onSeeAll }) {
  const shown = lives.slice(0, 6);
  const extra = Math.max(0, lives.length - shown.length);

  return (
    <section className="lv4-livenow" id="landing-live-now">
      <div className="lv4-livenow__head">
        <h2>Live now</h2>
        <button type="button" className="lv4-livenow__all" onClick={onSeeAll}>
          See all <span aria-hidden>›</span>
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="lv4-livenow__empty">No one is live right now. Be the first to go live.</p>
      ) : (
        <div className="lv4-livenow__row">
          {shown.map((live) => (
            <button
              key={live.id}
              type="button"
              className="lv4-livenow__item"
              onClick={onSeeAll}
              aria-label={`${live.displayName || live.handle || 'Creator'} is live`}
            >
              <span className="lv4-livenow__avatar">
                <CreatorAvatar
                  src={live.avatarUrl}
                  name={live.displayName || live.handle || 'Live'}
                  size={66}
                  live
                />
              </span>
              <span className="lv4-livenow__badge">LIVE</span>
            </button>
          ))}
          {extra > 0 ? (
            <button type="button" className="lv4-livenow__more" onClick={onSeeAll}>
              + more
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

export function LandingSafetyCard() {
  return (
    <section className="lv4-safety" aria-label="Safety and trust">
      <span className="lv4-safety__icon" aria-hidden>
        <MmIcon name="shield" size={22} />
      </span>
      <div>
        <p>AI moderation · Report & skip · Anonymous</p>
        <p>Your safety. Your control. Always.</p>
      </div>
    </section>
  );
}

export default LandingLiveNow;
