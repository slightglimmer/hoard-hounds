// In-memory stand-in for the database, used only in demo mode. It follows the
// same rules as the real tables (derived next due dates, no duplicate recurring
// charges, categories in use can't be removed) so the demo behaves like the real thing.

import { buildDemoData, newId } from './demoData.js';
import { recurrenceDate, dueDates } from '../recurrence.js';

const store = buildDemoData();
const wait = (ms = 180) => new Promise((r) => setTimeout(r, ms));
const copy = (x) => structuredClone(x);
const inRange = (d, { from, to }) => d >= from && d <= to;

function upsert(list, row, defaults) {
  if (row.id) {
    const i = list.findIndex((x) => x.id === row.id);
    if (i === -1) throw new Error('That record no longer exists.');
    list[i] = { ...list[i], ...row };
    return list[i];
  }
  const created = { ...defaults, ...row, id: newId(), is_demo: true, created_at: new Date().toISOString() };
  list.push(created);
  return created;
}

const withNextDue = (r) => ({ ...r, next_due_date: recurrenceDate(r.start_date, r.frequency, r.occurrences_posted) });

export const demoApi = {
  async listCategories() {
    await wait();
    return copy([...store.categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
  },
  async saveCategory(row) {
    await wait();
    if (store.categories.some((c) => c.id !== row.id && c.name.toLowerCase() === row.name.trim().toLowerCase())) {
      throw new Error('That would create a duplicate.');
    }
    const max = Math.max(0, ...store.categories.map((c) => c.sort_order));
    return copy(upsert(store.categories, row, { active: true, sort_order: max + 10 }));
  },

  async listExpenses(range) {
    await wait();
    return copy(store.expenses.filter((e) => inRange(e.expense_date, range)));
  },
  async saveExpense(row) {
    await wait();
    const saved = upsert(store.expenses, row, { recurring_expense_id: null });
    store.expenses.sort((a, b) => (a.expense_date < b.expense_date ? 1 : -1));
    return copy(saved);
  },
  async deleteExpense(id) {
    await wait();
    store.expenses = store.expenses.filter((e) => e.id !== id);
  },

  async listRecurring() {
    await wait();
    return copy([...store.recurring].sort((a, b) => (a.next_due_date < b.next_due_date ? -1 : 1)));
  },
  async saveRecurring(row) {
    await wait();
    const saved = upsert(store.recurring, row, { occurrences_posted: 0 });
    Object.assign(saved, withNextDue(saved));
    return copy(saved);
  },
  async deleteRecurring(id) {
    await wait();
    store.recurring = store.recurring.filter((r) => r.id !== id);
    for (const e of store.expenses) if (e.recurring_expense_id === id) e.recurring_expense_id = null;
  },
  async postDueRecurring(asOf) {
    await wait(300);
    let posted = 0;
    for (const r of store.recurring) {
      for (const date of dueDates(r, asOf)) {
        if (!store.expenses.some((e) => e.recurring_expense_id === r.id && e.expense_date === date)) {
          store.expenses.push({
            id: newId(), expense_date: date, vendor: r.vendor, description: r.description, category_id: r.category_id,
            amount: r.amount, payment_method: r.payment_method, notes: null, recurring_expense_id: r.id, is_demo: true,
            created_at: new Date().toISOString(),
          });
          posted += 1;
        }
        r.occurrences_posted += 1;
      }
      Object.assign(r, withNextDue(r));
    }
    store.expenses.sort((a, b) => (a.expense_date < b.expense_date ? 1 : -1));
    return posted;
  },

  async listPayments(range) {
    await wait();
    return copy(store.payments.filter((p) => inRange(p.received_on, range)));
  },
  async listTimeEntries(range) {
    await wait();
    return copy(store.timeEntries.filter((t) => inRange(t.work_date, range)));
  },

  async hasDemoData() {
    return true;
  },
  async clearDemoData() {
    throw new Error('This is a demo with sample data only. There’s nothing saved to clear.');
  },
};
