import { getCreatorSessionToken } from '../utils/creatorAuth';
import { NutsAmount } from './NutsSymbol';

const ACTIONS = [
  {
    id: 'create_live',
    title: 'Create Live',
    hint: 'Go live in-app · gifts & comments',
    accent: 'rose',
    primary: true,
  },
  {
    id: 'watch_lives',
    title: 'Browse Lives',
    hint: 'Watch other creators',
    accent: 'amber',
  },
  {
    id: 'group_text',
    title: 'Voice Rooms',
    hint: 'Audio lobby & Nuts races',
    accent: 'violet',
  },
  {
    id: 'group_video',
    title: 'Group Video',
    hint: 'Up to 4 on camera',
    accent: 'indigo',
  },
  {
    id: 'video',
    title: '1:1 Video',
    hint: 'Private video chat',
    accent: 'sky',
  },
  {
    id: 'profile',
    title: 'Edit Profile',
    hint: 'Bio, avatar, public page',
    accent: 'emerald',
  },
  {
    id: 'payout',
    title: 'Payouts',
    hint: 'UPI & withdrawals',
    accent: 'teal',
  },
  {
    id: 'referral',
    title: 'Share Referral',
    hint: 'Copy your invite link',
    accent: 'fuchsia',
  },
];

const ACCENT = {
  rose: 'border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20 text-rose-100',
  amber: 'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15 text-amber-100',
  violet: 'border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/15 text-violet-100',
  indigo: 'border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/15 text-indigo-100',
  sky: 'border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/15 text-sky-100',
  emerald: 'border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-100',
  teal: 'border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/15 text-teal-100',
  fuchsia: 'border-fuchsia-500/30 bg-fuchsia-500/10 hover:bg-fuchsia-500/15 text-fuchsia-100',
};

/**
 * Approved-creator control center — picks modes including Create Live.
 */
export default function CreatorHub({
  creator,
  onAction,
  sessionOk = false,
}) {
  const hasSession = sessionOk || !!getCreatorSessionToken();

  return (
    <section className="mm-creator-hub">
      <header className="mm-creator-hub__head">
        <div className="mm-creator-hub__avatar">
          {creator?.avatar_url ? (
            <img src={creator.avatar_url} alt="" />
          ) : (
            <span>{(creator?.handle_name || '?').slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div>
          <p className="mm-eyebrow">Creator hub</p>
          <h2 className="mm-creator-hub__name">@{creator?.handle_name || 'creator'}</h2>
          <p className="mm-creator-hub__meta">
            {creator?.status === 'approved' ? 'Verified' : creator?.status || '—'}
            {' · '}
            <NutsAmount amount={creator?.coins_earned || 0} size={12} showLabel />
          </p>
        </div>
        <div className={`mm-creator-hub__session${hasSession ? ' on' : ''}`}>
          {hasSession ? 'Secure session' : 'Re-login required'}
        </div>
      </header>

      {!hasSession && (
        <p className="mm-creator-hub__warn">
          Your secure creator session expired. Log in again before Create Live or payouts.
        </p>
      )}

      <div className="mm-creator-hub__grid">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`mm-creator-hub__card ${ACCENT[a.accent] || ''} ${a.primary ? 'mm-creator-hub__card--primary' : ''}`}
            onClick={() => onAction?.(a.id)}
          >
            {a.primary && <span className="mm-creator-hub__live-dot" aria-hidden />}
            <strong>{a.title}</strong>
            <span>{a.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
