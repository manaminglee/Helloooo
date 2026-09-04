import { useEffect, useMemo, useState } from 'react';
import { useVirtualMarket } from '../hooks/useVirtualMarket';
import { API_BASE } from '../config/apiBase';

const STATUS_META = {
  NORMAL: { label: 'Normal', color: '#34d399', dot: '🟢' },
  HIGH_DEMAND: { label: 'High demand', color: '#fb923c', dot: '🟠' },
  LOW_DEMAND: { label: 'Low demand', color: '#60a5fa', dot: '🔵' },
  VOLATILE: { label: 'Volatile', color: '#f472b6', dot: '🟣' },
  PAUSED: { label: 'Stabilized', color: '#fbbf24', dot: '🟡' },
  MAINTENANCE: { label: 'Maintenance', color: '#94a3b8', dot: '⚪' },
};

function MarketSparkline({ series = [], minRate = 88, maxRate = 92, height = 140 }) {
  const pts = useMemo(() => {
    if (!series.length) return '';
    const rates = series.map((p) => Number(p.rate));
    const lo = Math.min(minRate, ...rates) - 0.05;
    const hi = Math.max(maxRate, ...rates) + 0.05;
    const span = Math.max(0.01, hi - lo);
    return series.map((p, i) => {
      const x = series.length === 1 ? 50 : (i / (series.length - 1)) * 100;
      const y = ((hi - Number(p.rate)) / span) * 100;
      return `${x},${y}`;
    }).join(' ');
  }, [series, minRate, maxRate]);

  const up = series.length > 1
    ? Number(series[series.length - 1].rate) >= Number(series[0].rate)
    : true;

  return (
    <div className="mm-vm-chart" style={{ height }}>
      <div className="mm-vm-chart__ylabels">
        <span>₹{Number(maxRate).toFixed(0)}</span>
        <span>₹{Number(minRate).toFixed(0)}</span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mm-vm-chart__svg" aria-hidden>
        <defs>
          <linearGradient id="mmVmFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? '#34d399' : '#f87171'} stopOpacity="0.35" />
            <stop offset="100%" stopColor={up ? '#34d399' : '#f87171'} stopOpacity="0" />
          </linearGradient>
        </defs>
        {pts ? (
          <>
            <polyline
              fill="none"
              stroke={up ? '#34d399' : '#f87171'}
              strokeWidth="1.2"
              vectorEffect="non-scaling-stroke"
              points={pts}
            />
            <polygon fill="url(#mmVmFill)" points={`0,100 ${pts} 100,100`} />
          </>
        ) : (
          <text x="50" y="50" textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="4">
            Collecting live history…
          </text>
        )}
      </svg>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="mm-vm__metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AdminMarketControls({ adminKey, refreshDashboard }) {
  const [cfgForm, setCfgForm] = useState(null);
  const [audit, setAudit] = useState([]);
  const [adminMsg, setAdminMsg] = useState('');

  useEffect(() => {
    if (!adminKey) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/admin/market`, {
          headers: { 'x-admin-key': adminKey },
        });
        const data = await res.json();
        if (cancelled || !data?.ok) return;
        setCfgForm({
          minRate: data.config?.minRate,
          maxRate: data.config?.maxRate,
          baseRate: data.config?.baseRate,
          sensitivity: data.config?.sensitivity,
          updateIntervalMs: data.config?.updateIntervalMs,
          maxMovePerUpdate: data.config?.maxMovePerUpdate,
          creatorPayoutPct: data.config?.creatorPayoutPct,
        });
        setAudit(data.audit || []);
      } catch { /* */ }
    })();
    return () => { cancelled = true; };
  }, [adminKey]);

  if (!cfgForm) {
    return <p className="mm-vm__muted">Loading admin market controls…</p>;
  }

  const save = async (extra = {}) => {
    setAdminMsg('');
    const res = await fetch(`${API_BASE}/api/admin/market/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ ...cfgForm, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAdminMsg(data.error || 'Save failed');
      return;
    }
    setAdminMsg('Market config saved');
    if (data.config) {
      setCfgForm((prev) => ({
        ...prev,
        minRate: data.config.minRate,
        maxRate: data.config.maxRate,
        baseRate: data.config.baseRate,
        sensitivity: data.config.sensitivity,
        updateIntervalMs: data.config.updateIntervalMs,
        maxMovePerUpdate: data.config.maxMovePerUpdate,
        creatorPayoutPct: data.config.creatorPayoutPct,
      }));
    }
    await refreshDashboard();
  };

  const setStatus = async (status) => {
    const res = await fetch(`${API_BASE}/api/admin/market/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setAdminMsg(data.error || 'Status update failed');
    else {
      setAdminMsg(`Status → ${status}`);
      await refreshDashboard();
    }
  };

  return (
    <div className="mm-vm__admin">
      <h4>Admin market controls</h4>
      <p className="mm-vm__chat-note">Every change is audit-logged. Limits are enforced server-side.</p>
      <div className="mm-vm__admin-grid">
        {[
          ['minRate', 'Min rate ₹'],
          ['maxRate', 'Max rate ₹'],
          ['baseRate', 'Base rate ₹'],
          ['sensitivity', 'Sensitivity'],
          ['updateIntervalMs', 'Update interval ms'],
          ['maxMovePerUpdate', 'Max move / tick ₹'],
          ['creatorPayoutPct', 'Creator payout (0–1)'],
        ].map(([k, label]) => (
          <label key={k}>
            <span>{label}</span>
            <input
              type="number"
              step="any"
              value={cfgForm[k] ?? ''}
              onChange={(e) => setCfgForm({ ...cfgForm, [k]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
      <div className="mm-vm__admin-actions">
        <button type="button" onClick={() => save()}>Save settings</button>
        <button type="button" onClick={() => save({ resetToBase: true })}>Reset to base</button>
        <button type="button" onClick={() => setStatus('PAUSED')}>Pause adjustments</button>
        <button type="button" onClick={() => setStatus('NORMAL')}>Resume normal</button>
        <button type="button" onClick={() => setStatus('MAINTENANCE')}>Maintenance</button>
      </div>
      {adminMsg && <p className="mm-vm__admin-msg">{adminMsg}</p>}
      {audit.length > 0 && (
        <div className="mm-vm__audit">
          <h5>Recent audit</h5>
          <ul>
            {audit.slice(0, 8).map((a) => (
              <li key={a.id}>
                <code>{a.action}</code>
                <span>{new Date(a.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Live virtual economy terminal — creator / agency / admin.
 * Displays Platform Virtual Economy Rate only (not real FX).
 */
export default function VirtualMarketPanel({
  mode = 'creator',
  username = 'Guest',
  adminKey = '',
  compact = false,
  className = '',
}) {
  const {
    rate,
    dashboard,
    loading,
    error,
    range,
    setRange,
    ranges,
    postChat,
    formatUpdatedAgo,
    refreshDashboard,
  } = useVirtualMarket({ enabled: true });

  const [chatText, setChatText] = useState('');
  const [chatErr, setChatErr] = useState('');

  const status = STATUS_META[rate?.marketStatus] || STATUS_META.NORMAL;
  const series = dashboard?.series || [];
  const volumes = dashboard?.volumes || {};
  const insights = dashboard?.insights || [];
  const chat = dashboard?.chat || [];
  const topGifters = dashboard?.topGifters || [];
  const recentGifts = dashboard?.recentGifts || [];

  return (
    <div className={`mm-vm ${compact ? 'mm-vm--compact' : ''} ${className}`.trim()}>
      <header className="mm-vm__head">
        <div>
          <p className="mm-vm__eyebrow">Live market · in-app virtual economy</p>
          <h3 className="mm-vm__title">
            {rate ? (
              <>
                $1 = <span className="mm-vm__rate">₹{Number(rate.rate).toFixed(2)}</span>
              </>
            ) : (
              loading ? 'Loading rate…' : 'Market offline'
            )}
          </h3>
          {rate && (
            <p className={`mm-vm__change ${rate.change >= 0 ? 'up' : 'down'}`}>
              {rate.change >= 0 ? '▲' : '▼'}{' '}
              {rate.change >= 0 ? '+' : ''}₹{Number(rate.change).toFixed(2)}
              {' · '}
              {rate.changePercent >= 0 ? '+' : ''}{Number(rate.changePercent).toFixed(2)}%
              <span className="mm-vm__ago"> · Updated {formatUpdatedAgo()}</span>
            </p>
          )}
        </div>
        <div className="mm-vm__status" style={{ borderColor: `${status.color}44`, color: status.color }}>
          <span>{status.dot}</span> {status.label}
        </div>
      </header>

      <p className="mm-vm__disclaimer">
        {rate?.disclaimer
          || 'Platform Virtual Economy Rate — not a real currency exchange or investment product.'}
      </p>

      {error && <p className="mm-vm__error">{error}</p>}

      {!compact && (
        <>
          <div className="mm-vm__ranges">
            {ranges.map((r) => (
              <button
                key={r}
                type="button"
                className={range === r ? 'on' : ''}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>

          <MarketSparkline
            series={series}
            minRate={rate?.minRate ?? 88}
            maxRate={rate?.maxRate ?? 92}
          />

          <div className="mm-vm__metrics">
            <Metric label="Gift volume" value={`${Number(volumes.giftVolumeCoins || 0).toLocaleString()} Nuts`} />
            <Metric label="Coin purchases" value={`${Number(volumes.purchaseVolumeCoins || 0).toLocaleString()} Nuts`} />
            <Metric label="Creator earnings" value={`₹${Number(volumes.creatorEarningsInr || 0).toLocaleString()}`} />
            <Metric label="Operating band" value={`₹${rate?.minRate ?? '—'}–₹${rate?.maxRate ?? '—'}`} />
          </div>

          {insights.length > 0 && (
            <ul className="mm-vm__insights">
              {insights.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}

          <div className="mm-vm__split">
            <div className="mm-vm__chat">
              <h4>Market chat</h4>
              <p className="mm-vm__chat-note">App discussion only — not financial advice.</p>
              <div className="mm-vm__chat-list">
                {chat.slice(-20).map((m) => (
                  <p key={m.id}>
                    <strong>@{m.username}</strong> {m.text}
                  </p>
                ))}
                {!chat.length && <p className="mm-vm__muted">No messages yet</p>}
              </div>
              <form
                className="mm-vm__chat-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setChatErr('');
                  try {
                    await postChat(username, chatText);
                    setChatText('');
                    await refreshDashboard();
                  } catch (err) {
                    setChatErr(err.message || 'Failed');
                  }
                }}
              >
                <input
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="Say something about activity…"
                  maxLength={160}
                />
                <button type="submit">Send</button>
              </form>
              {chatErr && <p className="mm-vm__error">{chatErr}</p>}
            </div>

            <div className="mm-vm__side">
              <h4>Top gifters today</h4>
              <ul className="mm-vm__top">
                {topGifters.slice(0, 5).map((g) => (
                  <li key={g.username}>
                    <span>@{String(g.username).replace(/^audio:/, '').slice(0, 18)}</span>
                    <span>{Number(g.coins).toLocaleString()} Nuts</span>
                  </li>
                ))}
                {!topGifters.length && <li className="mm-vm__muted">No gifts yet today</li>}
              </ul>
              <h4 className="mm-vm__side-mt">Recent gifts</h4>
              <ul className="mm-vm__gifts">
                {recentGifts.slice(0, 6).map((g) => (
                  <li key={g.id}>
                    🎁 {g.giftName || g.giftId || 'Gift'} · {g.giftCoins} Nuts
                    {g.creatorInr != null && <span> · ≈ ₹{Number(g.creatorInr).toFixed(2)}</span>}
                  </li>
                ))}
                {!recentGifts.length && <li className="mm-vm__muted">Waiting for gifts…</li>}
              </ul>
            </div>
          </div>
        </>
      )}

      {mode === 'admin' && adminKey && (
        <AdminMarketControls adminKey={adminKey} refreshDashboard={refreshDashboard} />
      )}
    </div>
  );
}

/** Compact live rate chip for coin shop / headers */
export function VirtualMarketRateChip({ className = '' }) {
  const { rate, formatUpdatedAgo, loading } = useVirtualMarket({ enabled: true });
  if (!rate && loading) {
    return <p className={`mm-vm-chip ${className}`.trim()}>Loading platform rate…</p>;
  }
  if (!rate) return null;
  const up = rate.change >= 0;
  return (
    <div className={`mm-vm-chip ${className}`.trim()}>
      <span className="mm-vm-chip__label">Platform rate</span>
      <strong>$1 ≈ ₹{Number(rate.rate).toFixed(2)}</strong>
      <span className={up ? 'up' : 'down'}>
        {up ? '▲' : '▼'} {up ? '+' : ''}{Number(rate.changePercent).toFixed(2)}%
      </span>
      <span className="mm-vm-chip__ago">{formatUpdatedAgo()}</span>
    </div>
  );
}
