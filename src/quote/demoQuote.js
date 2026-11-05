// A sample quote for hoardhounds.com/quote/#demo, so you can see what customers see.
// Nothing here talks to the database or Stripe.

export const DEMO_TOKEN = 'demo';
const KEY = 'hh-demo-quote';

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit' }).format(d);
}

function saved() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}
function save(state) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private browsing: the sample just won't remember what you clicked.
  }
}

export function demoQuote() {
  const s = saved();
  return {
    number: 1001,
    customer_name: 'Sample Customer',
    property_address: '123 Sample St, Redford, MI',
    status: s.accepted_at ? 'accepted' : 'sent',
    estimate_date: addDays(0),
    valid_until: addDays(30),
    line_items: [
      { name: 'Full house cleanout', description: 'Furniture, boxes and household items, 3-bedroom ranch', unit: 'load', unit_price: 450, quantity: 2, minimum_charge: null },
      { name: 'Mattress disposal', description: null, unit: 'item', unit_price: 50, quantity: 2, minimum_charge: null },
      { name: 'Broom sweep', description: 'Floors swept once everything is out', unit: 'flat', unit_price: 75, quantity: 1, minimum_charge: null },
    ],
    discount_type: 'amount',
    discount_value: 25,
    subtotal: 1075,
    discount_total: 25,
    total: 1050,
    deposit_amount: 200,
    notes: 'Please leave the garage door unlocked on cleanout day.',
    terms: 'This estimate is based on the photos and details provided. The final price is confirmed with you after a walkthrough or on arrival, before any work begins.',
    accepted_at: s.accepted_at || null,
    accepted_via: s.accepted_via || null,
    received: s.received || 0,
    quote_message: 'Thanks for considering Hoard Hounds! Here’s your quote. When you’re ready, accept below to book your cleanout.',
  };
}

// Acts like the real thing: paying "sends" you to checkout, which here is just the thank-you page.
export async function demoAccept(option) {
  await new Promise((r) => setTimeout(r, 400));
  const s = saved();
  const q = demoQuote();
  const remaining = q.total - q.received;
  const next = { ...s, accepted_at: s.accepted_at || new Date().toISOString(), accepted_via: s.accepted_via || option };
  if (option === 'later') {
    save(next);
    return { accepted: true };
  }
  next.received = q.received + (option === 'deposit' ? Math.min(q.deposit_amount, remaining) : remaining);
  save(next);
  return { accepted: true, checkout_url: `/quote/?paid=1&t=${Date.now()}#${DEMO_TOKEN}` };
}

export function resetDemo() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing saved
  }
}
