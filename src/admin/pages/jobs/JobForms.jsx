// Small pop-up forms used on a job: payments received, job costs, and customers.

import { useEffect, useState } from 'react';
import { Field, Modal, useToast } from '../../components/ui.jsx';
import { api } from '../../lib/api/index.js';
import { todayISO } from '../../lib/dates.js';
import { parseAmount } from '../../lib/money.js';
import { CUSTOMER_TYPES, PAYMENT_KINDS } from '../../lib/jobs.js';
import { PAYMENT_METHODS } from '../expenses/ExpenseForm.jsx';

function FormShell({ open, title, onClose, formId, busy, saveLabel, onDelete, confirmDelete, error, children }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button type="button" onClick={onDelete} disabled={busy} className={`${confirmDelete ? 'btn-danger' : 'btn-ghost text-danger'} mr-auto`}>
              {confirmDelete ? 'Yes, delete it' : 'Delete'}
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" form={formId} disabled={busy} className="btn-primary">{busy ? 'Saving…' : saveLabel}</button>
        </>
      }
    >
      {error && <p role="alert" className="mb-4 rounded-2xl bg-danger/8 px-4 py-3 text-sm font-medium text-danger">{error}</p>}
      {children}
    </Modal>
  );
}

function useFormState(open, initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setValues(initial);
    setErrors({});
    setConfirmDelete(false);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };
  return { values, setValues, errors, setErrors, busy, setBusy, confirmDelete, setConfirmDelete, error, setError, set };
}

function MoneyInput(props) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">$</span>
      <input {...props} inputMode="decimal" placeholder="0.00" className="input pl-8 tabular" />
    </div>
  );
}

// ---------------------------------------------------------------------------

export function PaymentForm({ open, jobId, payment, onClose, onSaved }) {
  const notify = useToast();
  const f = useFormState(open, payment
    ? { ...payment, amount: String(payment.amount), method: payment.method ?? '', notes: payment.notes ?? '' }
    : { received_on: todayISO(), kind: 'deposit', amount: '', method: 'card', notes: '' });

  async function submit(e) {
    e.preventDefault();
    const found = {};
    if (!f.values.received_on) found.received_on = 'Choose the date you received it.';
    if (!parseAmount(f.values.amount)) found.amount = 'Enter an amount greater than $0.';
    f.setErrors(found);
    if (Object.keys(found).length) return;
    f.setBusy(true);
    try {
      await api.savePayment({
        ...(payment ? { id: payment.id } : { job_id: jobId }),
        received_on: f.values.received_on, kind: f.values.kind, amount: parseAmount(f.values.amount),
        method: f.values.method || null, notes: f.values.notes.trim(),
      });
      notify(payment ? 'Payment updated' : 'Payment recorded');
      onSaved();
    } catch (err) {
      f.setError(err.message);
    } finally {
      f.setBusy(false);
    }
  }

  async function remove() {
    if (!f.confirmDelete) return f.setConfirmDelete(true);
    f.setBusy(true);
    try {
      await api.deletePayment(payment.id);
      notify('Payment deleted');
      onSaved();
    } catch (err) {
      f.setError(err.message);
      f.setBusy(false);
    }
  }

  return (
    <FormShell open={open} title={payment ? 'Edit payment' : 'Record a payment'} onClose={onClose} formId="payment-form" busy={f.busy}
      saveLabel={payment ? 'Save changes' : 'Record payment'} onDelete={payment ? remove : null} confirmDelete={f.confirmDelete} error={f.error}>
      <form id="payment-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="Type">
          {(p) => (
            <select {...p} className="input" value={f.values.kind} onChange={f.set('kind')}>
              {PAYMENT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          )}
        </Field>
        <Field label="Amount" error={f.errors.amount} hint={f.values.kind === 'refund' ? 'Money you gave back. It’s subtracted from revenue.' : undefined}>
          {(p) => <MoneyInput {...p} value={f.values.amount} onChange={f.set('amount')} />}
        </Field>
        <Field label="Date received" error={f.errors.received_on}>
          {(p) => <input {...p} type="date" className="input" value={f.values.received_on} onChange={f.set('received_on')} />}
        </Field>
        <Field label="Paid with" optional>
          {(p) => (
            <select {...p} className="input" value={f.values.method} onChange={f.set('method')}>
              <option value="">Not specified</option>
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          )}
        </Field>
        <Field label="Notes" optional className="sm:col-span-2">
          {(p) => <input {...p} className="input" placeholder="e.g. Check #1042" value={f.values.notes} onChange={f.set('notes')} />}
        </Field>
      </form>
    </FormShell>
  );
}

// ---------------------------------------------------------------------------

export function JobCostForm({ open, jobId, defaultDate, expense, categories, onClose, onSaved }) {
  const notify = useToast();
  const dumpId = categories.find((c) => c.name === 'Dump & disposal fees')?.id ?? '';
  const f = useFormState(open, expense
    ? { ...expense, amount: String(expense.amount), vendor: expense.vendor ?? '', payment_method: expense.payment_method ?? '', notes: expense.notes ?? '' }
    : { expense_date: defaultDate || todayISO(), category_id: dumpId, description: '', vendor: '', amount: '', payment_method: 'card', notes: '' });
  const options = categories.filter((c) => c.active || c.id === f.values.category_id);

  async function submit(e) {
    e.preventDefault();
    const found = {};
    if (!f.values.expense_date) found.expense_date = 'Choose a date.';
    if (!f.values.category_id) found.category_id = 'Choose what this was for.';
    if (!parseAmount(f.values.amount)) found.amount = 'Enter an amount greater than $0.';
    f.setErrors(found);
    if (Object.keys(found).length) return;
    f.setBusy(true);
    const category = categories.find((c) => c.id === f.values.category_id);
    try {
      await api.saveExpense({
        ...(expense ? { id: expense.id } : { job_id: jobId }),
        expense_date: f.values.expense_date, category_id: f.values.category_id,
        description: f.values.description.trim() || category?.name || 'Job cost',
        vendor: f.values.vendor.trim(), amount: parseAmount(f.values.amount),
        payment_method: f.values.payment_method || null, notes: f.values.notes.trim(),
      });
      notify(expense ? 'Cost updated' : 'Cost added');
      onSaved();
    } catch (err) {
      f.setError(err.message);
    } finally {
      f.setBusy(false);
    }
  }

  async function remove() {
    if (!f.confirmDelete) return f.setConfirmDelete(true);
    f.setBusy(true);
    try {
      await api.deleteExpense(expense.id);
      notify('Cost deleted');
      onSaved();
    } catch (err) {
      f.setError(err.message);
      f.setBusy(false);
    }
  }

  return (
    <FormShell open={open} title={expense ? 'Edit job cost' : 'Add a job cost'} onClose={onClose} formId="cost-form" busy={f.busy}
      saveLabel={expense ? 'Save changes' : 'Add cost'} onDelete={expense ? remove : null} confirmDelete={f.confirmDelete} error={f.error}>
      <p className="mb-4 text-sm text-muted">Job costs are also saved to your Expenses, so they’re in your bookkeeping export.</p>
      <form id="cost-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="What was it for?" error={f.errors.category_id}>
          {(p) => (
            <select {...p} className="input" value={f.values.category_id} onChange={f.set('category_id')}>
              <option value="">Choose…</option>
              {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Amount" error={f.errors.amount}>
          {(p) => <MoneyInput {...p} value={f.values.amount} onChange={f.set('amount')} />}
        </Field>
        <Field label="Date" error={f.errors.expense_date}>
          {(p) => <input {...p} type="date" className="input" value={f.values.expense_date} onChange={f.set('expense_date')} />}
        </Field>
        <Field label="Paid to" optional>
          {(p) => <input {...p} className="input" placeholder="e.g. the landfill or rental company" value={f.values.vendor} onChange={f.set('vendor')} />}
        </Field>
        <Field label="Description" optional className="sm:col-span-2">
          {(p) => <input {...p} className="input" placeholder="e.g. 2 tons at the transfer station" value={f.values.description} onChange={f.set('description')} />}
        </Field>
        <Field label="Paid with" optional>
          {(p) => (
            <select {...p} className="input" value={f.values.payment_method} onChange={f.set('payment_method')}>
              <option value="">Not specified</option>
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          )}
        </Field>
      </form>
    </FormShell>
  );
}

// ---------------------------------------------------------------------------

export const blankCustomer = { full_name: '', company: '', customer_type: '', phone: '', email: '', notes: '' };

export function CustomerFields({ values, set, errors }) {
  return (
    <>
      <Field label="Name" error={errors.full_name}>
        {(p) => <input {...p} className="input" value={values.full_name} onChange={set('full_name')} />}
      </Field>
      <Field label="Company" optional>
        {(p) => <input {...p} className="input" placeholder="e.g. their brokerage" value={values.company} onChange={set('company')} />}
      </Field>
      <Field label="Phone" optional>
        {(p) => <input {...p} type="tel" className="input" value={values.phone} onChange={set('phone')} />}
      </Field>
      <Field label="Email" optional>
        {(p) => <input {...p} type="email" className="input" value={values.email} onChange={set('email')} />}
      </Field>
      <Field label="Type of customer" optional>
        {(p) => (
          <select {...p} className="input" value={values.customer_type} onChange={set('customer_type')}>
            <option value="">Not specified</option>
            {CUSTOMER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        )}
      </Field>
    </>
  );
}

export const customerPayload = (v) => ({
  full_name: v.full_name.trim(), company: v.company.trim(), customer_type: v.customer_type || null,
  phone: v.phone.trim(), email: v.email.trim(), notes: (v.notes ?? '').trim(),
});

export function CustomerForm({ open, customer, jobCount = 0, onClose, onSaved }) {
  const notify = useToast();
  const f = useFormState(open, customer
    ? Object.fromEntries(Object.entries({ ...blankCustomer, ...customer }).map(([k, v]) => [k, v ?? '']))
    : blankCustomer);

  async function submit(e) {
    e.preventDefault();
    if (!f.values.full_name.trim()) {
      f.setErrors({ full_name: 'Add their name.' });
      return;
    }
    f.setBusy(true);
    try {
      await api.saveCustomer({ ...(customer ? { id: customer.id } : {}), ...customerPayload(f.values) });
      notify(customer ? 'Customer updated' : 'Customer added');
      onSaved();
    } catch (err) {
      f.setError(err.message);
    } finally {
      f.setBusy(false);
    }
  }

  async function remove() {
    if (jobCount > 0) {
      f.setError(`This customer has ${jobCount} ${jobCount === 1 ? 'job' : 'jobs'}, so they can’t be deleted. Their history stays with the jobs.`);
      return;
    }
    if (!f.confirmDelete) return f.setConfirmDelete(true);
    f.setBusy(true);
    try {
      await api.deleteCustomer(customer.id);
      notify('Customer deleted');
      onSaved();
    } catch (err) {
      f.setError(err.message);
      f.setBusy(false);
    }
  }

  return (
    <FormShell open={open} title={customer ? 'Edit customer' : 'Add a customer'} onClose={onClose} formId="customer-form" busy={f.busy}
      saveLabel={customer ? 'Save changes' : 'Add customer'} onDelete={customer ? remove : null} confirmDelete={f.confirmDelete} error={f.error}>
      <form id="customer-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <CustomerFields values={f.values} set={f.set} errors={f.errors} />
        <Field label="Notes" optional className="sm:col-span-2">
          {(p) => <textarea {...p} rows={2} className="input resize-y" placeholder="e.g. Prefers texts. Has a lockbox at most listings." value={f.values.notes} onChange={f.set('notes')} />}
        </Field>
      </form>
    </FormShell>
  );
}
