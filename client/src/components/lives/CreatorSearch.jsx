import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../config/apiBase';
import { MmIcon } from '../icons/MmIcon';
import { VerifiedBadge } from '../icons/VerifiedBadge';
import { Avatar, Sheet, compact } from './LiveBits';
import CreatorSheet from './CreatorSheet';

/**
 * Find any creator on the platform by 6-digit ID, handle or display name.
 *
 * A 6-digit query is treated as an exact ID lookup rather than a fuzzy search —
 * that is the whole point of issuing the codes, and it means someone reading an
 * ID aloud lands on exactly one person.
 */
export function CreatorSearch({ open, onClose, onOpenLive }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(null);
  const inputRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 250);
    else { setQ(''); setRows([]); setPicked(null); }
  }, [open]);

  const run = useCallback((term) => {
    const value = term.trim();
    if (value.length < 2) { setRows([]); setBusy(false); return; }
    setBusy(true);
    fetch(`${API_BASE}/api/creators/search?q=${encodeURIComponent(value)}`)
      .then((r) => r.json())
      .then((d) => setRows(d?.creators || []))
      .catch(() => setRows([]))
      .finally(() => setBusy(false));
  }, []);

  const onChange = (e) => {
    const value = e.target.value.slice(0, 40);
    setQ(value);
    clearTimeout(timer.current);
    // Debounced so typing an ID does not fire six queries.
    timer.current = setTimeout(() => run(value), 260);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  const isCode = /^\d{6}$/.test(q.trim());

  return (
    <>
      <Sheet open={open && !picked} title="Find a creator" onClose={onClose} tall>
        <div className="creator-search__field">
          <MmIcon name="eye" size={16} />
          <input
            ref={inputRef}
            value={q}
            onChange={onChange}
            placeholder="6-digit ID, @handle or name"
            className="creator-search__input"
            inputMode="text"
            autoComplete="off"
            aria-label="Search creators"
          />
          {q && (
            <button type="button" className="creator-search__clear" onClick={() => { setQ(''); setRows([]); }} aria-label="Clear">
              <MmIcon name="close" size={13} />
            </button>
          )}
        </div>

        {isCode && (
          <p className="creator-search__hint">Looking up creator ID {q.trim()}</p>
        )}

        {busy && <div className="creator-sheet__msg"><div className="live-state__spinner" /></div>}

        {!busy && rows.map((c) => (
          <button key={c.id} type="button" className="live-row" onClick={() => setPicked(c.code || c.handle)}>
            <Avatar className="live-row__avatar" src={c.avatarUrl} name={c.handle} />
            <span className="live-row__main">
              <span className="live-row__name">
                {c.displayName}
                {c.verified && <VerifiedBadge size={12} />}
                {c.isLive && <span className="creator-search__live">LIVE</span>}
              </span>
              <span className="live-row__sub">
                @{c.handle}{c.code ? ` · ID ${c.code}` : ''}
              </span>
            </span>
            {c.tier && <span className="live-row__tail">{c.tier.label}</span>}
          </button>
        ))}

        {!busy && q.trim().length >= 2 && !rows.length && (
          <p className="creator-sheet__msg creator-sheet__msg--quiet">
            No creator matches “{q.trim()}”.
          </p>
        )}

        {q.trim().length < 2 && (
          <p className="creator-sheet__msg creator-sheet__msg--quiet">
            Every creator has a 6-digit ID. Type one to jump straight to them.
          </p>
        )}
      </Sheet>

      <CreatorSheet
        open={!!picked}
        creatorKey={picked}
        onClose={() => setPicked(null)}
        onWatchLive={(id) => { setPicked(null); onClose?.(); onOpenLive?.(id); }}
      />
    </>
  );
}

export default CreatorSearch;
