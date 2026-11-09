// Private pricing calculator on the estimate screen. Never printed, copied or shown
// on the customer's quote link: it's saved separately (estimate_costing table).

import AdminIcon from '../../components/AdminIcon.jsx';
import { Field } from '../../components/ui.jsx';
import { computeCosting, marginAt, parseNumber } from '../../lib/costing.js';
import { formatCents } from '../../lib/money.js';

const pct = (n) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;

function MoneyInput({ value, onChange, ...p }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">$</span>
      <input {...p} inputMode="decimal" className="input pl-8 tabular" value={value} onChange={onChange} placeholder="0" />
    </div>
  );
}

function PercentInput({ value, onChange, ...p }) {
  return (
    <div className="relative">
      <input {...p} inputMode="decimal" className="input pr-9 tabular" value={value} onChange={onChange} placeholder="0" />
      <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted">%</span>
    </div>
  );
}

export default function CostingPanel({ value, onChange, errors = {}, totalCents, depositCents, hasLines, onUseDeposit, onUsePrice }) {
  const set = (key) => (e) => onChange({ [key]: e.target.value });
  const valid = Object.keys(errors).length === 0;
  const r = computeCosting(value);
  const atQuote = marginAt(totalCents, r.cost);
  const target = parseNumber(value.target_margin_pct) || 0;
  const below = totalCents > 0 && r.cost > 0 && atQuote.marginPct + 0.05 < target;

  return (
    <section className="card animate-rise border-2 border-dashed border-petal p-5 sm:p-6" aria-labelledby="costing-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="costing-title" className="font-display text-xl font-semibold">Job costing</h3>
        <span className="pill bg-ink text-white">
          <AdminIcon name="shield" className="mr-1 h-3.5 w-3.5" />
          Private: never shown to customers
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Estimated costs to price this job. Actual costs come from the job’s expenses and hours once the work happens.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Dumpster rental cost" error={errors.dumpster_cost} hint="What the dumpster company will charge you.">
          {(p) => <MoneyInput {...p} value={value.dumpster_cost} onChange={set('dumpster_cost')} />}
        </Field>
        <Field label="Other direct costs" optional error={errors.other_costs} hint="Supplies, permit, gas, dump fees…">
          {(p) => <MoneyInput {...p} value={value.other_costs} onChange={set('other_costs')} />}
        </Field>
        <Field label="Estimated labor hours" error={errors.labor_hours} hint="Total for the whole crew, e.g. 3 people × 8 h = 24.">
          {(p) => <input {...p} inputMode="decimal" className="input tabular" value={value.labor_hours} onChange={set('labor_hours')} placeholder="0" />}
        </Field>
        <Field label="Labor cost per hour" error={errors.labor_rate} hint="What an hour of crew time costs you.">
          {(p) => <MoneyInput {...p} value={value.labor_rate} onChange={set('labor_rate')} />}
        </Field>
        <Field label="Contingency" optional error={errors.contingency_pct} hint="Cushion for surprises.">
          {(p) => <PercentInput {...p} value={value.contingency_pct} onChange={set('contingency_pct')} />}
        </Field>
        <Field label="Target profit margin" error={errors.target_margin_pct} hint="Share of the price you keep as profit.">
          {(p) => <PercentInput {...p} value={value.target_margin_pct} onChange={set('target_margin_pct')} />}
        </Field>
      </div>

      {valid ? (
        <div className="mt-5 grid gap-4 rounded-3xl bg-blush/50 p-4 sm:grid-cols-2">
          <dl className="space-y-1.5 text-sm tabular">
            <div className="flex justify-between"><dt className="text-muted">Dumpster</dt><dd>{formatCents(r.dumpster)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Labor</dt><dd>{formatCents(r.labor)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Other direct costs</dt><dd>{formatCents(r.other)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Contingency</dt><dd>{formatCents(r.contingency)}</dd></div>
            <div className="flex justify-between border-t border-line pt-1.5 font-semibold"><dt>Estimated job cost</dt><dd>{formatCents(r.cost)}</dd></div>
          </dl>
          <dl className="space-y-1.5 text-sm tabular">
            <div className="flex items-baseline justify-between">
              <dt className="font-semibold">Suggested price</dt>
              <dd className="font-display text-2xl font-semibold text-rose-ink">{formatCents(r.price)}</dd>
            </div>
            <div className="flex justify-between"><dt className="text-muted">Estimated gross profit</dt><dd>{formatCents(r.profit)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Estimated gross margin</dt><dd>{pct(r.marginPct)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Suggested deposit (dumpster)</dt><dd>{formatCents(r.deposit)}</dd></div>
          </dl>
          <p className="text-xs text-muted sm:col-span-2">
            Suggested price = estimated cost ÷ (1 − margin), rounded up to the dollar. A {target || 30}% margin isn’t the same as a {target || 30}% markup.
          </p>
        </div>
      ) : (
        <p className="mt-5 rounded-2xl bg-danger/8 px-4 py-3 text-sm text-danger">Fix the highlighted numbers to see the suggested price.</p>
      )}

      {valid && totalCents > 0 && r.cost > 0 && (
        <p className={`mt-3 rounded-2xl px-4 py-3 text-sm ${below ? 'bg-gold/15 text-gold-deep' : 'bg-sage/15 text-sage-deep'}`}>
          At your quoted total of <strong>{formatCents(totalCents)}</strong>: estimated profit {formatCents(atQuote.profit)}, margin {pct(atQuote.marginPct)}
          {below ? ', below your target.' : '.'}
        </p>
      )}

      {valid && (
        <div className="mt-4 flex flex-wrap gap-2">
          {r.deposit > 0 && r.deposit !== depositCents && (
            <button type="button" className="btn-soft min-h-10" onClick={() => onUseDeposit(r.deposit)}>
              Use {formatCents(r.deposit)} as the deposit
            </button>
          )}
          {r.price > 0 && !hasLines && (
            <button type="button" className="btn-ghost min-h-10" onClick={() => onUsePrice(r.price)}>
              Add {formatCents(r.price)} as one line
            </button>
          )}
        </div>
      )}
    </section>
  );
}
