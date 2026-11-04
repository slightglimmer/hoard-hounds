import { useEffect, useState } from 'react';
import { useToast } from './ui.jsx';
import { api } from '../lib/api/index.js';
import { useQuery } from '../lib/useQuery.js';
import { LogoMark } from '../../components/Logo.jsx';
import AdminIcon from './AdminIcon.jsx';
import { useAuth } from '../lib/auth.jsx';
import { MODE } from '../lib/supabase.js';

export const NAV = [
  { path: '/overview', label: 'Overview', icon: 'overview' },
  { path: '/expenses', label: 'Expenses', icon: 'receipt' },
  { path: '/price-sheet', label: 'Price Sheet', icon: 'tag', soon: true },
  { path: '/jobs', label: 'Jobs', icon: 'truck', soon: true },
  { path: '/employees', label: 'Employees', icon: 'users', soon: true },
  { path: '/reports', label: 'Reports', icon: 'chart', soon: true },
];

function Brand() {
  return (
    <a href="#/overview" className="flex items-center gap-3 rounded-2xl">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-soft">
        <LogoMark className="h-8 w-8" />
      </span>
      <span className="leading-tight">
        <span className="block font-display text-lg font-semibold">Hoard Hounds</span>
        <span className="block text-xs font-semibold tracking-[0.16em] text-rose-deep uppercase">Business Studio</span>
      </span>
    </a>
  );
}

function NavList({ route, onNavigate }) {
  return (
    <ul className="space-y-1">
      {NAV.map((item) => {
        const active = route === item.path || route.startsWith(`${item.path}/`);
        return (
          <li key={item.path}>
            <a
              href={`#${item.path}`}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={`group flex min-h-11 items-center gap-3 rounded-2xl px-3.5 text-[0.95rem] font-semibold transition ${
                active ? 'bg-white text-rose-ink shadow-soft' : 'text-muted hover:bg-white/60 hover:text-ink'
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
                  active ? 'bg-rose-deep text-white' : 'bg-blush text-rose-deep group-hover:bg-petal'
                }`}
              >
                <AdminIcon name={item.icon} className="h-[18px] w-[18px]" />
              </span>
              <span className="flex-1">{item.label}</span>
              {item.soon && <span className="pill bg-blush text-muted">Soon</span>}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function Account() {
  const { user, signOut } = useAuth();
  return (
    <div className="rounded-3xl bg-white/70 p-3.5">
      <p className="truncate text-sm font-semibold" title={user?.email}>
        {user?.email}
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
        <AdminIcon name="shield" className="h-3.5 w-3.5 text-sage-deep" />
        {MODE === 'live' ? 'Admin · two-step verified' : 'Demo account'}
      </p>
      {MODE === 'live' && (
        <button type="button" onClick={signOut} className="btn-ghost mt-3 min-h-10 w-full">
          <AdminIcon name="logout" className="h-4 w-4" />
          Sign out
        </button>
      )}
    </div>
  );
}

// In live mode, shows only when the database still has rows from supabase/seed_demo.sql.
function SampleRowsBanner() {
  const notify = useToast();
  const { data: hasDemo, reload } = useQuery(() => api.hasDemoData(), []);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!hasDemo) return null;

  async function clear() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    try {
      const n = await api.clearDemoData();
      notify(`Removed ${n} sample ${n === 1 ? 'record' : 'records'}`);
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      notify(err.message, 'error');
      setBusy(false);
      setConfirming(false);
      reload();
    }
  }

  return (
    <div className="flex animate-rise flex-col gap-3 rounded-3xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm sm:flex-row sm:items-center">
      <AdminIcon name="info" className="hidden h-5 w-5 shrink-0 text-gold-deep sm:block" />
      <p className="flex-1">
        <strong className="font-bold">Your database includes sample records</strong>, marked <em>Demo</em>. Remove them
        before you start entering real numbers. Your own records and categories are kept.
      </p>
      <button type="button" onClick={clear} disabled={busy} className={confirming ? 'btn-danger' : 'btn-ghost'}>
        {busy ? 'Removing…' : confirming ? 'Yes, remove sample data' : 'Clear demo data'}
      </button>
    </div>
  );
}

export function DemoBanner() {
  if (MODE === 'live') return <SampleRowsBanner />;
  if (MODE !== 'demo') return null;
  return (
    <div className="flex animate-rise items-start gap-3 rounded-3xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
      <AdminIcon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-gold-deep" />
      <p>
        <strong className="font-bold">Demo mode: sample data only.</strong> Every number here is made up so you can try the
        dashboard. Nothing you add is saved, and it resets when you reload.
      </p>
    </div>
  );
}

export default function AdminLayout({ route, children }) {
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [route]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17.5rem_1fr]">
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-full focus:bg-rose-deep focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-8 border-r border-line/70 bg-blush/45 px-5 py-7 backdrop-blur lg:flex">
        <Brand />
        <nav aria-label="Admin" className="flex-1">
          <NavList route={route} />
        </nav>
        <Account />
      </aside>

      {/* Phone and tablet top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-line/70 bg-cream/85 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <button
          type="button"
          className="btn-ghost h-11 w-11 px-0"
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="admin-drawer"
          onClick={() => setOpen(true)}
        >
          <AdminIcon name="menu" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade bg-ink/30" onClick={() => setOpen(false)} aria-hidden="true" />
          <div id="admin-drawer" role="dialog" aria-modal="true" aria-label="Menu" className="absolute inset-y-0 right-0 flex w-[min(20rem,88vw)] animate-sheet flex-col gap-6 bg-cream px-5 py-5 shadow-lift">
            <div className="flex items-center justify-between">
              <span className="font-display text-xl font-semibold">Menu</span>
              <button type="button" className="btn-ghost h-11 w-11 px-0" aria-label="Close menu" onClick={() => setOpen(false)} autoFocus>
                <AdminIcon name="x" />
              </button>
            </div>
            <nav aria-label="Admin" className="flex-1 overflow-y-auto">
              <NavList route={route} onNavigate={() => setOpen(false)} />
            </nav>
            <Account />
          </div>
        </div>
      )}

      <main id="main" tabIndex={-1} className="mx-auto outline-none w-full max-w-6xl px-4 pt-6 pb-24 sm:px-6 lg:px-10 lg:pt-10">
        {children}
      </main>
    </div>
  );
}
