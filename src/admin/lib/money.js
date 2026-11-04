// Amounts are summed in whole cents to avoid floating-point drift.

export const toCents = (v) => Math.round(Number(v || 0) * 100);

export function sumCents(rows, pick) {
  return rows.reduce((total, row) => total + toCents(pick(row)), 0);
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export const formatMoney = (dollars) => usd.format(Number(dollars));
export const formatCents = (cents) => usd.format(cents / 100);

// Compact chart labels: $950, $1.2k, $15k
export function formatCentsShort(cents) {
  const d = cents / 100;
  const abs = Math.abs(d);
  const sign = d < 0 ? '-' : '';
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return `${sign}$${Math.round(abs)}`;
}

// Parses what someone types in an amount box ("$1,250.5" -> "1250.50"). Returns null if invalid.
export function parseAmount(input) {
  const cleaned = String(input ?? '').replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value > 0 && value < 1e10 ? value.toFixed(2) : null;
}
