import { useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GiftRenderer } from './GiftRenderer';
import { NutsSymbol } from '../components/NutsSymbol';
import { unlockGiftAudio } from './GiftSoundManager';
import { useDialogEffects } from '../motion/MotionDialog';

function nuts(n) {
  return Number(n || 0).toLocaleString('de-DE');
}

export function GiftPreviewModal({ gift, onClose, onSend, sending, locked, canAfford, shortLabel }) {
  const reduce = useReducedMotion();
  const panelRef = useRef(null);
  useDialogEffects(!!gift, onClose, panelRef);
  return (
    <AnimatePresence>
      {gift ? (
    <motion.div
      className="pg-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`${gift.name} preview`}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0.01 : 0.2 }}
    >
      <button type="button" className="pg-modal__back" aria-label="Close preview" onClick={onClose} />
      <motion.div
        ref={panelRef}
        className="pg-modal__sheet"
        initial={reduce ? false : { y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 16, opacity: 0 }}
        transition={{ duration: reduce ? 0.01 : 0.26 }}
      >
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
        {canAfford === false && !locked && (
          <p className="pg-modal__desc" role="status">Not enough nuts for this gift.</p>
        )}
        <button type="button" className="pg-modal__close" onClick={onClose}>Close</button>
      </motion.div>
    </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
