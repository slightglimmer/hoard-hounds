// Price units and estimate math. The totals here mirror the database trigger
// public.estimates_compute_totals(), which recalculates every saved estimate.

import { formatDate } from './dates.js';
import { formatCents } from './money.js';

export const UNITS = [
  { value: 'flat', label: 'Flat rate', per: '' },
  { value: 'item', label: 'Per item', per: 'item' },
  { value: 'load', label: 'Per truck load', per: 'load' },
  { value: 'hour', label: 'Per hour', per: 'hour' },
  { value: 'cubic_yard', label: 'Per cubic yard', per: 'cu yd' },
];

export const unitLabel = (u) => UNITS.find((x) => x.value === u)?.label ?? u;
export const unitPer = (u) => UNITS.find((x) => x.value === u)?.per ?? '';

// "1 load", "2 loads", "1.5 hours". Cubic yards and flat rates don't change.
export function quantityLabel(unit, quantity) {
  const per = unitPer(unit);
  const q = Number(quantity);
  if (!per) return String(q);
  return `${q} ${q <= 1 || per === 'cu yd' ? per : `${per}s`}`;
}

// True when the line's minimum charge is what set its price.
export function minimumApplies(item) {
  const base = Math.round((Math.round(Number(item.quantity || 0) * 100) * Math.round(Number(item.unit_price || 0) * 100)) / 100);
  return Math.round(Number(item.minimum_charge || 0) * 100) > base;
}

export const STATUSES = [
  { value: 'draft', label: 'Draft', className: 'bg-blush text-muted' },
  { value: 'sent', label: 'Sent', className: 'bg-gold/20 text-gold-deep' },
  { value: 'accepted', label: 'Accepted', className: 'bg-sage/25 text-sage-deep' },
  { value: 'declined', label: 'Declined', className: 'bg-danger/10 text-danger' },
];
export const statusInfo = (s) => STATUSES.find((x) => x.value === s) ?? STATUSES[0];

export const DEFAULT_TERMS =
  'This estimate is based on the photos and details provided. The final price is confirmed with you after a walkthrough or on arrival, before any work begins.';

// Whole cents and hundredths are used so the math matches Postgres exactly.
const cents = (v) => Math.round(Number(v || 0) * 100);
const hundredths = (v) => Math.round(Number(v || 0) * 100);

// quantity x price, but never less than the item's minimum charge.
export function lineCents(item) {
  const qty = hundredths(item.quantity);
  if (qty <= 0) return 0;
  const base = Math.round((qty * cents(item.unit_price)) / 100);
  return Math.max(base, cents(item.minimum_charge));
}

export function computeTotals(items, discountType, discountValue) {
  const subtotal = items.reduce((s, it) => s + lineCents(it), 0);
  let discount = 0;
  if (discountType === 'percent') discount = Math.round((subtotal * hundredths(discountValue)) / 10000);
  else if (discountType === 'amount') discount = cents(discountValue);
  discount = Math.min(discount, subtotal);
  return { subtotal, discount, total: subtotal - discount };
}

// Plain-text version for pasting into a text message or email.
export function estimateText(est, site) {
  const { subtotal, discount, total } = computeTotals(est.line_items, est.discount_type, est.discount_value);
  const lines = [
    `${site.legalName}: Estimate${est.number ? ` #${est.number}` : ''}`,
    `For: ${est.customer_name}${est.property_address ? `, ${est.property_address}` : ''}`,
    `Date: ${formatDate(est.estimate_date)}${est.valid_until ? ` (valid until ${formatDate(est.valid_until)})` : ''}`,
    '',
    ...est.line_items.map((it) => {
      const detail = it.unit === 'flat' && Number(it.quantity) === 1 ? '' : ` (${quantityLabel(it.unit, it.quantity)} × ${formatCents(cents(it.unit_price))})`;
      return `• ${it.name}${detail}: ${formatCents(lineCents(it))}${minimumApplies(it) ? ' (minimum charge)' : ''}`;
    }),
    '',
  ];
  if (discount) {
    lines.push(`Subtotal: ${formatCents(subtotal)}`);
    lines.push(`Discount${est.discount_type === 'percent' ? ` (${Number(est.discount_value)}%)` : ''}: −${formatCents(discount)}`);
  }
  lines.push(`Estimated total: ${formatCents(total)}`);
  if (Number(est.deposit_amount) > 0) {
    lines.push(`Deposit to book: ${formatCents(cents(est.deposit_amount))} (credited toward the total)`);
    lines.push(`Balance after deposit: ${formatCents(Math.max(0, total - cents(est.deposit_amount)))}`);
  }
  if (est.scope_of_work) lines.push('', `Scope of work: ${est.scope_of_work}`);
  const allowance = allowanceLines(est);
  if (allowance.length) lines.push('', 'Dumpster allowance:', ...allowance.map((l) => `• ${l}`));
  if (est.overage_terms) lines.push('', est.overage_terms);
  if (est.notes) lines.push('', est.notes);
  if (est.terms) lines.push('', est.terms);
  lines.push('', `Questions? Call or text ${site.phoneDisplay} or email ${site.email}.`);
  return lines.join('\n');
}

// The dumpster allowance in plain sentences, for the printed estimate, the text copy
// and the customer's quote page. Empty when nothing is filled in.
export function allowanceLines(est) {
  const lines = [];
  const n = Number(est.dumpster_count) || (Number(est.dumpster_size_yards) ? 1 : 0);
  const size = Number(est.dumpster_size_yards);
  if (n || size) lines.push(`${n || 1} × ${size ? `${size}-yard ` : ''}dumpster${(n || 1) > 1 ? 's' : ''}, including delivery, pickup and disposal`);
  const tons = Number(est.dumpster_weight_allowance_tons);
  if (tons) lines.push(`Up to ${tons} ton${tons === 1 ? '' : 's'} of weight included${(n || 1) > 1 ? ' per dumpster' : ''}`);
  const days = Number(est.dumpster_rental_days);
  if (days) lines.push(`${days} rental day${days === 1 ? '' : 's'} included`);
  const perTon = est.overage_rate_per_ton === null || est.overage_rate_per_ton === undefined || est.overage_rate_per_ton === '' ? null : Number(est.overage_rate_per_ton);
  const perDay = est.extra_day_rate === null || est.extra_day_rate === undefined || est.extra_day_rate === '' ? null : Number(est.extra_day_rate);
  const rates = [
    perTon !== null && !Number.isNaN(perTon) && `${formatCents(Math.round(perTon * 100))} per extra ton`,
    perDay !== null && !Number.isNaN(perDay) && `${formatCents(Math.round(perDay * 100))} per extra day`,
  ].filter(Boolean);
  if (rates.length) lines.push(`If needed, the dumpster company’s rates are ${rates.join(' and ')} (only billed at cost, with your approval)`);
  return lines;
}
