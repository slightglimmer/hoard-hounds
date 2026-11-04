import { useMemo, useState } from 'react';
import AdminIcon from '../components/AdminIcon.jsx';
import StatCard from '../components/StatCard.jsx';
import CategoryBars from '../components/charts/CategoryBars.jsx';
import MonthlyChart, { ChartLegend } from '../components/charts/MonthlyChart.jsx';
import { DemoPill, EmptyState, ErrorNote, PageHeader, Segmented, Spinner } from '../components/ui.jsx';
import { DemoBanner } from '../components/AdminLayout.jsx';
import { api } from '../lib/api/index.js';
import { PERIODS, comparisonRanges, formatDate, periodRange, todayISO } from '../lib/dates.js';
import { formatMoney } from '../lib/money.js';
import { byCategory, change, monthly, totals } from '../lib/summary.js';
import { useQuery } from '../lib/useQuery.js';
import { recurringStatus } from '../lib/recurrence.js';
import { useAuth } from '../lib/auth.jsx';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Overview() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('this_year');
  const range = useMemo(() => periodRange(period), [period]);
  const compare = useMemo(() => comparisonRanges(range), [range]);
  const prev = compare.previous;
  const year = Number(range.from.slice(0, 4));
  // One fetch covers the chart's year plus the comparison period.
  const fetchRange = useMemo(
    () => ({ from: prev.from < `${year}-01-01` ? prev.from : `${year}-01-01`, to: `${year}-12-31` }),
    [prev.from, year],
  );

  const { data, error, loading, reload } = useQuery(async () => {
    const [expenses, payments, timeEntries, categories, recurring] = await Promise.all([
      api.listExpenses(fetchRange),
      api.listPayments(fetchRange),
      api.listTimeEntries(fetchRange),
      api.listCategories(),
      api.listRecurring(),
    ]);
    return { expenses, payments, timeEntries, categories, recurring };
  }, [fetchRange.from, fetchRange.to]);

  const view = useMemo(() => {
    if (!data) return null;
    const now = totals(data, range);
    const nowSoFar = totals(data, compare.current);
    const before = totals(data, prev);
    const today = todayISO();
    return {
      now,
      nowSoFar,
      before,
      months: monthly(data, year),
      categories: byCategory(data.expenses, data.categories, range),
      recent: data.expenses.filter((e) => e.expense_date <= today).slice(0, 5),
      due: data.recurring.filter((r) => recurringStatus(r, today) === 'due'),
      upcoming: data.recurring.filter((r) => recurringStatus(r, today) === 'scheduled').slice(0, 3),
      categoryName: new Map(data.categories.map((c) => [c.id, c.name])),
      hasRevenue: data.payments.length > 0,
      hasLabor: data.timeEntries.length > 0,
    };
  }, [data, range, compare, prev, year]);

  // "johnice.edward@..." -> "Johnice"
  const name = user?.email?.split('@')[0].split(/[._+\-\d]/)[0];
  const currentMonth = year === new Date().getFullYear() ? new Date().getMonth() : -1;

  return (
    <div className="space-y-6">
      <DemoBanner />
      <PageHeader
        eyebrow={greeting()}
        title={name ? `Hello, ${name.charAt(0).toUpperCase()}${name.slice(1)}` : 'Overview'}
        actions={<Segmented label="Time period" options={PERIODS} value={period} onChange={setPeriod} />}
      >
        Here’s how Hoard Hounds is doing for <strong className="font-semibold text-ink">{range.label}</strong>.
      </PageHeader>

      <ErrorNote error={error} onRetry={reload} />

      {!view ? (
        <div className="card flex h-64 items-center justify-center">{loading ? <Spinner /> : null}</div>
      ) : (
        <>
          <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard label="Revenue" icon="sparkle" cents={view.now.revenue} deltaPct={change(view.nowSoFar.revenue, view.before.revenue)}
              note={view.hasRevenue ? 'Payments received' : 'Comes from job payments (Jobs, coming soon)'} />
            <StatCard label="Expenses" icon="receipt" cents={view.now.expenses} deltaPct={change(view.nowSoFar.expenses, view.before.expenses)}
              goodWhenUp={false} accent="bg-petal/70 text-rose-ink" delay={60} />
            <StatCard label="Labor (estimated)" icon="users" cents={view.now.labor} deltaPct={change(view.nowSoFar.labor, view.before.labor)}
              goodWhenUp={false} accent="bg-gold/20 text-gold-deep" delay={120}
              note={view.hasLabor ? 'Hours × hourly rate, before taxes' : 'Comes from logged hours (Employees, coming soon)'} />
            <StatCard label="Net profit" icon="chart" cents={view.now.profit} deltaPct={change(view.nowSoFar.profit, view.before.profit)}
              accent="bg-rose-deep text-white" delay={180} emphasis />
          </section>

          <section className="card animate-rise p-5 sm:p-7" style={{ animationDelay: '120ms' }} aria-labelledby="chart-title">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="chart-title" className="font-display text-2xl font-semibold">Month by month</h2>
                <p className="text-sm text-muted">Revenue against expenses and labor in {year}. Hover a month for details.</p>
              </div>
              <ChartLegend />
            </div>
            <div className="mt-6">
              <MonthlyChart months={view.months} year={year} currentMonth={currentMonth} lastMonth={currentMonth === -1 ? 11 : currentMonth} />
            </div>
          </section>

          <div className="grid items-start gap-6 lg:grid-cols-[1.15fr_1fr]">
            <section className="card animate-rise p-5 sm:p-7" style={{ animationDelay: '180ms' }} aria-labelledby="cat-title">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="cat-title" className="font-display text-2xl font-semibold">Where the money went</h2>
                <a href="#/expenses" className="text-sm font-semibold text-rose-deep hover:underline">All expenses</a>
              </div>
              <p className="text-sm text-muted">Expenses by category, {range.label}.</p>
              <div className="mt-6">
                {view.categories.length ? (
                  <CategoryBars items={view.categories} />
                ) : (
                  <EmptyState icon="receipt" title="No expenses yet" action={<a href="#/expenses" className="btn-soft">Add an expense</a>}>
                    Nothing recorded for {range.label}.
                  </EmptyState>
                )}
              </div>
            </section>

            <div className="space-y-6">
              <section className="card animate-rise p-5 sm:p-7" style={{ animationDelay: '220ms' }} aria-labelledby="recurring-title">
                <h2 id="recurring-title" className="font-display text-2xl font-semibold">Recurring charges</h2>
                {view.due.length > 0 ? (
                  <a href="#/expenses/recurring" className="mt-4 flex items-center gap-3 rounded-2xl bg-gold/15 px-4 py-3 text-sm font-semibold text-gold-deep transition hover:bg-gold/25">
                    <AdminIcon name="repeat" className="h-5 w-5" />
                    <span className="flex-1">{view.due.length} {view.due.length === 1 ? 'charge is' : 'charges are'} due to be recorded</span>
                    <AdminIcon name="arrowRight" className="h-4 w-4" />
                  </a>
                ) : (
                  <p className="mt-2 text-sm text-muted">All caught up.</p>
                )}
                {view.upcoming.length > 0 && (
                  <ul className="mt-4 divide-y divide-line">
                    {view.upcoming.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="min-w-0 truncate">{r.vendor || r.description}</span>
                        <span className="shrink-0 text-muted tabular">
                          {formatDate(r.next_due_date, { month: 'short', day: 'numeric' })} · <strong className="text-ink">{formatMoney(r.amount)}</strong>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card animate-rise p-5 sm:p-7" style={{ animationDelay: '260ms' }} aria-labelledby="recent-title">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="recent-title" className="font-display text-2xl font-semibold">Recent expenses</h2>
                  <a href="#/expenses" className="text-sm font-semibold text-rose-deep hover:underline">View all</a>
                </div>
                {view.recent.length ? (
                  <ul className="mt-3 divide-y divide-line">
                    {view.recent.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 py-3">
                        <span className="w-11 shrink-0 text-center text-xs leading-tight font-semibold text-muted uppercase">
                          {formatDate(e.expense_date, { month: 'short' })}
                          <span className="block font-display text-lg text-ink">{formatDate(e.expense_date, { day: 'numeric' })}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{e.vendor || e.description}</span>
                          <span className="block truncate text-xs text-muted">{view.categoryName.get(e.category_id)}</span>
                        </span>
                        {e.is_demo && <DemoPill />}
                        <span className="shrink-0 text-sm font-semibold tabular">{formatMoney(e.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted">Nothing recorded yet.</p>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
