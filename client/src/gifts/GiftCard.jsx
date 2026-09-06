import { memo } from 'react';
import { GiftRenderer } from './GiftRenderer';
import { useVisibleGiftPreview } from './useVisibleGiftPreview';
import { NutsSymbol } from '../components/NutsSymbol';

function nuts(n) {
  return Number(n || 0).toLocaleString('de-DE');
}

export const GiftCard = memo(function GiftCard({
  gift,
  selected,
  affordable = true,
  locked = false,
  still = false,
  favorited = false,
  onSelect,
  onFavorite,
  quality,
}) {
  const { ref, visible } = useVisibleGiftPreview(!still);
  const paused = still || !visible;

  return (
    <button
      ref={ref}
      type="button"
      className={[
        'pg-card',
        `pg-card--${gift.rarity || gift.tier || 'common'}`,
        selected ? 'pg-card--on' : '',
        locked ? 'pg-card--locked' : '',
        !affordable && !locked ? 'pg-card--poor' : '',
      ].filter(Boolean).join(' ')}
      onClick={() => onSelect?.(gift)}
      aria-pressed={selected}
      aria-label={`${gift.name}, ${nuts(gift.cost)} Nuts${locked ? `, locked until level ${gift.minLevel}` : ''}`}
    >
      {gift.lucky && <span className="pg-card__lucky">Lucky</span>}
      {gift.minLevel > 0 && <span className="pg-card__lv">Lv{gift.minLevel}</span>}
      {onFavorite && (
        <span
          className={`pg-card__fav${favorited ? ' is-on' : ''}`}
          role="presentation"
          onClick={(e) => { e.stopPropagation(); onFavorite(gift.id); }}
        >
          {favorited ? '♥' : '♡'}
        </span>
      )}
      <span className="pg-card__art">
        <GiftRenderer gift={gift} mode="preview" still={paused} quality={quality} size={56} />
      </span>
      <span className="pg-card__name">{gift.name}</span>
      <span className="pg-card__cost">
        <NutsSymbol size={11} />
        {nuts(gift.cost)}
      </span>
    </button>
  );
});
