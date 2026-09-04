import { memo } from 'react';
import { MmIcon } from './icons/MmIcon';

/**
 * Bottom navigation for phones.
 *
 * Live sits raised in the centre — it is the one destination that earns money
 * and the one people come back for, so it gets the thumb's easiest target and
 * a shape nothing else on the bar shares.
 *
 * The bar renders only on the landing surface. Inside a call or a live room the
 * screen belongs to the video, and a persistent nav there would both cover the
 * picture and give people a way to walk out of a session by accident.
 */

const ITEMS = [
  { id: 'discover', icon: 'broadcast', label: 'Discover' },
  { id: 'text', icon: 'chat', label: 'Chat' },
  { id: 'live', icon: 'gift', label: 'Live', center: true },
  { id: 'audio', icon: 'mic', label: 'Audio' },
  { id: 'me', icon: 'users', label: 'Me' },
];

export const MobileNav = memo(function MobileNav({ active = 'discover', onSelect, hidden = false }) {
  if (hidden) return null;

  return (
    <nav className="mmnav" aria-label="Main">
      <div className="mmnav__bar">
        {ITEMS.map((item) => {
          if (item.center) {
            return (
              <button
                key={item.id}
                type="button"
                className={`mmnav__live${active === item.id ? ' mmnav__live--on' : ''}`}
                onClick={() => onSelect?.(item.id)}
                aria-label="Live"
                aria-current={active === item.id ? 'page' : undefined}
              >
                <span className="mmnav__live-ring" aria-hidden />
                <span className="mmnav__live-dot" aria-hidden />
                <span className="mmnav__live-text">LIVE</span>
              </button>
            );
          }
          return (
            <button
              key={item.id}
              type="button"
              className={`mmnav__item${active === item.id ? ' mmnav__item--on' : ''}`}
              onClick={() => onSelect?.(item.id)}
              aria-current={active === item.id ? 'page' : undefined}
            >
              <MmIcon name={item.icon} size={21} />
              <span className="mmnav__label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});

export default MobileNav;
