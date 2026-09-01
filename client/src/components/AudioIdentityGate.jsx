import { useState, useEffect } from 'react';
import { API_BASE } from '../config/apiBase';

const DEFAULT_COLORS = [
  '#f472b6', '#a78bfa', '#34d399', '#38bdf8', '#fbbf24',
  '#fb7185', '#22d3ee', '#e879f9', '#4ade80', '#f97316',
];

export function AudioIdentityGate({ onSignedIn, onCancel, identityHook, variant = 'fullscreen' }) {
  const { register, login, loading, error, setError } = identityHook;
  const [mode, setMode] = useState('login'); // login | register
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [nameColor, setNameColor] = useState(DEFAULT_COLORS[0]);
  const [colors, setColors] = useState(DEFAULT_COLORS);

  useEffect(() => {
    fetch(`${API_BASE}/api/audio-identity/colors`)
      .then((r) => r.json())
      .then((d) => { if (d.colors?.length) setColors(d.colors); })
      .catch(() => {});
  }, []);

  const submitLogin = async (e) => {
    e.preventDefault();
    setError('');
    const ok = await login({ username: username.trim(), pin });
    if (ok) onSignedIn?.();
  };

  const submitRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (pin !== pin2) {
      setError('PINs do not match');
      return;
    }
    const ok = await register({ username: username.trim(), pin, nameColor });
    if (ok) onSignedIn?.();
  };

  const card = (
    <div className="mm-audio-id-card w-full max-w-md" role="dialog" aria-modal="true" aria-label="Voice room sign in">
      <div className="mm-audio-id-card__glow" aria-hidden />
      <span className="mm-audio-id-card__icon">🎙️</span>
      <h1 className="mm-audio-id-card__title">Voice Room Identity</h1>
      <p className="mm-audio-id-card__sub">
        Sign in to browse live rooms and join the stage. Text &amp; video stay anonymous.
      </p>

      {mode === 'login' ? (
          <form onSubmit={submitLogin} className="space-y-3 mt-5">
            <label className="mm-audio-id-label">
              Username
              <input
                className="mm-audio-id-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your voice name"
                autoComplete="username"
                maxLength={20}
                required
              />
            </label>
            <label className="mm-audio-id-label">
              4-digit PIN
              <input
                className="mm-audio-id-input mm-audio-id-input--pin"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                inputMode="numeric"
                maxLength={4}
                autoComplete="current-password"
                required
              />
            </label>
            {error && <p className="mm-audio-id-error">{error}</p>}
            <button type="submit" className="mm-btn mm-btn--primary w-full" disabled={loading || pin.length !== 4}>
              {loading ? 'Signing in…' : 'Enter voice rooms'}
            </button>
            <button type="button" className="mm-audio-id-link w-full" onClick={() => { setMode('register'); setError(''); }}>
              New user? Create identity
            </button>
          </form>
        ) : (
          <form onSubmit={submitRegister} className="space-y-3 mt-5">
            <label className="mm-audio-id-label">
              Choose username
              <input
                className="mm-audio-id-input"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20))}
                placeholder="e.g. StarVoice"
                maxLength={20}
                required
              />
            </label>
            <label className="mm-audio-id-label">
              4-digit PIN
              <input
                className="mm-audio-id-input mm-audio-id-input--pin"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                inputMode="numeric"
                maxLength={4}
                required
              />
            </label>
            <label className="mm-audio-id-label">
              Confirm PIN
              <input
                className="mm-audio-id-input mm-audio-id-input--pin"
                value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                inputMode="numeric"
                maxLength={4}
                required
              />
            </label>
            <div>
              <p className="mm-audio-id-label !mb-2">Username color</p>
              <div className="mm-audio-id-colors">
                {colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`mm-audio-id-color${nameColor === c ? ' mm-audio-id-color--on' : ''}`}
                    style={{ '--swatch': c }}
                    onClick={() => setNameColor(c)}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
              <p className="mm-audio-id-preview mt-2" style={{ color: nameColor }}>
                @{username || 'YourName'}
              </p>
            </div>
            {error && <p className="mm-audio-id-error">{error}</p>}
            <button type="submit" className="mm-btn mm-btn--primary w-full" disabled={loading || pin.length !== 4 || pin !== pin2}>
              {loading ? 'Creating…' : 'Create & enter'}
            </button>
            <button type="button" className="mm-audio-id-link w-full" onClick={() => { setMode('login'); setError(''); }}>
              Already have an identity? Sign in
            </button>
          </form>
        )}

        {onCancel && (
          <button type="button" className="mm-audio-id-back mt-4" onClick={onCancel}>
            ← Back to home
          </button>
        )}
      </div>
  );

  if (variant === 'popup') {
    return (
      <div className="mm-audio-id-popup-overlay">
        <div className="mm-audio-id-popup-backdrop" aria-hidden />
        {card}
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-[#08090f] mm-audio-id-gate">
      {card}
    </div>
  );
}

export function AudioName({ member, className = '' }) {
  const color = member?.nameColor || '#e2e8f0';
  const name = member?.audioUsername || member?.nickname || 'Guest';
  return (
    <span className={`mm-audio-name ${className}`} style={{ color }}>
      {member?.levelBadge && member?.displayLevel > 0 && (
        <span className="mm-audio-level-badge" title={`Level ${member.displayLevel}`}>
          {member.levelBadge} Lv{member.displayLevel}
        </span>
      )}
      <span className="mm-audio-name__text">{name}</span>
      {member?.profileBadge && member?.displayLevel >= 5 && (
        <span className="mm-audio-profile-badge" title="Level 5+ badge">🏅</span>
      )}
    </span>
  );
}

export function AudioCoinShop({ open, onClose, identity, onBalanceUpdate }) {
  const [packages, setPackages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    fetch(`${API_BASE}/api/payment/config`)
      .then((r) => r.json())
      .then((d) => setPackages(d.coinPackages || []))
      .catch(() => {});
  }, [open]);

  const buy = async (pack) => {
    if (!identity?.username) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(`${API_BASE}/api/payment/coins/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ packageId: pack.id, audioUsername: identity.username }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || 'Checkout failed');
        return;
      }
      if (data.provider === 'test' || data.testMode) {
        const verify = await fetch(`${API_BASE}/api/payment/coins/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            packageId: pack.id,
            audioUsername: identity.username,
            testConfirm: true,
          }),
        });
        const v = await verify.json();
        if (v.ok) {
          setMsg(`+${pack.coins} coins added! Level ${v.identity?.level || '—'}`);
          onBalanceUpdate?.(v.identity);
        } else setMsg(v.error || 'Test purchase failed');
        return;
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch {
      setMsg('Network error');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={onClose}>
      <div className="mm-audio-coin-shop w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="mm-audio-coin-shop__title">Recharge coins</h3>
        <p className="mm-audio-coin-shop__bal">Balance: <strong>{identity?.coins ?? 0}</strong> · Lv {identity?.level ?? 0}</p>
        <div className="space-y-2 mt-3">
          {packages.map((p) => (
            <button
              key={p.id}
              type="button"
              className="mm-audio-coin-pack"
              disabled={busy}
              onClick={() => buy(p)}
            >
              <span>{p.icon} {p.name}</span>
              <span>{p.coins} coins · ₹{p.priceInr}</span>
            </button>
          ))}
        </div>
        {msg && <p className="mm-audio-coin-shop__msg mt-3">{msg}</p>}
        <button type="button" className="mm-btn mm-btn--ghost w-full mt-4" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
