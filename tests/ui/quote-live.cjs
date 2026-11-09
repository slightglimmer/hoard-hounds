const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const TOK = 'Q'.repeat(43);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const calls = []; let received = 0; let accepted = null;
  await p.route('https://testproj.supabase.co/**', async (route) => {
    const r = route.request(); const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: h });
    const body = JSON.parse(r.postData() || '{}'); calls.push({ url: r.url(), body, headers: r.headers() });
    const J = (s, d) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(d), headers: h });
    if (body.token !== TOK) return J(404, { error: 'This quote link isn’t valid anymore. Please call or text us at 734-589-7627.' });
    if (body.action === 'get') return J(200, { quote: { number: 1042, customer_name: 'Pat Live', property_address: '9 Elm', status: accepted ? 'accepted' : 'sent', estimate_date: '2026-11-05', valid_until: '2026-12-05',
      line_items: [{ name: 'Basement', unit: 'flat', unit_price: 400, quantity: 1 }], discount_type: null, discount_value: null, subtotal: 400, discount_total: 0, total: 400, deposit_amount: 100,
      notes: null, terms: 'Terms here', accepted_at: accepted, accepted_via: accepted && 'later', received, quote_message: 'Hello from the template' } });
    if (body.action === 'accept' && body.option === 'later') { accepted = new Date().toISOString(); return J(200, { accepted: true }); }
    if (body.action === 'accept') return J(200, { accepted: true, checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
  });
  await p.route('https://checkout.stripe.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe checkout</h1>' }));
  await p.goto('http://localhost:5181/quote/#' + TOK, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  const t = await p.locator('main').textContent();
  ok(t.includes('Pat Live') && t.includes('$400.00') && t.includes('Hello from the template'), 'loads quote from server function');
  ok(calls[0].url === 'https://testproj.supabase.co/functions/v1/public-quote' && calls[0].headers.apikey === 'sb_publishable_testkey123' && !calls[0].headers.authorization, 'calls public-quote with publishable key only');
  await p.getByRole('button', { name: /deposit/ }).click(); await p.waitForURL(/checkout\.stripe\.com/);
  ok(calls.at(-1).body.option === 'deposit' && !('amount' in calls.at(-1).body), 'deposit sends only the choice, then goes to Stripe');
  await p.goto('http://localhost:5181/quote/#' + TOK, { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
  await p.getByRole('button', { name: /pay later/ }).click(); await p.waitForTimeout(800);
  const t2 = await p.locator('main').textContent();
  ok(t2.includes('Your quote is accepted'), 'pay later confirmed');
  received = 400; await p.goto('http://localhost:5181/quote/?paid=1#' + TOK, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  const t3 = await p.locator('main').textContent();
  ok(t3.includes('Thank you! Your payment went through.') && t3.includes('Paid in full'), 'return from Stripe: thank you + paid in full');
  await p.goto('http://localhost:5181/quote/#' + 'Z'.repeat(43), { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
  ok((await p.locator('main').textContent()).includes('isn’t valid anymore'), 'bad link shows server message');
  ok(errs.length === 0, 'no page errors ' + errs.join('|'));
  await b.close();
})();
