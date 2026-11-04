import AdminIcon from '../components/AdminIcon.jsx';
import { PageHeader } from '../components/ui.jsx';

const PLANNED = {
  '/jobs': {
    title: 'Jobs',
    icon: 'truck',
    phase: 'Phase 4',
    points: ['Customers and job status from lead to completed', 'Deposits and payments received', 'Disposal, truck rental and labor costs, and profit per job'],
  },
  '/employees': {
    title: 'Employees',
    icon: 'users',
    phase: 'Phase 5',
    points: ['Employee profiles and hourly rates', 'Job assignments and logged hours', 'Estimated gross wages (no payroll processing)'],
  },
  '/reports': {
    title: 'Reports',
    icon: 'chart',
    phase: 'Phase 6',
    points: ['Monthly revenue, expense and profit charts', 'Year-over-year comparisons', 'A tax-year export pack for your bookkeeper'],
  },
};

export default function ComingSoon({ route }) {
  const page = PLANNED[route];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Coming in ${page.phase}`} title={page.title} />
      <section className="card relative animate-rise overflow-hidden p-8 sm:p-10">
        <div aria-hidden="true" className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-petal/50 blur-2xl" />
        <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-deep text-white shadow-soft">
          <AdminIcon name={page.icon} className="h-7 w-7" />
        </span>
        <h2 className="relative mt-5 font-display text-2xl font-semibold">What this page will do</h2>
        <ul className="relative mt-4 space-y-2.5">
          {page.points.map((p) => (
            <li key={p} className="flex gap-3">
              <AdminIcon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-sage-deep" strokeWidth={2.4} />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <p className="relative mt-6 text-sm text-muted">The database tables for this are already in place, protected by the same security rules.</p>
      </section>
    </div>
  );
}

export const COMING_SOON_ROUTES = Object.keys(PLANNED);
