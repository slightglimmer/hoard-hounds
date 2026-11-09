const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs');
const S = process.argv[2] || require('os').tmpdir() + '/hh-test-output'; const BASE = 'http://localhost:5180/admin/';
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(BASE + '#/expenses', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  const totalText = async () => (await p.locator('text=/across \\d+ expense/').first().textContent());
  const before = await totalText();

  // Validation
  await p.getByRole('button', { name: 'Add expense' }).first().click();
  await p.waitForTimeout(300);
  const dialog = p.getByRole('dialog');
  ok(await dialog.isVisible(), 'add dialog opens');
  ok(await p.evaluate(() => document.activeElement?.closest('[role=dialog]') !== null), 'focus moves into dialog');
  await dialog.getByRole('button', { name: 'Add expense' }).click();
  await p.waitForTimeout(200);
  ok(await dialog.getByText('Enter an amount greater than $0').isVisible(), 'amount validation shown');
  ok(await dialog.getByText('Add a short description.').isVisible(), 'description validation shown');
  ok(await dialog.getByText('Choose a category.').isVisible(), 'category validation shown');
  await dialog.getByLabel('Amount').fill('abc');
  await dialog.getByLabel('Description').fill('Test dumpster fee');
  await dialog.getByLabel('Category').selectOption({ label: 'Dump & disposal fees' });
  await dialog.getByRole('button', { name: 'Add expense' }).click(); await p.waitForTimeout(200);
  ok(await dialog.getByText('Enter an amount greater than $0').isVisible(), 'rejects non-numeric amount');
  await dialog.getByLabel('Amount').fill('$1,234.5');
  await dialog.getByLabel('Vendor').fill('=HYPERLINK("http://evil")');
  await dialog.getByRole('button', { name: 'Add expense' }).click(); await p.waitForTimeout(700);
  ok(!(await dialog.isVisible()), 'dialog closes after save');
  ok(await p.getByText('Expense added').isVisible(), 'toast shown');
  const row = p.getByRole('button', { name: /Edit Test dumpster fee, \$1,234\.50/ });
  ok(await row.isVisible(), 'new expense listed with parsed amount $1,234.50');
  ok((await totalText()) !== before, 'total updated');

  // Edit
  await row.click(); await p.waitForTimeout(300);
  await dialog.getByLabel('Amount').fill('99.10');
  await dialog.getByRole('button', { name: 'Save changes' }).click(); await p.waitForTimeout(700);
  ok(await p.getByRole('button', { name: /Edit Test dumpster fee, \$99\.10/ }).isVisible(), 'edit saved');

  // Search + category filter
  await p.getByPlaceholder('Search').fill('Test dumpster'); await p.waitForTimeout(200);
  ok((await p.locator('main ul li button[aria-label^="Edit"]').count()) === 1, 'search narrows to 1 row');
  await p.getByPlaceholder('Search').fill('');

  // CSV export (this year)
  await p.getByRole('radio', { name: 'This year' }).click(); await p.waitForTimeout(600);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Export CSV' }).click()]);
  const file = S + '/export.csv'; await dl.saveAs(file);
  const csv = fs.readFileSync(file, 'utf8');
  ok(dl.suggestedFilename().startsWith('hoard-hounds-expenses-'), 'csv filename ' + dl.suggestedFilename());
  ok(csv.split('\r\n')[0].includes('Date,Vendor,Description,Category,Tax category (suggested),Amount'), 'csv header');
  ok(csv.includes(`"'=HYPERLINK(""http://evil"")"`), 'formula in vendor neutralized');
  ok(csv.includes(',99.10,'), 'amount formatted 99.10');

  // Delete with confirm
  await p.getByRole('button', { name: /Edit Test dumpster fee/ }).click(); await p.waitForTimeout(300);
  await dialog.getByRole('button', { name: 'Delete' }).click();
  ok(await dialog.getByRole('button', { name: 'Yes, delete it' }).isVisible(), 'delete asks to confirm');
  await dialog.getByRole('button', { name: 'Yes, delete it' }).click(); await p.waitForTimeout(700);
  ok((await p.getByRole('button', { name: /Edit Test dumpster fee/ }).count()) === 0, 'deleted');

  // Escape closes, focus returns
  await p.getByRole('button', { name: 'Add expense' }).first().click(); await p.waitForTimeout(200);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ok(!(await dialog.isVisible()), 'Escape closes dialog');
  ok(await p.evaluate(() => document.activeElement?.textContent?.includes('Add expense')), 'focus returns to button');

  // Recurring
  await p.goto(BASE + '#/expenses/recurring'); await p.waitForTimeout(800);
  const recordBtn = p.getByRole('button', { name: /^Record \d+ due$/ });
  ok(await recordBtn.isVisible(), 'record due button: ' + (await recordBtn.textContent()));
  await recordBtn.click(); await p.waitForTimeout(900);
  ok(await p.getByText(/Recorded \d+ charge/).isVisible(), 'charges recorded toast');
  ok((await p.getByRole('button', { name: /^Record \d+ due$/ }).count()) === 0, 'nothing due afterwards');
  await p.getByRole('button', { name: 'Add recurring' }).click(); await p.waitForTimeout(300);
  await dialog.getByLabel('Description').fill('Storage unit');
  await dialog.getByLabel('Amount').fill('89');
  await dialog.getByLabel('Category').selectOption({ label: 'Other' });
  await dialog.getByLabel('First charge date').fill('2026-01-31');
  ok(await dialog.getByText('Next charge: Jan 31, 2026').isVisible(), 'next charge preview');
  await dialog.getByRole('button', { name: 'Add recurring charge' }).click(); await p.waitForTimeout(800);
  const rb = p.getByRole('button', { name: /^Record \d+ due$/ });
  ok((await rb.textContent()).includes('10'), 'backdated monthly from Jan 31 => 10 due through Oct 31 (got ' + (await rb.textContent()) + ')');
  await rb.click(); await p.waitForTimeout(900);
  await p.goto(BASE + '#/expenses'); await p.waitForTimeout(300);
  await p.getByRole('radio', { name: 'This year' }).click(); await p.waitForTimeout(700);
  await p.getByPlaceholder('Search').fill('Storage unit'); await p.waitForTimeout(200);
  const dates = await p.locator('main ul li button[aria-label^="Edit Storage unit"]').evaluateAll(els => els.map(e => e.getAttribute('aria-label').split(' on ')[1]));
  ok(dates.includes('Feb 28, 2026') && dates.includes('Mar 31, 2026') && dates.includes('Apr 30, 2026'), 'month-end dates: ' + dates.slice(-4).join(' | '));

  // Categories
  await p.goto(BASE + '#/expenses/categories'); await p.waitForTimeout(700);
  await p.getByRole('button', { name: 'Add category' }).click(); await p.waitForTimeout(200);
  await dialog.getByLabel('Name').fill('Fuel'); await dialog.getByRole('button', { name: 'Save' }).click(); await p.waitForTimeout(500);
  ok(await dialog.getByText('That would create a duplicate.').isVisible(), 'duplicate category rejected');
  await dialog.getByLabel('Name').fill('Storage'); await dialog.getByRole('button', { name: 'Save' }).click(); await p.waitForTimeout(600);
  ok(await p.getByRole('button', { name: /^Storage/ }).isVisible(), 'category added');

  // Coming soon page + mobile drawer
  await p.goto(BASE + '#/reports'); await p.waitForTimeout(400);
  ok(await p.getByRole('heading', { name: 'Reports', level: 1 }).isVisible(), 'reports page opens');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await p.getByRole('button', { name: 'Open menu' }).click(); await p.waitForTimeout(400);
  await p.screenshot({ path: S + '/shots/mob-menu.png' });
  await p.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: /Expenses/ }).click(); await p.waitForTimeout(500);
  ok((await p.getByRole('dialog', { name: 'Menu' }).count()) === 0 && p.url().endsWith('#/expenses'), 'drawer navigates and closes');
  await p.getByRole('button', { name: 'Add expense' }).first().click(); await p.waitForTimeout(500);
  await p.screenshot({ path: S + '/shots/mob-form.png' });
  console.log('errors', errs);
  await b.close();
})();
