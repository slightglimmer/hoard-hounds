// Job statuses and per-job money. Everything is in cents.
//   received  money actually collected (deposits + payments - refunds), which is
//             what the Overview counts as revenue
//   balance   agreed price - received (what the customer still owes)
//   costs     expenses linked to the job (dump fees, truck rental, contract labor...)
//   labor     estimated wages from hours logged on the job (hours x rate)
//   profit    received - costs - labor
//   expected  agreed price - costs - labor (profit once the balance is paid)

import { toCents } from './money.js';

export const JOB_STATUSES = [
  { value: 'lead', label: 'Lead', className: 'bg-blush text-muted', open: true },
  { value: 'quoted', label: 'Quoted', className: 'bg-petal/70 text-rose-ink', open: true },
  { value: 'scheduled', label: 'Scheduled', className: 'bg-gold/20 text-gold-deep', open: true },
  { value: 'in_progress', label: 'In progress', className: 'bg-rose-deep text-white', open: true },
  { value: 'completed', label: 'Completed', className: 'bg-sage/25 text-sage-deep', open: false },
  { value: 'cancelled', label: 'Cancelled', className: 'bg-ink/10 text-muted', open: false },
];
export const jobStatus = (s) => JOB_STATUSES.find((x) => x.value === s) ?? JOB_STATUSES[0];

export const PAYMENT_KINDS = [
  { value: 'deposit', label: 'Deposit' },
  { value: 'payment', label: 'Payment' },
  { value: 'refund', label: 'Refund' },
];

export const CUSTOMER_TYPES = [
  { value: 'real_estate_agent', label: 'Real estate agent' },
  { value: 'investor', label: 'Property investor' },
  { value: 'landlord', label: 'Landlord' },
  { value: 'property_manager', label: 'Property manager' },
  { value: 'estate_representative', label: 'Estate representative' },
  { value: 'homeowner', label: 'Homeowner' },
  { value: 'other', label: 'Other' },
];
export const customerTypeLabel = (v) => CUSTOMER_TYPES.find((x) => x.value === v)?.label ?? '';

export const paymentCents = (p) => (p.kind === 'refund' ? -toCents(p.amount) : toCents(p.amount));
const laborCents = (t) => Math.round(Number(t.hours) * Number(t.hourly_rate || 0) * 100);

export function jobMoney({ financials, payments = [], expenses = [], timeEntries = [] }) {
  const agreed = financials?.agreed_price != null && financials.agreed_price !== '' ? toCents(financials.agreed_price) : null;
  const quoted = financials?.quoted_amount != null && financials.quoted_amount !== '' ? toCents(financials.quoted_amount) : null;
  const received = payments.reduce((s, p) => s + paymentCents(p), 0);
  const costs = expenses.reduce((s, e) => s + toCents(e.amount), 0);
  const labor = timeEntries.reduce((s, t) => s + laborCents(t), 0);
  const balance = agreed === null ? null : agreed - received;
  const expected = agreed === null ? null : agreed - costs - labor;
  return { agreed, quoted, received, costs, labor, balance, profit: received - costs - labor, expected };
}

// Groups rows by job_id for quick lookups on the jobs list.
export function byJob(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!r.job_id) continue;
    if (!map.has(r.job_id)) map.set(r.job_id, []);
    map.get(r.job_id).push(r);
  }
  return map;
}
