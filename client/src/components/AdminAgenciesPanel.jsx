import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../config/apiBase';
import { formatNuts } from '../utils/nutsDisplay';

const pct = (n) => `${Math.round((Number(n) || 0) * 1000) / 10}%`;

const BLANK = {
  name: '',
  ownerName: '',
  ownerEmail: '',
  ownerPassword: '',
  commissionPct: 0.2,
  ownerOverridePct: 0.1,
  mintDailyAllowance: 50000,
  mintGrowthPct: 0.02,
  mintPoolCap: 5000000,
};

/**
 * Operator-side agency management: create a tenant, tune its commission and
 * mint economics, rotate its key, suspend it.
 */
export default function AdminAgenciesPanel({ adminKey }) {
  const [agencies, setAgencies] = useState([]);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(BLANK);
  // The plaintext key exists only in the create/rotate response — once this is
  // cleared it cannot be recovered, only rotated.
  const [freshKey, setFreshKey] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const headers = { 'Content-Type': 'application/json', 'x-admin-key': adminKey };

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/agencies`, { headers: { 'x-admin-key': adminKey } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setAgencies(data.agencies || []);
      else setError(data.error || 'Could not load agencies');
    } catch {
      setError('Could not reach the server');
    }
  }, [adminKey]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id) => {
    if (detail?.agency?.id === id) { setDetail(null); return; }
    const res = await fetch(`${API_BASE}/api/admin/agencies/${id}`, { headers: { 'x-admin-key': adminKey } });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setDetail(data);
  };

  const flash = (m) => { setMsg(m); setError(''); setTimeout(() => setMsg(''), 2500); };

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/agencies`, {
        method: 'POST', headers, body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { setError(data.error || 'Could not create the agency'); return; }
      setFreshKey({ name: data.agency.name, key: data.agencyKey, rotated: false });
      setForm(BLANK);
      flash('Agency created');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id, body, note) => {
    const res = await fetch(`${API_BASE}/api/admin/agencies/${id}`, {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || 'Update failed'); return; }
    flash(note || 'Updated');
    await load();
    if (detail?.agency?.id === id) {
      const d = await fetch(`${API_BASE}/api/admin/agencies/${id}`, { headers: { 'x-admin-key': adminKey } });
      if (d.ok) setDetail(await d.json());
    }
  };

  const rotate = async (a) => {
    if (!window.confirm(`Rotate the key for ${a.name}? Their current key stops working immediately.`)) return;
    const res = await fetch(`${API_BASE}/api/admin/agencies/${a.id}/rotate-key`, { method: 'POST', headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || 'Rotation failed'); return; }
    setFreshKey({ name: a.name, key: data.agencyKey, rotated: true });
    flash('Key rotated');
    await load();
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-3xl font-black italic uppercase tracking-tight">
          Agencies <span className="text-cyan-400">Tenancy</span>
        </h2>
        <p className="text-sm text-white/35 mt-2 max-w-2xl">
          Each agency manages its own creator roster, recruits with invite codes that grant instant
          live access, mints a bounded pool of sellable Nuts, and earns commission carved out of the
          platform&apos;s share of gifts — never out of the creator&apos;s share.
        </p>
      </div>

      {msg && <p className="text-emerald-300 text-xs">{msg}</p>}
      {error && <p className="text-rose-300 text-xs">{error}</p>}

      {freshKey && (
        <div className="rounded-3xl border border-amber-500/40 bg-amber-500/10 p-6">
          <p className="text-xs font-black uppercase tracking-widest text-amber-200">
            {freshKey.rotated ? 'New key for' : 'Agency key for'} {freshKey.name}
          </p>
          <p className="text-[11px] text-amber-100/70 mt-1">
            Copy this now — it is stored only as a hash and cannot be shown again. Losing it means rotating.
          </p>
          <code className="block mt-3 p-3 rounded-xl bg-black/50 text-amber-200 text-xs break-all select-all">
            {freshKey.key}
          </code>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              className="mm-btn mm-btn--primary text-[11px]"
              onClick={() => navigator.clipboard?.writeText(freshKey.key).then(() => flash('Key copied'))}
            >
              Copy key
            </button>
            <button type="button" className="mm-btn mm-btn--ghost text-[11px]" onClick={() => setFreshKey(null)}>
              I&apos;ve saved it
            </button>
          </div>
        </div>
      )}

      <form onSubmit={create} className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
        <p className="text-xs font-black uppercase tracking-widest text-white/40">Create an agency</p>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-[11px] text-white/50">
            Agency name
            <input className="mm-audio-id-input mt-1" value={form.name} required
              onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nova Talent" />
          </label>
          <label className="block text-[11px] text-white/50">
            Owner name
            <input className="mm-audio-id-input mt-1" value={form.ownerName}
              onChange={(e) => setForm({ ...form, ownerName: e.target.value })} placeholder="Priya" />
          </label>
          <label className="block text-[11px] text-white/50">
            Owner email (their login)
            <input className="mm-audio-id-input mt-1" type="email" value={form.ownerEmail} required
              onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} placeholder="owner@nova.com" />
          </label>
          <label className="block text-[11px] text-white/50">
            Owner password (min 10 chars)
            <input className="mm-audio-id-input mt-1" type="text" value={form.ownerPassword} required minLength={10}
              onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })} placeholder="share this once" />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-[11px] text-white/50">
            Commission — {pct(form.commissionPct)} of the platform cut
            <input type="range" min="0" max="0.9" step="0.05" className="w-full mt-1"
              value={form.commissionPct}
              onChange={(e) => setForm({ ...form, commissionPct: Number(e.target.value) })} />
          </label>
          <label className="block text-[11px] text-white/50">
            Owner override — {pct(form.ownerOverridePct)} of each member&apos;s commission
            <input type="range" min="0" max="1" step="0.05" className="w-full mt-1"
              value={form.ownerOverridePct}
              onChange={(e) => setForm({ ...form, ownerOverridePct: Number(e.target.value) })} />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="block text-[11px] text-white/50">
            Daily mint allowance (Nuts)
            <input className="mm-audio-id-input mt-1" type="number" min="0" value={form.mintDailyAllowance}
              onChange={(e) => setForm({ ...form, mintDailyAllowance: Number(e.target.value) })} />
            <span className="text-[10px] text-white/30">
              ≈ {formatNuts(Math.round(form.mintDailyAllowance / 1440))} / min
            </span>
          </label>
          <label className="block text-[11px] text-white/50">
            Daily growth — {pct(form.mintGrowthPct)} / day
            <input type="range" min="0" max="0.25" step="0.005" className="w-full mt-1"
              value={form.mintGrowthPct}
              onChange={(e) => setForm({ ...form, mintGrowthPct: Number(e.target.value) })} />
          </label>
          <label className="block text-[11px] text-white/50">
            Pool cap (Nuts)
            <input className="mm-audio-id-input mt-1" type="number" min="0" value={form.mintPoolCap}
              onChange={(e) => setForm({ ...form, mintPoolCap: Number(e.target.value) })} />
            <span className="text-[10px] text-white/30">hard ceiling on unsold Nuts</span>
          </label>
        </div>

        <button type="submit" className="mm-btn mm-btn--primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create agency'}
        </button>
      </form>

      <div className="space-y-3">
        {agencies.map((a) => (
          <div key={a.id} className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-black">
                  {a.name}
                  <span className={`ml-2 text-[10px] font-bold uppercase ${a.status === 'active' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {a.status}
                  </span>
                </p>
                <p className="text-[11px] text-white/40 mt-0.5">
                  {a.creatorCount} creators · {a.memberCount} members · commission {pct(a.commissionPct)} ·
                  {' '}earned {formatNuts(a.commissionEarnedNuts)} Nuts · sold {formatNuts(a.nutsSold)} Nuts
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <button type="button" className="mm-btn mm-btn--ghost text-[10px] px-2 py-1" onClick={() => openDetail(a.id)}>
                  {detail?.agency?.id === a.id ? 'Hide' : 'Inspect'}
                </button>
                <button type="button" className="mm-btn mm-btn--ghost text-[10px] px-2 py-1" onClick={() => rotate(a)}>
                  Rotate key
                </button>
                <button
                  type="button"
                  className={`mm-btn mm-btn--ghost text-[10px] px-2 py-1 ${a.status === 'active' ? 'text-rose-300' : 'text-emerald-300'}`}
                  onClick={() => patch(a.id, { status: a.status === 'active' ? 'suspended' : 'active' },
                    a.status === 'active' ? 'Agency suspended' : 'Agency reactivated')}
                >
                  {a.status === 'active' ? 'Suspend' : 'Reactivate'}
                </button>
              </div>
            </div>

            {detail?.agency?.id === a.id && (
              <div className="border-t border-white/10 p-4 space-y-4 bg-black/30">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
                  {[
                    ['Mint pool', formatNuts(detail.mint.poolNuts)],
                    ['Per minute', `+${formatNuts(detail.mint.perMinute)}`],
                    ['Today’s allowance', formatNuts(detail.mint.dailyAllowance)],
                    ['Tomorrow’s', formatNuts(detail.mint.nextDailyAllowance)],
                    ['Minted all-time', formatNuts(detail.mint.mintedTotal)],
                    ['Sold all-time', formatNuts(detail.mint.soldNuts)],
                    ['Days running', detail.mint.daysElapsed],
                    ['Commission total', formatNuts(detail.earnings?.totalNuts || 0)],
                  ].map(([l, v]) => (
                    <div key={l} className="rounded-xl border border-white/10 p-3">
                      <p className="text-[9px] uppercase tracking-widest text-white/30">{l}</p>
                      <p className="font-black mt-0.5">{v}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <label className="block text-[11px] text-white/50">
                    Commission {pct(detail.agency.commissionPct)}
                    <input type="range" min="0" max="0.9" step="0.05" className="w-full mt-1"
                      defaultValue={detail.agency.commissionPct}
                      onMouseUp={(e) => patch(a.id, { commissionPct: Number(e.target.value) }, 'Commission updated')}
                      onTouchEnd={(e) => patch(a.id, { commissionPct: Number(e.target.value) }, 'Commission updated')} />
                  </label>
                  <label className="block text-[11px] text-white/50">
                    Daily allowance
                    <input className="mm-audio-id-input mt-1" type="number" min="0"
                      defaultValue={detail.mint.dailyAllowance}
                      onBlur={(e) => patch(a.id, { mintDailyAllowance: Number(e.target.value) }, 'Allowance updated')} />
                  </label>
                  <label className="block text-[11px] text-white/50">
                    Daily growth {pct(detail.mint.growthPct)}
                    <input type="range" min="0" max="0.25" step="0.005" className="w-full mt-1"
                      defaultValue={detail.mint.growthPct}
                      onMouseUp={(e) => patch(a.id, { mintGrowthPct: Number(e.target.value) }, 'Growth updated')}
                      onTouchEnd={(e) => patch(a.id, { mintGrowthPct: Number(e.target.value) }, 'Growth updated')} />
                  </label>
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2">Members</p>
                  <div className="space-y-1">
                    {(detail.members || []).map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-[11px] border border-white/10 rounded-xl px-3 py-2">
                        <span>{m.name} <span className="text-white/30">· {m.email} · {m.role}</span></span>
                        <span className="text-white/50">{m.recruitedCount} recruits · {formatNuts(m.earnedNuts)} Nuts</span>
                      </div>
                    ))}
                    {!detail.members?.length && <p className="text-white/30 text-[11px]">No members</p>}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2">Roster</p>
                  <div className="space-y-1">
                    {(detail.creators || []).map((c) => (
                      <div key={c.id} className="flex items-center justify-between text-[11px] border border-white/10 rounded-xl px-3 py-2">
                        <span>@{c.handle} <span className="text-white/30">· {c.status}</span></span>
                        <span className="text-white/50">{formatNuts(c.commissionGeneratedNuts)} Nuts generated</span>
                      </div>
                    ))}
                    {!detail.creators?.length && <p className="text-white/30 text-[11px]">No creators signed yet</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {!agencies.length && (
          <p className="text-white/40 text-sm">No agencies yet — create the first one above.</p>
        )}
      </div>
    </div>
  );
}
