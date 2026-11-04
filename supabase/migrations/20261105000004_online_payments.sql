-- Hoard Hounds: online payments with Stripe (cards, Klarna and other methods
-- turned on in your Stripe dashboard). Run once in the Supabase SQL Editor.
--
-- How it works:
--   1. An admin taps "Request online payment" on a job. The stripe-payments
--      server function creates a Stripe payment link and saves it here.
--   2. The customer pays through the link.
--   3. Stripe tells the stripe-webhook server function, which records the
--      payment on the job (job_payments) and marks the request paid.
-- Stripe secret keys live only in Supabase's server-function secrets, never here.

create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  kind public.payment_kind not null check (kind in ('deposit', 'payment')),
  amount numeric(12, 2) not null check (amount >= 0.50),
  description text,
  stripe_payment_link_id text unique,
  url text,
  status text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  job_payment_id uuid references public.job_payments (id) on delete set null,
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payment_requests_job_idx on public.payment_requests (job_id);

create trigger set_updated_at before update on public.payment_requests
  for each row execute function public.set_updated_at();

-- Each Stripe checkout can only ever be recorded once, even if Stripe sends
-- the same notification twice.
alter table public.job_payments add column stripe_session_id text unique;

-- Admin only (with two-step login). The webhook uses the server-only service key.
alter table public.payment_requests enable row level security;
revoke all on table public.payment_requests from anon;
grant select, insert, update, delete on table public.payment_requests to authenticated;

create policy "Admins manage payment requests" on public.payment_requests
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- "Clear demo data" now also removes sample payment requests.
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

select 'All done! Online payments are set up in your database.' as result;
