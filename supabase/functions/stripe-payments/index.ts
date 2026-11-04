// Supabase Edge Function: stripe-payments
// Creates (or cancels) a Stripe payment link for a job. Only a signed-in admin who
// passed two-step login can use it: the database's is_admin() check decides.
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   STRIPE_SECRET_KEY   your Stripe secret key (sk_live_... or sk_test_...)
// Supabase provides SUPABASE_URL and SUPABASE_ANON_KEY automatically.
// Keep "Verify JWT" ON for this function.
//
// Written without outside libraries so it can be pasted into the dashboard editor.

const ALLOWED_ORIGINS = ['https://hoardhounds.com', 'http://localhost:5173'];
const STRIPE_API = 'https://api.stripe.com/v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function reply(origin, status, body) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } });
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

// Calls the database as the signed-in user, so row-level security applies.
async function db(env, fetchImpl, auth, path, init = {}) {
  const res = await fetchImpl(`${env.SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: auth, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || `Database error ${res.status}`);
  return data;
}

export async function handle(req, env, fetchImpl = fetch) {
  const origin = req.headers.get('Origin') || '';
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return reply(origin, 405, { error: 'Use POST.' });
  if (!env.STRIPE_SECRET_KEY) return reply(origin, 500, { error: 'Online payments aren’t set up yet (missing Stripe key).' });

  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return reply(origin, 401, { error: 'Please sign in again.' });

  try {
    const isAdmin = await db(env, fetchImpl, auth, '/rpc/is_admin', { method: 'POST', body: '{}' });
    if (isAdmin !== true) return reply(origin, 403, { error: 'Only an admin with two-step login can do that.' });

    const body = await req.json().catch(() => ({}));

    if (body.action === 'cancel') {
      if (!UUID.test(body.request_id || '')) return reply(origin, 400, { error: 'Missing payment request.' });
      const [request] = await db(env, fetchImpl, auth, `/payment_requests?id=eq.${body.request_id}&select=id,status,stripe_payment_link_id`);
      if (!request) return reply(origin, 404, { error: 'That payment request no longer exists.' });
      if (request.status !== 'open') return reply(origin, 409, { error: 'Only open payment links can be cancelled.' });
      if (request.stripe_payment_link_id) {
        await stripe(env, fetchImpl, `/payment_links/${request.stripe_payment_link_id}`, { active: 'false' });
      }
      await db(env, fetchImpl, auth, `/payment_requests?id=eq.${request.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
      return reply(origin, 200, { ok: true });
    }

    if (body.action !== 'create') return reply(origin, 400, { error: 'Unknown action.' });
    const kind = body.kind === 'deposit' ? 'deposit' : body.kind === 'payment' ? 'payment' : null;
    const cents = Number(body.amount_cents);
    if (!UUID.test(body.job_id || '') || !kind) return reply(origin, 400, { error: 'Missing job or payment type.' });
    if (!Number.isInteger(cents) || cents < 50 || cents > 99999999) return reply(origin, 400, { error: 'The amount must be at least $0.50.' });
    const description = String(body.description || '').trim().slice(0, 200);

    // Read the job as the admin (also confirms it exists and they can see it).
    const [job] = await db(env, fetchImpl, auth, `/jobs?id=eq.${body.job_id}&select=id,title`);
    if (!job) return reply(origin, 404, { error: 'That job no longer exists.' });

    const label = `Hoard Hounds ${kind === 'deposit' ? 'deposit' : 'payment'}: ${job.title}`.slice(0, 250);
    const price = await stripe(env, fetchImpl, '/prices', {
      currency: 'usd',
      unit_amount: String(cents),
      'product_data[name]': label,
    });
    // No payment_method_types: Stripe shows every method turned on in your dashboard
    // (cards, Klarna, Affirm...) that fits this amount.
    const link = await stripe(env, fetchImpl, '/payment_links', {
      'line_items[0][price]': price.id,
      'line_items[0][quantity]': '1',
      'restrictions[completed_sessions][limit]': '1',
      'after_completion[type]': 'hosted_confirmation',
      'after_completion[hosted_confirmation][custom_message]': 'Thank you! Your payment to Hoard Hounds LLC was received.',
      'metadata[job_id]': job.id,
      'metadata[kind]': kind,
      // Also on the payment itself, so the webhook can always tell which job it's for.
      'payment_intent_data[metadata][job_id]': job.id,
      'payment_intent_data[metadata][kind]': kind,
      ...(description ? { 'payment_intent_data[description]': description } : {}),
    });

    try {
      const [saved] = await db(env, fetchImpl, auth, '/payment_requests', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          job_id: job.id, kind, amount: (cents / 100).toFixed(2), description: description || null,
          stripe_payment_link_id: link.id, url: link.url,
        }),
      });
      return reply(origin, 200, { request: saved });
    } catch (saveError) {
      // Don't leave a working link the dashboard doesn't know about.
      await stripe(env, fetchImpl, `/payment_links/${link.id}`, { active: 'false' }).catch(() => {});
      throw saveError;
    }
  } catch (err) {
    return reply(origin, 502, { error: err.message || 'Something went wrong.' });
  }
}

if (typeof Deno !== 'undefined') {
  Deno.serve((req) => handle(req, Deno.env.toObject()));
}
