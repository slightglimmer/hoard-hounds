import { createHmac } from 'node:crypto';
const q = await import(new URL('../../supabase/functions/public-quote/index.ts', import.meta.url).href);
const hook = await import(new URL('../../supabase/functions/stripe-webhook/index.ts', import.meta.url).href);
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const env = { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_test', SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service' };
const TOK = 'A'.repeat(43);
const JOB = '11111111-1111-4111-8111-111111111111';
function mock({ quote = { number: 1001, total: 500 }, accept = { job_id: JOB, number: 1001, customer_email: 'pat@example.com', total: 500, deposit_amount: 100, received: 0 }, acceptError = null } = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    const u = new URL(url); calls.push({ url, body: init.body, headers: init.headers });
    const J = (s, d) => new Response(JSON.stringify(d), { status: s });
    if (u.pathname === '/rest/v1/rpc/get_shared_estimate') return J(200, JSON.parse(init.body).p_token === TOK ? quote : null);
    if (u.pathname === '/rest/v1/rpc/accept_shared_estimate') return acceptError ? J(400, { code: 'P0001', message: acceptError }) : J(200, accept);
    if (u.pathname === '/v1/checkout/sessions') return J(200, { id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' });
    if (u.pathname.startsWith('/v1/payment_intents/')) return J(200, { id: 'pi_1', metadata: {}, payment_method: { type: 'klarna' } });
    if (u.pathname === '/rest/v1/payment_requests') return J(200, []);
    if (u.pathname === '/rest/v1/job_payments') return J(201, [{ id: 'pay-1', ...JSON.parse(init.body) }]);
    return J(404, { message: 'unmocked ' + url });
  };
  f.calls = calls; return f;
}
const req = (body, origin = 'https://hoardhounds.com') => new Request('https://p.supabase.co/functions/v1/public-quote', { method: 'POST', headers: { Origin: origin }, body: JSON.stringify(body) });
const params = (f) => new URLSearchParams(f.calls.find((c) => c.url.includes('/checkout/sessions')).body);

let f = mock(); let r = await q.handle(req({ action: 'get', token: TOK }), env, f); let d = await r.json();
ok(r.status === 200 && d.quote.number === 1001, 'get returns the quote');
ok(f.calls[0].headers.Authorization === 'Bearer service', 'uses server key for the lookup');
ok(r.headers.get('Cache-Control') === 'no-store', 'quote is not cached');
r = await q.handle(req({ action: 'get', token: 'B'.repeat(43) }), env, mock()); ok(r.status === 404, 'unknown link -> 404');
f = mock(); r = await q.handle(req({ action: 'get', token: 'short' }), env, f); ok(r.status === 404 && f.calls.length === 0, 'malformed link rejected without touching the database');
r = await q.handle(req({ action: 'get', token: TOK + "'; drop" }), env, mock()); ok(r.status === 404, 'odd characters rejected');
r = await q.handle(new Request('https://x', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }), env, mock()); ok(r.headers.get('Access-Control-Allow-Origin') === 'http://localhost:5173', 'CORS preflight');
r = await q.handle(req({ action: 'get', token: TOK }, 'https://evil.example'), env, mock()); ok(r.headers.get('Access-Control-Allow-Origin') === 'https://hoardhounds.com', 'other sites not allowed by CORS');

f = mock(); r = await q.handle(req({ action: 'accept', token: TOK, option: 'later' }), env, f); d = await r.json();
ok(r.status === 200 && d.accepted && !d.checkout_url && !f.calls.some((c) => c.url.includes('stripe')), 'pay later accepts without Stripe');
ok(JSON.parse(f.calls[0].body).p_via === 'later', 'passes the chosen option');

f = mock(); r = await q.handle(req({ action: 'accept', token: TOK, option: 'deposit', amount: 1 }), env, f); d = await r.json();
let p = params(f);
ok(d.checkout_url === 'https://checkout.stripe.com/c/pay/cs_1', 'deposit returns checkout link');
ok(p.get('line_items[0][price_data][unit_amount]') === '10000', 'deposit amount from the database ($100), not the browser');
ok(p.get('payment_intent_data[metadata][job_id]') === JOB && p.get('payment_intent_data[metadata][kind]') === 'deposit', 'payment tagged with job and deposit');
ok(p.get('customer_email') === 'pat@example.com', 'email prefilled');
ok(!p.has('payment_method_types[0]'), 'Klarna etc. allowed (no fixed method list)');
ok(p.get('success_url') === `https://hoardhounds.com/quote/?paid=1#${TOK}` && p.get('cancel_url') === `https://hoardhounds.com/quote/#${TOK}`, 'returns to the quote page');

f = mock(); r = await q.handle(req({ action: 'accept', token: TOK, option: 'full' }), env, f); p = params(f);
ok(p.get('line_items[0][price_data][unit_amount]') === '50000' && p.get('payment_intent_data[metadata][kind]') === 'payment', 'pay in full charges the total as a payment');
f = mock({ accept: { job_id: JOB, number: 1001, total: 500, deposit_amount: 100, received: 100 } });
r = await q.handle(req({ action: 'accept', token: TOK, option: 'full' }), env, f); p = params(f);
ok(p.get('line_items[0][price_data][unit_amount]') === '40000', 'after a deposit, pays only what is left ($400)');
ok(!p.has('customer_email'), 'no email -> not prefilled');
f = mock({ accept: { job_id: JOB, number: 1001, total: 500, deposit_amount: 100, received: 450 } });
r = await q.handle(req({ action: 'accept', token: TOK, option: 'deposit' }), env, f); p = params(f);
ok(p.get('line_items[0][price_data][unit_amount]') === '5000', 'deposit never more than what is left');
f = mock({ accept: { job_id: JOB, number: 1001, total: 500, deposit_amount: 100, received: 500 } });
r = await q.handle(req({ action: 'accept', token: TOK, option: 'full' }), env, f); d = await r.json();
ok(d.nothing_due && !f.calls.some((c) => c.url.includes('stripe')), 'already paid -> no charge');
f = mock({ accept: { job_id: JOB, number: 1001, total: 500, deposit_amount: null, received: 0 } });
r = await q.handle(req({ action: 'accept', token: TOK, option: 'deposit' }), env, f); ok(r.status === 400, 'no deposit set -> deposit option refused');

r = await q.handle(req({ action: 'accept', token: TOK, option: 'free' }), env, mock()); ok(r.status === 400, 'unknown option refused');
r = await q.handle(req({ action: 'accept', token: TOK, option: 'later' }), env, mock({ acceptError: 'expired' })); d = await r.json();
ok(r.status === 410 && /expired/.test(d.error) && /734-589-7627/.test(d.error), 'expired quote -> friendly message with phone');
r = await q.handle(req({ action: 'accept', token: TOK, option: 'later' }), env, mock({ acceptError: 'boom secret detail' })); d = await r.json();
ok(r.status === 502 && !d.error.includes('secret detail'), 'internal errors not shown to customers');
r = await q.handle(req({ action: 'accept', token: TOK, option: 'full' }), { ...env, STRIPE_SECRET_KEY: '' }, mock()); ok(r.status === 503, 'no Stripe key -> asks to pay later');
r = await q.handle(req({ action: 'get', token: TOK }), { STRIPE_SECRET_KEY: 'x' }, mock()); ok(r.status === 500, 'missing server setup handled');

// webhook records a quote checkout (no payment link) using the session's own details
const sign = (body, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac('sha256', 'whsec_test').update(`${t}.${body}`).digest('hex')}`;
const body = JSON.stringify({ type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000), data: { object: { id: 'cs_q1', payment_status: 'paid', amount_total: 10000, payment_intent: 'pi_1', payment_link: null, metadata: { job_id: JOB, kind: 'deposit' } } } });
f = mock(); r = await hook.handle(new Request('https://x', { method: 'POST', headers: { 'Stripe-Signature': sign(body) }, body }), env, f);
const rec = f.calls.find((c) => c.url.includes('job_payments'));
ok(r.status === 200 && rec && JSON.parse(rec.body).job_id === JOB && JSON.parse(rec.body).kind === 'deposit' && JSON.parse(rec.body).amount === '100.00', 'webhook records the quote deposit on the job');
