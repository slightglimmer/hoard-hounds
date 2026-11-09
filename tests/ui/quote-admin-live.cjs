const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', aal: 'aal2', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, session_id: 's', amr: [{ method: 'totp', timestamp: 1 }] })}.c2ln`;
const JOB = '11111111-1111-4111-8111-111111111111';
const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', email: 'johnice.edward@gmail.com', factors: [{ id: 'f1', factor_type: 'totp', status: 'verified' }] } };
const EST = '22222222-2222-4222-8222-222222222222';
async function run(b, name, { migrated }, check) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([s]) => localStorage.setItem('sb-testproj-auth-token', JSON.stringify(s)), [session]);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const calls = [];
  let row = { id: EST, number: 1042, customer_name: 'Pat Live', customer_email: null, customer_phone: null, property_address: null, status: 'draft', estimate_date: '2026-11-05', valid_until: null,
    line_items: [{ name: 'Basement', unit: 'flat', unit_price: 400, quantity: 1 }], discount_type: null, discount_value: null, deposit_amount: null, notes: null, terms: null, subtotal: 400, discount_total: 0, total: 400,
    customer_id: null, job_id: null, is_demo: false };
  if (migrated) Object.assign(row, { share_token: null, accepted_at: null, accepted_via: null });
  await p.route('https://testproj.supabase.co/**', async (route) => {
    const r = route.request(); const u = new URL(r.url()); const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': '*' };
    const J = (s, d) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(d), headers: h });
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-methods': '*' } });
    const single = (r.headers()['accept'] || '').includes('vnd.pgrst.object');
    if (u.pathname === '/auth/v1/user') return J(200, session.user);
    if (u.pathname === '/rest/v1/user_roles') return J(200, single ? { role: 'admin' } : [{ role: 'admin' }]);
    if (u.pathname === '/rest/v1/estimates') {
      if (r.method() === 'PATCH') { const body = r.postDataJSON(); calls.push(body);
        if (!migrated && 'share_token' in body) return J(400, { code: 'PGRST204', message: "Could not find the 'share_token' column" });
        row = { ...row, ...body }; }
      return J(200, single ? row : [row]);
    }
    if (u.pathname === '/rest/v1/business_settings') {
      if (!migrated) return J(404, { code: 'PGRST205', message: "Could not find the table 'public.business_settings'" });
      if (r.method() === 'POST') { calls.push({ settings: r.postDataJSON() }); return J(201, { id: 1, ...r.postDataJSON() }); }
      return J(200, { id: 1, quote_message: 'Hi', default_terms: 'T', default_valid_days: 30, default_deposit: null });
    }
    if (u.pathname.startsWith('/rest/v1/')) return J(200, single ? null : []);
    return J(200, {});
  });
  console.log('--- ' + name);
  await check(p, calls);
  if (errs.length) console.log('page errors', errs);
  await ctx.close();
}
(async () => {
  const b = await chromium.launch();
  await run(b, 'migrated', { migrated: true }, async (p, calls) => {
    await p.goto(`http://localhost:5181/admin/#/price-sheet/estimates/${EST}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
    await p.getByRole('button', { name: 'Create quote link' }).click(); await p.waitForTimeout(800);
    const c = calls.at(-1);
    ok(/^[A-Za-z0-9_-]{43}$/.test(c.share_token) && c.status === 'sent' && Object.keys(c).length === 2, 'saves only a 43-char token + sent status');
    ok(await p.getByText('http://localhost:5181/quote/#' + c.share_token).isVisible(), 'shows link');
    ok(await p.getByRole('link', { name: 'Preview' }).getAttribute('href') === 'http://localhost:5181/quote/#' + c.share_token, 'preview opens the real link');
    ok(!(await p.getByRole('button', { name: /Demo:/ }).count()), 'no demo buttons when live');
    await p.goto('http://localhost:5181/admin/#/price-sheet/estimates', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
    await p.getByRole('button', { name: 'Quote template' }).click(); await p.waitForTimeout(800);
    await p.getByRole('dialog').getByLabel(/Usual deposit/).fill('$75');
    await p.getByRole('dialog').getByRole('button', { name: 'Save template' }).click(); await p.waitForTimeout(800);
    const s = calls.at(-1).settings;
    ok(s && s.id === 1 && s.default_deposit === '75.00' && s.default_valid_days === 30, 'template saved to business_settings');
  });
  await run(b, 'not migrated yet', { migrated: false }, async (p) => {
    await p.goto(`http://localhost:5181/admin/#/price-sheet/estimates/${EST}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
    ok(await p.getByText(/Quote links \(customers accept and pay online\) aren’t switched on yet/).isVisible(), 'card explains it is not switched on');
    ok(await p.getByRole('button', { name: 'Save changes' }).first().isVisible(), 'estimate editor still works');
    await p.goto('http://localhost:5181/admin/#/price-sheet/estimates/new', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
    ok((await p.getByLabel(/Fine print/).inputValue()).startsWith('This estimate is based'), 'new estimate falls back to built-in fine print');
    await p.goto('http://localhost:5181/admin/#/price-sheet/estimates', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
    await p.getByRole('button', { name: 'Quote template' }).click(); await p.waitForTimeout(800);
    ok(await p.getByRole('dialog').getByText(/aren’t switched on yet/).isVisible(), 'template explains it is not switched on');
  });
  await b.close();
})();
