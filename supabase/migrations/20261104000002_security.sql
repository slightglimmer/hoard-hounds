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
