// Inquiries: quote requests from the website, with the customer's photos.
// From a request you can contact the customer, link or create a customer record,
// and turn it into an estimate or a job without retyping anything.

import { useEffect, useMemo, useState } from 'react';
import AdminIcon from '../../components/AdminIcon.jsx';
import { DemoBanner } from '../../components/AdminLayout.jsx';
import { DemoPill, EmptyState, ErrorNote, Field, Modal, PageHeader, Segmented, Spinner, useToast } from '../../components/ui.jsx';
import { api } from '../../lib/api/index.js';
import { formatDate, parseISODate, toISODate, todayISO } from '../../lib/dates.js';
import { DEFAULT_TERMS, statusInfo } from '../../lib/estimate.js';
import { INQUIRY_STATUSES, inquiryDetails, inquiryStatus, receivedLabel } from '../../lib/inquiries.js';
import { formatMoney } from '../../lib/money.js';
import { useQuery } from '../../lib/useQuery.js';

const plusDays = (iso, n) => {
  const d = parseISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};

function StatusPill({ status }) {
  const s = inquiryStatus(status);
  return <span className={`pill ${s.className}`}>{s.label}</span>;
}

function NotSetUp() {
  return (
    <div className="card p-6 text-sm text-muted">
      <p className="font-semibold text-ink">Website requests aren’t switched on yet.</p>
      <p className="mt-1">
        Until they are, quote requests keep arriving by email. See “Website requests (Inquiries)” in docs/ADMIN_SETUP.md.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function InquiryList() {
  const [status, setStatus] = useState('open');
  const { data, error, loading, reload } = useQuery(() => api.listInquiries(), []);
  const counts = useMemo(() => {
    const c = { all: data?.length ?? 0, open: 0 };
    for (const i of data ?? []) {
      c[i.status] = (c[i.status] ?? 0) + 1;
      if (['new', 'reviewing', 'quoted'].includes(i.status)) c.open += 1;
    }
    return c;
  }, [data]);
  const shown = (data ?? []).filter((i) =>
    status === 'all' ? true : status === 'open' ? ['new', 'reviewing', 'quoted'].includes(i.status) : i.status === status,
  );

  if (data === null) return <NotSetUp />;
  const options = [
    { value: 'open', label: `Open (${counts.open})` },
    ...INQUIRY_STATUSES.map((s) => ({ value: s.value, label: `${s.label}${counts[s.value] ? ` (${counts[s.value]})` : ''}` })),
    { value: 'all', label: 'All' },
  ];

  return (
    <div className="space-y-5">
      <div className="card animate-rise p-4 sm:p-5">
        <Segmented label="Show" options={options} value={status} onChange={setStatus} />
      </div>
      <ErrorNote error={error} onRetry={reload} />
      {data === undefined ? (
        <div className="card flex h-48 items-center justify-center">{loading && <Spinner />}</div>
      ) : shown.length === 0 ? (
        <div className="card">
          <EmptyState icon="inbox" title={data.length ? 'Nothing here' : 'No requests yet'}>
            {data.length
              ? 'No requests have this status.'
              : 'When someone fills in the quote form on hoardhounds.com, their request and photos show up here.'}
          </EmptyState>
        </div>
      ) : (
        <ul className="card animate-rise divide-y divide-line overflow-hidden" style={{ animationDelay: '80ms' }}>
          {shown.map((i) => (
            <li key={i.id}>
              <a href={`#/inquiries/${i.id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-blush/40">
                <span className="hidden w-14 shrink-0 font-display text-lg font-semibold text-muted sm:block">#{i.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`truncate ${i.status === 'new' ? 'font-bold' : 'font-semibold'}`}>{i.full_name}</span>
                    {i.is_demo && <DemoPill />}
                  </span>
                  <span className="block truncate text-sm text-muted">
                    <span className="sm:hidden">#{i.number} · </span>
                    {i.cleanout_type} · {i.property_address}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>{receivedLabel(i.created_at)}</span>
                    {i.photo_count > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <AdminIcon name="image" className="h-3.5 w-3.5" />
                        {i.photo_count} photo{i.photo_count === 1 ? '' : 's'}
                      </span>
                    )}
                    {i.photos_failed > 0 && <span className="text-danger">{i.photos_failed} photo(s) failed</span>}
                    {i.preferred_date && (
                      <span className={i.date_is_deadline ? 'font-semibold text-rose-ink' : ''}>
                        {i.date_is_deadline ? 'Deadline' : 'Hoping for'} {formatDate(i.preferred_date)}
                      </span>
                    )}
                  </span>
                </span>
                <StatusPill status={i.status} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

function Info({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}

function Photos({ photos, failed }) {
  const [open, setOpen] = useState(null);
  if (!photos.length && !failed) return <p className="text-sm text-muted">No photos were sent with this request.</p>;
  return (
    <>
      {failed > 0 && (
        <p className="mb-3 rounded-2xl bg-danger/8 px-4 py-2.5 text-sm text-danger">
          {failed} photo{failed === 1 ? '' : 's'} didn’t upload. The customer was asked to text or email {failed === 1 ? 'it' : 'them'}.
        </p>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p, i) => (
          <li key={p.id}>
            {p.url ? (
              <button type="button" onClick={() => setOpen(p)} className="block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-blush ring-1 ring-line transition hover:ring-rose">
                <img src={p.url} alt={`Customer photo ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
              </button>
            ) : (
              <span className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-blush text-xs text-muted">Photo unavailable</span>
            )}
          </li>
        ))}
      </ul>
      <Modal open={Boolean(open)} title="Customer photo" onClose={() => setOpen(null)} wide
        footer={
          <>
            {open?.url && <a className="btn-ghost" href={open.url} target="_blank" rel="noreferrer">Open full size</a>}
            <button type="button" className="btn-primary" onClick={() => setOpen(null)}>Close</button>
          </>
        }>
        {open && <img src={open.url} alt="Customer photo, full view" className="max-h-[65vh] w-full rounded-2xl bg-blush object-contain" />}
      </Modal>
    </>
  );
}

function InquiryDetail({ id }) {
  const notify = useToast();
  const { data, error, loading, reload } = useQuery(() => api.getInquiry(id), [id]);
  const customers = useQuery(() => api.listCustomers(), []);
  const [notes, setNotes] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pickCustomer, setPickCustomer] = useState(false);
  const [customerChoice, setCustomerChoice] = useState('');

  const inquiry = data?.inquiry;
  useEffect(() => {
    if (inquiry && !notesDirty) setNotes(inquiry.admin_notes ?? '');
  }, [inquiry, notesDirty]);

  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!data) return <div className="card flex h-48 items-center justify-center">{loading && <Spinner />}</div>;

  const linkedCustomer = (customers.data ?? []).find((c) => c.id === inquiry.customer_id);
  const digits = (s) => (s || '').replace(/\D/g, '').slice(-10);
  const matches = (customers.data ?? []).filter(
    (c) => (c.email && c.email.toLowerCase() === inquiry.email.toLowerCase()) || (digits(c.phone) && digits(c.phone) === digits(inquiry.phone)),
  );
  const details = inquiryDetails(inquiry);
  const phone = inquiry.phone.replace(/[^\d+]/g, '');

  async function update(change, message) {
    setBusy(true);
    try {
      await api.saveInquiry({ id: inquiry.id, ...change });
      if (message) notify(message);
      await reload();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveNotes() {
    await update({ admin_notes: notes.trim() }, 'Notes saved');
    setNotesDirty(false);
  }

  async function ensureCustomer() {
    if (inquiry.customer_id) return inquiry.customer_id;
    const customer = await api.saveCustomer({
      full_name: inquiry.full_name, phone: inquiry.phone, email: inquiry.email, company: '', customer_type: null,
      notes: `From website request #${inquiry.number}`,
    });
    await api.saveInquiry({ id: inquiry.id, customer_id: customer.id });
    customers.reload();
    return customer.id;
  }

  async function createCustomer() {
    setBusy(true);
    try {
      await ensureCustomer();
      notify('Customer added');
      await reload();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function createEstimate() {
    setBusy(true);
    try {
      const settings = await api.getQuoteSettings().catch(() => null);
      const today = todayISO();
      const est = await api.saveEstimate({
        customer_name: inquiry.full_name, customer_email: inquiry.email, customer_phone: inquiry.phone, property_address: inquiry.property_address,
        status: 'draft', estimate_date: today, valid_until: plusDays(today, settings?.default_valid_days || 30),
        line_items: [], discount_type: null, discount_value: null, deposit_amount: null, notes: '',
        terms: settings?.default_terms ?? DEFAULT_TERMS, overage_terms: settings?.default_overage_terms ?? null,
        customer_id: inquiry.customer_id, inquiry_id: inquiry.id,
      });
      if (inquiry.status === 'new') await api.saveInquiry({ id: inquiry.id, status: 'reviewing' });
      notify(`Estimate #${est.number} started from this request`);
      window.location.hash = `#/price-sheet/estimates/${est.id}`;
    } catch (err) {
      notify(err.message, 'error');
      setBusy(false);
    }
  }

  async function createJob() {
    setBusy(true);
    try {
      const customerId = await ensureCustomer();
      const crewNotes = [
        inquiry.keep_items && `Keep / set aside: ${inquiry.keep_items}`,
        inquiry.hazards && `Possible hazards: ${inquiry.hazards}`,
        inquiry.restrictions && `Rules / access: ${inquiry.restrictions}`,
      ].filter(Boolean).join('\n');
      const job = await api.saveJob({
        title: `${inquiry.full_name} clean-out`, customer_id: customerId, property_address: inquiry.property_address,
        service_type: inquiry.cleanout_type, status: 'lead', scheduled_date: null, completed_date: null, crew_notes: crewNotes,
      });
      await api.saveInquiry({ id: inquiry.id, job_id: job.id, ...(inquiry.status === 'new' ? { status: 'reviewing' } : {}) });
      notify('Job created from this request');
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
      await api.deleteInquiry(inquiry.id);
      notify(`Request #${inquiry.number} deleted`);
      window.location.hash = '#/inquiries';
    } catch (err) {
      notify(err.message, 'error');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <a href="#/inquiries" className="btn-ghost min-h-10">
          <AdminIcon name="arrowRight" className="h-4 w-4 rotate-180" />
          All requests
        </a>
        <h2 className="font-display text-2xl font-semibold">Request #{inquiry.number}</h2>
        <StatusPill status={inquiry.status} />
        {inquiry.is_demo && <DemoPill />}
        <span className="text-sm text-muted">Received {receivedLabel(inquiry.created_at)}</span>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_21rem]">
        <div className="min-w-0 space-y-5">
          <section className="card animate-rise p-5 sm:p-6" aria-labelledby="who-title">
            <h3 id="who-title" className="font-display text-xl font-semibold">{inquiry.full_name}</h3>
            <p className="mt-1 text-muted">{inquiry.cleanout_type}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a className="btn-soft min-h-10" href={`tel:${phone}`}><AdminIcon name="phone" className="h-4 w-4" />Call {inquiry.phone}</a>
              <a className="btn-ghost min-h-10" href={`sms:${phone}`}>Text</a>
              <a className="btn-ghost min-h-10" href={`mailto:${inquiry.email}?subject=${encodeURIComponent(`Your Hoard Hounds request #${inquiry.number}`)}`}>
                <AdminIcon name="mail" className="h-4 w-4" />Email
              </a>
              <a className="btn-ghost min-h-10" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(inquiry.property_address)}`} target="_blank" rel="noreferrer">
                <AdminIcon name="pin" className="h-4 w-4" />Map
              </a>
            </div>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <Info label="Property address">{inquiry.property_address}</Info>
              <Info label="Email">{inquiry.email}</Info>
              {inquiry.preferred_date && (
                <Info label={inquiry.date_is_deadline ? 'Firm deadline' : 'Preferred date'}>
                  <span className={inquiry.date_is_deadline ? 'font-semibold text-rose-ink' : ''}>{formatDate(inquiry.preferred_date)}</span>
                </Info>
              )}
              {details.map((d) => <Info key={d.key} label={d.label}>{d.value}</Info>)}
            </dl>
          </section>

          <section className="card animate-rise p-5 sm:p-6" style={{ animationDelay: '60ms' }} aria-labelledby="desc-title">
            <h3 id="desc-title" className="font-display text-xl font-semibold">What they need</h3>
            <p className="mt-2 whitespace-pre-line">{inquiry.description}</p>
            {inquiry.keep_items && (
              <div className="mt-4 rounded-2xl bg-sage/15 px-4 py-3">
                <p className="text-xs font-semibold tracking-wide text-sage-deep uppercase">Keep or donate</p>
                <p className="mt-1 whitespace-pre-line">{inquiry.keep_items}</p>
              </div>
            )}
            {inquiry.restrictions && (
              <div className="mt-3 rounded-2xl bg-blush/60 px-4 py-3">
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">HOA, landlord or parking rules</p>
                <p className="mt-1 whitespace-pre-line">{inquiry.restrictions}</p>
              </div>
            )}
            {inquiry.hazards && (
              <div className="mt-3 flex gap-3 rounded-2xl bg-gold/15 px-4 py-3">
                <AdminIcon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-gold-deep" />
                <div>
                  <p className="text-xs font-semibold tracking-wide text-gold-deep uppercase">Possible hazards</p>
                  <p className="mt-1 whitespace-pre-line">{inquiry.hazards}</p>
                  <p className="mt-1 text-xs text-muted">Hazardous materials need a licensed specialist and usually can’t go in a dumpster.</p>
                </div>
              </div>
            )}
          </section>

          <section className="card animate-rise p-5 sm:p-6" style={{ animationDelay: '120ms' }} aria-labelledby="photos-title">
            <h3 id="photos-title" className="mb-3 font-display text-xl font-semibold">Photos</h3>
            <Photos photos={data.photos} failed={inquiry.photos_failed} />
          </section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-6" aria-label="Manage this request">
          <section className="card animate-rise space-y-4 p-5" aria-labelledby="manage-title">
            <h3 id="manage-title" className="sr-only">Manage</h3>
            <Field label="Status">
              {(p) => (
                <select {...p} className="input" value={inquiry.status} disabled={busy}
                  onChange={(e) => update({ status: e.target.value }, `Marked as ${inquiryStatus(e.target.value).label.toLowerCase()}`)}>
                  {INQUIRY_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              )}
            </Field>
            <Field label="Private notes" optional hint="Only you can see these.">
              {(p) => (
                <textarea {...p} rows={4} className="input resize-y" value={notes}
                  onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }} />
              )}
            </Field>
            {notesDirty && (
              <button type="button" className="btn-soft w-full" onClick={saveNotes} disabled={busy}>Save notes</button>
            )}
          </section>

          <section className="card animate-rise space-y-3 p-5" style={{ animationDelay: '60ms' }} aria-labelledby="customer-title">
            <h3 id="customer-title" className="text-sm font-semibold">Customer record</h3>
            {linkedCustomer ? (
              <p className="flex items-center justify-between gap-2 rounded-2xl bg-sage/15 px-3 py-2 text-sm">
                <span>Linked to <strong>{linkedCustomer.full_name}</strong></span>
                <button type="button" className="text-xs font-semibold text-rose-deep underline" onClick={() => update({ customer_id: null }, 'Unlinked')} disabled={busy}>Unlink</button>
              </p>
            ) : (
              <>
                {matches.length > 0 && !pickCustomer && (
                  <p className="rounded-2xl bg-gold/15 px-3 py-2 text-sm">
                    Looks like <strong>{matches[0].full_name}</strong> is already a customer (same {matches[0].email?.toLowerCase() === inquiry.email.toLowerCase() ? 'email' : 'phone'}).{' '}
                    <button type="button" className="font-semibold text-rose-deep underline" disabled={busy}
                      onClick={() => update({ customer_id: matches[0].id }, 'Linked to existing customer')}>Link them</button>
                  </p>
                )}
                {pickCustomer ? (
                  <div className="space-y-2">
                    <Field label="Existing customer">
                      {(p) => (
                        <select {...p} className="input" value={customerChoice} onChange={(e) => setCustomerChoice(e.target.value)}>
                          <option value="">Choose…</option>
                          {(customers.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.company ? ` (${c.company})` : ''}</option>)}
                        </select>
                      )}
                    </Field>
                    <div className="flex gap-2">
                      <button type="button" className="btn-ghost flex-1" onClick={() => setPickCustomer(false)}>Cancel</button>
                      <button type="button" className="btn-soft flex-1" disabled={!customerChoice || busy}
                        onClick={async () => { await update({ customer_id: customerChoice }, 'Linked to customer'); setPickCustomer(false); }}>Link</button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <button type="button" className="btn-ghost w-full" onClick={createCustomer} disabled={busy}>Add as a new customer</button>
                    <button type="button" className="btn-ghost w-full" onClick={() => setPickCustomer(true)} disabled={busy}>Link an existing customer</button>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="card animate-rise space-y-3 p-5" style={{ animationDelay: '120ms' }} aria-labelledby="next-title">
            <h3 id="next-title" className="text-sm font-semibold">Next step</h3>
            {data.estimates.length > 0 && (
              <ul className="space-y-2">
                {data.estimates.map((e) => (
                  <li key={e.id}>
                    <a href={`#/price-sheet/estimates/${e.id}`} className="flex items-center justify-between gap-2 rounded-2xl bg-blush/50 px-3 py-2 text-sm hover:bg-blush">
                      <span className="font-semibold">Estimate #{e.number}</span>
                      <span className="flex items-center gap-2">
                        <span className="tabular">{formatMoney(e.total)}</span>
                        <span className={`pill ${statusInfo(e.status).className}`}>{statusInfo(e.status).label}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {inquiry.job_id && (
              <a href={`#/jobs/${inquiry.job_id}`} className="btn-soft w-full"><AdminIcon name="truck" className="h-4 w-4" />Open the job</a>
            )}
            <button type="button" className="btn-primary w-full" onClick={createEstimate} disabled={busy}>
              <AdminIcon name="sparkle" className="h-4 w-4" />
              {data.estimates.length ? 'Start another estimate' : 'Create estimate'}
            </button>
            {!inquiry.job_id && (
              <button type="button" className="btn-ghost w-full" onClick={createJob} disabled={busy}>Create job without an estimate</button>
            )}
            <p className="text-xs text-muted">The customer’s name, contact details and address are copied over for you.</p>
          </section>

          <button type="button" onClick={remove} disabled={busy} className={confirmDelete ? 'btn-danger w-full' : 'btn-ghost w-full text-danger'}>
            {confirmDelete ? 'Yes, delete this request and its photos' : 'Delete request (spam or duplicate)'}
          </button>
        </aside>
      </div>
    </div>
  );
}

export default function InquiriesPage({ route }) {
  const detailId = route.match(/^\/inquiries\/([\w-]+)$/)?.[1];
  return (
    <div className="space-y-6">
      <DemoBanner />
      <PageHeader eyebrow="Customers" title="Inquiries">
        Quote requests from your website, with the photos customers sent.
      </PageHeader>
      {detailId ? <InquiryDetail key={detailId} id={detailId} /> : <InquiryList />}
    </div>
  );
}
