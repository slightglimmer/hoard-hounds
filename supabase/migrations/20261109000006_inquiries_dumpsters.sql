-- Hoard Hounds: website inquiries with private photos, dumpster tracking, and
-- internal job costing for estimates. Run once in the Supabase SQL Editor, after
-- the earlier migrations.
--
-- Everything here is additive: no existing table, column or row is removed.
--
-- Who can see what:
--   - Inquiries, their photos, dumpster rentals and estimate costing are admin-only
--     (admin role + two-step login), like the rest of the business data.
--   - Website visitors never get database access. The submit-inquiry server function
--     saves requests with the server key after checking them.
--   - Photos go in a PRIVATE storage bucket. Admins view them through short-lived
--     signed links; nobody else can read them.
--
-- All or nothing: if any step fails, everything is rolled back and nothing changes.

begin;

-- ---------------------------------------------------------------------------
-- Inquiries (quote requests from the website)
-- ---------------------------------------------------------------------------

create type public.inquiry_status as enum ('new', 'reviewing', 'quoted', 'won', 'lost');

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  -- Friendly number: Request #101, #102, ...
  number integer generated always as identity (start with 101) unique,
  status public.inquiry_status not null default 'new',
  source text not null default 'website' check (source in ('website', 'phone', 'email', 'referral', 'other')),

  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  email text not null check (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone text not null check (char_length(phone) <= 40),
  property_address text not null check (char_length(trim(property_address)) between 5 and 300),
  cleanout_type text not null check (char_length(cleanout_type) between 1 and 100),
  description text not null check (char_length(trim(description)) between 10 and 5000),

  -- Optional details that help size the job and the dumpster.
  property_type text check (property_type in ('house', 'condo', 'multi_unit', 'mobile_home', 'commercial', 'other')),
  occupancy text check (occupancy in ('occupied', 'vacant')),
  rooms text check (rooms in ('1-2', '3-4', '5-7', '8+')),
  volume text check (volume in ('light', 'moderate', 'heavy', 'not_sure')),
  access text check (access in ('ground', 'stairs', 'elevator', 'not_sure')),
  driveway text check (driveway in ('yes', 'street_only', 'shared_or_limited', 'not_sure')),
  restrictions text check (char_length(restrictions) <= 1000),
  keep_items text check (char_length(keep_items) <= 2000),
  hazards text check (char_length(hazards) <= 1000),
  preferred_date date,
  date_is_deadline boolean not null default false,
  consent boolean not null check (consent),

  photo_count integer not null default 0 check (photo_count between 0 and 6),
  photos_failed integer not null default 0 check (photos_failed between 0 and 6),
  -- One-way hash of the sender's network address, only for rate limiting.
  client_hash text check (char_length(client_hash) <= 128),

  -- Owner's working fields.
  admin_notes text,
  customer_id uuid references public.customers (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,

  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index inquiries_status_idx on public.inquiries (status, created_at desc);
create index inquiries_client_idx on public.inquiries (client_hash, created_at);
create index inquiries_email_idx on public.inquiries (lower(email), created_at);
create index inquiries_customer_idx on public.inquiries (customer_id);
create index inquiries_job_idx on public.inquiries (job_id);

create table public.inquiry_photos (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  -- <inquiry id>/<random id>.<ext>: random, so paths can't be guessed.
  storage_path text not null unique
    check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|heic|heif)$'),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index inquiry_photos_inquiry_idx on public.inquiry_photos (inquiry_id);

-- Estimates made from an inquiry remember where they came from.
alter table public.estimates
  add column inquiry_id uuid references public.inquiries (id) on delete set null;
create index estimates_inquiry_idx on public.estimates (inquiry_id);

-- ---------------------------------------------------------------------------
-- What the customer sees on an estimate: scope and dumpster allowance
-- ---------------------------------------------------------------------------

alter table public.estimates
  add column scope_of_work text,
  add column dumpster_count integer check (dumpster_count between 1 and 20),
  add column dumpster_size_yards numeric(5, 1) check (dumpster_size_yards > 0),
  add column dumpster_weight_allowance_tons numeric(6, 2) check (dumpster_weight_allowance_tons > 0),
  add column dumpster_rental_days integer check (dumpster_rental_days between 1 and 365),
  -- Rates the dumpster provider charges if the allowance is exceeded (disclosed, never auto-charged).
  add column overage_rate_per_ton numeric(10, 2) check (overage_rate_per_ton >= 0),
  add column extra_day_rate numeric(10, 2) check (extra_day_rate >= 0),
  add column overage_terms text;

-- ---------------------------------------------------------------------------
-- Internal job costing for an estimate (admin-only, never shown to customers)
-- ---------------------------------------------------------------------------

create table public.estimate_costing (
  estimate_id uuid primary key references public.estimates (id) on delete cascade,
  dumpster_cost numeric(12, 2) not null default 0 check (dumpster_cost >= 0),
  labor_hours numeric(7, 2) not null default 0 check (labor_hours >= 0 and labor_hours <= 2000),
  labor_rate numeric(10, 2) not null default 0 check (labor_rate >= 0),
  other_costs numeric(12, 2) not null default 0 check (other_costs >= 0),
  contingency_pct numeric(5, 2) not null default 0 check (contingency_pct >= 0 and contingency_pct <= 100),
  target_margin_pct numeric(5, 2) not null default 0 check (target_margin_pct >= 0 and target_margin_pct < 95),
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Dumpster rentals for a job (planning and tracking; one job can have several)
-- ---------------------------------------------------------------------------

create table public.dumpster_rentals (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  provider_name text check (char_length(provider_name) <= 120),
  provider_contact text check (char_length(provider_contact) <= 300),
  size_yards numeric(5, 1) check (size_yards > 0),
  base_cost numeric(12, 2) check (base_cost >= 0),
  included_days integer check (included_days between 1 and 365),
  weight_allowance_tons numeric(6, 2) check (weight_allowance_tons > 0),
  overage_rate_per_ton numeric(10, 2) check (overage_rate_per_ton >= 0),
  extra_day_rate numeric(10, 2) check (extra_day_rate >= 0),
  delivery_date date,
  expected_pickup_date date,
  actual_pickup_date date,
  placement_notes text,
  permit_required boolean,
  permit_notes text,
  confirmation_number text check (char_length(confirmation_number) <= 100),
  actual_overage_charges numeric(12, 2) check (actual_overage_charges >= 0),
  -- What was actually paid is recorded as expenses, so job profit counts it once.
  base_expense_id uuid references public.expenses (id) on delete set null,
  overage_expense_id uuid references public.expenses (id) on delete set null,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expected_pickup_date is null or delivery_date is null or expected_pickup_date >= delivery_date),
  check (actual_pickup_date is null or delivery_date is null or actual_pickup_date >= delivery_date)
);

create index dumpster_rentals_job_idx on public.dumpster_rentals (job_id);

-- ---------------------------------------------------------------------------
-- Timestamps, row-level security and grants for the new tables
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['inquiries', 'estimate_costing', 'dumpster_rentals'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
  foreach t in array array['inquiries', 'inquiry_photos', 'estimate_costing', 'dumpster_rentals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format(
      'create policy "Admins manage %1$s" on public.%1$I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Private photo storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inquiry-photos', 'inquiry-photos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

-- Admins (with two-step login) can view and delete inquiry photos. There are no
-- insert or update policies: only the submit-inquiry server function uploads.
create policy "Admins view inquiry photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'inquiry-photos' and (select public.is_admin()));

create policy "Admins delete inquiry photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'inquiry-photos' and (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Expense categories for the dumpster model. Truck rental is kept (old records
-- still use it) but hidden from new entries.
-- ---------------------------------------------------------------------------

insert into public.expense_categories (name, tax_category, sort_order) values
  ('Dumpster rental',                     'Rent or lease: vehicles, machinery, equipment', 5),
  ('Dumpster overage & extra-day fees',   'Rent or lease: vehicles, machinery, equipment', 6),
  ('Permits & placement fees',            'Taxes and licenses',                            7)
on conflict (name) do nothing;

update public.expense_categories set active = false where name = 'Truck rental';

-- ---------------------------------------------------------------------------
-- Quote template additions
-- ---------------------------------------------------------------------------

alter table public.business_settings
  add column default_overage_terms text,
  add column default_labor_rate numeric(10, 2) check (default_labor_rate >= 0),
  add column default_contingency_pct numeric(5, 2) check (default_contingency_pct >= 0 and default_contingency_pct <= 100),
  add column default_target_margin_pct numeric(5, 2) check (default_target_margin_pct >= 0 and default_target_margin_pct < 95);

update public.business_settings
set default_overage_terms = 'Your price includes the dumpster allowance shown above. If the dumpster provider charges extra for weight over that allowance, for keeping the dumpster longer than the included rental days, or for items they don''t accept, we will show you the provider''s documentation (such as the weight ticket or invoice) and get your approval before billing you. Approved charges are passed through at the provider''s actual cost, with no added fee. We never charge a saved card automatically.'
where id = 1 and default_overage_terms is null;

-- ---------------------------------------------------------------------------
-- Customer quote page: add the scope and dumpster allowance (still only
-- customer-facing fields; internal costing is never included).
-- ---------------------------------------------------------------------------

create or replace function public.get_shared_estimate(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'number', e.number,
    'customer_name', e.customer_name,
    'property_address', e.property_address,
    'status', e.status,
    'estimate_date', e.estimate_date,
    'valid_until', e.valid_until,
    'line_items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', li ->> 'name',
        'description', li ->> 'description',
        'unit', li ->> 'unit',
        'unit_price', (li ->> 'unit_price')::numeric,
        'quantity', (li ->> 'quantity')::numeric,
        'minimum_charge', (li ->> 'minimum_charge')::numeric
      ) order by ord), '[]'::jsonb)
      from jsonb_array_elements(e.line_items) with ordinality as t(li, ord)
    ),
    'discount_type', e.discount_type,
    'discount_value', e.discount_value,
    'subtotal', e.subtotal,
    'discount_total', e.discount_total,
    'total', e.total,
    'deposit_amount', e.deposit_amount,
    'notes', e.notes,
    'terms', e.terms,
    'scope_of_work', e.scope_of_work,
    'dumpster_count', e.dumpster_count,
    'dumpster_size_yards', e.dumpster_size_yards,
    'dumpster_weight_allowance_tons', e.dumpster_weight_allowance_tons,
    'dumpster_rental_days', e.dumpster_rental_days,
    'overage_rate_per_ton', e.overage_rate_per_ton,
    'extra_day_rate', e.extra_day_rate,
    'overage_terms', e.overage_terms,
    'accepted_at', e.accepted_at,
    'accepted_via', e.accepted_via,
    'received', coalesce((
      select sum(case when p.kind = 'refund' then -p.amount else p.amount end)
      from public.job_payments p
      where e.job_id is not null and p.job_id = e.job_id
    ), 0),
    'quote_message', (select s.quote_message from public.business_settings s where s.id = 1)
  )
  from public.estimates e
  where length(p_token) >= 32 and e.share_token = p_token;
$$;

-- Accepting a quote also marks the inquiry it came from as won.
create or replace function public.accept_shared_estimate(p_token text, p_via text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.estimates%rowtype;
  customer uuid;
  job uuid;
  today date := (now() at time zone 'America/Detroit')::date;
begin
  if p_via not in ('deposit', 'full', 'later') then
    raise exception 'bad_option' using errcode = '22023';
  end if;

  select * into e from public.estimates
  where length(p_token) >= 32 and share_token = p_token
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if e.status = 'declined' then
    raise exception 'declined' using errcode = 'P0001';
  end if;
  if e.accepted_at is null and e.valid_until is not null and e.valid_until < today then
    raise exception 'expired' using errcode = 'P0001';
  end if;
  if e.total <= 0 then
    raise exception 'no_total' using errcode = 'P0001';
  end if;

  customer := e.customer_id;
  job := e.job_id;
  if job is null then
    if customer is null then
      insert into public.customers (full_name, phone, email, notes)
      values (e.customer_name, e.customer_phone, e.customer_email, 'Added when they accepted quote #' || e.number || ' online')
      returning id into customer;
    end if;
    insert into public.jobs (customer_id, title, property_address, status, crew_notes)
    values (customer, e.customer_name || ' cleanout', e.property_address, 'scheduled', e.notes)
    returning id into job;
  end if;

  insert into public.job_financials (job_id, quoted_amount, agreed_price, admin_notes)
  values (job, e.total, e.total, 'Accepted online, quote #' || e.number)
  on conflict (job_id) do update
    set agreed_price = coalesce(public.job_financials.agreed_price, excluded.agreed_price),
        quoted_amount = coalesce(public.job_financials.quoted_amount, excluded.quoted_amount);

  update public.estimates
  set status = 'accepted',
      accepted_at = coalesce(accepted_at, now()),
      accepted_via = coalesce(accepted_via, p_via),
      job_id = job,
      customer_id = customer
  where id = e.id;

  if e.inquiry_id is not null then
    update public.inquiries
    set status = 'won',
        job_id = coalesce(job_id, job),
        customer_id = coalesce(customer_id, customer)
    where id = e.inquiry_id and status <> 'won';
  end if;

  return jsonb_build_object(
    'job_id', job,
    'number', e.number,
    'customer_name', e.customer_name,
    'customer_email', e.customer_email,
    'total', e.total,
    'deposit_amount', e.deposit_amount,
    'received', coalesce((
      select sum(case when p.kind = 'refund' then -p.amount else p.amount end)
      from public.job_payments p where p.job_id = job
    ), 0)
  );
end;
$$;

-- "create or replace" keeps permissions, but state them again to be sure.
revoke execute on function public.get_shared_estimate(text) from public, anon, authenticated;
revoke execute on function public.accept_shared_estimate(text, text) from public, anon, authenticated;
grant execute on function public.get_shared_estimate(text) to service_role;
grant execute on function public.accept_shared_estimate(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- "Clear demo data" also clears the new sample rows.
-- ---------------------------------------------------------------------------

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

  delete from public.dumpster_rentals where is_demo;    get diagnostics n = row_count; total := total + n;
  delete from public.estimate_costing where is_demo;    get diagnostics n = row_count; total := total + n;
  delete from public.inquiry_photos where is_demo;      get diagnostics n = row_count; total := total + n;
  delete from public.inquiries where is_demo;           get diagnostics n = row_count; total := total + n;
  delete from public.payment_requests where is_demo;    get diagnostics n = row_count; total := total + n;
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

commit;

select 'All done! Inquiries, photos and dumpster tracking are set up.' as result;
