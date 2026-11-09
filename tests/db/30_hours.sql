\set QUIET on
\pset tuples_only on
\pset format unaligned
insert into public.user_roles values ('00000000-0000-0000-0000-00000000000a','admin') on conflict do nothing;
begin; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2","role":"authenticated"}', true); set local role authenticated;
insert into public.employees (full_name, hourly_rate) values ('Rate Test', 21.25);
insert into public.time_entries (employee_id, work_date, hours, status) select id, current_date, 6, 'approved' from public.employees where full_name='Rate Test';
select case when t.hourly_rate = 21.25 then 'PASS empty rate filled from employee' else 'FAIL rate ' || t.hourly_rate end from public.time_entries t join public.employees e on e.id=t.employee_id where e.full_name='Rate Test';
insert into public.time_entries (employee_id, work_date, hours, hourly_rate, status) select id, current_date, 2, 30, 'submitted' from public.employees where full_name='Rate Test';
select case when exists (select 1 from public.time_entries where hours = 2 and hourly_rate = 30) then 'PASS admin-entered rate kept' else 'FAIL custom rate' end;
update public.employees set hourly_rate = 25 where full_name='Rate Test';
select case when (select hourly_rate from public.time_entries where hours = 6 and employee_id = (select id from public.employees where full_name='Rate Test')) = 21.25 then 'PASS raise does not change past hours' else 'FAIL past hours changed' end;
update public.time_entries set status = 'approved' where status = 'submitted' and employee_id = (select id from public.employees where full_name='Rate Test');
select case when not exists (select 1 from public.time_entries where status='submitted' and employee_id=(select id from public.employees where full_name='Rate Test')) then 'PASS admin can approve' else 'FAIL approve' end;
do $$ begin delete from public.employees where full_name='Rate Test'; raise notice 'FAIL employee with hours deleted';
exception when foreign_key_violation then raise notice 'PASS employee with hours cannot be deleted'; end $$;
insert into public.job_assignments (job_id, employee_id) select (select id from public.jobs limit 1), id from public.employees where full_name='Rate Test';
delete from public.job_assignments where employee_id = (select id from public.employees where full_name='Rate Test');
select 'PASS admin can assign and unassign crew';
rollback;
