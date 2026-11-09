\set QUIET on
\pset tuples_only on
\pset format unaligned
insert into public.user_roles values ('00000000-0000-0000-0000-00000000000a','admin'), ('00000000-0000-0000-0000-00000000000e','employee') on conflict do nothing;
update public.employees set user_id = '00000000-0000-0000-0000-00000000000e' where full_name = 'Demo Crew Member A';
create function pg_temp.as_user(p_sub text, p_aal text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'aal', p_aal, 'role', 'authenticated')::text, true); end $$;
begin; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','aal2'); set local role authenticated;
insert into public.jobs (title) values ('Real job');
insert into public.payment_requests (job_id, kind, amount, stripe_payment_link_id, url) select id, 'deposit', 150, 'plink_test1', 'https://buy.stripe.com/x' from public.jobs where title = 'Real job';
select case when count(*) = 1 then 'PASS admin creates payment request' else 'FAIL' end from public.payment_requests;
do $$ begin insert into public.payment_requests (job_id, kind, amount) select id, 'refund', 10 from public.jobs limit 1; raise notice 'FAIL refund request allowed';
exception when check_violation then raise notice 'PASS refunds cannot be requested'; end $$;
do $$ begin insert into public.payment_requests (job_id, kind, amount) select id, 'payment', 0.10 from public.jobs limit 1; raise notice 'FAIL tiny amount allowed';
exception when check_violation then raise notice 'PASS amount must be at least 50 cents'; end $$;
commit;
begin; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','aal1'); set local role authenticated;
select case when count(*) = 0 then 'PASS admin without two-step sees no payment requests' else 'FAIL' end from public.payment_requests;
rollback;
begin; select pg_temp.as_user('00000000-0000-0000-0000-00000000000e','aal2'); set local role authenticated;
select case when count(*) = 0 then 'PASS employee sees no payment requests' else 'FAIL' end from public.payment_requests;
rollback;
begin; set local role anon;
do $$ begin perform 1 from public.payment_requests; raise notice 'FAIL anon'; exception when insufficient_privilege then raise notice 'PASS visitors blocked'; end $$;
rollback;
-- webhook (server, bypasses RLS like the service key): duplicate session recorded once
insert into public.job_payments (job_id, received_on, kind, amount, stripe_session_id) select job_id, current_date, 'deposit', 150, 'cs_test_1' from public.payment_requests limit 1;
do $$ begin insert into public.job_payments (job_id, received_on, kind, amount, stripe_session_id) select job_id, current_date, 'deposit', 150, 'cs_test_1' from public.payment_requests limit 1; raise notice 'FAIL duplicate session recorded';
exception when unique_violation then raise notice 'PASS same Stripe checkout can only be recorded once'; end $$;
begin; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','aal2'); set local role authenticated;
insert into public.payment_requests (job_id, kind, amount, is_demo) select id, 'payment', 5, true from public.jobs limit 1;
select 'cleared ' || public.clear_demo_data();
select case when exists (select 1 from public.payment_requests where stripe_payment_link_id = 'plink_test1') and not exists (select 1 from public.payment_requests where is_demo) then 'PASS clear demo keeps real requests' else 'FAIL clear demo' end;
rollback;
