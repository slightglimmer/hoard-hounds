// The internal pricing calculator (src/admin/lib/costing.js).
const c = await import(new URL('../../src/admin/lib/costing.js', import.meta.url).href);
const ok = (cond, m) => console.log((cond ? 'PASS ' : 'FAIL ') + m);

let r = c.computeCosting({ dumpster_cost: '1000', target_margin_pct: '30' });
ok(r.cost === 100000 && r.price === 142900, '30% margin on $1,000 cost is $1,429 (not $1,300 markup)');
ok(r.profit === 42900 && Math.abs(r.marginPct - 30.02) < 0.01, 'profit and margin from rounded price');

r = c.computeCosting({ dumpster_cost: '525', labor_hours: '24', labor_rate: '22', other_costs: '60', contingency_pct: '10', target_margin_pct: '35' });
// direct = 525 + 528 + 60 = 1113; contingency 111.30; cost 1224.30; /0.65 = 1883.538 -> 1884
ok(r.labor === 52800 && r.direct === 111300 && r.contingency === 11130 && r.cost === 122430, 'labor, direct cost and contingency');
ok(r.price === 188400 && r.profit === 188400 - 122430, 'suggested price rounded up to the next dollar');
ok(r.price * (1 - 0.35) >= r.cost, 'suggested price always meets the target margin');
ok(r.deposit === 52500, 'suggested deposit = dumpster rental cost');

r = c.computeCosting({ labor_hours: '7.5', labor_rate: '18.25' });
ok(r.labor === 13688 && r.price === 13700 && r.marginPct > 0 && r.marginPct < 1, 'fractional hours; 0% margin price = cost (rounded up)');

r = c.computeCosting({});
ok(r.cost === 0 && r.price === 0 && r.marginPct === 0, 'empty inputs give zeros, no division errors');

ok(Object.keys(c.validateCosting({ dumpster_cost: 'abc', labor_hours: '-3', target_margin_pct: '95', contingency_pct: '150' })).length === 4, 'invalid inputs rejected');
ok(Object.keys(c.validateCosting({ dumpster_cost: '$1,250.00', labor_hours: '12', labor_rate: '20', contingency_pct: '10%', target_margin_pct: '30' })).length === 0, 'money and percent formats accepted');
ok(c.validateCosting({ target_margin_pct: '100' }).target_margin_pct, '100% margin rejected (would divide by zero)');
r = c.computeCosting({ dumpster_cost: '100', target_margin_pct: '99' });
ok(Number.isFinite(r.price) && r.price === 100000, 'margin capped even if validation is skipped');

const m = c.marginAt(150000, 100000);
ok(m.profit === 50000 && Math.abs(m.marginPct - 33.33) < 0.01, 'margin at the quoted total');
ok(c.marginAt(0, 5000).marginPct === 0, 'no total: no margin');
