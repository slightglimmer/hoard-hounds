import { useEffect, useMemo, useState } from 'react';
import AdminIcon from '../../components/AdminIcon.jsx';
import { DemoPill, ErrorNote, Field, Spinner, useToast } from '../../components/ui.jsx';
import { SERVICES } from '../../../config/site.js';
import { api } from '../../lib/api/index.js';
import { formatDate, todayISO } from '../../lib/dates.js';
import { formatCents, formatMoney, parseAmount } from '../../lib/money.js';
import { JOB_STATUSES, PAYMENT_KINDS, jobMoney, jobStatus } from '../../lib/jobs.js';
import { CustomerFields, JobCostForm, PaymentForm, blankCustomer, customerPayload } from './JobForms.jsx';
import { TimeEntryForm } from '../employees/EmployeeForms.jsx';
import OnlinePayments from './OnlinePayments.jsx';
import { TIME_STATUSES, wageCents } from '../../lib/employees.js';

const NEW_CUSTOMER = '__new__';

const blankJob = () => ({
  title: '', customer_id: '', property_address: '', service_type: '', status: 'lead',
  scheduled_date: '', completed_date: '', crew_notes: '', quoted_amount: '', agreed_price: '', admin_notes: '',
});

// Optional money box: '' is allowed, otherwise must be a valid amount ($0 allowed).
const optionalMoney = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return { ok: true, value: null };
  if (s.replace(/[$\s]/g, '') === '0') return { ok: true, value: '0.00' };
  const parsed = parseAmount(s);
  return parsed ? { ok: true, value: parsed } : { ok: false };
};

function MoneyRow({ label, cents, strong, tone = '', hint }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? 'font-semibold' : 'text-muted'}>
        {label}
        {hint && <span className="block text-xs font-normal text-muted">{hint}</span>}
      </dt>
      <dd className={`tabular ${strong ? 'font-display text-2xl font-semibold' : 'font-semibold'} ${tone}`}>{cents === null ? '—' : formatCents(cents)}</dd>
    </div>
  );
}

export default function JobDetail({ id }) {
  const notify = useToast();
  const isNew = id === 'new';
  const [data, setData] = useState(null); // { job, financials, payments, expenses, timeEntries, estimates }
  const [customers, setCustomers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [jobsBrief, setJobsBrief] = useState([]);
  const [values, setValues] = useState(blankJob);
  const [newCustomer, setNewCustomer] = useState(blankCustomer);
  const [errors, setErrors] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [paymentForm, setPaymentForm] = useState(null); // null | 'new' | payment
  const [costForm, setCostForm] = useState(null); // null | 'new' | expense
  const [hoursForm, setHoursForm] = useState(null); // null | 'new' | time entry
  const [crewBusy, setCrewBusy] = useState(false);

  // keepEdits: refresh payments and costs without overwriting unsaved job details.
  async function load({ keepEdits = false } = {}) {
    try {
      const [custs, cats, jobData, emps, jobList] = await Promise.all([
        api.listCustomers(), api.listCategories(), isNew ? null : api.getJob(id), api.listEmployees(), api.listJobsBrief(),
      ]);
      setEmployees(emps);
      setJobsBrief(jobList);
      setCustomers(custs);
      setCategories(cats);
      if (jobData) {
        setData(jobData);
        if (keepEdits) return;
        const j = jobData.job;
        const fin = jobData.financials ?? {};
        setValues({
          title: j.title, customer_id: j.customer_id ?? '', property_address: j.property_address ?? '', service_type: j.service_type ?? '',
          status: j.status, scheduled_date: j.scheduled_date ?? '', completed_date: j.completed_date ?? '', crew_notes: j.crew_notes ?? '',
          quoted_amount: fin.quoted_amount ?? '', agreed_price: fin.agreed_price ?? '', admin_notes: fin.admin_notes ?? '',
        });
        setDirty(false);
      } else {
        setData({ job: null, financials: null, payments: [], expenses: [], timeEntries: [], estimates: [] });
      }
    } catch (err) {
      setLoadError(err);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = (key) => (e) => {
    const value = e.target.value;
    setValues((v) => {
      const next = { ...v, [key]: value };
      // Marking a job completed fills in today's date if none is set.
      if (key === 'status' && value === 'completed' && !v.completed_date) next.completed_date = todayISO();
      return next;
    });
    setDirty(true);
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };
  const setCust = (key) => (e) => {
    setNewCustomer((c) => ({ ...c, [key]: e.target.value }));
    setDirty(true);
    if (errors.full_name) setErrors((x) => ({ ...x, full_name: undefined }));
  };

  const money = useMemo(
    () =>
      data &&
      jobMoney({
        financials: { agreed_price: values.agreed_price, quoted_amount: values.quoted_amount },
        payments: data.payments, expenses: data.expenses, timeEntries: data.timeEntries,
      }),
    [data, values.agreed_price, values.quoted_amount],
  );
  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  async function save() {
    const found = {};
    if (!values.title.trim()) found.title = 'Give the job a short name, like “Elm St estate cleanout”.';
    if (values.customer_id === NEW_CUSTOMER && !newCustomer.full_name.trim()) found.full_name = 'Add the new customer’s name.';
    const quoted = optionalMoney(values.quoted_amount);
    const agreed = optionalMoney(values.agreed_price);
    if (!quoted.ok) found.quoted_amount = 'Enter an amount, or leave it empty.';
    if (!agreed.ok) found.agreed_price = 'Enter an amount, or leave it empty.';
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      let customerId = values.customer_id || null;
      if (customerId === NEW_CUSTOMER) {
        const created = await api.saveCustomer(customerPayload(newCustomer));
        customerId = created.id;
      }
      const job = await api.saveJob({
        ...(data?.job ? { id: data.job.id } : {}),
        title: values.title.trim(), customer_id: customerId, property_address: values.property_address.trim(),
        service_type: values.service_type || null, status: values.status,
        scheduled_date: values.scheduled_date || null, completed_date: values.completed_date || null, crew_notes: values.crew_notes.trim(),
      });
      await api.saveJobFinancials({ job_id: job.id, quoted_amount: quoted.value, agreed_price: agreed.value, admin_notes: values.admin_notes.trim() });
      setDirty(false);
      setNewCustomer(blankCustomer);
      notify(isNew ? 'Job created' : 'Job saved');
      if (isNew) window.location.replace(`#/jobs/${job.id}`);
      else load();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (data.payments.length) {
      notify('This job has payments recorded. Mark it Cancelled instead, or delete its payments first.', 'error');
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await api.deleteJob(data.job.id);
      setDirty(false);
      notify('Job deleted');
      window.location.hash = '#/jobs';
    } catch (err) {
      notify(err.message, 'error');
      setBusy(false);
    }
  }

  if (loadError) return <ErrorNote error={loadError} onRetry={() => { setLoadError(null); load(); }} />;
  if (!data) return <div className="card flex h-48 items-center justify-center"><Spinner /></div>;

  const job = data.job;
  const status = jobStatus(values.status);
  const serviceOptions = SERVICES.map((s) => s.title);
  const reload = () => {
    setPaymentForm(null);
    setCostForm(null);
    setHoursForm(null);
    load({ keepEdits: true });
  };
  const employeeName = new Map(employees.map((e) => [e.id, e.full_name]));
  const assignedIds = (data.assignments ?? []).map((a) => a.employee_id);
  const unassigned = employees.filter((e) => e.active && !assignedIds.includes(e.id));

  async function changeCrew(employeeId, add) {
    setCrewBusy(true);
    try {
      if (add) await api.assignEmployee(job.id, employeeId);
      else await api.unassignEmployee(job.id, employeeId);
      load({ keepEdits: true });
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setCrewBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <a href="#/jobs" className="btn-ghost min-h-10">
          <AdminIcon name="arrowRight" className="h-4 w-4 rotate-180" />
          All jobs
        </a>
        <h2 className="min-w-0 font-display text-2xl font-semibold">{job ? job.title : 'New job'}</h2>
        {job && <span className={`pill ${jobStatus(job.status).className}`}>{jobStatus(job.status).label}</span>}
        {job?.is_demo && <DemoPill />}
        {dirty && <span className="pill bg-gold/20 text-gold-deep">Unsaved changes</span>}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-5">
          {/* Details */}
          <section className="card animate-rise p-5 sm:p-6" aria-labelledby="job-details">
            <h3 id="job-details" className="font-display text-xl font-semibold">Job details</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Job name" error={errors.title} className="sm:col-span-2">
                {(p) => <input {...p} className="input" placeholder="e.g. Elm St estate cleanout" value={values.title} onChange={set('title')} />}
              </Field>
              <Field label="Customer" optional>
                {(p) => (
                  <select {...p} className="input" value={values.customer_id} onChange={set('customer_id')}>
                    <option value="">No customer yet</option>
                    <option value={NEW_CUSTOMER}>＋ New customer…</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.company ? ` (${c.company})` : ''}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Status">
                {(p) => (
                  <select {...p} className="input" value={values.status} onChange={set('status')}>
                    {JOB_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                )}
              </Field>
              {values.customer_id === NEW_CUSTOMER && (
                <div className="grid gap-4 rounded-3xl bg-blush/50 p-4 sm:col-span-2 sm:grid-cols-2">
                  <p className="text-sm font-semibold text-rose-ink sm:col-span-2">New customer (saved with the job)</p>
                  <CustomerFields values={newCustomer} set={setCust} errors={errors} />
                </div>
              )}
              <Field label="Property address" optional className="sm:col-span-2">
                {(p) => <input {...p} className="input" value={values.property_address} onChange={set('property_address')} />}
              </Field>
              <Field label="Type of cleanout" optional>
                {(p) => (
                  <select {...p} className="input" value={values.service_type} onChange={set('service_type')}>
                    <option value="">Not specified</option>
                    {serviceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                    {values.service_type && !serviceOptions.includes(values.service_type) && <option value={values.service_type}>{values.service_type}</option>}
                  </select>
                )}
              </Field>
              <Field label="Scheduled for" optional>
                {(p) => <input {...p} type="date" className="input" value={values.scheduled_date} onChange={set('scheduled_date')} />}
              </Field>
              {(values.status === 'completed' || values.completed_date) && (
                <Field label="Completed on" optional>
                  {(p) => <input {...p} type="date" className="input" value={values.completed_date} onChange={set('completed_date')} />}
                </Field>
              )}
              <Field label="Notes for the crew" optional className="sm:col-span-2" hint="Access, parking, what stays, what goes. Your crew will see this in their portal later.">
                {(p) => <textarea {...p} rows={2} className="input resize-y" value={values.crew_notes} onChange={set('crew_notes')} />}
              </Field>
            </div>
          </section>

          {/* Price */}
          <section className="card animate-rise p-5 sm:p-6" style={{ animationDelay: '60ms' }} aria-labelledby="job-price">
            <h3 id="job-price" className="font-display text-xl font-semibold">Price</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Quoted" optional error={errors.quoted_amount} hint="What you estimated.">
                {(p) => (
                  <div className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">$</span>
                    <input {...p} inputMode="decimal" className="input pl-8 tabular" value={values.quoted_amount} onChange={set('quoted_amount')} />
                  </div>
                )}
              </Field>
              <Field label="Agreed price" optional error={errors.agreed_price} hint="What the customer agreed to pay.">
                {(p) => (
                  <div className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">$</span>
                    <input {...p} inputMode="decimal" className="input pl-8 tabular" value={values.agreed_price} onChange={set('agreed_price')} />
                  </div>
                )}
              </Field>
              <Field label="Private notes" optional className="sm:col-span-2" hint="Only admins see these.">
                {(p) => <textarea {...p} rows={2} className="input resize-y" value={values.admin_notes} onChange={set('admin_notes')} />}
              </Field>
            </div>
            {data.estimates.length > 0 && (
              <p className="mt-4 text-sm text-muted">
                From estimate{' '}
                {data.estimates.map((e, i) => (
                  <span key={e.id}>
                    {i > 0 && ', '}
                    <a href={`#/price-sheet/estimates/${e.id}`} className="font-semibold text-rose-deep underline underline-offset-2">#{e.number} ({formatMoney(e.total)})</a>
                  </span>
                ))}
              </p>
            )}
          </section>

          {job ? (
            <>
              {/* Payments */}
              <section className="card animate-rise p-5 sm:p-6" style={{ animationDelay: '120ms' }} aria-labelledby="job-payments">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 id="job-payments" className="font-display text-xl font-semibold">Payments received</h3>
                  <button type="button" className="btn-soft min-h-10" onClick={() => setPaymentForm('new')}>
                    <AdminIcon name="plus" className="h-4 w-4" />
                    Record a payment
                  </button>
                </div>
                {data.payments.length ? (
                  <ul className="mt-3 divide-y divide-line">
                    {data.payments.map((pmt) => (
                      <li key={pmt.id}>
                        <button type="button" onClick={() => setPaymentForm(pmt)} className="flex w-full items-center gap-3 rounded-xl py-3 text-left hover:bg-blush/40">
                          <span className="w-24 shrink-0 text-sm text-muted tabular">{formatDate(pmt.received_on)}</span>
                          <span className="flex-1 font-semibold">{PAYMENT_KINDS.find((k) => k.value === pmt.kind)?.label}</span>
                          {pmt.is_demo && <DemoPill />}
                          <span className={`font-semibold tabular ${pmt.kind === 'refund' ? 'text-danger' : ''}`}>
                            {pmt.kind === 'refund' ? '−' : ''}{formatMoney(pmt.amount)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted">No payments yet. Record deposits and payments here and they count as revenue on your Overview.</p>
                )}
                <OnlinePayments
                  job={job}
                  customer={customers.find((c) => c.id === job.customer_id) ?? null}
                  balanceCents={money?.balance ?? 0}
                  onPaid={() => load({ keepEdits: true })}
                />
              </section>

              {/* Costs */}
              <section className="card animate-rise p-5 sm:p-6" style={{ animationDelay: '160ms' }} aria-labelledby="job-costs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 id="job-costs" className="font-display text-xl font-semibold">Job costs</h3>
                  <button type="button" className="btn-soft min-h-10" onClick={() => setCostForm('new')}>
                    <AdminIcon name="plus" className="h-4 w-4" />
                    Add a cost
                  </button>
                </div>
                {data.expenses.length ? (
                  <ul className="mt-3 divide-y divide-line">
                    {data.expenses.map((x) => (
                      <li key={x.id}>
                        <button type="button" onClick={() => setCostForm(x)} className="flex w-full items-center gap-3 rounded-xl py-3 text-left hover:bg-blush/40">
                          <span className="w-24 shrink-0 text-sm text-muted tabular">{formatDate(x.expense_date)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{categoryName.get(x.category_id) ?? 'Cost'}</span>
                            <span className="block truncate text-sm text-muted">{[x.vendor, x.description !== categoryName.get(x.category_id) && x.description].filter(Boolean).join(' · ')}</span>
                          </span>
                          {x.is_demo && <DemoPill />}
                          <span className="font-semibold tabular">{formatMoney(x.amount)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted">Add dump fees, truck rental, contract labor and anything else this job cost.</p>
                )}
              </section>

              {/* Crew & hours */}
              <section className="card animate-rise p-5 sm:p-6" style={{ animationDelay: '200ms' }} aria-labelledby="job-labor">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 id="job-labor" className="font-display text-xl font-semibold">Crew &amp; hours</h3>
                  <button type="button" className="btn-soft min-h-10" onClick={() => setHoursForm('new')}>
                    <AdminIcon name="plus" className="h-4 w-4" />
                    Log hours
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Crew on this job">
                  {assignedIds.length === 0 && <span className="text-sm text-muted">No one assigned yet.</span>}
                  {assignedIds.map((eid) => (
                    <span key={eid} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-blush py-1 pr-1 pl-3.5 text-sm font-semibold text-rose-ink">
                      {employeeName.get(eid) ?? 'Crew member'}
                      <button type="button" disabled={crewBusy} onClick={() => changeCrew(eid, false)} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-petal"
                        aria-label={`Take ${employeeName.get(eid) ?? 'this person'} off this job`}>
                        <AdminIcon name="x" className="h-3.5 w-3.5" strokeWidth={2.4} />
                      </button>
                    </span>
                  ))}
                  {unassigned.length > 0 && (
                    <label className="inline-flex">
                      <span className="sr-only">Add someone to this job</span>
                      <select className="min-h-9 rounded-full border border-dashed border-rose/40 bg-white px-3 text-sm font-semibold text-rose-deep" value="" disabled={crewBusy}
                        onChange={(e) => e.target.value && changeCrew(e.target.value, true)}>
                        <option value="">＋ Add to crew…</option>
                        {unassigned.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                      </select>
                    </label>
                  )}
                </div>

                {data.timeEntries.length ? (
                  <ul className="mt-4 divide-y divide-line text-sm">
                    {data.timeEntries.map((t) => (
                      <li key={t.id}>
                        <button type="button" onClick={() => setHoursForm(t)} className="flex w-full items-center gap-3 rounded-xl py-2.5 text-left hover:bg-blush/40">
                          <span className="w-24 shrink-0 text-muted tabular">{formatDate(t.work_date)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{employeeName.get(t.employee_id) ?? 'Crew member'}</span>
                            <span className="block text-muted">{Number(t.hours)} hrs × {formatMoney(t.hourly_rate || 0)}</span>
                          </span>
                          {t.status === 'submitted' && <span className={`pill ${TIME_STATUSES.submitted.className}`}>{TIME_STATUSES.submitted.label}</span>}
                          {t.is_demo && <DemoPill />}
                          <span className="font-semibold tabular">{formatCents(wageCents(t))}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted">
                    Log each person’s hours here to see your labor cost. Paid a helper a flat amount instead? Add it under Job costs as “Contract labor”.
                  </p>
                )}
              </section>
            </>
          ) : (
            <p className="rounded-3xl bg-blush/60 px-5 py-4 text-sm text-rose-ink">
              Save the job first. Then you can record payments and add costs like dump fees and truck rental.
            </p>
          )}
        </div>

        {/* Summary */}
        <aside className="card animate-rise space-y-4 p-5 sm:p-6 lg:sticky lg:top-6" style={{ animationDelay: '90ms' }} aria-label="Job money summary">
          <p className="flex items-center justify-between gap-2">
            <span className="font-display text-xl font-semibold">Job money</span>
            <span className={`pill ${status.className}`}>{status.label}</span>
          </p>
          {money && (
            <dl className="space-y-2.5 text-sm">
              <MoneyRow label="Agreed price" cents={money.agreed} />
              <MoneyRow label="Received" cents={money.received} tone="text-sage-deep" />
              {money.balance !== null && money.balance !== 0 && (
                <MoneyRow label={money.balance > 0 ? 'Still owed' : 'Overpaid'} cents={Math.abs(money.balance)} tone={money.balance > 0 ? 'text-gold-deep' : 'text-danger'} />
              )}
              <div className="border-t border-line pt-2.5" />
              <MoneyRow label="Job costs" cents={money.costs} />
              <MoneyRow label="Labor (est.)" cents={money.labor} />
              <div className="border-t border-line pt-2.5" />
              <MoneyRow label="Profit so far" cents={money.profit} strong tone={money.profit < 0 ? 'text-danger' : 'text-rose-ink'} hint="Received − costs − labor" />
              {money.balance > 0 && money.expected !== null && (
                <MoneyRow label="Once paid in full" cents={money.expected} tone={money.expected < 0 ? 'text-danger' : ''} />
              )}
            </dl>
          )}
          <div className="grid gap-2">
            <button type="button" className="btn-primary w-full" onClick={save} disabled={busy}>
              <AdminIcon name="check" className="h-4 w-4" strokeWidth={2.4} />
              {busy ? 'Saving…' : job ? 'Save changes' : 'Create job'}
            </button>
            {job && (
              <button type="button" onClick={remove} disabled={busy} className={confirmDelete ? 'btn-danger w-full' : 'btn-ghost w-full text-danger'}>
                {confirmDelete ? 'Yes, delete this job' : 'Delete job'}
              </button>
            )}
          </div>
          {confirmDelete && <p className="text-xs text-muted">Its costs stay in your Expenses, just no longer linked to a job.</p>}
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-line bg-cream/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <p className="leading-tight">
          <span className="block text-xs text-muted">Profit so far</span>
          <span className={`font-display text-2xl font-semibold tabular ${money?.profit < 0 ? 'text-danger' : 'text-rose-ink'}`}>{formatCents(money?.profit ?? 0)}</span>
        </p>
        <button type="button" className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : job ? 'Save changes' : 'Create job'}</button>
      </div>
      <div className="h-16 lg:hidden" aria-hidden="true" />

      {job && (
        <>
          <PaymentForm open={paymentForm !== null} jobId={job.id} payment={paymentForm === 'new' ? null : paymentForm} onClose={() => setPaymentForm(null)} onSaved={reload} />
          <JobCostForm
            open={costForm !== null} jobId={job.id} defaultDate={values.completed_date || (values.scheduled_date && values.scheduled_date <= todayISO() ? values.scheduled_date : todayISO())} expense={costForm === 'new' ? null : costForm}
            categories={categories} onClose={() => setCostForm(null)} onSaved={reload}
          />
          <TimeEntryForm
            open={hoursForm !== null} entry={hoursForm === 'new' ? null : hoursForm} employees={employees} jobs={jobsBrief} defaultJobId={job.id}
            defaultDate={values.completed_date || (values.scheduled_date && values.scheduled_date <= todayISO() ? values.scheduled_date : todayISO())}
            onClose={() => setHoursForm(null)} onSaved={reload}
          />
        </>
      )}
    </div>
  );
}
