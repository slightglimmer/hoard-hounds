import { parseISODate, toISODate } from './dates.js';

export const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Every 3 months' },
  { value: 'yearly', label: 'Yearly' },
];

export const frequencyLabel = (f) => FREQUENCIES.find((x) => x.value === f)?.label ?? f;

// Mirrors public.recurrence_date() in the database: the nth charge counted from the
// start date, so a charge on the 31st lands on the last day of shorter months.
export function recurrenceDate(start, frequency, n) {
  const s = parseISODate(start);
  if (frequency === 'weekly') return toISODate(new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7 * n));
  const months = { monthly: 1, quarterly: 3, yearly: 12 }[frequency] * n;
  const target = new Date(s.getFullYear(), s.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return toISODate(new Date(target.getFullYear(), target.getMonth(), Math.min(s.getDate(), lastDay)));
}

// The charge dates due on or before asOf for a recurring expense.
export function dueDates(r, asOf, limit = 1000) {
  const dates = [];
  if (!r.active) return dates;
  let n = r.occurrences_posted;
  let next = recurrenceDate(r.start_date, r.frequency, n);
  while (next <= asOf && (!r.end_date || next <= r.end_date) && dates.length < limit) {
    dates.push(next);
    n += 1;
    next = recurrenceDate(r.start_date, r.frequency, n);
  }
  return dates;
}

export function recurringStatus(r, asOf) {
  if (!r.active) return 'paused';
  if (r.end_date && r.next_due_date > r.end_date) return 'ended';
  if (r.next_due_date <= asOf) return 'due';
  return 'scheduled';
}
