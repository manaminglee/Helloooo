import { memo } from 'react';
import { iosHaptic } from '../utils/iosPlatform';
import { unlockIosMedia } from '../utils/iosMediaUnlock';

const TABS = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'video', label: 'Video', icon: VideoIcon },
  { id: 'live', label: 'Live', icon: LiveIcon, featured: true },
  { id: 'audio', label: 'Audio', icon: AudioIcon },
  { id: 'chat', label: 'Chat', icon: ChatIcon },
];

/**
 * iOS-style tab bar (UITabBar): 49pt + home-indicator inset, blur plate, selected tint.
 */
export const MobileNav = memo(function MobileNav({
  hidden = false,
  active = 'home',
  onTab,
}) {
  if (hidden) return null;

  return (
    <nav className="mmnav mmnav--ios" aria-label="Main">
      <div className="mmnav__plate">
        {TABS.map((tab) => {
          const on = active === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              className={`mmnav__tab${on ? ' is-on' : ''}${tab.featured ? ' mmnav__tab--live' : ''}`}
              aria-current={on ? 'page' : undefined}
              aria-label={tab.label}
              onClick={() => {
                void unlockIosMedia();
                void iosHaptic('light');
                onTab?.(tab.id);
              }}
            >
              <Icon on={on} />
              <span className="mmnav__label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});

function HomeIcon({ on }) {
  return (
    <svg className="mmnav__icon" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" strokeLinejoin="round" />
    </svg>
  );
}

function VideoIcon({ on }) {
  return (
    <svg className="mmnav__icon" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="6" width="13" height="12" rx="2.2" />
      <path d="M16 10.2 21 8v8l-5-2.2V10.2Z" />
    </svg>
  );
}

function LiveIcon() {
  return (
    <span className="mmnav__live">
      <span className="mmnav__live-dot" />
    </span>
  );
}

function AudioIcon({ on }) {
  return (
    <svg className="mmnav__icon" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v10.2a3.2 3.2 0 1 1-2-3V7.2" strokeLinecap="round" />
      <path d="M8 15.6a4.4 4.4 0 0 0 8 0" />
    </svg>
  );
}

function ChatIcon({ on }) {
  return (
    <svg className="mmnav__icon" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
      <path d="M5 17.5 4 21l4.2-1.4A8.5 8.5 0 1 0 5 17.5Z" strokeLinejoin="round" />
    </svg>
  );
}

export default MobileNav;
