import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../../config/apiBase';
import { MmIcon } from '../icons/MmIcon';

/**
 * HP (Helloooo Partner) — invite another live creator into a 7‑minute battle.
 */
export default function HpPartnerSheet({
  open,
  onClose,
  socket,
  liveId,
  battle,
  onRematch,
}) {
  const [lives, setLives] = useState([]);
  const [busy, setBusy] = useState('');
  const [invite, setInvite] = useState(null); // incoming
  const [rematchOffer, setRematchOffer] = useState(null);

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
    socket.on('live:hp-invite', onInvite);
    socket.on('live:battle-rematch', onRematchAsk);
    socket.on('live:battle:end', onBattleEnd);
    return () => {
      socket.off('live:hp-invite', onInvite);
      socket.off('live:battle-rematch', onRematchAsk);
      socket.off('live:battle:end', onBattleEnd);
    };
  }, [socket]);

  const inviteHost = (targetLiveId) => {
    setBusy(targetLiveId);
    socket.emit('live:hp-invite', { liveId, targetLiveId }, () => setBusy(''));
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

  const requestRematch = () => {
    const opponent = battle?.liveA === liveId ? battle?.liveB : battle?.liveA
      || rematchOffer?.battle?.liveA === liveId
        ? rematchOffer?.battle?.liveB
        : rematchOffer?.battle?.liveA;
    socket.emit('live:battle-rematch', {
      liveId,
      opponentLiveId: opponent,
      battleId: battle?.id || rematchOffer?.battle?.id,
    });
    onRematch?.();
    setRematchOffer(null);
  };

  if (!open && !invite && !rematchOffer) return null;

  return (
    <>
      {invite && (
        <div className="live-hp-toast" role="dialog">
          <p><strong>@{invite.fromHandle}</strong> invited you to HP Battle</p>
          <div className="live-hp-toast__actions">
            <button type="button" className="live-btn live-btn--primary" onClick={acceptInvite}>Accept</button>
            <button type="button" className="live-btn" onClick={declineInvite}>Decline</button>
          </div>
        </div>
      )}

      {rematchOffer && !battle?.status && (
        <div className="live-hp-toast" role="dialog">
          <p>One more round?</p>
          <div className="live-hp-toast__actions">
            <button type="button" className="live-btn live-btn--primary" onClick={requestRematch}>Rematch</button>
            <button type="button" className="live-btn" onClick={() => setRematchOffer(null)}>Close</button>
          </div>
        </div>
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
            <p className="live-hp-sheet__hint">Invite a live creator to a 7‑minute gift battle.</p>
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
                  <div>
                    <strong>@{l.handle}</strong>
                    <span>{l.viewerCount || 0} watching</span>
                  </div>
                  <button
                    type="button"
                    className="live-btn live-btn--primary"
                    disabled={busy === l.id || !!battle}
                    onClick={() => inviteHost(l.id)}
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
