import { useEffect, useRef } from 'react';
import { usePrefs, setPref } from '../utils/userPrefs';
import { HellooooBrand, HellooooLogo } from './HellooooBrand';

/**
 * SettingsPanel.jsx — Right-side slide-over settings for Mana Mingle.
 * Esc / backdrop click to close, autofocuses the close button on open,
 * restores focus to the previously focused element on close.
 *
 * Also exports <SettingsGearButton /> — the shared header entry point.
 */

const APP_VERSION = '1.4.0';

export function GearIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

/** Shared gear entry-point button; styling comes from the caller via className. */
export function SettingsGearButton({ onClick, className = '' }) {
  return (
    <button type="button" onClick={onClick} className={className} title="Settings" aria-label="Settings">
      <GearIcon />
    </button>
  );
}

function Toggle({ checked, onChange, label, description }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex min-h-[44px] w-full items-center justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-left transition-colors hover:border-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-white/85">{label}</span>
        {description && (
          <span className="mt-1 block text-[10px] font-medium leading-relaxed text-white/35">{description}</span>
        )}
      </span>
      <span
        aria-hidden
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 ${
          checked ? 'border-violet-400/50 bg-gradient-to-r from-violet-500 to-cyan-500' : 'border-white/10 bg-white/5'
        }`}
      >
        <span
          className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-all duration-200 ${
            checked ? 'left-[calc(100%-1.25rem)]' : 'left-1'
          }`}
        />
      </span>
    </button>
  );
}

function SectionLabel({ children }) {
  return (
    <h3 className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-[9px] font-black uppercase tracking-[0.4em] text-transparent">
      {children}
    </h3>
  );
}

const QUALITY_OPTIONS = [
  { id: 'auto', label: 'Auto', desc: 'Adapts to your network' },
  { id: 'low', label: 'Low data', desc: '360p · 15 fps' },
  { id: 'hd', label: 'HD', desc: '720p where possible' },
];

export function SettingsPanel({ onClose }) {
  const prefs = usePrefs();
  const closeBtnRef = useRef(null);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    closeBtnRef.current?.focus();
    return () => {
      const el = restoreFocusRef.current;
      if (el && typeof el.focus === 'function') {
        try { el.focus(); } catch { /* element may be gone */ }
      }
    };
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation(); // don't let chat screens treat Esc as "skip"
      onClose?.();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[4000]"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm animate-fade-in"
        tabIndex={-1}
      />

      {/* Panel */}
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-white/10 bg-[#0a0a10]/95 backdrop-blur-2xl shadow-[-24px_0_80px_rgba(0,0,0,0.6)] animate-drawer-in mm-mobile-safe">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-5">
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.3em] text-white">Settings</h2>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.25em] text-white/25">Saved on this device</p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-white/50 transition-colors hover:border-white/25 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-8 overflow-y-auto px-6 py-6 custom-scrollbar">
          {/* EXPERIENCE */}
          <section className="space-y-3" aria-label="Experience">
            <SectionLabel>Experience</SectionLabel>
            <Toggle
              checked={prefs.soundFx}
              onChange={(v) => setPref('soundFx', v)}
              label="Sound effects"
              description="Soft UI sounds for messages and matches."
            />
            <Toggle
              checked={prefs.notifyBrowser}
              onChange={(v) => setPref('notifyBrowser', v)}
              label="Browser notifications"
              description="Desktop alerts for new matches while you're in another tab."
            />
            <Toggle
              checked={prefs.vanishMessages}
              onChange={(v) => setPref('vanishMessages', v)}
              label="Vanishing messages"
              description="Messages fade after 90s."
            />
            <Toggle
              checked={prefs.enterToSend}
              onChange={(v) => setPref('enterToSend', v)}
              label="Enter to send"
              description="Off: use the send button instead of the Enter key."
            />
          </section>

          {/* VIDEO */}
          <section className="space-y-3" aria-label="Video">
            <SectionLabel>Video</SectionLabel>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3">
              <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-white/85">Camera quality</span>
              <span className="mt-1 block text-[10px] font-medium leading-relaxed text-white/35">
                Applies to your next video session.
              </span>
              <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Camera quality">
                {QUALITY_OPTIONS.map((opt) => {
                  const active = prefs.videoQuality === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setPref('videoQuality', opt.id)}
                      className={`min-h-[44px] rounded-xl border px-2 py-2 text-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 ${
                        active
                          ? 'border-violet-400/50 bg-gradient-to-br from-violet-500/25 to-cyan-500/15 text-white'
                          : 'border-white/10 bg-white/[0.02] text-white/40 hover:border-white/20 hover:text-white/70'
                      }`}
                    >
                      <span className="block text-[10px] font-black uppercase tracking-widest">{opt.label}</span>
                      <span className={`mt-0.5 block text-[8px] font-bold ${active ? 'text-white/50' : 'text-white/20'}`}>
                        {opt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ABOUT */}
          <section className="space-y-3" aria-label="About">
            <SectionLabel>About</SectionLabel>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-4">
              <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HellooooLogo size={32} />
                <HellooooBrand size="sm" />
              </div>
                <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-violet-300">
                  v{APP_VERSION}
                </span>
              </div>
              <p className="mt-2 text-[10px] font-medium leading-relaxed text-white/30">
                Anonymous interest-based chat &amp; video. No sign-up — sessions are not stored on our servers.
              </p>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

export default SettingsPanel;
