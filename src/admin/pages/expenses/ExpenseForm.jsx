import { useEffect, useState } from 'react';
import { Field, Modal } from '../../components/ui.jsx';
import { todayISO } from '../../lib/dates.js';
import { parseAmount } from '../../lib/money.js';

export const PAYMENT_METHODS = [
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
];

export const paymentLabel = (v) => PAYMENT_METHODS.find((m) => m.value === v)?.label ?? '';

const blank = () => ({ expense_date: todayISO(), amount: '', description: '', vendor: '', category_id: '', payment_method: 'card', notes: '' });

export function validateExpense(v) {
  const errors = {};
  if (!v.expense_date) errors.expense_date = 'Choose a date.';
  if (!parseAmount(v.amount)) errors.amount = 'Enter an amount greater than $0, like 45.99.';
  if (!v.description.trim()) errors.description = 'Add a short description.';
  if (!v.category_id) errors.category_id = 'Choose a category.';
  return errors;
}

// Add or edit one expense. `expense` is null for a new one.
export default function ExpenseForm({ open, expense, categories, onClose, onSave, onDelete }) {
  const [values, setValues] = useState(blank);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setValues(expense ? { ...blank(), ...expense, amount: String(expense.amount), vendor: expense.vendor ?? '', notes: expense.notes ?? '', payment_method: expense.payment_method ?? '' } : blank());
    setErrors({});
    setConfirmDelete(false);
    setFormError('');
  }, [open, expense]);

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };

  // Inactive categories stay selectable only for an expense that already uses one.
  const options = categories.filter((c) => c.active || c.id === values.category_id);

  async function submit(e) {
    e.preventDefault();
    const found = validateExpense(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setFormError('');
    try {
      await onSave({
        ...(expense?.id ? { id: expense.id } : {}),
        expense_date: values.expense_date,
        amount: parseAmount(values.amount),
        description: values.description.trim(),
        vendor: values.vendor.trim(),
        category_id: values.category_id,
        payment_method: values.payment_method || null,
        notes: values.notes.trim(),
      });
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
      await onDelete(expense.id);
    } catch (err) {
      setFormError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={expense ? 'Edit expense' : 'Add expense'}
      onClose={onClose}
      footer={
        <>
          {expense && (
            <button type="button" onClick={remove} disabled={busy} className={`${confirmDelete ? 'btn-danger' : 'btn-ghost text-danger'} mr-auto`}>
              {confirmDelete ? 'Yes, delete it' : 'Delete'}
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" form="expense-form" disabled={busy} className="btn-primary">
            {busy ? 'Saving…' : expense ? 'Save changes' : 'Add expense'}
          </button>
        </>
      }
    >
      <form id="expense-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        {formError && (
          <p role="alert" className="rounded-2xl bg-danger/8 px-4 py-3 text-sm font-medium text-danger sm:col-span-2">
            {formError}
          </p>
        )}
        {expense?.recurring_expense_id && (
          <p className="rounded-2xl bg-blush px-4 py-3 text-sm text-rose-ink sm:col-span-2">
            Posted from a recurring charge. Changes here only affect this one expense.
          </p>
        )}
        <Field label="Date" error={errors.expense_date}>
          {(p) => <input {...p} type="date" className="input" value={values.expense_date} onChange={set('expense_date')} />}
        </Field>
        <Field label="Amount" error={errors.amount}>
          {(p) => (
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">$</span>
              <input {...p} inputMode="decimal" placeholder="0.00" className="input pl-8 tabular" value={values.amount} onChange={set('amount')} />
            </div>
          )}
        </Field>
        <Field label="Description" error={errors.description} className="sm:col-span-2">
          {(p) => <input {...p} placeholder="e.g. Disposal fee, Elm St job" className="input" value={values.description} onChange={set('description')} />}
        </Field>
        <Field label="Vendor" optional>
          {(p) => <input {...p} placeholder="Who you paid" className="input" value={values.vendor} onChange={set('vendor')} />}
        </Field>
        <Field label="Category" error={errors.category_id}>
          {(p) => (
            <select {...p} className="input" value={values.category_id} onChange={set('category_id')}>
              <option value="">Choose…</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.active ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Paid with" optional>
          {(p) => (
            <select {...p} className="input" value={values.payment_method} onChange={set('payment_method')}>
              <option value="">Not specified</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Notes" optional className="sm:col-span-2">
          {(p) => <textarea {...p} rows={2} className="input resize-y" value={values.notes} onChange={set('notes')} />}
        </Field>
      </form>
    </Modal>
  );
}
