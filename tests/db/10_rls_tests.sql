\set QUIET on
\pset tuples_only on
\pset format unaligned
-- Users: a = owner (admin), e = crew (employee, linked), f = crew2 (employee role but no employee record), b = stranger (no role)
insert into public.user_roles values ('00000000-0000-0000-0000-00000000000a','admin'), ('00000000-0000-0000-0000-00000000000e','employee'), ('00000000-0000-0000-0000-00000000000f','employee');
update public.employees set user_id = '00000000-0000-0000-0000-00000000000e' where full_name = 'Demo Crew Member A';

select set_config('test.fuel_id', (select id::text from public.expense_categories where name='Fuel'), false), set_config('test.emp_b', (select id::text from public.employees where full_name='Demo Crew Member B'), false);
create function pg_temp.as_user(p_sub text, p_aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'aal', p_aal, 'role', 'authenticated')::text, true);
end $$;

-- ===== Signed-out visitor (anon) =====
begin; set local role anon;
do $$ begin
  begin perform 1 from public.expenses; raise notice 'FAIL anon can read expenses';
  exception when insufficient_privilege then raise notice 'PASS anon blocked from expenses'; end;
  begin perform 1 from public.user_roles; raise notice 'FAIL anon can read user_roles';
  exception when insufficient_privilege then raise notice 'PASS anon blocked from user_roles'; end;
  begin perform public.is_admin(); raise notice 'FAIL anon can call is_admin';
  exception when insufficient_privilege then raise notice 'PASS anon cannot call functions'; end;
end $$;
rollback;

-- ===== Admin WITHOUT two-step (aal1) =====
begin; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','aal1'); set local role authenticated;
select case when count(*) = 0 then 'PASS admin aal1 sees no expenses' else 'FAIL admin aal1 sees expenses' end from public.expenses;
select case when count(*) = 0 then 'PASS admin aal1 sees no jobs' else 'FAIL admin aal1 sees jobs' end from public.jobs;
select case when count(*) = 1 then 'PASS admin aal1 can read own role (for login screen)' else 'FAIL own role' end from public.user_roles;
do $$ begin
  begin insert into public.expenses (expense_date, description, category_id, amount) values (current_date, 'x', current_setting('test.fuel_id')::uuid, 1);
    raise notice 'FAIL admin aal1 inserted expense';
  exception when insufficient_privilege then raise notice 'PASS admin aal1 cannot insert expense'; end;
  begin perform public.post_due_recurring_expenses(current_date); raise notice 'FAIL admin aal1 posted recurring';
  exception when insufficient_privilege then raise notice 'PASS admin aal1 cannot post recurring'; end;
end $$;
rollback;

-- ===== Admin WITH two-step (aal2) =====
begin; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','aal2'); set local role authenticated;
select case when count(*) = 62 then 'PASS admin aal2 sees all expenses' else 'FAIL admin aal2 expense count ' || count(*) end from public.expenses;
select case when count(*) = 3 then 'PASS admin aal2 sees all roles' else 'FAIL roles' end from public.user_roles;
insert into public.expenses (expense_date, description, category_id, amount) select current_date, 'Test', id, 12.34 from public.expense_categories where name = 'Fuel';
select case when created_by = '00000000-0000-0000-0000-00000000000a' then 'PASS created_by defaults to signed-in user' else 'FAIL created_by' end from public.expenses where description = 'Test';
update public.expenses set amount = 20 where description = 'Test';
select case when amount = 20 then 'PASS admin can edit expense' else 'FAIL edit' end from public.expenses where description = 'Test';
delete from public.expenses where description = 'Test';
select case when count(*) = 0 then 'PASS admin can delete expense' else 'FAIL delete' end from public.expenses where description = 'Test';
do $$ begin
  begin insert into public.user_roles values ('00000000-0000-0000-0000-00000000000b','admin'); raise notice 'FAIL admin created another admin';
  exception when insufficient_privilege then raise notice 'PASS admin cannot create admins from the app'; end;
  begin update public.user_roles set role = 'admin' where user_id = '00000000-0000-0000-0000-00000000000e'; 
    if exists (select 1 from public.user_roles where user_id = '00000000-0000-0000-0000-00000000000e' and role = 'admin') then raise notice 'FAIL admin promoted employee'; else raise notice 'PASS admin cannot promote via update'; end if;
  end;
end $$;
insert into public.user_roles values ('00000000-0000-0000-0000-00000000000b','employee');
select 'PASS admin can add employee role';
rollback;

-- ===== Recurring expense posting (admin aal2) =====
begin; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','aal2'); set local role authenticated;
insert into public.recurring_expenses (description, category_id, amount, frequency, start_date)
  select 'Month-end test', id, 10, 'monthly', date '2026-01-31' from public.expense_categories where name = 'Other';
select case when next_due_date = date '2026-01-31' then 'PASS next_due_date derived from start' else 'FAIL next_due ' || next_due_date end from public.recurring_expenses where description = 'Month-end test';
select 'posted ' || public.post_due_recurring_expenses(date '2026-04-30');
select case when string_agg(expense_date::text, ',' order by expense_date) = '2026-01-31,2026-02-28,2026-03-31,2026-04-30' then 'PASS month-end dates do not drift' else 'FAIL dates ' || string_agg(expense_date::text, ',' order by expense_date) end
  from public.expenses e join public.recurring_expenses r on r.id = e.recurring_expense_id where r.description = 'Month-end test';
select case when public.post_due_recurring_expenses(date '2026-04-30') >= 0 and (select count(*) from public.expenses e join public.recurring_expenses r on r.id = e.recurring_expense_id where r.description = 'Month-end test') = 4 then 'PASS posting twice creates no duplicates' else 'FAIL duplicates' end;
select case when next_due_date = date '2026-05-31' then 'PASS next due advanced to 2026-05-31' else 'FAIL next due ' || next_due_date end from public.recurring_expenses where description = 'Month-end test';
update public.recurring_expenses set next_due_date = date '2020-01-01' where description = 'Month-end test';
select case when next_due_date = date '2026-05-31' then 'PASS next_due_date cannot be typed in' else 'FAIL next_due overwritten' end from public.recurring_expenses where description = 'Month-end test';
insert into public.recurring_expenses (description, category_id, amount, frequency, start_date, end_date)
  select 'Ends test', id, 5, 'weekly', date '2026-01-01', date '2026-01-20' from public.expense_categories where name = 'Other';
select public.post_due_recurring_expenses(date '2026-03-01') is not null;
select case when count(*) = 3 then 'PASS end_date respected (3 weekly charges)' else 'FAIL end_date count ' || count(*) end from public.expenses e join public.recurring_expenses r on r.id = e.recurring_expense_id where r.description = 'Ends test';
rollback;

-- ===== Employee (linked to Demo Crew Member A) =====
begin; select pg_temp.as_user('00000000-0000-0000-0000-00000000000e','aal1'); set local role authenticated;
select case when count(*) = 0 then 'PASS employee sees no expenses' else 'FAIL employee sees expenses' end from public.expenses;
select case when count(*) = 0 then 'PASS employee sees no job money' else 'FAIL employee sees job_financials' end from public.job_financials;
select case when count(*) = 0 then 'PASS employee sees no payments' else 'FAIL employee sees payments' end from public.job_payments;
select case when count(*) = 0 then 'PASS employee sees no customers' else 'FAIL employee sees customers' end from public.customers;
select case when count(*) = 1 and bool_and(full_name = 'Demo Crew Member A') then 'PASS employee sees only own profile' else 'FAIL employee profiles ' || count(*) end from public.employees;
select case when count(*) > 0 and count(*) = (select count(*) from public.job_assignments) then 'PASS employee sees only assigned jobs (' || count(*) || ')' else 'FAIL assigned jobs' end from public.jobs;
select case when bool_and(employee_id = public.current_employee_id()) then 'PASS employee sees only own hours' else 'FAIL hours' end from public.time_entries;
insert into public.time_entries (employee_id, work_date, hours, hourly_rate, status)
  values (public.current_employee_id(), current_date, 4, 999, 'submitted');
select case when hourly_rate = 20.00 then 'PASS employee cannot set own rate (forced to 20.00)' else 'FAIL rate ' || hourly_rate end from public.time_entries where hours = 4 and work_date = current_date;
update public.time_entries set hours = 5 where hours = 4 and work_date = current_date;
select case when count(*) = 1 then 'PASS employee can edit own submitted hours' else 'FAIL edit hours' end from public.time_entries where hours = 5 and work_date = current_date;
do $$ begin
  begin update public.time_entries set status = 'approved' where hours = 5 and work_date = current_date;
    if exists (select 1 from public.time_entries where status = 'approved' and hours = 5 and work_date = current_date) then raise notice 'FAIL employee approved own hours'; else raise notice 'PASS employee cannot approve own hours (no rows)'; end if;
  exception when insufficient_privilege then raise notice 'PASS employee cannot approve own hours'; end;
  begin update public.time_entries set hours = 1 where status = 'approved';
    if exists (select 1 from public.time_entries where status = 'approved' and hours = 1) then raise notice 'FAIL employee edited approved hours'; else raise notice 'PASS employee cannot edit approved hours'; end if;
  end;
  begin insert into public.time_entries (employee_id, work_date, hours) values (current_setting('test.emp_b')::uuid, current_date, 3);
    raise notice 'FAIL employee logged hours for someone else';
  exception when insufficient_privilege then raise notice 'PASS employee cannot log hours for others'; end;
  begin insert into public.user_roles values ('00000000-0000-0000-0000-00000000000e','admin'); raise notice 'FAIL employee changed role';
  exception when insufficient_privilege or unique_violation then raise notice 'PASS employee cannot change role'; end;
  begin perform public.clear_demo_data(); raise notice 'FAIL employee cleared demo data';
  exception when insufficient_privilege then raise notice 'PASS employee cannot clear demo data'; end;
end $$;
rollback;

-- ===== Employee role but no linked record; and a user with no role =====
begin; select pg_temp.as_user('00000000-0000-0000-0000-00000000000f','aal2'); set local role authenticated;
select case when (select count(*) from public.jobs) + (select count(*) from public.employees) + (select count(*) from public.time_entries) = 0 then 'PASS unlinked employee sees nothing' else 'FAIL unlinked employee' end;
rollback;
begin; select pg_temp.as_user('00000000-0000-0000-0000-00000000000b','aal2'); set local role authenticated;
select case when (select count(*) from public.expenses) + (select count(*) from public.jobs) + (select count(*) from public.user_roles) = 0 then 'PASS user with no role sees nothing, even with aal2' else 'FAIL stranger' end;
rollback;

-- ===== Deactivated employee loses access =====
begin; update public.employees set active = false where user_id = '00000000-0000-0000-0000-00000000000e';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e','aal1'); set local role authenticated;
select case when (select count(*) from public.jobs) + (select count(*) from public.employees) = 0 then 'PASS deactivated employee sees nothing' else 'FAIL deactivated employee' end;
rollback;

-- ===== Clear demo data (admin aal2) =====
begin; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','aal2'); set local role authenticated;
insert into public.expenses (expense_date, description, category_id, amount) select current_date, 'Real expense', id, 9 from public.expense_categories where name = 'Fuel';
select 'cleared ' || public.clear_demo_data() || ' demo rows';
select case when (select count(*) from public.expenses) = 1 and (select count(*) from public.employees) = 0 and (select count(*) from public.jobs) = 0 and (select count(*) from public.expense_categories) = 16 then 'PASS demo cleared, real rows and categories kept' else 'FAIL clear demo' end;
rollback;
