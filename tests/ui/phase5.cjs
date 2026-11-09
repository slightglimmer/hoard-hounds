const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const S = process.argv[2] || require('os').tmpdir() + '/hh-test-output'; const BASE = 'http://localhost:5180/admin/';
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(BASE + '#/reports', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  ok(!(await p.getByText('Coming in Phase').count()), 'reports is a real page');
  ok(!(await p.locator('nav').getByText('Soon').count()), 'no "Soon" left in the menu');
  const y = new Date().getFullYear();
  const totalsTxt = await p.getByRole('region', { name: `${y} totals` }).textContent();
  const money = (label, t) => Number(t.match(new RegExp(label + '[^$-]*(-?\\$[\\d,]+\\.\\d{2})'))[1].replace(/[$,]/g, ''));
  const rev = money('Revenue', totalsTxt), exp = money('Expenses', totalsTxt), lab = money('Labor \\(estimated\\)', totalsTxt), prof = money('Net profit', totalsTxt);
  ok(Math.abs(rev - exp - lab - prof) < 0.01, `profit = revenue - expenses - labor (${rev} - ${exp} - ${lab} = ${prof})`);
  const rows = await p.locator('table:has(tfoot) tbody tr').count();
  ok(rows === new Date().getMonth() + 1, `monthly table stops at this month (${rows} rows)`);
  const foot = await p.locator('table tfoot').textContent();
  ok(foot.includes('$' + rev.toLocaleString('en-US', { minimumFractionDigits: 2 })), 'table total matches revenue card');
  ok(await p.getByRole('heading', { name: 'Expenses for taxes' }).isVisible() && await p.getByText('Car and truck expenses').first().isVisible(), 'tax category breakdown');
  ok(await p.getByText('Top customers').isVisible(), 'top customers');
  await p.screenshot({ path: S + '/shots/p5-reports.png', fullPage: true });

  // ZIP pack
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download all (.zip)' }).click()]);
  ok(dl.suggestedFilename() === `hoard-hounds-${y}-records.zip`, 'zip filename ' + dl.suggestedFilename());
  await dl.saveAs(S + '/pack.zip');
  // single file
  const [one] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /All expenses/ }).click()]);
  ok(one.suggestedFilename() === '03-expenses.csv', 'single CSV download');
  console.log(`TOTALS ${rev} ${exp} ${lab} ${prof}`);

  // Previous year: comparisons appear
  await p.getByLabel('Year').selectOption(String(y - 1)); await p.waitForTimeout(1200);
  const prevTxt = await p.getByRole('region', { name: `${y - 1} totals` }).textContent();
  ok(prevTxt.includes('No earlier data') || /\d+%/.test(prevTxt), 'last year shows comparison info');
  ok((await p.locator('table:has(tfoot) tbody tr').count()) === 12, 'full year has 12 months');
  // Empty year
  await p.getByLabel('Year').selectOption(String(y - 3)); await p.waitForTimeout(1000);
  ok(await p.getByText(`Nothing recorded for ${y - 3}`).isVisible(), 'empty year message');

  await p.setViewportSize({ width: 390, height: 844 });
  await p.getByLabel('Year').selectOption(String(y)); await p.waitForTimeout(1200);
  console.log('mobile overflow', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  await p.screenshot({ path: S + '/shots/p5-mobile.png', fullPage: true });
  console.log('errors', errs);
  await b.close();
})();
