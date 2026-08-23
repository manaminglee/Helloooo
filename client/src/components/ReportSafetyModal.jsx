import { useState, useEffect, useRef, useCallback } from 'react';

const REASONS = [
  { id: 'harassment', label: 'Harassment or hate' },
  { id: 'sexual', label: 'Sexual or explicit content' },
  { id: 'spam', label: 'Spam or scams' },
  { id: 'minor_safety', label: 'Minor safety concern' },
  { id: 'other', label: 'Other' },
];

/**
 * Report + optional block. Anonymous: no account required; reports use session/connection context only.
 * Calls onSubmit({ reason, block }) once when user confirms; onClose when dismissed.
 */
export function ReportSafetyModal({
  open,
  onClose,
  onSubmit,
  title = 'Report',
  subtitle = 'You stay anonymous. We review reports and may act on IP / connection patterns — we do not store chat logs for marketing.',
  prepend,
}) {
  const [reason, setReason] = useState('harassment');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [phase, setPhase] = useState('form'); // 'form' | 'done'
  const panelRef = useRef(null);
  const closeBtnRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setPhase('form');
      return;
    }
    setPhase('form');
    const t = requestAnimationFrame(() => closeBtnRef.current?.focus?.());
    return () => cancelAnimationFrame(t);
  }, [open]);

  const handleClose = useCallback(() => {
    setPhase('form');
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!open || phase !== 'form') return;
    const el = panelRef.current;
    if (!el) return;
    const focusables = el.querySelectorAll('button, [href], select, input, textarea, [tabindex]:not([tabindex="-1"])');
    const list = [...focusables].filter((n) => !n.disabled && n.offsetParent !== null);
    const onKey = (e) => {
      if (e.key !== 'Tab' || list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [open, phase]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl"
      onClick={handleClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
        className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0c0e14] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {phase === 'form' ? (
          <>
            <h3 id="report-modal-title" className="text-lg font-black uppercase tracking-wide text-white mb-1">
              {title}
            </h3>
            <p className="text-[11px] text-white/45 leading-relaxed mb-5">{subtitle}</p>

            {prepend}

            <label className="block text-[10px] font-black uppercase tracking-widest text-white/35 mb-2" htmlFor="mm-report-reason">
              Reason
            </label>
            <select
              id="mm-report-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full mb-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-rose-500/40"
            >
              {REASONS.map((r) => (
                <option key={r.id} value={r.id} className="bg-[#111]">
                  {r.label}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-3 cursor-pointer mb-6">
              <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} className="rounded border-white/20" />
              <span className="text-[12px] text-white/70">Also block this connection from matching me again (this device / network)</span>
            </label>

            <div className="flex gap-3">
              <button ref={closeBtnRef} type="button" onClick={handleClose} className="flex-1 rounded-2xl border border-white/10 py-3 text-[11px] font-black uppercase text-white/50 hover:bg-white/5">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onSubmit?.({ reason, block: alsoBlock });
                  setPhase('done');
                }}
                className="flex-1 rounded-2xl bg-rose-600 py-3 text-[11px] font-black uppercase text-white hover:bg-rose-500"
              >
                Submit report
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-2">
            <div className="text-3xl mb-3" aria-hidden>✓</div>
            <h3 className="text-lg font-black uppercase tracking-wide text-white mb-2">Report received</h3>
            <p className="text-[11px] text-white/50 leading-relaxed mb-6">
              Thanks for helping keep Helloooo safe. Moderators review anonymous reports; we never sell personal data. You can leave this call whenever you want (Next / Leave).
            </p>
            <button type="button" onClick={handleClose} className="w-full rounded-2xl bg-white/10 border border-white/10 py-3 text-[11px] font-black uppercase text-white hover:bg-white/15">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
