// Pop-up forms for crew members and their hours. TimeEntryForm is also used on job pages.

import { useEffect, useState } from 'react';
import { Field, Modal, useToast } from '../../components/ui.jsx';
import { api } from '../../lib/api/index.js';
import { formatDate, todayISO } from '../../lib/dates.js';
import { formatCents, formatMoney, parseAmount } from '../../lib/money.js';
import { jobStatus } from '../../lib/jobs.js';

function useForm(open, initial) {
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

function Footer({ onClose, onDelete, confirmDelete, busy, formId, saveLabel }) {
  return (
    <>
      {onDelete && (
        <button type="button" onClick={onDelete} disabled={busy} className={`${confirmDelete ? 'btn-danger' : 'btn-ghost text-danger'} mr-auto`}>
          {confirmDelete ? 'Yes, delete it' : 'Delete'}
        </button>
      )}
      <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
      <button type="submit" form={formId} disabled={busy} className="btn-primary">{busy ? 'Saving…' : saveLabel}</button>
    </>
  );
}

const ErrorBox = ({ message }) =>
  message ? <p role="alert" className="mb-4 rounded-2xl bg-danger/8 px-4 py-3 text-sm font-medium text-danger">{message}</p> : null;

function RateInput(props) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">$</span>
      <input {...props} inputMode="decimal" placeholder="0.00" className="input pr-14 pl-8 tabular" />
      <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted">/ hr</span>
    </div>
  );
}

// Accepts 0 as well as positive amounts.
const parseRate = (v) => (String(v ?? '').trim().replace(/[$\s]/g, '') === '0' ? '0.00' : parseAmount(v));

// "7.5" or "7:30" -> 7.5. Returns null if invalid.
export function parseHours(input) {
  const s = String(input ?? '').trim();
  let h = null;
  const hm = s.match(/^(\d{1,2}):([0-5]\d)$/);
  if (hm) h = Number(hm[1]) + Number(hm[2]) / 60;
  else if (/^\d{1,2}(\.\d{1,2})?$/.test(s)) h = Number(s);
  if (h === null || h <= 0 || h > 24) return null;
  return Math.round(h * 100) / 100;
}

// ---------------------------------------------------------------------------

const blankEmployee = { full_name: '', phone: '', email: '', hourly_rate: '', hired_on: '', active: true, notes: '' };

export function EmployeeForm({ open, employee, onClose, onSaved }) {
  const notify = useToast();
  const f = useForm(open, employee
    ? Object.fromEntries(Object.entries({ ...blankEmployee, ...employee }).map(([k, v]) => [k, v ?? (k === 'active' ? true : '')]))
    : blankEmployee);

  async function submit(e) {
    e.preventDefault();
    const found = {};
    if (!f.values.full_name.trim()) found.full_name = 'Add their name.';
    if (String(f.values.hourly_rate).trim() && parseRate(f.values.hourly_rate) === null) found.hourly_rate = 'Enter a rate like 18 or 18.50, or leave it empty.';
    f.setErrors(found);
    if (Object.keys(found).length) return;
    f.setBusy(true);
    try {
      await api.saveEmployee({
        ...(employee ? { id: employee.id } : {}),
        full_name: f.values.full_name.trim(), phone: f.values.phone.trim(), email: f.values.email.trim(),
        hourly_rate: String(f.values.hourly_rate).trim() ? parseRate(f.values.hourly_rate) : null,
        hired_on: f.values.hired_on || null, active: f.values.active, notes: f.values.notes.trim(),
      });
      notify(employee ? 'Crew member updated' : 'Crew member added');
      onSaved();
    } catch (err) {
      f.setError(err.message);
    } finally {
      f.setBusy(false);
    }
  }

  async function remove() {
    f.setBusy(true);
    try {
      if (await api.employeeHasHours(employee.id)) {
        f.setError('They have hours logged, so they can’t be deleted (your records need them). Untick Active instead to hide them.');
        return;
      }
      if (!f.confirmDelete) {
        f.setConfirmDelete(true);
        return;
      }
      await api.deleteEmployee(employee.id);
      notify('Crew member deleted');
      onSaved();
    } catch (err) {
      f.setError(err.message);
    } finally {
      f.setBusy(false);
    }
  }

  return (
    <Modal open={open} title={employee ? 'Edit crew member' : 'Add a crew member'} onClose={onClose}
      footer={<Footer onClose={onClose} onDelete={employee ? remove : null} confirmDelete={f.confirmDelete} busy={f.busy} formId="employee-form" saveLabel={employee ? 'Save changes' : 'Add crew member'} />}>
      <ErrorBox message={f.error} />
      <form id="employee-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={f.errors.full_name} className="sm:col-span-2">
          {(p) => <input {...p} className="input" value={f.values.full_name} onChange={f.set('full_name')} />}
        </Field>
        <Field label="Hourly rate" optional error={f.errors.hourly_rate} hint="Used to estimate wages. Changing it doesn’t change hours already logged.">
          {(p) => <RateInput {...p} value={f.values.hourly_rate} onChange={f.set('hourly_rate')} />}
        </Field>
        <Field label="Start date" optional>
          {(p) => <input {...p} type="date" className="input" value={f.values.hired_on} onChange={f.set('hired_on')} />}
        </Field>
        <Field label="Phone" optional>
          {(p) => <input {...p} type="tel" className="input" value={f.values.phone} onChange={f.set('phone')} />}
        </Field>
        <Field label="Email" optional>
          {(p) => <input {...p} type="email" className="input" value={f.values.email} onChange={f.set('email')} />}
        </Field>
        <Field label="Notes" optional className="sm:col-span-2">
          {(p) => <textarea {...p} rows={2} className="input resize-y" placeholder="e.g. Has a CDL. Available weekends." value={f.values.notes} onChange={f.set('notes')} />}
        </Field>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl bg-blush/60 px-4 sm:col-span-2">
          <input type="checkbox" className="h-5 w-5 accent-[#9c3d5d]" checked={f.values.active} onChange={f.set('active')} />
          <span className="text-sm font-semibold">Active</span>
          <span className="text-xs text-muted">Untick when someone stops working with you. Their past hours are kept.</span>
        </label>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

export function TimeEntryForm({ open, entry, employees, jobs, defaultJobId, defaultDate, onClose, onSaved }) {
  const notify = useToast();
  const activeEmployees = employees.filter((e) => e.active || e.id === entry?.employee_id);
  const rateOf = (id) => employees.find((e) => e.id === id)?.hourly_rate ?? '';
  const firstId = activeEmployees.length === 1 ? activeEmployees[0].id : '';
  const f = useForm(open, entry
    ? { employee_id: entry.employee_id, work_date: entry.work_date, hours: String(Number(entry.hours)), job_id: entry.job_id ?? '',
        hourly_rate: entry.hourly_rate ?? '', status: entry.status, notes: entry.notes ?? '' }
    : { employee_id: firstId, work_date: defaultDate || todayISO(), hours: '', job_id: defaultJobId ?? '', hourly_rate: rateOf(firstId), status: 'approved', notes: '' });

  // Jobs to pick from: not cancelled, plus whatever this entry is already on.
  const jobOptions = jobs.filter((j) => j.status !== 'cancelled' || j.id === f.values.job_id);
  const hours = parseHours(f.values.hours);
  const rate = parseRate(f.values.hourly_rate);
  const estimate = hours && rate !== null ? Math.round(hours * Number(rate) * 100) : null;
  const usualRate = rateOf(f.values.employee_id);

  async function submit(e) {
    e.preventDefault();
    const found = {};
    if (!f.values.employee_id) found.employee_id = 'Choose who worked.';
    if (!f.values.work_date) found.work_date = 'Choose the day.';
    if (!hours) found.hours = 'Enter hours between 0 and 24, like 6.5 or 6:30.';
    if (String(f.values.hourly_rate).trim() && rate === null) found.hourly_rate = 'Enter a rate, or leave it empty to use their usual rate.';
    f.setErrors(found);
    if (Object.keys(found).length) return;
    f.setBusy(true);
    try {
      await api.saveTimeEntry({
        ...(entry ? { id: entry.id } : {}),
        employee_id: f.values.employee_id, work_date: f.values.work_date, hours: hours.toFixed(2), job_id: f.values.job_id || null,
        hourly_rate: String(f.values.hourly_rate).trim() ? rate : null, status: f.values.status, notes: f.values.notes.trim(),
      });
      notify(entry ? 'Hours updated' : 'Hours logged');
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
      await api.deleteTimeEntry(entry.id);
      notify('Hours deleted');
      onSaved();
    } catch (err) {
      f.setError(err.message);
      f.setBusy(false);
    }
  }

  return (
    <Modal open={open} title={entry ? 'Edit hours' : 'Log hours'} onClose={onClose}
      footer={<Footer onClose={onClose} onDelete={entry ? remove : null} confirmDelete={f.confirmDelete} busy={f.busy} formId="time-form" saveLabel={entry ? 'Save changes' : 'Log hours'} />}>
      <ErrorBox message={f.error} />
      {activeEmployees.length === 0 ? (
        <p className="rounded-2xl bg-blush px-4 py-3 text-sm text-rose-ink">
          Add a crew member first (Employees → Team → Add a crew member), then come back to log their hours.
        </p>
      ) : (
        <form id="time-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label="Who worked" error={f.errors.employee_id}>
            {(p) => (
              <select {...p} className="input" value={f.values.employee_id}
                onChange={(e) => {
                  const id = e.target.value;
                  // A different person means their usual rate.
                  f.setValues((v) => ({ ...v, employee_id: id, hourly_rate: rateOf(id) }));
                  f.setErrors((x) => ({ ...x, employee_id: undefined }));
                }}>
                <option value="">Choose…</option>
                {activeEmployees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
              </select>
            )}
          </Field>
          <Field label="Day" error={f.errors.work_date}>
            {(p) => <input {...p} type="date" className="input" value={f.values.work_date} onChange={f.set('work_date')} />}
          </Field>
          <Field label="Hours" error={f.errors.hours} className="sm:col-span-2">
            {(p) => (
              <div className="flex flex-wrap items-center gap-2">
                <input {...p} inputMode="decimal" placeholder="e.g. 6.5" className="input w-32 tabular" value={f.values.hours} onChange={f.set('hours')} />
                {[4, 6, 8].map((h) => (
                  <button key={h} type="button" onClick={() => { f.setValues((v) => ({ ...v, hours: String(h) })); f.setErrors((x) => ({ ...x, hours: undefined })); }}
                    className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${hours === h ? 'bg-rose-deep text-white' : 'bg-blush text-rose-ink hover:bg-petal'}`}>
                    {h} hrs
                  </button>
                ))}
              </div>
            )}
          </Field>
          <Field label="Job" optional className="sm:col-span-2">
            {(p) => (
              <select {...p} className="input" value={f.values.job_id} onChange={f.set('job_id')}>
                <option value="">Not for a specific job</option>
                {jobOptions.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}{j.scheduled_date ? ` · ${formatDate(j.scheduled_date, { month: 'short', day: 'numeric' })}` : ''} ({jobStatus(j.status).label})
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Hourly rate" optional error={f.errors.hourly_rate}
            hint={usualRate !== '' && usualRate !== null ? `Their usual rate is ${formatMoney(usualRate)}/hr.` : 'No usual rate set for them yet.'}>
            {(p) => <RateInput {...p} value={f.values.hourly_rate} onChange={f.set('hourly_rate')} />}
          </Field>
          <Field label="Status">
            {(p) => (
              <select {...p} className="input" value={f.values.status} onChange={f.set('status')}>
                <option value="approved">Approved</option>
                <option value="submitted">Needs approval</option>
              </select>
            )}
          </Field>
          <Field label="Notes" optional className="sm:col-span-2">
            {(p) => <input {...p} className="input" placeholder="e.g. Two trips to the transfer station" value={f.values.notes} onChange={f.set('notes')} />}
          </Field>
          <p className="rounded-2xl bg-blush/60 px-4 py-3 text-sm sm:col-span-2" aria-live="polite">
            Estimated wages: <strong className="font-display text-lg text-rose-ink tabular">{estimate === null ? '—' : formatCents(estimate)}</strong>
            <span className="block text-xs text-muted">Hours × rate, before taxes. This isn’t payroll.</span>
          </p>
        </form>
      )}
    </Modal>
  );
}
