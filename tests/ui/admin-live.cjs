// Simulates Supabase's auth and data API with Playwright routes so the real supabase-js
// client and the admin's sign-in screens can be tested without a Supabase project.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const S = process.argv[2] || require('os').tmpdir() + '/hh-test-output';
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub, aal) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, aal, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, session_id: 's1', amr: [{ method: aal === 'aal2' ? 'totp' : 'password', timestamp: Math.floor(Date.now() / 1000) }] })}.c2ln`;

function mock(page, { role, factorVerified, log, demoRows = 0 }) {
  const state = { factors: factorVerified ? [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'app' }] : [], aal: 'aal1' };
  const user = () => ({ id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'johnice.edward@gmail.com', factors: state.factors, app_metadata: {}, user_metadata: {} });
  const session = () => ({ access_token: jwt('u1', state.aal), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r1', user: user() });
  return page.route('https://testproj.supabase.co/**', async (route) => {
    const req = route.request(); const url = new URL(req.url()); const path = url.pathname; const method = req.method();
    log.push(`${method} ${path}${url.search} apikey=${req.headers()['apikey']} auth=${(req.headers()['authorization'] || '').slice(0, 14)}`);
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (path === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      const body = JSON.parse(req.postData());
      if (body.password !== 'correct horse') return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      return json(200, session());
    }
    if (path === '/auth/v1/user') return json(200, user());
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    if (path === '/auth/v1/factors' && method === 'POST') {
      state.factors.push({ id: 'f2', factor_type: 'totp', status: 'unverified', friendly_name: 'app' });
      return json(200, { id: 'f2', type: 'totp', friendly_name: 'app', totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' } });
    }
    let m;
    if ((m = path.match(/^\/auth\/v1\/factors\/(\w+)\/challenge$/))) return json(200, { id: 'c1', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 });
    if ((m = path.match(/^\/auth\/v1\/factors\/(\w+)\/verify$/))) {
      const body = JSON.parse(req.postData());
      if (body.code !== '123456') return json(422, { code: 422, error_code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' });
      state.factors = state.factors.map((f) => (f.id === m[1] ? { ...f, status: 'verified' } : f)); state.aal = 'aal2';
      return json(200, session());
    }
    if ((m = path.match(/^\/auth\/v1\/factors\/(\w+)$/)) && method === 'DELETE') { state.factors = state.factors.filter((f) => f.id !== m[1]); return json(200, { id: m[1] }); }
    if (path === '/rest/v1/user_roles') {
      const row = role ? { role } : null;
      const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
      return json(200, wantsObject ? row : row ? [row] : []);
    }
    if (path.startsWith('/rest/v1/rpc/')) { log.push('RPC ' + path); return json(200, path.endsWith('clear_demo_data') ? 241 : 0); }
    if (path.startsWith('/rest/v1/')) {
      if (method === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': `*/${demoRows}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' } });
      return json(200, path === '/rest/v1/expense_categories' ? [{ id: 'c1', name: 'Fuel', tax_category: 'Car and truck expenses', active: true, sort_order: 10 }] : []);
    }
    return json(404, { msg: 'not mocked ' + path });
  });
}

async function scenario(b, name, opts, steps) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  const log = []; await mock(page, { ...opts, log });
  await page.goto('http://localhost:5181/admin/', { waitUntil: 'networkidle' });
  console.log(`--- ${name}`);
  await steps(page, log);
  if (errs.length) console.log('page errors:', errs);
  await ctx.close();
}

const signIn = async (page, pw = 'correct horse') => {
  await page.getByLabel('Email').fill('johnice.edward@gmail.com');
  await page.getByLabel('Password').fill(pw);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForTimeout(900);
};

(async () => {
  const b = await chromium.launch();
  await scenario(b, 'new admin: sign in, set up two-step, reach dashboard', { role: 'admin', factorVerified: false }, async (page, log) => {
    ok(await page.getByRole('heading', { name: 'Welcome back' }).isVisible(), 'sign-in screen shown first');
    await page.screenshot({ path: S + '/shots/live-signin.png' });
    await signIn(page, 'wrong');
    ok(await page.getByText('That email and password don’t match').isVisible(), 'wrong password message');
    await signIn(page);
    ok(await page.getByRole('heading', { name: 'Set up two-step login' }).isVisible(), 'admin without factor must enroll');
    ok(await page.getByAltText('QR code for your authenticator app').isVisible(), 'QR code rendered');
    await page.screenshot({ path: S + '/shots/live-enroll.png' });
    await page.getByLabel('6-digit code').fill('000000'); await page.getByRole('button', { name: 'Turn on two-step login' }).click(); await page.waitForTimeout(700);
    ok(await page.getByText('That code didn’t work').isVisible(), 'bad code rejected');
    await page.getByLabel('6-digit code').fill('123456'); await page.getByRole('button', { name: 'Turn on two-step login' }).click(); await page.waitForTimeout(1500);
    ok(await page.getByRole('heading', { name: 'Hello, Johnice' }).isVisible(), 'dashboard after two-step');
    ok(!(await page.getByText('Demo mode').count()), 'no demo banner in live mode');
    ok(await page.getByText('Admin · two-step verified').isVisible(), 'shows verified status');
    const rest = log.filter((l) => l.includes('/rest/v1/'));
    ok(rest.length > 0 && rest.every((l) => l.includes('apikey=sb_publishable_testkey123') && l.includes('auth=Bearer eyJ')), 'data requests use publishable key + user token');
    await page.screenshot({ path: S + '/shots/live-dashboard.png', fullPage: true });
    await page.getByRole('button', { name: 'Sign out' }).click(); await page.waitForTimeout(800);
    ok(await page.getByRole('heading', { name: 'Welcome back' }).isVisible(), 'sign out returns to sign-in');
  });
  await scenario(b, 'returning admin: code required', { role: 'admin', factorVerified: true }, async (page) => {
    await signIn(page);
    ok(await page.getByRole('heading', { name: 'Enter your code' }).isVisible(), 'asks for code');
    ok(!(await page.getByRole('heading', { name: /Hello/ }).count()), 'dashboard not shown before code');
    await page.getByLabel('6-digit code').fill('123456'); await page.getByRole('button', { name: 'Verify' }).click(); await page.waitForTimeout(1500);
    ok(await page.getByRole('heading', { name: 'Hello, Johnice' }).isVisible(), 'dashboard after code');
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
    ok(await page.getByRole('heading', { name: 'Hello, Johnice' }).isVisible(), 'stays signed in after reload');
  });
  await scenario(b, 'employee login', { role: 'employee', factorVerified: false }, async (page) => {
    await signIn(page);
    ok(await page.getByRole('heading', { name: 'This area is for admins' }).isVisible(), 'employee sees not-authorized screen');
  });
  await scenario(b, 'no role', { role: null, factorVerified: false }, async (page) => {
    await signIn(page);
    ok(await page.getByRole('heading', { name: 'This area is for admins' }).isVisible(), 'no-role user blocked');
  });
  await scenario(b, 'forgot password', { role: 'admin' }, async (page, log) => {
    await page.route('https://testproj.supabase.co/auth/v1/recover**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}', headers: { 'access-control-allow-origin': '*' } }));
    await page.getByRole('button', { name: 'Forgot your password?' }).click();
    await page.getByLabel('Email').fill('johnice.edward@gmail.com');
    const [req] = await Promise.all([page.waitForRequest((r) => r.url().includes('/auth/v1/recover')), page.getByRole('button', { name: 'Send reset link' }).click()]);
    ok(decodeURIComponent(req.url()).includes('redirect_to=http://localhost:5181/admin/?reset=1'), 'reset link returns to /admin/?reset=1');
    await page.waitForTimeout(500);
    ok(await page.getByRole('heading', { name: 'Check your email' }).isVisible(), 'generic confirmation shown');
  });
  await scenario(b, 'database has sample rows', { role: 'admin', factorVerified: true, demoRows: 5 }, async (page, log) => {
    await signIn(page);
    await page.getByLabel('6-digit code').fill('123456'); await page.getByRole('button', { name: 'Verify' }).click(); await page.waitForTimeout(1500);
    ok(await page.getByText('Your database includes sample records').isVisible(), 'sample-data banner shown in live mode');
    await page.getByRole('button', { name: 'Clear demo data' }).click();
    ok(await page.getByRole('button', { name: 'Yes, remove sample data' }).isVisible(), 'asks to confirm');
    await page.getByRole('button', { name: 'Yes, remove sample data' }).click(); await page.waitForTimeout(600);
    ok(log.some((l) => l === 'RPC /rest/v1/rpc/clear_demo_data'), 'calls clear_demo_data in the database');
    ok(await page.getByText('Removed 241 sample records').isVisible(), 'confirmation toast');
  });
  await scenario(b, 'skip link', { role: 'admin', factorVerified: true }, async (page) => {
    await signIn(page);
    await page.getByLabel('6-digit code').fill('123456'); await page.getByRole('button', { name: 'Verify' }).click(); await page.waitForTimeout(1200);
    await page.goto('http://localhost:5181/admin/#/expenses'); await page.waitForTimeout(1200);
    await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    ok(await page.getByRole('heading', { name: 'Expenses', level: 1 }).isVisible(), 'skip link keeps you on Expenses');
    ok(await page.evaluate(() => document.activeElement?.id === 'main'), 'focus moved to main content');
  });
  // Unsafe key build
  const p2 = await b.newPage(); await p2.goto('http://localhost:5182/admin/', { waitUntil: 'networkidle' });
  console.log('--- secret key configured');
  ok(await p2.getByRole('heading', { name: 'Stopped for safety' }).isVisible(), 'app refuses to run with a secret key');
  await b.close();
})();
