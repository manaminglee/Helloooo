import { useEffect, useState } from 'react';

/**
 * Shown when the server has paused matching for this device after reports.
 *
 * What this screen is trying to get right:
 *
 *   · **Say it plainly.** The alternative — leaving them on "finding a
 *     stranger…" forever — is how a product teaches people it is broken.
 *   · **Show the clock.** A pause with a visible end is a consequence; a pause
 *     with no end reads as a permanent ban and gets rage-uninstalled.
 *   · **Don't accuse.** Reports can be wrong, and IPs and devices are shared.
 *     It states what happened (other people reported this device) without
 *     asserting the person is guilty of anything.
 *   · **Leave a door open.** A wrongly suspended person needs somewhere to go,
 *     so the appeal route is on the screen rather than buried in a help page.
 */

function formatLeft(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function MatchSuspendedNotice({ suspension, onAppeal, onBack }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!suspension) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [suspension]);

  if (!suspension) return null;
  const left = suspension.until - now;
  if (left <= 0) return null;

  return (
    <div className="mm-suspend" role="alert">
      <div className="mm-suspend__card">
        <div className="mm-suspend__clock" aria-hidden>
          <svg viewBox="0 0 48 48" width="52" height="52">
            <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(251,146,60,.28)" strokeWidth="3" />
            <path d="M24 12v13l8 5" fill="none" stroke="#fb923c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h3 className="mm-suspend__title">Matching is paused</h3>

        <p className="mm-suspend__body">
          Other people reported this device, so we&apos;ve paused new matches for a
          while. Nothing else is affected — your chats, coins and account are
          untouched.
        </p>

        <div className="mm-suspend__timer">
          <span className="mm-suspend__timer-label">Matching resumes in</span>
          <span className="mm-suspend__timer-value">{formatLeft(left)}</span>
        </div>

        {suspension.strikes > 1 && (
          <p className="mm-suspend__note">
            This has happened before, so the pause is longer this time.
          </p>
        )}

        <div className="mm-suspend__actions">
          {onAppeal && (
            <button type="button" className="mm-suspend__btn" onClick={onAppeal}>
              This wasn&apos;t me — get in touch
            </button>
          )}
          {onBack && (
            <button type="button" className="mm-suspend__btn mm-suspend__btn--ghost" onClick={onBack}>
              Back
            </button>
          )}
        </div>

        <p className="mm-suspend__fine">
          Reports can be wrong, and devices get shared. If you think this is a
          mistake, tell us and a person will look.
        </p>
      </div>
    </div>
  );
}

export default MatchSuspendedNotice;
