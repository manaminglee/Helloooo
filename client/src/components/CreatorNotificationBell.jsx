import { useEffect, useRef, useState } from 'react';

function formatWhen(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function typeIcon(type) {
  switch (type) {
    case 'approved': return '✅';
    case 'rejected': return '❌';
    case 'featured_on': return '⭐';
    case 'featured_off': return '☆';
    case 'password_reset': return '🔑';
    case 'withdrawal_paid': return '💸';
    case 'withdrawal_rejected': return '↩️';
    case 'application_submitted': return '📝';
    default: return '🔔';
  }
}

export function CreatorNotificationBell({
  notifications = [],
  unreadCount = 0,
  loading = false,
  onMarkRead,
  onRefresh,
  onOpenDashboard,
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0 && onMarkRead) {
      onMarkRead([], { all: true });
    }
  };

  return (
    <div className="relative shrink-0" ref={panelRef}>
      <button
        type="button"
        onClick={handleOpen}
        className="relative mm-compact-btn w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 border border-white/15 hover:bg-violet-500/20 hover:border-violet-500/30 transition-all"
        title="Creator notifications"
        aria-label={`Creator notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
      >
        <svg className="w-4 h-4 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white shadow-lg shadow-rose-900/40 animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-[2000] w-[min(92vw,340px)] max-h-[min(70vh,420px)] overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a]/95 backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] animate-in-zoom">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.02]">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white">Notifications</p>
              <p className="text-[8px] text-white/30 uppercase tracking-widest mt-0.5">Admin updates and account alerts</p>
            </div>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-violet-400 transition-colors"
              >
                Refresh
              </button>
            )}
          </div>

          <div className="overflow-y-auto max-h-[min(60vh,360px)] custom-scrollbar">
            {loading && notifications.length === 0 ? (
              <p className="py-10 text-center text-[10px] text-white/30 uppercase tracking-widest animate-pulse">Loading…</p>
            ) : notifications.length === 0 ? (
              <p className="py-10 px-4 text-center text-[10px] text-white/25 uppercase tracking-widest leading-relaxed">
                No notifications yet. You will be alerted here when an admin updates your account.
              </p>
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className={`px-4 py-3 transition-colors ${!n.read ? 'bg-violet-500/[0.06]' : ''} ${n.important ? 'border-l-2 border-l-amber-500/50' : ''}`}
                  >
                    <div className="flex gap-3">
                      <span className="text-lg shrink-0 mt-0.5" aria-hidden="true">{typeIcon(n.type)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[11px] font-black text-white leading-snug">{n.title}</p>
                          <span className="text-[8px] text-white/25 shrink-0 uppercase tracking-wider">{formatWhen(n.created_at)}</span>
                        </div>
                        <p className="text-[10px] text-white/45 mt-1 leading-relaxed">{n.message}</p>
                        {n.important && (
                          <span className="inline-block mt-2 text-[7px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400/90 border border-amber-500/20">
                            Important
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {onOpenDashboard && (
            <div className="border-t border-white/10 p-3 bg-white/[0.02]">
              <button
                type="button"
                onClick={() => { setOpen(false); onOpenDashboard(); }}
                className="w-full py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-[9px] font-black uppercase tracking-widest text-violet-300 hover:bg-violet-500/20 transition-all"
              >
                Open creator dashboard
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
