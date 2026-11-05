import { useMemo, useState } from 'react';
import AdminIcon from '../../components/AdminIcon.jsx';
import { DemoBanner } from '../../components/AdminLayout.jsx';
import { DemoPill, EmptyState, ErrorNote, PageHeader, Segmented, Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api/index.js';
import { formatDate, todayISO } from '../../lib/dates.js';
import { formatCents, formatMoney, sumCents } from '../../lib/money.js';
import { STATUSES, statusInfo } from '../../lib/estimate.js';
import { useQuery } from '../../lib/useQuery.js';
import EstimateEditor from './EstimateEditor.jsx';
import PricesPanel from './PricesPanel.jsx';
import QuoteTemplate from './QuoteTemplate.jsx';

const TABS = [
  { value: '/price-sheet', label: 'Prices' },
  { value: '/price-sheet/estimates', label: 'Estimates' },
];

function EstimatesList() {
  const [status, setStatus] = useState('all');
  const [templateOpen, setTemplateOpen] = useState(false);
  const { data, error, loading, reload } = useQuery(() => api.listEstimates(), []);
  const shown = useMemo(() => (data ?? []).filter((e) => status === 'all' || e.status === status), [data, status]);
  const year = todayISO().slice(0, 4);
  const acceptedThisYear = (data ?? []).filter((e) => e.status === 'accepted' && e.estimate_date.startsWith(year));
  const openCount = (data ?? []).filter((e) => e.status === 'sent').length;

  return (
    <div className="space-y-5">
      <div className="card animate-rise flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          label="Show"
          options={[{ value: 'all', label: 'All' }, ...STATUSES.map((s) => ({ value: s.value, label: s.label }))]}
          value={status}
          onChange={setStatus}
        />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <p className="text-sm text-muted">
            <span className="font-display text-xl font-semibold text-ink tabular">{formatCents(sumCents(acceptedThisYear, (e) => e.total))}</span> accepted in {year}
            {openCount > 0 && <> · {openCount} waiting on a reply</>}
          </p>
          <button type="button" className="btn-ghost" onClick={() => setTemplateOpen(true)}>Quote template</button>
          <a href="#/price-sheet/estimates/new" className="btn-primary">
            <AdminIcon name="plus" className="h-4 w-4" strokeWidth={2.4} />
            New estimate
          </a>
        </div>
      </div>
      <QuoteTemplate open={templateOpen} onClose={() => setTemplateOpen(false)} />

      <ErrorNote error={error} onRetry={reload} />

      {data === undefined ? (
        <div className="card flex h-48 items-center justify-center">{loading && <Spinner />}</div>
      ) : shown.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="receipt"
            title={data.length ? 'Nothing here' : 'No estimates yet'}
            action={!data.length && <a href="#/price-sheet/estimates/new" className="btn-soft">Make your first estimate</a>}
          >
            {data.length ? 'No estimates have this status.' : 'Build a quote from your price sheet, then copy it into a text or print it as a PDF.'}
          </EmptyState>
        </div>
      ) : (
        <ul className="card animate-rise divide-y divide-line overflow-hidden" style={{ animationDelay: '80ms' }}>
          {shown.map((e) => {
            const s = statusInfo(e.status);
            const expired = e.status === 'sent' && e.valid_until && e.valid_until < todayISO();
            return (
              <li key={e.id}>
                <a href={`#/price-sheet/estimates/${e.id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-blush/40">
                  <span className="hidden w-16 shrink-0 font-display text-lg font-semibold text-muted sm:block">#{e.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{e.customer_name}</span>
                      {e.is_demo && <DemoPill />}
                    </span>
                    <span className="block truncate text-sm text-muted">
                      <span className="sm:hidden">#{e.number} · </span>
                      {formatDate(e.estimate_date)}
                      {e.property_address ? ` · ${e.property_address}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-display text-lg font-semibold tabular">{formatMoney(e.total)}</span>
                    <span className={`pill ${expired ? 'bg-danger/10 text-danger' : s.className}`}>{expired ? 'Expired' : s.label}</span>
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

export default function PriceSheetPage({ route }) {
  const editorId = route.match(/^\/price-sheet\/estimates\/([\w-]+)$/)?.[1];
  const tab = route.startsWith('/price-sheet/estimates') ? '/price-sheet/estimates' : '/price-sheet';
  const prices = useQuery(() => (tab === '/price-sheet' && !editorId ? api.listPriceItems() : Promise.resolve(null)), [tab, editorId]);

  return (
    <div className="space-y-6">
      <DemoBanner />
      <PageHeader eyebrow="Quotes" title="Price Sheet">
        Keep your prices in one place and turn them into estimates in a few taps.
      </PageHeader>

      {!editorId && (
        <nav aria-label="Price sheet sections" className="animate-rise">
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
      )}

      {editorId ? (
        <EstimateEditor key={editorId} id={editorId} />
      ) : tab === '/price-sheet/estimates' ? (
        <EstimatesList />
      ) : prices.data ? (
        <PricesPanel items={prices.data} onChanged={prices.reload} />
      ) : (
        <>
          <ErrorNote error={prices.error} onRetry={prices.reload} />
          <div className="card flex h-48 items-center justify-center">{prices.loading && <Spinner />}</div>
        </>
      )}
    </div>
  );
}
