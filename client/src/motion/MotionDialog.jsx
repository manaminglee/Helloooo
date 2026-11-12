import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

let scrollLocks = 0;
let previousOverflow = '';

function lockBodyScroll() {
  scrollLocks += 1;
  if (scrollLocks === 1) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
}

function unlockBodyScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.style.overflow = previousOverflow;
}

/** Escape, focus trap, scroll lock, and focus restore for dialogs that own their markup. */
export function useDialogEffects(open, onClose, panelRef) {
  const reduce = useReducedMotion();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const restoreRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;
    lockBodyScroll();
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef?.current;
      if (!panel) return;
      const list = [...panel.querySelectorAll(FOCUSABLE)].filter((node) => !node.disabled);
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    const focusTimer = window.setTimeout(() => {
      const panel = panelRef?.current;
      const preferred = panel?.querySelector('[data-autofocus], input, select, textarea, button');
      preferred?.focus?.();
    }, reduce ? 0 : 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(focusTimer);
      unlockBodyScroll();
      restoreRef.current?.focus?.();
    };
  }, [open, reduce, panelRef]);
}

const ease = [0.22, 1, 0.36, 1];

/**
 * Accessible dialog: backdrop fade, panel enter/exit, Escape, focus trap,
 * scroll lock, and focus restore. Respects prefers-reduced-motion.
 */
export function MotionDialog({
  open,
  onClose,
  children,
  titleId,
  label,
  className = 'mm-modal-surface',
  overlayClassName = '',
  sheet = false,
  closeOnBackdrop = true,
  as = 'div',
  panelProps = {},
}) {
  const reduce = useReducedMotion();
  const panelRef = useRef(null);
  const restoreRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;
    lockBodyScroll();

    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const root = panelRef.current;
      if (!root) return;
      const list = [...root.querySelectorAll(FOCUSABLE)].filter(
        (node) => !node.disabled && node.getAttribute('aria-hidden') !== 'true'
      );
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    const focusTimer = window.setTimeout(() => {
      const root = panelRef.current;
      if (!root) return;
      const preferred = root.querySelector('[data-autofocus]')
        || root.querySelector('input, select, textarea, button');
      preferred?.focus?.();
    }, reduce ? 0 : 40);

    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(focusTimer);
      unlockBodyScroll();
      const previous = restoreRef.current;
      if (previous && typeof previous.focus === 'function') {
        previous.focus();
      }
    };
  }, [open, reduce]);

  const Panel = as === 'form' ? motion.form : motion.div;
  const overlayMotion = reduce
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
  const panelMotion = reduce
    ? { initial: false, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 } }
    : sheet
      ? {
          initial: { opacity: 0, y: 28 },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 0, y: 20 },
        }
      : {
          initial: { opacity: 0, y: 14, scale: 0.98 },
          animate: { opacity: 1, y: 0, scale: 1 },
          exit: { opacity: 0, y: 8, scale: 0.985 },
        };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="mm-dialog"
          className={`mm-modal-overlay${sheet ? ' mm-modal-overlay--sheet' : ''} ${overlayClassName}`.trim()}
          role="presentation"
          onClick={() => {
            if (closeOnBackdrop) onCloseRef.current?.();
          }}
          {...overlayMotion}
          transition={{ duration: reduce ? 0.01 : 0.22, ease }}
        >
          <Panel
            {...panelProps}
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId || undefined}
            aria-label={titleId ? undefined : label}
            className={className}
            onClick={(event) => {
              event.stopPropagation();
              panelProps.onClick?.(event);
            }}
            {...panelMotion}
            transition={{ duration: reduce ? 0.01 : 0.28, ease }}
          >
            {children}
          </Panel>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

export function PageTransition({ pageKey, children }) {
  const reduce = useReducedMotion();
  const skipEnter = useRef(true);

  useEffect(() => {
    skipEnter.current = false;
  }, []);

  const enter = reduce || skipEnter.current ? false : { opacity: 0 };
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pageKey}
        className="sol-page"
        initial={enter}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduce ? 0.01 : 0.22, ease }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
