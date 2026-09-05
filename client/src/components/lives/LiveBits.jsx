import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MmIcon } from '../icons/MmIcon';
import { GiftArt } from '../icons/GiftArt';
import GiftAnimation3D from './GiftAnimation3D';
import { HellooooLoader } from '../HellooooBrand';

/* Small shared pieces of the live overlay. Everything here is memoised —
   these sit next to the video element and must not re-render on every tick. */

export const BADGE_LABEL = {
  creator: 'Host',
  moderator: 'Mod',
  top_gifter: 'Top',
  vip: 'VIP',
  verified: '✓',
};

export function compact(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

export function initials(name) {
  return String(name || '?').trim().slice(0, 1).toUpperCase();
}

export const Avatar = memo(function Avatar({ src, name, className = '' }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);
  const url = src && !broken ? String(src).trim() : '';
  if (url) {
    return (
      <img
        className={className}
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
      />
    );
  }
  return <span className={className} aria-hidden>{initials(name)}</span>;
});

export const Badges = memo(function Badges({ badges }) {
  if (!badges?.length) return null;
  return badges.slice(0, 3).map((b) => (
    <span key={b} className={`live-comment__badge live-badge--${b}`}>{BADGE_LABEL[b] || b}</span>
  ));
});

/* ------------------------------------------------------------------------ */
/* Comment stream                                                            */
/* ------------------------------------------------------------------------ */

const CommentRow = memo(function CommentRow({ c, onUser }) {
  if (c.system) {
    return (
      <div className="live-comment live-comment--system">
        <span className="live-comment__user" style={{ color: c.nameColor }}>{c.username}</span>
        <span className="live-comment__text">{c.text}</span>
      </div>
    );
  }
  // Strip a leading duplicate of the mention so it renders once, styled.
  const body = c.mention
    ? c.text.replace(new RegExp(`^@${c.mention}\\s*`, 'i'), '')
    : c.text;
  return (
    <div className={`live-comment${c.mention ? ' live-comment--mention' : ''}`}>
      <button
        type="button"
        className="live-comment__user"
        style={{ color: c.nameColor || undefined }}
        onClick={() => onUser?.(c)}
      >
        <Badges badges={c.badges} />
        {c.username}
      </button>
      <span className="live-comment__text">
        {c.mention ? <span className="live-comment__mention">@{c.mention} </span> : null}
        {body}
      </span>
    </div>
  );
});

export const CommentStream = memo(function CommentStream({ comments, onUser }) {
  const ref = useRef(null);
  const stickRef = useRef(true);

  // Auto-follow the newest message, but stop if the viewer scrolled up to read.
  useEffect(() => {
    const el = ref.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [comments]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  return (
    <div className="live-comments" ref={ref} onScroll={onScroll} data-interactive>
      {comments.map((c) => <CommentRow key={c.id} c={c} onUser={onUser} />)}
    </div>
  );
});

/* ------------------------------------------------------------------------ */
/* Floating hearts                                                           */
/* ------------------------------------------------------------------------ */

/* Two marks only — a heart and a spark. Drawn inline rather than through
   <MmIcon> because dozens animate at once and every prop costs. */
const FloatHeart = memo(function FloatHeart({ shape, hue }) {
  return (
    <svg viewBox="0 0 24 24" fill={hue} aria-hidden>
      {shape === 'spark'
        ? <path d="M12 1.6c.8 5 2.6 6.8 7.6 7.6-5 .8-6.8 2.6-7.6 7.6-.8-5-2.6-6.8-7.6-7.6 5-.8 6.8-2.6 7.6-7.6Z" />
        : <path d="M12 21.4C4.2 16.2 1.6 12.4 1.6 8.8A5.3 5.3 0 0 1 12 6.6a5.3 5.3 0 0 1 10.4 2.2c0 3.6-2.6 7.4-10.4 12.6Z" />}
    </svg>
  );
});

export const HeartLayer = memo(function HeartLayer({ hearts, onDone }) {
  return (
    <div className="live-hearts" aria-hidden>
      {hearts.map((h) => (
        <span
          key={h.id}
          className="live-heart"
          style={h.style}
          onAnimationEnd={() => onDone(h.id)}
        >
          <FloatHeart shape={h.shape} hue={h.hue} />
        </span>
      ))}
    </div>
  );
});

/* ------------------------------------------------------------------------ */
/* Gift overlays                                                             */
/* ------------------------------------------------------------------------ */

export const GiftBanners = memo(function GiftBanners({ banners }) {
  if (!banners.length) return null;
  return (
    <div className="live-gift-banners" aria-live="polite">
      {banners.map((b) => (
        <div className="live-gift-banner" key={b.comboId}>
          <Avatar className="live-gift-banner__avatar" src={b.avatarUrl} name={b.from} />
          <span className="live-gift-banner__text">
            <span className="live-gift-banner__from">{b.from}</span>
            <span className="live-gift-banner__what">sent {b.gift?.name}</span>
          </span>
          <span className="live-gift-banner__icon">
            <GiftArt id={b.gift?.id} tier={b.gift?.tier} size={30} />
          </span>
          {b.comboCount > 1 && (
            <span
              key={b.bump}
              className="live-gift-banner__combo live-gift-banner__combo--bump"
            >
              x{b.comboCount}
            </span>
          )}
        </div>
      ))}
    </div>
  );
});

export const FullscreenGift = memo(function FullscreenGift({ gift }) {
  if (!gift) return null;
  // legendary and mega get the 3D stage; everything else keeps the flat card.
  if (gift.anim === 'legendary' || gift.anim === 'mega') {
    return <GiftAnimation3D gift={gift} />;
  }
  return (
    <div className="live-gift-fullscreen" aria-hidden>
      <div className="live-gift-fullscreen__rays" />
      <div className="live-gift-fullscreen__inner">
        <div className="live-gift-fullscreen__icon">
          <GiftArt id={gift.gift?.id} tier={gift.gift?.tier} size={140} />
        </div>
        <div className="live-gift-fullscreen__name">{gift.gift?.name}</div>
        <div className="live-gift-fullscreen__from">
          from {gift.from}{gift.comboCount > 1 ? ` · x${gift.comboCount}` : ''}
        </div>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------------ */
/* Sheets & dialogs                                                          */
/* ------------------------------------------------------------------------ */

/** Bottom sheet. Rendered in a portal so no ancestor transform can clip it. */
export function Sheet({ open, title, onClose, children, tall = false, foot = null }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="live-sheet-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={`live-sheet${tall ? ' live-sheet--tall' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="live-sheet__grip" />
        <div className="live-sheet__head">
          <span className="live-sheet__title">{title}</span>
          <button type="button" className="live-icon-btn" onClick={onClose} aria-label="Close">
            <MmIcon name="close" size={15} />
          </button>
        </div>
        <div className="live-sheet__body">{children}</div>
        {foot}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }) {
  if (!open) return null;
  return createPortal(
    <div className="live-center-backdrop" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="live-confirm" onClick={(e) => e.stopPropagation()}>
        <p className="live-confirm__title">{title}</p>
        {message && <p className="live-confirm__sub">{message}</p>}
        <div className="live-confirm__row">
          <button type="button" className="live-btn" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className={`live-btn ${danger ? 'live-btn--danger' : 'live-btn--primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------------ */
/* Room states                                                               */
/* ------------------------------------------------------------------------ */

export function StateOverlay({ state, error }) {
  if (state === 'loading') {
    return (
      <div className="live-state live-state--transparent">
        <HellooooLoader transparent label="" size={120} />
      </div>
    );
  }
  if (state === 'connecting') {
    return (
      <div className="live-state live-state--transparent">
        <HellooooLoader
          transparent
          size={140}
          label="Connecting…"
          hint="Waiting for clear video & audio"
        />
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="live-state">
        <p className="live-state__label">Could not connect</p>
        <p className="live-state__hint">{error || 'Check your connection and try again.'}</p>
      </div>
    );
  }
  return null;
}

export function ReconnectBanner() {
  return (
    <div className="live-reconnect" role="status">
      <span className="live-state__spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
      Reconnecting…
    </div>
  );
}

export function LiveToast({ notice }) {
  if (!notice) return null;
  return <div className="live-toast" role="status">{notice.message}</div>;
}
