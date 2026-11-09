const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs');
const S = process.argv[2] || require('os').tmpdir() + '/hh-test-output'; const BASE = 'http://localhost:5180/admin/';
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const dialog = p.getByRole('dialog');

  // Team
  await p.goto(BASE + '#/employees', { waitUntil: 'networkidle' }); await p.waitForTimeout(900);
  ok(!(await p.getByText('Coming in Phase').count()), 'employees is a real page');
  ok(await p.getByText('Sample Crew Lead Jordan').isVisible() && await p.getByText('$22.00 / hr').isVisible(), 'crew cards with rates');
  await p.screenshot({ path: S + '/shots/p4-team.png', fullPage: true });
  await p.getByRole('button', { name: 'Add a crew member' }).click(); await p.waitForTimeout(250);
  await dialog.getByRole('button', { name: 'Add crew member' }).click(); await p.waitForTimeout(150);
  ok(await dialog.getByText('Add their name.').isVisible(), 'name required');
  await dialog.getByLabel('Name').fill('Test Helper Riley');
  await dialog.getByLabel('Hourly rate (optional)').fill('abc');
  await dialog.getByRole('button', { name: 'Add crew member' }).click(); await p.waitForTimeout(150);
  ok(await dialog.getByText('Enter a rate like 18').isVisible(), 'bad rate rejected');
  await dialog.getByLabel('Hourly rate (optional)').fill('19.75');
  await dialog.getByRole('button', { name: 'Add crew member' }).click(); await p.waitForTimeout(700);
  ok(await p.getByText('Test Helper Riley').isVisible() && await p.getByText('$19.75 / hr').isVisible(), 'crew member added');

  // Delete blocked for someone with hours
  await p.getByRole('button', { name: /Sample Crew Lead Jordan/ }).click(); await p.waitForTimeout(300);
  await dialog.getByRole('button', { name: 'Delete' }).click(); await p.waitForTimeout(400);
  ok(await dialog.getByText('They have hours logged').isVisible(), 'cannot delete someone with hours');
  await p.keyboard.press('Escape');

  // Hours tab
  await p.getByRole('link', { name: 'Hours' }).first().click(); await p.waitForTimeout(900);
  ok(await p.getByText(/entr(y|ies) needs? your approval/).isVisible(), 'pending approval banner');
  await p.screenshot({ path: S + '/shots/p4-hours.png', fullPage: true });
  const before = await p.locator('main').textContent();
  await p.getByRole('button', { name: /^Approve \d+$/ }).click(); await p.waitForTimeout(800);
  ok(!(await p.getByText(/needs? your approval/).count()), 'approve all clears the banner');

  // Log hours for the new helper, 7:30 at default rate
  await p.getByRole('button', { name: 'Log hours' }).first().click(); await p.waitForTimeout(300);
  await dialog.getByLabel('Who worked').selectOption({ label: 'Test Helper Riley' });
  ok((await dialog.getByLabel('Hourly rate (optional)').inputValue()) === '19.75', 'rate fills from crew member');
  await dialog.getByLabel('Hours').fill('7:30');
  ok((await dialog.getByText(/Estimated wages:/).textContent()).includes('$148.13'), '7:30 × $19.75 = $148.13 shown');
  await dialog.getByRole('button', { name: '8 hrs' }).click();
  ok((await dialog.getByText(/Estimated wages:/).textContent()).includes('$158.00'), 'quick 8 hrs button');
  await dialog.getByLabel('Hours').fill('30');
  await dialog.getByRole('button', { name: 'Log hours' }).click(); await p.waitForTimeout(150);
  ok(await dialog.getByText('Enter hours between 0 and 24').isVisible(), 'over 24 hours rejected');
  await dialog.getByLabel('Hours').fill('6.5');
  await dialog.getByRole('button', { name: 'Log hours' }).click(); await p.waitForTimeout(800);
  const row = p.getByRole('button', { name: /Edit Test Helper Riley, 6.5 hours/ });
  ok(await row.isVisible() && (await row.textContent()).includes('$128.38'), 'entry listed with wages $128.38');

  // Filter + CSV
  await p.locator('main select').first().selectOption({ label: 'Test Helper Riley' }); await p.waitForTimeout(200);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Export CSV' }).click()]);
  const file = S + '/hours.csv'; await dl.saveAs(file); const csv = fs.readFileSync(file, 'utf8');
  ok(csv.includes('Estimated gross wages') && csv.includes('Test Helper Riley') && csv.includes(',6.50,19.75,128.38,'), 'CSV export has hours, rate and wages');

  // Job page crew section
  await p.goto(BASE + '#/jobs'); await p.waitForTimeout(800);
  await p.locator('main ul li a[href^="#/jobs/"]').filter({ hasText: 'In progress' }).first().click(); await p.waitForTimeout(1000);
  ok(await p.getByRole('heading', { name: 'Crew & hours' }).isVisible(), 'job page has Crew & hours');
  const crew = p.getByLabel('Crew on this job');
  ok((await crew.textContent()).includes('Sample Crew Lead Jordan'), 'assigned crew shown');
  const sumBefore = await p.getByRole('complementary', { name: 'Job money summary' }).textContent();
  await p.getByLabel('Add someone to this job').selectOption({ label: 'Test Helper Riley' }); await p.waitForTimeout(700);
  ok((await crew.textContent()).includes('Test Helper Riley'), 'added to crew');
  await p.getByRole('button', { name: 'Log hours' }).click(); await p.waitForTimeout(300);
  await dialog.getByLabel('Who worked').selectOption({ label: 'Test Helper Riley' });
  ok((await dialog.getByLabel('Job (optional)').inputValue()).length > 10, 'job pre-selected');
  await dialog.getByLabel('Hours').fill('4');
  await dialog.getByRole('button', { name: 'Log hours' }).click(); await p.waitForTimeout(900);
  const sumAfter = await p.getByRole('complementary', { name: 'Job money summary' }).textContent();
  const labor = (t) => Number(t.match(/Labor \(est\.\)\$([\d,.]+)/)[1].replace(/,/g, ''));
  ok(Math.abs(labor(sumAfter) - labor(sumBefore) - 79) < 0.001, `job labor went up by $79.00 (${labor(sumBefore)} -> ${labor(sumAfter)})`);
  await p.getByRole('button', { name: 'Take Test Helper Riley off this job' }).click(); await p.waitForTimeout(700);
  ok((await p.getByRole('button', { name: 'Take Test Helper Riley off this job' }).count()) === 0, 'removed from crew (hours stay)');
  ok(await p.getByRole('button', { name: /Test Helper Riley.*4 hrs/ }).isVisible(), 'their hours still on the job');
  await p.screenshot({ path: S + '/shots/p4-job.png', fullPage: true });

  // Overview labor note
  await p.goto(BASE + '#/overview'); await p.waitForTimeout(900);
  ok(await p.getByText('Hours × hourly rate, before taxes').isVisible(), 'overview labor note');

  // Mobile
  await p.setViewportSize({ width: 390, height: 844 });
  for (const h of ['#/employees', '#/employees/hours']) { await p.goto(BASE + h); await p.waitForTimeout(900); console.log('mobile overflow', h, await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)); }
  await p.screenshot({ path: S + '/shots/p4-mobile.png', fullPage: true });
  console.log('errors', errs);
  await b.close();
})();
