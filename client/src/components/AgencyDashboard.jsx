import { useEffect, useState } from 'react';
import { API_BASE } from '../config/apiBase';
import { NutsAmount, NutsSymbol } from './NutsSymbol';
import { formatNuts, nutsToUsd } from '../utils/nutsDisplay';

const STORAGE_KEY = 'mm_agency_key';

function agencyHeaders(key) {
  return { 'Content-Type': 'application/json', 'x-agency-key': key };
}

/**
 * Separate Agency ops console — creators, payouts, lives, audio, Nuts.
 */
export default function AgencyDashboard() {
  const [key, setKey] = useState(() => {
    try { return sessionStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
  });
  const [inputKey, setInputKey] = useState('');
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [creators, setCreators] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [lives, setLives] = useState([]);
  const [channels, setChannels] = useState([]);
  const [settings, setSettings] = useState(null);
  const [nutsInfo, setNutsInfo] = useState(null);
  const [error, setError] = useState('');
  const [adjustUser, setAdjustUser] = useState('');
  const [adjustDelta, setAdjustDelta] = useState('');
  const [msg, setMsg] = useState('');

  const authed = !!key;

  const load = async (k = key) => {
    if (!k) return;
    setError('');
    try {
      const [o, c, l, a, s, n] = await Promise.all([
        fetch(`${API_BASE}/api/agency/overview`, { headers: agencyHeaders(k) }),
        fetch(`${API_BASE}/api/agency/creators`, { headers: agencyHeaders(k) }),
        fetch(`${API_BASE}/api/agency/lives`, { headers: agencyHeaders(k) }),
        fetch(`${API_BASE}/api/agency/audio`, { headers: agencyHeaders(k) }),
        fetch(`${API_BASE}/api/agency/settings`, { headers: agencyHeaders(k) }),
        fetch(`${API_BASE}/api/agency/nuts`, { headers: agencyHeaders(k) }),
      ]);
      if (o.status === 401) {
        setKey('');
        sessionStorage.removeItem(STORAGE_KEY);
        setError('Unauthorized');
        return;
      }
      const oj = await o.json();
      const cj = await c.json();
      const lj = await l.json();
      const aj = await a.json();
      const sj = await s.json();
      const nj = await n.json();
      setOverview(oj.overview || null);
      setLives(oj.lives || lj.lives || []);
      setCreators(cj.creators || []);
      setWithdrawals(cj.withdrawals || []);
      setChannels(aj.channels || []);
      setSettings(sj.settings || null);
      setNutsInfo(nj);
    } catch {
      setError('Failed to load agency data');
    }
  };

  useEffect(() => {
    if (authed) load();
    const t = setInterval(() => { if (authed) load(); }, 12000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, tab]);

  const login = (e) => {
    e.preventDefault();
    const k = inputKey.trim();
    if (!k) return;
    try { sessionStorage.setItem(STORAGE_KEY, k); } catch { /* */ }
    setKey(k);
  };

  const post = async (path, body) => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: agencyHeaders(key),
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error || 'Action failed');
      return null;
    }
    setMsg('Saved');
    setTimeout(() => setMsg(''), 2000);
    await load();
    return data;
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
        <form onSubmit={login} className="w-full max-w-sm space-y-4 border border-white/10 rounded-2xl p-6 bg-black/40">
          <div className="flex items-center gap-2">
            <NutsSymbol size={28} />
            <h1 className="text-xl font-black">Agency</h1>
          </div>
          <p className="text-xs text-white/40">Creators · Lives · Audio · Nuts payouts</p>
          <input
            className="mm-audio-id-input"
            type="password"
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            placeholder="Agency key"
            autoFocus
          />
          {error && <p className="text-rose-300 text-xs">{error}</p>}
          <button type="submit" className="mm-btn mm-btn--primary w-full">Enter Agency</button>
          <a href="/" className="block text-center text-xs text-white/40">← Home</a>
        </form>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'creators', label: 'Creators' },
    { id: 'payouts', label: 'Payouts' },
    { id: 'lives', label: 'Lives' },
    { id: 'audio', label: 'Audio' },
    { id: 'nuts', label: 'Nuts' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-slate-100 flex flex-col lg:flex-row">
      <aside className="lg:w-56 border-b lg:border-b-0 lg:border-r border-white/10 p-4 shrink-0">
        <div className="flex items-center gap-2 mb-6">
          <NutsSymbol size={22} />
          <span className="font-black">Agency</span>
        </div>
        <nav className="flex lg:flex-col gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`text-left px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide ${
                tab === t.id ? 'bg-amber-500/20 text-amber-200' : 'text-white/40 hover:bg-white/5'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="mt-6 text-[10px] text-white/30"
          onClick={() => { sessionStorage.removeItem(STORAGE_KEY); setKey(''); }}
        >
          Sign out
        </button>
        <a href="/matrix-admin" className="block mt-2 text-[10px] text-cyan-400/60">Platform admin →</a>
      </aside>

      <main className="flex-1 p-4 lg:p-8 overflow-auto">
        {msg && <p className="text-emerald-300 text-xs mb-3">{msg}</p>}
        {error && <p className="text-rose-300 text-xs mb-3">{error}</p>}

        {tab === 'overview' && overview && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              ['Active lives', overview.activeLives],
              ['Live viewers', overview.liveViewers],
              ['Audio rooms', overview.audioRooms],
              ['Pending creators', overview.pendingCreators],
              ['Pending payouts', overview.pendingWithdrawals],
              ['Go-live policy', overview.liveGoLivePolicy],
            ].map(([label, val]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[10px] uppercase tracking-widest text-white/35">{label}</p>
                <p className="text-2xl font-black mt-1">{val}</p>
              </div>
            ))}
            <div className="col-span-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="text-[10px] uppercase text-amber-200/60">Payout rate</p>
              <p className="text-lg font-black mt-1 flex items-center gap-2">
                <NutsSymbol size={20} /> {formatNuts(overview.nutsPerUsd)} Nuts = $1
              </p>
            </div>
          </div>
        )}

        {tab === 'creators' && (
          <div className="space-y-2">
            {creators.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 justify-between border border-white/10 rounded-xl p-3">
                <div>
                  <p className="font-bold">@{c.handle_name}</p>
                  <p className="text-[10px] text-white/40">{c.status} · earned {formatNuts(c.coins_earned)} Nuts (${nutsToUsd(c.coins_earned)})</p>
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
                <p className="font-bold text-sm">{w.creator_id} · {w.status}</p>
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

        {tab === 'audio' && (
          <div className="space-y-2">
            {channels.map((ch) => (
              <div key={ch.id} className="border border-white/10 rounded-xl p-3 text-sm">
                <p className="font-bold">{ch.topic || ch.id}</p>
                <p className="text-[10px] text-white/40">{ch.members?.length ?? ch.members ?? 0} members</p>
              </div>
            ))}
            {!channels.length && <p className="text-white/40 text-sm">No audio rooms</p>}
          </div>
        )}

        {tab === 'nuts' && nutsInfo && (
          <div className="space-y-4">
            <p className="text-sm text-white/60">{nutsInfo.packages?.length || 0} packages · {nutsInfo.gifts?.length || 0} gifts</p>
            <div className="grid gap-2 md:grid-cols-2">
              {(nutsInfo.packages || []).map((p) => (
                <div key={p.id} className="border border-white/10 rounded-xl p-3 flex items-center gap-2">
                  <span>{p.icon}</span>
                  <div>
                    <p className="font-bold text-sm">{p.name}</p>
                    <p className="text-[10px] text-white/40"><NutsAmount amount={p.coins} size={12} /> · ${p.priceUsd}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="border border-white/10 rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold uppercase text-white/40">Adjust wallet</p>
              <input className="mm-audio-id-input" placeholder="username" value={adjustUser} onChange={(e) => setAdjustUser(e.target.value)} />
              <input className="mm-audio-id-input" placeholder="delta (+/- Nuts)" value={adjustDelta} onChange={(e) => setAdjustDelta(e.target.value)} />
              <button
                type="button"
                className="mm-btn mm-btn--primary w-full"
                onClick={() => post('/api/agency/nuts/adjust', { username: adjustUser, delta: Number(adjustDelta) })}
              >
                Apply
              </button>
            </div>
          </div>
        )}

        {tab === 'settings' && settings && (
          <div className="space-y-4 max-w-md">
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
