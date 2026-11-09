\set QUIET on
\pset tuples_only on
\pset format unaligned
insert into public.user_roles values ('00000000-0000-0000-0000-00000000000a','admin') on conflict do nothing;
create function pg_temp.as_user(p_sub text, p_aal text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'aal', p_aal, 'role', 'authenticated')::text, true); end $$;
-- admin creates an estimate and shares it
begin; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','aal2'); set local role authenticated;
insert into public.estimates (customer_name, customer_email, property_address, status, valid_until, line_items, deposit_amount, notes, share_token)
values ('Pat Quote', 'pat@example.com', '1 Main St', 'sent', current_date + 10,
  '[{"name":"Load","unit":"flat","unit_price":500,"quantity":1}]', 100, 'gate code 1234', repeat('a', 43));
insert into public.estimates (customer_name, status, estimate_date, valid_until, line_items, share_token)
values ('Old Quote', 'sent', current_date - 31, current_date - 2, '[{"name":"Load","unit":"flat","unit_price":200,"quantity":1}]', repeat('b', 43));
insert into public.estimates (customer_name, status, line_items, share_token)
values ('No Thanks', 'declined', '[{"name":"Load","unit":"flat","unit_price":200,"quantity":1}]', repeat('c', 43));
select case when (select quote_message from public.business_settings) like 'Thanks%' then 'PASS admin reads quote template' else 'FAIL template' end;
update public.business_settings set default_valid_days = 14;
select case when (select default_valid_days from public.business_settings) = 14 then 'PASS admin edits quote template' else 'FAIL edit template' end;
do $$ begin perform public.get_shared_estimate(repeat('a', 43)); raise notice 'FAIL admin user can call get_shared_estimate directly';
exception when insufficient_privilege then raise notice 'PASS signed-in users cannot call quote lookup directly'; end $$;
commit;
do $$ begin insert into public.estimates (customer_name, line_items, share_token) values ('x', '[]', 'short'); raise notice 'FAIL short token';
exception when check_violation then raise notice 'PASS short tokens rejected'; end $$;
begin; set local role anon;
do $$ begin perform public.get_shared_estimate(repeat('a', 43)); raise notice 'FAIL anon lookup';
exception when insufficient_privilege then raise notice 'PASS visitors cannot call quote lookup'; end $$;
do $$ begin perform public.accept_shared_estimate(repeat('a', 43), 'later'); raise notice 'FAIL anon accept';
exception when insufficient_privilege then raise notice 'PASS visitors cannot call accept'; end $$;
do $$ begin perform 1 from public.business_settings; raise notice 'FAIL anon settings';
exception when insufficient_privilege then raise notice 'PASS visitors cannot read settings'; end $$;
rollback;
begin; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','aal1'); set local role authenticated;
select case when count(*) = 0 then 'PASS admin without two-step cannot read settings' else 'FAIL aal1 settings' end from public.business_settings;
rollback;
-- as the server function
set role service_role;
select case when public.get_shared_estimate(repeat('a', 43)) ->> 'customer_name' = 'Pat Quote'
  and (public.get_shared_estimate(repeat('a', 43)) ->> 'total')::numeric = 500
  and public.get_shared_estimate(repeat('a', 43)) ->> 'quote_message' like 'Thanks%'
  and not (public.get_shared_estimate(repeat('a', 43)) ? 'customer_email')
  and not (public.get_shared_estimate(repeat('a', 43)) ? 'customer_phone')
  and not (public.get_shared_estimate(repeat('a', 43)) ? 'id')
  then 'PASS link shows the quote without private contact fields' else 'FAIL lookup ' || public.get_shared_estimate(repeat('a', 43))::text end;
select case when public.get_shared_estimate(repeat('z', 43)) is null and public.get_shared_estimate('') is null and public.get_shared_estimate(null) is null
  then 'PASS wrong or empty link shows nothing' else 'FAIL bad token' end;
do $$ begin perform public.accept_shared_estimate(repeat('a', 43), 'free'); raise notice 'FAIL bad option';
exception when invalid_parameter_value then raise notice 'PASS unknown option rejected'; end $$;
do $$ begin perform public.accept_shared_estimate(repeat('b', 43), 'later'); raise notice 'FAIL expired accepted';
exception when raise_exception then raise notice 'PASS expired quote cannot be accepted (%)', sqlerrm; end $$;
do $$ begin perform public.accept_shared_estimate(repeat('c', 43), 'later'); raise notice 'FAIL declined accepted';
exception when raise_exception then raise notice 'PASS declined quote cannot be accepted (%)', sqlerrm; end $$;
do $$ begin perform public.accept_shared_estimate(repeat('z', 43), 'later'); raise notice 'FAIL missing accepted';
exception when no_data_found then raise notice 'PASS wrong link cannot accept'; end $$;
create temp table r1 as select public.accept_shared_estimate(repeat('a', 43), 'deposit') as r;
create temp table r2 as select public.accept_shared_estimate(repeat('a', 43), 'full') as r;
select case when (select r ->> 'job_id' from r1) = (select r ->> 'job_id' from r2) then 'PASS accepting twice gives one job' else 'FAIL two jobs' end;
select case when (select count(*) from public.jobs where title = 'Pat Quote cleanout') = 1
  and (select count(*) from public.customers where full_name = 'Pat Quote') = 1 then 'PASS one job and one customer created' else 'FAIL counts' end;
select case when e.status = 'accepted' and e.accepted_via = 'deposit' and e.accepted_at is not null and e.job_id is not null
  and j.status = 'scheduled' and j.crew_notes = 'gate code 1234' and f.agreed_price = 500
  then 'PASS estimate marked accepted, job scheduled with agreed price' else 'FAIL accepted state' end
from public.estimates e join public.jobs j on j.id = e.job_id join public.job_financials f on f.job_id = j.id where e.share_token = repeat('a', 43);
select case when (select r ->> 'customer_email' from r1) = 'pat@example.com' and (select (r ->> 'deposit_amount')::numeric from r1) = 100
  and (select (r ->> 'received')::numeric from r1) = 0 then 'PASS accept returns payment details' else 'FAIL accept result' end;
insert into public.job_payments (job_id, received_on, kind, amount) select (r ->> 'job_id')::uuid, current_date, 'deposit', 100 from r1;
select case when (public.get_shared_estimate(repeat('a', 43)) ->> 'received')::numeric = 100 then 'PASS link shows amount already paid' else 'FAIL received' end;
reset role;
-- accepted quote stays payable after its valid-until date
update public.estimates set estimate_date = current_date - 30, valid_until = current_date - 5 where share_token = repeat('a', 43);
set role service_role;
select case when public.accept_shared_estimate(repeat('a', 43), 'full') ->> 'job_id' is not null then 'PASS accepted quote can still be paid after expiry' else 'FAIL' end;
reset role;
