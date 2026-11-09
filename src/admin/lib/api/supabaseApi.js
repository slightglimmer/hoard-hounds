import { supabase } from '../supabase.js';

// Every call here runs as the signed-in user, so the database's row-level
// security rules decide what is allowed. Nothing here can bypass them.

const PAGE_SIZE = 1000; // Supabase returns at most 1000 rows per request.

function friendlyError(error) {
  const messages = {
    42501: 'You don’t have permission to do that. Try signing out and back in.',
    23503: 'This item is still in use by other records, so it can’t be deleted.',
    23505: 'That would create a duplicate.',
    23514: 'One of the values isn’t allowed. Please check the form.',
  };
  const err = new Error(messages[error.code] || error.message || 'Something went wrong.');
  err.code = error.code;
  return err;
}

function unwrap({ data, error }) {
  if (error) throw friendlyError(error);
  return data;
}

async function fetchAll(buildQuery) {
  const rows = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const data = unwrap(await buildQuery().range(start, start + PAGE_SIZE - 1));
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

// Only these fields are ever sent; ids, owners, demo flags and computed columns
// are set by the database.
const pick = (obj, fields) => Object.fromEntries(fields.filter((f) => f in obj).map((f) => [f, obj[f] === '' ? null : obj[f]]));

const EXPENSE_FIELDS = ['expense_date', 'vendor', 'description', 'category_id', 'amount', 'payment_method', 'notes', 'job_id'];
const RECURRING_FIELDS = ['vendor', 'description', 'category_id', 'amount', 'payment_method', 'frequency', 'start_date', 'end_date', 'active', 'notes'];
const CATEGORY_FIELDS = ['name', 'tax_category', 'active', 'sort_order'];
const PRICE_FIELDS = ['name', 'description', 'unit', 'unit_price', 'minimum_charge', 'active', 'sort_order'];
// Totals are left out on purpose: the database calculates them.
const ESTIMATE_FIELDS = [
  'customer_name', 'customer_email', 'customer_phone', 'property_address', 'status', 'estimate_date', 'valid_until',
  'line_items', 'discount_type', 'discount_value', 'deposit_amount', 'notes', 'terms', 'customer_id', 'job_id', 'share_token',
  // Inquiries & dumpster update (migration 6)
  'inquiry_id', 'scope_of_work', 'dumpster_count', 'dumpster_size_yards', 'dumpster_weight_allowance_tons', 'dumpster_rental_days',
  'overage_rate_per_ton', 'extra_day_rate', 'overage_terms',
];
const SETTINGS_FIELDS = [
  'quote_message', 'default_terms', 'default_valid_days', 'default_deposit',
  'default_overage_terms', 'default_labor_rate', 'default_contingency_pct', 'default_target_margin_pct',
];
const INQUIRY_FIELDS = ['status', 'admin_notes', 'customer_id', 'job_id'];
const COSTING_FIELDS = ['estimate_id', 'dumpster_cost', 'labor_hours', 'labor_rate', 'other_costs', 'contingency_pct', 'target_margin_pct', 'notes'];
const DUMPSTER_FIELDS = [
  'job_id', 'provider_name', 'provider_contact', 'size_yards', 'base_cost', 'included_days', 'weight_allowance_tons', 'overage_rate_per_ton',
  'extra_day_rate', 'delivery_date', 'expected_pickup_date', 'actual_pickup_date', 'placement_notes', 'permit_required', 'permit_notes',
  'confirmation_number', 'actual_overage_charges', 'base_expense_id', 'overage_expense_id', 'notes',
];
const PHOTO_BUCKET = 'inquiry-photos';
const NOT_SET_UP = ['42P01', 'PGRST205', '42703', 'PGRST204'];
const CUSTOMER_FIELDS = ['full_name', 'company', 'customer_type', 'email', 'phone', 'notes'];
const JOB_FIELDS = ['customer_id', 'title', 'property_address', 'service_type', 'status', 'scheduled_date', 'completed_date', 'crew_notes'];
const FINANCIAL_FIELDS = ['job_id', 'quoted_amount', 'agreed_price', 'admin_notes'];
const PAYMENT_FIELDS = ['job_id', 'received_on', 'kind', 'amount', 'method', 'notes'];
const EMPLOYEE_FIELDS = ['full_name', 'email', 'phone', 'hourly_rate', 'active', 'hired_on', 'notes'];
const TIME_FIELDS = ['employee_id', 'job_id', 'work_date', 'hours', 'hourly_rate', 'status', 'notes'];

async function save(table, fields, row) {
  const values = pick(row, fields);
  const query = row.id
    ? supabase.from(table).update(values).eq('id', row.id)
    : supabase.from(table).insert(values);
  return unwrap(await query.select().single());
}

async function remove(table, id) {
  unwrap(await supabase.from(table).delete().eq('id', id));
}

// Calls the stripe-payments server function (it holds the Stripe secret key, not the website).
async function callPayments(body) {
  const { data, error } = await supabase.functions.invoke('stripe-payments', { body });
  if (!error) return data;
  let message = '';
  try {
    message = (await error.context.json()).error;
  } catch {
    // No readable error body: most likely the function hasn't been set up.
  }
  throw new Error(message || 'Online payments aren’t set up yet. See “Online payments” in docs/ADMIN_SETUP.md.');
}

// Whether the inquiries & dumpster database update (migration 6) has been run.
let featuresPromise;
function features() {
  featuresPromise ??= supabase
    .from('inquiries')
    .select('id')
    .limit(1)
    .then(({ error }) => {
      if (error) featuresPromise = undefined; // not set up yet (or offline): check again next time
      return { inquiries: !error };
    });
  return featuresPromise;
}

export const supabaseApi = {
  features,
  listCategories: () =>
    fetchAll(() => supabase.from('expense_categories').select('*').order('sort_order').order('name').order('id')),
  saveCategory: (row) => save('expense_categories', CATEGORY_FIELDS, row),

  listExpenses: ({ from, to }) =>
    fetchAll(() =>
      supabase
        .from('expenses')
        .select('*')
        .gte('expense_date', from)
        .lte('expense_date', to)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id'),
    ),
  saveExpense: (row) => save('expenses', EXPENSE_FIELDS, row),
  deleteExpense: (id) => remove('expenses', id),

  listRecurring: () =>
    fetchAll(() => supabase.from('recurring_expenses').select('*').order('next_due_date').order('id')),
  saveRecurring: (row) => save('recurring_expenses', RECURRING_FIELDS, row),
  deleteRecurring: (id) => remove('recurring_expenses', id),
  postDueRecurring: async (asOf) => unwrap(await supabase.rpc('post_due_recurring_expenses', { p_as_of: asOf })),

  listPayments: ({ from, to }) =>
    fetchAll(() =>
      supabase.from('job_payments').select('id, received_on, kind, amount, is_demo').gte('received_on', from).lte('received_on', to).order('id'),
    ),
  listPaymentsDetailed: ({ from, to }) =>
    fetchAll(() => supabase.from('job_payments').select('*').gte('received_on', from).lte('received_on', to).order('received_on').order('id')),
  listTimeEntries: ({ from, to }) =>
    fetchAll(() =>
      supabase.from('time_entries').select('id, work_date, hours, hourly_rate, is_demo').gte('work_date', from).lte('work_date', to).order('id'),
    ),

  async hasDemoData() {
    const tables = ['expenses', 'recurring_expenses', 'jobs', 'employees', 'customers', 'price_items', 'estimates'];
    const counts = await Promise.all(
      tables.map(async (t) => {
        // A head request returns no rows, only the count.
        const { count, error } = await supabase.from(t).select('id', { count: 'exact', head: true }).eq('is_demo', true);
        if (error) throw friendlyError(error);
        return count ?? 0;
      }),
    );
    return counts.some((n) => n > 0);
  },
  clearDemoData: async () => unwrap(await supabase.rpc('clear_demo_data')),

  listPriceItems: () =>
    fetchAll(() => supabase.from('price_items').select('*').order('sort_order').order('name').order('id')),
  savePriceItem: (row) => save('price_items', PRICE_FIELDS, row),
  deletePriceItem: (id) => remove('price_items', id),

  listEstimates: () =>
    fetchAll(() =>
      supabase
        .from('estimates')
        .select('id, number, customer_name, property_address, status, estimate_date, valid_until, total, is_demo')
        .order('number', { ascending: false }),
    ),
  getEstimate: async (id) => unwrap(await supabase.from('estimates').select('*').eq('id', id).single()),
  saveEstimate: (row) => save('estimates', ESTIMATE_FIELDS, row),
  deleteEstimate: (id) => remove('estimates', id),

  listCustomers: () => fetchAll(() => supabase.from('customers').select('*').order('full_name').order('id')),
  saveCustomer: (row) => save('customers', CUSTOMER_FIELDS, row),
  deleteCustomer: (id) => remove('customers', id),

  // Everything the jobs list needs to show status, balances and profit.
  async listJobsWithMoney() {
    const [jobs, financials, payments, expenses, timeEntries, customers] = await Promise.all([
      fetchAll(() => supabase.from('jobs').select('*').order('created_at', { ascending: false }).order('id')),
      fetchAll(() => supabase.from('job_financials').select('*').order('job_id')),
      fetchAll(() => supabase.from('job_payments').select('*').order('id')),
      fetchAll(() => supabase.from('expenses').select('id, job_id, amount, category_id').not('job_id', 'is', null).order('id')),
      fetchAll(() => supabase.from('time_entries').select('id, job_id, hours, hourly_rate').not('job_id', 'is', null).order('id')),
      fetchAll(() => supabase.from('customers').select('*').order('full_name').order('id')),
    ]);
    return { jobs, financials, payments, expenses, timeEntries, customers };
  },
  async getJob(id) {
    const [job, financials, payments, expenses, timeEntries, estimates, assignments] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', id).single().then(unwrap),
      supabase.from('job_financials').select('*').eq('job_id', id).maybeSingle().then(unwrap),
      fetchAll(() => supabase.from('job_payments').select('*').eq('job_id', id).order('received_on').order('id')),
      fetchAll(() => supabase.from('expenses').select('*').eq('job_id', id).order('expense_date').order('id')),
      fetchAll(() => supabase.from('time_entries').select('*').eq('job_id', id).order('work_date').order('id')),
      fetchAll(() => supabase.from('estimates').select('id, number, total, status').eq('job_id', id).order('number')),
      fetchAll(() => supabase.from('job_assignments').select('employee_id').eq('job_id', id).order('employee_id')),
    ]);
    return { job, financials, payments, expenses, timeEntries, estimates, assignments };
  },
  saveJob: (row) => save('jobs', JOB_FIELDS, row),
  deleteJob: (id) => remove('jobs', id),
  saveJobFinancials: async (row) =>
    unwrap(await supabase.from('job_financials').upsert(pick(row, FINANCIAL_FIELDS), { onConflict: 'job_id' }).select().single()),
  savePayment: (row) => save('job_payments', PAYMENT_FIELDS, row),
  deletePayment: (id) => remove('job_payments', id),

  listEmployees: () => fetchAll(() => supabase.from('employees').select('*').order('full_name').order('id')),
  saveEmployee: (row) => save('employees', EMPLOYEE_FIELDS, row),
  deleteEmployee: (id) => remove('employees', id),
  async employeeHasHours(id) {
    const { count, error } = await supabase.from('time_entries').select('id', { count: 'exact', head: true }).eq('employee_id', id);
    if (error) throw friendlyError(error);
    return (count ?? 0) > 0;
  },

  listHours: ({ from, to }) =>
    fetchAll(() =>
      supabase.from('time_entries').select('*').gte('work_date', from).lte('work_date', to)
        .order('work_date', { ascending: false }).order('created_at', { ascending: false }).order('id'),
    ),
  saveTimeEntry: (row) => save('time_entries', TIME_FIELDS, row),
  deleteTimeEntry: (id) => remove('time_entries', id),
  approveTimeEntries: async (ids) => unwrap(await supabase.from('time_entries').update({ status: 'approved' }).in('id', ids).select('id')).length,

  listJobsBrief: () =>
    fetchAll(() => supabase.from('jobs').select('id, title, status, scheduled_date, completed_date').order('created_at', { ascending: false }).order('id')),
  assignEmployee: async (jobId, employeeId) =>
    unwrap(await supabase.from('job_assignments').insert({ job_id: jobId, employee_id: employeeId }).select().single()),
  // Online payments (Stripe). Returns null if the database update for them hasn't been run yet.
  async listPaymentRequests(jobId) {
    const { data, error } = await supabase.from('payment_requests').select('*').eq('job_id', jobId).order('created_at', { ascending: false });
    if (error) {
      if (NOT_SET_UP.includes(error.code)) return null;
      throw friendlyError(error);
    }
    return data;
  },
  requestPayment: (fields) => callPayments({ action: 'create', ...fields }).then((d) => d.request),
  cancelPaymentRequest: (id) => callPayments({ action: 'cancel', request_id: id }),

  // Quote template (business_settings). Returns null if the quote-links update hasn't been run yet.
  async getQuoteSettings() {
    const { data, error } = await supabase.from('business_settings').select('*').eq('id', 1).maybeSingle();
    if (error) {
      if (NOT_SET_UP.includes(error.code)) return null;
      throw friendlyError(error);
    }
    return data;
  },
  saveQuoteSettings: async (row) =>
    unwrap(await supabase.from('business_settings').upsert({ id: 1, ...pick(row, SETTINGS_FIELDS) }).select().single()),

  // ---- Inquiries (website quote requests) ----
  async listInquiries() {
    const { data, error } = await supabase
      .from('inquiries')
      .select('id, number, status, full_name, cleanout_type, property_address, created_at, photo_count, photos_failed, preferred_date, date_is_deadline, is_demo')
      .order('created_at', { ascending: false })
      .order('id');
    if (error) {
      if (NOT_SET_UP.includes(error.code)) return null;
      throw friendlyError(error);
    }
    return data;
  },
  async countNewInquiries() {
    const { count, error } = await supabase.from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'new');
    return error ? 0 : count ?? 0;
  },
  async getInquiry(id) {
    const [inquiry, photos, estimates] = await Promise.all([
      supabase.from('inquiries').select('*').eq('id', id).single().then(unwrap),
      fetchAll(() => supabase.from('inquiry_photos').select('*').eq('inquiry_id', id).order('created_at').order('id')),
      fetchAll(() => supabase.from('estimates').select('id, number, status, total').eq('inquiry_id', id).order('number')),
    ]);
    // Private bucket: short-lived signed links, only for a signed-in admin.
    let urls = [];
    if (photos.length) {
      const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(photos.map((p) => p.storage_path), 3600);
      if (!error) urls = data;
    }
    return { inquiry, estimates, photos: photos.map((p, i) => ({ ...p, url: urls[i]?.signedUrl || null })) };
  },
  saveInquiry: (row) => save('inquiries', INQUIRY_FIELDS, row),
  async deleteInquiry(id) {
    const photos = await fetchAll(() => supabase.from('inquiry_photos').select('storage_path').eq('inquiry_id', id).order('storage_path'));
    if (photos.length) {
      const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(photos.map((p) => p.storage_path));
      if (error) throw new Error('Couldn’t delete the photos. Please try again.');
    }
    await remove('inquiries', id);
  },

  // ---- Internal job costing for estimates (never shown to customers) ----
  async getEstimateCosting(estimateId) {
    const { data, error } = await supabase.from('estimate_costing').select('*').eq('estimate_id', estimateId).maybeSingle();
    if (error) {
      if (NOT_SET_UP.includes(error.code)) return null;
      throw friendlyError(error);
    }
    return data;
  },
  saveEstimateCosting: async (row) =>
    unwrap(await supabase.from('estimate_costing').upsert(pick(row, COSTING_FIELDS), { onConflict: 'estimate_id' }).select().single()),

  // ---- Dumpster rentals on a job ----
  async listDumpsters(jobId) {
    const { data, error } = await supabase.from('dumpster_rentals').select('*').eq('job_id', jobId).order('delivery_date', { nullsFirst: false }).order('created_at');
    if (error) {
      if (NOT_SET_UP.includes(error.code)) return null;
      throw friendlyError(error);
    }
    return data;
  },
  // Providers you've used before (for the name suggestions).
  async listDumpsterProviders() {
    const rows = await fetchAll(() => supabase.from('dumpster_rentals').select('provider_name, provider_contact, created_at').not('provider_name', 'is', null).order('created_at', { ascending: false }).order('id'));
    const seen = new Map();
    for (const r of rows) if (!seen.has(r.provider_name)) seen.set(r.provider_name, r.provider_contact);
    return [...seen].map(([name, contact]) => ({ name, contact }));
  },
  saveDumpster: (row) => save('dumpster_rentals', DUMPSTER_FIELDS, row),
  deleteDumpster: (id) => remove('dumpster_rentals', id),

  unassignEmployee: async (jobId, employeeId) =>
    unwrap(await supabase.from('job_assignments').delete().eq('job_id', jobId).eq('employee_id', employeeId)),
};
