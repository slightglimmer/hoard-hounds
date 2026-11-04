import { useEffect, useRef, useState } from 'react';
import { MONTHS_SHORT } from '../../lib/dates.js';
import { formatCents, formatCentsShort } from '../../lib/money.js';

export const SERIES = {
  revenue: { label: 'Revenue', color: '#9c3d5d' },
  expenses: { label: 'Expenses', color: '#e9a9b8' },
  labor: { label: 'Labor (est.)', color: '#d9a441' },
  profit: { label: 'Net profit', color: '#3a2630' },
};

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

// Round axis steps: 1, 2, 2.5 or 5 times a power of ten.
function niceStep(range, targetTicks) {
  const raw = range / targetTicks;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) || pow * 10;
}

// Revenue bar next to a stacked expenses + labor bar for each month, with net
// profit as a line. All values in cents.
// `lastMonth` stops the profit line at the current month instead of dropping to $0
// for months that haven't happened yet.
export default function MonthlyChart({ months, year, currentMonth = -1, lastMonth = 11 }) {
  const [wrapRef, width] = useWidth();
  const [hover, setHover] = useState(null);
  const height = width < 520 ? 230 : 280;
  const pad = { top: 16, right: 8, bottom: 30, left: width < 520 ? 40 : 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const hasData = months.some((m) => m.revenue || m.expenses || m.labor);
  // An empty chart still gets a readable $0 to $1k scale.
  const maxVal = hasData ? Math.max(100, ...months.map((m) => Math.max(m.revenue, m.expenses + m.labor, m.profit))) : 100000;
  const minVal = Math.min(0, ...months.map((m) => m.profit));
  const step = Math.max(100, niceStep(maxVal - minVal, 4)); // never finer than $1
  const top = Math.ceil(maxVal / step) * step;
  const bottom = Math.floor(minVal / step) * step;
  const y = (v) => pad.top + innerH - ((v - bottom) / (top - bottom)) * innerH;
  const ticks = [];
  for (let v = bottom; v <= top + 1; v += step) ticks.push(v);

  const slot = innerW / 12;
  const barW = Math.max(4, Math.min(16, slot * 0.28));
  const cx = (i) => pad.left + slot * i + slot / 2;
  const lineMonths = months.slice(0, lastMonth + 1);
  const profitPoints = lineMonths.map((m, i) => `${cx(i)},${y(m.profit)}`).join(' ');

  return (
    <div ref={wrapRef} className="relative">
      <svg width={width} height={height} role="img" aria-label={`Monthly revenue, costs and net profit for ${year}. Data table follows.`} className="block overflow-visible">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#e4c3cb' : '#f3e4e7'} strokeDasharray={v === 0 ? undefined : '3 5'} />
            <text x={pad.left - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize="11" fill="#6f5561" className="tabular">
              {formatCentsShort(v)}
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const x = cx(i);
          const active = hover === i;
          return (
            <g key={i} opacity={hover === null || active ? 1 : 0.45} style={{ transition: 'opacity 0.2s' }}>
              {i === currentMonth && <rect x={x - slot / 2 + 2} y={pad.top} width={slot - 4} height={innerH} rx="10" fill="#fbeaec" />}
              <rect x={x - barW - 1.5} y={y(Math.max(0, m.revenue))} width={barW} height={Math.abs(y(0) - y(m.revenue))} rx={Math.min(5, barW / 2)} fill={SERIES.revenue.color} />
              <rect x={x + 1.5} y={y(m.expenses)} width={barW} height={y(0) - y(m.expenses)} rx={Math.min(5, barW / 2)} fill={SERIES.expenses.color} />
              {m.labor > 0 && (
                <rect x={x + 1.5} y={y(m.expenses + m.labor)} width={barW} height={y(m.expenses) - y(m.expenses + m.labor)} rx={Math.min(5, barW / 2)} fill={SERIES.labor.color} />
              )}
              <text x={x} y={height - 10} textAnchor="middle" fontSize="11" fontWeight={i === currentMonth ? 700 : 500} fill={i === currentMonth ? '#7d2c48' : '#6f5561'}>
                {width < 420 ? MONTHS_SHORT[i][0] : MONTHS_SHORT[i]}
              </text>
              <rect
                x={x - slot / 2}
                y={pad.top}
                width={slot}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onTouchStart={() => setHover(i)}
              />
            </g>
          );
        })}
        {hasData && (
          <>
            <polyline points={profitPoints} fill="none" stroke={SERIES.profit.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />
            {lineMonths.map((m, i) => (
              <circle key={i} cx={cx(i)} cy={y(m.profit)} r={hover === i ? 5 : 3.2} fill="#fff" stroke={m.profit < 0 ? '#a8323f' : SERIES.profit.color} strokeWidth="2" pointerEvents="none" />
            ))}
          </>
        )}
      </svg>

      {!hasData && (
        <p className="pointer-events-none absolute inset-x-0 top-[38%] text-center text-sm font-semibold text-muted">
          Fills in as you record expenses and payments.
        </p>
      )}

      {hover !== null && hasData && (
        <div
          className="pointer-events-none absolute top-2 z-10 w-48 animate-fade rounded-2xl border border-line bg-white/95 p-3 text-sm shadow-lift"
          style={{ left: Math.min(Math.max(cx(hover) - 96, 0), width - 192) }}
        >
          <p className="font-display font-semibold">
            {MONTHS_SHORT[hover]} {year}
          </p>
          <dl className="mt-1.5 space-y-0.5 tabular">
            {Object.entries(SERIES).map(([k, s]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </dt>
                <dd className={`font-semibold ${k === 'profit' && months[hover].profit < 0 ? 'text-danger' : ''}`}>{formatCents(months[hover][k])}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Wrapped because tables ignore the 1px width that sr-only sets. */}
      <div className="sr-only">
      <table>
        <caption>Monthly totals for {year}</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            {Object.values(SERIES).map((s) => (
              <th key={s.label} scope="col">{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {months.map((m, i) => (
            <tr key={i}>
              <th scope="row">{MONTHS_SHORT[i]}</th>
              {Object.keys(SERIES).map((k) => (
                <td key={k}>{formatCents(m[k])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export function ChartLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted">
      {Object.entries(SERIES).map(([k, s]) => (
        <li key={k} className="flex items-center gap-2">
          {k === 'profit' ? (
            <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
          ) : (
            <span className="h-2.5 w-2.5 rounded-[4px]" style={{ background: s.color }} />
          )}
          {s.label}
        </li>
      ))}
    </ul>
  );
}
