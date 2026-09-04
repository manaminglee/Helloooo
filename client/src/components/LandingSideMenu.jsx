import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CoinBadge } from './CoinBadge';
import { HellooooBrand, HellooooLogo } from './HellooooBrand';
import { countryToFlag } from '../utils/countryFlag';

function MenuRow({ icon, label, hint, onClick, danger, badge }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mm-side-menu__row${danger ? ' mm-side-menu__row--danger' : ''}`}
    >
      <span className="mm-side-menu__row-icon" aria-hidden>{icon}</span>
      <span className="mm-side-menu__row-body">
        <strong>{label}</strong>
        {hint && <span>{hint}</span>}
      </span>
      {badge != null && badge > 0 && (
        <span className="mm-side-menu__badge">{badge > 9 ? '9+' : badge}</span>
      )}
    </button>
  );
}

/**
 * Mobile slide-over nav — keeps the landing header uncluttered on small screens.
 */
export function LandingSideMenu({
  open,
  onClose,
  creatorStatus,
  connected,
  balance,
  streak,
  canClaim,
  nextClaim,
  claimCoins,
  registered,
  currentActiveSeconds,
  socketIsCreator,
  onlineCount,
  country,
  creatorNotifications = [],
  creatorUnreadCount = 0,
  onOpenSettings,
  onOpenDashboard,
  onOpenCreatorFlow,
  onOpenNotifications,
  onLogout,
  onMarkNotificationsRead,
}) {
  const closeRef = useRef(null);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    restoreFocusRef.current = document.activeElement;
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
      const el = restoreFocusRef.current;
      if (el && typeof el.focus === 'function') {
        try { el.focus(); } catch { /* gone */ }
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  const handle = creatorStatus?.handle_name;
  const isApproved = creatorStatus?.status === 'approved';

  const panel = (
    <div className="mm-side-menu" role="dialog" aria-modal="true" aria-label="Menu">
      <button type="button" className="mm-side-menu__backdrop" aria-label="Close menu" onClick={onClose} />
      <aside className="mm-side-menu__panel animate-drawer-in">
        <header className="mm-side-menu__head">
          <div className="mm-side-menu__brand">
            <HellooooLogo size={24} className="rounded-lg shrink-0" />
            <HellooooBrand size="sm" />
          </div>
          <button
            ref={closeRef}
            type="button"
            className="mm-side-menu__close"
            onClick={onClose}
            aria-label="Close menu"
          >
            ✕
          </button>
        </header>

        {handle && (
          <div className="mm-side-menu__creator">
            {creatorStatus?.avatar_url ? (
              <img src={creatorStatus.avatar_url} alt="" className="mm-side-menu__avatar" />
            ) : (
              <div className="mm-side-menu__avatar mm-side-menu__avatar--fallback">
                {handle.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="mm-side-menu__creator-name">@{handle}</p>
              <p className="mm-side-menu__creator-meta">
                {isApproved ? 'Verified creator' : creatorStatus?.status || 'Creator'}
              </p>
            </div>
          </div>
        )}

        {connected && balance !== undefined && (
          <div className="mm-side-menu__coins">
            <CoinBadge
              balance={balance}
              streak={streak}
              canClaim={canClaim}
              nextClaim={nextClaim ?? 0}
              claimCoins={claimCoins}
              registered={registered}
              currentActiveSeconds={currentActiveSeconds}
              isCreator={!!creatorStatus || socketIsCreator}
            />
          </div>
        )}

        <div className="mm-side-menu__online">
          {country && <span title={`Your region: ${country}`}>{countryToFlag(country)}</span>}
          <span className="tabular-nums">{(onlineCount ?? 0).toLocaleString()} online</span>
        </div>

        <nav className="mm-side-menu__nav">
          {handle && (
            <>
              <MenuRow
                icon="📊"
                label="Creator dashboard"
                hint="Live, payouts, profile"
                onClick={() => { onClose?.(); onOpenDashboard?.(); }}
              />
              <MenuRow
                icon="🔗"
                label="Public profile"
                hint={`View @${handle}`}
                onClick={() => {
                  onClose?.();
                  window.open(`/creator/${encodeURIComponent(handle)}`, '_blank', 'noopener,noreferrer');
                }}
              />
            </>
          )}
          {!handle && (
            <MenuRow
              icon="⭐"
              label="For creators"
              hint="Apply or sign in"
              onClick={() => { onClose?.(); onOpenCreatorFlow?.(); }}
            />
          )}
          <MenuRow
            icon="⚙️"
            label="Settings"
            hint="Quality, privacy, about"
            onClick={() => { onClose?.(); onOpenSettings?.(); }}
          />
          {handle && (
            <MenuRow
              icon="🔔"
              label="Notifications"
              hint={creatorUnreadCount ? `${creatorUnreadCount} unread` : 'Creator updates'}
              badge={creatorUnreadCount}
              onClick={() => {
                if (creatorUnreadCount > 0) onMarkNotificationsRead?.([], { all: true });
                onClose?.();
                onOpenNotifications?.();
              }}
            />
          )}
        </nav>

        {handle && creatorNotifications.length > 0 && (
          <div className="mm-side-menu__notes">
            <p className="mm-side-menu__notes-label">Recent</p>
            <ul>
              {creatorNotifications.slice(0, 4).map((n) => (
                <li key={n.id || n.created_at}>
                  <span>{n.title || n.type || 'Update'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {handle && (
          <footer className="mm-side-menu__foot">
            <button
              type="button"
              className="mm-side-menu__logout"
              onClick={() => { onClose?.(); onLogout?.(); }}
            >
              Sign out
            </button>
          </footer>
        )}
      </aside>
    </div>
  );

  return createPortal(panel, document.body);
}
