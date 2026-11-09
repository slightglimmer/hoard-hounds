// Supabase Edge Function: public-quote
// Powers the customer quote page (hoardhounds.com/quote/#<link code>). Customers
// aren't signed in, so this function does the database work for them, but it can
// only see the one quote whose secret link code it was given, through the two
// database functions made for this (get_shared_estimate / accept_shared_estimate).
//
//   { action: 'get', token }                         -> the quote, customer-safe fields only
//   { action: 'accept', token, option }              -> accepts it; for 'deposit' or 'full'
//                                                       also returns a Stripe checkout URL
//
// Amounts always come from the database, never from the customer's browser.
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   STRIPE_SECRET_KEY         your Stripe secret key (same one stripe-payments uses)
//   ONLINE_PAYMENTS_ENABLED   must be "true" for the deposit / pay-in-full options (off by default);
//                             without it, customers can still view and accept ("pay later")
//   STRIPE_LIVE_APPROVED      must be "true" before a live key (sk_live_...) is accepted
// Supabase provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY automatically.
// Turn "Verify JWT" OFF for this function: customers don't have accounts.
//
// Written without outside libraries so it can be pasted into the dashboard editor.

const ALLOWED_ORIGINS = ['https://hoardhounds.com', 'http://localhost:5173'];
const STRIPE_API = 'https://api.stripe.com/v1';
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OPTIONS = ['deposit', 'full', 'later'];

// Payments stay OFF until you deliberately turn them on, and a live Stripe key is refused
// until live mode is separately approved. Returns an error message, or '' if allowed.
export function paymentsBlocked(env) {
  if (env.ONLINE_PAYMENTS_ENABLED !== 'true') return 'Online payments are turned off.';
  if (!env.STRIPE_SECRET_KEY) return 'Online payments aren’t set up yet (missing Stripe key).';
  if (/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY) && env.STRIPE_LIVE_APPROVED !== 'true') {
    return 'Live Stripe payments haven’t been approved yet. Use a test key, or set STRIPE_LIVE_APPROVED to true once approved.';
  }
  return '';
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function reply(origin, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const cents = (value) => Math.round(Number(value || 0) * 100);

// Runs one of the two quote database functions with the server key.
async function rpc(env, fetchImpl, name, args) {
  const res = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.message || `Database error ${res.status}`);
    err.reason = data?.message;
    throw err;
  }
  return data;
}

async function stripe(env, fetchImpl, path, params) {
  const res = await fetchImpl(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`);
  return data;
}

const PROBLEMS = {
  not_found: [404, 'This quote link isn’t valid anymore. Please call or text us at 734-589-7627.'],
  expired: [410, 'This quote has expired. Call or text us at 734-589-7627 and we’ll get you an updated one.'],
  declined: [409, 'This quote was closed. Call or text us at 734-589-7627 if you’d like a new one.'],
  no_total: [409, 'This quote doesn’t have a price yet. Call or text us at 734-589-7627.'],
};

export async function handle(req, env, fetchImpl = fetch) {
  const origin = req.headers.get('Origin') || '';
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return reply(origin, 405, { error: 'Use POST.' });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return reply(origin, 500, { error: 'Quotes aren’t set up yet. Please call or text us at 734-589-7627.' });
  }

  const body = await req.json().catch(() => ({}));
  const token = String(body.token || '');
  if (!TOKEN.test(token)) return reply(origin, 404, { error: PROBLEMS.not_found[1] });

  try {
    if (body.action === 'get') {
      const quote = await rpc(env, fetchImpl, 'get_shared_estimate', { p_token: token });
      if (!quote) return reply(origin, 404, { error: PROBLEMS.not_found[1] });
      return reply(origin, 200, { quote });
    }

    if (body.action !== 'accept') return reply(origin, 400, { error: 'Unknown action.' });
    const option = OPTIONS.includes(body.option) ? body.option : null;
    if (!option) return reply(origin, 400, { error: 'Please choose how you’d like to pay.' });
    if (option !== 'later' && paymentsBlocked(env)) {
      return reply(origin, 503, { error: 'Online payment isn’t available right now. You can accept the quote and we’ll arrange payment, or call or text us at 734-589-7627.' });
    }

    const accepted = await rpc(env, fetchImpl, 'accept_shared_estimate', { p_token: token, p_via: option });
    if (option === 'later') return reply(origin, 200, { accepted: true });

    const remaining = cents(accepted.total) - cents(accepted.received);
    const deposit = cents(accepted.deposit_amount);
    if (option === 'deposit' && deposit <= 0) {
      return reply(origin, 400, { error: 'This quote doesn’t ask for a deposit. You can pay in full or pay later.' });
    }
    const amount = option === 'deposit' ? Math.min(deposit, remaining) : remaining;
    // Already paid (or less than Stripe's 50 cent minimum left): nothing to charge.
    if (amount < 50) return reply(origin, 200, { accepted: true, nothing_due: true });

    const kind = option === 'deposit' ? 'deposit' : 'payment';
    const site = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const label = `Hoard Hounds quote #${accepted.number}: ${option === 'deposit' ? 'deposit' : 'payment'}`;
    const email = String(accepted.customer_email || '').trim();

    // No payment_method_types: Stripe shows every method turned on in your dashboard
    // (cards, Klarna, Affirm...) that fits this amount.
    const session = await stripe(env, fetchImpl, '/checkout/sessions', {
      mode: 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(amount),
      'line_items[0][price_data][product_data][name]': label,
      success_url: `${site}/quote/?paid=1#${token}`,
      cancel_url: `${site}/quote/#${token}`,
      'metadata[job_id]': accepted.job_id,
      'metadata[kind]': kind,
      // The payment webhook reads these to record the payment on the right job.
      'payment_intent_data[metadata][job_id]': accepted.job_id,
      'payment_intent_data[metadata][kind]': kind,
      'payment_intent_data[description]': label,
      ...(EMAIL.test(email) ? { customer_email: email } : {}),
    });
    return reply(origin, 200, { accepted: true, checkout_url: session.url });
  } catch (err) {
    const problem = PROBLEMS[err.reason];
    if (problem) return reply(origin, problem[0], { error: problem[1] });
    return reply(origin, 502, { error: 'Something went wrong on our end. Please try again, or call or text us at 734-589-7627.' });
  }
}

if (typeof Deno !== 'undefined') {
  Deno.serve((req) => handle(req, Deno.env.toObject()));
}
