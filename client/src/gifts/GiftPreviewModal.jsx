import { GiftRenderer } from './GiftRenderer';
import { NutsSymbol } from '../components/NutsSymbol';
import { unlockGiftAudio } from './GiftSoundManager';

function nuts(n) {
  return Number(n || 0).toLocaleString('de-DE');
}

export function GiftPreviewModal({ gift, onClose, onSend, sending, locked, canAfford, shortLabel }) {
  if (!gift) return null;
  return (
    <div className="pg-modal" role="dialog" aria-modal="true" aria-label={`${gift.name} preview`}>
      <button type="button" className="pg-modal__back" aria-label="Close preview" onClick={onClose} />
      <div className="pg-modal__sheet">
        <div className={`pg-modal__stage pg-card--${gift.rarity || 'common'}`}>
          <GiftRenderer gift={gift} mode="preview" size={120} />
        </div>
        <p className="pg-modal__name">{gift.name}</p>
        <p className="pg-modal__rarity">{gift.rarity || gift.tier}</p>
        {gift.description && <p className="pg-modal__desc">{gift.description}</p>}
        <p className="pg-modal__cost">
          <NutsSymbol size={16} />
          {nuts(gift.cost)}
        </p>
        <button
          type="button"
          className="pg-modal__send"
          disabled={sending || locked || !canAfford}
          onClick={() => { unlockGiftAudio(); onSend?.(gift); }}
        >
          {locked ? `Unlocks at Lv${gift.minLevel}` : `SEND • ${nuts(gift.cost)}`}
        </button>
        {shortLabel}
        <button type="button" className="pg-modal__close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
