import { useEffect, useState } from 'react';
import { GiftRenderer } from './GiftRenderer';
import { GiftParticles } from './GiftParticles';
import { celebrationDuration, detectGiftQuality } from './giftQuality';
import { playGiftSound, stopGiftSound, unlockGiftAudio } from './GiftSoundManager';
import { NutsSymbol } from '../components/NutsSymbol';

function particleKind(gift) {
  const id = gift?.id || gift?.scene;
  if (['rose_bear', 'true_bloom', 'petal_mask'].includes(id)) return 'petal';
  if (['hug_heart', 'heart_wings', 'cupid_bolt'].includes(id)) return 'heart';
  if (['gold_rain', 'gold_watch'].includes(id)) return 'coin';
  if (['aeon_diamond', 'charm_crystal'].includes(id)) return 'crystal';
  if (['neon_rider', 'hyper_car'].includes(id)) return 'neon';
  return 'sparkle';
}

export function GiftCelebrationOverlay({ gift: payload, onDone }) {
  const gift = payload?.gift || payload;
  const quality = detectGiftQuality();
  const [phase, setPhase] = useState(1);

  useEffect(() => {
    if (!gift) return undefined;
    unlockGiftAudio();
    playGiftSound(gift);
    const total = celebrationDuration(gift);
    const timers = [
      setTimeout(() => setPhase(3), 120),
      setTimeout(() => setPhase(5), Math.min(500, total * 0.18)),
      setTimeout(() => setPhase(8), Math.min(900, total * 0.32)),
      setTimeout(() => setPhase(10), Math.max(400, total - 320)),
      setTimeout(() => onDone?.(), total),
    ];
    return () => {
      timers.forEach(clearTimeout);
      stopGiftSound(gift.id);
    };
  }, [gift?.id, payload?.txId, payload?.key]);

  if (!gift || !payload) return null;

  return (
    <div
      className={`pg-celeb pg-celeb--p${phase} pg-celeb--${gift.rarity || 'common'} pg-celeb--${gift.scene || gift.id}`}
      aria-hidden
    >
      <div className="pg-celeb__dim" />
      {quality !== 'low' && (
        <GiftParticles kind={particleKind(gift)} quality={quality} active={phase >= 2} />
      )}
      <div className="pg-celeb__stage">
        <GiftRenderer gift={gift} mode="celebration" quality={quality} size={150} />
      </div>
      {phase >= 8 && (
        <div className="pg-celeb__caption">
          <p className="pg-celeb__from">{payload.from || payload.fromNickname} sent</p>
          <p className="pg-celeb__name">{gift.name}</p>
          <p className="pg-celeb__cost">
            <NutsSymbol size={14} />
            {Number(gift.cost || 0).toLocaleString('de-DE')}
            {payload.comboCount > 1 ? `  ×${payload.comboCount}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
