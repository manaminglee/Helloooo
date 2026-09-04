import { useEffect, useState, useCallback } from 'react';
import { API_BASE } from '../../config/apiBase';
import { NutsSymbol } from '../NutsSymbol';
import { MmIcon } from '../icons/MmIcon';
import { GiftArt } from '../icons/GiftArt';
import { VerifiedBadge } from '../icons/VerifiedBadge';
import { HellooooLoader } from '../HellooooBrand';
import { Avatar, Sheet, compact } from './LiveBits';

function since(iso) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (days < 1) return 'today';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function Stat({ label, value, accent = false }) {
  return (
    <div className={`live-stat${accent ? ' live-stat--accent' : ''}`}>
      <div className="live-stat__label">{label}</div>
      <div className="live-stat__value">{value}</div>
    </div>
  );
}

/**
 * Everything public about a creator, opened by tapping them in a live.
 *
 * Loaded on open rather than with the room — most viewers never open it, and
 * the score/rank query is not something to run for every live in the feed.
 */
export function CreatorSheet({ open, creatorKey, onClose, onWatchLive, onFollow, following, onMessage }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !creatorKey) return undefined;
    let alive = true;
    setProfile(null);
    setError('');
    fetch(`${API_BASE}/api/creators/profile/${encodeURIComponent(creatorKey)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.ok) setProfile(d.creator);
        else setError(d?.error || 'Could not load this profile');
      })
      .catch(() => alive && setError('Network error'));
    return () => { alive = false; };
  }, [open, creatorKey]);

  const copyCode = useCallback(async () => {
    if (!profile?.code) return;
    try {
      await navigator.clipboard.writeText(profile.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked — the code is on screen anyway */ }
  }, [profile?.code]);

  const p = profile;
  const gifts = p?.gifts;

  return (
    <Sheet open={open} title="Creator" onClose={onClose} tall>
      {error && <p className="creator-sheet__msg">{error}</p>}
      {!p && !error && (
        <div className="creator-sheet__msg">
          <HellooooLoader transparent size={100} label="Loading profile…" />
        </div>
      )}

      {p && (
        <div className="creator-sheet">
          <header className="creator-sheet__top">
            <Avatar className="creator-sheet__avatar" src={p.avatarUrl} name={p.handle} />
            <div className="creator-sheet__id">
              <h2 className="creator-sheet__name">
                {p.displayName}
                {p.verified && <VerifiedBadge size={16} />}
              </h2>
              <p className="creator-sheet__handle">@{p.handle}</p>
              {p.code && (
                <button type="button" className="creator-sheet__code" onClick={copyCode}>
                  ID {p.code}
                  <MmIcon name={copied ? 'check' : 'plus'} size={11} />
                  <span>{copied ? 'copied' : 'copy'}</span>
                </button>
              )}
            </div>
          </header>

          <div className="creator-sheet__actions">
            {p.liveNow && (
              <button type="button" className="live-btn live-btn--primary" onClick={() => onWatchLive?.(p.liveNow.id)}>
                Watch live · {compact(p.liveNow.viewerCount)}
              </button>
            )}
            <button
              type="button"
              className={`live-btn${following ? '' : ' live-btn--primary'}`}
              onClick={() => onFollow?.(p.handle)}
              disabled={following}
            >
              {following ? 'Following' : 'Follow'}
            </button>
            <button type="button" className="live-btn" onClick={() => onMessage?.(p)}>
              Message
            </button>
          </div>

          {(p.profileLink || p.profile_link) && (
            <a
              className="creator-sheet__verify-link"
              href={p.profileLink || p.profile_link}
              target="_blank"
              rel="noopener noreferrer"
            >
              Verify profile link
              <MmIcon name="share" size={12} />
            </a>
          )}

          {(p.giftCut || p.gifts?.cut) && (
            <div className="creator-sheet__cut">
              <h4>Gift transparency</h4>
              <p>
                Creator keeps <strong>{Math.round(((p.giftCut || p.gifts?.cut)?.creatorSharePct ?? 0.7) * 100)}%</strong>
                {' · '}Platform cut <strong>{Math.round(((p.giftCut || p.gifts?.cut)?.platformCutPct ?? 0.3) * 100)}%</strong>
              </p>
              {(p.giftCut || p.gifts?.cut)?.grossNuts != null && (
                <p className="creator-sheet__cut-nums">
                  Gross {compact((p.giftCut || p.gifts.cut).grossNuts)} Nuts · You {compact((p.giftCut || p.gifts.cut).creatorNuts)} · Cut {compact((p.giftCut || p.gifts.cut).platformNuts)}
                </p>
              )}
            </div>
          )}

          {/* Rank first — it is the question the sheet exists to answer. */}
          <div className={`creator-sheet__rank creator-sheet__rank--${p.tier?.id || 'new'}`}>
            <div>
              <span className="creator-sheet__rank-num">#{p.rank}</span>
              <span className="creator-sheet__rank-of">of {compact(p.rankOf)} creators</span>
            </div>
            <div className="creator-sheet__rank-right">
              <span className="creator-sheet__tier">{p.tier?.label}</span>
              <span className="creator-sheet__score">{p.score}/1000</span>
            </div>
          </div>

          {p.scoreMaturity < 100 && (
            <p className="creator-sheet__note">
              Score is held back until this creator has more lives behind them.
            </p>
          )}

          {p.bio && <p className="creator-sheet__bio">{p.bio}</p>}

          {(p.languages?.length > 0 || p.interests?.length > 0 || p.country) && (
            <div className="creator-sheet__chips">
              {p.country && <span className="live-chip">{p.country}</span>}
              {p.languages?.map((l) => (
                <span key={`l-${l}`} className="live-chip creator-sheet__chip--lang">{l}</span>
              ))}
              {p.interests?.map((i) => (
                <span key={`i-${i}`} className="live-chip">{i}</span>
              ))}
            </div>
          )}

          <div className="live-stats-grid">
            <Stat label="Followers" value={compact(p.followers)} />
            <Stat label="Lives" value={compact(p.totalLives)} />
            <Stat label="Hours live" value={compact(Math.round((p.liveMinutes || 0) / 60))} />
            <Stat label="Avg viewers" value={compact(p.avgPeakViewers)} />
            <Stat label="Gifts" value={compact(gifts?.totalGifts || 0)} accent />
            <Stat label="Joined" value={since(p.joinedAt) || '—'} />
          </div>

          {gifts?.topSenders?.length > 0 && (
            <>
              <p className="creator-sheet__section">Top gifters</p>
              {gifts.topSenders.map((s, i) => (
                <div key={s.username || i} className="live-row">
                  <span className="live-row__avatar" style={{ fontSize: 13 }}>{i + 1}</span>
                  <span className="live-row__main">
                    <span className="live-row__name">{s.username}</span>
                    <span className="live-row__sub">{s.count} gift{s.count === 1 ? '' : 's'}</span>
                  </span>
                  <span className="live-row__tail"><NutsSymbol size={11} /> {compact(s.coins)}</span>
                </div>
              ))}
            </>
          )}

          {gifts?.recent?.length > 0 && (
            <>
              <p className="creator-sheet__section">Recent gifts</p>
              <div className="creator-sheet__recent">
                {gifts.recent.map((g, i) => (
                  <div key={`${g.at}-${i}`} className="creator-sheet__gift">
                    <GiftArt id={g.giftId} size={26} />
                    <span className="creator-sheet__gift-name">{g.giftName}</span>
                    <span className="creator-sheet__gift-from">from {g.username}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {!gifts?.totalGifts && (
            <p className="creator-sheet__msg creator-sheet__msg--quiet">
              No gifts yet — be the first.
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}

export default CreatorSheet;
