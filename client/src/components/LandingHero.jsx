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
    <section className="relative overflow-hidden w-full">
      {!lowPower && (
        <div className="absolute inset-0 pointer-events-none opacity-20">
          <Suspense fallback={null}>
            <HeroScene3D className="opacity-35" intensity={0.3} />
          </Suspense>
        </div>
      )}

      <div className="mm-shell mm-shell--wide relative z-10 w-full">
        <div className="mm-landing-hero">
          <div className="mm-landing-hero__brand mm-rise">
            <HellooooLockup logoSize={44} brandSize="xl" showTagline />
          </div>

          <div className="mm-rise">
            <span className="mm-eyebrow">
              {!lowPower && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
              )}
              {onlineCount > 0 ? `${onlineCount.toLocaleString()} online now` : 'Live anonymous connections'}
            </span>
          </div>

          <h2 className="mm-h1 mm-landing-hero__title mm-rise mm-rise-1">
            {HELLOOOO_EMOJI} Meet people who share your{' '}
            <span className="mm-gradient-text">interests</span>
          </h2>

          <p className="mm-landing-hero__sub mm-rise mm-rise-2">
            No sign-up. Pick your topics, choose how you want to talk, and connect
            instantly with people worldwide.
          </p>

          <ul className="mm-landing-trust-row mm-rise mm-rise-3" aria-label="Why Helloooo">
            {TRUST.map((t) => (
              <li key={t.label} className="mm-landing-trust-chip">
                <span className="mm-landing-trust-chip__icon" aria-hidden>{t.icon}</span>
                <span className="mm-landing-trust-chip__label">{t.label}</span>
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
