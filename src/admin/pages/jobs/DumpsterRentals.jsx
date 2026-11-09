// Dumpsters on a job: who's providing it, size, allowance, dates and placement.
// This is for planning and tracking. What you actually PAY is recorded as an expense
// ("Record as expense"), so job profit counts each cost exactly once.

import { useEffect, useState } from 'react';
import AdminIcon from '../../components/AdminIcon.jsx';
import { DemoPill, Field, Modal, useToast } from '../../components/ui.jsx';
import { api } from '../../lib/api/index.js';
import { formatDate, todayISO } from '../../lib/dates.js';
import { formatMoney, parseAmount } from '../../lib/money.js';

const BLANK = {
  provider_name: '', provider_contact: '', size_yards: '', base_cost: '', included_days: '', weight_allowance_tons: '',
  overage_rate_per_ton: '', extra_day_rate: '', delivery_date: '', expected_pickup_date: '', actual_pickup_date: '',
  placement_notes: '', permit_required: '', permit_notes: '', confirmation_number: '', actual_overage_charges: '', notes: '',
};

const text = (v) => (v === null || v === undefined ? '' : String(v));

export function dumpsterStatus(d, today = todayISO()) {
  if (d.actual_pickup_date) return { label: 'Picked up', className: 'bg-sage/25 text-sage-deep' };
  if (d.expected_pickup_date && d.expected_pickup_date < today && d.delivery_date && d.delivery_date <= today) {
    return { label: 'Pickup overdue', className: 'bg-danger/10 text-danger' };
  }
  if (d.delivery_date && d.delivery_date <= today) return { label: 'On site', className: 'bg-gold/20 text-gold-deep' };
  if (d.delivery_date) return { label: 'Booked', className: 'bg-blush text-rose-ink' };
  return { label: 'Planning', className: 'bg-line text-muted' };
}

function DumpsterForm({ open, jobId, rental, providers, onClose, onSaved }) {
  const notify = useToast();
  const [v, setV] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setV(rental ? Object.fromEntries(Object.keys(BLANK).map((k) => [k, k === 'permit_required' ? (rental[k] === null ? '' : rental[k] ? 'yes' : 'no') : text(rental[k])])) : BLANK);
    setErrors({});
    setConfirmDelete(false);
  }, [open, rental]);

  const set = (key) => (e) => {
    const value = e.target.value;
    setV((x) => {
      const next = { ...x, [key]: value };
      // Picking a provider you've used before fills in their contact details.
      if (key === 'provider_name' && !x.provider_contact) {
        const known = providers.find((p) => p.name === value);
        if (known?.contact) next.provider_contact = known.contact;
      }
      return next;
    });
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };

  function money(key, found) {
    if (!v[key].trim()) return null;
    if (v[key].trim().replace(/[$,\s]/g, '') === '0') return '0.00';
    const p = parseAmount(v[key]);
    if (!p) found[key] = 'Enter an amount, or leave it empty.';
    return p;
  }
  function number(key, found, { whole = false, max = 100000 } = {}) {
    const t = v[key].trim();
    if (!t) return null;
    const ok = whole ? /^\d+$/.test(t) : /^\d+(\.\d{1,2})?$/.test(t);
    if (!ok || Number(t) <= 0 || Number(t) > max) {
      found[key] = whole ? 'Enter a whole number.' : 'Enter a number, like 20 or 2.5.';
      return null;
    }
    return Number(t);
  }

  async function submit(e) {
    e.preventDefault();
    const found = {};
    const row = {
      ...(rental ? { id: rental.id } : { job_id: jobId }),
      provider_name: v.provider_name.trim() || null,
      provider_contact: v.provider_contact.trim() || null,
      size_yards: number('size_yards', found, { max: 100 }),
      base_cost: money('base_cost', found),
      included_days: number('included_days', found, { whole: true, max: 365 }),
      weight_allowance_tons: number('weight_allowance_tons', found, { max: 100 }),
      overage_rate_per_ton: money('overage_rate_per_ton', found),
      extra_day_rate: money('extra_day_rate', found),
      delivery_date: v.delivery_date || null,
      expected_pickup_date: v.expected_pickup_date || null,
      actual_pickup_date: v.actual_pickup_date || null,
      placement_notes: v.placement_notes.trim() || null,
      permit_required: v.permit_required === '' ? null : v.permit_required === 'yes',
      permit_notes: v.permit_notes.trim() || null,
      confirmation_number: v.confirmation_number.trim() || null,
      actual_overage_charges: money('actual_overage_charges', found),
      notes: v.notes.trim() || null,
    };
    if (row.delivery_date && row.expected_pickup_date && row.expected_pickup_date < row.delivery_date) found.expected_pickup_date = 'Pickup can’t be before delivery.';
    if (row.delivery_date && row.actual_pickup_date && row.actual_pickup_date < row.delivery_date) found.actual_pickup_date = 'Pickup can’t be before delivery.';
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await api.saveDumpster(row);
      notify(rental ? 'Dumpster updated' : 'Dumpster added');
      onSaved();
      onClose();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
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
      await api.deleteDumpster(rental.id);
      notify('Dumpster removed. Any expenses you recorded for it are kept.');
      onSaved();
      onClose();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const moneyInput = (key) => (p) => (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">$</span>
      <input {...p} inputMode="decimal" className="input pl-8 tabular" value={v[key]} onChange={set(key)} />
    </div>
  );

  return (
    <Modal open={open} wide title={rental ? 'Dumpster details' : 'Add a dumpster'} onClose={onClose}
      footer={
        <>
          {rental && (
            <button type="button" className={`mr-auto ${confirmDelete ? 'btn-danger' : 'btn-ghost text-danger'}`} onClick={remove} disabled={busy}>
              {confirmDelete ? 'Yes, remove it' : 'Remove'}
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="dumpster-form" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save dumpster'}</button>
        </>
      }>
      <form id="dumpster-form" onSubmit={submit} noValidate className="space-y-5">
        <datalist id="dumpster-providers">{providers.map((p) => <option key={p.name} value={p.name} />)}</datalist>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dumpster company" optional>
            {(p) => <input {...p} list="dumpster-providers" className="input" value={v.provider_name} onChange={set('provider_name')} autoComplete="off" />}
          </Field>
          <Field label="Their contact info" optional hint="Phone, email or contact name.">
            {(p) => <input {...p} className="input" value={v.provider_contact} onChange={set('provider_contact')} />}
          </Field>
          <Field label="Size (cubic yards)" optional error={errors.size_yards}>
            {(p) => <input {...p} inputMode="decimal" className="input tabular" placeholder="e.g. 20" value={v.size_yards} onChange={set('size_yards')} />}
          </Field>
          <Field label="Base rental cost" optional error={errors.base_cost} hint="What the company charges you.">{moneyInput('base_cost')}</Field>
          <Field label="Rental days included" optional error={errors.included_days}>
            {(p) => <input {...p} inputMode="numeric" className="input tabular" value={v.included_days} onChange={set('included_days')} />}
          </Field>
          <Field label="Weight allowance (tons)" optional error={errors.weight_allowance_tons}>
            {(p) => <input {...p} inputMode="decimal" className="input tabular" value={v.weight_allowance_tons} onChange={set('weight_allowance_tons')} />}
          </Field>
          <Field label="Overweight rate (per ton)" optional error={errors.overage_rate_per_ton}>{moneyInput('overage_rate_per_ton')}</Field>
          <Field label="Extra-day rate" optional error={errors.extra_day_rate}>{moneyInput('extra_day_rate')}</Field>
          <Field label="Delivery date" optional>
            {(p) => <input {...p} type="date" className="input" value={v.delivery_date} onChange={set('delivery_date')} />}
          </Field>
          <Field label="Expected pickup" optional error={errors.expected_pickup_date}>
            {(p) => <input {...p} type="date" className="input" value={v.expected_pickup_date} onChange={set('expected_pickup_date')} />}
          </Field>
          <Field label="Actual pickup" optional error={errors.actual_pickup_date}>
            {(p) => <input {...p} type="date" className="input" value={v.actual_pickup_date} onChange={set('actual_pickup_date')} />}
          </Field>
          <Field label="Confirmation number" optional>
            {(p) => <input {...p} className="input" value={v.confirmation_number} onChange={set('confirmation_number')} />}
          </Field>
          <Field label="Placement" optional className="sm:col-span-2" hint="Where it goes and who approved it.">
            {(p) => <input {...p} className="input" placeholder="e.g. Driveway, left side. Owner approved." value={v.placement_notes} onChange={set('placement_notes')} />}
          </Field>
          <Field label="Permit needed?" optional>
            {(p) => (
              <select {...p} className="input" value={v.permit_required} onChange={set('permit_required')}>
                <option value="">Not sure yet</option>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            )}
          </Field>
          <Field label="Permit details" optional>
            {(p) => <input {...p} className="input" placeholder="Permit #, cost, dates" value={v.permit_notes} onChange={set('permit_notes')} />}
          </Field>
          <Field label="Actual overage charges" optional error={errors.actual_overage_charges} hint="From the provider’s invoice or weight ticket.">{moneyInput('actual_overage_charges')}</Field>
          <Field label="Notes" optional>
            {(p) => <input {...p} className="input" value={v.notes} onChange={set('notes')} />}
          </Field>
        </div>
      </form>
    </Modal>
  );
}

export default function DumpsterRentals({ job, categories, onChanged }) {
  const notify = useToast();
  const [rentals, setRentals] = useState(undefined); // undefined loading, null not set up
  const [providers, setProviders] = useState([]);
  const [form, setForm] = useState(null); // null | 'new' | rental
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      const [list, known] = await Promise.all([api.listDumpsters(job.id), api.listDumpsterProviders().catch(() => [])]);
      setRentals(list);
      setProviders(known);
    } catch {
      setRentals([]);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  // Records what was paid as a job expense (so profit counts it once) and links it here.
  async function recordExpense(rental, kind) {
    const name = kind === 'base' ? 'Dumpster rental' : 'Dumpster overage & extra-day fees';
    const category = categories.find((c) => c.name === name && c.active) || categories.find((c) => c.name === name);
    if (!category) {
      notify(`Add an expense category called “${name}” first.`, 'error');
      return;
    }
    const amount = kind === 'base' ? rental.base_cost : rental.actual_overage_charges;
    setBusyId(rental.id);
    try {
      const expense = await api.saveExpense({
        expense_date: (kind === 'base' ? rental.delivery_date : rental.actual_pickup_date) || todayISO(),
        vendor: rental.provider_name || '',
        description: kind === 'base' ? `${rental.size_yards ? `${Number(rental.size_yards)}-yard ` : ''}dumpster rental` : 'Dumpster overage / extra days',
        category_id: category.id,
        amount: Number(amount).toFixed(2),
        payment_method: null,
        notes: rental.confirmation_number ? `Confirmation ${rental.confirmation_number}` : '',
        job_id: job.id,
      });
      await api.saveDumpster({ id: rental.id, [kind === 'base' ? 'base_expense_id' : 'overage_expense_id']: expense.id });
      notify('Recorded in this job’s costs and your Expenses');
      await load();
      onChanged();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  if (rentals === null) {
    return (
      <p className="rounded-2xl bg-blush/50 px-4 py-3 text-sm text-muted">
        Dumpster tracking isn’t switched on yet. See “Website requests and dumpsters” in docs/ADMIN_SETUP.md.
      </p>
    );
  }

  return (
    <section className="card animate-rise p-5 sm:p-6" style={{ animationDelay: '140ms' }} aria-labelledby="job-dumpsters">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="job-dumpsters" className="font-display text-xl font-semibold">Dumpsters</h3>
        <button type="button" className="btn-soft min-h-10" onClick={() => setForm('new')}>
          <AdminIcon name="plus" className="h-4 w-4" />
          Add a dumpster
        </button>
      </div>
      {rentals === undefined ? null : rentals.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Track the dumpster company, size, allowance, delivery and pickup for this job.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rentals.map((d) => {
            const s = dumpsterStatus(d);
            return (
              <li key={d.id} className="rounded-2xl bg-white p-4 ring-1 ring-line">
                <div className="flex flex-wrap items-center gap-2">
                  <AdminIcon name="dumpster" className="h-5 w-5 text-rose-deep" />
                  <span className="font-semibold">{d.size_yards ? `${Number(d.size_yards)}-yard dumpster` : 'Dumpster'}</span>
                  {d.provider_name && <span className="text-sm text-muted">· {d.provider_name}</span>}
                  <span className={`pill ${s.className}`}>{s.label}</span>
                  {d.is_demo && <DemoPill />}
                  <button type="button" className="btn-ghost ml-auto min-h-9 px-3" onClick={() => setForm(d)}>
                    <AdminIcon name="edit" className="h-4 w-4" />
                    Edit
                  </button>
                </div>
                <dl className="mt-3 grid gap-x-5 gap-y-2 text-sm sm:grid-cols-3">
                  <div><dt className="text-muted">Delivery</dt><dd>{d.delivery_date ? formatDate(d.delivery_date) : '—'}</dd></div>
                  <div><dt className="text-muted">Pickup</dt><dd>{d.actual_pickup_date ? `${formatDate(d.actual_pickup_date)} (done)` : d.expected_pickup_date ? `${formatDate(d.expected_pickup_date)} (expected)` : '—'}</dd></div>
                  <div><dt className="text-muted">Allowance</dt><dd>{[d.weight_allowance_tons && `${Number(d.weight_allowance_tons)} tons`, d.included_days && `${d.included_days} days`].filter(Boolean).join(' · ') || '—'}</dd></div>
                  <div><dt className="text-muted">Base cost</dt><dd className="tabular">{d.base_cost !== null ? formatMoney(d.base_cost) : '—'}</dd></div>
                  <div><dt className="text-muted">Overage rates</dt><dd className="tabular">{[d.overage_rate_per_ton !== null && `${formatMoney(d.overage_rate_per_ton)}/ton`, d.extra_day_rate !== null && `${formatMoney(d.extra_day_rate)}/day`].filter(Boolean).join(' · ') || '—'}</dd></div>
                  <div><dt className="text-muted">Permit</dt><dd>{d.permit_required === null ? 'Not sure yet' : d.permit_required ? `Needed${d.permit_notes ? ` · ${d.permit_notes}` : ''}` : 'Not needed'}</dd></div>
                </dl>
                {(d.placement_notes || d.provider_contact || d.confirmation_number) && (
                  <p className="mt-2 text-sm text-muted">
                    {[d.placement_notes && `Placement: ${d.placement_notes}`, d.provider_contact && `Contact: ${d.provider_contact}`, d.confirmation_number && `Confirmation #${d.confirmation_number}`].filter(Boolean).join(' · ')}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  {d.base_cost !== null && Number(d.base_cost) > 0 && (d.base_expense_id ? (
                    <span className="pill bg-sage/25 text-sage-deep"><AdminIcon name="check" className="mr-1 h-3.5 w-3.5" />Rental recorded in costs</span>
                  ) : (
                    <button type="button" className="btn-ghost min-h-9 px-3" disabled={busyId === d.id} onClick={() => recordExpense(d, 'base')}>
                      Record {formatMoney(d.base_cost)} rental as a cost
                    </button>
                  ))}
                  {d.actual_overage_charges !== null && Number(d.actual_overage_charges) > 0 && (d.overage_expense_id ? (
                    <span className="pill bg-sage/25 text-sage-deep"><AdminIcon name="check" className="mr-1 h-3.5 w-3.5" />Overage recorded in costs</span>
                  ) : (
                    <button type="button" className="btn-ghost min-h-9 px-3" disabled={busyId === d.id} onClick={() => recordExpense(d, 'overage')}>
                      Record {formatMoney(d.actual_overage_charges)} overage as a cost
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">
        Profit counts what you’ve recorded under Job costs. Use “Record as a cost” once you’ve paid, so nothing is counted twice.
      </p>
      <DumpsterForm open={form !== null} jobId={job.id} rental={form === 'new' ? null : form} providers={providers}
        onClose={() => setForm(null)} onSaved={load} />
    </section>
  );
}
