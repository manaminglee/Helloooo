import { useEffect, useState } from 'react';
import { API_BASE } from '../config/apiBase';

const EMPTY = {
  id: '', name: '', cost: '', category: 'luxury', rarity: 'epic',
  renderType: 'css', scene: '', thumbnailUrl: '', previewUrl: '',
  celebrationUrl: '', soundUrl: '', durationMs: 3500, enabled: true,
};

export function AdminGiftManager({ adminKey }) {
  const [gifts, setGifts] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const res = await fetch(`${API_BASE}/api/admin/gifts`, { headers: { 'x-admin-key': adminKey } });
    if (!res.ok) return;
    const data = await res.json();
    setGifts(data.gifts || []);
  };

  useEffect(() => { if (adminKey) load(); }, [adminKey]);

  const save = async () => {
    setMsg('');
    const res = await fetch(`${API_BASE}/api/admin/gifts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        ...form,
        cost: Number(form.cost),
        durationMs: Number(form.durationMs) || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(data.error || 'Save failed'); return; }
    setMsg('Saved');
    setForm(EMPTY);
    load();
  };

  const disable = async (id) => {
    await fetch(`${API_BASE}/api/admin/gifts/disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ id }),
    });
    load();
  };

  return (
    <div className="p-8 rounded-[32px] bg-white/[0.02] border border-white/5 space-y-5">
      <div>
        <h3 className="text-lg font-black italic uppercase">Gift Manager</h3>
        <p className="text-[11px] text-white/40">
          Edit price, rarity, render type, and optional asset URLs. Video is not required — gifts already play in-app 3D/CSS.
          Drop a WebM later under <code>/gifts/</code> if you want. Disable instead of deleting.
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {['id', 'name', 'cost', 'category', 'rarity', 'renderType', 'scene', 'durationMs', 'thumbnailUrl', 'previewUrl', 'celebrationUrl', 'soundUrl'].map((k) => (
          <input
            key={k}
            value={form[k] ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
            placeholder={k}
            className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white outline-none"
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={save} className="px-4 py-2 rounded-xl bg-amber-500 text-black text-[10px] font-black uppercase">Save gift</button>
        {msg && <span className="text-[11px] text-amber-300 self-center">{msg}</span>}
      </div>
      <div className="max-h-72 overflow-y-auto space-y-2">
        {gifts.map((g) => (
          <button
            key={g.id}
            type="button"
            className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded-xl bg-black/30 border border-white/5"
            onClick={() => setForm({
              id: g.id, name: g.name, cost: g.cost, category: g.category, rarity: g.rarity,
              renderType: g.renderType, scene: g.scene, thumbnailUrl: g.thumbnailUrl || '',
              previewUrl: g.previewUrl || '', celebrationUrl: g.celebrationUrl || '',
              soundUrl: g.soundUrl || '', durationMs: g.durationMs || 3500, enabled: g.enabled !== false,
            })}
          >
            <span className="text-[11px] text-white/80 truncate">{g.name} · {g.id} · {g.cost} · {g.renderType}{g.enabled === false ? ' · OFF' : ''}</span>
            <span
              className="text-[9px] font-black uppercase text-rose-300"
              onClick={(e) => { e.stopPropagation(); disable(g.id); }}
            >
              Disable
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default AdminGiftManager;
