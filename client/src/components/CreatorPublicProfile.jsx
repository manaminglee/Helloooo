import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_SOCKET_URL || '';

export function CreatorPublicProfile({ handle }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!handle) return;
    fetch(`${API}/api/creators/public/${encodeURIComponent(handle)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setProfile(d.creator);
      })
      .catch(() => setError('Could not load profile'));
  }, [handle]);

  if (error) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-6 text-center">
        <p className="text-white/60">{error}</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-6">
        <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[50vh] p-6 max-w-lg mx-auto">
      <div className="rounded-2xl border border-white/10 bg-[#161a22] p-6 text-center">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="w-20 h-20 rounded-full mx-auto mb-4 object-cover" />
        ) : (
          <div className="w-20 h-20 rounded-full mx-auto mb-4 bg-white/10 flex items-center justify-center text-2xl">⭐</div>
        )}
        <h1 className="text-xl font-semibold text-white">@{profile.handle_name}</h1>
        <p className="text-sm text-white/50 mt-1">{profile.platform || 'Creator'}</p>
        {profile.bio && <p className="text-sm text-white/70 mt-4">{profile.bio}</p>}
        {profile.public_profile !== false && profile.link && (
          <a href={profile.link} target="_blank" rel="noreferrer" className="inline-block mt-4 text-sm text-violet-300 underline">
            View social profile
          </a>
        )}
      </div>
    </div>
  );
}
