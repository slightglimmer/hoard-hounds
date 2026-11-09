// SAMPLE DATA for demo mode only. Every amount, vendor and record here is made up
// and marked is_demo so the app labels it. Nothing is saved anywhere.

import { toISODate } from '../dates.js';
import { recurrenceDate } from '../recurrence.js';
import { computeTotals } from '../estimate.js';

// Same starting categories as the database migration.
// (Truck rental is kept for old records but hidden from new entries.)
const CATEGORY_SEED = [
  ['Dumpster rental', 'Rent or lease: vehicles, machinery, equipment'],
  ['Dumpster overage & extra-day fees', 'Rent or lease: vehicles, machinery, equipment'],
  ['Permits & placement fees', 'Taxes and licenses'],
  ['Dump & disposal fees', 'Other expenses'],
  ['Truck rental', 'Rent or lease: vehicles, machinery, equipment', false],
  ['Fuel', 'Car and truck expenses'],
  ['Vehicle repairs & maintenance', 'Car and truck expenses'],
  ['Equipment & tools', 'Supplies'],
  ['Supplies', 'Supplies'],
  ['Contract labor', 'Contract labor'],
  ['Insurance', 'Insurance (other than health)'],
  ['Advertising & marketing', 'Advertising'],
  ['Software & subscriptions', 'Other expenses'],
  ['Phone & internet', 'Utilities'],
  ['Licenses, permits & fees', 'Taxes and licenses'],
  ['Professional services', 'Legal and professional services'],
  ['Office expenses', 'Office expense'],
  ['Meals', 'Meals'],
  ['Other', 'Other expenses'],
];

// Small deterministic random generator so the demo looks the same on every load.
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

let counter = 0;
export const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `demo-${Date.now()}-${++counter}`;

export function buildDemoData(today = new Date()) {
  const rand = seeded(42);
  const between = (lo, hi) => Math.round((lo + rand() * (hi - lo)) * 100) / 100;
  const todayStr = toISODate(today);
  const stamp = new Date().toISOString();

  const categories = CATEGORY_SEED.map(([name, tax_category, active = true], i) => ({
    id: newId(),
    name,
    tax_category,
    active,
    sort_order: (i + 1) * 10,
  }));
  const cat = (name) => categories.find((c) => c.name === name).id;

  // Sample crew. Rates are made up for the demo.
  const employees = [
    ['Sample Crew Lead Jordan', 22, 'Leads estate and hoarding clean-outs'],
    ['Sample Crew Member Avery', 18.5, null],
    ['Sample Crew Member Sam', 17, 'Weekends only'],
  ].map(([full_name, rate, notes], i) => ({
    id: newId(), user_id: null, full_name, email: null, phone: null, hourly_rate: rate.toFixed(2), active: true,
    hired_on: toISODate(new Date(today.getFullYear() - 1, 2 + i * 3, 1)), notes, is_demo: true,
  }));
  const assignments = [];
  const thisWeekStart = toISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7)));
  const logHours = (job, employee, date, hours) => {
    timeEntries.push({
      id: newId(), employee_id: employee.id, job_id: job.id, work_date: date, hours: hours.toFixed(2), hourly_rate: employee.hourly_rate,
      // This week's hours are still waiting for approval; older ones are approved.
      status: date >= thisWeekStart ? 'submitted' : 'approved', notes: null, is_demo: true, created_at: stamp,
    });
    if (!assignments.some((a) => a.job_id === job.id && a.employee_id === employee.id)) assignments.push({ job_id: job.id, employee_id: employee.id, is_demo: true });
  };

  const expenses = [];
  const payments = [];
  const timeEntries = [];
  const jobs = [];
  const financials = [];
  const add = (expense_date, vendor, description, category, amount, payment_method = 'card', job_id = null) => {
    if (expense_date > todayStr) return;
    expenses.push({
      id: newId(), expense_date, vendor, description, category_id: cat(category), amount: amount.toFixed(2),
      payment_method, notes: null, recurring_expense_id: null, job_id, is_demo: true, created_at: stamp,
    });
  };

  // Sample customers, reused across jobs the way real repeat clients would be.
  const customers = [
    ['Sample Realtor Dana', 'Sample Realty Group', 'real_estate_agent'],
    ['Sample Investor Marcus', 'Sample Holdings LLC', 'investor'],
    ['Sample Landlord Priya', null, 'landlord'],
    ['Sample Property Manager Lee', 'Sample Property Co.', 'property_manager'],
    ['Sample Estate Rep. Gloria', null, 'estate_representative'],
    ['Sample Homeowner Tom', null, 'homeowner'],
    ['Sample Homeowner Keisha', null, 'homeowner'],
  ].map(([full_name, company, customer_type]) => ({
    id: newId(), full_name, company, customer_type, email: null, phone: null, notes: 'Sample customer', is_demo: true,
  }));
  const SERVICE_NAMES = ['Vacant Property Cleanouts', 'Estate Cleanouts', 'Rental Property Cleanouts', 'Furniture & Junk Removal', 'Investor Property Cleanouts', 'Garage & Basement Cleanouts'];
  const STREETS = ['Beech Daly Rd', 'Inkster Rd', 'Five Mile Rd', 'Telegraph Rd', 'Plymouth Rd', 'Grand River Ave', 'Joy Rd', 'Seven Mile Rd'];
  const CITIES = ['Redford', 'Detroit', 'Livonia', 'Dearborn', 'Southfield', 'Westland'];
  let jobCount = 0;
  const makeJob = (date, status) => {
    jobCount += 1;
    const customer = customers[Math.floor(rand() * customers.length)];
    const service = SERVICE_NAMES[Math.floor(rand() * SERVICE_NAMES.length)];
    const job = {
      id: newId(), customer_id: customer.id, title: `${service.replace(/s$/, '')} (sample)`,
      property_address: `${100 + jobCount * 7} ${STREETS[jobCount % STREETS.length]}, ${CITIES[jobCount % CITIES.length]}, MI`,
      service_type: service, status, scheduled_date: date, completed_date: status === 'completed' ? date : null,
      crew_notes: null, is_demo: true, created_at: stamp,
    };
    jobs.push(job);
    return job;
  };

  // Fifteen months of sample activity, ending today.
  for (let back = 14; back >= 0; back -= 1) {
    const first = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const y = first.getFullYear();
    const m = first.getMonth();
    const day = (d) => toISODate(new Date(y, m, d));
    const season = [0.55, 0.6, 0.85, 1, 1.15, 1.2, 1.25, 1.2, 1.1, 1, 0.8, 0.6][m];
    const jobsThisMonth = Math.max(2, Math.round(5 * season + rand() * 2));

    for (let j = 0; j < jobsThisMonth; j += 1) {
      const d = day(2 + Math.floor(rand() * 26));
      const price = Math.round(between(380, 1450));
      if (d > todayStr) {
        // Upcoming work: scheduled with a deposit, or still a lead.
        const job = makeJob(d, rand() > 0.4 ? 'scheduled' : 'quoted');
        financials.push({ job_id: job.id, quoted_amount: price.toFixed(2), agreed_price: job.status === 'scheduled' ? price.toFixed(2) : null, admin_notes: null, is_demo: true });
        if (job.status === 'scheduled') payments.push({ id: newId(), job_id: job.id, received_on: todayStr, kind: 'deposit', amount: '150.00', method: 'card', notes: null, is_demo: true });
        continue;
      }
      const job = makeJob(d, 'completed');
      financials.push({ job_id: job.id, quoted_amount: price.toFixed(2), agreed_price: price.toFixed(2), admin_notes: null, is_demo: true });
      payments.push({ id: newId(), job_id: job.id, received_on: d, kind: 'deposit', amount: '150.00', method: 'card', notes: null, is_demo: true });
      // A couple of recent jobs still owe their balance.
      if (back > 0 || rand() > 0.5) {
        payments.push({ id: newId(), job_id: job.id, received_on: d, kind: 'payment', amount: (price - 150).toFixed(2), method: 'card', notes: null, is_demo: true });
      }
      add(d, 'Sample Roll-Off Co.', 'Dumpster rental', 'Dumpster rental', between(325, 560), 'card', job.id);
      if (rand() > 0.35) {
        const fee = between(40, 120);
        if (fee > 100) add(d, 'Sample Roll-Off Co.', 'Extra rental day', 'Dumpster overage & extra-day fees', fee, 'card', job.id);
      }
      logHours(job, employees[0], d, between(4, 8));
      if (price > 800) logHours(job, employees[1 + (jobCount % 2)], d, between(4, 7));
    }

    add(day(4), 'Sample Gas Station', 'Fuel', 'Fuel', between(90, 180));
    add(day(18), 'Sample Gas Station', 'Fuel', 'Fuel', between(80, 160));
    add(day(9), 'Sample Hardware', 'Contractor bags, gloves, straps', 'Supplies', between(35, 95));
    if (m % 3 === 1) add(day(12), 'Sample Print Shop', 'Door hangers & flyers', 'Advertising & marketing', between(60, 180));
    if (m % 4 === 2) add(day(22), 'Sample Auto Care', 'Oil change & inspection', 'Vehicle repairs & maintenance', between(85, 240));
    if (rand() > 0.6) add(day(16), 'Sample Diner', 'Crew lunch', 'Meals', between(28, 64));
  }

  // Recurring charges, already posted up to last month so a few are due now.
  const recurring = [
    { vendor: 'Sample Insurance Co.', description: 'General liability policy (sample)', category: 'Insurance', amount: 145, frequency: 'monthly', day: 15, method: 'bank_transfer' },
    { vendor: 'Sample Mobile', description: 'Business phone line (sample)', category: 'Phone & internet', amount: 55, frequency: 'monthly', day: 20, method: 'card' },
    { vendor: 'Sample Software', description: 'Website, email & storage (sample)', category: 'Software & subscriptions', amount: 18, frequency: 'monthly', day: 2, method: 'card' },
  ].map((r) => {
    const start = toISODate(new Date(today.getFullYear(), today.getMonth() - 14, r.day));
    const row = {
      id: newId(), vendor: r.vendor, description: r.description, category_id: cat(r.category), amount: r.amount.toFixed(2),
      payment_method: r.method, frequency: r.frequency, start_date: start, end_date: null, occurrences_posted: 0,
      next_due_date: start, active: true, notes: null, is_demo: true,
    };
    // Post every charge before this month.
    const monthStart = toISODate(new Date(today.getFullYear(), today.getMonth(), 1));
    while (row.next_due_date < monthStart) {
      expenses.push({
        id: newId(), expense_date: row.next_due_date, vendor: row.vendor, description: row.description, category_id: row.category_id,
        amount: row.amount, payment_method: row.payment_method, notes: null, recurring_expense_id: row.id, job_id: null, is_demo: true, created_at: stamp,
      });
      row.occurrences_posted += 1;
      row.next_due_date = recurrenceDate(row.start_date, row.frequency, row.occurrences_posted);
    }
    return row;
  });

  expenses.sort((a, b) => (a.expense_date < b.expense_date ? 1 : -1));
  // Sample price sheet: made-up prices for the demo, not Hoard Hounds' real rates.
  const priceItems = [
    ['Mattress or appliance fee', 'Items the dumpster company charges extra to accept', 'item', 95, 95],
    ['10-yard dumpster (arranged)', 'Delivery, pickup and disposal through a dumpster rental company', 'flat', 450, null],
    ['20-yard dumpster (arranged)', 'Delivery, pickup and disposal through a dumpster rental company', 'flat', 595, null],
    ['30-yard dumpster (arranged)', 'Delivery, pickup and disposal through a dumpster rental company', 'flat', 725, null],
    ['Clean-out crew labor', 'Sorting, bagging, carrying and loading, per crew member', 'hour', 45, null],
    ['Stairs or long carry', 'Added when items come from upper floors or far from the dumpster', 'flat', 50, null],
  ].map(([name, description, unit, price, min], i) => ({
    id: newId(), name, description, unit, unit_price: price.toFixed(2), minimum_charge: min === null ? null : min.toFixed(2),
    active: true, sort_order: (i + 1) * 10, is_demo: true,
  }));

  const line = (p, quantity) => ({
    price_item_id: p.id, name: p.name, description: p.description, unit: p.unit, unit_price: p.unit_price,
    minimum_charge: p.minimum_charge, quantity: String(quantity),
  });
  const daysAgo = (n) => toISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n));
  const estimates = [
    { number: 1001, customer_name: 'Sample Customer A', property_address: '123 Sample St, Redford, MI', status: 'accepted', estimate_date: daysAgo(12),
      line_items: [line(priceItems[3], 1), line(priceItems[4], 2)], discount_type: null, discount_value: null, deposit_amount: '150.00' },
    { number: 1002, customer_name: 'Sample Customer B', property_address: '456 Example Ave, Livonia, MI', status: 'sent', estimate_date: daysAgo(3),
      line_items: [line(priceItems[2], 1), line(priceItems[5], 1)], discount_type: 'percent', discount_value: '10.00', deposit_amount: null },
  ].map((e) => {
    const t = computeTotals(e.line_items, e.discount_type, e.discount_value);
    return {
      id: newId(), customer_email: null, customer_phone: null, valid_until: null, notes: null, terms: null, customer_id: null, job_id: null,
      share_token: null, accepted_at: null, accepted_via: null, inquiry_id: null, scope_of_work: null, dumpster_count: null,
      dumpster_size_yards: null, dumpster_weight_allowance_tons: null, dumpster_rental_days: null, overage_rate_per_ton: null,
      extra_day_rate: null, overage_terms: null, is_demo: true, ...e,
      subtotal: (t.subtotal / 100).toFixed(2), discount_total: (t.discount / 100).toFixed(2), total: (t.total / 100).toFixed(2),
    };
  });

  // A brand-new lead with no date yet.
  const lead = makeJob(null, 'lead');
  financials.push({ job_id: lead.id, quoted_amount: null, agreed_price: null, admin_notes: null, is_demo: true });
  // Always at least one upcoming, booked job (the random months above may not include one).
  const upcoming = makeJob(toISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5)), 'scheduled');
  financials.push({ job_id: upcoming.id, quoted_amount: '1650.00', agreed_price: '1650.00', admin_notes: null, is_demo: true });
  payments.push({ id: newId(), job_id: upcoming.id, received_on: todayStr, kind: 'deposit', amount: '425.00', method: 'card', notes: null, is_demo: true });
  // And one happening today.
  const current = makeJob(todayStr, 'in_progress');
  financials.push({ job_id: current.id, quoted_amount: '875.00', agreed_price: '875.00', admin_notes: null, is_demo: true });
  payments.push({ id: newId(), job_id: current.id, received_on: todayStr, kind: 'deposit', amount: '150.00', method: 'card', notes: null, is_demo: true });
  add(todayStr, 'Sample Roll-Off Co.', 'Dumpster rental', 'Dumpster rental', 525, 'card', current.id);
  logHours(current, employees[0], todayStr, 5.5);
  logHours(current, employees[1], todayStr, 5);
  // Crew already lined up for upcoming work.
  for (const job of jobs.filter((j) => j.status === 'scheduled')) assignments.push({ job_id: job.id, employee_id: employees[0].id, is_demo: true });

  // Sample website requests, with sample "photos" (drawings, not real pictures).
  const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();
  const inquiry = (fields) => ({
    id: newId(), status: 'new', source: 'website', email: 'sample@example.com', phone: '(313) 555-0100', property_type: null, occupancy: null,
    rooms: null, volume: null, access: null, driveway: null, restrictions: null, keep_items: null, hazards: null, preferred_date: null,
    date_is_deadline: false, consent: true, photo_count: 0, photos_failed: 0, admin_notes: null, customer_id: null, job_id: null, is_demo: true, ...fields,
  });
  const realtor = customers.find((c) => c.full_name.startsWith('Sample Realtor')) || customers[0];
  const inquiries = [
    inquiry({
      number: 103, created_at: hoursAgo(2), full_name: 'Sample Customer Morgan', email: 'morgan@example.com', phone: '(313) 555-0177',
      property_address: '214 Sample Ave, Redford, MI 48239', cleanout_type: 'Hoarding Clean-Outs',
      description: 'My late uncle’s house. Every room is very full and the basement is hard to walk through. We want to sell in the spring.',
      property_type: 'house', occupancy: 'vacant', rooms: '5-7', volume: 'heavy', access: 'stairs', driveway: 'yes',
      keep_items: 'Family photos, military medals and paperwork in the bedroom closet.', hazards: 'A few old paint cans in the basement.',
      preferred_date: toISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 21)), date_is_deadline: false, photo_count: 3,
    }),
    inquiry({
      number: 102, status: 'reviewing', created_at: hoursAgo(30), full_name: realtor.full_name, email: 'realtor@example.com',
      property_address: '88 Example Ct, Livonia, MI 48150', cleanout_type: 'Pre-Sale & Real Estate Clean-Outs',
      description: 'Listing goes live in two weeks. Furniture and boxes left in the garage and two bedrooms.',
      property_type: 'house', occupancy: 'vacant', rooms: '3-4', volume: 'moderate', access: 'ground', driveway: 'yes',
      preferred_date: toISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 12)), date_is_deadline: true, photo_count: 2,
      admin_notes: 'Agent says the lockbox code is with the office. Measure the driveway at the walkthrough.', customer_id: realtor.id,
    }),
    inquiry({
      number: 101, status: 'quoted', created_at: hoursAgo(24 * 5), full_name: 'Sample Customer B', property_address: '456 Example Ave, Livonia, MI',
      cleanout_type: 'Tenant Move-Out Clean-Outs', description: 'Tenant moved out and left furniture, a mattress and bags of trash.',
      occupancy: 'vacant', rooms: '3-4', volume: 'moderate', driveway: 'street_only', restrictions: 'Street parking only; HOA asks for 48 hours notice.',
    }),
  ];
  estimates.find((e) => e.number === 1002).inquiry_id = inquiries[2].id;
  const photo = (label, wall, floor) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="${wall}"/><rect y="200" width="400" height="100" fill="${floor}"/><rect x="40" y="140" width="90" height="70" fill="#C79A63"/><rect x="60" y="100" width="70" height="45" fill="#B98A55"/><rect x="150" y="160" width="120" height="50" fill="#8E7A6B"/><rect x="290" y="120" width="60" height="90" fill="#C79A63"/><rect x="300" y="95" width="45" height="30" fill="#B98A55"/><text x="200" y="40" font-family="sans-serif" font-size="18" text-anchor="middle" fill="#5a4a42">Sample photo: ${label}</text></svg>`)}`;
  const inquiryPhotos = [
    [0, 'living room', '#E8DCCB', '#A88B6A'], [0, 'basement', '#D5D2CC', '#8D8A85'], [0, 'bedroom', '#E4D7E0', '#9C8A7C'],
    [1, 'garage', '#D9D4C7', '#9A958B'], [1, 'bedroom', '#E6E0D2', '#A98F72'],
  ].map(([i, label, wall, floor]) => ({
    id: newId(), inquiry_id: inquiries[i].id, storage_path: `${inquiries[i].id}/${newId()}.jpg`, content_type: 'image/jpeg', size_bytes: 180000,
    url: photo(label, wall, floor), is_demo: true, created_at: inquiries[i].created_at,
  }));

  // Sample internal costing for estimate #1002, and a dumpster for the upcoming job.
  const costing = [{ estimate_id: estimates.find((e) => e.number === 1002).id, dumpster_cost: '450.00', labor_hours: '12.00', labor_rate: '20.00',
    other_costs: '40.00', contingency_pct: '10.00', target_margin_pct: '30.00', notes: null, is_demo: true }];
  const plusDays = (n) => toISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n));
  const dumpsters = [{
    id: newId(), job_id: upcoming.id, provider_name: 'Sample Roll-Off Co.', provider_contact: '(313) 555-0142 · dispatch@example.com',
    size_yards: '20.0', base_cost: '525.00', included_days: 7, weight_allowance_tons: '3.00', overage_rate_per_ton: '75.00', extra_day_rate: '15.00',
    delivery_date: plusDays(4), expected_pickup_date: plusDays(11), actual_pickup_date: null,
    placement_notes: 'Driveway, left side. Owner OK’d it; boards under the wheels.', permit_required: false, permit_notes: null,
    confirmation_number: 'SAMPLE-2041', actual_overage_charges: null, base_expense_id: null, overage_expense_id: null, notes: null,
    is_demo: true, created_at: stamp,
  }];

  return { categories, expenses, recurring, payments, timeEntries, priceItems, estimates, customers, jobs, financials, employees, assignments, paymentRequests: [],
    inquiries, inquiryPhotos, costing, dumpsters,
    settings: {
      id: 1,
      quote_message: 'Thanks for considering Hoard Hounds! Here’s your quote. When you’re ready, accept below to book your clean-out.',
      default_terms: 'This estimate is based on the photos and details provided. The final price is confirmed with you after a walkthrough or on arrival, before any work begins.',
      default_valid_days: 30,
      default_deposit: null,
      default_overage_terms: 'Your price includes the dumpster allowance shown above. If the dumpster provider charges extra for weight over that allowance, for keeping the dumpster longer than the included rental days, or for items they don’t accept, we will show you the provider’s documentation (such as the weight ticket or invoice) and get your approval before billing you for those charges. We never charge a saved card automatically.',
      default_labor_rate: '20.00',
      default_contingency_pct: '10.00',
      default_target_margin_pct: '30.00',
    },
  };
}
