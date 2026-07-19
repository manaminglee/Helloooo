import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/**
 * Toast.jsx — Global toast system for Mana Mingle.
 *
 * Usage:
 *   <ToastProvider>…<App/>…</ToastProvider>
 *   const { toast } = useToast();
 *   toast('Saved!', { type: 'success', duration: 4000 });
 *
 * types: 'info' | 'success' | 'error' | 'warn'
 * Stacked top-center (mobile-safe), auto-dismiss, max 3 visible.
 */

const ToastContext = createContext({ toast: () => 0, dismiss: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 4000;
const EXIT_MS = 220;

let idSeq = 0;

const TYPE_STYLES = {
  info: {
    icon: 'ℹ️',
    bar: 'from-violet-400 to-cyan-400',
    text: 'text-white/90',
  },
  success: {
    icon: '✓',
    bar: 'from-emerald-400 to-teal-400',
    text: 'text-emerald-100',
  },
  error: {
    icon: '✕',
    bar: 'from-rose-400 to-red-400',
    text: 'text-rose-100',
  },
  warn: {
    icon: '⚠️',
    bar: 'from-amber-400 to-orange-400',
    text: 'text-amber-100',
  },
};

function ToastItem({ toast, onClose }) {
  const style = TYPE_STYLES[toast.type] || TYPE_STYLES.info;
  return (
    <div
      className={`pointer-events-auto relative flex items-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-black/85 py-3 pl-4 pr-2 shadow-[0_8px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl ${toast.leaving ? 'mm-toast-out' : 'mm-toast-in'}`}
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${style.bar}`}
      />
      <span aria-hidden className={`text-sm font-black ${style.text}`}>{style.icon}</span>
      <p className="min-w-0 flex-1 break-words text-xs font-semibold leading-relaxed text-white/85">
        {toast.message}
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss notification"
        className="ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white/35 transition-colors hover:bg-white/5 hover:text-white"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    // Cancel any pending auto-dismiss timer for this toast
    const autoTimer = timersRef.current.get(id);
    if (autoTimer) {
      clearTimeout(autoTimer);
      timersRef.current.delete(id);
    }
    if (timersRef.current.has(`exit-${id}`)) return; // already leaving
    setToasts((prev) => {
      const target = prev.find((t) => t.id === id);
      if (!target || target.leaving) return prev;
      return prev.map((t) => (t.id === id ? { ...t, leaving: true } : t));
    });
    // Remove after the exit animation completes
    const removalTimer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timersRef.current.delete(`exit-${id}`);
    }, EXIT_MS);
    timersRef.current.set(`exit-${id}`, removalTimer);
  }, []);

  const toast = useCallback((message, opts = {}) => {
    const { type = 'info', duration = DEFAULT_DURATION } = opts || {};
    const id = ++idSeq;
    setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { id, message: String(message), type, leaving: false }]);
    if (duration > 0) {
      const t = setTimeout(() => dismiss(id), duration);
      timersRef.current.set(id, t);
    }
    return id;
  }, [dismiss]);

  // Clean up all pending timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-0 z-[9998] flex flex-col items-center gap-2 px-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-4"
      >
        <div className="flex w-full max-w-sm flex-col gap-2">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
