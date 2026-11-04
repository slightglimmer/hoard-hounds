import { toCents } from './money.js';

// Turns raw rows into the numbers on the Overview page. Everything is in cents.
//   revenue  money received from customers (deposits and payments, minus refunds)
//   expenses business expenses
//   labor    estimated gross wages: hours x hourly rate (not payroll, no employer taxes)

const paymentCents = (p) => (p.kind === 'refund' ? -toCents(p.amount) : toCents(p.amount));
const laborCents = (t) => Math.round(Number(t.hours) * Number(t.hourly_rate || 0) * 100);
const inRange = (d, { from, to }) => d >= from && d <= to;

export function totals({ expenses, payments, timeEntries }, range) {
  const revenue = payments.filter((p) => inRange(p.received_on, range)).reduce((s, p) => s + paymentCents(p), 0);
  const expense = expenses.filter((e) => inRange(e.expense_date, range)).reduce((s, e) => s + toCents(e.amount), 0);
  const labor = timeEntries.filter((t) => inRange(t.work_date, range)).reduce((s, t) => s + laborCents(t), 0);
  return { revenue, expenses: expense, labor, profit: revenue - expense - labor };
}

export function monthly({ expenses, payments, timeEntries }, year) {
  const months = Array.from({ length: 12 }, () => ({ revenue: 0, expenses: 0, labor: 0, profit: 0 }));
  const slot = (d) => (d.startsWith(`${year}-`) ? months[Number(d.slice(5, 7)) - 1] : null);
  for (const p of payments) {
    const m = slot(p.received_on);
    if (m) m.revenue += paymentCents(p);
  }
  for (const e of expenses) {
    const m = slot(e.expense_date);
    if (m) m.expenses += toCents(e.amount);
  }
  for (const t of timeEntries) {
    const m = slot(t.work_date);
    if (m) m.labor += laborCents(t);
  }
  for (const m of months) m.profit = m.revenue - m.expenses - m.labor;
  return months;
}

export function byCategory(expenses, categories, range) {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const sums = new Map();
  for (const e of expenses) {
    if (!inRange(e.expense_date, range)) continue;
    sums.set(e.category_id, (sums.get(e.category_id) || 0) + toCents(e.amount));
  }
  return [...sums.entries()]
    .map(([id, cents]) => ({ id, name: names.get(id) || 'Uncategorized', cents }))
    .sort((a, b) => b.cents - a.cents);
}

// Percentage change, or null when there's nothing to compare against.
export function change(current, previous) {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
