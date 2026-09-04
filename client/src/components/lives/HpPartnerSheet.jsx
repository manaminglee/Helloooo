import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE } from '../../config/apiBase';
import { MmIcon } from '../icons/MmIcon';
import { Avatar } from './LiveBits';

const INVITE_TTL_MS = 30_000;

/**
 * The A-vs-B card every HP prompt uses: two avatars with the battle mark
 * between them, so an invite reads the same whichever side you are on.
 */
function BattleFaceoff({ a, b, pending = false }) {
  return (
    <div className="hp-modal__faceoff">
      <div className="hp-modal__side">
        <Avatar className="hp-modal__avatar hp-modal__avatar--a" src={a?.avatarUrl} name={a?.handle} />
        <span className="hp-modal__handle">@{a?.handle || 'creator'}</span>
      </div>

      <div className={`hp-modal__mark${pending ? ' hp-modal__mark--pending' : ''}`} aria-hidden>
        <span className="hp-modal__mark-glow" />
        <span className="hp-modal__mark-text">VS</span>
        <span className="hp-modal__mark-sub">HP</span>
      </div>

      <div className="hp-modal__side">
        <Avatar className="hp-modal__avatar hp-modal__avatar--b" src={b?.avatarUrl} name={b?.handle} />
        <span className="hp-modal__handle">@{b?.handle || 'creator'}</span>
      </div>
    </div>
  );
}

function HpModal({ title, subtitle, a, b, pending, children, onDismiss }) {
  return createPortal(
    <div className="hp-modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="hp-modal" onClick={(e) => e.stopPropagation()}>
        {onDismiss && (
          <button type="button" className="hp-modal__close" onClick={onDismiss} aria-label="Close">
            <MmIcon name="close" size={14} />
          </button>
        )}
        <p className="hp-modal__eyebrow">Helloooo Partner</p>
        <h3 className="hp-modal__title">{title}</h3>
        <BattleFaceoff a={a} b={b} pending={pending} />
        {subtitle && <p className="hp-modal__sub">{subtitle}</p>}
        <div className="hp-modal__actions">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * HP (Helloooo Partner) — invite another live creator into a 7-minute battle.
 */
export default function HpPartnerSheet({
  open,
  onClose,
  socket,
  liveId,
  live,
  battle,
  onRematch,
}) {
  const [lives, setLives] = useState([]);
  const [busy, setBusy] = useState('');
  const [invite, setInvite] = useState(null);       // incoming
  const [outgoing, setOutgoing] = useState(null);   // waiting on their answer
  const [declined, setDeclined] = useState(null);
  const [rematchOffer, setRematchOffer] = useState(null);

  const me = {
    handle: live?.handle,
    avatarUrl: live?.avatarUrl,
  };

  const refresh = useCallback(() => {
    if (!socket || !liveId) return;
    socket.emit('live:hp-list', { liveId }, (res) => {
      if (res?.ok) setLives(res.lives || []);
    });
  }, [socket, liveId]);

  useEffect(() => {
    if (!open) return undefined;
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [open, refresh]);

  useEffect(() => {
    if (!socket) return undefined;
    const onInvite = (payload) => setInvite(payload);
    const onRematchAsk = (payload) => setRematchOffer(payload);
    const onBattleEnd = (payload) => {
      if (payload?.battle) setRematchOffer({ battle: payload.battle, from: 'system' });
    };
    // Our own invite resolved one way or the other — clear the pending card.
    const onAccepted = () => setOutgoing(null);
    const onDeclined = (payload) => {
      setOutgoing(null);
      setDeclined(payload || {});
    };
    const onBattleStart = () => { setOutgoing(null); setInvite(null); };

    socket.on('live:hp-invite', onInvite);
    socket.on('live:hp-accepted', onAccepted);
    socket.on('live:hp-declined', onDeclined);
    socket.on('live:battle:start', onBattleStart);
    socket.on('live:battle-rematch', onRematchAsk);
    socket.on('live:battle:end', onBattleEnd);
    return () => {
      socket.off('live:hp-invite', onInvite);
      socket.off('live:hp-accepted', onAccepted);
      socket.off('live:hp-declined', onDeclined);
      socket.off('live:battle:start', onBattleStart);
      socket.off('live:battle-rematch', onRematchAsk);
      socket.off('live:battle:end', onBattleEnd);
    };
  }, [socket]);

  // An unanswered prompt should never sit on screen forever.
  useEffect(() => {
    if (!invite) return undefined;
    const t = setTimeout(() => setInvite(null), INVITE_TTL_MS);
    return () => clearTimeout(t);
  }, [invite]);

  useEffect(() => {
    if (!outgoing) return undefined;
    const t = setTimeout(() => setOutgoing(null), INVITE_TTL_MS);
    return () => clearTimeout(t);
  }, [outgoing]);

  useEffect(() => {
    if (!declined) return undefined;
    const t = setTimeout(() => setDeclined(null), 5000);
    return () => clearTimeout(t);
  }, [declined]);

  const inviteHost = (target) => {
    setBusy(target.id);
    socket.emit('live:hp-invite', { liveId, targetLiveId: target.id }, (res) => {
      setBusy('');
      if (res?.ok) {
        setOutgoing(target);
        onClose?.();
      }
    });
  };

  const acceptInvite = () => {
    if (!invite?.fromLiveId) return;
    socket.emit('live:hp-accept', { liveId, fromLiveId: invite.fromLiveId }, () => setInvite(null));
  };

  const declineInvite = () => {
    if (!invite?.fromLiveId) return;
    socket.emit('live:hp-decline', { liveId, fromLiveId: invite.fromLiveId });
    setInvite(null);
  };

  const cancelOutgoing = () => setOutgoing(null);

  const requestRematch = () => {
    const active = battle || rematchOffer?.battle;
    const opponent = active?.liveA === liveId ? active?.liveB : active?.liveA;
    socket.emit('live:battle-rematch', {
      liveId,
      opponentLiveId: opponent,
      battleId: active?.id,
    });
    onRematch?.();
    setRematchOffer(null);
  };

  const rematchOpponent = (() => {
    const b = rematchOffer?.battle;
    if (!b) return null;
    const isA = b.liveA === liveId;
    return {
      handle: isA ? b.handleB : b.handleA,
      avatarUrl: isA ? b.avatarB : b.avatarA,
    };
  })();

  return (
    <>
      {invite && (
        <HpModal
          title="HP Battle invite"
          subtitle={`@${invite.fromHandle || invite.handle} wants a 7-minute gift battle.`}
          a={{ handle: invite.fromHandle || invite.handle, avatarUrl: invite.avatarUrl }}
          b={{ handle: invite.targetHandle || me.handle, avatarUrl: invite.targetAvatarUrl || me.avatarUrl }}
          onDismiss={declineInvite}
        >
          <button type="button" className="hp-modal__btn hp-modal__btn--ghost" onClick={declineInvite}>
            Decline
          </button>
          <button type="button" className="hp-modal__btn hp-modal__btn--go" onClick={acceptInvite}>
            Accept battle
          </button>
        </HpModal>
      )}

      {outgoing && !invite && (
        <HpModal
          title="Waiting for an answer"
          subtitle={`Invite sent to @${outgoing.handle}.`}
          a={me}
          b={outgoing}
          pending
          onDismiss={cancelOutgoing}
        >
          <button type="button" className="hp-modal__btn hp-modal__btn--ghost" onClick={cancelOutgoing}>
            Close
          </button>
        </HpModal>
      )}

      {declined && !invite && (
        <HpModal
          title="Invite declined"
          subtitle={`@${declined.handle || 'They'} passed on this one.`}
          a={me}
          b={{ handle: declined.handle, avatarUrl: declined.avatarUrl }}
          onDismiss={() => setDeclined(null)}
        >
          <button type="button" className="hp-modal__btn hp-modal__btn--ghost" onClick={() => setDeclined(null)}>
            Close
          </button>
        </HpModal>
      )}

      {rematchOffer && !invite && battle?.status !== 'active' && (
        <HpModal
          title="One more round?"
          subtitle="Both creators have to tap rematch to restart."
          a={me}
          b={rematchOpponent}
          onDismiss={() => setRematchOffer(null)}
        >
          <button type="button" className="hp-modal__btn hp-modal__btn--ghost" onClick={() => setRematchOffer(null)}>
            Not now
          </button>
          <button type="button" className="hp-modal__btn hp-modal__btn--go" onClick={requestRematch}>
            Rematch
          </button>
        </HpModal>
      )}

      {open && (
        <div className="live-sheet-backdrop" onClick={onClose}>
          <div className="live-sheet live-hp-sheet" onClick={(e) => e.stopPropagation()}>
            <header className="live-sheet__head">
              <h3>Helloooo Partner</h3>
              <button type="button" className="live-icon-btn" onClick={onClose} aria-label="Close">
                <MmIcon name="close" size={14} />
              </button>
            </header>
            <p className="live-hp-sheet__hint">Invite a live creator to a 7-minute gift battle.</p>
            {battle?.status === 'active' && (
              <div className="live-hp-sheet__active">
                Battle live · {battle.handleA} vs {battle.handleB}
                <button type="button" className="live-btn live-btn--primary" onClick={requestRematch}>
                  One more round
                </button>
              </div>
            )}
            <ul className="live-hp-list">
              {lives.length === 0 && <li className="live-hp-list__empty">No other creators live right now</li>}
              {lives.map((l) => (
                <li key={l.id}>
                  <Avatar className="live-hp-list__avatar" src={l.avatarUrl} name={l.handle} />
                  <div className="live-hp-list__meta">
                    <strong>@{l.handle}</strong>
                    <span>{l.viewerCount || 0} watching</span>
                  </div>
                  <button
                    type="button"
                    className="live-btn live-btn--primary"
                    disabled={busy === l.id || !!battle}
                    onClick={() => inviteHost(l)}
                  >
                    {busy === l.id ? '…' : 'Invite'}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="live-btn"
              style={{ width: '100%', marginTop: 8 }}
              onClick={() => fetch(`${API_BASE}/api/lives`).then((r) => r.json()).then(() => refresh())}
            >
              Refresh
            </button>
          </div>
        </div>
      )}
    </>
  );
}
