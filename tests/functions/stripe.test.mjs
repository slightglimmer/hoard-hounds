import { createHmac } from 'node:crypto';
const pay = await import(new URL('../../supabase/functions/stripe-payments/index.ts', import.meta.url).href);
const hook = await import(new URL('../../supabase/functions/stripe-webhook/index.ts', import.meta.url).href);
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const JOB = '11111111-1111-4111-8111-111111111111';
const env = { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_test', SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };

function mockFetch({ admin = true, job = true, failInsert = false, linkForWebhook = 'plink_1', piType = 'klarna', piMeta = {} } = {}) {
  const calls = []; const payments = new Map();
  const f = async (url, init = {}) => {
    const u = new URL(url); const method = init.method || 'GET'; const body = init.body;
    calls.push({ url, method, body, headers: init.headers });
    const J = (s, d) => new Response(d === undefined ? null : JSON.stringify(d), { status: s });
    if (u.host === 'api.stripe.com') {
      if (u.pathname === '/v1/prices') return J(200, { id: 'price_1' });
      if (u.pathname === '/v1/payment_links') return J(200, { id: 'plink_1', url: 'https://buy.stripe.com/test_abc' });
      if (u.pathname.startsWith('/v1/payment_links/')) return J(200, { id: 'plink_1', active: false });
      if (u.pathname.startsWith('/v1/payment_intents/')) return J(200, { id: 'pi_1', metadata: piMeta, payment_method: { type: piType } });
    }
    if (u.pathname === '/rest/v1/rpc/is_admin') return J(200, admin);
    if (u.pathname === '/rest/v1/jobs') return J(200, job ? [{ id: JOB, title: 'Maple St cleanout' }] : []);
    if (u.pathname === '/rest/v1/payment_requests' && method === 'POST') return failInsert ? J(500, { message: 'db down' }) : J(201, [{ id: 'req-1', ...JSON.parse(body) }]);
    if (u.pathname === '/rest/v1/payment_requests' && method === 'GET') {
      if (u.searchParams.get('stripe_payment_link_id')) return J(200, linkForWebhook && u.searchParams.get('stripe_payment_link_id') === `eq.${linkForWebhook}` ? [{ id: 'req-1', job_id: JOB, kind: 'deposit' }] : []);
      return J(200, [{ id: '22222222-2222-4222-8222-222222222222', status: 'open', stripe_payment_link_id: 'plink_1' }]);
    }
    if (u.pathname === '/rest/v1/payment_requests' && method === 'PATCH') return J(204);
    if (u.pathname === '/rest/v1/job_payments') {
      const row = JSON.parse(body);
      if (payments.has(row.stripe_session_id)) return J(201, []); // ignore-duplicates
      payments.set(row.stripe_session_id, row); return J(201, [{ id: 'pay-1', ...row }]);
    }
    return J(404, { message: 'unmocked ' + url });
  };
  f.calls = calls; f.payments = payments; return f;
}
const req = (body, headers = {}) => new Request('https://p.supabase.co/functions/v1/stripe-payments', { method: 'POST', headers: { Origin: 'https://hoardhounds.com', Authorization: 'Bearer user-jwt', ...headers }, body: JSON.stringify(body) });

// ---- stripe-payments
let f = mockFetch();
let r = await pay.handle(req({ action: 'create', job_id: JOB, kind: 'deposit', amount_cents: 15000, description: 'Deposit to book' }), env, f);
let d = await r.json();
ok(r.status === 200 && d.request.url === 'https://buy.stripe.com/test_abc' && d.request.amount === '150.00', 'admin creates a $150 deposit link');
const linkCall = f.calls.find((c) => c.url.endsWith('/v1/payment_links'));
const lp = new URLSearchParams(linkCall.body);
ok(lp.get('restrictions[completed_sessions][limit]') === '1' && lp.get('payment_intent_data[metadata][job_id]') === JOB && !lp.has('payment_method_types[0]'), 'link: single use, job on payment, all enabled methods (Klarna) allowed');
ok(linkCall.headers.Authorization === 'Bearer sk_test_x' && f.calls.filter((c) => c.url.includes('/rest/v1/')).every((c) => c.headers.Authorization === 'Bearer user-jwt'), 'Stripe key only sent to Stripe; database calls use the signed-in user');
ok(r.headers.get('Access-Control-Allow-Origin') === 'https://hoardhounds.com', 'CORS allows hoardhounds.com');
r = await pay.handle(req({ action: 'create', job_id: JOB, kind: 'deposit', amount_cents: 15000 }, { Origin: 'https://evil.example' }), env, mockFetch());
ok(r.headers.get('Access-Control-Allow-Origin') !== 'https://evil.example', 'CORS does not echo other sites');
f = mockFetch({ admin: false });
r = await pay.handle(req({ action: 'create', job_id: JOB, kind: 'deposit', amount_cents: 15000 }), env, f);
ok(r.status === 403 && !f.calls.some((c) => c.url.includes('stripe.com')), 'non-admin (or no two-step) refused before touching Stripe');
r = await pay.handle(new Request('https://x/', { method: 'POST', body: '{}' }), env, mockFetch());
ok(r.status === 401, 'not signed in refused');
for (const [amount, label] of [[10, '10 cents'], [12.5, 'fractional cents'], ['abc', 'text']]) {
  r = await pay.handle(req({ action: 'create', job_id: JOB, kind: 'payment', amount_cents: amount }), env, mockFetch());
  ok(r.status === 400, `bad amount rejected (${label})`);
}
r = await pay.handle(req({ action: 'create', job_id: 'not-a-uuid', kind: 'payment', amount_cents: 1000 }), env, mockFetch());
ok(r.status === 400, 'bad job id rejected');
r = await pay.handle(req({ action: 'create', job_id: JOB, kind: 'refund', amount_cents: 1000 }), env, mockFetch());
ok(r.status === 400, 'refund links refused');
f = mockFetch({ job: false });
r = await pay.handle(req({ action: 'create', job_id: JOB, kind: 'payment', amount_cents: 1000 }), env, f);
ok(r.status === 404 && !f.calls.some((c) => c.url.includes('stripe.com')), 'unknown job: no Stripe link made');
f = mockFetch({ failInsert: true });
r = await pay.handle(req({ action: 'create', job_id: JOB, kind: 'payment', amount_cents: 1000 }), env, f);
ok(r.status === 502 && f.calls.some((c) => c.url.endsWith('/v1/payment_links/plink_1') && new URLSearchParams(c.body).get('active') === 'false'), 'if saving fails, the Stripe link is switched off');
f = mockFetch();
r = await pay.handle(req({ action: 'cancel', request_id: '22222222-2222-4222-8222-222222222222' }), env, f);
ok(r.status === 200 && f.calls.some((c) => c.url.endsWith('/v1/payment_links/plink_1')) && f.calls.some((c) => c.method === 'PATCH' && c.body.includes('cancelled')), 'cancel switches off link and marks request cancelled');
r = await pay.handle(req({ action: 'create', job_id: JOB, kind: 'payment', amount_cents: 1000 }), { ...env, STRIPE_SECRET_KEY: '' }, mockFetch());
ok(r.status === 500 && (await r.json()).error.includes('aren’t set up'), 'clear message when Stripe key not configured');

// ---- stripe-webhook
const sign = (body, t = Math.floor(Date.now() / 1000), secret = 'whsec_test') => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
const evt = (type, extra = {}) => JSON.stringify({ id: 'evt_1', type, created: Date.UTC(2026, 10, 5, 3, 30) / 1000, data: { object: { id: 'cs_1', payment_link: 'plink_1', payment_intent: 'pi_1', payment_status: 'paid', amount_total: 15000, ...extra } } });
const hookReq = (body, sig) => new Request('https://p.supabase.co/functions/v1/stripe-webhook', { method: 'POST', headers: { 'Stripe-Signature': sig }, body });

let body = evt('checkout.session.completed');
f = mockFetch();
r = await hook.handle(hookReq(body, sign(body)), env, f);
d = await r.json();
const rec = f.payments.get('cs_1');
ok(r.status === 200 && d.recorded && rec.amount === '150.00' && rec.kind === 'deposit' && rec.job_id === JOB, 'paid checkout recorded as $150 deposit on the job');
ok(rec.method === 'other' && rec.notes.includes('Klarna'), 'Klarna payment noted as "Paid online with Klarna"');
ok(rec.received_on === '2026-11-04', 'date is Michigan time (11:30pm Nov 4 ET, not Nov 5 UTC)');
ok(f.calls.some((c) => c.method === 'PATCH' && c.body.includes('"paid"')), 'payment request marked paid');
ok(f.calls.filter((c) => c.url.includes('/rest/v1/')).every((c) => c.headers.Authorization === 'Bearer service'), 'webhook uses server-only service key');
r = await hook.handle(hookReq(body, sign(body)), env, f);
d = await r.json();
ok(d.duplicate && f.payments.size === 1, 'same event twice is recorded once');
r = await hook.handle(hookReq(body, sign(body, undefined, 'whsec_wrong')), env, mockFetch());
ok(r.status === 400, 'wrong signature rejected');
r = await hook.handle(hookReq(body.replace('15000', '1'), sign(body)), env, mockFetch());
ok(r.status === 400, 'tampered amount rejected');
r = await hook.handle(hookReq(body, sign(body, Math.floor(Date.now() / 1000) - 3600)), env, mockFetch());
ok(r.status === 400, 'replayed old event rejected');
r = await hook.handle(hookReq(body, ''), env, mockFetch());
ok(r.status === 400, 'missing signature rejected');
body = evt('checkout.session.completed', { payment_status: 'unpaid' });
f = mockFetch(); r = await hook.handle(hookReq(body, sign(body)), env, f);
ok(r.status === 200 && f.payments.size === 0, 'not-yet-paid checkout not recorded');
body = evt('checkout.session.async_payment_succeeded', { id: 'cs_2' });
f = mockFetch({ piType: 'card' }); r = await hook.handle(hookReq(body, sign(body)), env, f);
ok(f.payments.get('cs_2')?.method === 'card', 'delayed payment recorded when it succeeds (card)');
body = evt('checkout.session.completed', { id: 'cs_3', payment_link: 'plink_unknown' });
f = mockFetch({ piMeta: { job_id: JOB, kind: 'payment' } }); r = await hook.handle(hookReq(body, sign(body)), env, f);
ok(f.payments.get('cs_3')?.job_id === JOB && f.payments.get('cs_3')?.kind === 'payment', 'falls back to job details on the payment if the request is missing');
body = evt('checkout.session.completed', { id: 'cs_4', payment_link: 'plink_unknown' });
f = mockFetch({ piMeta: {} }); r = await hook.handle(hookReq(body, sign(body)), env, f);
ok(r.status === 200 && f.payments.size === 0, 'payments from other Stripe sales are ignored');
body = JSON.stringify({ type: 'customer.created', data: { object: {} } });
r = await hook.handle(hookReq(body, sign(body)), env, mockFetch());
ok(r.status === 200, 'other Stripe events ignored with 200');
