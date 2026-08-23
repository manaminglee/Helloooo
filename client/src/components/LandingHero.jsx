import React, { Suspense } from 'react';
import { HellooooLockup, HELLOOOO_EMOJI } from './HellooooBrand';
import { lazyRetry } from '../utils/lazyRetry';

const HeroScene3D = lazyRetry(() => import('./three/HeroScene3D'));

/**
 * Redesigned landing hero — mobile-first.
 *
 * Phone: single column, 3D scene as a contained backdrop, full-width CTAs.
 * Desktop: two columns with the 3D globe given real space on the right.
 */

const MODE_CARDS = [
  {
    id: 'video',
    icon: '📹',
    name: 'Video Chat',
    hint: '1-on-1 live video',
    tag: 'Live',
    accent: 'from-violet-500/20 to-fuchsia-500/10',
    ring: 'group-hover:border-violet-400/50',
  },
  {
    id: 'text',
    icon: '💬',
    name: 'Text Chat',
    hint: 'Anonymous messaging',
    tag: 'Fast',
    accent: 'from-cyan-500/20 to-sky-500/10',
    ring: 'group-hover:border-cyan-400/50',
  },
  {
    id: 'group_video',
    icon: '🎥',
    name: 'Group Video',
    hint: 'Up to 4 on camera',
    tag: 'Squad',
    accent: 'from-indigo-500/20 to-violet-500/10',
    ring: 'group-hover:border-indigo-400/50',
  },
  {
    id: 'group_text',
    icon: '🎙️',
    name: 'Voice Rooms',
    hint: 'Live audio + coin races',
    tag: 'New',
    accent: 'from-amber-500/20 to-orange-500/10',
    ring: 'group-hover:border-amber-400/50',
  },
];

const TRUST = [
  { icon: '🔒', label: 'No account needed' },
  { icon: '⚡', label: 'Instant matching' },
  { icon: '🛡️', label: 'AI safety monitoring' },
];

export function LandingHero({ onStart, connected, isJoining, onlineCount = 0, lowPower = false }) {
  return (
    <section className="relative overflow-hidden">
      {/* 3D backdrop — contained so it never captures scroll/taps */}
      <div className="absolute inset-0 pointer-events-none">
        {!lowPower && (
          <Suspense fallback={null}>
            <HeroScene3D className="opacity-70 sm:opacity-90" intensity={0.9} />
          </Suspense>
        )}
        {/* Fade the scene into the page below */}
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#08090f] to-transparent" />
      </div>

      <div className="mm-shell mm-shell--wide relative z-10">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center py-10 sm:py-16 lg:py-20">
          {/* ---- Copy column ---- */}
          <div className="text-center lg:text-left">
            <div className="mb-6 flex justify-center lg:justify-start mm-rise">
              <HellooooLockup logoSize={44} brandSize="xl" showTagline />
            </div>
            <div className="mm-rise inline-flex">
              <span className="mm-eyebrow">
                {!lowPower && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
                )}
                {onlineCount > 0 ? `${onlineCount.toLocaleString()} online now` : 'Live anonymous connections'}
              </span>
            </div>

            <h2 className="mm-h1 mt-4 mm-rise mm-rise-1">
              {HELLOOOO_EMOJI} Meet people who
              <br className="hidden sm:block" />{' '}
              <span className="mm-gradient-text">share your interests</span>
            </h2>

            <p className="mm-body mt-4 max-w-lg mx-auto lg:mx-0 mm-rise mm-rise-2">
              No sign-up. Pick your topics, choose how you want to talk, and connect
              instantly with people worldwide.
            </p>

            {/* Trust chips */}
            <ul className="mt-5 flex flex-wrap justify-center lg:justify-start gap-2 mm-rise mm-rise-3">
              {TRUST.map((t) => (
                <li
                  key={t.label}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/60 bg-white/5 border border-white/8 rounded-full px-3 py-1.5"
                >
                  <span aria-hidden>{t.icon}</span>
                  {t.label}
                </li>
              ))}
            </ul>

            {/* Primary CTA — full width on phones */}
            <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mm-rise mm-rise-4">
              <button
                type="button"
                disabled={!connected || isJoining}
                onClick={() => onStart('video')}
                className="mm-btn mm-btn--primary sm:!px-7"
              >
                {isJoining ? 'Connecting…' : 'Start video chat'}
                <span aria-hidden>→</span>
              </button>
              <button
                type="button"
                disabled={!connected || isJoining}
                onClick={() => onStart('group_text')}
                className="mm-btn mm-btn--ghost sm:!px-7"
              >
                🎙️ Join a voice room
              </button>
            </div>

            {!connected && (
              <p className="mt-3 text-[11px] text-amber-300/80">Connecting to servers…</p>
            )}
          </div>

          {/* ---- Mode cards ---- */}
          <div className="mm-rise mm-rise-3">
            <p className="mm-caption uppercase tracking-widest mb-3 text-center lg:text-left">
              Or pick a mode
            </p>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {MODE_CARDS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={!connected || isJoining}
                  onClick={() => onStart(m.id)}
                  aria-label={`${m.name}: ${m.hint}`}
                  className={`group mm-3d mm-tilt text-left disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <div
                    className={`mm-3d-inner relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${m.accent} ${m.ring} p-3.5 sm:p-4 min-h-[7rem] sm:min-h-[8.5rem] flex flex-col justify-between transition-colors`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-2xl sm:text-3xl leading-none" aria-hidden>
                        {m.icon}
                      </span>
                      <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/12 text-white/70 shrink-0">
                        {m.tag}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-white leading-tight">{m.name}</h3>
                      <p className="text-[10px] sm:text-[11px] text-white/50 mt-0.5 leading-snug">{m.hint}</p>
                    </div>
                    <span
                      className="absolute right-3 bottom-3 text-white/25 group-hover:text-white/70 group-hover:translate-x-0.5 transition-all"
                      aria-hidden
                    >
                      →
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default LandingHero;
