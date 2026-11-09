import { useEffect, useMemo, useRef, useState } from 'react';
import AdminIcon from '../../components/AdminIcon.jsx';
import { DemoPill, ErrorNote, Field, Spinner, useToast } from '../../components/ui.jsx';
import { SITE } from '../../../config/site.js';
import { api } from '../../lib/api/index.js';
import { parseISODate, toISODate, todayISO } from '../../lib/dates.js';
import { formatCents } from '../../lib/money.js';
import { DEFAULT_TERMS, STATUSES, UNITS, computeTotals, estimateText, lineCents, minimumApplies, unitPer } from '../../lib/estimate.js';
import EstimateDocument from './EstimateDocument.jsx';
import { priceLabel } from './PricesPanel.jsx';
import QuoteLink from './QuoteLink.jsx';
import CostingPanel from './CostingPanel.jsx';
import { COSTING_FIELDS, parseNumber, validateCosting } from '../../lib/costing.js';

let keySeq = 0;
const newKey = () => `line-${++keySeq}`;

const plusDays = (iso, n) => {
  const d = parseISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};

const blankEstimate = () => ({
  customer_name: '', customer_phone: '', customer_email: '', property_address: '',
  status: 'draft', estimate_date: todayISO(), valid_until: plusDays(todayISO(), 30),
  discount_type: '', discount_value: '', deposit_amount: '', notes: '', terms: DEFAULT_TERMS, lines: [],
  // Inquiries & dumpster update
  inquiry_id: '', scope_of_work: '', dumpster_count: '', dumpster_size_yards: '', dumpster_weight_allowance_tons: '',
  dumpster_rental_days: '', overage_rate_per_ton: '', extra_day_rate: '', overage_terms: '',
});

// Accepts "12", "12.5", "$1,200.00". Returns a number, or null if it isn't one.
function num(v, { allowZero = true } = {}) {
  const s = String(v ?? '').replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 || (allowZero && n === 0) ? n : null;
}

// Lines as stored in the database (a snapshot, so price-sheet changes don't alter them).
function toLineItems(lines) {
  return lines.map((l) => ({
    price_item_id: l.price_item_id ?? null,
    name: l.name.trim(),
    description: l.description?.trim() || null,
    unit: l.unit,
    unit_price: num(l.unit_price) ?? 0,
    quantity: num(l.quantity, { allowZero: false }) ?? 0,
    minimum_charge: num(l.minimum_charge) || null,
  }));
}

function Stepper({ value, onChange, label }) {
  const step = (d) => {
    const n = num(value) ?? 0;
    const next = Math.max(0, Math.round((n + d) * 100) / 100);
    onChange(String(next));
  };
  return (
    <div className="flex items-center rounded-full border border-line bg-white">
      <button type="button" className="h-10 w-10 rounded-full text-lg font-bold text-rose-deep hover:bg-blush" onClick={() => step(-1)} aria-label={`Fewer ${label}`}>−</button>
      <input
        className="h-10 w-14 bg-transparent text-center font-semibold tabular outline-none"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Quantity of ${label}`}
      />
      <button type="button" className="h-10 w-10 rounded-full text-lg font-bold text-rose-deep hover:bg-blush" onClick={() => step(1)} aria-label={`More ${label}`}>+</button>
    </div>
  );
}

export default function EstimateEditor({ id }) {
  const notify = useToast();
  const isNew = id === 'new';
  const [est, setEst] = useState(blankEstimate);
  const [saved, setSaved] = useState(null); // the stored row (number, is_demo...)
  const [prices, setPrices] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Scope, dumpster allowance and costing need the inquiries & dumpster database update.
  const [phase1, setPhase1] = useState(false);
  const [costing, setCosting] = useState(() => Object.fromEntries(COSTING_FIELDS.map((f) => [f, ''])));
  const [costingSaved, setCostingSaved] = useState(false);
  const [costingDirty, setCostingDirty] = useState(false);
  const formErrorRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [items, row, settings, features] = await Promise.all([
          api.listPriceItems(),
          isNew ? null : api.getEstimate(id),
          api.getQuoteSettings().catch(() => null),
          api.features().catch(() => ({ inquiries: false })),
        ]);
        const savedCosting = row && features.inquiries ? await api.getEstimateCosting(row.id).catch(() => null) : null;
        if (cancelled) return;
        setPrices(items);
        setPhase1(features.inquiries);
        // New estimates start from your quote template (Estimates → Quote template).
        if (settings && isNew) {
          setEst((e) => ({
            ...e,
            terms: settings.default_terms ?? e.terms,
            valid_until: plusDays(e.estimate_date, settings.default_valid_days || 30),
            deposit_amount: settings.default_deposit ? String(Number(settings.default_deposit)) : '',
            overage_terms: settings.default_overage_terms ?? '',
          }));
        }
        const asText = (v) => (v === null || v === undefined || v === '' ? '' : String(Number(v)));
        if (savedCosting) {
          setCosting(Object.fromEntries(COSTING_FIELDS.map((f) => [f, asText(savedCosting[f])])));
          setCostingSaved(true);
        } else if (settings) {
          setCosting((c) => ({
            ...c,
            labor_rate: asText(settings.default_labor_rate),
            contingency_pct: asText(settings.default_contingency_pct),
            target_margin_pct: asText(settings.default_target_margin_pct),
          }));
        }
        if (row) {
          setSaved(row);
          setEst({
            ...blankEstimate(),
            ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v ?? ''])),
            discount_type: row.discount_type ?? '',
            lines: row.line_items.map((l) => ({
              ...l, key: newKey(), unit_price: String(l.unit_price), quantity: String(l.quantity), minimum_charge: l.minimum_charge ?? '',
            })),
          });
        }
      } catch (err) {
        if (!cancelled) setLoadError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const update = (patch) => {
    setEst((e) => ({ ...e, ...patch }));
    setDirty(true);
  };
  const set = (key) => (e) => {
    update({ [key]: e.target.value });
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };
  const setLine = (key, patch) => {
    update({ lines: est.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });
    if (errors.lines) setErrors((x) => ({ ...x, lines: undefined }));
  };

  function addPrice(p) {
    const existing = est.lines.find((l) => l.price_item_id === p.id);
    if (existing) {
      setLine(existing.key, { quantity: String((num(existing.quantity) ?? 0) + 1) });
      return;
    }
    update({
      lines: [...est.lines, {
        key: newKey(), price_item_id: p.id, name: p.name, description: p.description ?? '', unit: p.unit,
        unit_price: String(p.unit_price), quantity: '1', minimum_charge: p.minimum_charge ?? '',
      }],
    });
    if (errors.lines) setErrors((x) => ({ ...x, lines: undefined }));
  }

  const addCustom = () =>
    update({ lines: [...est.lines, { key: newKey(), price_item_id: null, name: '', description: '', unit: 'flat', unit_price: '', quantity: '1', minimum_charge: '' }] });

  const lineItems = useMemo(() => toLineItems(est.lines), [est.lines]);
  const totals = computeTotals(lineItems, est.discount_type || null, num(est.discount_value) ?? 0);
  const asSaved = { ...est, number: saved?.number, line_items: lineItems, discount_type: est.discount_type || null, discount_value: num(est.discount_value), deposit_amount: num(est.deposit_amount) };

  function validate() {
    const found = {};
    if (!est.customer_name.trim()) found.customer_name = 'Add the customer’s name.';
    if (!est.lines.length) found.lines = 'Add at least one service.';
    else if (est.lines.some((l) => !l.name.trim() || num(l.quantity, { allowZero: false }) === null || num(l.unit_price) === null)) {
      found.lines = 'Each line needs a name, a quantity above 0, and a price.';
    }
    if (est.discount_type && num(est.discount_value) === null) found.discount_value = 'Enter a discount amount.';
    if (est.discount_type === 'percent' && num(est.discount_value) > 100) found.discount_value = 'A percent discount can’t be over 100.';
    if (String(est.deposit_amount).trim() && num(est.deposit_amount) === null) found.deposit_amount = 'Enter an amount, or leave it empty.';
    if (est.valid_until && est.valid_until < est.estimate_date) found.valid_until = 'This should be after the estimate date.';
    if (num(est.deposit_amount) > 0 && Math.round(num(est.deposit_amount) * 100) > totals.total) {
      found.deposit_amount = 'The deposit can’t be more than the total. It’s credited toward the total, not added to it.';
    }
    if (phase1) {
      const whole = (v) => !String(v).trim() || /^\d+$/.test(String(v).trim());
      if (!whole(est.dumpster_count) || Number(est.dumpster_count) > 20) found.dumpster_count = 'Enter a whole number of dumpsters (1–20).';
      if (!whole(est.dumpster_rental_days) || Number(est.dumpster_rental_days) > 365) found.dumpster_rental_days = 'Enter a whole number of days.';
      for (const [key, label] of [['dumpster_size_yards', 'size'], ['dumpster_weight_allowance_tons', 'weight allowance'], ['overage_rate_per_ton', 'overage rate'], ['extra_day_rate', 'extra-day rate']]) {
        if (String(est[key]).trim() && num(est[key]) === null) found[key] = `Enter the ${label} as a number, or leave it empty.`;
      }
      if (costingDirty || costingSaved) Object.assign(found, Object.fromEntries(Object.entries(validateCosting(costing)).map(([k, v]) => [`costing_${k}`, `Job costing: ${v}`])));
    }
    setErrors(found);
    if (Object.keys(found).length) {
      requestAnimationFrame(() => formErrorRef.current?.focus());
      return false;
    }
    return true;
  }

  async function save() {
    if (!validate()) return;
    setBusy(true);
    try {
      const row = await api.saveEstimate({
        ...(saved ? { id: saved.id } : {}),
        customer_name: est.customer_name.trim(),
        customer_phone: est.customer_phone.trim(),
        customer_email: est.customer_email.trim(),
        property_address: est.property_address.trim(),
        status: est.status,
        estimate_date: est.estimate_date,
        valid_until: est.valid_until || null,
        line_items: lineItems,
        discount_type: est.discount_type || null,
        discount_value: est.discount_type ? num(est.discount_value) : null,
        deposit_amount: num(est.deposit_amount) || null,
        notes: est.notes.trim(),
        terms: est.terms.trim(),
        ...(phase1
          ? {
              inquiry_id: est.inquiry_id || null,
              scope_of_work: est.scope_of_work.trim(),
              dumpster_count: est.dumpster_count ? Number(est.dumpster_count) : null,
              dumpster_size_yards: num(est.dumpster_size_yards) || null,
              dumpster_weight_allowance_tons: num(est.dumpster_weight_allowance_tons) || null,
              dumpster_rental_days: est.dumpster_rental_days ? Number(est.dumpster_rental_days) : null,
              overage_rate_per_ton: num(est.overage_rate_per_ton),
              extra_day_rate: num(est.extra_day_rate),
              overage_terms: est.overage_terms.trim(),
            }
          : {}),
      });
      if (phase1 && (costingDirty || costingSaved)) {
        await api.saveEstimateCosting({
          estimate_id: row.id,
          ...Object.fromEntries(COSTING_FIELDS.map((f) => [f, parseNumber(costing[f]) ?? 0])),
        });
        setCostingSaved(true);
        setCostingDirty(false);
      }
      setSaved(row);
      setDirty(false);
      notify(`Estimate #${row.number} saved`);
      if (isNew) window.location.replace(`#/price-sheet/estimates/${row.id}`);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function copyText() {
    if (!validate()) return;
    const text = estimateText(asSaved, SITE);
    try {
      await navigator.clipboard.writeText(text);
      notify('Copied! Paste it into a text or email');
    } catch {
      window.prompt('Copy this estimate:', text);
    }
  }

  function print() {
    if (validate()) window.print();
  }

  // Creates a job (and a customer, if needed) from this saved estimate.
  async function makeJob() {
    if (dirty) {
      notify('Save your changes first, then turn it into a job.', 'error');
      return;
    }
    setBusy(true);
    try {
      let customerId = saved.customer_id;
      if (!customerId) {
        const customer = await api.saveCustomer({
          full_name: saved.customer_name, phone: saved.customer_phone || '', email: saved.customer_email || '',
          company: '', customer_type: null, notes: '',
        });
        customerId = customer.id;
      }
      const accepted = saved.status === 'accepted';
      const job = await api.saveJob({
        title: `${saved.customer_name} cleanout`, customer_id: customerId, property_address: saved.property_address || '',
        service_type: null, status: accepted ? 'scheduled' : 'quoted', scheduled_date: null, completed_date: null,
        crew_notes: saved.notes || '',
      });
      await api.saveJobFinancials({
        job_id: job.id, quoted_amount: saved.total, agreed_price: accepted ? saved.total : null, admin_notes: `From estimate #${saved.number}`,
      });
      await api.saveEstimate({ id: saved.id, job_id: job.id, customer_id: customerId });
      notify('Job created from this estimate');
      window.location.hash = `#/jobs/${job.id}`;
    } catch (err) {
      notify(err.message, 'error');
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await api.deleteEstimate(saved.id);
      setDirty(false);
      notify(`Estimate #${saved.number} deleted`);
      window.location.hash = '#/price-sheet/estimates';
    } catch (err) {
      notify(err.message, 'error');
      setBusy(false);
    }
  }

  if (loadError) return <ErrorNote error={loadError} onRetry={() => window.location.reload()} />;
  if (!prices) return <div className="card flex h-48 items-center justify-center"><Spinner /></div>;

  const activePrices = prices.filter((p) => p.active);
  const errorList = Object.values(errors).filter(Boolean);

  return (
    <div className="space-y-5 pb-20 lg:pb-0">
      <div className="flex flex-wrap items-center gap-3">
        <a href="#/price-sheet/estimates" className="btn-ghost min-h-10">
          <AdminIcon name="arrowRight" className="h-4 w-4 rotate-180" />
          All estimates
        </a>
        <h2 className="font-display text-2xl font-semibold">{saved ? `Estimate #${saved.number}` : 'New estimate'}</h2>
        {saved?.is_demo && <DemoPill />}
        {dirty && <span className="pill bg-gold/20 text-gold-deep">Unsaved changes</span>}
        {est.inquiry_id && (
          <a href={`#/inquiries/${est.inquiry_id}`} className="pill bg-blush text-rose-ink underline-offset-2 hover:underline">
            <AdminIcon name="inbox" className="mr-1 h-3.5 w-3.5" />
            From a website request
          </a>
        )}
      </div>

      {errorList.length > 0 && (
        <div ref={formErrorRef} tabIndex={-1} role="alert" className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger outline-none">
          <p className="font-bold">Please fix {errorList.length === 1 ? 'this' : 'these'} first:</p>
          <ul className="mt-1 list-disc pl-5">{errorList.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-5">
          {/* Customer */}
          <section className="card animate-rise p-5 sm:p-6" aria-labelledby="cust-title">
            <h3 id="cust-title" className="font-display text-xl font-semibold">Customer</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Name" error={errors.customer_name}>
                {(p) => <input {...p} className="input" value={est.customer_name} onChange={set('customer_name')} autoComplete="off" />}
              </Field>
              <Field label="Phone" optional>
                {(p) => <input {...p} type="tel" className="input" value={est.customer_phone} onChange={set('customer_phone')} />}
              </Field>
              <Field label="Email" optional>
                {(p) => <input {...p} type="email" className="input" value={est.customer_email} onChange={set('customer_email')} />}
              </Field>
              <Field label="Property address" optional>
                {(p) => <input {...p} className="input" value={est.property_address} onChange={set('property_address')} />}
              </Field>
            </div>
          </section>

          {/* Services */}
          <section className="card animate-rise p-5 sm:p-6" style={{ animationDelay: '60ms' }} aria-labelledby="lines-title">
            <h3 id="lines-title" className="font-display text-xl font-semibold">What’s included</h3>
            {activePrices.length > 0 ? (
              <>
                <p className="mt-1 text-sm text-muted">Tap a service to add it. Tap again to add one more.</p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {activePrices.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => addPrice(p)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-petal bg-blush/50 px-3.5 text-sm font-semibold text-rose-ink transition hover:-translate-y-px hover:bg-petal/60">
                        <AdminIcon name="plus" className="h-3.5 w-3.5" strokeWidth={2.6} />
                        {p.name}
                        <span className="font-normal text-muted">{priceLabel(p)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">
                Your price sheet is empty. <a href="#/price-sheet" className="font-semibold text-rose-deep underline">Add your prices</a> to tap them in here, or add a custom line below.
              </p>
            )}

            {est.lines.length > 0 && (
              <ul className="mt-5 divide-y divide-line rounded-3xl border border-line">
                {est.lines.map((l) => {
                  const cents = lineCents({ ...l, unit_price: num(l.unit_price) ?? 0, quantity: num(l.quantity) ?? 0, minimum_charge: num(l.minimum_charge) });
                  const custom = !l.price_item_id;
                  const per = unitPer(l.unit);
                  const minimumApplied = minimumApplies({ quantity: num(l.quantity) ?? 0, unit_price: num(l.unit_price) ?? 0, minimum_charge: num(l.minimum_charge) });
                  return (
                    <li key={l.key} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="min-w-0 space-y-2">
                        <input
                          className={`w-full rounded-xl px-2 py-1 font-semibold outline-none focus:bg-blush/50 focus:ring-2 focus:ring-petal ${custom && !l.name ? 'bg-blush/40' : 'bg-transparent'}`}
                          value={l.name}
                          placeholder="Describe this line"
                          onChange={(e) => setLine(l.key, { name: e.target.value })}
                          aria-label="Line description"
                        />
                        <div className="flex flex-wrap items-center gap-2 px-2 text-sm text-muted">
                          <span className="relative">
                            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2">$</span>
                            <input
                              className="h-9 w-24 rounded-xl border border-line bg-white pr-2 pl-6 text-ink tabular outline-none focus:border-rose"
                              inputMode="decimal"
                              value={l.unit_price}
                              onChange={(e) => setLine(l.key, { unit_price: e.target.value })}
                              aria-label={`Price for ${l.name || 'this line'}`}
                            />
                          </span>
                          {custom ? (
                            <select className="h-9 rounded-xl border border-line bg-white px-2 text-ink" value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })} aria-label="Charged">
                              {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                            </select>
                          ) : (
                            per && <span>per {per}</span>
                          )}
                          {minimumApplied && <span className="pill bg-gold/20 text-gold-deep">Minimum charge</span>}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <Stepper value={l.quantity} onChange={(q) => setLine(l.key, { quantity: q })} label={l.name || 'this line'} />
                        <span className="w-24 text-right font-display text-lg font-semibold tabular">{formatCents(cents)}</span>
                        <button type="button" className="btn-ghost h-10 min-h-10 w-10 px-0 text-muted hover:text-danger" onClick={() => update({ lines: est.lines.filter((x) => x.key !== l.key) })} aria-label={`Remove ${l.name || 'this line'}`}>
                          <AdminIcon name="trash" className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <button type="button" onClick={addCustom} className="btn-soft mt-4 min-h-10">
              <AdminIcon name="plus" className="h-4 w-4" />
              Add a custom line
            </button>
          </section>

          {/* Scope and dumpster allowance (shown to the customer) */}
          {phase1 && (
            <section className="card animate-rise p-5 sm:p-6" style={{ animationDelay: '90ms' }} aria-labelledby="scope-title">
              <h3 id="scope-title" className="font-display text-xl font-semibold">Scope & dumpster allowance</h3>
              <p className="mt-1 text-sm text-muted">Shown on the estimate and the customer’s quote link, so they know exactly what’s included.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Scope of work" optional className="sm:col-span-2" hint="What you’ll do, in plain words. Mention anything set aside or left behind.">
                  {(p) => <textarea {...p} rows={3} className="input resize-y" placeholder="e.g. Clear all rooms, basement and garage. Set aside photo albums and papers for the family." value={est.scope_of_work} onChange={set('scope_of_work')} />}
                </Field>
                <Field label="Number of dumpsters" optional error={errors.dumpster_count}>
                  {(p) => <input {...p} inputMode="numeric" className="input tabular" placeholder="1" value={est.dumpster_count} onChange={set('dumpster_count')} />}
                </Field>
                <Field label="Dumpster size (cubic yards)" optional error={errors.dumpster_size_yards}>
                  {(p) => <input {...p} inputMode="decimal" className="input tabular" placeholder="e.g. 20" value={est.dumpster_size_yards} onChange={set('dumpster_size_yards')} />}
                </Field>
                <Field label="Weight allowance included (tons)" optional error={errors.dumpster_weight_allowance_tons} hint="From the dumpster company’s terms.">
                  {(p) => <input {...p} inputMode="decimal" className="input tabular" placeholder="e.g. 3" value={est.dumpster_weight_allowance_tons} onChange={set('dumpster_weight_allowance_tons')} />}
                </Field>
                <Field label="Rental days included" optional error={errors.dumpster_rental_days}>
                  {(p) => <input {...p} inputMode="numeric" className="input tabular" placeholder="e.g. 7" value={est.dumpster_rental_days} onChange={set('dumpster_rental_days')} />}
                </Field>
                <Field label="Provider’s overweight rate (per ton)" optional error={errors.overage_rate_per_ton} hint="Disclosed only. Never charged automatically.">
                  {(p) => (
                    <div className="relative">
                      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">$</span>
                      <input {...p} inputMode="decimal" className="input pl-8 tabular" value={est.overage_rate_per_ton} onChange={set('overage_rate_per_ton')} />
                    </div>
                  )}
                </Field>
                <Field label="Provider’s extra-day rate" optional error={errors.extra_day_rate} hint="Disclosed only. Never charged automatically.">
                  {(p) => (
                    <div className="relative">
                      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">$</span>
                      <input {...p} inputMode="decimal" className="input pl-8 tabular" value={est.extra_day_rate} onChange={set('extra_day_rate')} />
                    </div>
                  )}
                </Field>
                <Field label="Additional charges" optional className="sm:col-span-2" hint="How extra dumpster charges are handled and approved. Edit the default in Quote template.">
                  {(p) => <textarea {...p} rows={3} className="input resize-y text-sm" value={est.overage_terms} onChange={set('overage_terms')} />}
                </Field>
              </div>
            </section>
          )}

          {/* Details */}
          <section className="card animate-rise p-5 sm:p-6" style={{ animationDelay: '120ms' }} aria-labelledby="details-title">
            <h3 id="details-title" className="font-display text-xl font-semibold">Details</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Estimate date">
                {(p) => <input {...p} type="date" className="input" value={est.estimate_date} onChange={set('estimate_date')} />}
              </Field>
              <Field label="Valid until" optional error={errors.valid_until}>
                {(p) => <input {...p} type="date" className="input" value={est.valid_until} onChange={set('valid_until')} />}
              </Field>
              <Field label="Discount" optional>
                {(p) => (
                  <select {...p} className="input" value={est.discount_type} onChange={(e) => update({ discount_type: e.target.value, discount_value: e.target.value ? est.discount_value : '' })}>
                    <option value="">No discount</option>
                    <option value="amount">Dollar amount ($)</option>
                    <option value="percent">Percent (%)</option>
                  </select>
                )}
              </Field>
              {est.discount_type ? (
                <Field label={est.discount_type === 'percent' ? 'Discount percent' : 'Discount amount'} error={errors.discount_value}>
                  {(p) => <input {...p} inputMode="decimal" placeholder={est.discount_type === 'percent' ? 'e.g. 10' : 'e.g. 50'} className="input tabular" value={est.discount_value} onChange={set('discount_value')} />}
                </Field>
              ) : (
                <div className="hidden sm:block" />
              )}
              <Field label="Deposit to book" optional error={errors.deposit_amount} hint="Usually the dumpster rental cost. It’s credited toward the total, not added to it.">
                {(p) => (
                  <div className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">$</span>
                    <input {...p} inputMode="decimal" placeholder="None" className="input pl-8 tabular" value={est.deposit_amount} onChange={set('deposit_amount')} />
                  </div>
                )}
              </Field>
              <Field label="Status">
                {(p) => (
                  <select {...p} className="input" value={est.status} onChange={set('status')}>
                    {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Notes for the customer" optional className="sm:col-span-2">
                {(p) => <textarea {...p} rows={2} className="input resize-y" placeholder="e.g. Includes clearing the basement and garage." value={est.notes} onChange={set('notes')} />}
              </Field>
              <Field label="Fine print" optional className="sm:col-span-2" hint="Printed at the bottom of the estimate. Edit it to say whatever you like.">
                {(p) => <textarea {...p} rows={3} className="input resize-y text-sm" value={est.terms} onChange={set('terms')} />}
              </Field>
            </div>
          </section>

          {phase1 && (
            <CostingPanel
              value={costing}
              errors={validateCosting(costing)}
              onChange={(patch) => {
                setCosting((c) => ({ ...c, ...patch }));
                setCostingDirty(true);
                setDirty(true);
              }}
              totalCents={totals.total}
              depositCents={Math.round((num(est.deposit_amount) || 0) * 100)}
              hasLines={est.lines.length > 0}
              onUseDeposit={(cents) => update({ deposit_amount: (cents / 100).toFixed(2) })}
              onUsePrice={(cents) =>
                update({
                  lines: [{ key: newKey(), price_item_id: null, name: 'Clean-out: labor, dumpster and disposal', description: '', unit: 'flat', unit_price: (cents / 100).toFixed(2), quantity: '1', minimum_charge: '' }],
                })
              }
            />
          )}
        </div>

        {/* Running total */}
        <aside className="card animate-rise space-y-4 p-5 sm:p-6 lg:sticky lg:top-6" style={{ animationDelay: '90ms' }} aria-label="Estimate total">
          <dl className="space-y-2 text-sm tabular">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="font-semibold">{formatCents(totals.subtotal)}</dd></div>
            {totals.discount > 0 && (
              <div className="flex justify-between text-sage-deep"><dt>Discount</dt><dd className="font-semibold">−{formatCents(totals.discount)}</dd></div>
            )}
            <div className="flex items-baseline justify-between border-t border-line pt-3">
              <dt className="font-semibold">Estimated total</dt>
              <dd className="font-display text-3xl font-semibold text-rose-ink" aria-live="polite">{formatCents(totals.total)}</dd>
            </div>
            {num(est.deposit_amount) > 0 && (
              <>
                <div className="flex justify-between"><dt className="text-muted">Deposit to book</dt><dd className="font-semibold">{formatCents(Math.round(num(est.deposit_amount) * 100))}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Balance after deposit</dt><dd className="font-semibold">{formatCents(Math.max(0, totals.total - Math.round(num(est.deposit_amount) * 100)))}</dd></div>
              </>
            )}
          </dl>
          <div className="grid gap-2">
            <button type="button" className="btn-primary w-full" onClick={save} disabled={busy}>
              <AdminIcon name="check" className="h-4 w-4" strokeWidth={2.4} />
              {busy ? 'Saving…' : saved ? 'Save changes' : 'Save estimate'}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-ghost" onClick={copyText}>Copy text</button>
              <button type="button" className="btn-ghost" onClick={print}>Print / PDF</button>
            </div>
            {saved?.job_id ? (
              <a href={`#/jobs/${saved.job_id}`} className="btn-soft w-full">
                <AdminIcon name="truck" className="h-4 w-4" />
                Open the job
              </a>
            ) : (
              saved && (
                <button type="button" className="btn-soft w-full" onClick={makeJob} disabled={busy}>
                  <AdminIcon name="truck" className="h-4 w-4" />
                  Turn into a job
                </button>
              )
            )}
            {saved && (
              <button type="button" onClick={remove} disabled={busy} className={confirmDelete ? 'btn-danger w-full' : 'btn-ghost w-full text-danger'}>
                {confirmDelete ? 'Yes, delete this estimate' : 'Delete estimate'}
              </button>
            )}
          </div>
          {saved && (
            <QuoteLink
              estimate={saved}
              dirty={dirty}
              onChange={(row) => {
                setSaved(row);
                setEst((e) => ({ ...e, status: row.status }));
              }}
            />
          )}
          <p className="text-xs text-muted">
            “Print / PDF” opens your printer window. Choose <strong>Save as PDF</strong> there to email it as a file.
          </p>
        </aside>
      </div>

      {/* Phones: keep the total and Save in view while scrolling. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-line bg-cream/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <p className="leading-tight">
          <span className="block text-xs text-muted">Estimated total</span>
          <span className="font-display text-2xl font-semibold text-rose-ink tabular">{formatCents(totals.total)}</span>
        </p>
        <button type="button" className="btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : saved ? 'Save changes' : 'Save estimate'}
        </button>
      </div>

      <EstimateDocument estimate={asSaved} />
    </div>
  );
}
