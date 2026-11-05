-- Hoard Hounds: quote links customers can open, accept and pay.
-- Run once in the Supabase SQL Editor, after the earlier migrations.
--
-- How it stays private:
--   - Each shared estimate gets a long random secret (share_token) that's only in
--     the link you send. Without it, nobody can see the quote.
--   - Customers never get database access. The public-quote server function looks
--     up a quote by its token using the two functions below, which only that
--     server function (the service role) may run, and which return only what the
--     customer should see: no private notes, no other customers, no other jobs.
--   - Accepting is done in one locked database transaction, so double-tapping
--     "Accept" can't create two jobs.

alter table public.estimates
  add column share_token text unique check (share_token is null or length(share_token) >= 32),
  add column accepted_at timestamptz,
  add column accepted_via text check (accepted_via in ('deposit', 'full', 'later', 'admin'));

-- Your quote template: one row of settings, editable in the dashboard.
create table public.business_settings (
  id integer primary key default 1 check (id = 1),
  quote_message text,
  default_terms text,
  default_valid_days integer not null default 30 check (default_valid_days between 1 and 365),
  default_deposit numeric(12, 2) check (default_deposit >= 0),
  updated_at timestamptz not null default now()
);

insert into public.business_settings (id, quote_message, default_terms) values (
  1,
  'Thanks for considering Hoard Hounds! Here''s your quote. When you''re ready, accept below to book your cleanout.',
  'This estimate is based on the photos and details provided. The final price is confirmed with you after a walkthrough or on arrival, before any work begins.'
);

create trigger set_updated_at before update on public.business_settings
  for each row execute function public.set_updated_at();

alter table public.business_settings enable row level security;
revoke all on table public.business_settings from anon;
grant select, insert, update on table public.business_settings to authenticated;
create policy "Admins manage settings" on public.business_settings
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- What a customer sees for a valid link (or null). Only the customer-facing parts.
-- ---------------------------------------------------------------------------
create function public.get_shared_estimate(p_token text)
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

-- ---------------------------------------------------------------------------
-- Customer accepts: marks the estimate accepted and makes sure there's a job
-- (and a customer) for it. Safe to call more than once; returns what the
-- server function needs to start a payment.
-- ---------------------------------------------------------------------------
create function public.accept_shared_estimate(p_token text, p_via text)
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

-- Only the public-quote server function (service role) may run these.
revoke execute on function public.get_shared_estimate(text) from public, anon, authenticated;
revoke execute on function public.accept_shared_estimate(text, text) from public, anon, authenticated;
grant execute on function public.get_shared_estimate(text) to service_role;
grant execute on function public.accept_shared_estimate(text, text) to service_role;

select 'All done! Quote links are set up.' as result;
