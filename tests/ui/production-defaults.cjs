const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', aal: 'aal2', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, session_id: 's', amr: [{ method: 'totp', timestamp: 1 }] })}.c2ln`;
const JOB = '11111111-1111-4111-8111-111111111111';
const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', email: 'johnice.edward@gmail.com', factors: [{ id: 'f1', factor_type: 'totp', status: 'verified' }] } };
// PRODUCTION DEFAULTS: what goes live when no feature switches are set (port 5183:
// VITE_FORM_PROVIDER=endpoint, no VITE_ONLINE_PAYMENTS, no VITE_QUOTE_LINKS).
// Confirms the Formspree form still works exactly as before and payments are off.
const BASE = process.env.HH_PROD_BASE || 'http://localhost:5183';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const TOK = 'Q'.repeat(43);
const EST = '22222222-2222-4222-8222-222222222222';
(async () => {
  const b = await chromium.launch();

  // ---- Public quote form -> Formspree (unchanged)
  {
    const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
    const hits = { formspree: [], supabase: [] };
    await p.route('https://formspree.test/**', (route) => { hits.formspree.push(route.request().postDataBuffer()); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}', headers: { 'access-control-allow-origin': '*' } }); });
    await p.route('https://testproj.supabase.co/**', (route) => { hits.supabase.push(route.request().url()); return route.fulfill({ status: 500, body: '{}' }); });
    await p.goto(BASE + '/#quote', { waitUntil: 'networkidle' }); await p.waitForTimeout(700);
    const f = p.locator('#quote form');
    await f.getByLabel(/Full Name/).fill('Casey Customer');
    await f.getByLabel(/Email Address/).fill('casey@example.com');
    await f.getByLabel(/Phone Number/).fill('313-555-0101');
    await f.getByLabel(/Type of Clean-out/i).selectOption({ index: 1 });
    await f.getByLabel(/Property Address/).fill('12 Oak St, Redford, MI');
    await f.getByLabel(/Description of Project/).fill('Whole house, two floors, very full.');
    await f.locator('input[type=file]').setInputFiles({ name: 'room.png', mimeType: 'image/png', buffer: PNG }); await p.waitForTimeout(500);
    await f.getByLabel(/I agree to be contacted/).check();
    ok(!(await p.getByText(/Preview mode/).count()), 'form is live (not preview mode)');
    await f.getByRole('button', { name: /Request My Free Quote/ }).click(); await p.waitForTimeout(1500);
    const body = (hits.formspree[0] || Buffer.from('')).toString('latin1');
    ok(hits.formspree.length === 1 && body.includes('name="photo1"') && body.includes('Casey Customer') && body.includes('name="consent"'), 'request and photo go to Formspree, as today');
    ok(hits.supabase.length === 0, 'nothing is sent to Supabase from the public form');
    ok((await p.locator('#quote').textContent()).includes('Your request is in.'), 'customer sees the usual thank-you');
    ok(!(await p.locator('iframe[src*="challenges.cloudflare.com"]').count()), 'no spam-check widget unless configured');
    if (errs.length) console.log('page errors', errs);
    await p.close();
  }

  // ---- Customer quote page: accept only, no payment buttons
  {
    const p = await b.newPage(); const sent = [];
    await p.route('https://testproj.supabase.co/**', async (route) => {
      const r = route.request(); const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
      if (r.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: h });
      const body = JSON.parse(r.postData() || '{}'); sent.push(body);
      const J = (d) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d), headers: h });
      if (body.action === 'get') return J({ quote: { number: 1042, customer_name: 'Pat Live', status: 'sent', estimate_date: '2026-11-09', valid_until: '2026-12-09',
        line_items: [{ name: 'Clean-out', unit: 'flat', unit_price: 1800, quantity: 1 }], subtotal: 1800, discount_total: 0, total: 1800, deposit_amount: 525,
        dumpster_count: 1, dumpster_size_yards: 20, dumpster_weight_allowance_tons: 3, dumpster_rental_days: 7, overage_rate_per_ton: 75, extra_day_rate: 15,
        overage_terms: 'Approved charges are passed through at the provider’s actual cost, with no added fee.', received: 0, quote_message: 'Hi' } });
      return J({ accepted: true });
    });
    await p.goto(BASE + '/quote/#' + TOK, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    const t = await p.locator('main').textContent();
    ok(t.includes('Up to 3 tons') && t.includes('$75.00 per extra ton') && t.includes('no added fee') && t.includes('Balance after deposit'), 'allowance, rates and at-cost wording disclosed');
    const buttons = await p.getByRole('button').allTextContents();
    ok(buttons.length === 1 && buttons[0].startsWith('Accept this quote') && !buttons.some((x) => /deposit|pay in full|pay remaining|pay later/i.test(x)) && !t.includes('Stripe') && !t.includes('Klarna'), 'only “Accept this quote”: no payment buttons, no Stripe/Klarna wording');
    await p.getByRole('button', { name: /Accept this quote/ }).click(); await p.waitForTimeout(800);
    ok(sent.some((s) => s.action === 'accept' && s.option === 'later') && !sent.some((s) => ['deposit', 'full'].includes(s.option)), 'accepting never asks for payment');
    await p.close();
  }

  // ---- Admin: payment and quote-link buttons are off
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(([s]) => localStorage.setItem('sb-testproj-auth-token', JSON.stringify(s)), [session]);
    const p = await ctx.newPage(); const fnCalls = [];
    await p.route('https://testproj.supabase.co/**', async (route) => {
      const r = route.request(); const u = new URL(r.url()); const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': '*' };
      const J = (s, d) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(d), headers: h });
      if (r.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-methods': '*' } });
      const single = (r.headers()['accept'] || '').includes('vnd.pgrst.object');
      if (u.pathname.startsWith('/functions/')) { fnCalls.push(u.pathname); return J(404, {}); }
      if (u.pathname === '/auth/v1/user') return J(200, session.user);
      if (u.pathname === '/rest/v1/user_roles') return J(200, single ? { role: 'admin' } : [{ role: 'admin' }]);
      if (u.pathname === '/rest/v1/jobs') return J(200, single ? { id: JOB, title: 'Maple St clean-out', status: 'scheduled', customer_id: null } : [{ id: JOB, title: 'Maple St clean-out', status: 'scheduled' }]);
      if (u.pathname === '/rest/v1/payment_requests') return J(200, []);
      if (u.pathname === '/rest/v1/estimates') return J(200, single ? { id: EST, number: 1042, customer_name: 'Pat', status: 'draft', estimate_date: '2026-11-09', line_items: [{ name: 'x', unit: 'flat', unit_price: 100, quantity: 1 }], total: 100, share_token: null } : []);
      if (u.pathname.startsWith('/rest/v1/')) return J(200, single ? null : []);
      return J(200, {});
    });
    await p.goto(`${BASE}/admin/#/jobs/${JOB}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
    ok(await p.getByText('Online payments are turned off for now.').isVisible() && !(await p.getByRole('button', { name: 'Request online payment' }).count()), 'job page: no online payment button');
    await p.goto(`${BASE}/admin/#/price-sheet/estimates/${EST}`); await p.waitForTimeout(1500);
    ok(await p.getByText('Customer quote links are turned off for now.').isVisible() && !(await p.getByRole('button', { name: 'Create quote link' }).count()), 'estimate: no quote link button');
    ok(fnCalls.length === 0, 'no payment or quote server functions called');
    await ctx.close();
  }
  await b.close();
})();
