// Hours and estimated wages. "Estimated gross wages" = hours x hourly rate, before
// taxes and deductions. This app doesn't run payroll.

import { parseISODate, toISODate } from './dates.js';

export const wageCents = (t) => Math.round(Number(t.hours) * Number(t.hourly_rate || 0) * 100);

export const TIME_STATUSES = {
  submitted: { label: 'Needs approval', className: 'bg-gold/20 text-gold-deep' },
  approved: { label: 'Approved', className: 'bg-sage/25 text-sage-deep' },
};

// Hours and wages per employee: Map(employee_id -> { hours, cents, entries })
export function totalsByEmployee(entries) {
  const map = new Map();
  for (const t of entries) {
    const s = map.get(t.employee_id) ?? { hours: 0, cents: 0, entries: 0 };
    s.hours += Number(t.hours);
    s.cents += wageCents(t);
    s.entries += 1;
    map.set(t.employee_id, s);
  }
  return map;
}

export const formatHours = (h) => `${Math.round(h * 100) / 100} ${Math.round(h * 100) === 100 ? 'hr' : 'hrs'}`;

// Work weeks run Monday to Sunday.
export function weekRange(offsetWeeks = 0, today = new Date()) {
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7) + offsetWeeks * 7);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { from: toISODate(monday), to: toISODate(sunday), label: `${fmt(monday)} – ${fmt(sunday)}` };
}

export const HOUR_PERIODS = [
  { value: 'this_week', label: 'This week' },
  { value: 'last_week', label: 'Last week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
];

export const dayName = (iso) => parseISODate(iso).toLocaleDateString('en-US', { weekday: 'short' });
