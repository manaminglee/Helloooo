import { memo, useEffect, useState } from 'react';
import { NutsSymbol } from '../NutsSymbol';
import { MmIcon } from '../icons/MmIcon';
import { Avatar, Badges, Sheet, compact } from './LiveBits';

/* ------------------------------------------------------------------------ */
/* Viewer list                                                               */
/* ------------------------------------------------------------------------ */

export function LiveViewerSheet({ open, onClose, onFetch, onPickUser, canModerate }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const load = async () => {
      setLoading(true);
      const res = await onFetch?.();
      if (!alive) return;
      setRows(res?.viewers || []);
      setTotal(res?.total || 0);
      setLoading(false);
    };
    load();
    // Refresh while the sheet is open — closed sheets poll nothing.
    const t = setInterval(load, 6000);
    return () => { alive = false; clearInterval(t); };
  }, [open, onFetch]);

  return (
    <Sheet open={open} title={`Viewers${total ? ` · ${compact(total)}` : ''}`} onClose={onClose} tall>
      {loading && !rows.length && (
        <p style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
          Loading…
        </p>
      )}
      {rows.map((v) => (
        <button
          key={v.socketId}
          type="button"
          className="live-row"
          onClick={() => onPickUser?.({
            username: v.username,
            socketId: v.socketId,
            muted: v.muted,
            badges: v.badges,
          })}
        >
          <Avatar className="live-row__avatar" src={v.avatarUrl} name={v.username} />
          <span className="live-row__main">
            <span className="live-row__name" style={{ color: v.nameColor || undefined }}>
              <Badges badges={v.badges} />
              {v.username}
            </span>
            <span className="live-row__sub">
              {v.displayLevel ? `Lv ${v.displayLevel}` : 'Viewer'}
              {v.muted ? ' · muted' : ''}
              {v.country ? ` · ${v.country}` : ''}
            </span>
          </span>
          {v.giftedCoins > 0 && (
            <span className="live-row__tail">
              <NutsSymbol size={11} /> {compact(v.giftedCoins)}
            </span>
          )}
          {canModerate && <MmIcon name="chevron" size={14} style={{ opacity: 0.4 }} />}
        </button>
      ))}
      {!loading && !rows.length && (
        <p style={{ padding: 28, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
          No viewers yet.
        </p>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------------ */
/* Per-user action sheet — moderation entries only render for moderators.    */
/* ------------------------------------------------------------------------ */

export function LiveUserSheet({
  user, isModerator, isHost, onClose,
  onMention, onDeleteComment, onPin, onMute, onKick, onBlock, onPromote, onReport,
}) {
  if (!user) return null;
  const act = (fn, ...args) => () => { fn?.(...args); onClose?.(); };

  return (
    <Sheet open title={`@${user.username}`} onClose={onClose}>
      <div className="live-menu">
        <button type="button" className="live-menu__item" onClick={act(onMention, user.username)}>
          <span><MmIcon name="at" size={16} /></span> Mention {user.username}
        </button>

        {isModerator && user.commentId && (
          <>
            <button type="button" className="live-menu__item" onClick={act(onPin, user.commentId)}>
              <span><MmIcon name="pin" size={17} /></span> Pin this comment
            </button>
            <button type="button" className="live-menu__item live-menu__item--warn" onClick={act(onDeleteComment, user.commentId)}>
              <span><MmIcon name="trash" size={17} /></span> Delete comment
            </button>
          </>
        )}

        {isModerator && user.socketId && (
          <>
            <button type="button" className="live-menu__item live-menu__item--warn" onClick={act(onMute, user.socketId, user.muted)}>
              <span><MmIcon name={user.muted ? 'volume' : 'volumeOff'} size={17} /></span> {user.muted ? 'Unmute user' : 'Mute user'}
            </button>
            <button type="button" className="live-menu__item live-menu__item--warn" onClick={act(onKick, user.socketId)}>
              <span><MmIcon name="userMinus" size={17} /></span> Remove from live
            </button>
            <button type="button" className="live-menu__item live-menu__item--danger" onClick={act(onBlock, user.socketId)}>
              <span><MmIcon name="ban" size={17} /></span> Block user
            </button>
          </>
        )}

        {isHost && user.socketId && (
          <button type="button" className="live-menu__item" onClick={act(onPromote, user.socketId, user.badges?.includes('moderator'))}>
            <span><MmIcon name="shield" size={17} /></span> {user.badges?.includes('moderator') ? 'Remove moderator' : 'Make moderator'}
          </button>
        )}

        <button type="button" className="live-menu__item live-menu__item--danger" onClick={act(onReport, user)}>
          <span><MmIcon name="flag" size={17} /></span> Report
        </button>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------------ */
/* Room-level moderation (host / mod only)                                   */
/* ------------------------------------------------------------------------ */

const SLOW_OPTIONS = [0, 3, 5, 10, 30];

export function LiveModerationSheet({ open, onClose, settings, onSlowMode, onToggleComments, onOpenViewers, onUnpin, hasPinned }) {
  return (
    <Sheet open={open} title="Moderation" onClose={onClose}>
      <div className="live-menu">
        <button
          type="button"
          className="live-menu__item"
          aria-pressed={settings.commentsDisabled}
          onClick={() => onToggleComments(!settings.commentsDisabled)}
        >
          <span><MmIcon name={settings.commentsDisabled ? 'chatOff' : 'chat'} size={17} /></span>
          {settings.commentsDisabled ? 'Turn comments back on' : 'Turn comments off'}
        </button>

        {hasPinned && (
          <button type="button" className="live-menu__item" onClick={onUnpin}>
            <span><MmIcon name="pin" size={17} /></span> Remove pinned comment
          </button>
        )}

        <button type="button" className="live-menu__item" onClick={onOpenViewers}>
          <span><MmIcon name="users" size={17} /></span> Manage viewers
        </button>
      </div>

      <div style={{ padding: '4px 18px 18px' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
          Slow mode
        </p>
        <div className="live-gift-tabs" style={{ padding: 0 }}>
          {SLOW_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={`live-gift-tab${(settings.slowModeMs / 1000) === s ? ' live-gift-tab--on' : ''}`}
              onClick={() => onSlowMode(s)}
            >
              {s === 0 ? 'Off' : `${s}s`}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------------ */
/* Report reasons                                                            */
/* ------------------------------------------------------------------------ */

const REASONS = [
  ['nudity', 'Nudity or sexual content'],
  ['harassment', 'Harassment or hate'],
  ['spam', 'Spam or scam'],
  ['violence', 'Violence'],
  ['minor', 'Underage user'],
  ['other', 'Something else'],
];

export function LiveReportSheet({ open, target, onClose, onSubmit }) {
  const [sent, setSent] = useState(false);
  useEffect(() => { if (open) setSent(false); }, [open]);

  return (
    <Sheet open={open} title={target ? `Report @${target.username}` : 'Report this live'} onClose={onClose}>
      {sent ? (
        <p style={{ padding: 30, textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
          Thanks — our team will review this.
        </p>
      ) : (
        <div className="live-menu">
          {REASONS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="live-menu__item"
              onClick={async () => {
                await onSubmit?.({
                  reason: id,
                  targetSocketId: target?.socketId,
                  targetUsername: target?.username,
                });
                setSent(true);
                setTimeout(onClose, 1200);
              }}
            >
              <span><MmIcon name="chevron" size={15} /></span> {label}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------------ */
/* Host earnings panel                                                       */
/* ------------------------------------------------------------------------ */

export const LiveStatsSheet = memo(function LiveStatsSheet({ open, onClose, stats, onRefresh }) {
  useEffect(() => {
    if (!open) return undefined;
    onRefresh?.();
    const t = setInterval(() => onRefresh?.(), 5000);
    return () => clearInterval(t);
  }, [open, onRefresh]);

  const s = stats || {};
  const mins = Math.floor((s.durationMs || 0) / 60000);

  return (
    <Sheet open={open} title="Live stats" onClose={onClose} tall>
      <div className="live-stats-grid">
        <div className="live-stat live-stat--accent">
          <div className="live-stat__label">Coins earned</div>
          <div className="live-stat__value">{compact(s.nutsEarned || 0)}</div>
        </div>
        <div className="live-stat">
          <div className="live-stat__label">Gifts</div>
          <div className="live-stat__value">{compact(s.giftCount || 0)}</div>
        </div>
        <div className="live-stat">
          <div className="live-stat__label">Watching</div>
          <div className="live-stat__value">{compact(s.viewers || 0)}</div>
        </div>
        <div className="live-stat">
          <div className="live-stat__label">Peak</div>
          <div className="live-stat__value">{compact(s.peakViewers || 0)}</div>
        </div>
        <div className="live-stat">
          <div className="live-stat__label">Likes</div>
          <div className="live-stat__value">{compact(s.likes || 0)}</div>
        </div>
        <div className="live-stat">
          <div className="live-stat__label">Duration</div>
          <div className="live-stat__value">{mins}m</div>
        </div>
      </div>

      {s.recentGift && (
        <p style={{ padding: '0 18px 10px', fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
          Latest: <strong style={{ color: '#fff' }}>{s.recentGift.username}</strong>{' '}
          sent {s.recentGift.giftName}
        </p>
      )}

      <p style={{ padding: '10px 18px 6px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        Top gifters
      </p>
      {(s.topGifters || []).map((g, i) => (
        <div key={g.key || i} className="live-row">
          <span className="live-row__avatar" style={{ fontSize: 13 }}>{i + 1}</span>
          <span className="live-row__main">
            <span className="live-row__name" style={{ color: g.nameColor || undefined }}>{g.username}</span>
            <span className="live-row__sub">{g.count} gift{g.count === 1 ? '' : 's'}</span>
          </span>
          <span className="live-row__tail"><NutsSymbol size={11} /> {compact(g.coins)}</span>
        </div>
      ))}
      {!(s.topGifters || []).length && (
        <p style={{ padding: '10px 18px 24px', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
          No gifts yet this live.
        </p>
      )}
    </Sheet>
  );
});
