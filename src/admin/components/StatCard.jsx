import AdminIcon from './AdminIcon.jsx';
import { formatCents } from '../lib/money.js';

// One headline number with its change from the previous period.
// `goodWhenUp` is false for costs, so a rise in expenses shows as a caution.
export default function StatCard({ label, cents, deltaPct, goodWhenUp = true, note, accent = 'bg-blush text-rose-deep', icon, delay = 0, emphasis = false }) {
  const up = deltaPct > 0;
  const good = deltaPct === null || deltaPct === 0 ? null : up === goodWhenUp;
  return (
    <article
      className={`card relative animate-rise overflow-hidden p-4 sm:p-6 ${emphasis ? 'bg-gradient-to-br from-white to-blush/70' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[0.8rem] leading-tight font-semibold text-muted sm:text-sm">{label}</h2>
        <span className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-full sm:flex ${accent}`}>
          <AdminIcon name={icon} className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className={`mt-2 font-display text-[1.35rem] leading-none sm:mt-3 sm:text-[1.9rem] font-semibold tracking-tight tabular ${cents < 0 ? 'text-danger' : ''}`}>
        {formatCents(cents)}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {deltaPct === null || deltaPct === undefined ? (
          <span className="text-muted">No earlier data</span>
        ) : (
          <>
            <span title="Compared with the same point in the previous period" className={`pill ${good === null ? 'bg-blush text-muted' : good ? 'bg-sage/25 text-sage-deep' : 'bg-danger/10 text-danger'}`}>
              {deltaPct !== 0 && <AdminIcon name={up ? 'arrowUp' : 'arrowDown'} className="h-3 w-3" strokeWidth={2.6} />}
              {Math.abs(deltaPct).toFixed(deltaPct !== 0 && Math.abs(deltaPct) < 10 ? 1 : 0)}%
            </span>
            <span className="hidden text-muted sm:inline">vs. same point last period</span>
          </>
        )}
      </div>
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </article>
  );
}
