\set QUIET on
\pset tuples_only on
\pset format unaligned
-- Users: a = owner (admin), e = crew (employee), b = stranger (signed in, no role)
insert into public.user_roles values ('00000000-0000-0000-0000-00000000000a','admin'), ('00000000-0000-0000-0000-00000000000e','employee') on conflict do nothing;
update public.employees set user_id = '00000000-0000-0000-0000-00000000000e' where full_name = 'Demo Crew Member A';
create function pg_temp.as_user(p_sub text, p_aal text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'aal', p_aal, 'role', 'authenticated')::text, true); end $$;

-- ===== The server function (service role) saves an inquiry with a photo =====
set role service_role;
insert into public.inquiries (full_name, email, phone, property_address, cleanout_type, description, occupancy, volume, driveway, consent, client_hash)
values ('Casey Inquiry', 'casey@example.com', '313-555-0101', '12 Oak St, Redford, MI', 'Hoarding Clean-Outs', 'Whole house, two floors, very full.', 'vacant', 'heavy', 'yes', true, 'hash-1');
insert into storage.objects (bucket_id, name) select 'inquiry-photos', id || '/11111111-2222-4333-8444-555555555555.jpg' from public.inquiries where full_name = 'Casey Inquiry';
insert into public.inquiry_photos (inquiry_id, storage_path, content_type, size_bytes)
select id, id || '/11111111-2222-4333-8444-555555555555.jpg', 'image/jpeg', 120000 from public.inquiries where full_name = 'Casey Inquiry';
select case when (select number from public.inquiries where full_name = 'Casey Inquiry') >= 101 and (select status from public.inquiries where full_name = 'Casey Inquiry') = 'new'
  then 'PASS server saves inquiry as new with a friendly number' else 'FAIL save inquiry' end;
do $$ begin insert into public.inquiries (full_name, email, phone, property_address, cleanout_type, description, consent) values ('No Consent', 'a@b.co', '3135550100', '1 Main St', 'Other', 'Long enough description', false);
  raise notice 'FAIL saved without consent'; exception when check_violation then raise notice 'PASS consent is required'; end $$;
do $$ begin insert into public.inquiries (full_name, email, phone, property_address, cleanout_type, description, consent) values ('Bad Email', 'not-an-email', '3135550100', '1 Main St', 'Other', 'Long enough description', true);
  raise notice 'FAIL bad email saved'; exception when check_violation then raise notice 'PASS email must look valid'; end $$;
do $$ begin insert into public.inquiries (full_name, email, phone, property_address, cleanout_type, description, consent) values ('Short', 'a@b.co', '3135550100', '1 Main St', 'Other', 'short', true);
  raise notice 'FAIL short description saved'; exception when check_violation then raise notice 'PASS description must be meaningful'; end $$;
do $$ begin insert into public.inquiries (full_name, email, phone, property_address, cleanout_type, description, consent, occupancy) values ('Odd', 'a@b.co', '3135550100', '1 Main St', 'Other', 'Long enough description', true, 'haunted');
  raise notice 'FAIL odd occupancy saved'; exception when check_violation then raise notice 'PASS option fields only accept known values'; end $$;
do $$ begin insert into public.inquiries (full_name, email, phone, property_address, cleanout_type, description, consent) values ('Huge', 'a@b.co', '3135550100', '1 Main St', 'Other', repeat('x', 5001), true);
  raise notice 'FAIL huge description saved'; exception when check_violation then raise notice 'PASS very long text rejected'; end $$;
do $$ begin insert into public.inquiry_photos (inquiry_id, storage_path, content_type, size_bytes) select id, 'casey.jpg', 'image/jpeg', 100 from public.inquiries limit 1;
  raise notice 'FAIL guessable photo path saved'; exception when check_violation then raise notice 'PASS photo paths must be random ids'; end $$;
do $$ begin insert into public.inquiry_photos (inquiry_id, storage_path, content_type, size_bytes) select id, id || '/22222222-2222-4333-8444-555555555555.exe', 'application/x-msdownload', 100 from public.inquiries limit 1;
  raise notice 'FAIL non-image saved'; exception when check_violation then raise notice 'PASS only image files are recorded'; end $$;
reset role;
select case when (select public from storage.buckets where id = 'inquiry-photos') = false then 'PASS photo bucket is private' else 'FAIL bucket public' end;

-- ===== Visitors (not signed in) =====
begin; set local role anon;
do $$ begin perform 1 from public.inquiries; raise notice 'FAIL anon read inquiries'; exception when insufficient_privilege then raise notice 'PASS visitors cannot read inquiries'; end $$;
do $$ begin insert into public.inquiries (full_name, email, phone, property_address, cleanout_type, description, consent) values ('Anon', 'a@b.co', '3135550100', '1 Main St', 'Other', 'Long enough description', true);
  raise notice 'FAIL anon inserted'; exception when insufficient_privilege then raise notice 'PASS visitors cannot write inquiries directly'; end $$;
do $$ begin perform 1 from public.inquiry_photos; raise notice 'FAIL anon read photos'; exception when insufficient_privilege then raise notice 'PASS visitors cannot list photos'; end $$;
do $$ begin perform 1 from public.dumpster_rentals; raise notice 'FAIL anon dumpsters'; exception when insufficient_privilege then raise notice 'PASS visitors cannot read dumpster rentals'; end $$;
do $$ begin perform 1 from public.estimate_costing; raise notice 'FAIL anon costing'; exception when insufficient_privilege then raise notice 'PASS visitors cannot read job costing'; end $$;
select case when count(*) = 0 then 'PASS visitors cannot see private photo files' else 'FAIL anon sees photo files' end from storage.objects where bucket_id = 'inquiry-photos';
do $$ begin insert into storage.objects (bucket_id, name) values ('inquiry-photos', 'x/evil.jpg'); raise notice 'FAIL anon uploaded';
  exception when insufficient_privilege then raise notice 'PASS visitors cannot upload to the photo bucket'; end $$;
rollback;

-- ===== Signed-in users who are not admins =====
begin; select pg_temp.as_user('00000000-0000-0000-0000-00000000000b','aal2'); set local role authenticated;
select case when (select count(*) from public.inquiries) = 0 and (select count(*) from public.inquiry_photos) = 0 and (select count(*) from storage.objects where bucket_id = 'inquiry-photos') = 0
  then 'PASS stranger sees no inquiries or photos' else 'FAIL stranger' end;
rollback;
begin; select pg_temp.as_user('00000000-0000-0000-0000-00000000000e','aal2'); set local role authenticated;
select case when (select count(*) from public.inquiries) = 0 and (select count(*) from public.dumpster_rentals) = 0 and (select count(*) from public.estimate_costing) = 0
  and (select count(*) from storage.objects where bucket_id = 'inquiry-photos') = 0
  then 'PASS employee sees no inquiries, dumpster costs, costing or photos' else 'FAIL employee' end;
rollback;
begin; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','aal1'); set local role authenticated;
select case when (select count(*) from public.inquiries) = 0 and (select count(*) from storage.objects where bucket_id = 'inquiry-photos') = 0
  then 'PASS admin without two-step sees nothing' else 'FAIL admin aal1' end;
rollback;

-- ===== Admin with two-step login =====
begin; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','aal2'); set local role authenticated;
select case when (select count(*) from public.inquiries where full_name = 'Casey Inquiry') = 1 and (select count(*) from public.inquiry_photos) = 1
  and (select count(*) from storage.objects where bucket_id = 'inquiry-photos') = 1 then 'PASS admin sees inquiry, photo record and photo file' else 'FAIL admin read' end;
update public.inquiries set status = 'reviewing', admin_notes = 'Call Tuesday' where full_name = 'Casey Inquiry';
select case when (select status from public.inquiries where full_name = 'Casey Inquiry') = 'reviewing' then 'PASS admin updates status and notes' else 'FAIL admin update' end;
do $$ begin insert into storage.objects (bucket_id, name) values ('inquiry-photos', 'x/admin.jpg'); raise notice 'FAIL admin uploaded directly';
  exception when insufficient_privilege then raise notice 'PASS even admins cannot upload photos directly (server only)'; end $$;
-- Inquiry -> customer -> estimate with costing
insert into public.customers (full_name, email) values ('Casey Inquiry', 'casey@example.com');
update public.inquiries set customer_id = (select id from public.customers where full_name = 'Casey Inquiry') where full_name = 'Casey Inquiry';
insert into public.estimates (customer_name, customer_email, property_address, status, line_items, deposit_amount, inquiry_id, share_token,
  scope_of_work, dumpster_count, dumpster_size_yards, dumpster_weight_allowance_tons, dumpster_rental_days, overage_rate_per_ton, extra_day_rate, overage_terms)
select full_name, email, property_address, 'sent', '[{"name":"Hoarding clean-out","unit":"flat","unit_price":2400,"quantity":1}]', 525, id, repeat('k', 43),
  'Clear all rooms and basement; keep photo albums.', 1, 20, 3, 7, 75, 15, 'Overages passed through at cost with your approval.'
from public.inquiries where full_name = 'Casey Inquiry';
insert into public.estimate_costing (estimate_id, dumpster_cost, labor_hours, labor_rate, other_costs, contingency_pct, target_margin_pct)
select id, 525, 24, 22, 60, 10, 35 from public.estimates where share_token = repeat('k', 43);
select case when (select count(*) from public.estimate_costing) = 1 then 'PASS admin saves internal costing' else 'FAIL costing' end;
do $$ begin insert into public.estimate_costing (estimate_id, target_margin_pct) select id, 95 from public.estimates where share_token = repeat('k', 43) on conflict (estimate_id) do update set target_margin_pct = 95;
  raise notice 'FAIL 95%% margin allowed'; exception when check_violation then raise notice 'PASS impossible margins rejected'; end $$;
-- Dumpster rental on a job, recorded once as an expense
insert into public.jobs (title, status) values ('Casey cleanout', 'scheduled');
insert into public.expenses (expense_date, description, category_id, amount, job_id)
select current_date, '20-yd dumpster', c.id, 525, j.id from public.expense_categories c, public.jobs j where c.name = 'Dumpster rental' and j.title = 'Casey cleanout';
insert into public.dumpster_rentals (job_id, provider_name, provider_contact, size_yards, base_cost, included_days, weight_allowance_tons, overage_rate_per_ton, extra_day_rate,
  delivery_date, expected_pickup_date, permit_required, confirmation_number, base_expense_id)
select j.id, 'Sample Roll-Off Co.', '313-555-0199', 20, 525, 7, 3, 75, 15, current_date + 3, current_date + 10, false, 'R-123', e.id
from public.jobs j, public.expenses e where j.title = 'Casey cleanout' and e.description = '20-yd dumpster';
insert into public.dumpster_rentals (job_id, size_yards) select id, 10 from public.jobs where title = 'Casey cleanout';
select case when (select count(*) from public.dumpster_rentals) = 2 then 'PASS a job can have more than one dumpster' else 'FAIL two dumpsters' end;
do $$ begin insert into public.dumpster_rentals (job_id, delivery_date, expected_pickup_date) select id, current_date, current_date - 1 from public.jobs where title = 'Casey cleanout';
  raise notice 'FAIL pickup before delivery'; exception when check_violation then raise notice 'PASS pickup cannot be before delivery'; end $$;
delete from public.expenses where description = '20-yd dumpster';
select case when (select base_expense_id from public.dumpster_rentals where confirmation_number = 'R-123') is null then 'PASS deleting the expense unlinks it, rental kept' else 'FAIL expense link' end;
commit;

-- ===== Expense categories =====
-- (an expense recorded before this update, under the old truck category)
insert into public.expenses (expense_date, description, category_id, amount)
select current_date - 30, 'Box truck rental (before the dumpster model)', id, 140 from public.expense_categories where name = 'Truck rental';
select case when (select active from public.expense_categories where name = 'Dumpster rental') and (select active from public.expense_categories where name = 'Dumpster overage & extra-day fees')
  and (select active from public.expense_categories where name = 'Permits & placement fees') and not (select active from public.expense_categories where name = 'Truck rental')
  then 'PASS dumpster categories added, truck rental hidden for new entries' else 'FAIL categories' end;
select case when (select count(*) from public.expenses e join public.expense_categories c on c.id = e.category_id where c.name = 'Truck rental' and e.description like 'Box truck rental (before%') = 1
  then 'PASS old truck rental expenses are kept' else 'FAIL truck history' end;

-- ===== Customer quote page shows the allowance, never internal costing =====
set role service_role;
select case when q ->> 'scope_of_work' like 'Clear all rooms%' and (q ->> 'dumpster_size_yards')::numeric = 20 and (q ->> 'dumpster_weight_allowance_tons')::numeric = 3
  and (q ->> 'dumpster_rental_days')::int = 7 and (q ->> 'overage_rate_per_ton')::numeric = 75 and q ->> 'overage_terms' like 'Overages%'
  then 'PASS quote link shows scope and dumpster allowance' else 'FAIL quote fields ' || q::text end
from (select public.get_shared_estimate(repeat('k', 43)) as q) s;
select case when not (q ? 'dumpster_cost') and not (q ? 'labor_hours') and not (q ? 'target_margin_pct') and not (q ? 'inquiry_id') and q::text not like '%Call Tuesday%'
  then 'PASS quote link never includes costing, inquiry or private notes' else 'FAIL leak ' || q::text end
from (select public.get_shared_estimate(repeat('k', 43)) as q) s;
select (public.accept_shared_estimate(repeat('k', 43), 'deposit')) is not null;
select case when i.status = 'won' and i.job_id is not null then 'PASS accepting the quote marks the inquiry won' else 'FAIL inquiry won' end
from public.inquiries i where full_name = 'Casey Inquiry';
reset role;

-- ===== Clear demo data keeps real inquiries =====
insert into public.inquiries (full_name, email, phone, property_address, cleanout_type, description, consent, is_demo)
values ('Demo Person', 'demo@example.com', '3135550100', '1 Demo St', 'Other', 'Sample inquiry text', true, true);
begin; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','aal2'); set local role authenticated;
select 'cleared ' || public.clear_demo_data();
select case when (select count(*) from public.inquiries where is_demo) = 0 and (select count(*) from public.inquiries where full_name = 'Casey Inquiry') = 1
  then 'PASS clear demo removes sample inquiries, keeps real ones' else 'FAIL clear demo inquiries' end;
rollback;
