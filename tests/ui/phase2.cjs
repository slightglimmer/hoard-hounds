const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const S = process.argv[2] || require('os').tmpdir() + '/hh-test-output'; const BASE = 'http://localhost:5180/admin/';
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:5180' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const dialog = p.getByRole('dialog');

  // ---- Prices
  await p.goto(BASE + '#/price-sheet', { waitUntil: 'networkidle' }); await p.waitForTimeout(700);
  ok(!(await p.getByText('Coming in Phase').count()), 'price sheet is a real page now');
  ok(await p.getByText('Full truck load').first().isVisible() && await p.getByText('$650.00 / load').isVisible(), 'sample prices listed with units');
  await p.screenshot({ path: S + '/shots/p2-prices.png', fullPage: true });
  await p.getByRole('button', { name: 'Add a price' }).click(); await p.waitForTimeout(250);
  await dialog.getByRole('button', { name: 'Add price' }).click(); await p.waitForTimeout(150);
  ok(await dialog.getByText('Give this service a name.').isVisible() && await dialog.getByText('Enter a price, like 95').isVisible(), 'price form validation');
  await dialog.getByLabel('Service name').fill('Garage cleanout');
  await dialog.getByLabel('Price').fill('300');
  await dialog.getByLabel('Minimum charge').fill('abc');
  await dialog.getByRole('button', { name: 'Add price' }).click(); await p.waitForTimeout(150);
  ok(await dialog.getByText('Enter an amount, or leave it empty.').isVisible(), 'bad minimum rejected');
  await dialog.getByLabel('Minimum charge').fill('');
  await dialog.getByRole('button', { name: 'Add price' }).click(); await p.waitForTimeout(600);
  const names = async () => p.locator('main ul li button span.min-w-0.font-display').allTextContents();
  let order = await names();
  ok(order[order.length - 1] === 'Garage cleanout', 'new price added at the end');
  await p.getByRole('button', { name: 'Move Garage cleanout up' }).click(); await p.waitForTimeout(700);
  order = await names();
  ok(order[order.length - 2] === 'Garage cleanout', 'move up works: ' + order.slice(-2).join(' > '));
  await p.getByRole('button', { name: 'Move Single item pickup up' }).isDisabled().then(d => ok(d, 'first item cannot move up'));

  // ---- Estimates list
  await p.getByRole('link', { name: 'Estimates' }).click(); await p.waitForTimeout(600);
  ok(await p.getByText('Sample Customer A').isVisible() && await p.getByText('Sample Customer B').isVisible(), 'sample estimates listed');
  await p.getByRole('radio', { name: 'Accepted' }).click(); await p.waitForTimeout(150);
  ok((await p.getByText('Sample Customer B').count()) === 0, 'status filter works');
  await p.getByRole('radio', { name: 'All' }).click();

  // ---- New estimate
  await p.getByRole('link', { name: 'New estimate' }).click(); await p.waitForTimeout(700);
  await p.getByRole('button', { name: 'Save estimate' }).click(); await p.waitForTimeout(200);
  ok(await p.getByText('Add the customer’s name.').first().isVisible() && await p.getByText('Add at least one service.').first().isVisible(), 'estimate validation');
  await p.getByLabel('Name').fill('Test Realtor');
  await p.getByLabel('Property address').fill('789 Test Rd, Redford, MI');
  await p.getByRole('button', { name: /^Full truck load \$/ }).click();
  await p.getByRole('button', { name: /^Full truck load \$/ }).click();
  ok((await p.getByLabel('Quantity of Full truck load').inputValue()) === '2', 'tapping a service twice makes quantity 2');
  await p.getByRole('button', { name: /^Single item pickup \$/ }).click();
  await p.getByLabel('Quantity of Single item pickup').fill('0.5');
  ok(await p.getByText('Minimum charge', { exact: true }).isVisible(), 'minimum charge badge shown for 0.5 × $95');
  await p.getByRole('button', { name: 'More Extra labor' }).count().then(() => {});
  await p.getByRole('button', { name: /^Extra labor \$/ }).click();
  await p.getByRole('button', { name: 'More Extra labor' }).click();
  await p.getByRole('button', { name: 'Add a custom line' }).click();
  const customName = p.getByLabel('Line description').last();
  await customName.fill('Piano removal');
  await p.getByLabel('Price for Piano removal').fill('175');
  await p.getByLabel('Discount (optional)').selectOption('percent');
  await p.getByLabel('Discount percent').fill('10');
  await p.getByLabel('Deposit to book').fill('150');
  // 2×650=1300, single item min 95, labor 2×45=90, piano 175 => 1660; 10% = 166 => 1494
  const totalText = await p.getByRole('complementary', { name: 'Estimate total' }).textContent();
  ok(totalText.includes('$1,660.00') && totalText.includes('−$166.00') && totalText.includes('$1,494.00') && totalText.includes('$150.00'), 'running total correct: ' + totalText.replace(/\s+/g, ' ').slice(0, 140));
  ok(await p.getByText('Unsaved changes').isVisible(), 'unsaved changes badge');

  // Copy text
  await p.getByRole('button', { name: 'Copy text' }).click(); await p.waitForTimeout(300);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  ok(clip.includes('For: Test Realtor, 789 Test Rd') && clip.includes('Estimated total: $1,494.00') && clip.includes('(734) 589-7627') && clip.includes('Deposit to book: $150.00'), 'copied text has customer, total, deposit and phone');
  console.log('---- copied text ----\n' + clip + '\n---------------------');

  // Save
  await p.getByRole('button', { name: 'Save estimate' }).click(); await p.waitForTimeout(900);
  ok(/#\/price-sheet\/estimates\/[\w-]+$/.test(p.url()) && !p.url().endsWith('/new'), 'address changes to the saved estimate');
  ok(await p.getByRole('heading', { name: 'Estimate #1003' }).isVisible(), 'numbered #1003');
  ok(!(await p.getByText('Unsaved changes').count()), 'unsaved badge cleared');
  await p.screenshot({ path: S + '/shots/p2-editor.png', fullPage: true });

  // Print version
  await p.emulateMedia({ media: 'print' });
  await p.screenshot({ path: S + '/shots/p2-print.png', fullPage: true });
  ok(await p.locator('.print-doc').isVisible() && !(await p.locator('#root').isVisible()), 'print shows only the estimate document');
  await p.emulateMedia({ media: 'screen' });
  ok(!(await p.locator('.print-doc').isVisible()), 'document hidden on screen');

  // Edit & status, then list
  await p.getByLabel('Status').selectOption('sent');
  await p.getByRole('button', { name: 'Save changes' }).click(); await p.waitForTimeout(800);
  await p.goto(BASE + '#/price-sheet/estimates'); await p.waitForTimeout(700);
  const row = p.getByRole('link', { name: /Test Realtor/ });
  ok(await row.isVisible() && (await row.textContent()).includes('$1,494.00') && (await row.textContent()).includes('Sent'), 'list shows saved estimate, total and status');

  // Delete
  await row.click(); await p.waitForTimeout(700);
  await p.getByRole('button', { name: 'Delete estimate' }).click();
  await p.getByRole('button', { name: 'Yes, delete this estimate' }).click(); await p.waitForTimeout(800);
  ok(p.url().endsWith('#/price-sheet/estimates') && !(await p.getByText('Test Realtor').count()), 'deleted and back to list');

  // Mobile editor
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(BASE + '#/price-sheet/estimates/new'); await p.waitForTimeout(800);
  await p.getByRole('button', { name: /^Full truck load \$/ }).click(); await p.getByRole('button', { name: /^Extra labor \$/ }).click();
  console.log('mobile overflow', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  await p.screenshot({ path: S + '/shots/p2-mobile.png', fullPage: true });
  console.log('errors', errs);
  await b.close();
})();
