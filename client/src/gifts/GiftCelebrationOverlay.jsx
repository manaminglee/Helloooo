import { useEffect, useState } from 'react';
import { GiftRenderer } from './GiftRenderer';
import { GiftParticles } from './GiftParticles';
import { celebrationDuration, detectGiftQuality } from './giftQuality';
import { playGiftSound, stopGiftSound, unlockGiftAudio } from './GiftSoundManager';
import { NutsSymbol } from '../components/NutsSymbol';
import './giftStage.css';


const GIFT_MOVE = {
  giggle_ears: 'wiggle', shady_specs: 'specs-fly', boom_star: 'pop', wink_wave: 'wiggle',
  petal_mask: 'bloom', cowboy_bear: 'pop', bloom_crown: 'crown-drop', hug_heart: 'bloom',
  charm_donut: 'spin-in', charm_blush: 'pop', charm_clap: 'wiggle', charm_thumb: 'pop',
  charm_fold: 'pop', charm_duck: 'rise', charm_cheer: 'pop', charm_bell: 'wiggle',
  charm_crystal: 'spin-in', glam_charm: 'spin-in', wish_lamp: 'rise', hex_charm: 'spin-in',
  wish_bottle: 'rise', fortune_tusk: 'pop', pearl_shell: 'bloom', cupid_bolt: 'bolt',
  rose_bear: 'bloom', heart_wings: 'bloom', gold_watch: 'orbit', neon_rider: 'fly-across',
  true_bloom: 'bloom', gold_rain: 'rain', hyper_car: 'fly-across', skyline_glow: 'rise',
  royal_lion: 'pop', private_jet: 'fly-across', dream_castle: 'rise', cloud_garden: 'rise',
  tide_muse: 'rise', aeon_diamond: 'orbit', eternal_spire: 'rise', legend_crown: 'crown-drop',
};

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
      data-gift-id={gift.id}
      data-gift-move={GIFT_MOVE[gift.id] || 'pop'}
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
