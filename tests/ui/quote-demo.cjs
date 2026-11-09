const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const S = process.argv[2] || require('os').tmpdir() + '/hh-test-output'; const BASE = 'http://localhost:5180';
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const dialog = p.getByRole('dialog');

  // --- Quote template
  await p.goto(BASE + '/admin/#/price-sheet/estimates', { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
  await p.getByRole('button', { name: 'Quote template' }).click(); await p.waitForTimeout(500);
  ok(await dialog.getByLabel(/Welcome message/).inputValue() !== '', 'template shows welcome message');
  await dialog.getByLabel(/Quotes are good for/).fill('0');
  await dialog.getByRole('button', { name: 'Save template' }).click(); await p.waitForTimeout(300);
  ok(await dialog.getByText('Enter a number of days from 1 to 365.').isVisible(), 'days validated');
  await dialog.getByLabel(/Quotes are good for/).fill('14');
  await dialog.getByLabel(/Usual deposit/).fill('125');
  await dialog.getByLabel(/Fine print/).fill('Custom fine print for testing.');
  await p.screenshot({ path: S + '/shots/quote-template.png' });
  await dialog.getByRole('button', { name: 'Save template' }).click(); await p.waitForTimeout(500);
  ok(!(await dialog.isVisible()), 'template saved');

  // --- New estimate uses the template
  await p.getByRole('link', { name: 'New estimate' }).click(); await p.waitForTimeout(800);
  ok(await p.getByLabel(/Fine print/).inputValue() === 'Custom fine print for testing.', 'new estimate uses template fine print');
  ok(await p.getByLabel(/Deposit to book/).inputValue() === '125', 'new estimate uses usual deposit');
  const est = await p.getByLabel('Estimate date').inputValue(); const vu = await p.getByLabel(/Valid until/).inputValue();
  ok((new Date(vu) - new Date(est)) / 86400000 === 14, 'valid until = 14 days later');
  ok(!(await p.getByText('Quote link', { exact: true }).isVisible()), 'no quote link before saving');
  await p.getByLabel('Name').fill('Jamie Tester'); await p.getByLabel(/Phone/).fill('313-555-0100');
  await p.getByRole('button', { name: 'Add a custom line' }).click();
  await p.getByLabel('Line description').fill('Garage cleanout');
  await p.getByLabel(/Price for/).fill('600');
  await p.getByRole('complementary', { name: 'Estimate total' }).getByRole('button', { name: 'Save estimate' }).click(); await p.waitForTimeout(1200);
  ok(await p.getByRole('heading', { name: 'Quote link' }).isVisible(), 'quote link card after saving');
  await p.getByRole('button', { name: 'Create quote link' }).click(); await p.waitForTimeout(800);
  const link = await p.getByText(/\/quote\/#/).textContent();
  ok(/^http:\/\/localhost:5180\/quote\/#[A-Za-z0-9_-]{43}$/.test(link), 'link has a long random code: ' + link.slice(0, 50) + '…');
  ok(await p.getByLabel('Status').inputValue() === 'sent', 'draft switched to sent');
  await p.getByRole('button', { name: 'Copy message to send' }).click(); await p.waitForTimeout(200);
  const msg = await p.evaluate(() => navigator.clipboard.readText());
  ok(msg.startsWith('Hi Jamie') && msg.includes('$600.00') && msg.includes(link) && msg.includes('Klarna'), 'message has name, total, link');
  ok((await p.getByRole('link', { name: 'Text it' }).getAttribute('href')).startsWith('sms:3135550100'), 'text it goes to their phone');
  await p.screenshot({ path: S + '/shots/quote-link-card.png', fullPage: true });

  // Saving the estimate again keeps the link
  await p.getByLabel(/Notes for the customer/).fill('Side door code 4321');
  await p.getByRole('complementary', { name: 'Estimate total' }).getByRole('button', { name: 'Save changes' }).click(); await p.waitForTimeout(900);
  ok(await p.getByText(link).isVisible(), 'link survives saving changes');

  await p.getByRole('button', { name: 'Demo: paid deposit' }).click(); await p.waitForTimeout(1200);
  ok(/Accepted on .* \(chose to pay the deposit\)/.test(await p.locator('section[aria-labelledby=quote-link-title]').textContent()), 'shows accepted + choice');
  ok(await p.getByLabel('Status').inputValue() === 'accepted', 'status now accepted');
  await p.getByRole('link', { name: 'Open the job' }).click(); await p.waitForTimeout(1200);
  const page = await p.locator('main').textContent();
  ok(page.includes('Jamie Tester cleanout') && page.includes('$125.00'), 'job created with deposit payment');
  ok(page.includes('Side door code 4321'), 'crew notes carried over');

  // Turn off link
  await p.goBack(); await p.waitForTimeout(1000);
  await p.getByRole('button', { name: 'Turn off link' }).click();
  await p.getByRole('button', { name: 'Yes, turn off this link' }).click(); await p.waitForTimeout(700);
  ok(await p.getByRole('button', { name: 'Create quote link' }).isVisible(), 'link turned off');

  // --- Customer page (sample)
  await p.goto(BASE + '/quote/#demo', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  await p.evaluate(() => sessionStorage.clear()); await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  const q = await p.locator('main').textContent();
  ok(q.includes('Quote #1001') && q.includes('Sample Customer') && q.includes('$1,050.00'), 'customer page shows quote and total');
  ok(q.includes('Thanks for considering Hoard Hounds'), 'welcome message shown');
  ok(await p.getByRole('button', { name: /Accept & pay \$200\.00 deposit/ }).isVisible(), 'deposit button');
  ok(await p.getByRole('button', { name: /Accept & pay in full \$1,050\.00/ }).isVisible(), 'pay in full button');
  ok(await p.getByRole('button', { name: /Accept now, pay later/ }).isVisible(), 'pay later button');
  ok(q.includes('Klarna (subject to approval)'), 'Klarna note');
  await p.screenshot({ path: S + '/shots/quote-page.png', fullPage: true });
  await p.getByRole('button', { name: /deposit/ }).click(); await p.waitForURL(/paid=1/); await p.waitForTimeout(1000);
  const q2 = await p.locator('main').textContent();
  ok(q2.includes('Thank you! Your payment went through.') && q2.includes('Paid so far') && q2.includes('$850.00'), 'thank-you + balance after deposit');
  ok(await p.getByRole('button', { name: /Pay remaining \$850\.00/ }).isVisible() && !(await p.getByRole('button', { name: /pay later/ }).isVisible()), 'only pay remaining offered');
  await p.getByRole('button', { name: /Pay remaining/ }).click(); await p.waitForTimeout(1500);
  ok((await p.locator('main').textContent()).includes('Paid in full. Thank you!'), 'paid in full state');
  await p.getByRole('link', { name: 'Start the sample over' }).click(); await p.waitForTimeout(1200);
  await p.getByRole('button', { name: /pay later/ }).click(); await p.waitForTimeout(1200);
  ok((await p.locator('main').textContent()).includes('Your quote is accepted'), 'pay later confirmation');

  await p.goto(BASE + '/quote/', { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
  ok((await p.locator('main').textContent()).includes('looks incomplete'), 'no code -> friendly message');
  await p.goto(BASE + '/quote/#' + 'x'.repeat(43), { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
  ok((await p.locator('main').textContent()).includes('734-589-7627') || (await p.locator('main').textContent()).includes('(734) 589-7627'), 'not configured -> shows phone');

  // phone layout
  const m = await b.newContext({ ...devices['iPhone 13'] }); const mp = await m.newPage();
  await mp.goto(BASE + '/quote/#demo', { waitUntil: 'networkidle' }); await mp.waitForTimeout(800);
  ok(await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll on phone');
  await mp.screenshot({ path: S + '/shots/quote-phone.png', fullPage: true });
  await mp.goto(BASE + '/admin/#/price-sheet/estimates', { waitUntil: 'networkidle' }); await mp.waitForTimeout(800);
  await mp.locator('main a[href^="#/price-sheet/estimates/"]').filter({ hasText: 'Sample Customer B' }).click(); await mp.waitForTimeout(1200);
  await mp.getByRole('button', { name: 'Create quote link' }).click(); await mp.waitForTimeout(800);
  ok(await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'admin quote card fits phone');
  await mp.getByRole('heading', { name: 'Quote link' }).scrollIntoViewIfNeeded();
  await mp.screenshot({ path: S + '/shots/quote-card-phone.png' });

  ok(errs.length === 0, 'no console errors ' + errs.join(' | ').slice(0, 300));
  await b.close();
})();
