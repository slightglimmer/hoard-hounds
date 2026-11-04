// "Request online payment": creates a Stripe payment link for the job that you can
// text or email. When the customer pays (card, Klarna or any method you've turned
// on in Stripe), the payment is recorded on the job automatically.

import { useEffect, useState } from 'react';
import AdminIcon from '../../components/AdminIcon.jsx';
import { DemoPill, Field, Modal, useToast } from '../../components/ui.jsx';
import { api } from '../../lib/api/index.js';
import { formatDate } from '../../lib/dates.js';
import { formatCents, formatMoney, parseAmount } from '../../lib/money.js';
import { MODE } from '../../lib/supabase.js';

const STATUS = {
  open: { label: 'Waiting for customer', className: 'bg-gold/20 text-gold-deep' },
  paid: { label: 'Paid', className: 'bg-sage/25 text-sage-deep' },
  cancelled: { label: 'Cancelled', className: 'bg-blush text-muted' },
};

function message(request, customer) {
  const first = customer?.full_name?.split(' ')[0];
  const what = request.kind === 'deposit' ? 'deposit' : 'payment';
  return `Hi${first ? ` ${first}` : ''}, here’s your secure link to pay your Hoard Hounds ${what} of ${formatMoney(request.amount)}: ${request.url}\n\nYou can pay by card, or over time with Klarna (subject to approval). Thank you!`;
}

function ShareLink({ request, customer }) {
  const notify = useToast();
  const text = message(request, customer);
  const phone = (customer?.phone || '').replace(/[^\d+]/g, '');

  async function copy(value, what) {
    try {
      await navigator.clipboard.writeText(value);
      notify(`${what} copied`);
    } catch {
      window.prompt('Copy this:', value);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-soft min-h-9 px-3.5" onClick={() => copy(text, 'Message')}>Copy message</button>
      <button type="button" className="btn-ghost min-h-9 px-3.5" onClick={() => copy(request.url, 'Link')}>Copy link</button>
      <a className="btn-ghost min-h-9 px-3.5" href={`sms:${phone}?&body=${encodeURIComponent(text)}`}>Text it</a>
      <a className="btn-ghost min-h-9 px-3.5"
        href={`mailto:${customer?.email || ''}?subject=${encodeURIComponent(`Your Hoard Hounds ${request.kind === 'deposit' ? 'deposit' : 'payment'} link`)}&body=${encodeURIComponent(text)}`}>
        Email it
      </a>
    </div>
  );
}

function RequestForm({ open, job, customer, balanceCents, onClose, onCreated }) {
  const [kind, setKind] = useState('deposit');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);

  useEffect(() => {
    if (!open) return;
    const owes = balanceCents > 0;
    setKind(owes && job.status === 'completed' ? 'payment' : 'deposit');
    setAmount(owes && job.status === 'completed' ? (balanceCents / 100).toFixed(2) : '');
    setNote('');
    setError('');
    setCreated(null);
  }, [open, balanceCents, job.status]);

  async function submit(e) {
    e.preventDefault();
    const parsed = parseAmount(amount);
    if (!parsed || Number(parsed) < 0.5) {
      setError('Enter an amount of at least $0.50.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const request = await api.requestPayment({ job_id: job.id, kind, amount_cents: Math.round(Number(parsed) * 100), description: note.trim() });
      setCreated(request);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={created ? 'Payment link ready' : 'Request online payment'}
      onClose={onClose}
      footer={
        created ? (
          <button type="button" className="btn-primary" onClick={onClose}>Done</button>
        ) : (
          <>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" form="request-form" className="btn-primary" disabled={busy}>{busy ? 'Creating link…' : 'Create payment link'}</button>
          </>
        )
      }
    >
      {created ? (
        <div className="space-y-4">
          <p className="rounded-2xl bg-sage/20 px-4 py-3 text-sm text-sage-deep">
            Your secure Stripe link for <strong>{formatMoney(created.amount)}</strong> is ready. Send it to {customer?.full_name || 'your customer'}. When they pay, it’s recorded on this job automatically.
          </p>
          <p className="rounded-2xl bg-blush/60 px-4 py-3 text-sm break-all">{created.url}</p>
          <ShareLink request={created} customer={customer} />
          <p className="text-xs text-muted">Each link can be paid once. Stripe shows the customer every payment option you’ve turned on, like cards and Klarna.</p>
        </div>
      ) : (
        <form id="request-form" onSubmit={submit} noValidate className="space-y-4">
          {error && <p role="alert" className="rounded-2xl bg-danger/8 px-4 py-3 text-sm font-medium text-danger">{error}</p>}
          <Field label="What is it for?">
            {(p) => (
              <select {...p} className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="deposit">Deposit to book the job</option>
                <option value="payment">Payment (balance or full amount)</option>
              </select>
            )}
          </Field>
          <Field label="Amount" hint={balanceCents > 0 ? `Still owed on this job: ${formatCents(balanceCents)}` : undefined}>
            {(p) => (
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">$</span>
                <input {...p} inputMode="decimal" placeholder="0.00" className="input pl-8 tabular" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            )}
          </Field>
          <Field label="Note for the customer" optional hint="Shown on their receipt.">
            {(p) => <input {...p} className="input" placeholder={`e.g. ${job.title}`} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <p className="text-xs text-muted">Stripe charges a fee on each online payment (higher for pay-over-time options like Klarna). You’re paid the full amount minus the fee.</p>
        </form>
      )}
    </Modal>
  );
}

export default function OnlinePayments({ job, customer, balanceCents, onPaid }) {
  const notify = useToast();
  const [requests, setRequests] = useState(undefined); // undefined loading, null not set up
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      setRequests(await api.listPaymentRequests(job.id));
    } catch {
      setRequests([]);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  async function cancel(r) {
    setBusyId(r.id);
    try {
      await api.cancelPaymentRequest(r.id);
      notify('Payment link cancelled');
      load();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function simulate(r) {
    setBusyId(r.id);
    await api.simulateOnlinePayment(r.id);
    notify('Demo: customer paid with Klarna');
    setBusyId(null);
    load();
    onPaid();
  }

  async function refresh() {
    await load();
    onPaid();
  }

  if (requests === null) {
    return (
      <p className="mt-4 rounded-2xl bg-blush/50 px-4 py-3 text-sm text-muted">
        Online payments (cards and Klarna) aren’t switched on yet. See “Online payments” in docs/ADMIN_SETUP.md.
      </p>
    );
  }

  const visible = (requests ?? []).filter((r) => r.status !== 'cancelled').slice(0, 5);
  return (
    <div className="mt-4 rounded-3xl border border-dashed border-petal p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Online payment links</p>
        <div className="flex gap-2">
          {visible.some((r) => r.status === 'open') && (
            <button type="button" className="btn-ghost min-h-9 px-3" onClick={refresh}>Check for payment</button>
          )}
          <button type="button" className="btn-primary min-h-9 px-3.5" onClick={() => setFormOpen(true)}>
            <AdminIcon name="sparkle" className="h-4 w-4" />
            Request online payment
          </button>
        </div>
      </div>
      {visible.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {visible.map((r) => (
            <li key={r.id} className="rounded-2xl bg-white p-3 ring-1 ring-line">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{r.kind === 'deposit' ? 'Deposit' : 'Payment'} · {formatMoney(r.amount)}</span>
                <span className={`pill ${STATUS[r.status].className}`}>{STATUS[r.status].label}</span>
                {r.is_demo && <DemoPill />}
                <span className="ml-auto text-xs text-muted">Sent {formatDate(r.created_at.slice(0, 10))}</span>
              </div>
              {r.status === 'open' && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <ShareLink request={r} customer={customer} />
                  <button type="button" className="btn-ghost min-h-9 px-3.5 text-danger" disabled={busyId === r.id} onClick={() => cancel(r)}>Cancel link</button>
                  {MODE === 'demo' && (
                    <button type="button" className="btn-ghost min-h-9 px-3.5" disabled={busyId === r.id} onClick={() => simulate(r)}>Pretend the customer paid (demo)</button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">Text or email a secure link. Customers can pay by card or over time with Klarna, and it’s recorded here automatically.</p>
      )}
      <RequestForm open={formOpen} job={job} customer={customer} balanceCents={balanceCents}
        onClose={() => setFormOpen(false)} onCreated={load} />
    </div>
  );
}
