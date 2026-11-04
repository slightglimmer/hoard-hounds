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

select 'All done! Estimates are set up.' as result;
