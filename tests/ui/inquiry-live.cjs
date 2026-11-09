const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', aal: 'aal2', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, session_id: 's', amr: [{ method: 'totp', timestamp: 1 }] })}.c2ln`;
const JOB = '11111111-1111-4111-8111-111111111111';
const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', email: 'johnice.edward@gmail.com', factors: [{ id: 'f1', factor_type: 'totp', status: 'verified' }] } };
// Website form -> submit-inquiry (simulated), and the admin inbox in "live" mode
// against a simulated Supabase. Runs on the 5181 dev server (VITE_FORM_PROVIDER=supabase).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const INQ = '33333333-3333-4333-8333-333333333333';
const parse = (body) => {
  const fields = {};
  for (const m of body.toString('latin1').matchAll(/name="([^"]+)"(?:; filename="[^"]*")?\r\n(?:Content-Type: [^\r]+\r\n)?\r\n([\s\S]*?)\r\n--/g)) fields[m[1]] = m[2];
  return fields;
};

async function fillForm(p) {
  await p.goto('http://localhost:5181/#quote', { waitUntil: 'networkidle' }); await p.waitForTimeout(700);
  const f = p.locator('#quote form');
  await f.getByLabel(/Full Name/).fill('Casey Customer');
  await f.getByLabel(/Email Address/).fill('casey@example.com');
  await f.getByLabel(/Phone Number/).fill('313-555-0101');
  await f.getByLabel(/Type of Clean-out/i).selectOption({ index: 2 });
  await f.getByLabel(/Property Address/).fill('12 Oak St, Redford, MI');
  await f.getByLabel(/Description of Project/).fill('Whole house, two floors, very full.');
  await f.locator('input[type=file]').setInputFiles({ name: 'room.png', mimeType: 'image/png', buffer: PNG });
  await p.waitForTimeout(500);
  await f.locator('summary').click();
  await f.getByLabel(/How full is it/).selectOption('heavy');
  await f.getByLabel(/Driveway for a dumpster/).selectOption('street_only');
  await f.getByLabel(/Items to keep or donate/).fill('Photo albums');
  await f.getByLabel(/I agree to be contacted/).check();
  return f;
}

async function publicCase(b, name, fnReply, check, backupStatus = 200) {
  const p = await b.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  const sent = { fn: [], backup: [] };
  await p.route('https://testproj.supabase.co/functions/v1/submit-inquiry', async (route) => {
    const r = route.request();
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    sent.fn.push({ headers: r.headers(), fields: parse(r.postDataBuffer()) });
    if (fnReply === 'abort') return route.abort();
    return route.fulfill({ status: fnReply.status, contentType: 'application/json', body: JSON.stringify(fnReply.body), headers: { 'access-control-allow-origin': '*' } });
  });
  await p.route('https://formspree.test/**', async (route) => {
    sent.backup.push(parse(route.request().postDataBuffer() || Buffer.from('')));
    return route.fulfill({ status: backupStatus, contentType: 'application/json', body: '{"ok":true}', headers: { 'access-control-allow-origin': '*' } });
  });
  const f = await fillForm(p);
  await f.getByRole('button', { name: /Request My Free Quote/ }).click(); await p.waitForTimeout(1500);
  console.log('--- ' + name);
  await check(p, sent);
  if (errs.length) console.log('page errors', errs);
  await p.close();
}

(async () => {
  const b = await chromium.launch();

  await publicCase(b, 'saved in the dashboard', { status: 200, body: { ok: true, number: 104, photos_saved: 1, photos_failed: 0, email_sent: false } }, async (p, sent) => {
    const t = await p.locator('#quote').textContent();
    ok(t.includes('Thanks! Your request #104 is in.') && !t.includes('emailed you'), 'success with request number; no email claimed');
    const fields = sent.fn[0]?.fields || {};
    ok(fields.name === 'Casey Customer' && fields.volume === 'heavy' && fields.driveway === 'street_only' && fields.keepItems === 'Photo albums' && fields.consent === 'yes', 'all fields sent to the server function');
    ok('photo1' in fields && sent.fn[0].headers.apikey === 'sb_publishable_testkey123' && !sent.fn[0].headers.authorization, 'photo sent; only the public key used');
    await p.waitForTimeout(400);
    ok(sent.backup.length === 1 && !('photo1' in sent.backup[0]) && /#104/.test(sent.backup[0]._subject || '') && /admin/.test(sent.backup[0].message || ''), 'text-only email alert sent through the backup form service');
  });

  await publicCase(b, 'photo failed', { status: 200, body: { ok: true, number: 105, photos_saved: 0, photos_failed: 1, email_sent: true } }, async (p) => {
    const t = await p.locator('#quote').textContent();
    ok(t.includes('1 photo couldn’t') && t.includes('(734) 589-7627'), 'failed photo reported honestly');
    ok(t.includes('emailed you a confirmation'), 'email mentioned only when the server says it was sent');
  });

  await publicCase(b, 'server rejects a field', { status: 400, body: { error: 'Please fix the highlighted fields.', errors: { email: 'Please enter a valid email address.' } } }, async (p, sent) => {
    ok(await p.getByRole('alert').filter({ hasText: 'Please fix the highlighted fields.' }).isVisible(), 'server message shown');
    ok(await p.getByText('Please enter a valid email address.').isVisible(), 'field error shown');
    ok(!(await p.getByText(/Your request.* is in/).count()) && sent.backup.length === 0, 'no success shown, nothing sent elsewhere');
  });

  await publicCase(b, 'too many requests', { status: 429, body: { error: 'We’ve received several requests from you in the last hour. Please call or text us at (734) 589-7627 instead.' } }, async (p) => {
    ok(await p.getByText(/several requests from you/).isVisible() && !(await p.getByText(/is in\./).count()), 'rate limit message shown');
  });

  await publicCase(b, 'server down -> backup', { status: 500, body: { error: 'We couldn’t save your request.', saved: false } }, async (p, sent) => {
    const t = await p.locator('#quote').textContent();
    ok(sent.backup.length === 1 && 'photo1' in sent.backup[0] && sent.backup[0].name === 'Casey Customer', 'full request (with photo) sent to the backup');
    ok(t.includes('Your request is in.') && !t.includes('#'), 'success shown only after the backup accepted it');
  });

  await publicCase(b, 'not deployed / offline -> backup', 'abort', async (p, sent) => {
    ok(sent.backup.length === 1 && (await p.locator('#quote').textContent()).includes('Your request is in.'), 'unreachable server falls back to the backup');
  });

  await publicCase(b, 'server and backup both down', { status: 500, body: { error: 'down' } }, async (p) => {
    ok(await p.getByRole('alert').filter({ hasText: 'was not sent' }).isVisible() && !(await p.getByText(/is in\./).count()), 'nothing saved anywhere: error shown, never a false success');
  }, 500);

  // ---- Admin inbox (simulated Supabase)
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([s]) => localStorage.setItem('sb-testproj-auth-token', JSON.stringify(s)), [session]);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  const writes = [];
  let migrated = true;
  const inquiry = { id: INQ, number: 104, status: 'new', source: 'website', full_name: 'Casey Customer', email: 'casey@example.com', phone: '313-555-0101',
    property_address: '12 Oak St, Redford, MI', cleanout_type: 'Hoarding Clean-Outs', description: 'Whole house, two floors, very full.', volume: 'heavy',
    driveway: 'street_only', keep_items: 'Photo albums', photo_count: 1, photos_failed: 0, created_at: new Date().toISOString(), is_demo: false };
  await p.route('https://testproj.supabase.co/**', async (route) => {
    const r = route.request(); const u = new URL(r.url()); const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': '*' };
    const J = (s, d, extra = {}) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(d), headers: { ...h, ...extra } });
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-methods': '*' } });
    const single = (r.headers()['accept'] || '').includes('vnd.pgrst.object');
    if (u.pathname === '/auth/v1/user') return J(200, session.user);
    if (u.pathname === '/rest/v1/user_roles') return J(200, single ? { role: 'admin' } : [{ role: 'admin' }]);
    if (u.pathname === '/rest/v1/inquiries') {
      if (!migrated) return J(404, { code: 'PGRST205', message: "Could not find the table 'public.inquiries'" });
      if (r.method() === 'PATCH') { writes.push(r.postDataJSON()); Object.assign(inquiry, r.postDataJSON()); }
      if (r.method() === 'HEAD') return route.fulfill({ status: 200, headers: { ...h, 'content-range': `0-0/${inquiry.status === 'new' ? 1 : 0}` } });
      return J(200, single ? inquiry : [inquiry], { 'content-range': `0-0/${inquiry.status === 'new' ? 1 : 0}` });
    }
    if (u.pathname === '/rest/v1/inquiry_photos') return J(200, [{ id: 'ph1', inquiry_id: INQ, storage_path: `${INQ}/44444444-4444-4444-8444-444444444444.png`, content_type: 'image/png', size_bytes: 68 }]);
    if (u.pathname === '/storage/v1/object/sign/inquiry-photos') {
      writes.push({ sign: r.postDataJSON() });
      return J(200, [{ path: `${INQ}/44444444-4444-4444-8444-444444444444.png`, signedURL: `/object/sign/inquiry-photos/${INQ}/44444444-4444-4444-8444-444444444444.png?token=abc`, error: null }]);
    }
    if (u.pathname.startsWith('/storage/v1/object/sign/inquiry-photos/')) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG, headers: h });
    if (u.pathname === '/rest/v1/estimates' && r.method() === 'POST') {
      const body = r.postDataJSON(); writes.push({ estimate: body });
      return J(201, { id: '55555555-5555-4555-8555-555555555555', number: 1009, total: 0, line_items: [], ...body });
    }
    if (u.pathname === '/rest/v1/business_settings') return J(200, migrated ? { id: 1, default_terms: 'T', default_valid_days: 14, default_overage_terms: 'Overage wording' } : null);
    if (u.pathname.startsWith('/rest/v1/')) return J(200, single ? null : []);
    return J(200, {});
  });
  console.log('--- admin inbox');
  await p.goto('http://localhost:5181/admin/#/inquiries', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  ok((await p.locator('main').textContent()).includes('Casey Customer') && (await p.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: /Inquiries/ }).textContent()).includes('1'), 'request listed with new badge');
  await p.getByRole('link', { name: /Casey Customer/ }).click(); await p.waitForTimeout(1500);
  const sign = writes.find((w) => w.sign);
  ok(sign && sign.sign.expiresIn === 3600 && sign.sign.paths[0].startsWith(INQ), 'photo shown through a 1-hour signed link');
  const src = await p.locator('main img[alt^="Customer photo"]').first().getAttribute('src');
  ok(src.startsWith('https://testproj.supabase.co/storage/v1/object/sign/inquiry-photos/') && src.includes('token='), 'image uses the signed URL, not a public one');
  ok(await p.locator('main img[alt^="Customer photo"]').first().evaluate((img) => img.complete && img.naturalWidth > 0), 'photo loads');
  await p.getByLabel('Status').selectOption('reviewing'); await p.waitForTimeout(700);
  ok(writes.some((w) => w.status === 'reviewing' && Object.keys(w).length === 1), 'status change sends only the status');
  await p.getByRole('button', { name: 'Create estimate' }).click(); await p.waitForTimeout(1200);
  const est = writes.find((w) => w.estimate)?.estimate;
  ok(est && est.inquiry_id === INQ && est.customer_name === 'Casey Customer' && est.overage_terms === 'Overage wording' && est.status === 'draft', 'estimate created from the request with template wording');
  ok(!('client_hash' in (est || {})) && !('admin_notes' in (est || {})), 'no private request fields copied to the estimate');

  migrated = false;
  await p.goto('http://localhost:5181/admin/#/overview'); await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  await p.goto('http://localhost:5181/admin/#/inquiries'); await p.waitForTimeout(1200);
  ok(await p.getByText('Website requests aren’t switched on yet.').isVisible(), 'before the database update: clear “not switched on” message');
  await p.goto('http://localhost:5181/admin/#/price-sheet/estimates/new'); await p.waitForTimeout(1500);
  ok(!(await p.getByRole('region', { name: 'Job costing' }).count()) && !(await p.getByText('Scope & dumpster allowance').count()) && await p.getByLabel('Name').isVisible(), 'before the update: estimate editor works without the new sections');
  if (errs.length) console.log('page errors', errs);
  await b.close();
})();
