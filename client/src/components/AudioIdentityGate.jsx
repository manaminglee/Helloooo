import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE } from '../config/apiBase';
import { validateAudioUsername, validateAudioPin, sanitizeAudioUsernameInput } from '../utils/audioIdentityValidation';
import {
  NAME_COLORS,
  NAME_GRADIENTS,
  isGradientNameColor,
  resolveNameStyle,
} from '../utils/audioNameStyle';

function UsernameMirrorPreview({ username, nameColor }) {
  const display = username.trim() || 'YourName';
  const gradient = isGradientNameColor(nameColor);
  const textStyle = gradient ? resolveNameStyle(nameColor) : { color: nameColor };
  return (
    <div className="mm-audio-id-mirror">
      <div className="mm-audio-id-mirror__glass" aria-hidden />
      <p className="mm-audio-id-mirror__label">Preview</p>
      <p className="mm-audio-id-mirror__name">
        <span
          className={`mm-audio-id-mirror__text${gradient ? ' mm-audio-name--gradient' : ''}`}
          style={textStyle}
        >
          @{display}
        </span>
        <span className="mm-audio-id-mirror__shine" aria-hidden />
      </p>
    </div>
  );
}

function AudioIdentityRegisterModal({ open, onClose, identityHook, onSignedIn }) {
  const { register, loading, error, setError } = identityHook;
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [nameColor, setNameColor] = useState(NAME_COLORS[0]);
  const [colors, setColors] = useState(NAME_COLORS);
  const [gradients, setGradients] = useState(NAME_GRADIENTS);

  useEffect(() => {
    if (!open) return;
    fetch(`${API_BASE}/api/audio-identity/colors`)
      .then((r) => r.json())
      .then((d) => {
        if (d.colors?.length) setColors(d.colors);
        if (d.gradients?.length) setGradients(d.gradients);
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) {
      setUsername('');
      setPin('');
      setPin2('');
      setError('');
    }
  }, [open, setError]);

  const submitRegister = async (e) => {
    e.preventDefault();
    setError('');
    const userErr = validateAudioUsername(username);
    if (userErr) { setError(userErr); return; }
    const pinErr = validateAudioPin(pin);
    if (pinErr) { setError(pinErr); return; }
    if (pin !== pin2) {
      setError('PINs do not match');
      return;
    }
    const ok = await register({ username: username.trim(), pin, nameColor });
    if (ok) {
      onClose();
      onSignedIn?.();
    }
  };

  if (!open) return null;

  return createPortal(
      <div className="mm-modal-overlay mm-modal-overlay--sheet z-[500]" onClick={onClose}>
      <div
        className="mm-audio-id-card mm-audio-id-card--register w-full max-w-md"
        role="dialog"
        aria-modal="true"
        aria-label="Create voice room identity"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mm-audio-id-card__glow" aria-hidden />
        <span className="mm-audio-id-card__icon">✨</span>
        <h2 className="mm-audio-id-card__title">New user</h2>
        <p className="mm-audio-id-card__sub">
          Pick a username, 4-digit PIN, and color. Next time you only need your PIN.
        </p>

        <form onSubmit={submitRegister} className="space-y-3 mt-5">
          <label className="mm-audio-id-label">
            Username
            <input
              className="mm-audio-id-input"
              value={username}
              onChange={(e) => setUsername(sanitizeAudioUsernameInput(e.target.value))}
              placeholder="e.g. Star_Voice!"
              maxLength={20}
              autoFocus
              required
            />
          </label>
          <label className="mm-audio-id-label">
            Login PIN
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
            <p className="mm-audio-id-sublabel">Solid</p>
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
            <p className="mm-audio-id-sublabel mt-2">Gradient</p>
            <div className="mm-audio-id-colors mm-audio-id-colors--gradients">
              {gradients.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`mm-audio-id-gradient${nameColor === g.id ? ' mm-audio-id-gradient--on' : ''}`}
                  style={{ backgroundImage: g.css }}
                  onClick={() => setNameColor(g.id)}
                  aria-label={`Gradient ${g.label}`}
                  title={g.label}
                />
              ))}
            </div>
            <UsernameMirrorPreview username={username} nameColor={nameColor} />
          </div>
          {error && <p className="mm-audio-id-error">{error}</p>}
          <button type="submit" className="mm-btn mm-btn--primary w-full" disabled={loading || pin.length !== 4 || pin !== pin2}>
            {loading ? 'Creating…' : 'Create & enter'}
          </button>
          <button type="button" className="mm-audio-id-link w-full" onClick={onClose}>
            Back to PIN login
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}

export function AudioIdentityGate({ onSignedIn, onCancel, identityHook, variant = 'fullscreen' }) {
  const { login, loading, error, setError, savedUsername, clearLocalIdentity, hydrating } = identityHook;
  const [pin, setPin] = useState('');
  const [showRegister, setShowRegister] = useState(false);

  const submitLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!savedUsername) {
      setError('No account on this device — register as a new user below.');
      return;
    }
    const pinErr = validateAudioPin(pin);
    if (pinErr) { setError(pinErr); return; }
    const ok = await login({ username: savedUsername, pin });
    if (ok) onSignedIn?.();
  };

  const openRegister = () => {
    setError('');
    setShowRegister(true);
  };

  const card = (
    <div className="mm-audio-id-card w-full max-w-md" role="dialog" aria-modal="true" aria-label="Voice room sign in">
      <div className="mm-audio-id-card__glow" aria-hidden />
      <span className="mm-audio-id-card__icon">🎙️</span>
      <h1 className="mm-audio-id-card__title">Voice Room</h1>
      <p className="mm-audio-id-card__sub">
        {hydrating
          ? 'Checking your session…'
          : savedUsername
            ? <>Welcome back, <strong style={{ color: '#c4b5fd' }}>@{savedUsername}</strong></>
            : 'Enter your 4-digit PIN to sign in'}
      </p>

      <form onSubmit={submitLogin} className="space-y-3 mt-5">
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
            autoFocus={!hydrating}
            required
          />
        </label>
        {error && <p className="mm-audio-id-error">{error}</p>}
        <button
          type="submit"
          className="mm-btn mm-btn--primary w-full"
          disabled={loading || hydrating || pin.length !== 4}
        >
          {loading ? 'Signing in…' : 'Enter voice rooms'}
        </button>
        {savedUsername && (
          <button type="button" className="mm-audio-id-link w-full" onClick={() => { clearLocalIdentity?.(); setPin(''); setError(''); }}>
            Switch account
          </button>
        )}
      </form>

      <div className="mm-audio-id-register-cta mt-4">
        <p className="mm-audio-id-hint">First time here?</p>
        <button type="button" className="mm-audio-id-register-btn" disabled={hydrating} onClick={openRegister}>
          New user registration
        </button>
      </div>

      {onCancel && (
        <button type="button" className="mm-audio-id-back mt-4" onClick={onCancel}>
          ← Back to home
        </button>
      )}

      <AudioIdentityRegisterModal
        open={showRegister}
        onClose={() => setShowRegister(false)}
        identityHook={identityHook}
        onSignedIn={onSignedIn}
      />
    </div>
  );

  if (variant === 'popup') {
    return (
      <div className="mm-modal-overlay z-[400]">
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
  const nameColor = member?.nameColor || '#e2e8f0';
  const name = member?.audioUsername || member?.nickname || 'Guest';
  const gradient = isGradientNameColor(nameColor);
  const textStyle = gradient ? resolveNameStyle(nameColor) : { color: nameColor };
  return (
    <span className={`mm-audio-name ${className}`.trim()}>
      {member?.levelBadge && member?.displayLevel > 0 && (
        <span className="mm-audio-level-badge" title={`Level ${member.displayLevel}`}>
          {member.levelBadge} Lv{member.displayLevel}
        </span>
      )}
      <span className={`mm-audio-name__text${gradient ? ' mm-audio-name--gradient' : ''}`} style={textStyle}>
        {name}
      </span>
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
        setMsg(res.status === 503
          ? 'Nuts shop is offline right now — try again later or earn Nuts in rooms.'
          : (data.error || 'Checkout failed'));
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
          setMsg(`+${pack.coins} Nuts added! Level ${v.identity?.level || '—'}`);
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
    <div className="mm-modal-overlay z-[600]" onClick={onClose}>
      <div className="mm-modal-surface max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="mm-audio-coin-shop__title">Recharge Nuts</h3>
        <p className="mm-audio-coin-shop__bal">Balance: <strong>{identity?.coins ?? 0}</strong> Nuts · Lv {identity?.level ?? 0}</p>
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
              <span>{p.coins} Nuts · ₹{p.priceInr}</span>
            </button>
          ))}
        </div>
        {msg && <p className="mm-audio-coin-shop__msg mt-3">{msg}</p>}
        <button type="button" className="mm-btn mm-btn--ghost w-full mt-4" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
