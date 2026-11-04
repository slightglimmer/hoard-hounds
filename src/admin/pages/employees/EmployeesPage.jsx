import { useMemo, useState } from 'react';
import AdminIcon from '../../components/AdminIcon.jsx';
import { DemoBanner } from '../../components/AdminLayout.jsx';
import { DemoPill, EmptyState, ErrorNote, PageHeader, Segmented, Spinner, useToast } from '../../components/ui.jsx';
import { api } from '../../lib/api/index.js';
import { downloadCsv, toCsv } from '../../lib/csv.js';
import { formatDate, periodRange } from '../../lib/dates.js';
import { formatCents, formatMoney } from '../../lib/money.js';
import { HOUR_PERIODS, TIME_STATUSES, dayName, formatHours, totalsByEmployee, wageCents, weekRange } from '../../lib/employees.js';
import { useQuery } from '../../lib/useQuery.js';
import { EmployeeForm, TimeEntryForm } from './EmployeeForms.jsx';

const TABS = [
  { value: '/employees', label: 'Team' },
  { value: '/employees/hours', label: 'Hours' },
];

const rangeFor = (period) =>
  period === 'this_week' ? weekRange(0) : period === 'last_week' ? weekRange(-1) : periodRange(period);

const WAGE_NOTE = 'Estimated gross wages are hours × hourly rate, before taxes and deductions. Use your payroll provider for actual pay.';

function TeamPanel({ employees, reloadEmployees }) {
  const [editing, setEditing] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const week = weekRange(0);
  const month = periodRange('this_month');
  // One fetch covers this week and this month.
  const from = week.from < month.from ? week.from : month.from;
  const to = week.to > month.to ? week.to : month.to;
  const { data: hours } = useQuery(() => api.listHours({ from, to }), [from, to]);
  const weekTotals = useMemo(() => totalsByEmployee((hours ?? []).filter((t) => t.work_date >= week.from && t.work_date <= week.to)), [hours, week.from, week.to]);
  const monthTotals = useMemo(() => totalsByEmployee((hours ?? []).filter((t) => t.work_date >= month.from && t.work_date <= month.to)), [hours, month.from, month.to]);
  const shown = employees.filter((e) => showInactive || e.active);
  const inactiveCount = employees.filter((e) => !e.active).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-3xl bg-gradient-to-r from-blush to-petal/60 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm text-rose-ink">
          Add the people who work with you and their hourly rate. Log their hours on each job to see your real labor cost.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="#/employees/hours" className="btn-ghost">
            <AdminIcon name="calendar" className="h-4 w-4" />
            Hours
          </a>
          <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
            <AdminIcon name="plus" className="h-4 w-4" strokeWidth={2.4} />
            Add a crew member
          </button>
        </div>
      </div>

      {employees.length === 0 ? (
        <div className="card">
          <EmptyState icon="users" title="No crew members yet" action={<button type="button" className="btn-soft" onClick={() => setEditing('new')}>Add your first crew member</button>}>
            Working solo for now? That’s fine. Add people here when you bring on help.
          </EmptyState>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((emp, i) => {
              const w = weekTotals.get(emp.id);
              const m = monthTotals.get(emp.id);
              return (
                <li key={emp.id} className="min-w-0 animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
                  <button type="button" onClick={() => setEditing(emp)} className={`card flex h-full w-full flex-col p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lift ${emp.active ? '' : 'opacity-70'}`}>
                    <span className="flex items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-petal font-display text-lg font-semibold text-rose-ink" aria-hidden="true">
                        {emp.full_name.replace(/^Sample (Crew (Lead|Member) )?/, '').charAt(0)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-lg font-semibold">{emp.full_name}</span>
                        <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                          {emp.hourly_rate !== null && emp.hourly_rate !== '' ? `${formatMoney(emp.hourly_rate)} / hr` : 'No rate set'}
                          {emp.is_demo && <DemoPill />}
                        </span>
                      </span>
                    </span>
                    <span className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <span className="rounded-2xl bg-blush/60 px-3 py-2">
                        <span className="block text-xs text-muted">This week</span>
                        <span className="font-semibold tabular">{w ? formatHours(w.hours) : '0 hrs'}</span>
                      </span>
                      <span className="rounded-2xl bg-blush/60 px-3 py-2">
                        <span className="block text-xs text-muted">This month</span>
                        <span className="font-semibold tabular">{formatCents(m?.cents ?? 0)}</span> <span className="text-xs text-muted">est.</span>
                      </span>
                    </span>
                    {!emp.active && <span className="pill mt-3 self-start bg-blush text-muted">Inactive</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {inactiveCount > 0 && (
            <button type="button" className="text-sm font-semibold text-rose-deep underline-offset-4 hover:underline" onClick={() => setShowInactive((v) => !v)}>
              {showInactive ? 'Hide inactive crew' : `Show ${inactiveCount} inactive`}
            </button>
          )}
        </>
      )}
      <p className="text-xs text-muted">{WAGE_NOTE}</p>

      <EmployeeForm open={editing !== null} employee={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); reloadEmployees(); }} />
    </div>
  );
}

function HoursPanel({ employees }) {
  const notify = useToast();
  const [period, setPeriod] = useState('this_week');
  const [employeeId, setEmployeeId] = useState('');
  const [editing, setEditing] = useState(null);
  const [approving, setApproving] = useState(false);
  const range = rangeFor(period);
  const { data: entries, error, loading, reload } = useQuery(() => api.listHours(range), [range.from, range.to]);
  const { data: jobs } = useQuery(() => api.listJobsBrief(), []);

  const names = useMemo(() => new Map(employees.map((e) => [e.id, e.full_name])), [employees]);
  const jobTitles = useMemo(() => new Map((jobs ?? []).map((j) => [j.id, j.title])), [jobs]);
  const shown = useMemo(() => (entries ?? []).filter((t) => !employeeId || t.employee_id === employeeId), [entries, employeeId]);
  const totals = useMemo(() => totalsByEmployee(shown), [shown]);
  const grand = [...totals.values()].reduce((s, t) => ({ hours: s.hours + t.hours, cents: s.cents + t.cents }), { hours: 0, cents: 0 });
  const pending = shown.filter((t) => t.status === 'submitted');

  async function approveAll() {
    setApproving(true);
    try {
      const n = await api.approveTimeEntries(pending.map((t) => t.id));
      notify(`Approved ${n} ${n === 1 ? 'entry' : 'entries'}`);
      reload();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setApproving(false);
    }
  }

  function exportCsv() {
    const rows = [...shown].sort((a, b) => (a.work_date < b.work_date ? -1 : 1));
    const csv = toCsv(
      [
        { label: 'Date', value: (t) => t.work_date },
        { label: 'Crew member', value: (t) => names.get(t.employee_id) },
        { label: 'Job', value: (t) => jobTitles.get(t.job_id) ?? '' },
        { label: 'Hours', value: (t) => Number(t.hours).toFixed(2) },
        { label: 'Hourly rate', value: (t) => (t.hourly_rate === null ? '' : Number(t.hourly_rate).toFixed(2)) },
        { label: 'Estimated gross wages', value: (t) => (wageCents(t) / 100).toFixed(2) },
        { label: 'Status', value: (t) => TIME_STATUSES[t.status]?.label },
        { label: 'Notes', value: (t) => t.notes },
        { label: 'Demo data', value: (t) => (t.is_demo ? 'Yes' : '') },
      ],
      rows,
    );
    downloadCsv(`hoard-hounds-hours-${range.from}-to-${range.to}.csv`, csv);
    notify(`Exported ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`);
  }

  return (
    <div className="space-y-5">
      <div className="card animate-rise space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <Segmented label="Time period" options={HOUR_PERIODS} value={period} onChange={setPeriod} />
          <label className="block">
            <span className="sr-only">Crew member</span>
            <select className="input min-h-10 py-2 sm:w-64" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Everyone</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-sm text-muted">
            <span className="font-display text-2xl font-semibold text-ink tabular">{formatHours(grand.hours)}</span>
            <span className="mx-2">·</span>
            <span className="font-display text-2xl font-semibold text-rose-ink tabular">{formatCents(grand.cents)}</span>
            <span className="ml-2">est. wages · {range.label}</span>
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={exportCsv} disabled={!shown.length}>
              <AdminIcon name="download" className="h-4 w-4" />
              Export CSV
            </button>
            <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
              <AdminIcon name="plus" className="h-4 w-4" strokeWidth={2.4} />
              Log hours
            </button>
          </div>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="flex animate-rise flex-col gap-3 rounded-3xl bg-gold/12 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            <strong className="font-bold text-gold-deep">{pending.length} {pending.length === 1 ? 'entry needs' : 'entries need'} your approval.</strong>{' '}
            Check them, then approve so they’re final.
          </p>
          <button type="button" className="btn-primary" onClick={approveAll} disabled={approving}>
            <AdminIcon name="check" className="h-4 w-4" strokeWidth={2.4} />
            {approving ? 'Approving…' : `Approve ${pending.length}`}
          </button>
        </div>
      )}

      {totals.size > 1 && (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" aria-label="Totals by crew member">
          {[...totals.entries()].sort((a, b) => b[1].cents - a[1].cents).map(([id, t]) => (
            <li key={id} className="card p-4">
              <p className="truncate text-sm font-semibold">{names.get(id) ?? 'Unknown'}</p>
              <p className="mt-1 text-sm text-muted tabular">{formatHours(t.hours)} · <strong className="text-ink">{formatCents(t.cents)}</strong></p>
            </li>
          ))}
        </ul>
      )}

      <ErrorNote error={error} onRetry={reload} />

      {entries === undefined ? (
        <div className="card flex h-48 items-center justify-center">{loading && <Spinner />}</div>
      ) : shown.length === 0 ? (
        <div className="card">
          <EmptyState icon="calendar" title="No hours logged" action={<button type="button" className="btn-soft" onClick={() => setEditing('new')}>Log hours</button>}>
            Nothing logged for {range.label}.
          </EmptyState>
        </div>
      ) : (
        <div className={`card animate-rise overflow-hidden transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <div className="hidden grid-cols-[7rem_1fr_1fr_5rem_6rem_7.5rem] gap-4 border-b border-line bg-blush/40 px-5 py-3 text-xs font-bold tracking-wider text-muted uppercase md:grid">
            <span>Day</span><span>Crew member</span><span>Job</span><span className="text-right">Hours</span><span className="text-right">Wages</span><span className="text-right">Status</span>
          </div>
          <ul className="divide-y divide-line">
            {shown.map((t) => {
              const st = TIME_STATUSES[t.status];
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => setEditing(t)}
                    aria-label={`Edit ${names.get(t.employee_id)}, ${Number(t.hours)} hours on ${formatDate(t.work_date)}`}
                    className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 text-left transition hover:bg-blush/40 md:grid-cols-[7rem_1fr_1fr_5rem_6rem_7.5rem]">
                    <span className="order-3 text-xs text-muted md:order-none md:text-sm md:text-ink tabular">{dayName(t.work_date)}, {formatDate(t.work_date, { month: 'short', day: 'numeric' })}</span>
                    <span className="order-1 flex min-w-0 items-center gap-2 font-semibold md:order-none">
                      <span className="truncate">{names.get(t.employee_id) ?? 'Unknown'}</span>
                      {t.is_demo && <DemoPill />}
                    </span>
                    <span className="order-5 col-span-2 truncate text-sm text-muted md:order-none md:col-span-1">{jobTitles.get(t.job_id) ?? 'No job'}</span>
                    <span className="order-2 text-right font-semibold tabular md:order-none">{Number(t.hours)} hrs</span>
                    <span className="order-4 text-right text-sm tabular md:order-none md:text-base">{formatCents(wageCents(t))}</span>
                    <span className="hidden justify-self-end md:block"><span className={`pill ${st.className}`}>{st.label}</span></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted">{WAGE_NOTE}</p>

      <TimeEntryForm open={editing !== null} entry={editing === 'new' ? null : editing} employees={employees} jobs={jobs ?? []}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
    </div>
  );
}

export default function EmployeesPage({ route }) {
  const tab = route.startsWith('/employees/hours') ? '/employees/hours' : '/employees';
  const { data: employees, error, loading, reload } = useQuery(() => api.listEmployees(), []);

  return (
    <div className="space-y-6">
      <DemoBanner />
      <PageHeader eyebrow="Crew" title="Employees">
        Your crew, the hours they work, and what that labor costs. Estimates only; this isn’t payroll.
      </PageHeader>
      <nav aria-label="Employee sections" className="animate-rise">
        <ul className="inline-flex gap-1 rounded-full bg-blush/80 p-1">
          {TABS.map((t) => (
            <li key={t.value}>
              <a href={`#${t.value}`} aria-current={tab === t.value ? 'page' : undefined}
                className={`inline-flex min-h-9 items-center rounded-full px-4 text-sm font-semibold transition ${tab === t.value ? 'bg-white text-rose-ink shadow-soft' : 'text-muted hover:text-ink'}`}>
                {t.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <ErrorNote error={error} onRetry={reload} />
      {!employees ? (
        <div className="card flex h-48 items-center justify-center">{loading && <Spinner />}</div>
      ) : tab === '/employees/hours' ? (
        <HoursPanel employees={employees} />
      ) : (
        <TeamPanel employees={employees} reloadEmployees={reload} />
      )}
    </div>
  );
}
