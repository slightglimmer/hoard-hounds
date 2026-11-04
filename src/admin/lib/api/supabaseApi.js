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

const EXPENSE_FIELDS = ['expense_date', 'vendor', 'description', 'category_id', 'amount', 'payment_method', 'notes'];
const RECURRING_FIELDS = ['vendor', 'description', 'category_id', 'amount', 'payment_method', 'frequency', 'start_date', 'end_date', 'active', 'notes'];
const CATEGORY_FIELDS = ['name', 'tax_category', 'active', 'sort_order'];
const PRICE_FIELDS = ['name', 'description', 'unit', 'unit_price', 'minimum_charge', 'active', 'sort_order'];
// Totals are left out on purpose: the database calculates them.
const ESTIMATE_FIELDS = [
  'customer_name', 'customer_email', 'customer_phone', 'property_address', 'status', 'estimate_date', 'valid_until',
  'line_items', 'discount_type', 'discount_value', 'deposit_amount', 'notes', 'terms',
];

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

export const supabaseApi = {
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
};
