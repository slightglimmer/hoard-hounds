const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', aal: 'aal2', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, session_id: 's', amr: [{ method: 'totp', timestamp: 1 }] })}.c2ln`;
const JOB = '11111111-1111-4111-8111-111111111111';
const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', email: 'johnice.edward@gmail.com', factors: [{ id: 'f1', factor_type: 'totp', status: 'verified' }] } };
async function run(b, name, { tableMissing = false, fn = 'ok' }, check) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([s]) => localStorage.setItem('sb-testproj-auth-token', JSON.stringify(s)), [session]);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const calls = [];
  await p.route('https://testproj.supabase.co/**', async (route) => {
    const r = route.request(); const u = new URL(r.url()); const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': '*' };
    const J = (s, d) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(d), headers: h });
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-methods': '*' } });
    const single = (r.headers()['accept'] || '').includes('vnd.pgrst.object');
    if (u.pathname === '/auth/v1/user') return J(200, session.user);
    if (u.pathname === '/rest/v1/user_roles') return J(200, single ? { role: 'admin' } : [{ role: 'admin' }]);
    if (u.pathname === '/rest/v1/jobs') return J(200, single ? { id: JOB, title: 'Maple St cleanout', status: 'completed', customer_id: 'c1' } : [{ id: JOB, title: 'Maple St cleanout', status: 'completed' }]);
    if (u.pathname === '/rest/v1/job_financials') return J(200, single ? { job_id: JOB, agreed_price: 900 } : [{ job_id: JOB, agreed_price: 900 }]);
    if (u.pathname === '/rest/v1/customers') return J(200, [{ id: 'c1', full_name: 'Rhonda Agent', phone: '313-555-0199' }]);
    if (u.pathname === '/rest/v1/payment_requests') return tableMissing ? J(404, { code: 'PGRST205', message: "Could not find the table 'public.payment_requests'" }) : J(200, []);
    if (u.pathname === '/functions/v1/stripe-payments') {
      calls.push({ auth: r.headers()['authorization'], body: r.postDataJSON() });
      if (fn === 'ok') return J(200, { request: { id: 'req1', job_id: JOB, kind: 'payment', amount: '900.00', url: 'https://buy.stripe.com/live_abc', status: 'open', created_at: new Date().toISOString() } });
      if (fn === 'error') return J(400, { error: 'Your Stripe account isn’t activated yet.' });
      return route.fulfill({ status: 404, body: 'Function not found', headers: h });
    }
    if (u.pathname.startsWith('/rest/v1/')) return J(200, single ? null : []);
    return J(200, {});
  });
  await p.goto(`http://localhost:5181/admin/#/jobs/${JOB}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  console.log('--- ' + name);
  await check(p, calls);
  if (errs.length) console.log('page errors', errs);
  await ctx.close();
}
(async () => {
  const b = await chromium.launch();
  await run(b, 'database update not run yet', { tableMissing: true }, async (p) => {
    ok(await p.getByRole('heading', { name: 'Maple St cleanout' }).isVisible(), 'job page still works');
    ok(await p.getByText('Online payments (cards and Klarna) aren’t switched on yet').isVisible(), 'shows "not switched on yet" instead of breaking');
  });
  await run(b, 'working', {}, async (p, calls) => {
    await p.getByRole('button', { name: 'Request online payment' }).click(); await p.waitForTimeout(300);
    const d = p.getByRole('dialog');
    console.log('   form:', await d.getByLabel('What is it for?').inputValue(), JSON.stringify(await d.getByLabel('Amount').inputValue()), '| summary:', (await p.getByRole('complementary', { name: 'Job money summary' }).textContent()).replace(/\s+/g, ' ').slice(0, 90));
    ok((await d.getByLabel('What is it for?').inputValue()) === 'payment' && (await d.getByLabel('Amount').inputValue()) === '900.00', 'completed job defaults to the balance owed');
    await d.getByRole('button', { name: 'Create payment link' }).click(); await p.waitForTimeout(1000);
    ok(await d.getByText('https://buy.stripe.com/live_abc').isVisible(), 'link from server function shown');
    ok(calls[0]?.auth?.startsWith('Bearer eyJ') && calls[0].body.action === 'create' && calls[0].body.amount_cents === 90000 && calls[0].body.job_id === JOB, 'calls server function with signed-in token and whole-cent amount');
    ok((await d.getByRole('link', { name: 'Text it' }).getAttribute('href')).startsWith('sms:313-5550199') || (await d.getByRole('link', { name: 'Text it' }).getAttribute('href')).startsWith('sms:3135550199'), 'text goes to the customer’s phone');
  });
  await run(b, 'server says no', { fn: 'error' }, async (p) => {
    await p.getByRole('button', { name: 'Request online payment' }).click(); await p.waitForTimeout(300);
    const d = p.getByRole('dialog'); await d.getByRole('button', { name: 'Create payment link' }).click(); await p.waitForTimeout(1000);
    ok(await d.getByText('Your Stripe account isn’t activated yet.').isVisible(), 'shows the server’s message');
  });
  await run(b, 'function not deployed', { fn: 'missing' }, async (p) => {
    await p.getByRole('button', { name: 'Request online payment' }).click(); await p.waitForTimeout(300);
    const d = p.getByRole('dialog'); await d.getByRole('button', { name: 'Create payment link' }).click(); await p.waitForTimeout(1000);
    ok(await d.getByText(/aren’t set up yet/).isVisible(), 'friendly "not set up yet" message');
  });
  await b.close();
})();
