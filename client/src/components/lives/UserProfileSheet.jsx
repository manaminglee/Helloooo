import { useEffect, useState } from 'react';
import { API_BASE } from '../../config/apiBase';
import { MmIcon } from '../icons/MmIcon';
import { Avatar } from './LiveBits';

function authHeaders() {
  const tok = localStorage.getItem('mm_audio_session') || '';
  return {
    'Content-Type': 'application/json',
    ...(tok ? { 'x-audio-session': tok } : {}),
  };
}

/**
 * Public mini-profile for audio-identity users (from comments).
 */
export default function UserProfileSheet({
  open,
  username,
  onClose,
  onMessage,
  onFollow,
  following = false,
  isCreatorViewer = false,
}) {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!open || !username) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/social/user/${encodeURIComponent(username)}`, {
          headers: authHeaders(),
          credentials: 'include',
        });
        const data = await res.json();
        if (!cancelled && data?.ok) setProfile(data.user);
        else if (!cancelled) {
          setProfile({
            username,
            level: 0,
            nameColor: '#e2e8f0',
            coins: null,
          });
        }
      } catch {
        if (!cancelled) setProfile({ username, level: 0, nameColor: '#e2e8f0' });
      }
    })();
    return () => { cancelled = true; };
  }, [open, username]);

  if (!open || !username) return null;

  return (
    <div className="live-sheet-backdrop" onClick={onClose}>
      <div className="live-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="live-sheet__head">
          <h3>@{username}</h3>
          <button type="button" className="live-icon-btn" onClick={onClose} aria-label="Close">
            <MmIcon name="close" size={14} />
          </button>
        </header>
        <div className="live-user-profile">
          <Avatar name={username} className="live-user-profile__avatar" />
          <p style={{ color: profile?.nameColor || '#fff', fontWeight: 800 }}>
            @{profile?.username || username}
          </p>
          <p className="live-user-profile__meta">
            Level {profile?.level ?? 0}
            {profile?.mutual ? ' · Friends' : ''}
          </p>
          <div className="live-user-profile__actions">
            <button
              type="button"
              className={`live-btn${following ? '' : ' live-btn--primary'}`}
              disabled={following}
              onClick={() => onFollow?.(username)}
            >
              {following ? 'Following' : isCreatorViewer ? 'Follow fan' : 'Follow'}
            </button>
            <button
              type="button"
              className="live-btn live-btn--primary"
              onClick={() => onMessage?.(username)}
            >
              Message
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
