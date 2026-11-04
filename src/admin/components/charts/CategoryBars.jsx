import { formatCents } from '../../lib/money.js';

const SHADES = ['#9c3d5d', '#b9506f', '#cf7690', '#e09aac', '#ecbcc8', '#f3d3db'];

// Horizontal bars of spending per category, largest first. `items` = [{ id, name, cents }].
export default function CategoryBars({ items, limit = 6 }) {
  const total = items.reduce((s, x) => s + x.cents, 0);
  const shown = items.slice(0, limit);
  const rest = items.slice(limit).reduce((s, x) => s + x.cents, 0);
  const rows = rest > 0 ? [...shown, { id: 'rest', name: `${items.length - limit} more categories`, cents: rest }] : shown;
  const max = Math.max(1, ...rows.map((r) => r.cents));

  return (
    <ul className="space-y-3.5">
      {rows.map((r, i) => (
        <li key={r.id} className="animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold">{r.name}</span>
            <span className="shrink-0 tabular text-muted">
              <span className="font-semibold text-ink">{formatCents(r.cents)}</span> · {total ? Math.round((r.cents / total) * 100) : 0}%
            </span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-blush">
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${(r.cents / max) * 100}%`, background: SHADES[Math.min(i, SHADES.length - 1)] }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
