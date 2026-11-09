\set QUIET on
\pset tuples_only on
\pset format unaligned
insert into public.user_roles values ('00000000-0000-0000-0000-00000000000a','admin'), ('00000000-0000-0000-0000-00000000000e','employee') on conflict do nothing;
update public.employees set user_id = '00000000-0000-0000-0000-00000000000e' where full_name = 'Demo Crew Member A';
create function pg_temp.as_user(p_sub text, p_aal text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'aal', p_aal, 'role', 'authenticated')::text, true); end $$;

begin; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','aal2'); set local role authenticated;
insert into public.estimates (customer_name, line_items, discount_type, discount_value, subtotal, total)
values ('Test Customer', '[{"name":"Full load","unit":"load","unit_price":650,"quantity":1.5},
                           {"name":"Mattress","unit":"item","unit_price":40,"quantity":1,"minimum_charge":95},
                           {"name":"Labor","unit":"hour","unit_price":45.55,"quantity":2.25}]', 'percent', 10, 1, 1);
-- 975 + 95 (minimum) + round(102.4875,2)=102.49 => 1172.49; 10% = 117.249 -> 117.25; total 1055.24
select case when subtotal = 1172.49 and discount_total = 117.25 and total = 1055.24 then 'PASS totals computed by database (fake totals ignored)' else 'FAIL totals ' || subtotal || ' ' || discount_total || ' ' || total end from public.estimates where customer_name = 'Test Customer';
select case when number = 1001 then 'PASS first estimate is #1001' else 'FAIL number ' || number end from public.estimates where customer_name = 'Test Customer';
update public.estimates set discount_type = 'amount', discount_value = 5000 where customer_name = 'Test Customer';
select case when discount_total = 1172.49 and total = 0 then 'PASS discount never more than subtotal' else 'FAIL cap ' || total end from public.estimates where customer_name = 'Test Customer';
update public.estimates set total = 1, subtotal = 1 where customer_name = 'Test Customer';
select case when total = 0 and subtotal = 1172.49 then 'PASS totals cannot be overwritten' else 'FAIL overwrite' end from public.estimates where customer_name = 'Test Customer';
do $$ begin
  begin insert into public.estimates (customer_name, line_items) values ('X', '[{"name":"A","unit_price":10,"quantity":0}]'); raise notice 'FAIL zero quantity accepted';
  exception when check_violation then raise notice 'PASS zero quantity rejected'; end;
  begin insert into public.estimates (customer_name, line_items) values ('X', '[{"name":"A","unit_price":-5,"quantity":1}]'); raise notice 'FAIL negative price accepted';
  exception when check_violation then raise notice 'PASS negative price rejected'; end;
  begin insert into public.estimates (customer_name, line_items) values ('X', '[{"unit_price":5,"quantity":1}]'); raise notice 'FAIL nameless line accepted';
  exception when check_violation then raise notice 'PASS line without name rejected'; end;
  begin insert into public.estimates (customer_name, discount_type, discount_value) values ('X', 'percent', 150); raise notice 'FAIL 150 percent accepted';
  exception when check_violation then raise notice 'PASS percent over 100 rejected'; end;
  begin insert into public.estimates (customer_name, line_items) values ('X', '{"not":"array"}'); raise notice 'FAIL non-array accepted';
  exception when check_violation then raise notice 'PASS line items must be a list'; end;
  begin insert into public.estimates (customer_name) values ('   '); raise notice 'FAIL blank name accepted';
  exception when check_violation then raise notice 'PASS blank customer name rejected'; end;
end $$;
insert into public.estimates (customer_name, is_demo) values ('Sample estimate', true);
select 'cleared ' || public.clear_demo_data();
select case when exists (select 1 from public.estimates where customer_name = 'Test Customer') and not exists (select 1 from public.estimates where is_demo) then 'PASS clear demo removes sample estimates only' else 'FAIL clear demo' end;
commit;

begin; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','aal1'); set local role authenticated;
select case when count(*) = 0 then 'PASS admin without two-step sees no estimates' else 'FAIL aal1 sees estimates' end from public.estimates;
rollback;
begin; select pg_temp.as_user('00000000-0000-0000-0000-00000000000e','aal2'); set local role authenticated;
select case when count(*) = 0 then 'PASS employee sees no estimates' else 'FAIL employee sees estimates' end from public.estimates;
do $$ begin insert into public.estimates (customer_name) values ('sneaky'); raise notice 'FAIL employee created estimate';
exception when insufficient_privilege then raise notice 'PASS employee cannot create estimates'; end $$;
rollback;
begin; set local role anon;
do $$ begin perform 1 from public.estimates; raise notice 'FAIL anon read estimates';
exception when insufficient_privilege then raise notice 'PASS signed-out visitors blocked from estimates'; end $$;
rollback;
