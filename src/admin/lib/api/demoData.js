// SAMPLE DATA for demo mode only. Every amount, vendor and record here is made up
// and marked is_demo so the app labels it. Nothing is saved anywhere.

import { toISODate } from '../dates.js';
import { recurrenceDate } from '../recurrence.js';

// Same starting categories as the database migration.
const CATEGORY_SEED = [
  ['Dump & disposal fees', 'Other expenses'],
  ['Truck rental', 'Rent or lease: vehicles, machinery, equipment'],
  ['Fuel', 'Car and truck expenses'],
  ['Vehicle repairs & maintenance', 'Car and truck expenses'],
  ['Equipment & tools', 'Supplies'],
  ['Supplies', 'Supplies'],
  ['Contract labor', 'Contract labor'],
  ['Insurance', 'Insurance (other than health)'],
  ['Advertising & marketing', 'Advertising'],
  ['Software & subscriptions', 'Other expenses'],
  ['Phone & internet', 'Utilities'],
  ['Licenses, permits & fees', 'Taxes and licenses'],
  ['Professional services', 'Legal and professional services'],
  ['Office expenses', 'Office expense'],
  ['Meals', 'Meals'],
  ['Other', 'Other expenses'],
];

// Small deterministic random generator so the demo looks the same on every load.
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

let counter = 0;
export const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `demo-${Date.now()}-${++counter}`;

export function buildDemoData(today = new Date()) {
  const rand = seeded(42);
  const between = (lo, hi) => Math.round((lo + rand() * (hi - lo)) * 100) / 100;
  const todayStr = toISODate(today);
  const stamp = new Date().toISOString();

  const categories = CATEGORY_SEED.map(([name, tax_category], i) => ({
    id: newId(),
    name,
    tax_category,
    active: true,
    sort_order: (i + 1) * 10,
  }));
  const cat = (name) => categories.find((c) => c.name === name).id;

  const expenses = [];
  const payments = [];
  const timeEntries = [];
  const add = (expense_date, vendor, description, category, amount, payment_method = 'card') => {
    if (expense_date > todayStr) return;
    expenses.push({
      id: newId(), expense_date, vendor, description, category_id: cat(category), amount: amount.toFixed(2),
      payment_method, notes: null, recurring_expense_id: null, is_demo: true, created_at: stamp,
    });
  };

  // Fifteen months of sample activity, ending today.
  for (let back = 14; back >= 0; back -= 1) {
    const first = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const y = first.getFullYear();
    const m = first.getMonth();
    const day = (d) => toISODate(new Date(y, m, d));
    const season = [0.55, 0.6, 0.85, 1, 1.15, 1.2, 1.25, 1.2, 1.1, 1, 0.8, 0.6][m];
    const jobs = Math.max(2, Math.round(5 * season + rand() * 2));

    for (let j = 0; j < jobs; j += 1) {
      const d = day(2 + Math.floor(rand() * 26));
      if (d > todayStr) continue;
      const price = between(380, 1450);
      payments.push({ id: newId(), received_on: d, kind: 'deposit', amount: '150.00', is_demo: true });
      payments.push({ id: newId(), received_on: d, kind: 'payment', amount: (price - 150).toFixed(2), is_demo: true });
      add(d, 'Sample Landfill', 'Disposal fee (sample job)', 'Dump & disposal fees', between(65, 210));
      if (rand() > 0.35) add(d, 'Sample Truck Rental', 'Box truck, 1 day (sample)', 'Truck rental', between(110, 160));
      timeEntries.push({ id: newId(), work_date: d, hours: between(4, 8).toFixed(2), hourly_rate: '20.00', is_demo: true });
      if (price > 800) timeEntries.push({ id: newId(), work_date: d, hours: between(4, 7).toFixed(2), hourly_rate: '18.50', is_demo: true });
    }

    add(day(4), 'Sample Gas Station', 'Fuel', 'Fuel', between(90, 180));
    add(day(18), 'Sample Gas Station', 'Fuel', 'Fuel', between(80, 160));
    add(day(9), 'Sample Hardware', 'Contractor bags, gloves, straps', 'Supplies', between(35, 95));
    if (m % 3 === 1) add(day(12), 'Sample Print Shop', 'Door hangers & flyers', 'Advertising & marketing', between(60, 180));
    if (m % 4 === 2) add(day(22), 'Sample Auto Care', 'Oil change & inspection', 'Vehicle repairs & maintenance', between(85, 240));
    if (rand() > 0.6) add(day(16), 'Sample Diner', 'Crew lunch', 'Meals', between(28, 64));
  }

  // Recurring charges, already posted up to last month so a few are due now.
  const recurring = [
    { vendor: 'Sample Insurance Co.', description: 'General liability policy (sample)', category: 'Insurance', amount: 145, frequency: 'monthly', day: 15, method: 'bank_transfer' },
    { vendor: 'Sample Mobile', description: 'Business phone line (sample)', category: 'Phone & internet', amount: 55, frequency: 'monthly', day: 20, method: 'card' },
    { vendor: 'Sample Software', description: 'Website, email & storage (sample)', category: 'Software & subscriptions', amount: 18, frequency: 'monthly', day: 2, method: 'card' },
  ].map((r) => {
    const start = toISODate(new Date(today.getFullYear(), today.getMonth() - 14, r.day));
    const row = {
      id: newId(), vendor: r.vendor, description: r.description, category_id: cat(r.category), amount: r.amount.toFixed(2),
      payment_method: r.method, frequency: r.frequency, start_date: start, end_date: null, occurrences_posted: 0,
      next_due_date: start, active: true, notes: null, is_demo: true,
    };
    // Post every charge before this month.
    const monthStart = toISODate(new Date(today.getFullYear(), today.getMonth(), 1));
    while (row.next_due_date < monthStart) {
      expenses.push({
        id: newId(), expense_date: row.next_due_date, vendor: row.vendor, description: row.description, category_id: row.category_id,
        amount: row.amount, payment_method: row.payment_method, notes: null, recurring_expense_id: row.id, is_demo: true, created_at: stamp,
      });
      row.occurrences_posted += 1;
      row.next_due_date = recurrenceDate(row.start_date, row.frequency, row.occurrences_posted);
    }
    return row;
  });

  expenses.sort((a, b) => (a.expense_date < b.expense_date ? 1 : -1));
  return { categories, expenses, recurring, payments, timeEntries };
}
