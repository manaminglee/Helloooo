import { memo, useEffect, useState } from 'react';
import { getCreatorAuthHeaders } from '../utils/creatorAuth';

const API_BASE = import.meta.env.VITE_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : '');

const perks = [
  { icon: '✓', title: 'Verified badge', desc: 'Stand out in video & text with the cyan tick' },
  { icon: '🔗', title: 'Referral link', desc: 'Earn coins when fans join through your link' },
  { icon: '💰', title: 'Payouts', desc: 'Withdraw to UPI when you hit the threshold' },
  { icon: '📊', title: 'Dashboard', desc: 'Track referrals, earnings, and profile in one place' },
];

function ReferralQrBlock({ referralCode }) {
  const [copied, setCopied] = useState(false);
  const refUrl = referralCode && typeof window !== 'undefined' ? `${window.location.origin}/?ref=${referralCode}` : '';
  const qrSrc = refUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${encodeURIComponent(refUrl)}` : '';

  const copy = () => {
    if (!refUrl) return;
    navigator.clipboard.writeText(refUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!referralCode) return null;

  return (
    <div className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-black/30 p-5 flex flex-col sm:flex-row items-center gap-6">
      {qrSrc && (
        <img src={qrSrc} alt="Referral QR" className="w-28 h-28 rounded-xl border border-white/10 bg-white p-1 shrink-0" />
      )}
      <div className="flex-1 min-w-0 text-center sm:text-left">
        <div className="text-[9px] font-black uppercase tracking-widest text-white/35 mb-2">Your referral link</div>
        <p className="text-[10px] text-violet-300/90 break-all font-mono mb-3">{refUrl}</p>
        <button type="button" onClick={copy} className="px-4 py-2 rounded-xl bg-violet-500/20 border border-violet-500/40 text-[10px] font-black uppercase text-violet-300 hover:bg-violet-500/30">
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}

function CreatorLedgerStrip({ enabled }) {
  const [activity, setActivity] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);

  useEffect(() => {
    if (!enabled) return;
    fetch(`${API_BASE}/api/creators/my-activity`, { headers: { ...getCreatorAuthHeaders() } })
      .then((r) => r.json())
      .then((d) => setActivity(d.entries || []))
      .catch(() => setActivity([]));
    fetch(`${API_BASE}/api/creators/my-withdrawals`, { headers: { ...getCreatorAuthHeaders() } })
      .then((r) => r.json())
      .then((d) => setWithdrawals(d.withdrawals || []))
      .catch(() => setWithdrawals([]));
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="w-full max-w-2xl grid sm:grid-cols-2 gap-4 text-left">
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 max-h-48 overflow-y-auto">
        <div className="text-[9px] font-black uppercase tracking-widest text-white/35 mb-2">Recent activity</div>
        {activity.length === 0 ? (
          <p className="text-[10px] text-white/25">No activity yet. Share your referral link to earn coins.</p>
        ) : (
          <ul className="space-y-2">
            {activity.slice(0, 8).map((row, i) => (
              <li key={i} className="text-[9px] text-white/50 border-b border-white/[0.04] pb-1">
                <span className="text-emerald-400/80 font-mono">{row.action || row.details || '—'}</span>
                {row.amount != null && <span className="text-amber-400/80 ml-2">{row.amount > 0 ? '+' : ''}{row.amount}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 max-h-48 overflow-y-auto">
        <div className="text-[9px] font-black uppercase tracking-widest text-white/35 mb-2">Withdrawals</div>
        {withdrawals.length === 0 ? (
          <p className="text-[10px] text-white/25">No withdrawal requests yet.</p>
        ) : (
          <ul className="space-y-2">
            {withdrawals.map((w) => (
              <li key={w.id} className="text-[9px] text-white/55 flex justify-between gap-2 border-b border-white/[0.04] pb-1">
                <span className="text-white/40">{new Date(w.created_at).toLocaleDateString()}</span>
                <span className={`font-black uppercase ${w.status === 'pending' ? 'text-amber-400' : w.status === 'paid' ? 'text-emerald-400' : 'text-white/50'}`}>
                  {w.status || 'pending'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CreatorMatrixInner({ creatorStatus, onOpenDashboard, onOpenApply, onOpenStatus, onOpenLogin, onEditProfile, onWithdraw, onLogout, showAlert }) {
  const hasAccount = !!(creatorStatus?.handle_name);
  const approved = creatorStatus?.status === 'approved';

  return (
    <section className="w-full max-w-5xl mx-auto mb-20 sm:mb-24 px-4 sm:px-6 animate-fade-in-up" aria-labelledby="creator-hub-heading">
      <div className="relative rounded-[2rem] sm:rounded-[3rem] overflow-hidden border border-white/[0.08] bg-gradient-to-b from-[#0f1419]/95 via-[#0a0d12] to-black/90 shadow-[0_40px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(167,139,250,0.12),transparent)] pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-400/40 to-transparent" />

        <div className="relative z-10 px-6 py-10 sm:px-12 sm:py-14 md:py-16">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-10 lg:gap-12">
            <div className="flex-1 text-center lg:text-left max-w-xl mx-auto lg:mx-0">
              <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/25 text-[10px] font-black text-violet-300 uppercase tracking-[0.25em] mb-5">
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse shadow-[0_0_12px_#c4b5fd]" aria-hidden />
                Creator program
              </p>
              <h3 id="creator-hub-heading" className="text-3xl sm:text-4xl md:text-5xl font-black uppercase italic tracking-tight text-white leading-[1.05] mb-4">
                Turn your audience into{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-300 via-violet-400 to-indigo-400 drop-shadow-[0_0_24px_rgba(167,139,250,0.35)]">
                  income
                </span>
              </h3>
              <p className="text-[12px] sm:text-sm font-medium text-white/45 leading-relaxed mb-8 max-w-md mx-auto lg:mx-0">
                Apply once, get a verified handle, share your referral link, and earn from the Mana economy—whether you stream, chat, or post.
              </p>

              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-center lg:justify-start gap-3">
                <button
                  type="button"
                  onClick={() => (hasAccount ? onOpenDashboard() : onOpenApply())}
                  className="min-h-[48px] px-8 py-3.5 rounded-2xl bg-white text-black font-black uppercase tracking-[0.15em] text-[11px] shadow-[0_12px_40px_rgba(255,255,255,0.12)] hover:bg-violet-300 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <span aria-hidden>⭐</span>
                  {hasAccount ? 'Open creator dashboard' : 'Apply as creator'}
                </button>
                {!hasAccount && (
                  <>
                    <button
                      type="button"
                      onClick={onOpenStatus}
                      className="min-h-[48px] px-6 py-3.5 rounded-2xl bg-white/[0.06] border border-white/10 text-white font-black uppercase tracking-[0.12em] text-[11px] hover:bg-white/10 hover:border-violet-500/30 transition-all"
                    >
                      Check status
                    </button>
                    <button
                      type="button"
                      onClick={onOpenLogin}
                      className="min-h-[48px] px-6 py-3.5 rounded-2xl bg-transparent border border-white/15 text-white/90 font-black uppercase tracking-[0.12em] text-[11px] hover:bg-white hover:text-black transition-all"
                    >
                      Creator login
                    </button>
                  </>
                )}
              </div>
            </div>

            <ul className="grid grid-cols-2 gap-3 sm:gap-4 flex-1 max-w-md mx-auto lg:max-w-none w-full lg:w-auto">
              {perks.map((p) => (
                <li
                  key={p.title}
                  className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 text-left hover:border-violet-500/20 hover:bg-violet-500/[0.04] transition-colors"
                >
                  <span className="text-lg mb-2 block" aria-hidden>{p.icon}</span>
                  <div className="text-[11px] font-black uppercase tracking-wide text-white/90 mb-1">{p.title}</div>
                  <p className="text-[10px] leading-snug text-white/35 font-medium">{p.desc}</p>
                </li>
              ))}
            </ul>
          </div>

          {hasAccount && (
            <div className="mt-10 pt-10 border-t border-white/[0.06] flex flex-col items-center gap-6">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[10px] font-black uppercase tracking-wide text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                  @{creatorStatus.handle_name}
                </span>
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-black text-amber-200/90">
                  ₹{creatorStatus.earnings_rs || 0} earned
                </span>
                <button type="button" onClick={onEditProfile} className="text-[10px] font-black uppercase tracking-widest text-violet-400/90 hover:text-white underline-offset-4 hover:underline">
                  Edit profile
                </button>
                <button type="button" onClick={onLogout} className="text-[10px] font-black uppercase tracking-widest text-rose-400/80 hover:text-rose-300">
                  Log out
                </button>
              </div>

              {approved && creatorStatus?.referral_code && (
                <ReferralQrBlock referralCode={creatorStatus.referral_code} />
              )}

              {approved && <CreatorLedgerStrip enabled />}

              {approved && (
                <div className="flex flex-col items-center gap-3 w-full max-w-sm">
                  <button
                    type="button"
                    onClick={async () => {
                      const upi = prompt('Enter UPI ID for Payout:');
                      if (upi) {
                        const res = await onWithdraw(upi);
                        if (res.error) alert(res.error);
                        else await showAlert('Transmitted', 'Withdrawal request sent to admin. Coins will be debited after verified.');
                      }
                    }}
                    className="w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-black text-[11px] font-black uppercase tracking-[0.15em] shadow-[0_16px_40px_rgba(16,185,129,0.25)] hover:brightness-110 active:scale-[0.99] transition-all"
                  >
                    Withdraw earnings
                  </button>
                  <p className="text-[9px] font-bold text-white/25 uppercase tracking-[0.2em] text-center">
                    10,000 referral coins ≈ ₹150 · Min withdrawal rules apply
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export const CreatorMatrix = memo(CreatorMatrixInner);
