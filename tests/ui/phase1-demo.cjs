// Inquiries, job costing, deposits and dumpsters, in demo mode (sample data, nothing saved).
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const S = process.argv[2] || require('os').tmpdir() + '/hh-test-output';
const BASE = 'http://localhost:5180/admin/';
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:5180' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const dialog = p.getByRole('dialog');
  const main = () => p.locator('main').textContent();

  // ---- Inbox
  await p.goto(BASE + '#/overview', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  const nav = p.getByRole('navigation', { name: 'Admin' });
  ok(await nav.getByRole('link', { name: /Inquiries/ }).isVisible() && (await nav.getByRole('link', { name: /Inquiries/ }).textContent()).includes('1'), 'Inquiries in the menu with 1 new');
  await nav.getByRole('link', { name: /Inquiries/ }).click(); await p.waitForTimeout(700);
  let t = await main();
  ok(t.includes('Sample Customer Morgan') && t.includes('3 photos') && t.includes('Open (3)'), 'open requests listed with photo counts');
  ok(t.includes('Deadline'), 'firm deadlines flagged in the list');
  await p.getByRole('radio', { name: /^Won/ }).click(); await p.waitForTimeout(150);
  ok((await main()).includes('No requests have this status'), 'status filter works');
  await p.getByRole('radio', { name: /^Open/ }).click();
  await p.screenshot({ path: S + '/shots/inq-list.png', fullPage: true });

  // ---- Detail
  await p.getByRole('link', { name: /Sample Customer Morgan/ }).click(); await p.waitForTimeout(800);
  t = await main();
  ok(t.includes('Request #103') && t.includes('Heavy') && t.includes('Driveway available') && t.includes('Vacant'), 'property details shown');
  ok(t.includes('Family photos, military medals') && t.includes('Possible hazards') && t.includes('paint cans'), 'keep items and hazards highlighted');
  const imgs = p.locator('main img[alt^="Customer photo"]');
  ok((await imgs.count()) === 3, 'three photos shown');
  await imgs.first().click(); await p.waitForTimeout(300);
  ok(await dialog.getByRole('img', { name: 'Customer photo, full view' }).isVisible(), 'photo opens larger');
  await dialog.getByRole('button', { name: 'Close' }).last().click();
  ok((await p.getByRole('link', { name: /Call/ }).getAttribute('href')).startsWith('tel:') && (await p.getByRole('link', { name: 'Map' }).getAttribute('href')).includes('google.com/maps'), 'call and map links');
  await p.getByLabel('Status').selectOption('reviewing'); await p.waitForTimeout(500);
  ok((await p.getByLabel('Status').inputValue()) === 'reviewing', 'status changed');
  await p.getByLabel(/Private notes/).fill('Call after 5pm.');
  await p.getByRole('button', { name: 'Save notes' }).click(); await p.waitForTimeout(500);
  ok((await p.getByLabel(/Private notes/).inputValue()) === 'Call after 5pm.' && !(await p.getByRole('button', { name: 'Save notes' }).count()), 'private notes saved');
  await p.getByRole('button', { name: 'Add as a new customer' }).click(); await p.waitForTimeout(700);
  ok(await p.getByText(/Linked to/).isVisible(), 'customer created and linked');
  await p.screenshot({ path: S + '/shots/inq-detail.png', fullPage: true });

  // ---- Inquiry -> estimate with costing
  await p.getByRole('button', { name: 'Create estimate' }).click(); await p.waitForTimeout(1200);
  ok(/#\/price-sheet\/estimates\/[\w-]+$/.test(p.url()), 'estimate created and opened');
  ok((await p.getByLabel('Name').inputValue()) === 'Sample Customer Morgan' && (await p.getByLabel(/Property address/).inputValue()).startsWith('214 Sample Ave'), 'customer details copied over');
  ok(await p.getByRole('link', { name: /From a website request/ }).isVisible(), 'estimate links back to the request');
  ok((await p.getByLabel(/Additional charges/).inputValue()).includes('get your approval'), 'additional-charges wording from the template');
  const costing = p.getByRole('region', { name: 'Job costing' });
  ok(await costing.getByText('Private: never shown to customers').isVisible(), 'costing marked private');
  ok((await costing.getByLabel('Labor cost per hour').inputValue()) === '20', 'labor rate from template defaults');
  await costing.getByLabel('Dumpster rental cost').fill('525');
  await costing.getByLabel('Estimated labor hours').fill('24');
  await costing.getByLabel('Labor cost per hour').fill('22');
  await costing.getByLabel(/Other direct costs/).fill('60');
  await costing.getByLabel(/Contingency/).fill('10');
  await costing.getByLabel('Target profit margin').fill('35');
  t = await costing.textContent();
  ok(t.includes('$1,224.30') && t.includes('$1,884.00') && t.includes('$659.70') && t.includes('35.0%'), 'cost $1,224.30 → suggested $1,884 at 35% margin');
  await costing.getByLabel('Target profit margin').fill('95');
  ok(await costing.getByText('Use a margin from 0 to 90%.').isVisible() && await costing.getByText('Fix the highlighted numbers').isVisible(), 'impossible margin rejected');
  await costing.getByLabel('Target profit margin').fill('35');
  await costing.getByRole('button', { name: 'Use $525.00 as the deposit' }).click();
  ok((await p.getByLabel(/Deposit to book/).inputValue()) === '525.00', 'deposit set from the dumpster cost');
  await costing.getByRole('button', { name: 'Add $1,884.00 as one line' }).click(); await p.waitForTimeout(200);
  const aside = p.getByRole('complementary', { name: 'Estimate total' });
  t = await aside.textContent();
  ok(t.includes('$1,884.00') && t.includes('Balance after deposit') && t.includes('$1,359.00'), 'total, deposit and balance after deposit');
  ok((await costing.textContent()).includes('margin 35.0%'), 'margin at the quoted total shown');
  await p.getByLabel(/Scope of work/).fill('Clear the whole house and basement. Set aside medals and papers.');
  await p.getByLabel(/Number of dumpsters/).fill('1');
  await p.getByLabel(/Dumpster size/).fill('20');
  await p.getByLabel(/Weight allowance included/).fill('3');
  await p.getByLabel(/Rental days included/).fill('7');
  await p.getByLabel(/overweight rate/).fill('75');
  await p.getByLabel(/extra-day rate/).fill('15');
  await p.getByLabel(/Deposit to book/).fill('5000');
  await aside.getByRole('button', { name: 'Save changes' }).click(); await p.waitForTimeout(300);
  ok(await p.getByText(/deposit can’t be more than the total/).first().isVisible(), 'deposit larger than the total rejected');
  await p.getByLabel(/Deposit to book/).fill('525');
  await aside.getByRole('button', { name: 'Save changes' }).click(); await p.waitForTimeout(1000);
  ok(!(await p.getByText('Unsaved changes').count()), 'estimate and costing saved');
  const estUrl = p.url();

  // Customer-facing outputs never include costing
  await aside.getByRole('button', { name: 'Copy text' }).click(); await p.waitForTimeout(300);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  ok(clip.includes('Scope of work: Clear the whole house') && clip.includes('1 × 20-yard dumpster') && clip.includes('Up to 3 tons') && clip.includes('7 rental days') && clip.includes('$75.00 per extra ton'), 'copied text includes scope and allowance');
  ok(clip.includes('Balance after deposit: $1,359.00') && !/costing|Suggested price|margin|1,224/i.test(clip), 'copied text has balance and no internal costing');
  await p.emulateMedia({ media: 'print' });
  const doc = await p.locator('.print-doc').textContent();
  ok(doc.includes('Dumpster allowance') && doc.includes('Scope of work') && doc.includes('Balance after deposit') && !/Job costing|Suggested price|1,224/.test(doc), 'printed estimate has allowance and no internal costing');
  await p.screenshot({ path: S + '/shots/est-print.png', fullPage: true });
  await p.emulateMedia({ media: 'screen' });
  await p.screenshot({ path: S + '/shots/est-editor.png', fullPage: true });

  // Costing is remembered
  await p.goto(BASE + '#/price-sheet/estimates'); await p.waitForTimeout(600);
  await p.goto(estUrl); await p.waitForTimeout(1200);
  ok((await p.getByRole('region', { name: 'Job costing' }).getByLabel('Estimated labor hours').inputValue()) === '24', 'costing reloads with the estimate');

  // Back on the request
  await p.getByRole('link', { name: /From a website request/ }).click(); await p.waitForTimeout(800);
  ok(await p.getByRole('link', { name: /Estimate #1003/ }).isVisible(), 'request lists its estimate');

  // Request -> job directly, then delete a request
  await p.goto(BASE + '#/inquiries'); await p.waitForTimeout(600);
  await p.getByRole('link', { name: /Sample Realtor/ }).click(); await p.waitForTimeout(800);
  ok(await p.getByText(/Linked to/).isVisible(), 'existing customer already linked');
  await p.getByRole('button', { name: 'Create job without an estimate' }).click(); await p.waitForTimeout(1200);
  ok(/#\/jobs\/[\w-]+$/.test(p.url()) && (await p.getByLabel('Job name').inputValue()).includes('clean-out'), 'job created from the request');
  await p.goto(BASE + '#/inquiries'); await p.waitForTimeout(600);
  await p.getByRole('link', { name: /Sample Customer B/ }).click(); await p.waitForTimeout(800);
  await p.getByRole('button', { name: /Delete request/ }).click();
  await p.getByRole('button', { name: /Yes, delete this request/ }).click(); await p.waitForTimeout(800);
  ok(p.url().endsWith('#/inquiries') && !(await main()).includes('Sample Customer B'), 'request deleted');

  // ---- Dumpsters on a job
  await p.goto(BASE + '#/jobs'); await p.waitForTimeout(800);
  await p.locator('main ul li a[href^="#/jobs/"]').filter({ hasText: 'Scheduled' }).first().click(); await p.waitForTimeout(1200);
  let dump = p.getByRole('region', { name: 'Dumpsters' });
  if (!(await dump.textContent()).includes('Sample Roll-Off')) {
    // pick the job that has the sample dumpster
    await p.goto(BASE + '#/jobs'); await p.waitForTimeout(800);
    const links = p.locator('main ul li a[href^="#/jobs/"]').filter({ hasText: 'Scheduled' });
    for (let i = 0; i < await links.count(); i += 1) {
      await links.nth(i).click(); await p.waitForTimeout(900);
      dump = p.getByRole('region', { name: 'Dumpsters' });
      if ((await dump.textContent()).includes('Sample Roll-Off')) break;
      await p.goBack(); await p.waitForTimeout(700);
    }
  }
  t = await dump.textContent();
  ok(t.includes('20-yard dumpster') && t.includes('Booked') && t.includes('3 tons') && t.includes('$75.00/ton'), 'sample dumpster shown with allowance and rates');
  const costsBefore = await p.getByRole('complementary', { name: 'Job money summary' }).textContent();
  await dump.getByRole('button', { name: 'Record $525.00 rental as a cost' }).click(); await p.waitForTimeout(1200);
  ok(await dump.getByText('Rental recorded in costs').isVisible(), 'rental recorded once and marked');
  ok((await p.getByRole('region', { name: 'Job costs' }).textContent()).includes('Dumpster rental'), 'appears in job costs');
  const costsAfter = await p.getByRole('complementary', { name: 'Job money summary' }).textContent();
  ok(costsBefore !== costsAfter, 'job profit updated');
  await dump.getByRole('button', { name: 'Add a dumpster' }).click(); await p.waitForTimeout(300);
  await dialog.getByLabel(/Dumpster company/).fill('Sample Roll-Off Co.');
  ok((await dialog.getByLabel(/Their contact info/).inputValue()).includes('555-0142'), 'known provider fills in contact');
  await dialog.getByLabel(/Size/).fill('10');
  await dialog.getByLabel(/Delivery date/).fill('2026-12-10');
  await dialog.getByLabel(/Expected pickup/).fill('2026-12-01');
  await dialog.getByRole('button', { name: 'Save dumpster' }).click(); await p.waitForTimeout(300);
  ok(await dialog.getByText('Pickup can’t be before delivery.').isVisible(), 'pickup before delivery rejected');
  await dialog.getByLabel(/Expected pickup/).fill('2026-12-15');
  await dialog.getByRole('button', { name: 'Save dumpster' }).click(); await p.waitForTimeout(900);
  ok((await dump.locator('li').count()) === 2, 'a job can have two dumpsters');
  await p.screenshot({ path: S + '/shots/job-dumpsters.png', fullPage: true });

  // ---- Expense categories
  await p.goto(BASE + '#/expenses'); await p.waitForTimeout(800);
  await p.getByRole('button', { name: /Add expense/ }).first().click(); await p.waitForTimeout(300);
  const cats = await dialog.getByLabel('Category').locator('option').allTextContents();
  ok(cats.some((c) => c.startsWith('Dumpster rental')) && cats.some((c) => c.startsWith('Permits & placement')) && !cats.some((c) => c.startsWith('Truck rental')), 'dumpster categories offered, truck rental hidden');
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // ---- Template
  await p.goto(BASE + '#/price-sheet/estimates'); await p.waitForTimeout(700);
  await p.getByRole('button', { name: 'Quote template' }).click(); await p.waitForTimeout(500);
  await dialog.getByLabel(/Target margin/).fill('120');
  await dialog.getByRole('button', { name: 'Save template' }).click(); await p.waitForTimeout(200);
  ok(await dialog.getByText('Use 0 to 90%.').isVisible(), 'template margin validated');
  await dialog.getByLabel(/Target margin/).fill('32');
  await dialog.getByRole('button', { name: 'Save template' }).click(); await p.waitForTimeout(500);
  await p.getByRole('link', { name: 'New estimate' }).click(); await p.waitForTimeout(900);
  ok((await p.getByRole('region', { name: 'Job costing' }).getByLabel('Target profit margin').inputValue()) === '32', 'new estimates use the template margin');

  // ---- Phones
  const m = await b.newContext({ ...devices['iPhone 13'] }); const mp = await m.newPage();
  await mp.goto(BASE + '#/inquiries', { waitUntil: 'networkidle' }); await mp.waitForTimeout(900);
  await mp.getByRole('link', { name: /Sample Customer Morgan/ }).click(); await mp.waitForTimeout(900);
  ok(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'request detail fits a phone');
  await mp.screenshot({ path: S + '/shots/inq-phone.png', fullPage: true });
  await mp.getByRole('button', { name: 'Create estimate' }).click(); await mp.waitForTimeout(1200);
  ok(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'estimate editor with costing fits a phone');
  await mp.screenshot({ path: S + '/shots/est-phone.png', fullPage: true });

  ok(errs.length === 0, 'no console errors ' + errs.join(' | ').slice(0, 300));
  await b.close();
})();
