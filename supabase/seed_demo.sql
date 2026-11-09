-- OPTIONAL demo data. Every row is marked is_demo = true, shows a "Demo" badge in
-- the admin, and can be removed with the "Clear demo data" button (or
-- `select public.clear_demo_data();` while signed in as an admin).
-- These are made-up people, jobs and amounts, not real business records.
-- Run in the Supabase SQL editor only if you want sample data to explore with.

do $$
declare
  cat uuid;
  m integer;
  months integer := extract(month from current_date)::integer;
  yr integer := extract(year from current_date)::integer;
  emp_a uuid;
  emp_b uuid;
  cust uuid;
  job uuid;
  d date;
begin
  insert into public.employees (full_name, hourly_rate, hired_on, notes, is_demo)
  values ('Demo Crew Member A', 20.00, make_date(yr, 1, 6), 'Sample employee', true)
  returning id into emp_a;
  insert into public.employees (full_name, hourly_rate, hired_on, notes, is_demo)
  values ('Demo Crew Member B', 18.50, make_date(yr, 3, 2), 'Sample employee', true)
  returning id into emp_b;

  insert into public.price_items (name, description, unit, unit_price, minimum_charge, sort_order, is_demo) values
    ('Mattress or appliance fee', 'Items the dumpster company charges extra to accept', 'item', 95, 95, 10, true),
    ('10-yard dumpster (arranged)', 'Delivery, pickup and disposal through a dumpster rental company', 'flat', 450, null, 20, true),
    ('20-yard dumpster (arranged)', 'Delivery, pickup and disposal through a dumpster rental company', 'flat', 595, null, 30, true),
    ('30-yard dumpster (arranged)', 'Delivery, pickup and disposal through a dumpster rental company', 'flat', 725, null, 40, true),
    ('Clean-out crew labor (per crew member)', 'Sorting, bagging, carrying and loading', 'hour', 45, null, 50, true);

  for m in 1..months loop
    -- Two sample jobs a month, each with a customer, payments, hours and job costs.
    for i in 1..2 loop
      d := make_date(yr, m, least(6 + i * 9, 28));
      insert into public.customers (full_name, customer_type, notes, is_demo)
      values (format('Demo Customer %s-%s', m, i), (array['real_estate_agent', 'investor', 'landlord', 'homeowner'])[1 + (m + i) % 4], 'Sample customer', true)
      returning id into cust;

      insert into public.jobs (customer_id, title, property_address, service_type, status, scheduled_date, completed_date, is_demo)
      values (
        cust, format('Demo cleanout %s-%s', m, i), format('%s Demo St, Redford, MI', 100 + m * 10 + i),
        (array['Vacant Property Cleanouts', 'Estate Cleanouts', 'Rental Property Cleanouts', 'Garage & Basement Cleanouts'])[1 + (m * i) % 4],
        case when d <= current_date then 'completed'::public.job_status else 'scheduled'::public.job_status end,
        d, case when d <= current_date then d end, true
      )
      returning id into job;

      insert into public.job_financials (job_id, quoted_amount, agreed_price, is_demo)
      values (job, 600 + m * 35 + i * 120, 600 + m * 35 + i * 120, true);

      insert into public.job_assignments (job_id, employee_id, is_demo) values (job, emp_a, true);
      if i = 2 then
        insert into public.job_assignments (job_id, employee_id, is_demo) values (job, emp_b, true);
      end if;

      if d <= current_date then
        insert into public.job_payments (job_id, received_on, kind, amount, method, is_demo) values
          (job, d - 5, 'deposit', 150, 'card', true),
          (job, d, 'payment', 600 + m * 35 + i * 120 - 150, 'card', true);

        insert into public.time_entries (employee_id, job_id, work_date, hours, status, is_demo)
        values (emp_a, job, d, 5 + i, 'approved', true);
        if i = 2 then
          insert into public.time_entries (employee_id, job_id, work_date, hours, status, is_demo)
          values (emp_b, job, d, 6, 'approved', true);
        end if;

        -- 'Dumpster rental' comes with the inquiries & dumpster update; 'Other' if it hasn't been run.
        select id into cat from public.expense_categories where name in ('Dumpster rental', 'Other')
        order by name = 'Dumpster rental' desc limit 1;
        insert into public.expenses (expense_date, vendor, description, category_id, amount, payment_method, job_id, is_demo)
        values (d, 'Demo Roll-Off Co.', '20-yard dumpster rental', cat, 425 + i * 50, 'card', job, true);

        select id into cat from public.expense_categories where name = 'Supplies';
        insert into public.expenses (expense_date, vendor, description, category_id, amount, payment_method, job_id, is_demo)
        values (d, 'Demo Hardware', 'Contractor bags and gloves', cat, 42, 'card', job, true);
      end if;
    end loop;

    -- A few general expenses each month.
    d := make_date(yr, m, 3);
    if d <= current_date then
      select id into cat from public.expense_categories where name = 'Fuel';
      insert into public.expenses (expense_date, vendor, description, category_id, amount, payment_method, is_demo)
      values (d, 'Demo Gas Station', 'Fuel', cat, 70 + (m % 3) * 15, 'card', true);

      select id into cat from public.expense_categories where name = 'Supplies';
      insert into public.expenses (expense_date, vendor, description, category_id, amount, payment_method, is_demo)
      values (d + 1, 'Demo Hardware', 'Contractor bags, gloves, straps', cat, 42 + (m % 4) * 8, 'card', true);
    end if;
  end loop;

  -- Recurring charges; post them from the Expenses page with "Post due charges".
  select id into cat from public.expense_categories where name = 'Insurance';
  insert into public.recurring_expenses (vendor, description, category_id, amount, payment_method, frequency, start_date, is_demo)
  values ('Demo Insurance Co.', 'Monthly policy payment (sample)', cat, 145, 'bank_transfer', 'monthly', make_date(yr, 1, 15), true);

  select id into cat from public.expense_categories where name = 'Phone & internet';
  insert into public.recurring_expenses (vendor, description, category_id, amount, payment_method, frequency, start_date, is_demo)
  values ('Demo Mobile', 'Business phone line (sample)', cat, 55, 'card', 'monthly', make_date(yr, 1, 20), true);

  select id into cat from public.expense_categories where name = 'Software & subscriptions';
  insert into public.recurring_expenses (vendor, description, category_id, amount, payment_method, frequency, start_date, is_demo)
  values ('Demo Software', 'Website & email (sample)', cat, 120, 'card', 'yearly', make_date(yr, 2, 1), true);
end;
$$;
