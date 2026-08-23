import React, { Suspense } from 'react';
import { HellooooLockup, HELLOOOO_EMOJI } from './HellooooBrand';
import { lazyRetry } from '../utils/lazyRetry';

const HeroScene3D = lazyRetry(() => import('./three/HeroScene3D'));

const TRUST = [
  { icon: '🔒', label: 'No account needed' },
  { icon: '⚡', label: 'Instant matching' },
  { icon: '🛡️', label: 'AI safety monitoring' },
];

export function LandingHero({ connected, isJoining, onlineCount = 0, lowPower = false }) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        {!lowPower && (
          <Suspense fallback={null}>
            <HeroScene3D className="opacity-50 sm:opacity-70" intensity={0.65} />
          </Suspense>
        )}
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#08090f] to-transparent" />
      </div>

      <div className="mm-shell mm-shell--wide relative z-10">
        <div className="max-w-2xl mx-auto text-center py-10 sm:py-14 lg:py-16">
          <div className="mb-6 flex justify-center mm-rise">
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

          <p className="mm-body mt-4 max-w-lg mx-auto mm-rise mm-rise-2">
            No sign-up. Pick your topics, choose how you want to talk, and connect
            instantly with people worldwide.
          </p>

          <ul className="mt-5 flex flex-wrap justify-center gap-2 mm-rise mm-rise-3">
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

          {!connected && (
            <p className="mt-4 text-[11px] text-amber-300/80 mm-rise mm-rise-4">Connecting to servers…</p>
          )}
          {connected && isJoining && (
            <p className="mt-4 text-[11px] text-violet-300/80 mm-rise mm-rise-4">Joining room…</p>
          )}
        </div>
      </div>
    </section>
  );
}

export default LandingHero;
