// Internal job costing for estimates. Never shown to customers.
// Everything is in whole cents so the math is exact.
//
//   direct cost   = dumpster + labor (hours x hourly cost) + other direct costs
//   contingency   = direct cost x contingency %
//   estimated cost = direct cost + contingency
//   suggested price = estimated cost / (1 - target margin), rounded UP to the next dollar
//   gross profit  = price - estimated cost
//   gross margin  = gross profit / price
//
// A 30% margin is not a 30% markup: $1,000 of cost at a 30% margin is $1,429
// (30% of $1,429 is profit), while a 30% markup would only be $1,300.

export const MAX_MARGIN = 90;

const cents = (v) => Math.round(Number(v || 0) * 100);
const hundredths = (v) => Math.round(Number(v || 0) * 100);

// Accepts "12", "12.5", "$1,200.00". Returns a number, or null if it isn't one.
export function parseNumber(v) {
  const s = String(v ?? '').replace(/[$,%\s]/g, '');
  if (s === '') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Number(s);
}

export const COSTING_FIELDS = ['dumpster_cost', 'labor_hours', 'labor_rate', 'other_costs', 'contingency_pct', 'target_margin_pct'];

// Returns { field: message } for anything that can't be used.
export function validateCosting(input) {
  const errors = {};
  for (const f of COSTING_FIELDS) {
    if (parseNumber(input[f]) === null) errors[f] = 'Enter a number, like 250 or 12.5.';
  }
  if (!errors.labor_hours && parseNumber(input.labor_hours) > 2000) errors.labor_hours = 'That’s more than 2,000 hours.';
  if (!errors.contingency_pct && parseNumber(input.contingency_pct) > 100) errors.contingency_pct = 'Use 0 to 100%.';
  if (!errors.target_margin_pct && parseNumber(input.target_margin_pct) > MAX_MARGIN) {
    errors.target_margin_pct = `Use a margin from 0 to ${MAX_MARGIN}%.`;
  }
  return errors;
}

export function computeCosting(input) {
  const dumpster = cents(parseNumber(input.dumpster_cost));
  const labor = Math.round((hundredths(parseNumber(input.labor_hours)) * cents(parseNumber(input.labor_rate))) / 100);
  const other = cents(parseNumber(input.other_costs));
  const direct = dumpster + labor + other;
  const contingency = Math.round((direct * hundredths(parseNumber(input.contingency_pct))) / 10000);
  const cost = direct + contingency;
  const margin = Math.min(hundredths(parseNumber(input.target_margin_pct)), MAX_MARGIN * 100) / 10000; // 0.3 for 30%
  const exact = margin > 0 ? cost / (1 - margin) : cost;
  const price = Math.ceil(Math.round(exact) / 100) * 100; // round up to a whole dollar
  const profit = price - cost;
  return {
    dumpster,
    labor,
    other,
    direct,
    contingency,
    cost,
    price,
    profit,
    marginPct: price > 0 ? (profit / price) * 100 : 0,
    deposit: dumpster,
  };
}

// Profit and margin if the customer pays `totalCents` for a job costing `costCents`.
export function marginAt(totalCents, costCents) {
  const profit = totalCents - costCents;
  return { profit, marginPct: totalCents > 0 ? (profit / totalCents) * 100 : 0 };
}
