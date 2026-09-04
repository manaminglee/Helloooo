import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../config/apiBase';
import { NutsAmount, NutsSymbol } from './NutsSymbol';
import { formatNuts, nutsToUsd } from '../utils/nutsDisplay';
import VirtualMarketPanel from './VirtualMarketPanel';

const KEY_STORAGE = 'mm_agency_key';
const SESSION_STORAGE = 'mm_agency_session';

const read = (k) => { try { return sessionStorage.getItem(k) || ''; } catch { return ''; } };
const write = (k, v) => { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch { /* private mode */ } };

/** An agency authenticates with either a issued key or a member session. */
function authHeaders({ key, session }) {
  const h = { 'Content-Type': 'application/json' };
  if (key) h['x-agency-key'] = key;
  else if (session) h['x-agency-session'] = session;
  return h;
}

const pct = (n) => `${Math.round((Number(n) || 0) * 1000) / 10}%`;

function Stat({ label, value, hint, tone = 'plain' }) {
  const tones = {
    plain: 'border-white/10 bg-white/[0.03]',
    mint: 'border-emerald-500/25 bg-emerald-500/5',
    money: 'border-amber-500/25 bg-amber-500/5',
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <p className="text-[10px] uppercase tracking-widest text-white/35">{label}</p>
      <p className="text-2xl font-black mt-1 break-words">{value}</p>
      {hint && <p className="text-[10px] text-white/35 mt-1">{hint}</p>}
    </div>
  );
}

/**
 * Agency ops console. Multi-tenant: the platform operator's key sees every
 * agency, while an agency's own key or member login sees only its own roster,
 * mint pool and commissions.
 */
export default function AgencyDashboard() {
  const [key, setKey] = useState(() => read(KEY_STORAGE));
  const [session, setSession] = useState(() => read(SESSION_STORAGE));
  const [mode, setMode] = useState('login');       // 'login' (email) | 'key'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inputKey, setInputKey] = useState('');
  const [authError, setAuthError] = useState('');
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState('overview');
  const [me, setMe] = useState(null);
  const [overview, setOverview] = useState(null);
  const [mint, setMint] = useState(null);
  const [roster, setRoster] = useState([]);
  const [invites, setInvites] = useState([]);
  const [members, setMembers] = useState([]);
  const [earnings, setEarnings] = useState(null);
  const [creators, setCreators] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [lives, setLives] = useState([]);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [sellUser, setSellUser] = useState('');
  const [sellNuts, setSellNuts] = useState('');
  const [newMember, setNewMember] = useState({ email: '', password: '', name: '', commissionPct: 0.5 });
  const [inviteLabel, setInviteLabel] = useState('');
  const [inviteMaxUses, setInviteMaxUses] = useState('');

  const authed = !!(key || session);
  const scope = me?.scope || null;
  const isSuper = scope === 'super';
  const isOwner = scope === 'owner';
  const canManageMembers = isOwner || isSuper;

  const signOut = useCallback(() => {
    write(KEY_STORAGE, '');
    write(SESSION_STORAGE, '');
    setKey('');
    setSession('');
    setMe(null);
  }, []);

  const load = useCallback(async () => {
    if (!authed) return;
    const headers = authHeaders({ key, session });
    setError('');

    const get = async (path) => {
      const res = await fetch(`${API_BASE}${path}`, { headers });
      if (res.status === 401) { signOut(); setAuthError('Session expired — sign in again.'); return null; }
      // 403 is expected for tenant-scoped callers hitting operator-only routes.
      if (!res.ok) return null;
      return res.json().catch(() => null);
    };

    try {
      const meJson = await get('/api/agency/me');
      if (!meJson) return;
      setMe(meJson);

      // Super scope with no tenant chosen only has the agency list to show.
      const tenantScoped = meJson.scope !== 'super';

      const [ov, ro, inv, mem, ea, cr, li, se] = await Promise.all([
        get('/api/agency/overview'),
        tenantScoped ? get('/api/agency/roster') : Promise.resolve(null),
        tenantScoped ? get('/api/agency/invites') : Promise.resolve(null),
        tenantScoped ? get('/api/agency/members') : Promise.resolve(null),
        tenantScoped ? get('/api/agency/earnings') : Promise.resolve(null),
        get('/api/agency/creators'),
        get('/api/agency/lives'),
        tenantScoped ? Promise.resolve(null) : get('/api/agency/settings'),
      ]);

      if (ov) { setOverview(ov.overview || null); setMint(ov.mint || null); }
      if (ro) setRoster(ro.creators || []);
      if (inv) setInvites(inv.invites || []);
      if (mem) setMembers(mem.members || []);
      if (ea) setEarnings(ea);
      if (cr) { setCreators(cr.creators || []); setWithdrawals(cr.withdrawals || []); }
      if (li) setLives(li.lives || []);
      if (se) setSettings(se.settings || null);
    } catch {
      setError('Failed to load agency data');
    }
  }, [authed, key, session, signOut]);

  useEffect(() => {
    load();
    // The mint drips continuously, so the pool figure needs refreshing.
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const post = async (path, body) => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: authHeaders({ key, session }),
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg('');
      setError(data.error || 'Action failed');
      setTimeout(() => setError(''), 4000);
      return null;
    }
    setError('');
    setMsg('Saved');
    setTimeout(() => setMsg(''), 2000);
    await load();
    return data;
  };

  const submitLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setBusy(true);
    try {
      if (mode === 'key') {
        const k = inputKey.trim();
        if (!k) return;
        write(KEY_STORAGE, k);
        write(SESSION_STORAGE, '');
        setSession('');
        setKey(k);
        return;
      }
      const res = await fetch(`${API_BASE}/api/agency/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) {
        setAuthError(data.error || 'Invalid email or password');
        return;
      }
      write(SESSION_STORAGE, data.token);
      write(KEY_STORAGE, '');
      setKey('');
      setSession(data.token);
      setPassword('');
    } catch {
      setAuthError('Could not reach the server');
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = (code) => {
    const url = `${window.location.origin}/?creator=1&invite=${code}`;
    navigator.clipboard?.writeText(url).then(
      () => { setMsg('Invite link copied'); setTimeout(() => setMsg(''), 2000); },
      () => { setError('Could not copy — link is ' + url); },
    );
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
        <form onSubmit={submitLogin} className="w-full max-w-sm space-y-4 border border-white/10 rounded-2xl p-6 bg-black/40">
          <div className="flex items-center gap-2">
            <NutsSymbol size={28} />
            <h1 className="text-xl font-black">Agency</h1>
          </div>
          <p className="text-xs text-white/40">Creators · Invites · Mint · Commissions</p>

          <div className="flex gap-1 p-1 rounded-xl bg-white/5">
            {[['login', 'Email login'], ['key', 'Agency key']].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => { setMode(id); setAuthError(''); }}
                className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg ${
                  mode === id ? 'bg-amber-500/20 text-amber-200' : 'text-white/40'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'login' ? (
            <>
              <input
                className="mm-audio-id-input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@agency.com"
              />
              <input
                className="mm-audio-id-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
              />
            </>
          ) : (
            <input
              className="mm-audio-id-input"
              type="password"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              placeholder="agk_…"
            />
          )}

          {authError && <p className="text-rose-300 text-xs">{authError}</p>}
          <button type="submit" className="mm-btn mm-btn--primary w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Enter Agency'}
          </button>
          <a href="/" className="block text-center text-xs text-white/40">← Home</a>
        </form>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'roster', label: 'Roster', tenant: true },
    { id: 'invites', label: 'Invites', tenant: true },
    { id: 'members', label: 'Members', tenant: true },
    { id: 'mint', label: 'Mint', tenant: true },
    { id: 'earnings', label: 'Earnings', tenant: true },
    { id: 'market', label: 'Market' },
    { id: 'creators', label: 'Creators' },
    { id: 'payouts', label: 'Payouts' },
    { id: 'lives', label: 'Lives' },
    { id: 'settings', label: 'Settings', superOnly: true },
  ].filter((t) => {
    if (t.superOnly) return isSuper;
    if (t.tenant) return !isSuper || !!me?.agency;
    return true;
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-slate-100 flex flex-col lg:flex-row">
      <aside className="lg:w-56 border-b lg:border-b-0 lg:border-r border-white/10 p-4 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <NutsSymbol size={22} />
          <span className="font-black">Agency</span>
        </div>
        <p className="text-[10px] text-white/35 mb-5 truncate">
          {isSuper ? 'Platform operator' : me?.agency?.name}
          {me?.member ? ` · ${me.member.name} (${me.member.role})` : ''}
        </p>
        <nav className="flex lg:flex-col gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`text-left px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide whitespace-nowrap ${
                tab === t.id ? 'bg-amber-500/20 text-amber-200' : 'text-white/40 hover:bg-white/5'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button type="button" className="mt-6 text-[10px] text-white/30" onClick={signOut}>Sign out</button>
        {isSuper && <a href="/matrix-admin" className="block mt-2 text-[10px] text-cyan-400/60">Platform admin →</a>}
      </aside>

      <main className="flex-1 p-4 lg:p-8 overflow-auto">
        {msg && <p className="text-emerald-300 text-xs mb-3">{msg}</p>}
        {error && <p className="text-rose-300 text-xs mb-3">{error}</p>}

        {isSuper && !me?.agency && me?.agencies && (
          <div className="mb-6 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <p className="text-[10px] uppercase tracking-widest text-cyan-200/60 mb-2">
              {me.agencies.length} agencies on the platform
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {me.agencies.map((a) => (
                <div key={a.id} className="rounded-xl border border-white/10 p-3 text-xs">
                  <p className="font-bold">{a.name} <span className="text-white/30">· {a.status}</span></p>
                  <p className="text-white/40 mt-1">
                    {a.creatorCount} creators · {a.memberCount} members · commission {pct(a.commissionPct)}
                  </p>
                  <p className="text-white/40">
                    earned {formatNuts(a.commissionEarnedNuts)} Nuts · sold {formatNuts(a.nutsSold)} Nuts
                  </p>
                </div>
              ))}
              {!me.agencies.length && (
                <p className="text-white/40 text-xs">
                  None yet — create one from the platform admin panel.
                </p>
              )}
            </div>
          </div>
        )}

        {tab === 'overview' && overview && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat label="Active lives" value={overview.activeLives} />
            <Stat label="Live viewers" value={overview.liveViewers} />
            <Stat label="Creators" value={overview.creatorCount ?? roster.length} />
            <Stat label="Pending creators" value={overview.pendingCreators} />
            <Stat label="Pending payouts" value={overview.pendingWithdrawals} />
            <Stat label="Go-live policy" value={overview.liveGoLivePolicy} />
            {mint && (
              <Stat
                tone="mint"
                label="Mint pool"
                value={<span className="flex items-center gap-2"><NutsSymbol size={20} /> {formatNuts(mint.poolNuts)}</span>}
                hint={`+${formatNuts(mint.perMinute)} / min · ${formatNuts(mint.dailyAllowance)} / day`}
              />
            )}
            {me?.agency && (
              <Stat
                tone="money"
                label="Commission earned"
                value={<span className="flex items-center gap-2"><NutsSymbol size={20} /> {formatNuts(me.agency.commissionEarnedNuts)}</span>}
                hint={`${pct(me.agency.commissionPct)} of the platform cut`}
              />
            )}
            <Stat
              tone="money"
              label="Payout rate"
              value={`${formatNuts(overview.nutsPerUsd)} = $1`}
            />
            <div className="col-span-2 md:col-span-3">
              <VirtualMarketPanel mode="agency" username="agency" />
            </div>
          </div>
        )}

        {tab === 'roster' && (
          <div className="space-y-2">
            <p className="text-xs text-white/40 mb-3">
              Creators signed to {me?.agency?.name || 'this agency'}. Commission shown is what each has generated for the agency.
            </p>
            {roster.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border border-white/10 rounded-xl p-3">
                <div className="min-w-0">
                  <p className="font-bold truncate">
                    @{c.handle}
                    <span className={`ml-2 text-[10px] font-normal ${c.status === 'approved' ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {c.status}
                    </span>
                  </p>
                  <p className="text-[10px] text-white/40">
                    earned {formatNuts(c.coinsEarned)} Nuts (${nutsToUsd(c.coinsEarned)}) · {c.followers} followers
                    {c.recruiter ? ` · via ${c.recruiter.name}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest text-white/30">Commission</p>
                  <p className="font-black text-sm flex items-center gap-1 justify-end">
                    <NutsSymbol size={13} /> {formatNuts(c.commissionGeneratedNuts)}
                  </p>
                </div>
              </div>
            ))}
            {!roster.length && (
              <p className="text-white/40 text-sm">
                No creators yet — send an invite link from the Invites tab.
              </p>
            )}
          </div>
        )}

        {tab === 'invites' && (
          <div className="space-y-4 max-w-2xl">
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-200/70">New invite</p>
              <p className="text-[11px] text-white/45">
                Anyone who registers with this code is approved instantly and can go live right away.
                Commission on them is credited to whoever created the code.
              </p>
              <input
                className="mm-audio-id-input"
                placeholder="Label (e.g. Instagram campaign)"
                value={inviteLabel}
                onChange={(e) => setInviteLabel(e.target.value)}
              />
              <input
                className="mm-audio-id-input"
                type="number"
                min="0"
                placeholder="Max uses (blank = unlimited)"
                value={inviteMaxUses}
                onChange={(e) => setInviteMaxUses(e.target.value)}
              />
              <button
                type="button"
                className="mm-btn mm-btn--primary w-full"
                onClick={async () => {
                  const created = await post('/api/agency/invites', {
                    label: inviteLabel,
                    maxUses: Number(inviteMaxUses) || 0,
                  });
                  if (created?.ok) { setInviteLabel(''); setInviteMaxUses(''); }
                }}
              >
                Create invite code
              </button>
            </div>

            {invites.map((i) => (
              <div key={i.code} className={`border rounded-xl p-3 ${i.active ? 'border-white/10' : 'border-white/5 opacity-50'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-black tracking-[0.2em] text-lg">{i.code}</p>
                    <p className="text-[10px] text-white/40">
                      {i.label || 'no label'} · {i.uses} used
                      {i.maxUses ? ` / ${i.maxUses}` : ' · unlimited'}
                      {i.recruiter ? ` · ${i.recruiter.name}` : ''}
                      {i.expiresAt ? ` · expires ${new Date(i.expiresAt).toLocaleDateString()}` : ''}
                      {!i.active ? ' · inactive' : ''}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" className="mm-btn mm-btn--ghost text-[10px] px-2 py-1" onClick={() => copyInvite(i.code)}>
                      Copy link
                    </button>
                    {i.active && (
                      <button
                        type="button"
                        className="mm-btn mm-btn--ghost text-[10px] px-2 py-1 text-rose-300"
                        onClick={() => post(`/api/agency/invites/${i.code}/revoke`, {})}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {!invites.length && <p className="text-white/40 text-sm">No invite codes yet</p>}
          </div>
        )}

        {tab === 'members' && (
          <div className="space-y-4 max-w-2xl">
            {canManageMembers && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-white/40">Add member</p>
                <p className="text-[11px] text-white/45">
                  Members get their own login and earn commission on creators they recruit.
                </p>
                <input className="mm-audio-id-input" placeholder="Name" value={newMember.name}
                  onChange={(e) => setNewMember({ ...newMember, name: e.target.value })} />
                <input className="mm-audio-id-input" type="email" placeholder="Email" value={newMember.email}
                  onChange={(e) => setNewMember({ ...newMember, email: e.target.value })} />
                <input className="mm-audio-id-input" type="password" placeholder="Password (min 10 chars)" value={newMember.password}
                  onChange={(e) => setNewMember({ ...newMember, password: e.target.value })} />
                <label className="block text-[11px] text-white/50">
                  Their share of commission on their own recruits: {pct(newMember.commissionPct)}
                  <input type="range" min="0" max="1" step="0.05" className="w-full mt-1"
                    value={newMember.commissionPct}
                    onChange={(e) => setNewMember({ ...newMember, commissionPct: Number(e.target.value) })} />
                </label>
                <button
                  type="button"
                  className="mm-btn mm-btn--primary w-full"
                  onClick={async () => {
                    const created = await post('/api/agency/members', newMember);
                    if (created?.ok) setNewMember({ email: '', password: '', name: '', commissionPct: 0.5 });
                  }}
                >
                  Add member
                </button>
              </div>
            )}

            {members.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 border border-white/10 rounded-xl p-3">
                <div>
                  <p className="font-bold">
                    {m.name}
                    <span className="ml-2 text-[10px] font-normal text-white/35">{m.role} · {m.status}</span>
                  </p>
                  <p className="text-[10px] text-white/40">
                    {m.email} · {m.recruitedCount} recruits · {pct(m.commissionPct)} share
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-widest text-white/30">Earned</p>
                    <p className="font-black text-sm flex items-center gap-1 justify-end">
                      <NutsSymbol size={13} /> {formatNuts(m.earnedNuts)}
                    </p>
                  </div>
                  {canManageMembers && m.role !== 'owner' && (
                    <button
                      type="button"
                      className="mm-btn mm-btn--ghost text-[10px] px-2 py-1"
                      onClick={() => post(`/api/agency/members/${m.id}`, {
                        status: m.status === 'active' ? 'disabled' : 'active',
                      })}
                    >
                      {m.status === 'active' ? 'Disable' : 'Enable'}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!members.length && <p className="text-white/40 text-sm">No members</p>}
          </div>
        )}

        {tab === 'mint' && mint && (
          <div className="space-y-4 max-w-2xl">
            <div className="grid grid-cols-2 gap-3">
              <Stat
                tone="mint"
                label="Pool available"
                value={<span className="flex items-center gap-2"><NutsSymbol size={20} /> {formatNuts(mint.poolNuts)}</span>}
                hint={mint.poolValueInr != null ? `≈ ₹${mint.poolValueInr}` : `cap ${formatNuts(mint.poolCap)}`}
              />
              <Stat label="Minting now" value={`+${formatNuts(mint.perMinute)} / min`} hint="drips continuously" />
              <Stat label="Today's allowance" value={formatNuts(mint.dailyAllowance)} hint={`${formatNuts(mint.remainingToday)} left to accrue today`} />
              <Stat
                label="Tomorrow's allowance"
                value={formatNuts(mint.nextDailyAllowance)}
                hint={`grows ${pct(mint.growthPct)} per day`}
              />
              <Stat label="Minted all-time" value={formatNuts(mint.mintedTotal)} hint={`over ${mint.daysElapsed} days`} />
              <Stat label="Sold all-time" value={formatNuts(mint.soldNuts)} />
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-white/40">Sell Nuts to a user</p>
              <p className="text-[11px] text-white/45">
                Moves Nuts out of your pool straight into that user&apos;s wallet. Collect payment your own way.
              </p>
              <input className="mm-audio-id-input" placeholder="Username" value={sellUser}
                onChange={(e) => setSellUser(e.target.value)} />
              <input className="mm-audio-id-input" type="number" min="1" placeholder="How many Nuts" value={sellNuts}
                onChange={(e) => setSellNuts(e.target.value)} />
              {Number(sellNuts) > 0 && (
                <p className="text-[11px] text-white/45">
                  ≈ ${nutsToUsd(Number(sellNuts))} · leaves {formatNuts(Math.max(0, mint.poolNuts - Number(sellNuts)))} in the pool
                </p>
              )}
              <button
                type="button"
                className="mm-btn mm-btn--primary w-full"
                disabled={!sellUser.trim() || !(Number(sellNuts) > 0) || Number(sellNuts) > mint.poolNuts}
                onClick={async () => {
                  const done = await post('/api/agency/mint/sell', {
                    username: sellUser.trim(),
                    nuts: Number(sellNuts),
                  });
                  if (done?.ok) { setSellUser(''); setSellNuts(''); }
                }}
              >
                {Number(sellNuts) > mint.poolNuts ? 'Not enough in the pool' : 'Sell Nuts'}
              </button>
            </div>
          </div>
        )}

        {tab === 'earnings' && earnings && (
          <div className="space-y-4 max-w-3xl">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat tone="money" label="Total earned" value={formatNuts(earnings.totalNuts)}
                hint={earnings.totalInr != null ? `≈ ₹${earnings.totalInr}` : null} />
              <Stat label="Member commission" value={formatNuts(earnings.totals.commission)} />
              <Stat label="Owner override" value={formatNuts(earnings.totals.ownerOverride)} />
              <Stat label="Agency share" value={formatNuts(earnings.totals.house)} />
            </div>
            <div className="space-y-1">
              {earnings.rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 border border-white/10 rounded-xl px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="truncate">{r.details}</p>
                    <p className="text-[10px] text-white/35">
                      {r.kind.replace('_', ' ')}
                      {r.memberName ? ` · ${r.memberName}` : ''}
                      {' · '}{new Date(r.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className={`font-black shrink-0 ${r.nuts < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                    {r.nuts < 0 ? '' : '+'}{formatNuts(r.nuts)}
                  </span>
                </div>
              ))}
              {!earnings.rows.length && (
                <p className="text-white/40 text-sm">
                  Nothing yet — commission lands here as your creators receive gifts.
                </p>
              )}
            </div>
          </div>
        )}

        {tab === 'market' && <VirtualMarketPanel mode="agency" username="agency" />}

        {tab === 'creators' && (
          <div className="space-y-4">
            {creators.filter((c) => c.status === 'pending').length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-amber-500/25 bg-amber-500/10">
                <p className="text-sm text-amber-100 font-bold">
                  {creators.filter((c) => c.status === 'pending').length} pending
                </p>
                <button
                  type="button"
                  className="mm-btn mm-btn--primary text-[10px] px-3 py-1.5"
                  onClick={() => {
                    if (!window.confirm('Approve all pending creators?')) return;
                    post('/api/agency/creators/approve-bulk', { pendingOnly: true, status: 'approved' });
                  }}
                >
                  Approve all pending
                </button>
              </div>
            )}
            {[...creators]
              .sort((a, b) => {
                const rank = (s) => (s === 'pending' ? 0 : s === 'approved' ? 1 : 2);
                return rank(a.status) - rank(b.status);
              })
              .map((c) => (
                <div key={c.id} className={`flex flex-wrap items-center gap-2 justify-between border rounded-xl p-3 ${c.status === 'pending' ? 'border-amber-500/35 bg-amber-500/5' : 'border-white/10'}`}>
                  <div>
                    <p className="font-bold">@{c.handle_name}</p>
                    <p className="text-[10px] text-white/40">
                      {c.status} · {c.email || 'no email'} · earned {formatNuts(c.coins_earned)} Nuts (${nutsToUsd(c.coins_earned)})
                      {c.agency_invite_code ? ` · invited (${c.agency_invite_code})` : ''}
                    </p>
                    {c.profile_link && (
                      <a href={c.profile_link} target="_blank" rel="noopener noreferrer" className="text-[10px] text-cyan-400 underline">Profile ↗</a>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {c.status === 'pending' && (
                      <>
                        <button type="button" className="mm-btn mm-btn--primary text-[10px] px-2 py-1" onClick={() => post('/api/agency/creators/approve', { creatorId: c.id, status: 'approved' })}>Approve</button>
                        <button type="button" className="mm-btn mm-btn--ghost text-[10px] px-2 py-1" onClick={() => post('/api/agency/creators/approve', { creatorId: c.id, status: 'rejected' })}>Reject</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            {!creators.length && <p className="text-white/40 text-sm">No creators</p>}
          </div>
        )}

        {tab === 'payouts' && (
          <div className="space-y-2">
            {withdrawals.map((w) => (
              <div key={w.id} className="border border-white/10 rounded-xl p-3">
                <p className="font-bold text-sm">{w.handle_name || w.creator_id} · {w.status}</p>
                <p className="text-xs text-white/50 flex items-center gap-1 mt-1">
                  <NutsAmount amount={w.coins_spent || w.amount} size={14} /> ≈ ${nutsToUsd(w.coins_spent || w.amount)}
                </p>
                {w.status === 'pending' && (
                  <div className="flex gap-2 mt-2">
                    <button type="button" className="mm-btn mm-btn--primary text-[10px]" onClick={() => post('/api/agency/withdrawals/status', { withdrawalId: w.id, status: 'paid' })}>Mark paid</button>
                    <button type="button" className="mm-btn mm-btn--ghost text-[10px]" onClick={() => post('/api/agency/withdrawals/status', { withdrawalId: w.id, status: 'rejected' })}>Reject</button>
                  </div>
                )}
              </div>
            ))}
            {!withdrawals.length && <p className="text-white/40 text-sm">No withdrawals</p>}
          </div>
        )}

        {tab === 'lives' && (
          <div className="space-y-2">
            {lives.map((l) => (
              <div key={l.id} className="flex items-center justify-between border border-white/10 rounded-xl p-3">
                <div>
                  <p className="font-bold">@{l.handle}</p>
                  <p className="text-[10px] text-white/40">{l.title} · {l.viewerCount} viewers · +{formatNuts(l.nutsEarned)} Nuts</p>
                </div>
                <button type="button" className="mm-btn mm-btn--ghost text-[10px] text-rose-300" onClick={() => post(`/api/agency/lives/${l.id}/end`, {})}>End</button>
              </div>
            ))}
            {lives.length >= 2 && (
              <button
                type="button"
                className="mm-btn mm-btn--primary w-full mt-2"
                onClick={() => post('/api/agency/lives/battle/start', { liveIdA: lives[0].id, liveIdB: lives[1].id })}
              >
                Start Nuts battle (top 2 lives)
              </button>
            )}
            {!lives.length && <p className="text-white/40 text-sm">No active lives</p>}
          </div>
        )}

        {tab === 'settings' && settings && (
          <div className="space-y-4 max-w-md">
            <p className="text-[11px] text-white/40">
              These are platform-wide, not per-agency.
            </p>
            <label className="block text-xs">
              Who can go live
              <select
                className="mm-audio-id-input mt-1"
                value={settings.liveGoLivePolicy}
                onChange={(e) => setSettings({ ...settings, liveGoLivePolicy: e.target.value })}
              >
                <option value="approved">Approved creators only</option>
                <option value="applied">Applied (pending + approved)</option>
              </select>
            </label>
            <label className="block text-xs">
              Nuts per $1
              <input
                className="mm-audio-id-input mt-1"
                type="number"
                value={settings.nutsPayoutPerUsd}
                onChange={(e) => setSettings({ ...settings, nutsPayoutPerUsd: Number(e.target.value) })}
              />
            </label>
            <label className="block text-xs">
              Min withdrawal Nuts
              <input
                className="mm-audio-id-input mt-1"
                type="number"
                value={settings.minWithdrawalNuts}
                onChange={(e) => setSettings({ ...settings, minWithdrawalNuts: Number(e.target.value) })}
              />
            </label>
            <button
              type="button"
              className="mm-btn mm-btn--primary w-full"
              onClick={() => post('/api/agency/settings', settings)}
            >
              Save settings
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
