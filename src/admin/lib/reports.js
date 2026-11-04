// Year-end numbers for the Reports page and the tax-year export pack. All cents.
// Revenue is counted when money is received (deposits and payments, minus refunds).

import { toCsv } from './csv.js';
import { MONTHS_SHORT, comparisonRanges } from './dates.js';
import { toCents } from './money.js';
import { customerTypeLabel, jobStatus, paymentCents } from './jobs.js';
import { wageCents } from './employees.js';
import { change, monthly, totals } from './summary.js';

const dollars = (cents) => (cents / 100).toFixed(2);
const inYear = (d, year) => Boolean(d) && d.startsWith(`${year}-`);

export function yearReport({ year, expenses, payments, timeEntries, categories, jobs, customers, financials, prev }) {
  const range = { from: `${year}-01-01`, to: `${year}-12-31` };
  const sum = totals({ expenses, payments, timeEntries }, range);
  // Like-for-like: a year in progress is compared with last year up to the same date.
  const compare = comparisonRanges(range);
  const soFar = totals({ expenses, payments, timeEntries }, compare.current);
  const prevSum = totals(prev, compare.previous);
  const deltas = Object.fromEntries(['revenue', 'expenses', 'labor', 'profit'].map((k) => [k, change(soFar[k], prevSum[k])]));
  const months = monthly({ expenses, payments, timeEntries }, year);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const finByJob = new Map(financials.map((f) => [f.job_id, f]));

  // Expenses grouped by suggested tax category, then by the category's own name.
  const tax = new Map();
  for (const e of expenses) {
    const cat = categoryById.get(e.category_id);
    const key = cat?.tax_category || 'Not set';
    const group = tax.get(key) ?? { name: key, cents: 0, categories: new Map() };
    group.cents += toCents(e.amount);
    const catName = cat?.name ?? 'Uncategorized';
    group.categories.set(catName, (group.categories.get(catName) ?? 0) + toCents(e.amount));
    tax.set(key, group);
  }
  const byTaxCategory = [...tax.values()].sort((a, b) => b.cents - a.cents);

  // Who the money came from.
  const byCustomer = new Map();
  const byType = new Map();
  for (const p of payments) {
    const customer = customerById.get(jobById.get(p.job_id)?.customer_id);
    const key = customer?.id ?? 'none';
    byCustomer.set(key, { name: customer?.full_name ?? 'No customer on the job', cents: (byCustomer.get(key)?.cents ?? 0) + paymentCents(p) });
    const type = customer?.customer_type ? customerTypeLabel(customer.customer_type) : 'Not specified';
    byType.set(type, (byType.get(type) ?? 0) + paymentCents(p));
  }
  const topCustomers = [...byCustomer.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.cents - a.cents).slice(0, 5);
  const revenueByType = [...byType.entries()].map(([name, cents]) => ({ id: name, name, cents })).filter((x) => x.cents > 0).sort((a, b) => b.cents - a.cents);

  // Jobs completed this year.
  const completed = jobs.filter((j) => j.status === 'completed' && inYear(j.completed_date || j.scheduled_date, year));
  const priced = completed.map((j) => finByJob.get(j.id)?.agreed_price).filter((v) => v !== null && v !== undefined && v !== '');
  const averagePrice = priced.length ? Math.round(priced.reduce((s, v) => s + toCents(v), 0) / priced.length) : null;

  return {
    year, sum, prevSum, deltas, months, byTaxCategory, topCustomers, revenueByType,
    completedJobs: completed.length,
    averagePrice,
    margin: sum.revenue > 0 ? (sum.profit / sum.revenue) * 100 : null,
  };
}

// The files in the tax-year export pack: [{ name, label, text }].
export function taxPackFiles({ year, report, expenses, payments, timeEntries, categories, jobs, customers, financials, employees, demoRows }) {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const finByJob = new Map(financials.map((f) => [f.job_id, f]));
  const byDate = (key) => (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);
  const demoCol = { label: 'Demo data', value: (r) => (r.is_demo ? 'Yes' : '') };

  const pnlRows = [...report.months.map((m, i) => ({ label: `${MONTHS_SHORT[i]} ${year}`, ...m })), { label: `Total ${year}`, ...report.sum }];
  const pnl = toCsv(
    [
      { label: 'Month', value: (r) => r.label },
      { label: 'Revenue (payments received)', value: (r) => dollars(r.revenue) },
      { label: 'Expenses', value: (r) => dollars(r.expenses) },
      { label: 'Labor (estimated gross wages)', value: (r) => dollars(r.labor) },
      { label: 'Net profit', value: (r) => dollars(r.profit) },
    ],
    pnlRows,
  );

  const income = toCsv(
    [
      { label: 'Date received', value: (p) => p.received_on },
      { label: 'Customer', value: (p) => customerById.get(jobById.get(p.job_id)?.customer_id)?.full_name ?? '' },
      { label: 'Job', value: (p) => jobById.get(p.job_id)?.title ?? '' },
      { label: 'Type', value: (p) => ({ deposit: 'Deposit', payment: 'Payment', refund: 'Refund' })[p.kind] },
      { label: 'Paid with', value: (p) => p.method ?? '' },
      { label: 'Amount', value: (p) => dollars(paymentCents(p)) },
      { label: 'Notes', value: (p) => p.notes ?? '' },
      demoCol,
    ],
    [...payments].sort(byDate('received_on')),
  );

  const expenseCsv = toCsv(
    [
      { label: 'Date', value: (e) => e.expense_date },
      { label: 'Vendor', value: (e) => e.vendor ?? '' },
      { label: 'Description', value: (e) => e.description },
      { label: 'Category', value: (e) => categoryById.get(e.category_id)?.name ?? '' },
      { label: 'Tax category (suggested)', value: (e) => categoryById.get(e.category_id)?.tax_category ?? '' },
      { label: 'Amount', value: (e) => Number(e.amount).toFixed(2) },
      { label: 'Paid with', value: (e) => e.payment_method ?? '' },
      { label: 'Job', value: (e) => jobById.get(e.job_id)?.title ?? '' },
      { label: 'Recurring', value: (e) => (e.recurring_expense_id ? 'Yes' : '') },
      { label: 'Notes', value: (e) => e.notes ?? '' },
      demoCol,
    ],
    [...expenses].sort(byDate('expense_date')),
  );

  const taxRows = report.byTaxCategory.flatMap((g) => [
    ...[...g.categories.entries()].map(([name, cents]) => ({ tax: g.name, name, cents })),
    { tax: g.name, name: `Subtotal: ${g.name}`, cents: g.cents },
  ]);
  const taxCsv = toCsv(
    [
      { label: 'Tax category (suggested)', value: (r) => r.tax },
      { label: 'Category', value: (r) => r.name },
      { label: 'Total', value: (r) => dollars(r.cents) },
    ],
    [...taxRows, { tax: 'All expenses', name: `Total ${year}`, cents: report.sum.expenses }],
  );

  const hours = toCsv(
    [
      { label: 'Date', value: (t) => t.work_date },
      { label: 'Crew member', value: (t) => employeeById.get(t.employee_id)?.full_name ?? '' },
      { label: 'Job', value: (t) => jobById.get(t.job_id)?.title ?? '' },
      { label: 'Hours', value: (t) => Number(t.hours).toFixed(2) },
      { label: 'Hourly rate', value: (t) => (t.hourly_rate === null ? '' : Number(t.hourly_rate).toFixed(2)) },
      { label: 'Estimated gross wages', value: (t) => dollars(wageCents(t)) },
      { label: 'Status', value: (t) => (t.status === 'approved' ? 'Approved' : 'Needs approval') },
      demoCol,
    ],
    [...timeEntries].sort(byDate('work_date')),
  );

  // Jobs with any activity this year: scheduled, completed or paid in the year.
  const paidJobIds = new Set(payments.map((p) => p.job_id));
  const yearJobs = jobs.filter((j) => inYear(j.scheduled_date, year) || inYear(j.completed_date, year) || paidJobIds.has(j.id));
  const sumBy = (rows, key, pick) => rows.reduce((m, r) => m.set(r[key], (m.get(r[key]) ?? 0) + pick(r)), new Map());
  const paidByJob = sumBy(payments, 'job_id', paymentCents);
  const costByJob = sumBy(expenses.filter((e) => e.job_id), 'job_id', (e) => toCents(e.amount));
  const laborByJob = sumBy(timeEntries.filter((t) => t.job_id), 'job_id', wageCents);
  const jobsCsv = toCsv(
    [
      { label: 'Job', value: (j) => j.title },
      { label: 'Customer', value: (j) => customerById.get(j.customer_id)?.full_name ?? '' },
      { label: 'Status', value: (j) => jobStatus(j.status).label },
      { label: 'Scheduled', value: (j) => j.scheduled_date ?? '' },
      { label: 'Completed', value: (j) => j.completed_date ?? '' },
      { label: 'Agreed price', value: (j) => (finByJob.get(j.id)?.agreed_price == null ? '' : Number(finByJob.get(j.id).agreed_price).toFixed(2)) },
      { label: `Received in ${year}`, value: (j) => dollars(paidByJob.get(j.id) ?? 0) },
      { label: `Job costs in ${year}`, value: (j) => dollars(costByJob.get(j.id) ?? 0) },
      { label: `Labor in ${year} (estimated)`, value: (j) => dollars(laborByJob.get(j.id) ?? 0) },
      { label: `Profit in ${year}`, value: (j) => dollars((paidByJob.get(j.id) ?? 0) - (costByJob.get(j.id) ?? 0) - (laborByJob.get(j.id) ?? 0)) },
      demoCol,
    ],
    [...yearJobs].sort((a, b) => ((a.completed_date || a.scheduled_date || '') < (b.completed_date || b.scheduled_date || '') ? -1 : 1)),
  );

  const readme = [
    `Hoard Hounds LLC: records for ${year}`,
    `Created ${new Date().toLocaleString('en-US')} from the Hoard Hounds admin dashboard.`,
    '',
    'Files:',
    '  01-profit-and-loss-by-month.csv   Revenue, expenses, estimated labor and net profit by month, with a yearly total.',
    '  02-income-payments-received.csv   Every deposit, payment and refund received, with customer and job.',
    '  03-expenses.csv                   Every expense, with category, suggested tax category and linked job.',
    '  04-expenses-by-tax-category.csv   Expense totals grouped by suggested tax category.',
    '  05-hours-and-estimated-wages.csv  Crew hours, hourly rates and estimated gross wages.',
    '  06-jobs.csv                       Jobs with activity this year and what each earned and cost.',
    '',
    'Please note:',
    '  - Revenue is counted when money is received (cash basis): deposits and payments, minus refunds.',
    '  - Tax categories are suggestions to help organize records, not tax advice. Please confirm with your tax preparer.',
    '  - Labor is an ESTIMATE: hours x hourly rate, before taxes and deductions. It is not payroll.',
    '    Actual wages, payroll taxes and contractor payments should come from your payroll provider or bank records.',
    '  - If wages were also paid through a payroll service and entered as expenses, labor may be counted twice in the profit figures.',
    ...(demoRows ? ['', `  ! ${demoRows} rows are marked "Demo data". They are sample records, not real business activity. Remove them before using these files.`] : []),
    '',
  ].join('\r\n');

  const folder = `hoard-hounds-${year}`;
  // The byte-order mark helps Excel read the CSVs as UTF-8.
  const bom = (text) => `\ufeff${text}`;
  return [
    { name: `${folder}/README.txt`, label: 'Read me first', text: readme },
    { name: `${folder}/01-profit-and-loss-by-month.csv`, label: 'Profit & loss by month', text: bom(pnl) },
    { name: `${folder}/02-income-payments-received.csv`, label: 'Income: payments received', text: bom(income) },
    { name: `${folder}/03-expenses.csv`, label: 'All expenses', text: bom(expenseCsv) },
    { name: `${folder}/04-expenses-by-tax-category.csv`, label: 'Expenses by tax category', text: bom(taxCsv) },
    { name: `${folder}/05-hours-and-estimated-wages.csv`, label: 'Hours & estimated wages', text: bom(hours) },
    { name: `${folder}/06-jobs.csv`, label: 'Jobs', text: bom(jobsCsv) },
  ];
}
