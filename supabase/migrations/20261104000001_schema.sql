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
