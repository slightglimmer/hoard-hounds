import { useEffect, useState } from 'react';
import AdminIcon from '../../components/AdminIcon.jsx';
import { DemoPill, EmptyState, Field, Modal, useToast } from '../../components/ui.jsx';
import { api } from '../../lib/api/index.js';
import { UNITS, unitPer } from '../../lib/estimate.js';
import { formatMoney, parseAmount } from '../../lib/money.js';

// "$650 / load", "$225"
export function priceLabel(item) {
  const per = unitPer(item.unit);
  return `${formatMoney(item.unit_price)}${per ? ` / ${per}` : ''}`;
}

// Like parseAmount, but $0 is allowed (free add-ons, waived fees).
function parsePrice(input) {
  if (String(input ?? '').trim().replace(/[$\s]/g, '') === '0') return '0.00';
  return parseAmount(input);
}

const blank = { name: '', description: '', unit: 'flat', unit_price: '', minimum_charge: '', active: true };

function PriceItemForm({ open, item, nextSortOrder, onClose, onSaved }) {
  const notify = useToast();
  const [values, setValues] = useState(blank);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setValues(item ? { ...blank, ...item, description: item.description ?? '', unit_price: String(item.unit_price), minimum_charge: item.minimum_charge ?? '' } : blank);
    setErrors({});
    setConfirmDelete(false);
    setFormError('');
  }, [open, item]);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };

  async function submit(e) {
    e.preventDefault();
    const found = {};
    if (!values.name.trim()) found.name = 'Give this service a name.';
    if (parsePrice(values.unit_price) === null) found.unit_price = 'Enter a price, like 95 or 649.99.';
    if (String(values.minimum_charge).trim() && parsePrice(values.minimum_charge) === null) found.minimum_charge = 'Enter an amount, or leave it empty.';
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setFormError('');
    try {
      await api.savePriceItem({
        ...(item ? { id: item.id } : { sort_order: nextSortOrder }),
        name: values.name.trim(),
        description: values.description.trim(),
        unit: values.unit,
        unit_price: parsePrice(values.unit_price),
        minimum_charge: String(values.minimum_charge).trim() ? parsePrice(values.minimum_charge) : null,
        active: values.active,
      });
      notify(item ? 'Price updated' : 'Price added');
      onSaved();
    } catch (err) {
      setFormError(err.message);
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
      await api.deletePriceItem(item.id);
      notify('Price deleted');
      onSaved();
    } catch (err) {
      setFormError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={item ? 'Edit price' : 'Add a price'}
      onClose={onClose}
      footer={
        <>
          {item && (
            <button type="button" onClick={remove} disabled={busy} className={`${confirmDelete ? 'btn-danger' : 'btn-ghost text-danger'} mr-auto`}>
              {confirmDelete ? 'Yes, delete it' : 'Delete'}
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" form="price-form" disabled={busy} className="btn-primary">
            {busy ? 'Saving…' : item ? 'Save changes' : 'Add price'}
          </button>
        </>
      }
    >
      <form id="price-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        {formError && <p role="alert" className="rounded-2xl bg-danger/8 px-4 py-3 text-sm font-medium text-danger sm:col-span-2">{formError}</p>}
        {confirmDelete && (
          <p className="rounded-2xl bg-blush px-4 py-3 text-sm text-rose-ink sm:col-span-2">
            Estimates you already made keep their own copy of this price, so they won’t change. To hide it without deleting, untick Active instead.
          </p>
        )}
        <Field label="Service name" error={errors.name} className="sm:col-span-2">
          {(p) => <input {...p} placeholder="e.g. Full truck load" className="input" value={values.name} onChange={set('name')} />}
        </Field>
        <Field label="Short description" optional className="sm:col-span-2" hint="Shown to customers on the estimate.">
          {(p) => <input {...p} placeholder="e.g. About 15 cubic yards" className="input" value={values.description} onChange={set('description')} />}
        </Field>
        <Field label="Charged">
          {(p) => (
            <select {...p} className="input" value={values.unit} onChange={set('unit')}>
              {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          )}
        </Field>
        <Field label="Price" error={errors.unit_price}>
          {(p) => (
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">$</span>
              <input {...p} inputMode="decimal" placeholder="0.00" className="input pl-8 tabular" value={values.unit_price} onChange={set('unit_price')} />
            </div>
          )}
        </Field>
        <Field label="Minimum charge" optional error={errors.minimum_charge} hint="The least this line can cost on an estimate.">
          {(p) => (
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">$</span>
              <input {...p} inputMode="decimal" placeholder="None" className="input pl-8 tabular" value={values.minimum_charge} onChange={set('minimum_charge')} />
            </div>
          )}
        </Field>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 self-end rounded-2xl bg-blush/60 px-4">
          <input type="checkbox" className="h-5 w-5 accent-[#9c3d5d]" checked={values.active} onChange={set('active')} />
          <span className="text-sm font-semibold">Active</span>
          <span className="text-xs text-muted">Show when making estimates</span>
        </label>
      </form>
    </Modal>
  );
}

export default function PricesPanel({ items, onChanged }) {
  const notify = useToast();
  const [editing, setEditing] = useState(null); // null | 'new' | item
  const [moving, setMoving] = useState(false);
  const nextSortOrder = Math.max(0, ...items.map((i) => i.sort_order)) + 10;

  // Swap places with the neighbor above or below.
  async function move(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const order = [...items];
    [order[index], order[target]] = [order[target], order[index]];
    setMoving(true);
    try {
      // Renumber the whole list (10, 20, 30...) so items that shared a number stay in place.
      await Promise.all(
        order.map((it, pos) => ((pos + 1) * 10 === it.sort_order ? null : api.savePriceItem({ id: it.id, sort_order: (pos + 1) * 10 }))),
      );
      onChanged();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setMoving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-3xl bg-gradient-to-r from-blush to-petal/60 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm text-rose-ink">
          List your services the way you quote them. When you make an estimate, tap a service to add it and the total adds up for you.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="#/price-sheet/estimates/new" className="btn-ghost">
            <AdminIcon name="receipt" className="h-4 w-4" />
            New estimate
          </a>
          <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
            <AdminIcon name="plus" className="h-4 w-4" strokeWidth={2.4} />
            Add a price
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <EmptyState icon="tag" title="Your price sheet is empty" action={<button type="button" className="btn-soft" onClick={() => setEditing('new')}>Add your first price</button>}>
            Add what you charge, like a single item pickup, a full truck load, or extra labor per hour.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {items.map((item, i) => (
            <li key={item.id} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
              <div className={`card flex h-full items-stretch gap-2 p-2 transition hover:shadow-lift ${item.active ? '' : 'opacity-70'}`}>
                <button type="button" onClick={() => setEditing(item)} className="flex min-w-0 flex-1 flex-col rounded-[1.4rem] p-3 text-left transition hover:bg-blush/40">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0 font-display text-lg leading-snug font-semibold">{item.name}</span>
                    <span className="shrink-0 text-right font-display text-lg font-semibold text-rose-ink tabular">{priceLabel(item)}</span>
                  </span>
                  {item.description && <span className="mt-1 text-sm text-muted">{item.description}</span>}
                  <span className="mt-3 flex flex-wrap gap-2">
                    {Number(item.minimum_charge) > 0 && <span className="pill bg-blush text-rose-ink">Minimum {formatMoney(item.minimum_charge)}</span>}
                    {!item.active && <span className="pill bg-blush text-muted">Hidden</span>}
                    {item.is_demo && <DemoPill />}
                  </span>
                </button>
                <span className="flex flex-col justify-center gap-1">
                  <button type="button" className="btn-ghost h-9 min-h-9 w-9 px-0" disabled={moving || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${item.name} up`}>
                    <AdminIcon name="arrowUp" className="h-4 w-4" />
                  </button>
                  <button type="button" className="btn-ghost h-9 min-h-9 w-9 px-0" disabled={moving || i === items.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${item.name} down`}>
                    <AdminIcon name="arrowDown" className="h-4 w-4" />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <PriceItemForm
        open={editing !== null}
        item={editing === 'new' ? null : editing}
        nextSortOrder={nextSortOrder}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChanged();
        }}
      />
    </div>
  );
}
