// Dates are kept as local 'YYYY-MM-DD' strings, matching Postgres `date` columns.
// Never use new Date('YYYY-MM-DD'): browsers read that as UTC midnight, which is
// the previous evening in Michigan.

const pad = (n) => String(n).padStart(2, '0');

export function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayISO = () => toISODate(new Date());

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(s, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!s) return '';
  return parseISODate(s).toLocaleDateString('en-US', opts);
}

// Named periods used by the period pickers. Each returns { from, to, label } (inclusive).
export const PERIODS = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_year', label: 'This year' },
  { value: 'last_year', label: 'Last year' },
];

export function periodRange(period, today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth();
  const monthLabel = (d) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  switch (period) {
    case 'this_month':
      return { from: toISODate(new Date(y, m, 1)), to: toISODate(new Date(y, m + 1, 0)), label: monthLabel(today) };
    case 'last_month': {
      const start = new Date(y, m - 1, 1);
      return { from: toISODate(start), to: toISODate(new Date(y, m, 0)), label: monthLabel(start) };
    }
    case 'last_year':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: String(y - 1) };
    case 'this_year':
    default:
      return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
  }
}

// Moves a date by whole months, keeping the day where possible (Mar 31 - 1 month = Feb 28).
function shiftMonths(s, n) {
  const d = parseISODate(s);
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return toISODate(new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay)));
}

// Like-for-like ranges for "vs. previous period". A period still in progress is
// compared up to the same point: this year so far vs. last year up to the same date.
export function comparisonRanges({ from, to }, today = todayISO()) {
  const a = parseISODate(from);
  const b = parseISODate(to);
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
  const inProgress = to > today && from <= today;
  const end = inProgress ? today : to;
  // A finished period compares with the whole previous one (April vs. all of March, through the 31st).
  const prevEnd = inProgress ? shiftMonths(end, -months) : toISODate(new Date(a.getFullYear(), a.getMonth(), 0));
  return {
    current: { from, to: end },
    previous: { from: shiftMonths(from, -months), to: prevEnd },
  };
}
