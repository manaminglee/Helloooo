import React, { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../config/apiBase';

/**
 * Admin control surface for voice channels, races, economy and moderation.
 * Drop into AdminDashboard as a tab: <AdminLiveControl adminKey={adminKey} socket={socket} />
 */

const TABS = [
  { id: 'channels', label: 'Voice channels' },
  { id: 'games', label: 'Races' },
  { id: 'economy', label: 'Economy' },
  { id: 'moderation', label: 'Moderation' },
];

export function AdminLiveControl({ adminKey, socket }) {
  const [tab, setTab] = useState('channels');
  const [data, setData] = useState({ channels: [], games: null, economy: null, trust: null, audit: [] });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const authFetch = useCallback(
    async (path, options = {}) => {
      const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
          ...(options.headers || {}),
        },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    [adminKey]
  );

  const refresh = useCallback(async () => {
    if (!adminKey) return;
    try {
      const [channels, games, economy, trust, audit] = await Promise.all([
        authFetch('/api/admin/audio/channels').catch(() => ({ channels: [] })),
        authFetch('/api/admin/games').catch(() => null),
        authFetch('/api/admin/economy').catch(() => null),
        authFetch('/api/admin/moderation/trust').catch(() => null),
        authFetch('/api/admin/moderation/audit?limit=80').catch(() => ({ audit: [] })),
      ]);
      setData({
        channels: channels.channels || [],
        games,
        economy,
        trust,
        audit: audit.audit || [],
        moderationStats: audit.stats,
      });
    } catch (_) {
      setNotice('Could not load admin data.');
    }
  }, [adminKey, authFetch]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 6000);
    return () => clearInterval(id);
  }, [refresh]);

  // Live audit stream so the log updates without waiting for the poll.
  useEffect(() => {
    if (!socket) return undefined;
    const onAudit = (entry) => setData((d) => ({ ...d, audit: [entry, ...(d.audit || [])].slice(0, 80) }));
    socket.on('admin:audit', onAudit);
    return () => socket.off('admin:audit', onAudit);
  }, [socket]);

  const act = async (path, body, label) => {
    setBusy(true);
    try {
      await authFetch(path, { method: 'POST', body: JSON.stringify(body || {}) });
      setNotice(`${label} ✓`);
      refresh();
    } catch (_) {
      setNotice(`${label} failed`);
    } finally {
      setBusy(false);
      setTimeout(() => setNotice(null), 3000);
    }
  };

  const Btn = ({ onClick, tone = 'default', children }) => (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold disabled:opacity-40 ${
        tone === 'danger'
          ? 'bg-rose-500/15 text-rose-300 border border-rose-400/25'
          : 'bg-white/10 text-white/85 border border-white/12'
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              tab === t.id ? 'bg-white text-black' : 'bg-white/8 text-white/70'
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-white/40">{notice}</span>
      </div>

      {tab === 'channels' && (
        <div className="space-y-2">
          {data.channels.map((c) => (
            <div key={c.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm text-white font-semibold truncate">{c.topic}</p>
                  <p className="text-[11px] text-white/45">
                    {c.memberCount}/{c.maxMembers} · {c.speakerCount} speaking
                    {c.locked && ' · 🔒'} {c.hasActiveGame && ' · 🏎️'}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Btn onClick={() => act(`/api/admin/audio/${c.id}/action`, { action: c.locked ? 'unlock' : 'lock' }, 'Lock')}>
                    {c.locked ? 'Unlock' : 'Lock'}
                  </Btn>
                  <Btn tone="danger" onClick={() => act(`/api/admin/audio/${c.id}/action`, { action: 'destroy' }, 'Close')}>
                    Close
                  </Btn>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(c.members || []).map((m) => (
                  <span
                    key={m.socketId}
                    className="inline-flex items-center gap-1 text-[10px] bg-white/5 rounded-lg px-2 py-1 text-white/70"
                  >
                    {m.nickname} <span className="text-white/30">{m.role}</span>
                    <button
                      type="button"
                      onClick={() => act(`/api/admin/audio/${c.id}/action`, { action: 'mute', targetSocketId: m.socketId }, 'Mute')}
                      className="text-amber-300"
                    >
                      mute
                    </button>
                    <button
                      type="button"
                      onClick={() => act(`/api/admin/audio/${c.id}/action`, { action: 'kick', targetSocketId: m.socketId }, 'Kick')}
                      className="text-rose-300"
                    >
                      kick
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
          {!data.channels.length && <p className="text-sm text-white/35 py-6 text-center">No live channels.</p>}
        </div>
      )}

      {tab === 'games' && (
        <div className="space-y-2">
          {data.games?.stats && (
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Active', data.games.stats.activeGames],
                ['Played', data.games.stats.gamesPlayed],
                ['Wagered', `${data.games.stats.coinsWagered} 🪙`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[10px] uppercase tracking-wide text-white/40">{k}</p>
                  <p className="text-lg font-bold text-white">{v}</p>
                </div>
              ))}
            </div>
          )}
          {(data.games?.active || []).map((g) => (
            <div key={g.gameId} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-white">
                  {g.status} · pot {g.pot} 🪙 · {g.players.length} racers
                </p>
                <p className="text-[11px] text-white/40 truncate">{g.channelId}</p>
              </div>
              <Btn tone="danger" onClick={() => act(`/api/admin/games/${g.channelId}/cancel`, {}, 'Cancel')}>
                Cancel & refund
              </Btn>
            </div>
          ))}
          {!data.games?.active?.length && <p className="text-sm text-white/35 py-6 text-center">No active races.</p>}
        </div>
      )}

      {tab === 'economy' && data.economy && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              ['Spent', data.economy.stats.totalSpent],
              ['Earned', data.economy.stats.totalEarned],
              ['Gifts', data.economy.stats.giftsSent],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[10px] uppercase tracking-wide text-white/40">{k}</p>
                <p className="text-lg font-bold text-white">{v}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/40 mb-2">Top creators</p>
            <div className="space-y-1">
              {(data.economy.creators || []).slice(0, 10).map((c) => (
                <div key={c.ip} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
                  <span className="text-[11px] text-white/70 font-mono truncate">{c.ip}</span>
                  <span className="text-[11px] text-amber-300">{c.earned} 🪙 · {c.giftsReceived} gifts</span>
                  <select
                    value={c.tier}
                    onChange={(e) => act('/api/admin/economy/tier', { ip: c.ip, tier: e.target.value }, 'Tier')}
                    className="bg-white/8 border border-white/12 rounded px-1.5 py-0.5 text-[10px] text-white"
                  >
                    {['none', 'verified', 'creator', 'pro'].map((t) => (
                      <option key={t} value={t} className="bg-[#12151c]">
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/40 mb-2">Recent ledger</p>
            <div className="max-h-56 overflow-y-auto space-y-0.5">
              {(data.economy.journal || []).slice(0, 40).map((j, i) => (
                <div key={i} className="flex items-center justify-between text-[10px] px-2 py-1 rounded bg-white/[0.02]">
                  <span className="font-mono text-white/50 truncate">{j.ip}</span>
                  <span className="text-white/60 truncate mx-2">{j.reason}</span>
                  <span className={j.delta > 0 ? 'text-emerald-300' : 'text-rose-300'}>
                    {j.delta > 0 ? '+' : ''}
                    {j.delta}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'moderation' && (
        <div className="space-y-3">
          {data.moderationStats && (
            <div className="grid grid-cols-4 gap-2">
              {[
                ['Screened', data.moderationStats.screened],
                ['Flagged', data.moderationStats.flagged],
                ['Blocked', data.moderationStats.blocked],
                ['Bans', data.moderationStats.bans],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-white/40">{k}</p>
                  <p className="text-base font-bold text-white">{v}</p>
                </div>
              ))}
            </div>
          )}

          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/40 mb-2">Lowest trust scores</p>
            {(data.trust?.users || []).slice(0, 12).map((u) => (
              <div key={u.ip} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2 mb-1">
                <span className="text-[11px] font-mono text-white/70 truncate">{u.ip}</span>
                <span className="text-[11px] text-white/50">
                  score {u.score} · {u.strikes} strikes
                </span>
                <Btn tone="danger" onClick={() => act('/api/admin/moderation/block', { ip: u.ip, blocked: true, reason: 'Admin action' }, 'Block')}>
                  Block
                </Btn>
              </div>
            ))}
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/40 mb-2">Blocked IPs</p>
            <div className="flex flex-wrap gap-1.5">
              {(data.trust?.blockedIps || []).map((ip) => (
                <span key={ip} className="inline-flex items-center gap-1.5 text-[10px] bg-rose-500/10 border border-rose-400/20 rounded-lg px-2 py-1 text-rose-200">
                  {ip}
                  <button
                    type="button"
                    onClick={() => act('/api/admin/moderation/block', { ip, blocked: false }, 'Unblock')}
                    className="underline"
                  >
                    unblock
                  </button>
                </span>
              ))}
              {!data.trust?.blockedIps?.length && <span className="text-[11px] text-white/30">None.</span>}
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/40 mb-2">Audit log (live)</p>
            <div className="max-h-64 overflow-y-auto space-y-0.5">
              {data.audit.map((a, i) => (
                <div key={i} className="text-[10px] px-2 py-1 rounded bg-white/[0.02] flex gap-2">
                  <span className="text-white/30 shrink-0">
                    {new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="text-emerald-300/80 shrink-0">{a.action}</span>
                  <span className="text-white/45 truncate">{JSON.stringify(a.details)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminLiveControl;
