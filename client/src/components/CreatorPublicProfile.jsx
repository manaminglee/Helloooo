import { useEffect, useState } from 'react';
import { API_BASE } from '../config/apiBase';
import { applyCreatorProfileSeo, applyPageSeo } from '../utils/seo';
import { HellooooLoader } from './HellooooBrand';
import { VerifiedBadge } from './icons/VerifiedBadge';

const API = API_BASE;

function normalizeHandle(raw) {
  return String(raw || '').trim().replace(/^@/, '');
}

/**
 * Public /creator/:handle page — viewer-style profile (no admin tools).
 * Uses the canonical profile API; missing creators show a calm empty state.
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
        applyCreatorProfileSeo(c.handle || key, c.bio || '');
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
      <main className="min-h-[60dvh] flex flex-col items-center justify-center p-6 text-center gap-4">
        <p className="text-white/50 text-sm max-w-xs">
          @{normalizeHandle(handle) || 'creator'} isn&apos;t on Helloooo yet, or this profile isn&apos;t public.
        </p>
        <a href="/" className="text-sm font-bold text-violet-300 hover:text-violet-200">
          Browse lives →
        </a>
      </main>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-[50dvh] flex items-center justify-center p-6">
        <HellooooLoader transparent size={100} label="Loading profile…" />
      </div>
    );
  }

  const p = profile;

  return (
    <main className="min-h-[60dvh] p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-w-lg mx-auto">
      <article className="rounded-3xl border border-white/10 bg-[#12151c] overflow-hidden">
        <div className="p-6 text-center border-b border-white/5">
          {p.avatarUrl ? (
            <img
              src={p.avatarUrl}
              alt=""
              className="w-20 h-20 rounded-full mx-auto mb-3 object-cover ring-2 ring-violet-500/30"
            />
          ) : (
            <div className="w-20 h-20 rounded-full mx-auto mb-3 bg-white/10 flex items-center justify-center text-2xl">
              ⭐
            </div>
          )}
          <h1 className="text-xl font-black text-white flex items-center justify-center gap-1.5">
            {p.displayName || p.handle}
            {p.verified && <VerifiedBadge size={16} />}
          </h1>
          <p className="text-sm text-white/45 mt-0.5">@{p.handle}</p>
          {p.code && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mt-2">
              Creator ID {p.code}
            </p>
          )}
        </div>

        {p.liveNow && (
          <div className="px-6 py-4 border-b border-white/5 bg-rose-500/10">
            <a
              href={`/?mode=lives&live=${encodeURIComponent(p.liveNow.id)}`}
              className="block w-full py-3 rounded-2xl bg-rose-500 text-black text-center text-xs font-black uppercase tracking-widest"
            >
              🔴 Watch live · {p.liveNow.viewerCount ?? 0} watching
            </a>
          </div>
        )}

        <div className="p-6 space-y-4">
          {p.bio && <p className="text-sm text-white/70 leading-relaxed text-center">{p.bio}</p>}

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white/[0.04] p-3">
              <p className="text-lg font-black text-white">{p.followers ?? 0}</p>
              <p className="text-[9px] uppercase tracking-widest text-white/35">Followers</p>
            </div>
            <div className="rounded-xl bg-white/[0.04] p-3">
              <p className="text-lg font-black text-violet-300">#{p.rank ?? '—'}</p>
              <p className="text-[9px] uppercase tracking-widest text-white/35">Rank</p>
            </div>
            <div className="rounded-xl bg-white/[0.04] p-3">
              <p className="text-lg font-black text-amber-300">{p.score ?? 0}</p>
              <p className="text-[9px] uppercase tracking-widest text-white/35">Score</p>
            </div>
          </div>

          {(p.profileLink || p.profile_link) && (
            <a
              href={p.profileLink || p.profile_link}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-sm text-violet-300 underline underline-offset-2"
            >
              Verify profile link
            </a>
          )}

          <a
            href="/"
            className="block w-full py-3 rounded-2xl border border-white/10 text-center text-xs font-bold text-white/60 hover:bg-white/5"
          >
            Back to Helloooo
          </a>
        </div>
      </article>
    </main>
  );
}
