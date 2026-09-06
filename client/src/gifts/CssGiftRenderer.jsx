import { GiftArt } from '../components/icons/GiftArt';
import { GiftParticles } from './GiftParticles';

const PARTICLE_KIND = {
  hug_heart: 'heart',
  heart_wings: 'heart',
  cupid_bolt: 'heart',
  rose_bear: 'petal',
  true_bloom: 'petal',
  petal_mask: 'petal',
  bloom_crown: 'petal',
  gold_rain: 'coin',
  gold_watch: 'sparkle',
  charm_crystal: 'crystal',
  aeon_diamond: 'crystal',
  charm_donut: 'sparkle',
  charm_bell: 'sparkle',
  wish_lamp: 'sparkle',
  neon_rider: 'neon',
  hyper_car: 'neon',
  boom_star: 'sparkle',
  skyline_glow: 'neon',
  tide_muse: 'crystal',
  cloud_garden: 'petal',
  eternal_spire: 'crystal',
  legend_crown: 'sparkle',
  dream_castle: 'sparkle',
};

export function CssGiftRenderer({ gift, mode = 'preview', still = false, size = 56, quality = 'mid' }) {
  const scene = gift?.scene || gift?.id;
  const kind = PARTICLE_KIND[gift?.id] || (gift?.lucky ? 'sparkle' : gift?.rarity === 'legendary' || gift?.rarity === 'ultra' ? 'sparkle' : null);
  const showParticles = !still && mode !== 'thumb' && quality !== 'low' && kind;
  return (
    <div className={`pg-css pg-css--${scene} pg-css--${mode}${still ? ' pg-css--still' : ''}`}>
      {showParticles && <GiftParticles kind={kind} quality={quality} active={!still} />}
      <div className="pg-css__mark">
        <GiftArt
          id={gift?.art || gift?.id}
          tier={gift?.tier}
          motion={still ? undefined : gift?.motion}
          still={still}
          size={size}
        />
      </div>
    </div>
  );
}

export function StaticGiftRenderer(props) {
  return <CssGiftRenderer {...props} still />;
}
