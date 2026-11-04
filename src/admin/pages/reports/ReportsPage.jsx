import { useMemo, useState } from 'react';
import AdminIcon from '../../components/AdminIcon.jsx';
import StatCard from '../../components/StatCard.jsx';
import CategoryBars from '../../components/charts/CategoryBars.jsx';
import MonthlyChart, { ChartLegend } from '../../components/charts/MonthlyChart.jsx';
import { DemoBanner } from '../../components/AdminLayout.jsx';
import { EmptyState, ErrorNote, PageHeader, Spinner, useToast } from '../../components/ui.jsx';
import { api } from '../../lib/api/index.js';
import { downloadCsv } from '../../lib/csv.js';
import { MONTHS_SHORT } from '../../lib/dates.js';
import { formatCents } from '../../lib/money.js';
import { taxPackFiles, yearReport } from '../../lib/reports.js';
import { useQuery } from '../../lib/useQuery.js';
import { downloadBlob, makeZip } from '../../lib/zip.js';

const thisYear = new Date().getFullYear();
const YEARS = [thisYear, thisYear - 1, thisYear - 2, thisYear - 3];

async function loadYear(year) {
  const range = { from: `${year}-01-01`, to: `${year}-12-31` };
  const prevRange = { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
  const [expenses, payments, timeEntries, categories, jobData, employees, prevExpenses, prevPayments, prevTime] = await Promise.all([
    api.listExpenses(range), api.listPaymentsDetailed(range), api.listHours(range), api.listCategories(),
    api.listJobsWithMoney(), api.listEmployees(),
    api.listExpenses(prevRange), api.listPayments(prevRange), api.listTimeEntries(prevRange),
  ]);
  return {
    year, expenses, payments, timeEntries, categories, employees,
    jobs: jobData.jobs, customers: jobData.customers, financials: jobData.financials,
    prev: { expenses: prevExpenses, payments: prevPayments, timeEntries: prevTime },
  };
}

function Section({ title, subtitle, children, delay = 0, action }) {
  return (
    <section className="card animate-rise p-5 sm:p-7" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">{title}</h2>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function ReportsPage() {
  const notify = useToast();
  const [year, setYear] = useState(thisYear);
  const { data, error, loading, reload } = useQuery(() => loadYear(year), [year]);
  const report = useMemo(() => (data && data.year === year ? yearReport(data) : null), [data, year]);
  const isCurrent = year === thisYear;
  const lastMonth = isCurrent ? new Date().getMonth() : 11;

  const demoRows = data ? [data.expenses, data.payments, data.timeEntries].reduce((n, rows) => n + rows.filter((r) => r.is_demo).length, 0) : 0;
  const hasActivity = report && (report.sum.revenue || report.sum.expenses || report.sum.labor);

  const files = useMemo(() => (report ? taxPackFiles({ ...data, report, demoRows }) : []), [report, data, demoRows]);

  function downloadPack() {
    downloadBlob(`hoard-hounds-${year}-records.zip`, makeZip(files));
    notify(`Downloaded your ${year} records`);
  }

  return (
    <div className="space-y-6">
      <DemoBanner />
      <PageHeader
        eyebrow="Year in review"
        title="Reports"
        actions={
          <label className="flex items-center gap-2 text-sm font-semibold">
            <span>Year</span>
            <select className="input min-h-10 w-28 py-2" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        }
      >
        How {year} went{isCurrent ? ' so far' : ''}, and everything your bookkeeper needs at tax time.
      </PageHeader>

      <ErrorNote error={error} onRetry={reload} />

      {!report ? (
        <div className="card flex h-64 items-center justify-center">{loading && <Spinner label="Adding up the year" />}</div>
      ) : (
        <>
          <section aria-label={`${year} totals`} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard label="Revenue" icon="sparkle" cents={report.sum.revenue} deltaPct={report.deltas.revenue} note="Payments received" />
            <StatCard label="Expenses" icon="receipt" cents={report.sum.expenses} deltaPct={report.deltas.expenses} goodWhenUp={false} accent="bg-petal/70 text-rose-ink" delay={60} />
            <StatCard label="Labor (estimated)" icon="users" cents={report.sum.labor} deltaPct={report.deltas.labor} goodWhenUp={false} accent="bg-gold/20 text-gold-deep" delay={120} />
            <StatCard label="Net profit" icon="chart" cents={report.sum.profit} deltaPct={report.deltas.profit} accent="bg-rose-deep text-white" delay={180} emphasis
              note={report.margin === null ? undefined : `${Math.round(report.margin)}% of revenue`} />
          </section>
          {!hasActivity ? (
            <div className="card">
              <EmptyState icon="chart" title={`Nothing recorded for ${year}`}>
                Reports fill in as you add expenses, record job payments and log crew hours.
              </EmptyState>
            </div>
          ) : (
            <>
              <Section title="Month by month" subtitle={`Revenue against expenses and labor in ${year}.`} action={<ChartLegend />} delay={100}>
                <MonthlyChart months={report.months} year={year} currentMonth={isCurrent ? lastMonth : -1} lastMonth={lastMonth} />
                <div className="mt-6 overflow-x-auto rounded-2xl border border-line">
                  <table className="w-full min-w-[34rem] text-sm tabular">
                    <caption className="sr-only">Monthly totals for {year}</caption>
                    <thead className="bg-blush/50 text-xs tracking-wider text-muted uppercase">
                      <tr>
                        <th scope="col" className="px-4 py-2.5 text-left font-bold">Month</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-bold">Revenue</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-bold">Expenses</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-bold">Labor (est.)</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-bold">Net profit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {report.months.map((m, i) =>
                        i > lastMonth ? null : (
                          <tr key={i}>
                            <th scope="row" className="px-4 py-2 text-left font-semibold">{MONTHS_SHORT[i]}</th>
                            <td className="px-4 py-2 text-right">{formatCents(m.revenue)}</td>
                            <td className="px-4 py-2 text-right">{formatCents(m.expenses)}</td>
                            <td className="px-4 py-2 text-right">{formatCents(m.labor)}</td>
                            <td className={`px-4 py-2 text-right font-semibold ${m.profit < 0 ? 'text-danger' : ''}`}>{formatCents(m.profit)}</td>
                          </tr>
                        ),
                      )}
                    </tbody>
                    <tfoot className="border-t-2 border-petal bg-blush/30 font-bold">
                      <tr>
                        <th scope="row" className="px-4 py-2.5 text-left">Total</th>
                        <td className="px-4 py-2.5 text-right">{formatCents(report.sum.revenue)}</td>
                        <td className="px-4 py-2.5 text-right">{formatCents(report.sum.expenses)}</td>
                        <td className="px-4 py-2.5 text-right">{formatCents(report.sum.labor)}</td>
                        <td className={`px-4 py-2.5 text-right ${report.sum.profit < 0 ? 'text-danger' : 'text-rose-ink'}`}>{formatCents(report.sum.profit)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Section>

              <div className="grid items-start gap-6 lg:grid-cols-2">
                <Section title="Expenses for taxes" subtitle="Grouped by the suggested tax category on each expense category." delay={140}>
                  {report.byTaxCategory.length ? (
                    <ul className="divide-y divide-line">
                      {report.byTaxCategory.map((g) => (
                        <li key={g.name} className="py-3">
                          <p className="flex items-baseline justify-between gap-3">
                            <span className="font-semibold">{g.name}</span>
                            <span className="font-semibold tabular">{formatCents(g.cents)}</span>
                          </p>
                          <p className="mt-0.5 text-xs text-muted">{[...g.categories.keys()].join(' · ')}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">No expenses this year.</p>
                  )}
                  <p className="mt-4 text-xs text-muted">These are suggestions to keep your records organized, not tax advice. Confirm each one with your tax preparer.</p>
                </Section>

                <Section title="Where revenue came from" subtitle="Payments received, by type of customer." delay={180}>
                  {report.revenueByType.length ? <CategoryBars items={report.revenueByType} /> : <p className="text-sm text-muted">No payments recorded this year.</p>}
                  {report.topCustomers.length > 0 && (
                    <>
                      <h3 className="mt-6 text-sm font-bold tracking-wider text-muted uppercase">Top customers</h3>
                      <ol className="mt-2 divide-y divide-line">
                        {report.topCustomers.map((c, i) => (
                          <li key={c.id} className="flex items-center gap-3 py-2.5 text-sm">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blush font-display font-semibold text-rose-ink">{i + 1}</span>
                            <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
                            <span className="font-semibold tabular">{formatCents(c.cents)}</span>
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-blush/60 p-4">
                      <p className="text-xs text-muted">Jobs completed</p>
                      <p className="mt-1 font-display text-2xl font-semibold tabular">{report.completedJobs}</p>
                    </div>
                    <div className="rounded-2xl bg-blush/60 p-4">
                      <p className="text-xs text-muted">Average job price</p>
                      <p className="mt-1 font-display text-2xl font-semibold tabular">{report.averagePrice === null ? '—' : formatCents(report.averagePrice)}</p>
                    </div>
                  </div>
                </Section>
              </div>
            </>
          )}

          {/* Export pack */}
          <Section
            title={`${year} records for your bookkeeper`}
            subtitle="Everything for the year in spreadsheet files (CSV), which open in Excel, Google Sheets or Numbers."
            delay={220}
            action={
              <button type="button" className="btn-primary" onClick={downloadPack}>
                <AdminIcon name="download" className="h-4 w-4" strokeWidth={2.2} />
                Download all (.zip)
              </button>
            }
          >
            {demoRows > 0 && (
              <p className="mb-4 rounded-2xl bg-gold/12 px-4 py-3 text-sm text-gold-deep">
                <strong>{demoRows} sample rows</strong> are included and marked “Demo data” in the files. Clear demo data before sending these to anyone.
              </p>
            )}
            <ul className="grid gap-2 sm:grid-cols-2">
              {files.map((f) => {
                const short = f.name.split('/').pop();
                return (
                  <li key={f.name}>
                    <button
                      type="button"
                      onClick={() => (short.endsWith('.csv') ? downloadCsv(short, f.text.replace(/^﻿/, '')) : downloadBlob(short, new Blob([f.text], { type: 'text/plain;charset=utf-8' })))}
                      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-left transition hover:border-petal hover:bg-blush/40"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blush text-rose-deep">
                        <AdminIcon name={short.endsWith('.csv') ? 'receipt' : 'info'} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{f.label}</span>
                        <span className="block truncate text-xs text-muted">{short}</span>
                      </span>
                      <AdminIcon name="download" className="h-4 w-4 shrink-0 text-muted" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-xs text-muted">
              Revenue counts money when it’s received. Labor is an estimate (hours × rate, before taxes), not payroll. Tax categories are suggestions.
            </p>
          </Section>
        </>
      )}
    </div>
  );
}
