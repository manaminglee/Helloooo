import { memo, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { iosHaptic } from '../utils/iosPlatform';
import { unlockIosMedia } from '../utils/iosMediaUnlock';

const TABS = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'video', label: 'Video', icon: VideoIcon },
  { id: 'live', label: 'Live', icon: LiveIcon, featured: true },
  { id: 'audio', label: 'Audio', icon: AudioIcon },
  { id: 'chat', label: 'Chat', icon: ChatIcon },
];

const pillSpring = { type: 'spring', stiffness: 420, damping: 34, mass: 0.7 };
const tapSpring = { type: 'spring', stiffness: 520, damping: 28 };

/**
 * Floating mobile dock: 5 thin-line tabs, raised Live action, hide-on-scroll.
 * Hidden entirely on active calls — callers pass `hidden` or omit the component.
 */
export const MobileNav = memo(function MobileNav({
  hidden = false,
  active = 'home',
  onTab,
}) {
  const reduce = useReducedMotion();
  const [away, setAway] = useState(false);

  useEffect(() => {
    if (hidden) return undefined;

    let lastY = window.scrollY || 0;
    let frame = 0;

    const apply = () => {
      frame = 0;
      if (reduce) {
        setAway(false);
        return;
      }
      const y = window.scrollY || 0;
      const delta = y - lastY;
      if (y < 20) setAway(false);
      else if (delta > 8) setAway(true);
      else if (delta < -8) setAway(false);
      lastY = y;
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(apply);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [hidden, reduce]);

  if (hidden) return null;

  return (
    <nav
      className={`mmnav mmnav--dock${away ? ' is-away' : ''}`}
      aria-label="Main"
      onFocusCapture={() => setAway(false)}
    >
      <div className="mmnav__dock">
        {TABS.map((tab) => {
          const on = active === tab.id;
          const Icon = tab.icon;
          return (
            <motion.button
              key={tab.id}
              type="button"
              className={`mmnav__tab${on ? ' is-on' : ''}${tab.featured ? ' mmnav__tab--live' : ''}`}
              aria-current={on ? 'page' : undefined}
              aria-label={tab.label}
              whileTap={reduce ? undefined : { scale: 0.88 }}
              transition={tapSpring}
              onClick={() => {
                void unlockIosMedia();
                void iosHaptic('light');
                onTab?.(tab.id);
              }}
            >
              {on && !tab.featured ? (
                <motion.span
                  className="mmnav__pill"
                  layoutId={reduce ? undefined : 'mmnav-active-pill'}
                  transition={reduce ? { duration: 0 } : pillSpring}
                  aria-hidden
                />
              ) : null}
              <span className="mmnav__glyph" aria-hidden>
                <Icon on={on} />
              </span>
              <span className={`mmnav__label${on ? ' is-shown' : ''}`}>{tab.label}</span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
});

function HomeIcon() {
  return (
    <svg className="mmnav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 10.5 12 4l8 6.5V20a1.2 1.2 0 0 1-1.2 1.2h-4.6v-5.4H9.8v5.4H5.2A1.2 1.2 0 0 1 4 20v-9.5Z" strokeLinejoin="round" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg className="mmnav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3.2" y="6.2" width="12.2" height="11.6" rx="2.4" />
      <path d="M15.4 10.1 20.8 7.6v8.8l-5.4-2.5v-3.8Z" strokeLinejoin="round" />
    </svg>
  );
}

function LiveIcon() {
  return (
    <svg className="mmnav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="2.15" fill="currentColor" stroke="none" />
      <path d="M8.05 8.05a5.6 5.6 0 0 0 0 7.9M15.95 8.05a5.6 5.6 0 0 1 0 7.9" strokeLinecap="round" />
      <path d="M5.4 5.4a9.4 9.4 0 0 0 0 13.2M18.6 5.4a9.4 9.4 0 0 1 0 13.2" strokeLinecap="round" />
    </svg>
  );
}

function AudioIcon() {
  return (
    <svg className="mmnav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M12 3.4v10.1a3.15 3.15 0 1 1-2.05-2.95V7.3" strokeLinecap="round" />
      <path d="M7.7 15.85a4.5 4.5 0 0 0 8.6 0" strokeLinecap="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg className="mmnav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M5.1 17.35 4 21l4.15-1.35A8.4 8.4 0 1 0 5.1 17.35Z" strokeLinejoin="round" />
    </svg>
  );
}

export default MobileNav;
