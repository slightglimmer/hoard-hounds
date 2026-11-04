import { useMemo, useState } from 'react';
import AdminIcon from '../../components/AdminIcon.jsx';
import { DemoBanner } from '../../components/AdminLayout.jsx';
import { DemoPill, EmptyState, ErrorNote, PageHeader, Segmented, Spinner, useToast } from '../../components/ui.jsx';
import { api } from '../../lib/api/index.js';
import { downloadCsv, toCsv } from '../../lib/csv.js';
import { PERIODS, formatDate, periodRange } from '../../lib/dates.js';
import { formatCents, formatMoney, sumCents } from '../../lib/money.js';
import { useQuery } from '../../lib/useQuery.js';
import CategoriesPanel from './CategoriesPanel.jsx';
import ExpenseForm, { paymentLabel } from './ExpenseForm.jsx';
import RecurringPanel from './RecurringPanel.jsx';

const TABS = [
  { value: '/expenses', label: 'Expenses' },
  { value: '/expenses/recurring', label: 'Recurring' },
  { value: '/expenses/categories', label: 'Categories' },
];

const PERIOD_OPTIONS = [...PERIODS, { value: 'custom', label: 'Custom' }];

function ExpenseList({ categories }) {
  const notify = useToast();
  const [period, setPeriod] = useState('this_month');
  const [custom, setCustom] = useState(() => periodRange('this_year'));
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | expense

  const range = period === 'custom' ? { ...custom, label: `${formatDate(custom.from)} – ${formatDate(custom.to)}` } : periodRange(period);
  const validRange = range.from && range.to && range.from <= range.to;
  const { data: expenses, error, loading, reload } = useQuery(
    () => (validRange ? api.listExpenses(range) : Promise.resolve([])),
    [range.from, range.to],
  );

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (expenses ?? []).filter(
      (e) =>
        (!categoryId || e.category_id === categoryId) &&
        (!q || [e.description, e.vendor, e.notes, categoryById.get(e.category_id)?.name].some((t) => t?.toLowerCase().includes(q))),
    );
  }, [expenses, categoryId, search, categoryById]);
  const total = sumCents(shown, (e) => e.amount);

  function exportCsv() {
    const rows = [...shown].sort((a, b) => (a.expense_date < b.expense_date ? -1 : 1));
    const csv = toCsv(
      [
        { label: 'Date', value: (e) => e.expense_date },
        { label: 'Vendor', value: (e) => e.vendor },
        { label: 'Description', value: (e) => e.description },
        { label: 'Category', value: (e) => categoryById.get(e.category_id)?.name },
        { label: 'Tax category (suggested)', value: (e) => categoryById.get(e.category_id)?.tax_category },
        { label: 'Amount', value: (e) => Number(e.amount).toFixed(2) },
        { label: 'Paid with', value: (e) => paymentLabel(e.payment_method) },
        { label: 'Recurring', value: (e) => (e.recurring_expense_id ? 'Yes' : '') },
        { label: 'Notes', value: (e) => e.notes },
        { label: 'Demo data', value: (e) => (e.is_demo ? 'Yes' : '') },
      ],
      rows,
    );
    downloadCsv(`hoard-hounds-expenses-${range.from}-to-${range.to}.csv`, csv);
    notify(`Exported ${rows.length} ${rows.length === 1 ? 'expense' : 'expenses'}`);
  }

  async function save(row) {
    await api.saveExpense(row);
    notify(row.id ? 'Expense updated' : 'Expense added');
    setEditing(null);
    reload();
  }

  async function remove(id) {
    await api.deleteExpense(id);
    notify('Expense deleted');
    setEditing(null);
    reload();
  }

  return (
    <div className="space-y-5">
      <div className="card animate-rise space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <Segmented label="Time period" options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block">
              <span className="sr-only">Search expenses</span>
              <AdminIcon name="search" className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
              <input type="search" placeholder="Search" className="input min-h-10 py-2 pl-10 sm:w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <label className="block">
              <span className="sr-only">Category</span>
              <select className="input min-h-10 py-2 sm:w-56" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {period === 'custom' && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="label">From</span>
              <input type="date" className="input min-h-10 py-2" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            </label>
            <label className="block">
              <span className="label">To</span>
              <input type="date" className="input min-h-10 py-2" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </label>
            {!validRange && <p className="pb-2 text-sm text-danger">Choose a start date before the end date.</p>}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-sm text-muted">
            <span className="font-display text-2xl font-semibold text-ink tabular">{formatCents(total)}</span>
            <span className="ml-2">
              across {shown.length} {shown.length === 1 ? 'expense' : 'expenses'} · {range.label}
            </span>
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={exportCsv} disabled={!shown.length}>
              <AdminIcon name="download" className="h-4 w-4" />
              Export CSV
            </button>
            <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
              <AdminIcon name="plus" className="h-4 w-4" strokeWidth={2.4} />
              Add expense
            </button>
          </div>
        </div>
      </div>

      <ErrorNote error={error} onRetry={reload} />

      {expenses === undefined ? (
        <div className="card flex h-48 items-center justify-center">{loading && <Spinner />}</div>
      ) : shown.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="receipt"
            title={expenses.length ? 'No matches' : 'No expenses here yet'}
            action={!expenses.length && <button type="button" className="btn-soft" onClick={() => setEditing('new')}>Add your first expense</button>}
          >
            {expenses.length ? 'Try a different search or category.' : `Nothing recorded for ${range.label}.`}
          </EmptyState>
        </div>
      ) : (
        <div className={`card animate-rise overflow-hidden transition-opacity ${loading ? 'opacity-60' : ''}`} style={{ animationDelay: '80ms' }}>
          {/* Column headings (wider screens) */}
          <div className="hidden grid-cols-[6.5rem_1fr_12rem_7rem_7.5rem] gap-4 border-b border-line bg-blush/40 px-5 py-3 text-xs font-bold tracking-wider text-muted uppercase md:grid">
            <span>Date</span>
            <span>Description</span>
            <span>Category</span>
            <span>Paid with</span>
            <span className="text-right">Amount</span>
          </div>
          <ul className="divide-y divide-line">
            {shown.map((e) => {
              const cat = categoryById.get(e.category_id);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(e)}
                    className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 text-left transition hover:bg-blush/40 md:grid-cols-[6.5rem_1fr_12rem_7rem_7.5rem]"
                    aria-label={`Edit ${e.description}, ${formatMoney(e.amount)} on ${formatDate(e.expense_date)}`}
                  >
                    <span className="order-3 text-xs text-muted md:order-none md:text-sm md:text-ink tabular">{formatDate(e.expense_date)}</span>
                    <span className="order-1 min-w-0 md:order-none">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-semibold">{e.description}</span>
                        {e.recurring_expense_id && <AdminIcon name="repeat" className="h-3.5 w-3.5 shrink-0 text-rose-deep" />}
                        {e.is_demo && <DemoPill />}
                      </span>
                      {e.vendor && <span className="block truncate text-sm text-muted">{e.vendor}</span>}
                    </span>
                    <span className="order-4 justify-self-end md:order-none md:justify-self-start">
                      <span className="pill max-w-full truncate bg-blush text-rose-ink">{cat?.name ?? 'Uncategorized'}</span>
                    </span>
                    <span className="hidden text-sm text-muted md:block">{paymentLabel(e.payment_method)}</span>
                    <span className="order-2 text-right font-semibold tabular md:order-none">{formatMoney(e.amount)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ExpenseForm
        open={editing !== null}
        expense={editing === 'new' ? null : editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onSave={save}
        onDelete={remove}
      />
    </div>
  );
}

export default function ExpensesPage({ route }) {
  const tab = TABS.some((t) => t.value === route) ? route : '/expenses';
  const categoriesQuery = useQuery(() => api.listCategories(), []);
  const recurringQuery = useQuery(() => (tab === '/expenses/recurring' ? api.listRecurring() : Promise.resolve(null)), [tab]);
  const categories = categoriesQuery.data;

  return (
    <div className="space-y-6">
      <DemoBanner />
      <PageHeader eyebrow="Money out" title="Expenses">
        Record what the business spends, keep recurring bills on schedule, and export everything for bookkeeping.
      </PageHeader>

      <nav aria-label="Expense sections" className="animate-rise">
        <ul className="inline-flex gap-1 rounded-full bg-blush/80 p-1">
          {TABS.map((t) => (
            <li key={t.value}>
              <a
                href={`#${t.value}`}
                aria-current={tab === t.value ? 'page' : undefined}
                className={`inline-flex min-h-9 items-center rounded-full px-4 text-sm font-semibold transition ${
                  tab === t.value ? 'bg-white text-rose-ink shadow-soft' : 'text-muted hover:text-ink'
                }`}
              >
                {t.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <ErrorNote error={categoriesQuery.error} onRetry={categoriesQuery.reload} />

      {!categories ? (
        <div className="card flex h-48 items-center justify-center">{categoriesQuery.loading && <Spinner />}</div>
      ) : tab === '/expenses/recurring' ? (
        recurringQuery.data ? (
          <RecurringPanel recurring={recurringQuery.data} categories={categories} onChanged={recurringQuery.reload} />
        ) : (
          <>
            <ErrorNote error={recurringQuery.error} onRetry={recurringQuery.reload} />
            <div className="card flex h-48 items-center justify-center">{recurringQuery.loading && <Spinner />}</div>
          </>
        )
      ) : tab === '/expenses/categories' ? (
        <CategoriesPanel categories={categories} onChanged={categoriesQuery.reload} />
      ) : (
        <ExpenseList categories={categories} />
      )}
    </div>
  );
}
