import { useMemo, useState } from 'react';
import AdminIcon from '../../components/AdminIcon.jsx';
import { DemoBanner } from '../../components/AdminLayout.jsx';
import { DemoPill, EmptyState, ErrorNote, PageHeader, Segmented, Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api/index.js';
import { formatDate, todayISO } from '../../lib/dates.js';
import { formatCents } from '../../lib/money.js';
import { byJob, customerTypeLabel, jobMoney, jobStatus } from '../../lib/jobs.js';
import { useQuery } from '../../lib/useQuery.js';
import JobDetail from './JobDetail.jsx';
import { CustomerForm } from './JobForms.jsx';

const TABS = [
  { value: '/jobs', label: 'Jobs' },
  { value: '/jobs/customers', label: 'Customers' },
];

const FILTERS = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

// Joins each job with its customer and money so the list can sort and summarize.
function useJobRows(data) {
  return useMemo(() => {
    if (!data) return null;
    const fin = new Map(data.financials.map((f) => [f.job_id, f]));
    const pays = byJob(data.payments);
    const costs = byJob(data.expenses);
    const hours = byJob(data.timeEntries);
    const custs = new Map(data.customers.map((c) => [c.id, c]));
    return data.jobs.map((job) => ({
      job,
      customer: custs.get(job.customer_id) ?? null,
      money: jobMoney({ financials: fin.get(job.id), payments: pays.get(job.id), expenses: costs.get(job.id), timeEntries: hours.get(job.id) }),
    }));
  }, [data]);
}

function JobsList({ rows, error, loading, reload }) {
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const year = todayISO().slice(0, 4);

  const shown = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    const list = rows.filter(({ job, customer }) => {
      const s = jobStatus(job.status);
      const matches = filter === 'all' || (filter === 'active' ? s.open : job.status === filter);
      const text = [job.title, job.property_address, customer?.full_name, customer?.company].filter(Boolean).join(' ').toLowerCase();
      return matches && (!q || text.includes(q));
    });
    // Active work: soonest first (no date last). Finished work: newest first.
    return list.sort((a, b) => {
      if (filter === 'active') return (a.job.scheduled_date || '9999') < (b.job.scheduled_date || '9999') ? -1 : 1;
      const da = a.job.completed_date || a.job.scheduled_date || '';
      const db = b.job.completed_date || b.job.scheduled_date || '';
      return da < db ? 1 : -1;
    });
  }, [rows, filter, search]);

  const summary = useMemo(() => {
    if (!rows) return null;
    const active = rows.filter((r) => jobStatus(r.job.status).open).length;
    const owed = rows.filter((r) => r.job.status !== 'cancelled' && r.money.balance > 0).reduce((s, r) => s + r.money.balance, 0);
    const profit = rows
      .filter((r) => r.job.status === 'completed' && (r.job.completed_date || '').startsWith(year))
      .reduce((s, r) => s + r.money.profit, 0);
    return { active, owed, profit };
  }, [rows, year]);

  return (
    <div className="space-y-5">
      {summary && (
        <section aria-label="Job totals" className="grid grid-cols-3 gap-3">
          {[
            { label: 'Active jobs', value: String(summary.active), tone: '' },
            { label: 'Owed to you', value: formatCents(summary.owed), tone: summary.owed > 0 ? 'text-gold-deep' : '' },
            { label: `Job profit in ${year}`, value: formatCents(summary.profit), tone: summary.profit < 0 ? 'text-danger' : 'text-rose-ink' },
          ].map((s, i) => (
            <div key={s.label} className="card animate-rise p-4 sm:p-5" style={{ animationDelay: `${i * 50}ms` }}>
              <p className="text-xs font-semibold text-muted sm:text-sm">{s.label}</p>
              <p className={`mt-1 font-display text-xl font-semibold tabular sm:text-2xl ${s.tone}`}>{s.value}</p>
            </div>
          ))}
        </section>
      )}

      <div className="card animate-rise flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <Segmented label="Show" options={FILTERS} value={filter} onChange={setFilter} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative block">
            <span className="sr-only">Search jobs</span>
            <AdminIcon name="search" className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
            <input type="search" placeholder="Search jobs" className="input min-h-10 py-2 pl-10 sm:w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <a href="#/jobs/new" className="btn-primary">
            <AdminIcon name="plus" className="h-4 w-4" strokeWidth={2.4} />
            New job
          </a>
        </div>
      </div>

      <ErrorNote error={error} onRetry={reload} />

      {!rows ? (
        <div className="card flex h-48 items-center justify-center">{loading && <Spinner />}</div>
      ) : shown.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="truck"
            title={rows.length ? 'Nothing here' : 'No jobs yet'}
            action={!rows.length && <a href="#/jobs/new" className="btn-soft">Add your first job</a>}
          >
            {rows.length ? 'Try another filter or search.' : 'Add a job, or open an accepted estimate and tap “Turn into a job”.'}
          </EmptyState>
        </div>
      ) : (
        <ul className="card animate-rise divide-y divide-line overflow-hidden" style={{ animationDelay: '80ms' }}>
          {shown.map(({ job, customer, money }) => {
            const s = jobStatus(job.status);
            const date = job.status === 'completed' ? job.completed_date || job.scheduled_date : job.scheduled_date;
            const overdue = s.open && job.scheduled_date && job.scheduled_date < todayISO() && job.status !== 'in_progress';
            return (
              <li key={job.id}>
                <a href={`#/jobs/${job.id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-blush/40">
                  <span className="hidden w-14 shrink-0 text-center sm:block">
                    {date ? (
                      <span className="text-xs leading-tight font-semibold text-muted uppercase">
                        {formatDate(date, { month: 'short' })}
                        <span className="block font-display text-xl text-ink">{formatDate(date, { day: 'numeric' })}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted">No date</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{job.title}</span>
                      {job.is_demo && <DemoPill />}
                    </span>
                    <span className="block truncate text-sm text-muted">
                      <span className="sm:hidden">{date ? `${formatDate(date)} · ` : ''}</span>
                      {[customer?.full_name, job.property_address].filter(Boolean).join(' · ') || 'No customer yet'}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-display text-lg font-semibold tabular">
                      {money.agreed !== null ? formatCents(money.agreed) : money.quoted !== null ? formatCents(money.quoted) : '—'}
                    </span>
                    <span className="flex flex-wrap justify-end gap-1">
                      {money.balance > 0 && job.status !== 'cancelled' && <span className="pill bg-gold/20 text-gold-deep">Owes {formatCents(money.balance)}</span>}
                      <span className={`pill ${overdue ? 'bg-danger/10 text-danger' : s.className}`}>{overdue ? `${s.label} · past date` : s.label}</span>
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CustomersPanel({ data, rows, reload }) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const stats = useMemo(() => {
    const m = new Map();
    for (const r of rows ?? []) {
      if (!r.job.customer_id) continue;
      const s = m.get(r.job.customer_id) ?? { jobs: 0, paid: 0 };
      s.jobs += 1;
      s.paid += r.money.received;
      m.set(r.job.customer_id, s);
    }
    return m;
  }, [rows]);
  if (!data) return <div className="card flex h-48 items-center justify-center"><Spinner /></div>;

  const q = search.trim().toLowerCase();
  const shown = data.customers.filter((c) => !q || [c.full_name, c.company, c.email, c.phone].filter(Boolean).join(' ').toLowerCase().includes(q));
  const editingId = editing && editing !== 'new' ? editing.id : null;

  return (
    <div className="space-y-5">
      <div className="card animate-rise flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <label className="relative block">
          <span className="sr-only">Search customers</span>
          <AdminIcon name="search" className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
          <input type="search" placeholder="Search customers" className="input min-h-10 py-2 pl-10 sm:w-72" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
          <AdminIcon name="plus" className="h-4 w-4" strokeWidth={2.4} />
          Add a customer
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="card">
          <EmptyState icon="users" title={data.customers.length ? 'No matches' : 'No customers yet'}>
            {data.customers.length ? 'Try a different search.' : 'Customers are added here, or right from a job.'}
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {shown.map((c, i) => {
            const s = stats.get(c.id) ?? { jobs: 0, paid: 0 };
            return (
              <li key={c.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                <button type="button" onClick={() => setEditing(c)} className="card flex h-full w-full flex-col p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lift">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-display text-lg font-semibold">{c.full_name}</span>
                      <span className="block truncate text-sm text-muted">{[c.company, customerTypeLabel(c.customer_type)].filter(Boolean).join(' · ') || 'Customer'}</span>
                    </span>
                    {c.is_demo && <DemoPill />}
                  </span>
                  {(c.phone || c.email) && <span className="mt-2 truncate text-sm">{[c.phone, c.email].filter(Boolean).join(' · ')}</span>}
                  <span className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="pill bg-blush text-rose-ink">{s.jobs} {s.jobs === 1 ? 'job' : 'jobs'}</span>
                    {s.paid !== 0 && <span className="pill bg-sage/25 text-sage-deep">{formatCents(s.paid)} paid</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <CustomerForm
        open={editing !== null}
        customer={editing === 'new' ? null : editing}
        jobCount={editingId ? stats.get(editingId)?.jobs ?? 0 : 0}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
    </div>
  );
}

export default function JobsPage({ route }) {
  const detailId = route.match(/^\/jobs\/([\w-]+)$/)?.[1];
  const jobId = detailId && detailId !== 'customers' ? detailId : null;
  const tab = route.startsWith('/jobs/customers') ? '/jobs/customers' : '/jobs';
  const { data, error, loading, reload } = useQuery(() => (jobId ? Promise.resolve(null) : api.listJobsWithMoney()), [jobId]);
  const rows = useJobRows(data);

  return (
    <div className="space-y-6">
      <DemoBanner />
      <PageHeader eyebrow="Work" title="Jobs">
        Every cleanout from first call to final payment, with what it cost and what you made.
      </PageHeader>

      {!jobId && (
        <nav aria-label="Jobs sections" className="animate-rise">
          <ul className="inline-flex gap-1 rounded-full bg-blush/80 p-1">
            {TABS.map((t) => (
              <li key={t.value}>
                <a
                  href={`#${t.value}`}
                  aria-current={tab === t.value ? 'page' : undefined}
                  className={`inline-flex min-h-9 items-center rounded-full px-4 text-sm font-semibold transition ${tab === t.value ? 'bg-white text-rose-ink shadow-soft' : 'text-muted hover:text-ink'}`}
                >
                  {t.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {jobId ? (
        <JobDetail key={jobId} id={jobId} />
      ) : tab === '/jobs/customers' ? (
        <>
          <ErrorNote error={error} onRetry={reload} />
          <CustomersPanel data={data} rows={rows} reload={reload} />
        </>
      ) : (
        <JobsList rows={rows} error={error} loading={loading} reload={reload} />
      )}
    </div>
  );
}
