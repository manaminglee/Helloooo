/**
 * Mutual-follow guest join request bar (viewer) + host accept toast.
 */
export default function GuestJoinBar({
  socket,
  liveId,
  isHost,
  mutualFollow = false,
  guest = null,
  onRequestJoin,
}) {
  if (!socket || !liveId) return null;

  if (isHost && guest?.pending) {
    return (
      <div className="live-guest-bar" role="dialog">
        <p>@{guest.username} wants to join your live</p>
        <div className="live-guest-bar__actions">
          <button
            type="button"
            className="live-btn live-btn--primary"
            onClick={() => socket.emit('live:join-accept', { liveId, socketId: guest.socketId })}
          >
            Accept
          </button>
          <button
            type="button"
            className="live-btn"
            onClick={() => socket.emit('live:join-decline', { liveId, socketId: guest.socketId })}
          >
            Decline
          </button>
        </div>
      </div>
    );
  }

  if (!isHost && mutualFollow && !guest?.joined) {
    return (
      <button type="button" className="live-guest-request" onClick={onRequestJoin}>
        Request join video
      </button>
    );
  }

  if (guest?.joined) {
    return (
      <div className="live-guest-bar live-guest-bar--on">
        <span>Co-live with @{guest.username || guest.handle}</span>
        {isHost && (
          <button
            type="button"
            className="live-btn"
            onClick={() => socket.emit('live:guest-leave', { liveId })}
          >
            Remove
          </button>
        )}
      </div>
    );
  }

  return null;
}
