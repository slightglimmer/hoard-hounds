import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AdminIcon from './AdminIcon.jsx';

// ---------------------------------------------------------------------------
// Form field: label, control, hint and error wired together for screen readers
// ---------------------------------------------------------------------------

export function Field({ label, error, hint, optional, children, className = '' }) {
  const id = useId();
  const describedBy = [error && `${id}-error`, hint && !error && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
        {optional && <span className="ml-1 font-normal text-muted"> (optional)</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal dialog (bottom sheet on phones). Traps focus, closes on Escape.
// ---------------------------------------------------------------------------

export function Modal({ open, title, onClose, children, footer, wide = false }) {
  const panelRef = useRef(null);
  const titleId = useId();
  // Kept in a ref so a new onClose each render doesn't re-run the setup (and steal focus).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const panel = panelRef.current;
    const focusables = () =>
      [...panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
        (el) => !el.disabled && el.offsetParent !== null,
      );
    (panel.querySelector('[autofocus], input, select, textarea') || focusables()[0])?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const items = focusables();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade bg-ink/30 backdrop-blur-[2px]" onClick={() => closeRef.current()} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex max-h-[92dvh] w-full animate-sheet flex-col rounded-t-[2rem] bg-cream shadow-lift sm:rounded-[2rem] ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-6 pt-5 pb-4">
          <h2 id={titleId} className="font-display text-2xl font-semibold text-ink">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="btn-ghost h-10 min-h-10 w-10 px-0" aria-label="Close">
            <AdminIcon name="x" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

export function DemoPill() {
  return <span className="pill bg-gold/20 text-gold-deep">Demo</span>;
}

export function Spinner({ label = 'Loading' }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-petal border-t-rose-deep" aria-hidden="true" />
      {label}…
    </span>
  );
}

export function EmptyState({ icon = 'sparkle', title, children, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blush text-rose-deep">
        <AdminIcon name={icon} className="h-6 w-6" />
      </span>
      <h3 className="mt-4 font-display text-xl font-semibold">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
      <AdminIcon name="alert" className="h-5 w-5 shrink-0" />
      <span className="flex-1">{error.message || String(error)}</span>
      {onRetry && (
        <button type="button" className="font-bold underline underline-offset-2" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

// Pill-shaped option switcher (period pickers, tabs).
export function Segmented({ label, options, value, onChange }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-blush/80 p-1 [scrollbar-width:none]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-9 shrink-0 rounded-full px-3 text-sm font-semibold whitespace-nowrap transition sm:px-3.5 ${
            value === o.value ? 'bg-white text-rose-ink shadow-soft' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ eyebrow, title, children, actions }) {
  return (
    <header className="flex animate-rise flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="text-xs font-bold tracking-[0.18em] text-rose-deep uppercase">{eyebrow}</p>}
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {children && <p className="mt-1.5 text-muted">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const notify = useCallback((message, tone = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 px-4 sm:top-auto sm:bottom-4 sm:pb-[env(safe-area-inset-bottom)]" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex animate-sheet items-center gap-2.5 rounded-full px-5 py-3 text-sm font-semibold shadow-lift ${
              t.tone === 'error' ? 'bg-danger text-white' : 'bg-ink text-white'
            }`}
          >
            <AdminIcon name={t.tone === 'error' ? 'alert' : 'check'} className="h-4 w-4" strokeWidth={2.4} />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
