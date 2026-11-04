-- =====================================================================
-- HOARD HOUNDS: ONE-TIME DATABASE SETUP
-- Copy ALL of this, paste it into Supabase's SQL Editor, and click Run.
-- (Do step 2, "add yourself as a user", BEFORE running this.)
-- =====================================================================

-- Hoard Hounds business platform: tables.
-- Security rules (row-level security) are in the next migration. Run both, in order.
--
-- Money is stored as numeric(12,2) dollars. Every data table has is_demo so sample
-- rows can be labeled in the app and removed with public.clear_demo_data().

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.app_role as enum ('admin', 'employee');
create type public.payment_method as enum ('card', 'cash', 'check', 'bank_transfer', 'other');
create type public.recurrence as enum ('weekly', 'monthly', 'quarterly', 'yearly');
create type public.job_status as enum ('lead', 'quoted', 'scheduled', 'in_progress', 'completed', 'cancelled');
create type public.time_entry_status as enum ('submitted', 'approved');
create type public.price_unit as enum ('flat', 'hour', 'load', 'item', 'cubic_yard');
create type public.payment_kind as enum ('deposit', 'payment', 'refund');

-- Keeps updated_at current on every table that has one.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- People and access
-- ---------------------------------------------------------------------------

-- One role per login. Nobody can grant themselves a role from the app:
-- admins are added with the SQL in docs/ADMIN_SETUP.md.
create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  -- Linked when the employee gets an /employee portal login. Null until then.
  user_id uuid unique references auth.users (id) on delete set null,
  full_name text not null check (length(trim(full_name)) > 0),
  email text,
  phone text,
  hourly_rate numeric(10, 2) check (hourly_rate >= 0),
  active boolean not null default true,
  hired_on date,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Customers and jobs
-- ---------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) > 0),
  company text,
  customer_type text check (
    customer_type in ('real_estate_agent', 'investor', 'landlord', 'property_manager', 'estate_representative', 'homeowner', 'other')
  ),
  email text,
  phone text,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Operational job details. Assigned employees will be able to read these in the
-- employee portal, so nothing about money lives here.
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  property_address text,
  service_type text,
  status public.job_status not null default 'lead',
  scheduled_date date,
  completed_date date,
  crew_notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Admin-only money side of a job. Revenue is counted from job_payments (money
-- actually received); job costs such as dump fees and truck rental are expenses
-- with job_id set, so nothing is counted twice.
create table public.job_financials (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  quoted_amount numeric(12, 2) check (quoted_amount >= 0),
  agreed_price numeric(12, 2) check (agreed_price >= 0),
  admin_notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_payments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  received_on date not null,
  kind public.payment_kind not null default 'payment',
  -- Always entered as a positive number; refunds are subtracted in reports.
  amount numeric(12, 2) not null check (amount > 0),
  method public.payment_method,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_assignments (
  job_id uuid not null references public.jobs (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (job_id, employee_id)
);

-- ---------------------------------------------------------------------------
-- Hours (estimated labor cost only: no payroll processing)
-- ---------------------------------------------------------------------------

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete restrict,
  job_id uuid references public.jobs (id) on delete set null,
  work_date date not null,
  hours numeric(5, 2) not null check (hours > 0 and hours <= 24),
  -- Copied from the employee when the entry is saved, so later raises don't
  -- change past labor costs. Set by a trigger; employees can't choose it.
  hourly_rate numeric(10, 2) check (hourly_rate >= 0),
  status public.time_entry_status not null default 'submitted',
  notes text,
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Price sheet
-- ---------------------------------------------------------------------------

create table public.price_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  unit public.price_unit not null default 'flat',
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  minimum_charge numeric(12, 2) check (minimum_charge >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  -- A suggested tax-form category to help with bookkeeping. Confirm with your tax preparer.
  tax_category text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  vendor text,
  description text not null check (length(trim(description)) > 0),
  category_id uuid not null references public.expense_categories (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  payment_method public.payment_method,
  frequency public.recurrence not null,
  start_date date not null,
  end_date date,
  -- How many charges have been posted. The next due date is always counted from
  -- start_date, so a charge on the 31st doesn't drift to the 28th after February.
  occurrences_posted integer not null default 0 check (occurrences_posted >= 0),
  next_due_date date not null,
  active boolean not null default true,
  notes text,
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  vendor text,
  description text not null check (length(trim(description)) > 0),
  category_id uuid not null references public.expense_categories (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  payment_method public.payment_method,
  job_id uuid references public.jobs (id) on delete set null,
  recurring_expense_id uuid references public.recurring_expenses (id) on delete set null,
  notes text,
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A recurring charge can only be posted once per due date.
create unique index expenses_recurring_once on public.expenses (recurring_expense_id, expense_date)
  where recurring_expense_id is not null;

-- ---------------------------------------------------------------------------
-- Indexes for the date-range and lookup queries the app runs
-- ---------------------------------------------------------------------------

create index expenses_date_idx on public.expenses (expense_date);
create index expenses_category_idx on public.expenses (category_id);
create index expenses_job_idx on public.expenses (job_id);
create index recurring_expenses_category_idx on public.recurring_expenses (category_id);
create index jobs_customer_idx on public.jobs (customer_id);
create index jobs_status_idx on public.jobs (status);
create index job_payments_job_idx on public.job_payments (job_id);
create index job_payments_date_idx on public.job_payments (received_on);
create index job_assignments_employee_idx on public.job_assignments (employee_id);
create index time_entries_employee_idx on public.time_entries (employee_id);
create index time_entries_job_idx on public.time_entries (job_id);
create index time_entries_date_idx on public.time_entries (work_date);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'employees', 'customers', 'jobs', 'job_financials', 'job_payments', 'time_entries',
    'price_items', 'expense_categories', 'recurring_expenses', 'expenses'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Starting expense categories (real defaults, not demo data). Edit freely in the app.
-- ---------------------------------------------------------------------------

insert into public.expense_categories (name, tax_category, sort_order) values
  ('Dump & disposal fees',          'Other expenses',                                 10),
  ('Truck rental',                  'Rent or lease: vehicles, machinery, equipment',  20),
  ('Fuel',                          'Car and truck expenses',                         30),
  ('Vehicle repairs & maintenance', 'Car and truck expenses',                         40),
  ('Equipment & tools',             'Supplies',                                       50),
  ('Supplies',                      'Supplies',                                       60),
  ('Contract labor',                'Contract labor',                                 70),
  ('Insurance',                     'Insurance (other than health)',                  80),
  ('Advertising & marketing',       'Advertising',                                    90),
  ('Software & subscriptions',      'Other expenses',                                100),
  ('Phone & internet',              'Utilities',                                     110),
  ('Licenses, permits & fees',      'Taxes and licenses',                            120),
  ('Professional services',         'Legal and professional services',               130),
  ('Office expenses',               'Office expense',                                140),
  ('Meals',                         'Meals',                                         150),
  ('Other',                         'Other expenses',                                160);

-- Hoard Hounds business platform: access rules.
--
-- Every table has row-level security (RLS) turned on, so the database itself
-- decides who can read or change each row. The website only ever holds the
-- public "publishable" key; without a signed-in user who passes these rules,
-- every request is refused.
--
--   admin     Full access, but only after two-step login (authenticator app).
--             Enforced here through the 'aal2' claim in the login token, so a
--             stolen password alone can't read the books.
--   employee  (future /employee portal) Their own profile, their assigned jobs
--             (no money fields), and their own hours while still unapproved.
--   anon      Visitors who aren't signed in: no access to anything here.

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

-- True only for an admin who completed two-step login in this session.
-- security definer so it can read user_roles without tripping its own RLS.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
    and exists (
      select 1 from public.user_roles r
      where r.user_id = (select auth.uid()) and r.role = 'admin'
    );
$$;

-- The employees.id of the signed-in employee, or null.
create function public.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id
  from public.employees e
  join public.user_roles r on r.user_id = e.user_id and r.role = 'employee'
  where e.user_id = (select auth.uid()) and e.active;
$$;

-- Whether the signed-in employee is assigned to a job.
create function public.is_assigned_to_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.job_assignments a
    where a.job_id = p_job_id and a.employee_id = public.current_employee_id()
  );
$$;

-- ---------------------------------------------------------------------------
-- Turn on RLS everywhere and shut out signed-out visitors
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'user_roles', 'employees', 'customers', 'jobs', 'job_financials', 'job_payments',
    'job_assignments', 'time_entries', 'price_items', 'expense_categories',
    'recurring_expenses', 'expenses'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: full access to every business table (requires two-step login)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'employees', 'customers', 'jobs', 'job_financials', 'job_payments', 'job_assignments',
    'time_entries', 'price_items', 'expense_categories', 'recurring_expenses', 'expenses'
  ]
  loop
    execute format(
      'create policy "Admins manage %1$s" on public.%1$I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- user_roles
-- ---------------------------------------------------------------------------

-- Anyone signed in can see their own role (the app needs it to pick a screen).
create policy "Users read own role" on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Admins read all roles" on public.user_roles
  for select to authenticated
  using ((select public.is_admin()));

-- Admins can give or remove employee logins, but can't create other admins
-- from the app. New admins are added in the Supabase SQL editor only.
create policy "Admins add employee roles" on public.user_roles
  for insert to authenticated
  with check ((select public.is_admin()) and role = 'employee');

create policy "Admins remove employee roles" on public.user_roles
  for delete to authenticated
  using ((select public.is_admin()) and role = 'employee');

-- ---------------------------------------------------------------------------
-- Employee portal (future)
-- ---------------------------------------------------------------------------

create policy "Employees read own profile" on public.employees
  for select to authenticated
  using (id = (select public.current_employee_id()));

create policy "Employees read own assignments" on public.job_assignments
  for select to authenticated
  using (employee_id = (select public.current_employee_id()));

create policy "Employees read assigned jobs" on public.jobs
  for select to authenticated
  using ((select public.is_assigned_to_job(id)));

create policy "Employees read own hours" on public.time_entries
  for select to authenticated
  using (employee_id = (select public.current_employee_id()));

create policy "Employees log own hours" on public.time_entries
  for insert to authenticated
  with check (employee_id = (select public.current_employee_id()) and status = 'submitted');

create policy "Employees edit own unapproved hours" on public.time_entries
  for update to authenticated
  using (employee_id = (select public.current_employee_id()) and status = 'submitted')
  with check (employee_id = (select public.current_employee_id()) and status = 'submitted');

create policy "Employees delete own unapproved hours" on public.time_entries
  for delete to authenticated
  using (employee_id = (select public.current_employee_id()) and status = 'submitted');

-- Hourly rate on a time entry always comes from the employee's profile unless
-- an admin sets it, so employees can't change what their hours are worth.
create function public.time_entries_set_rate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  trusted boolean := public.is_admin() or (select auth.uid()) is null;
begin
  if not trusted or new.hourly_rate is null then
    select e.hourly_rate into new.hourly_rate
    from public.employees e
    where e.id = new.employee_id;
  end if;
  if not trusted and tg_op = 'UPDATE' then
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

create trigger time_entries_set_rate
  before insert or update on public.time_entries
  for each row execute function public.time_entries_set_rate();

-- ---------------------------------------------------------------------------
-- Recurring expenses
-- ---------------------------------------------------------------------------

-- The date of the nth charge (n = 0 is the first) for a schedule.
create function public.recurrence_date(p_start date, p_frequency public.recurrence, p_n integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select (p_start + p_n * case p_frequency
    when 'weekly' then interval '7 days'
    when 'monthly' then interval '1 month'
    when 'quarterly' then interval '3 months'
    when 'yearly' then interval '1 year'
  end)::date;
$$;

-- next_due_date is always derived, never typed in.
create function public.recurring_expenses_set_next_due()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.next_due_date := public.recurrence_date(new.start_date, new.frequency, new.occurrences_posted);
  return new;
end;
$$;

create trigger recurring_expenses_set_next_due
  before insert or update on public.recurring_expenses
  for each row execute function public.recurring_expenses_set_next_due();

-- Turns every recurring charge due on or before p_as_of into an expense.
-- Pass the user's local date so evening use in Michigan doesn't count as tomorrow.
-- Runs with the caller's permissions, so RLS still applies.
create function public.post_due_recurring_expenses(p_as_of date)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  rec public.recurring_expenses%rowtype;
  posted integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can post recurring expenses' using errcode = '42501';
  end if;

  for rec in
    select * from public.recurring_expenses
    where active and next_due_date <= p_as_of
    order by next_due_date
    for update
  loop
    while rec.next_due_date <= p_as_of
      and (rec.end_date is null or rec.next_due_date <= rec.end_date)
      and posted < 1000
    loop
      insert into public.expenses (
        expense_date, vendor, description, category_id, amount, payment_method,
        recurring_expense_id, is_demo
      ) values (
        rec.next_due_date, rec.vendor, rec.description, rec.category_id, rec.amount, rec.payment_method,
        rec.id, rec.is_demo
      )
      on conflict (recurring_expense_id, expense_date) where recurring_expense_id is not null do nothing;
      if found then
        posted := posted + 1;
      end if;

      rec.occurrences_posted := rec.occurrences_posted + 1;
      rec.next_due_date := public.recurrence_date(rec.start_date, rec.frequency, rec.occurrences_posted);
    end loop;

    update public.recurring_expenses
    set occurrences_posted = rec.occurrences_posted
    where id = rec.id;
  end loop;

  return posted;
end;
$$;

-- ---------------------------------------------------------------------------
-- Demo data
-- ---------------------------------------------------------------------------

-- Deletes every row marked is_demo = true. Returns how many rows were removed.
create function public.clear_demo_data()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  total integer := 0;
  n integer;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can clear demo data' using errcode = '42501';
  end if;

  delete from public.expenses where is_demo;            get diagnostics n = row_count; total := total + n;
  delete from public.recurring_expenses where is_demo;  get diagnostics n = row_count; total := total + n;
  delete from public.time_entries where is_demo;        get diagnostics n = row_count; total := total + n;
  delete from public.job_assignments where is_demo;     get diagnostics n = row_count; total := total + n;
  delete from public.job_payments where is_demo;        get diagnostics n = row_count; total := total + n;
  delete from public.job_financials where is_demo;      get diagnostics n = row_count; total := total + n;
  delete from public.jobs where is_demo;                get diagnostics n = row_count; total := total + n;
  delete from public.customers where is_demo;           get diagnostics n = row_count; total := total + n;
  delete from public.employees where is_demo;           get diagnostics n = row_count; total := total + n;
  delete from public.price_items where is_demo;         get diagnostics n = row_count; total := total + n;
  return total;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function permissions: signed-in users only (each function checks its own rules)
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.is_admin(),
  public.current_employee_id(),
  public.is_assigned_to_job(uuid),
  public.recurrence_date(date, public.recurrence, integer),
  public.post_due_recurring_expenses(date),
  public.clear_demo_data()
to authenticated;

-- Hoard Hounds Phase 2: saved customer estimates.
-- Run once in the Supabase SQL Editor, after the first two migrations.
--
-- Each estimate keeps a copy of its line items (name, price, quantity) so changing
-- the price sheet later never changes an estimate you already sent.
-- The database recalculates every total itself, so a saved total is always right.

create type public.estimate_status as enum ('draft', 'sent', 'accepted', 'declined');

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  -- Friendly number for customers: Estimate #1001, #1002, ...
  number integer generated always as identity (start with 1001) unique,
  customer_id uuid references public.customers (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  customer_name text not null check (length(trim(customer_name)) > 0),
  customer_email text,
  customer_phone text,
  property_address text,
  status public.estimate_status not null default 'draft',
  estimate_date date not null default current_date,
  valid_until date,
  -- [{ "name", "description", "unit", "unit_price", "quantity", "minimum_charge", "price_item_id" }]
  line_items jsonb not null default '[]'::jsonb check (jsonb_typeof(line_items) = 'array'),
  discount_type text check (discount_type in ('amount', 'percent')),
  discount_value numeric(12, 2) check (discount_value >= 0),
  deposit_amount numeric(12, 2) check (deposit_amount >= 0),
  -- Calculated by the trigger below; anything sent in is replaced.
  subtotal numeric(12, 2) not null default 0,
  discount_total numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  notes text,
  terms text,
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= estimate_date),
  check (discount_type is null or discount_type <> 'percent' or discount_value <= 100)
);

create index estimates_date_idx on public.estimates (estimate_date);
create index estimates_status_idx on public.estimates (status);
create index estimates_customer_idx on public.estimates (customer_id);
create index estimates_job_idx on public.estimates (job_id);

create trigger set_updated_at before update on public.estimates
  for each row execute function public.set_updated_at();

-- Checks every line and works out the totals.
--   line total = quantity x price, but never less than the item's minimum charge
--   discount   = a dollar amount, or a percent of the subtotal (never more than the subtotal)
create function public.estimates_compute_totals()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  item jsonb;
  qty numeric;
  price numeric;
  minimum numeric;
  line numeric;
  sub numeric := 0;
  disc numeric := 0;
begin
  -- This runs before the table's own checks, so check the shape here first.
  if new.line_items is null or jsonb_typeof(new.line_items) <> 'array' then
    raise exception 'Line items must be a list' using errcode = '23514';
  end if;

  for item in select * from jsonb_array_elements(new.line_items)
  loop
    if jsonb_typeof(item) <> 'object' or coalesce(trim(item ->> 'name'), '') = '' then
      raise exception 'Each line needs a name' using errcode = '23514';
    end if;
    qty := (item ->> 'quantity')::numeric;
    price := (item ->> 'unit_price')::numeric;
    minimum := coalesce((item ->> 'minimum_charge')::numeric, 0);
    if qty is null or qty <= 0 or qty > 10000 or price is null or price < 0 or minimum < 0 then
      raise exception 'Each line needs a quantity above 0 and a price of $0 or more' using errcode = '23514';
    end if;
    line := greatest(round(qty * price, 2), round(minimum, 2));
    sub := sub + line;
  end loop;

  if new.discount_type = 'percent' then
    disc := round(sub * coalesce(new.discount_value, 0) / 100, 2);
  elsif new.discount_type = 'amount' then
    disc := coalesce(new.discount_value, 0);
  end if;
  disc := least(disc, sub);

  new.subtotal := sub;
  new.discount_total := disc;
  new.total := sub - disc;
  return new;
end;
$$;

create trigger estimates_compute_totals
  before insert or update on public.estimates
  for each row execute function public.estimates_compute_totals();

-- Admin only (with two-step login). Employees and visitors can't see estimates.
alter table public.estimates enable row level security;
revoke all on table public.estimates from anon;
grant select, insert, update, delete on table public.estimates to authenticated;

create policy "Admins manage estimates" on public.estimates
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke execute on function public.estimates_compute_totals() from public, anon;

-- "Clear demo data" now also removes sample estimates.
create or replace function public.clear_demo_data()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  total integer := 0;
  n integer;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can clear demo data' using errcode = '42501';
  end if;

  delete from public.estimates where is_demo;           get diagnostics n = row_count; total := total + n;
  delete from public.expenses where is_demo;            get diagnostics n = row_count; total := total + n;
  delete from public.recurring_expenses where is_demo;  get diagnostics n = row_count; total := total + n;
  delete from public.time_entries where is_demo;        get diagnostics n = row_count; total := total + n;
  delete from public.job_assignments where is_demo;     get diagnostics n = row_count; total := total + n;
  delete from public.job_payments where is_demo;        get diagnostics n = row_count; total := total + n;
  delete from public.job_financials where is_demo;      get diagnostics n = row_count; total := total + n;
  delete from public.jobs where is_demo;                get diagnostics n = row_count; total := total + n;
  delete from public.customers where is_demo;           get diagnostics n = row_count; total := total + n;
  delete from public.employees where is_demo;           get diagnostics n = row_count; total := total + n;
  delete from public.price_items where is_demo;         get diagnostics n = row_count; total := total + n;
  return total;
end;
$$;


-- ---------------------------------------------------------------------
-- Make johnice.edward@gmail.com the admin.
-- ---------------------------------------------------------------------
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'johnice.edward@gmail.com';

-- Shows a message at the bottom so you know it worked.
select case
  when exists (select 1 from public.user_roles where role = 'admin')
    then 'All done! Your database is set up and you are the admin.'
  else 'Almost: the tables are set up, but no user called johnice.edward@gmail.com was found. Add yourself under Authentication > Users, then ask Claude what to run next.'
end as result;
