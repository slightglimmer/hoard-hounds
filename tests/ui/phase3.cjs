const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const S = process.argv[2] || require('os').tmpdir() + '/hh-test-output'; const BASE = 'http://localhost:5180/admin/';
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const dialog = p.getByRole('dialog');
  const summary = () => p.getByRole('complementary', { name: 'Job money summary' }).textContent();

  await p.goto(BASE + '#/jobs', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  ok(!(await p.getByText('Coming in Phase').count()), 'jobs is a real page');
  const chips = await p.getByRole('region', { name: 'Job totals' }).textContent();
  ok(/Active jobs\d+/.test(chips) && chips.includes('Owed to you') && chips.includes('Job profit in'), 'summary chips: ' + chips.replace(/\s+/g, ' '));
  const activeCount = await p.locator('main ul li a[href^="#/jobs/"]').count();
  await p.getByRole('radio', { name: 'Completed' }).click(); await p.waitForTimeout(200);
  const completedCount = await p.locator('main ul li a[href^="#/jobs/"]').count();
  ok(activeCount >= 3 && completedCount > activeCount, `filters work (active ${activeCount}, completed ${completedCount})`);
  await p.screenshot({ path: S + '/shots/p3-list.png', fullPage: true });

  // New job with new customer
  await p.getByRole('link', { name: 'New job' }).click(); await p.waitForTimeout(700);
  await p.getByRole('button', { name: 'Create job' }).first().click(); await p.waitForTimeout(200);
  ok(await p.getByText('Give the job a short name').isVisible(), 'job name required');
  await p.getByLabel('Job name').fill('Maple St vacant cleanout');
  await p.getByLabel('Customer (optional)').selectOption({ label: '＋ New customer…' });
  await p.getByRole('button', { name: 'Create job' }).first().click(); await p.waitForTimeout(200);
  ok(await p.getByText('Add the new customer’s name.').isVisible(), 'new customer name required');
  await p.getByLabel('Name', { exact: true }).fill('Test Agent Rhonda');
  await p.getByLabel('Phone (optional)').fill('313-555-0199');
  await p.getByLabel('Type of customer (optional)').selectOption('real_estate_agent');
  await p.getByLabel('Property address (optional)').fill('55 Maple St, Redford, MI');
  await p.getByLabel('Status').selectOption('scheduled');
  await p.getByLabel('Scheduled for (optional)').fill('2026-11-20');
  await p.getByLabel('Agreed price (optional)').fill('900');
  await p.getByRole('button', { name: 'Create job' }).first().click(); await p.waitForTimeout(1000);
  ok(/#\/jobs\/[\w-]+$/.test(p.url()) && !p.url().endsWith('/new'), 'created and opened job page');
  ok(await p.getByRole('heading', { name: 'Maple St vacant cleanout' }).isVisible(), 'job title shown');

  // Payment + cost
  await p.getByRole('button', { name: 'Record a payment' }).click(); await p.waitForTimeout(250);
  await dialog.getByLabel('Amount').fill('150');
  await dialog.getByRole('button', { name: 'Record payment' }).click(); await p.waitForTimeout(700);
  let sum = await summary();
  ok(sum.includes('Received$150.00') && sum.includes('Still owed$750.00'), 'deposit counted, balance $750');
  // unsaved edit should survive adding a cost
  await p.getByLabel('Notes for the crew (optional)').fill('Lockbox code from agent');
  await p.getByRole('button', { name: 'Add a cost' }).click(); await p.waitForTimeout(250);
  ok((await dialog.getByLabel('What was it for?').inputValue()) !== '', 'cost defaults to a category');
  await dialog.getByLabel('What was it for?').selectOption({ label: 'Dumpster rental' });
  await dialog.getByLabel('Amount').fill('129');
  await dialog.getByRole('button', { name: 'Add cost' }).click(); await p.waitForTimeout(700);
  sum = await summary();
  ok(sum.includes('Job costs$129.00') && /Profit so far.*\$21\.00/.test(sum) && sum.includes('Once paid in full$771.00'), 'profit math: ' + sum.replace(/\s+/g, ' ').slice(0, 220));
  ok((await p.getByLabel('Notes for the crew (optional)').inputValue()) === 'Lockbox code from agent', 'unsaved crew notes kept after adding a cost');
  // Refund
  await p.getByRole('button', { name: 'Record a payment' }).click(); await p.waitForTimeout(250);
  await dialog.getByLabel('Type').selectOption('refund'); await dialog.getByLabel('Amount').fill('50');
  await dialog.getByRole('button', { name: 'Record payment' }).click(); await p.waitForTimeout(700);
  sum = await summary();
  ok(sum.includes('Received$100.00') && sum.includes('Still owed$800.00'), 'refund subtracts');
  // Complete -> date auto fills
  await p.getByLabel('Status').selectOption('completed');
  ok((await p.getByLabel('Completed on (optional)').inputValue()).length === 10, 'completed date filled in automatically');
  await p.getByRole('button', { name: 'Save changes' }).first().click(); await p.waitForTimeout(900);
  ok(await p.getByText('Job saved').isVisible(), 'saved');
  await p.screenshot({ path: S + '/shots/p3-job.png', fullPage: true });
  const jobUrl = p.url();

  // Delete blocked while payments exist
  await p.getByRole('button', { name: 'Delete job' }).click(); await p.waitForTimeout(300);
  ok(await p.getByText('This job has payments recorded').isVisible(), 'delete blocked when payments exist');

  // Customers tab
  await p.goto(BASE + '#/jobs/customers'); await p.waitForTimeout(800);
  const card = p.getByRole('button', { name: /Test Agent Rhonda/ });
  ok(await card.isVisible() && (await card.textContent()).includes('1 job') && (await card.textContent()).includes('Real estate agent'), 'customer listed with 1 job and type');
  await card.click(); await p.waitForTimeout(300);
  await dialog.getByRole('button', { name: 'Delete' }).click(); await p.waitForTimeout(200);
  ok(await dialog.getByText('has 1 job, so they can’t be deleted').isVisible(), 'customer with jobs cannot be deleted');
  await p.keyboard.press('Escape');

  // Job cost appears in Expenses (bookkeeping)
  await p.goto(BASE + '#/expenses'); await p.waitForTimeout(800);
  await p.getByPlaceholder('Search').fill('Dumpster rental'); await p.waitForTimeout(200);
  ok((await p.locator('main ul li button[aria-label*="$129.00"]').count()) >= 1, 'job cost also shows in Expenses');

  // Estimate -> job
  await p.goto(BASE + '#/price-sheet/estimates'); await p.waitForTimeout(800);
  await p.getByRole('link', { name: /Sample Customer A/ }).click(); await p.waitForTimeout(900);
  const estTotal = (await p.getByRole('complementary', { name: 'Estimate total' }).textContent()).match(/Estimated total(\$[\d,.]+)/)[1];
  await p.getByRole('button', { name: 'Turn into a job' }).click(); await p.waitForTimeout(1500);
  ok(/#\/jobs\/[\w-]+$/.test(p.url()), 'estimate turned into a job');
  ok((await p.getByLabel('Agreed price (optional)').inputValue()) === estTotal.replace(/[$,]/g, ''), 'agreed price = estimate total ' + estTotal);
  ok((await p.getByLabel('Status').inputValue()) === 'scheduled', 'accepted estimate -> scheduled job');
  ok(await p.getByText(/^From estimate #1001 \(/).isVisible(), 'job links back to estimate');
  await p.getByRole('link', { name: /#1001/ }).click(); await p.waitForTimeout(900);
  ok(await p.getByRole('link', { name: 'Open the job' }).isVisible(), 'estimate now shows "Open the job"');

  // Overview revenue note
  await p.goto(BASE + '#/overview'); await p.waitForTimeout(900);
  ok(await p.getByText('Payments received on jobs').isVisible(), 'overview revenue note updated');

  // Mobile
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(jobUrl); await p.waitForTimeout(900);
  console.log('mobile overflow job', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  await p.screenshot({ path: S + '/shots/p3-mobile.png', fullPage: true });
  await p.goto(BASE + '#/jobs'); await p.waitForTimeout(800);
  console.log('mobile overflow list', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  console.log('errors', errs);
  await b.close();
})();
