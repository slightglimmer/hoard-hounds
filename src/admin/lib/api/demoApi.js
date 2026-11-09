// In-memory stand-in for the database, used only in demo mode. It follows the
// same rules as the real tables (derived next due dates, no duplicate recurring
// charges, categories in use can't be removed) so the demo behaves like the real thing.

import { buildDemoData, newId } from './demoData.js';
import { recurrenceDate, dueDates } from '../recurrence.js';
import { computeTotals } from '../estimate.js';

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
  async features() {
    return { inquiries: true };
  },

  // ---- Inquiries ----
  async listInquiries() {
    await wait();
    return copy([...store.inquiries].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
  },
  async countNewInquiries() {
    return store.inquiries.filter((i) => i.status === 'new').length;
  },
  async getInquiry(id) {
    await wait();
    const inquiry = store.inquiries.find((i) => i.id === id);
    if (!inquiry) throw new Error('That request no longer exists.');
    return copy({
      inquiry,
      photos: store.inquiryPhotos.filter((p) => p.inquiry_id === id),
      estimates: store.estimates.filter((e) => e.inquiry_id === id).map(({ id: eid, number, status, total }) => ({ id: eid, number, status, total })),
    });
  },
  async saveInquiry(row) {
    await wait();
    const found = store.inquiries.find((i) => i.id === row.id);
    if (!found) throw new Error('That request no longer exists.');
    for (const k of ['status', 'admin_notes', 'customer_id', 'job_id']) if (k in row) found[k] = row[k] === '' ? null : row[k];
    return copy(found);
  },
  async deleteInquiry(id) {
    await wait();
    store.inquiries = store.inquiries.filter((i) => i.id !== id);
    store.inquiryPhotos = store.inquiryPhotos.filter((p) => p.inquiry_id !== id);
    for (const e of store.estimates) if (e.inquiry_id === id) e.inquiry_id = null;
  },

  // ---- Internal costing ----
  async getEstimateCosting(estimateId) {
    await wait();
    return copy(store.costing.find((c) => c.estimate_id === estimateId) ?? null);
  },
  async saveEstimateCosting(row) {
    await wait();
    const i = store.costing.findIndex((c) => c.estimate_id === row.estimate_id);
    const saved = { ...(i >= 0 ? store.costing[i] : { is_demo: true }), ...row };
    if (i >= 0) store.costing[i] = saved;
    else store.costing.push(saved);
    return copy(saved);
  },

  // ---- Dumpsters ----
  async listDumpsters(jobId) {
    await wait();
    return copy(store.dumpsters.filter((d) => d.job_id === jobId).sort((a, b) => ((a.delivery_date || '9') < (b.delivery_date || '9') ? -1 : 1)));
  },
  async listDumpsterProviders() {
    const seen = new Map();
    for (const d of store.dumpsters) if (d.provider_name && !seen.has(d.provider_name)) seen.set(d.provider_name, d.provider_contact);
    return [...seen].map(([name, contact]) => ({ name, contact }));
  },
  async saveDumpster(row) {
    await wait();
    if (row.delivery_date && row.expected_pickup_date && row.expected_pickup_date < row.delivery_date) throw new Error('One of the values isn’t allowed. Please check the form.');
    return copy(upsert(store.dumpsters, row, {}));
  },
  async deleteDumpster(id) {
    await wait();
    store.dumpsters = store.dumpsters.filter((d) => d.id !== id);
  },

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
    for (const d of store.dumpsters) {
      if (d.base_expense_id === id) d.base_expense_id = null;
      if (d.overage_expense_id === id) d.overage_expense_id = null;
    }
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
  async listPaymentsDetailed(range) {
    await wait();
    return copy(store.payments.filter((p) => inRange(p.received_on, range)));
  },
  async listTimeEntries(range) {
    await wait();
    return copy(store.timeEntries.filter((t) => inRange(t.work_date, range)));
  },

  async listPriceItems() {
    await wait();
    return copy([...store.priceItems].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
  },
  async savePriceItem(row) {
    await wait();
    const max = Math.max(0, ...store.priceItems.map((p) => p.sort_order));
    return copy(upsert(store.priceItems, row, { active: true, sort_order: max + 10 }));
  },
  async deletePriceItem(id) {
    await wait();
    store.priceItems = store.priceItems.filter((p) => p.id !== id);
  },

  async listEstimates() {
    await wait();
    return copy([...store.estimates].sort((a, b) => b.number - a.number));
  },
  async getEstimate(id) {
    await wait();
    const found = store.estimates.find((e) => e.id === id);
    if (!found) throw new Error('That estimate no longer exists.');
    return copy(found);
  },
  async saveEstimate(row) {
    await wait();
    const isNew = !row.id;
    const saved = upsert(store.estimates, row, isNew
      ? {
          number: Math.max(1000, ...store.estimates.map((e) => e.number)) + 1, customer_id: null, job_id: null, share_token: null, accepted_at: null,
          accepted_via: null, inquiry_id: null, scope_of_work: null, dumpster_count: null, dumpster_size_yards: null, dumpster_weight_allowance_tons: null,
          dumpster_rental_days: null, overage_rate_per_ton: null, extra_day_rate: null, overage_terms: null,
        }
      : {});
    // Same as the database trigger: totals are always recalculated.
    const t = computeTotals(saved.line_items, saved.discount_type, saved.discount_value);
    Object.assign(saved, { subtotal: (t.subtotal / 100).toFixed(2), discount_total: (t.discount / 100).toFixed(2), total: (t.total / 100).toFixed(2) });
    return copy(saved);
  },
  async deleteEstimate(id) {
    await wait();
    store.estimates = store.estimates.filter((e) => e.id !== id);
    store.costing = store.costing.filter((c) => c.estimate_id !== id);
  },

  async listCustomers() {
    await wait();
    return copy([...store.customers].sort((a, b) => a.full_name.localeCompare(b.full_name)));
  },
  async saveCustomer(row) {
    await wait();
    return copy(upsert(store.customers, row, {}));
  },
  async deleteCustomer(id) {
    await wait();
    store.customers = store.customers.filter((c) => c.id !== id);
    for (const j of store.jobs) if (j.customer_id === id) j.customer_id = null;
    for (const i of store.inquiries) if (i.customer_id === id) i.customer_id = null;
  },

  async listJobsWithMoney() {
    await wait();
    return copy({
      jobs: [...store.jobs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
      financials: store.financials,
      payments: store.payments.filter((p) => p.job_id),
      expenses: store.expenses.filter((e) => e.job_id),
      timeEntries: store.timeEntries.filter((t) => t.job_id),
      customers: store.customers,
    });
  },
  async getJob(id) {
    await wait();
    const job = store.jobs.find((j) => j.id === id);
    if (!job) throw new Error('That job no longer exists.');
    return copy({
      job,
      financials: store.financials.find((f) => f.job_id === id) ?? null,
      payments: store.payments.filter((p) => p.job_id === id).sort((a, b) => (a.received_on < b.received_on ? -1 : 1)),
      expenses: store.expenses.filter((e) => e.job_id === id).sort((a, b) => (a.expense_date < b.expense_date ? -1 : 1)),
      timeEntries: store.timeEntries.filter((t) => t.job_id === id),
      estimates: store.estimates.filter((e) => e.job_id === id).map(({ id: eid, number, total, status }) => ({ id: eid, number, total, status })),
      assignments: store.assignments.filter((a) => a.job_id === id).map((a) => ({ employee_id: a.employee_id })),
    });
  },
  async saveJob(row) {
    await wait();
    return copy(upsert(store.jobs, row, { status: 'lead' }));
  },
  async deleteJob(id) {
    await wait();
    // Same as the database: payments and money details go with the job;
    // linked expenses, hours and estimates are kept, just unlinked.
    store.jobs = store.jobs.filter((j) => j.id !== id);
    store.dumpsters = store.dumpsters.filter((d) => d.job_id !== id);
    for (const i of store.inquiries) if (i.job_id === id) i.job_id = null;
    store.financials = store.financials.filter((f) => f.job_id !== id);
    store.payments = store.payments.filter((p) => p.job_id !== id);
    store.assignments = store.assignments.filter((a) => a.job_id !== id);
    for (const list of [store.expenses, store.timeEntries, store.estimates]) for (const r of list) if (r.job_id === id) r.job_id = null;
  },
  async saveJobFinancials(row) {
    await wait();
    const existing = store.financials.find((f) => f.job_id === row.job_id);
    if (existing) Object.assign(existing, row);
    else store.financials.push({ is_demo: true, ...row });
    return copy(store.financials.find((f) => f.job_id === row.job_id));
  },
  async savePayment(row) {
    await wait();
    return copy(upsert(store.payments, row, {}));
  },
  async deletePayment(id) {
    await wait();
    store.payments = store.payments.filter((p) => p.id !== id);
  },

  async listEmployees() {
    await wait();
    return copy([...store.employees].sort((a, b) => a.full_name.localeCompare(b.full_name)));
  },
  async saveEmployee(row) {
    await wait();
    return copy(upsert(store.employees, row, { active: true }));
  },
  async deleteEmployee(id) {
    await wait();
    // Same as the database: an employee with logged hours can't be deleted.
    if (store.timeEntries.some((t) => t.employee_id === id)) throw new Error('This item is still in use by other records, so it can’t be deleted.');
    store.employees = store.employees.filter((e) => e.id !== id);
    store.assignments = store.assignments.filter((a) => a.employee_id !== id);
  },
  async employeeHasHours(id) {
    await wait();
    return store.timeEntries.some((t) => t.employee_id === id);
  },

  async listHours(range) {
    await wait();
    return copy(store.timeEntries.filter((t) => inRange(t.work_date, range)).sort((a, b) => (a.work_date < b.work_date ? 1 : -1)));
  },
  async saveTimeEntry(row) {
    await wait();
    // Same as the database trigger: no rate given means the employee's current rate.
    const filled = { ...row };
    if (filled.hourly_rate === null || filled.hourly_rate === undefined || filled.hourly_rate === '') {
      filled.hourly_rate = store.employees.find((e) => e.id === filled.employee_id)?.hourly_rate ?? null;
    }
    return copy(upsert(store.timeEntries, filled, { status: 'approved' }));
  },
  async deleteTimeEntry(id) {
    await wait();
    store.timeEntries = store.timeEntries.filter((t) => t.id !== id);
  },
  async approveTimeEntries(ids) {
    await wait();
    let n = 0;
    for (const t of store.timeEntries) if (ids.includes(t.id) && t.status !== 'approved') { t.status = 'approved'; n += 1; }
    return n;
  },

  async listPaymentRequests(jobId) {
    await wait();
    return copy(store.paymentRequests.filter((r) => r.job_id === jobId).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
  },
  async requestPayment({ job_id, kind, amount_cents, description }) {
    await wait(500);
    const request = {
      id: newId(), job_id, kind, amount: (amount_cents / 100).toFixed(2), description: description || null,
      stripe_payment_link_id: `plink_demo_${Date.now()}`, url: `https://buy.stripe.com/demo_${Math.random().toString(36).slice(2, 10)}`,
      status: 'open', job_payment_id: null, is_demo: true, created_at: new Date().toISOString(),
    };
    store.paymentRequests.push(request);
    return copy(request);
  },
  async cancelPaymentRequest(id) {
    await wait();
    const r = store.paymentRequests.find((x) => x.id === id);
    if (r?.status === 'open') r.status = 'cancelled';
  },
  // Demo only: pretends the customer paid, the way the Stripe webhook records it.
  async simulateOnlinePayment(id) {
    await wait(400);
    const r = store.paymentRequests.find((x) => x.id === id);
    if (!r || r.status !== 'open') return;
    const payment = {
      id: newId(), job_id: r.job_id, received_on: new Date().toLocaleDateString('en-CA'), kind: r.kind, amount: r.amount,
      method: 'other', notes: 'Paid online with Klarna through Stripe (demo)', is_demo: true, created_at: new Date().toISOString(),
    };
    store.payments.push(payment);
    Object.assign(r, { status: 'paid', job_payment_id: payment.id });
  },

  async getQuoteSettings() {
    await wait();
    return copy(store.settings);
  },
  async saveQuoteSettings(row) {
    await wait();
    const keys = ['quote_message', 'default_terms', 'default_valid_days', 'default_deposit', 'default_overage_terms', 'default_labor_rate', 'default_contingency_pct', 'default_target_margin_pct'];
    for (const k of keys) if (k in row) store.settings[k] = row[k];
    return copy(store.settings);
  },
  // Demo only: pretends the customer opened the quote link and accepted it,
  // the way the database's accept_shared_estimate() and the Stripe webhook do.
  async simulateQuoteAcceptance(id, option) {
    await wait(400);
    const e = store.estimates.find((x) => x.id === id);
    if (!e) return;
    if (!e.job_id) {
      let customerId = e.customer_id;
      if (!customerId) {
        customerId = newId();
        store.customers.push({ id: customerId, full_name: e.customer_name, company: null, customer_type: null, email: e.customer_email, phone: e.customer_phone,
          notes: `Added when they accepted quote #${e.number} online`, is_demo: true, created_at: new Date().toISOString() });
      }
      const jobId = newId();
      store.jobs.push({ id: jobId, customer_id: customerId, title: `${e.customer_name} cleanout`, property_address: e.property_address, service_type: null,
        status: 'scheduled', scheduled_date: null, completed_date: null, crew_notes: e.notes, is_demo: true, created_at: new Date().toISOString() });
      store.financials.push({ job_id: jobId, quoted_amount: e.total, agreed_price: e.total, admin_notes: `Accepted online, quote #${e.number}`, is_demo: true });
      Object.assign(e, { job_id: jobId, customer_id: customerId });
    }
    Object.assign(e, { status: 'accepted', accepted_at: e.accepted_at || new Date().toISOString(), accepted_via: e.accepted_via || option });
    if (option !== 'later') {
      const amount = option === 'deposit' ? Math.min(Number(e.deposit_amount || 0), Number(e.total)) : Number(e.total);
      store.payments.push({ id: newId(), job_id: e.job_id, received_on: new Date().toLocaleDateString('en-CA'), kind: option === 'deposit' ? 'deposit' : 'payment',
        amount: amount.toFixed(2), method: 'other', notes: 'Paid online with Klarna through Stripe (demo)', is_demo: true, created_at: new Date().toISOString() });
    }
  },

  async listJobsBrief() {
    await wait();
    return copy(store.jobs.map(({ id, title, status, scheduled_date, completed_date }) => ({ id, title, status, scheduled_date, completed_date })));
  },
  async assignEmployee(jobId, employeeId) {
    await wait();
    if (store.assignments.some((a) => a.job_id === jobId && a.employee_id === employeeId)) throw new Error('That would create a duplicate.');
    store.assignments.push({ job_id: jobId, employee_id: employeeId, is_demo: true });
  },
  async unassignEmployee(jobId, employeeId) {
    await wait();
    store.assignments = store.assignments.filter((a) => !(a.job_id === jobId && a.employee_id === employeeId));
  },

  async hasDemoData() {
    return true;
  },
  async clearDemoData() {
    throw new Error('This is a demo with sample data only. There’s nothing saved to clear.');
  },
};
