import { useEffect, useState } from 'react';
import { API_BASE } from '../config/apiBase';
import { applyCreatorProfileSeo, applyPageSeo } from '../utils/seo';
import { HellooooLoader } from './HellooooBrand';
import { VerifiedBadge } from './icons/VerifiedBadge';
import { CreatorAvatar } from './CreatorAvatar';

const API = API_BASE;

function normalizeHandle(raw) {
  return String(raw || '').trim().replace(/^@/, '');
}

function compact(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/**
 * Public /u/:navId profile — viewer-style page (no admin tools).
 */
export function CreatorPublicProfile({ handle }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const key = normalizeHandle(handle);
    if (!key) return undefined;
    let alive = true;
    setProfile(null);
    setError('');

    (async () => {
      try {
        const res = await fetch(`${API}/api/creators/profile/${encodeURIComponent(key)}`);
        const d = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok || !d?.ok || !d.creator) {
          setError(d?.error || 'Creator not found');
          return;
        }
        const c = d.creator;
        setProfile(c);
        applyCreatorProfileSeo(c.handle || key, c.bio || '', c.profilePath || `/u/${encodeURIComponent(key)}`);
      } catch {
        if (alive) setError('Could not load profile');
      }
    })();

    return () => {
      alive = false;
      applyPageSeo();
    };
  }, [handle]);

  if (error) {
    return (
      <main className="mm-cprofile mm-cprofile--empty">
        <p className="mm-cprofile__empty-copy">
          This creator isn&apos;t on Helloooo yet, or the profile isn&apos;t public.
        </p>
        <a href="/" className="mm-cprofile__btn mm-cprofile__btn--ghost">Back to Helloooo</a>
      </main>
    );
  }

  if (!profile) {
    return (
      <div className="mm-cprofile mm-cprofile--empty">
        <HellooooLoader transparent size={100} label="Loading profile…" />
      </div>
    );
  }

  const p = profile;
  const name = p.displayName || p.handle || 'Creator';
  const avatarSrc = p.avatarUrl || p.avatar_url || '';
  const social = p.profileLink || p.profile_link;

  return (
    <main className="mm-cprofile">
      <div className="mm-cprofile__glow" aria-hidden />
      <article className="mm-cprofile__card">
        <header className="mm-cprofile__hero">
          <div className="mm-cprofile__avatar-wrap">
            <CreatorAvatar src={avatarSrc} name={name} size={112} live={!!p.liveNow} />
            {p.liveNow && <span className="mm-cprofile__live-pill">Live</span>}
          </div>
          <h1 className="mm-cprofile__name">
            {name}
            {p.verified && <VerifiedBadge size={18} />}
          </h1>
          <p className="mm-cprofile__handle">@{p.handle}</p>
          {p.code && <p className="mm-cprofile__id">Creator ID {p.code}</p>}
          {p.bio && <p className="mm-cprofile__bio">{p.bio}</p>}
        </header>

        {p.liveNow && (
          <a href="/" className="mm-cprofile__btn mm-cprofile__btn--live">
            Watch live · {compact(p.liveNow.viewerCount)} watching
          </a>
        )}

        <div className="mm-cprofile__stats">
          <div>
            <strong>{compact(p.followers)}</strong>
            <span>Followers</span>
          </div>
          <div>
            <strong>#{p.rank ?? '—'}</strong>
            <span>Rank</span>
          </div>
          <div>
            <strong>{compact(p.score)}</strong>
            <span>Score</span>
          </div>
        </div>

        {(p.totalLives > 0 || p.giftsReceived > 0) && (
          <div className="mm-cprofile__meta-row">
            {p.totalLives > 0 && <span>{p.totalLives} lives</span>}
            {p.giftsReceived > 0 && <span>{compact(p.giftsReceived)} gifts</span>}
            {p.platform && <span>{p.platform}</span>}
          </div>
        )}

        {social && (
          <a
            href={social}
            target="_blank"
            rel="noopener noreferrer"
            className="mm-cprofile__btn mm-cprofile__btn--link"
          >
            {p.platform ? `Open ${p.platform}` : 'Open profile link'}
          </a>
        )}

        <a href="/" className="mm-cprofile__btn mm-cprofile__btn--ghost">Back to Helloooo</a>
      </article>
    </main>
  );
}
