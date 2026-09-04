import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE } from '../config/apiBase';
import {
  CREATOR_PLATFORMS,
  validateCreatorHandle,
  validateCreatorEmail,
  validateCreatorLink,
  validateCreatorPassword,
  validateCreatorPlatform,
} from '../utils/creatorValidation';

const STEPS = ['Identity', 'Platform', 'Security', 'Review'];

/**
 * Modern multi-step creator verification + secure login modal.
 * Persists applications to Supabase; login issues session tokens.
 */
export default function CreatorVerifyModal({
  open,
  onClose,
  registerCreator,
  login,
  checkStatus,
  requestPasswordReset,
  featuredCreators = [],
  onOpenDashboard,
  showAlert,
}) {
  const [tab, setTab] = useState('apply'); // apply | login | status
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null); // { handle, email, accessCode, status }

  const [form, setForm] = useState({
    handle: '',
    email: '',
    platform: 'Instagram',
    link: '',
    password: '',
    confirmPassword: '',
  });
  const [linkOk, setLinkOk] = useState(null);
  const [loginForm, setLoginForm] = useState({ id: '', password: '' });
  const [statusQuery, setStatusQuery] = useState('');
  const [statusResult, setStatusResult] = useState(null);
  const [forgot, setForgot] = useState({ open: false, id: '', msg: '' });

  useEffect(() => {
    if (!open) {
      setTab('apply');
      setStep(0);
      setError('');
      setDone(null);
      setLinkOk(null);
      setStatusResult(null);
    }
  }, [open]);

  if (!open) return null;

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const platformUrl = (platform, handle) => {
    const h = handle.replace(/^@/, '');
    const map = {
      Instagram: `https://instagram.com/${h}`,
      YouTube: `https://youtube.com/@${h}`,
      Snapchat: `https://snapchat.com/add/${h}`,
      'X (Twitter)': `https://x.com/${h}`,
      TikTok: `https://tiktok.com/@${h}`,
      Other: '',
    };
    return map[platform] || '';
  };

  const validateStep = (s) => {
    if (s === 0) {
      const h = validateCreatorHandle(form.handle);
      if (!h.ok) return h.error;
      const e = validateCreatorEmail(form.email, { required: true });
      if (!e.ok) return e.error;
      return '';
    }
    if (s === 1) {
      const p = validateCreatorPlatform(form.platform);
      if (!p.ok) return p.error;
      const l = validateCreatorLink(form.link);
      if (!l.ok) return l.error;
      return '';
    }
    if (s === 2) {
      const p = validateCreatorPassword(form.password, form.confirmPassword);
      if (!p.ok) return p.error;
      return '';
    }
    return '';
  };

  const next = () => {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError('');
    if (step === 1 && !form.link) {
      setField('link', platformUrl(form.platform, form.handle));
    }
    setStep((x) => Math.min(STEPS.length - 1, x + 1));
  };

  const verifyLink = async () => {
    setBusy(true);
    setLinkOk(null);
    try {
      let url = form.link.trim();
      if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
      const res = await fetch(`${API_BASE}/api/validate-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      setLinkOk(!!data.valid);
      if (data.valid) setField('link', url);
      else setError(data.error || 'Link could not be verified — you can still submit.');
    } catch {
      setLinkOk(false);
      setError('Could not verify link right now.');
    } finally {
      setBusy(false);
    }
  };

  const submitApply = async () => {
    for (let s = 0; s < 3; s++) {
      const err = validateStep(s);
      if (err) { setError(err); setStep(s); return; }
    }
    setBusy(true);
    setError('');
    const res = await registerCreator(
      form.handle,
      form.platform,
      form.link,
      form.email,
      form.password,
      form.confirmPassword,
    );
    setBusy(false);
    if (!res.success) {
      setError(res.error || 'Registration failed');
      return;
    }
    setDone({
      handle: res.handle || form.handle,
      email: res.email || form.email,
      accessCode: res.accessCode,
      status: 'pending',
      message: res.message,
    });
  };

  const submitLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await login(loginForm.id, loginForm.password);
    setBusy(false);
    if (!res.success) {
      if (res.status === 'pending') {
        setError(res.error || 'Still pending approval — use the Status tab, or ask admin to approve you.');
        setTab('status');
        setStatusQuery(loginForm.id);
      } else if (res.status === 'rejected') {
        setError(res.error || 'Application was rejected.');
        setTab('status');
      } else {
        setError(res.error || 'Login failed');
      }
      return;
    }
    showAlert?.('Welcome back', 'Creator session secured.');
    onClose?.();
    onOpenDashboard?.();
  };

  const submitStatus = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const data = await checkStatus(statusQuery.trim());
    setBusy(false);
    setStatusResult(data);
    if (!data) setError('No application found for that handle or access code.');
  };

  const submitForgot = async (e) => {
    e.preventDefault();
    setBusy(true);
    const id = forgot.id.trim();
    const body = id.includes('@') ? { email: id } : { handle: id };
    const res = await requestPasswordReset?.(body);
    setBusy(false);
    setForgot((f) => ({
      ...f,
      msg: res?.message || res?.error || 'If that account exists, check your email.',
    }));
  };

  return createPortal(
    <div className="mm-modal-overlay z-[2000]" onClick={onClose}>
      <div
        className="mm-creator-verify"
        role="dialog"
        aria-modal="true"
        aria-label="Creator verification"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="mm-creator-verify__close" onClick={onClose} aria-label="Close">✕</button>

        <header className="mm-creator-verify__hero">
          <p className="mm-eyebrow">Creator program</p>
          <h2 className="mm-creator-verify__title">Get verified</h2>
          <p className="mm-creator-verify__sub">
            Apply once — everything saves securely to the database. Log in with handle or email + password.
          </p>
        </header>

        {!done && (
          <div className="mm-creator-verify__tabs">
            {[
              { id: 'apply', label: 'Apply' },
              { id: 'login', label: 'Log in' },
              { id: 'status', label: 'Status' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                className={tab === t.id ? 'on' : ''}
                onClick={() => { setTab(t.id); setError(''); }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {featuredCreators.length > 0 && tab === 'apply' && !done && (
          <div className="mm-creator-verify__featured">
            {featuredCreators.slice(0, 6).map((c) => (
              <a key={c.handle_name} href={`/creator/${c.handle_name}`} className="mm-creator-verify__chip">
                @{c.handle_name}
              </a>
            ))}
          </div>
        )}

        {done ? (
          <div className="mm-creator-verify__done">
            <div className="mm-creator-verify__done-icon">✓</div>
            <h3>Application saved</h3>
            <p>{done.message || 'Pending admin review. You will log in with your password after approval.'}</p>
            <div className="mm-creator-verify__card">
              <div><span>Handle</span><strong>@{done.handle}</strong></div>
              <div><span>Email</span><strong>{done.email}</strong></div>
              {done.accessCode && (
                <div>
                  <span>Backup access code</span>
                  <strong className="select-all">{done.accessCode}</strong>
                </div>
              )}
            </div>
            <p className="text-[11px] text-white/40 mt-3">
              Keep your password private. The access code is only a backup — it is not your login password.
            </p>
            <button type="button" className="mm-btn mm-btn--primary w-full mt-4" onClick={() => { setDone(null); setTab('login'); }}>
              Go to login
            </button>
            <button type="button" className="mm-btn mm-btn--ghost w-full mt-2" onClick={onClose}>Close</button>
          </div>
        ) : tab === 'apply' ? (
          <div className="mm-creator-verify__body">
            <div className="mm-creator-verify__steps">
              {STEPS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  className={`mm-creator-verify__step${i === step ? ' on' : ''}${i < step ? ' done' : ''}`}
                  onClick={() => { if (i < step) setStep(i); }}
                >
                  <span>{i + 1}</span>
                  {label}
                </button>
              ))}
            </div>

            {step === 0 && (
              <div className="space-y-3">
                <label className="mm-audio-id-label">
                  Creator handle
                  <input
                    className="mm-audio-id-input"
                    value={form.handle}
                    onChange={(e) => setField('handle', e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30))}
                    placeholder="yourname"
                    autoFocus
                  />
                </label>
                <label className="mm-audio-id-label">
                  Email (required · saved to database)
                  <input
                    className="mm-audio-id-input"
                    type="email"
                    value={form.email}
                    onChange={(e) => setField('email', e.target.value)}
                    placeholder="you@email.com"
                  />
                </label>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <label className="mm-audio-id-label">
                  Platform
                  <select
                    className="mm-audio-id-input"
                    value={form.platform}
                    onChange={(e) => {
                      const platform = e.target.value;
                      setForm((f) => ({
                        ...f,
                        platform,
                        link: f.link || platformUrl(platform, f.handle),
                      }));
                    }}
                  >
                    {CREATOR_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label className="mm-audio-id-label">
                  Profile link
                  <input
                    className="mm-audio-id-input"
                    value={form.link}
                    onChange={(e) => { setField('link', e.target.value); setLinkOk(null); }}
                    placeholder={platformUrl(form.platform, form.handle || 'yourname')}
                  />
                </label>
                <button type="button" className="mm-btn mm-btn--ghost w-full" disabled={busy || !form.link} onClick={verifyLink}>
                  {busy ? 'Checking…' : linkOk === true ? 'Link verified ✓' : 'Verify link'}
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <label className="mm-audio-id-label">
                  Login password
                  <input
                    className="mm-audio-id-input"
                    type="password"
                    value={form.password}
                    onChange={(e) => setField('password', e.target.value)}
                    placeholder="Min 8 chars · letter + number"
                    autoComplete="new-password"
                  />
                </label>
                <label className="mm-audio-id-label">
                  Confirm password
                  <input
                    className="mm-audio-id-input"
                    type="password"
                    value={form.confirmPassword}
                    onChange={(e) => setField('confirmPassword', e.target.value)}
                    placeholder="Repeat password"
                    autoComplete="new-password"
                  />
                </label>
                <p className="text-[11px] text-white/35">
                  Stored as a bcrypt hash in Supabase — never in plain text. Use this to log in after approval.
                </p>
              </div>
            )}

            {step === 3 && (
              <div className="mm-creator-verify__card space-y-2">
                <div><span>Handle</span><strong>@{form.handle}</strong></div>
                <div><span>Email</span><strong>{form.email}</strong></div>
                <div><span>Platform</span><strong>{form.platform}</strong></div>
                <div><span>Profile</span><strong className="truncate max-w-[14rem]">{form.link}</strong></div>
                <div><span>Password</span><strong>••••••••</strong></div>
              </div>
            )}

            {error && <p className="mm-audio-id-error mt-3">{error}</p>}

            <div className="flex gap-2 mt-5">
              {step > 0 && (
                <button type="button" className="mm-btn mm-btn--ghost flex-1" onClick={() => setStep((s) => s - 1)}>Back</button>
              )}
              {step < STEPS.length - 1 ? (
                <button type="button" className="mm-btn mm-btn--primary flex-1" onClick={next}>Continue</button>
              ) : (
                <button type="button" className="mm-btn mm-btn--primary flex-1" disabled={busy} onClick={submitApply}>
                  {busy ? 'Saving…' : 'Submit application'}
                </button>
              )}
            </div>
          </div>
        ) : tab === 'login' ? (
          <form className="mm-creator-verify__body space-y-3" onSubmit={submitLogin}>
            {!forgot.open ? (
              <>
                <label className="mm-audio-id-label">
                  Handle or email
                  <input
                    className="mm-audio-id-input"
                    value={loginForm.id}
                    onChange={(e) => setLoginForm({ ...loginForm, id: e.target.value })}
                    placeholder="@handle or you@email.com"
                    autoFocus
                    required
                  />
                </label>
                <label className="mm-audio-id-label">
                  Password
                  <input
                    className="mm-audio-id-input"
                    type="password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                </label>
                {error && <p className="mm-audio-id-error">{error}</p>}
                <button type="submit" className="mm-btn mm-btn--primary w-full" disabled={busy}>
                  {busy ? 'Signing in…' : 'Secure login'}
                </button>
                <button type="button" className="mm-audio-id-link w-full" onClick={() => setForgot({ open: true, id: loginForm.id, msg: '' })}>
                  Forgot password?
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-white/50">We email a reset link if the account exists and has an email on file.</p>
                <label className="mm-audio-id-label">
                  Handle or email
                  <input
                    className="mm-audio-id-input"
                    value={forgot.id}
                    onChange={(e) => setForgot({ ...forgot, id: e.target.value })}
                    required
                  />
                </label>
                {forgot.msg && <p className="text-xs text-emerald-300">{forgot.msg}</p>}
                <button type="button" className="mm-btn mm-btn--primary w-full" disabled={busy} onClick={submitForgot}>
                  {busy ? 'Sending…' : 'Send reset link'}
                </button>
                <button type="button" className="mm-audio-id-link w-full" onClick={() => setForgot({ open: false, id: '', msg: '' })}>
                  Back to login
                </button>
              </>
            )}
          </form>
        ) : (
          <form className="mm-creator-verify__body space-y-3" onSubmit={submitStatus}>
            <label className="mm-audio-id-label">
              Handle or access code
              <input
                className="mm-audio-id-input"
                value={statusQuery}
                onChange={(e) => setStatusQuery(e.target.value)}
                placeholder="@handle or access code"
                required
              />
            </label>
            {error && <p className="mm-audio-id-error">{error}</p>}
            {statusResult && (
              <div className="mm-creator-verify__card">
                <div><span>Handle</span><strong>@{statusResult.handle_name}</strong></div>
                <div><span>Status</span><strong className="uppercase">{statusResult.status}</strong></div>
                {statusResult.rejection_reason && (
                  <div><span>Note</span><strong>{statusResult.rejection_reason}</strong></div>
                )}
              </div>
            )}
            <button type="submit" className="mm-btn mm-btn--primary w-full" disabled={busy}>
              {busy ? 'Checking…' : 'Check status'}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
