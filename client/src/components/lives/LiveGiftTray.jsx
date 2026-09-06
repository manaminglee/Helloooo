import { useEffect, useState } from 'react';
import { NutsSymbol } from '../NutsSymbol';
import { Sheet } from './LiveBits';
import { GiftCatalogPanel, loadGiftCatalog } from '../../gifts/GiftCatalogPanel';

function nuts(n) {
  return Number(n || 0).toLocaleString('de-DE');
}

export function LiveGiftTray({
  open,
  onClose,
  onSend,
  balance = 0,
  level = 0,
  battle = null,
  onRecharge,
}) {
  const [side, setSide] = useState('A');
  const [shortfall, setShortfall] = useState(null);
  const [topName, setTopName] = useState('');

  useEffect(() => {
    if (!open) { setShortfall(null); return undefined; }
    loadGiftCatalog().then((c) => {
      const top = (c.gifts || []).reduce((b, g) => (!b || g.cost > b.cost ? g : b), null);
      setTopName(top ? `${top.name}, ${nuts(top.cost)} Nuts` : '');
    });
  }, [open]);

  return (
    <Sheet
      open={open}
      className="live-sheet--gifts"
      title={topName ? `Chasing the top gift — ${topName}` : 'Send a gift'}
      onClose={onClose}
      tall
    >
      {shortfall ? (
        <div className="live-recharge">
          <NutsSymbol size={40} />
          <p className="live-recharge__title">Not enough Nuts</p>
          <p className="live-recharge__sub">You need {nuts(shortfall)} more.</p>
          <button type="button" className="live-recharge__btn" onClick={() => onRecharge?.(shortfall)}>
            Top up
          </button>
          <button type="button" className="live-chip" onClick={() => setShortfall(null)}>
            Pick another gift
          </button>
        </div>
      ) : (
        <GiftCatalogPanel
          open={open}
          balance={balance}
          level={level}
          onSend={async (gift) => {
            const res = await onSend?.(gift.id, battle ? side : 'A', gift);
            if (res?.insufficient) {
              setShortfall(Math.max(1, (res.needed || gift.cost) - (res.balance ?? balance)));
            }
            if (res?.ok) onClose?.();
            return res;
          }}
          headerSlot={battle ? (
            <div className="gt-tabs gt-tabs--battle">
              <button type="button" className={`gt-tab${side === 'A' ? ' gt-tab--on' : ''}`} onClick={() => setSide('A')}>
                @{battle.handleA}
              </button>
              <button type="button" className={`gt-tab${side === 'B' ? ' gt-tab--on' : ''}`} onClick={() => setSide('B')}>
                @{battle.handleB}
              </button>
            </div>
          ) : null}
        />
      )}
    </Sheet>
  );
}

export default LiveGiftTray;
