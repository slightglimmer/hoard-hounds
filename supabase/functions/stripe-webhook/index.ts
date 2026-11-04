// Supabase Edge Function: stripe-webhook
// Stripe calls this when a customer pays through a payment link. It checks Stripe's
// signature (so nobody can fake a payment), then records the payment on the job.
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   STRIPE_SECRET_KEY       your Stripe secret key
//   STRIPE_WEBHOOK_SECRET   the signing secret (whsec_...) from the Stripe webhook you create
// Supabase provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY automatically; the
// service key stays on Supabase's servers and is never sent to the website.
// Turn "Verify JWT" OFF for this function: Stripe signs its requests its own way.
//
// Written without outside libraries so it can be pasted into the dashboard editor.

const STRIPE_API = 'https://api.stripe.com/v1';
const TOLERANCE_SECONDS = 300;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Stripe's "Stripe-Signature: t=...,v1=..." check (HMAC-SHA256 of "t.body").
export async function verifySignature(rawBody, header, secret, now = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  let t = 0;
  const signatures = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=');
    if (k === 't') t = Number(v);
    else if (k === 'v1' && v) signatures.push(v);
  }
  if (!t || !signatures.length || Math.abs(now - t) > TOLERANCE_SECONDS) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${rawBody}`)));
  return signatures.some((s) => safeEqual(s, expected));
}

async function db(env, fetchImpl, path, init = {}) {
  const res = await fetchImpl(`${env.SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || `Database error ${res.status}`);
  return data;
}

// Today's date in Michigan, as YYYY-MM-DD.
const michiganDate = (when) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit' }).format(when);

const METHOD_NAMES = { card: 'card', klarna: 'Klarna', affirm: 'Affirm', afterpay_clearpay: 'Afterpay', cashapp: 'Cash App Pay', us_bank_account: 'bank account', link: 'Link' };

export async function handle(req, env, fetchImpl = fetch) {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  const raw = await req.text();
  if (!(await verifySignature(raw, req.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET))) {
    return json(400, { error: 'Bad signature.' });
  }

  const event = JSON.parse(raw);
  const type = event.type;
  if (type !== 'checkout.session.completed' && type !== 'checkout.session.async_payment_succeeded') {
    return json(200, { ignored: type });
  }
  const session = event.data.object;
  // Some methods confirm later; those arrive as async_payment_succeeded.
  if (session.payment_status !== 'paid') return json(200, { waiting: session.payment_status });

  try {
    // Which job is this for? Our saved request first, then the payment's own details.
    let request = null;
    if (session.payment_link) {
      [request] = await db(env, fetchImpl, `/payment_requests?stripe_payment_link_id=eq.${encodeURIComponent(session.payment_link)}&select=id,job_id,kind`);
    }
    let methodType = 'card';
    let piMeta = {};
    if (session.payment_intent) {
      const res = await fetchImpl(`${STRIPE_API}/payment_intents/${session.payment_intent}?expand[]=payment_method`, {
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      });
      if (res.ok) {
        const pi = await res.json();
        methodType = pi.payment_method?.type || methodType;
        piMeta = pi.metadata || {};
      }
    }
    const jobId = request?.job_id || piMeta.job_id;
    const kind = request?.kind || (piMeta.kind === 'deposit' ? 'deposit' : 'payment');
    if (!jobId) return json(200, { ignored: 'not a Hoard Hounds job payment' });

    const amount = (session.amount_total / 100).toFixed(2);
    const name = METHOD_NAMES[methodType] || methodType;
    const inserted = await db(env, fetchImpl, '/job_payments?on_conflict=stripe_session_id', {
      method: 'POST',
      // Stripe can send the same event more than once: record it only the first time.
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({
        job_id: jobId,
        received_on: michiganDate(new Date((event.created || Date.now() / 1000) * 1000)),
        kind,
        amount,
        method: methodType === 'card' ? 'card' : 'other',
        notes: `Paid online with ${name} through Stripe`,
        stripe_session_id: session.id,
      }),
    });
    if (request && inserted?.[0]) {
      await db(env, fetchImpl, `/payment_requests?id=eq.${request.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'paid', job_payment_id: inserted[0].id }),
      });
    }
    return json(200, { recorded: Boolean(inserted?.[0]), duplicate: !inserted?.[0] });
  } catch (err) {
    // A 500 makes Stripe retry later, so a brief outage doesn't lose the payment.
    return json(500, { error: err.message });
  }
}

if (typeof Deno !== 'undefined') {
  Deno.serve((req) => handle(req, Deno.env.toObject()));
}
