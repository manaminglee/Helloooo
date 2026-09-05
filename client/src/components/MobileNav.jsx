import { memo } from 'react';

/**
 * Mobile landing nav — one primary action: go Live.
 * Discover, chat, and audio stay on the landing page; this bar is the fast
 * path into the Live & Audio app surface.
 */
export const MobileNav = memo(function MobileNav({ onLive, hidden = false, active = false }) {
  if (hidden) return null;

  return (
    <nav className="mmnav mmnav--solo" aria-label="Go live">
      <button
        type="button"
        className={`mmnav__solo-live${active ? ' mmnav__solo-live--on' : ''}`}
        onClick={() => onLive?.()}
        aria-label="Open Live"
        aria-current={active ? 'page' : undefined}
      >
        <span className="mmnav__solo-glow" aria-hidden />
        <span className="mmnav__solo-ring" aria-hidden />
        <span className="mmnav__solo-core">
          <span className="mmnav__solo-dot" aria-hidden />
          <span className="mmnav__solo-label">LIVE</span>
        </span>
      </button>
    </nav>
  );
});

export default MobileNav;
