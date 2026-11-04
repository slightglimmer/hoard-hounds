import { useEffect, useMemo, useState } from 'react';
import AdminIcon from '../../components/AdminIcon.jsx';
import { DemoPill, EmptyState, Field, Modal, useToast } from '../../components/ui.jsx';
import { api } from '../../lib/api/index.js';
import { formatDate, todayISO } from '../../lib/dates.js';
import { formatMoney, parseAmount } from '../../lib/money.js';
import { FREQUENCIES, dueDates, frequencyLabel, recurrenceDate, recurringStatus } from '../../lib/recurrence.js';
import { PAYMENT_METHODS } from './ExpenseForm.jsx';

const STATUS = {
  due: { label: 'Due now', className: 'bg-gold/20 text-gold-deep' },
  scheduled: { label: 'Scheduled', className: 'bg-sage/25 text-sage-deep' },
  paused: { label: 'Paused', className: 'bg-blush text-muted' },
  ended: { label: 'Ended', className: 'bg-blush text-muted' },
};

const blank = () => ({
  description: '', vendor: '', category_id: '', amount: '', payment_method: 'card', frequency: 'monthly',
  start_date: todayISO(), end_date: '', active: true, notes: '',
});

function RecurringForm({ open, item, categories, onClose, onSaved }) {
  const notify = useToast();
  const [values, setValues] = useState(blank);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setValues(item ? { ...blank(), ...item, amount: String(item.amount), vendor: item.vendor ?? '', end_date: item.end_date ?? '', notes: item.notes ?? '', payment_method: item.payment_method ?? '' } : blank());
    setErrors({});
    setConfirmDelete(false);
    setFormError('');
  }, [open, item]);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };

  const nextCharge = values.start_date && values.frequency
    ? recurrenceDate(values.start_date, values.frequency, item?.occurrences_posted ?? 0)
    : null;

  async function submit(e) {
    e.preventDefault();
    const found = {};
    if (!values.description.trim()) found.description = 'Add a short description.';
    if (!parseAmount(values.amount)) found.amount = 'Enter an amount greater than $0.';
    if (!values.category_id) found.category_id = 'Choose a category.';
    if (!values.start_date) found.start_date = 'Choose the first charge date.';
    if (values.end_date && values.end_date < values.start_date) found.end_date = 'The end date must be after the start date.';
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setFormError('');
    try {
      await api.saveRecurring({
        ...(item?.id ? { id: item.id } : {}),
        description: values.description.trim(),
        vendor: values.vendor.trim(),
        category_id: values.category_id,
        amount: parseAmount(values.amount),
        payment_method: values.payment_method || null,
        frequency: values.frequency,
        start_date: values.start_date,
        end_date: values.end_date || null,
        active: values.active,
        notes: values.notes.trim(),
      });
      notify(item ? 'Recurring charge updated' : 'Recurring charge added');
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
      await api.deleteRecurring(item.id);
      notify('Recurring charge deleted');
      onSaved();
    } catch (err) {
      setFormError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      wide
      title={item ? 'Edit recurring charge' : 'Add recurring charge'}
      onClose={onClose}
      footer={
        <>
          {item && (
            <button type="button" onClick={remove} disabled={busy} className={`${confirmDelete ? 'btn-danger' : 'btn-ghost text-danger'} mr-auto`}>
              {confirmDelete ? 'Yes, delete it' : 'Delete'}
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" form="recurring-form" disabled={busy} className="btn-primary">
            {busy ? 'Saving…' : item ? 'Save changes' : 'Add recurring charge'}
          </button>
        </>
      }
    >
      <form id="recurring-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        {formError && <p role="alert" className="rounded-2xl bg-danger/8 px-4 py-3 text-sm font-medium text-danger sm:col-span-2">{formError}</p>}
        {confirmDelete && (
          <p className="rounded-2xl bg-blush px-4 py-3 text-sm text-rose-ink sm:col-span-2">
            Expenses already posted from this charge are kept. Only the schedule is deleted.
          </p>
        )}
        <Field label="Description" error={errors.description} className="sm:col-span-2">
          {(p) => <input {...p} placeholder="e.g. Liability insurance" className="input" value={values.description} onChange={set('description')} />}
        </Field>
        <Field label="Vendor" optional>
          {(p) => <input {...p} className="input" value={values.vendor} onChange={set('vendor')} />}
        </Field>
        <Field label="Amount" error={errors.amount}>
          {(p) => (
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">$</span>
              <input {...p} inputMode="decimal" placeholder="0.00" className="input pl-8 tabular" value={values.amount} onChange={set('amount')} />
            </div>
          )}
        </Field>
        <Field label="Category" error={errors.category_id}>
          {(p) => (
            <select {...p} className="input" value={values.category_id} onChange={set('category_id')}>
              <option value="">Choose…</option>
              {categories.filter((c) => c.active || c.id === values.category_id).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Paid with" optional>
          {(p) => (
            <select {...p} className="input" value={values.payment_method} onChange={set('payment_method')}>
              <option value="">Not specified</option>
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          )}
        </Field>
        <Field label="How often">
          {(p) => (
            <select {...p} className="input" value={values.frequency} onChange={set('frequency')}>
              {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          )}
        </Field>
        <Field label="First charge date" error={errors.start_date} hint={nextCharge ? `Next charge: ${formatDate(nextCharge)}` : undefined}>
          {(p) => <input {...p} type="date" className="input" value={values.start_date} onChange={set('start_date')} />}
        </Field>
        <Field label="End date" optional error={errors.end_date} hint="Leave empty if it keeps going.">
          {(p) => <input {...p} type="date" className="input" value={values.end_date} onChange={set('end_date')} />}
        </Field>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 self-end rounded-2xl bg-blush/60 px-4">
          <input type="checkbox" className="h-5 w-5 accent-[#9c3d5d]" checked={values.active} onChange={set('active')} />
          <span className="text-sm font-semibold">Active</span>
          <span className="text-xs text-muted">Pause to stop posting charges</span>
        </label>
        <Field label="Notes" optional className="sm:col-span-2">
          {(p) => <textarea {...p} rows={2} className="input resize-y" value={values.notes} onChange={set('notes')} />}
        </Field>
      </form>
    </Modal>
  );
}

export default function RecurringPanel({ recurring, categories, onChanged }) {
  const notify = useToast();
  const [editing, setEditing] = useState(null); // null | 'new' | item
  const [posting, setPosting] = useState(false);
  const today = todayISO();
  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const dueCount = recurring.reduce((n, r) => n + dueDates(r, today).length, 0);
  const monthlyTotal = recurring
    .filter((r) => r.active && recurringStatus(r, today) !== 'ended')
    .reduce((s, r) => s + Number(r.amount) * { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }[r.frequency], 0);

  async function postDue() {
    setPosting(true);
    try {
      const n = await api.postDueRecurring(today);
      notify(n ? `Recorded ${n} ${n === 1 ? 'charge' : 'charges'} as expenses` : 'Nothing was due');
      onChanged();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-3xl bg-gradient-to-r from-blush to-petal/60 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-rose-ink">About {formatMoney(monthlyTotal.toFixed(2))} a month in active recurring charges</p>
          <p className="mt-0.5 text-sm text-muted">
            {dueCount
              ? `${dueCount} ${dueCount === 1 ? 'charge is' : 'charges are'} due. Recording them adds each one to your expenses on its due date.`
              : 'Everything due so far has been recorded.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {dueCount > 0 && (
            <button type="button" className="btn-primary" onClick={postDue} disabled={posting}>
              <AdminIcon name="check" className="h-4 w-4" strokeWidth={2.4} />
              {posting ? 'Recording…' : `Record ${dueCount} due`}
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={() => setEditing('new')}>
            <AdminIcon name="plus" className="h-4 w-4" />
            Add recurring
          </button>
        </div>
      </div>

      {recurring.length === 0 ? (
        <div className="card">
          <EmptyState icon="repeat" title="No recurring charges" action={<button type="button" className="btn-soft" onClick={() => setEditing('new')}>Add one</button>}>
            Add bills that repeat, like insurance, your phone plan or software, and record them in one click when they’re due.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {recurring.map((r, i) => {
            const status = recurringStatus(r, today);
            return (
              <li key={r.id} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
                <button
                  type="button"
                  onClick={() => setEditing(r)}
                  className="card group flex h-full w-full flex-col p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <span className="flex w-full items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-display text-lg font-semibold">{r.description}</span>
                      <span className="block truncate text-sm text-muted">{[r.vendor, categoryName.get(r.category_id)].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-display text-xl font-semibold tabular">{formatMoney(r.amount)}</span>
                      <span className="block text-xs text-muted">{frequencyLabel(r.frequency)}</span>
                    </span>
                  </span>
                  <span className="mt-4 flex w-full flex-wrap items-center gap-2 text-xs">
                    <span className={`pill ${STATUS[status].className}`}>{STATUS[status].label}</span>
                    {r.is_demo && <DemoPill />}
                    <span className="ml-auto flex items-center gap-1 text-muted">
                      <AdminIcon name="calendar" className="h-3.5 w-3.5" />
                      {status === 'ended' ? `Ended ${formatDate(r.end_date)}` : `Next ${formatDate(r.next_due_date)}`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <RecurringForm
        open={editing !== null}
        item={editing === 'new' ? null : editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChanged();
        }}
      />
    </div>
  );
}
