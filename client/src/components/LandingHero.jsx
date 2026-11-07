import { MmIcon } from './icons/MmIcon';

function PersonSilhouette() {
  return (
    <svg viewBox="0 0 64 64" fill="currentColor" aria-hidden>
      <circle cx="32" cy="22" r="11" />
      <path d="M12 58c2.2-14 10-20 20-20s17.8 6 20 20v2H12z" />
    </svg>
  );
}

export function LandingHero({
  connected,
  isJoining,
  onStartChat,
  onBrowseLive,
}) {
  return (
    <section className="lv3-hero">
      <div className="lv3-hero__copy">
        <h1 className="lv3-hero__title">
          <span>Random people.</span>
          <span className="lv3-hero__title-accent">Real conversations.</span>
        </h1>
        <p className="lv3-hero__sub">
          Anonymous video, voice rooms and live creators. No sign-up.
        </p>
        <div className="lv3-hero__actions">
          <button
            type="button"
            className="lv3-cta lv3-cta--primary"
            disabled={!connected || isJoining}
            onClick={() => onStartChat?.()}
          >
            Start chatting
            <MmIcon name="camera" size={20} />
          </button>
          <button
            type="button"
            className="lv3-cta lv3-cta--ghost"
            onClick={() => onBrowseLive?.()}
          >
            Browse live
          </button>
        </div>
        {!connected && (
          <p className="lv3-hero__status">Connecting to servers…</p>
        )}
        {connected && isJoining && (
          <p className="lv3-hero__status">Joining…</p>
        )}
      </div>
      <div className="lv3-hero__tiles" aria-hidden>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <span key={n} className={`lv3-tile lv3-tile--${n}`}>
            <PersonSilhouette />
          </span>
        ))}
      </div>
    </section>
  );
}

export default LandingHero;
