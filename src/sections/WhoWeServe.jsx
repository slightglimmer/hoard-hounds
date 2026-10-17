import Icon from '../components/Icon.jsx';
import Reveal from '../components/Reveal.jsx';
import SectionHeading from '../components/SectionHeading.jsx';

const AUDIENCES = [
  {
    icon: 'sign',
    title: 'Real Estate Agents',
    text: 'Get listings photo-ready and show-ready. We coordinate with you so the property is cleared before it hits the market.',
  },
  {
    icon: 'chart',
    title: 'Property Investors',
    text: 'Clear out new acquisitions and distressed properties so your rehab can start without a pile of leftovers in the way.',
  },
  {
    icon: 'key',
    title: 'Landlords',
    text: 'Turn units around after a move-out by removing what was left behind, so you can get back to finding the next tenant.',
  },
  {
    icon: 'building',
    title: 'Property Managers',
    text: 'A dependable cleanout partner for the homes and units you oversee, with clear estimates you can share with owners.',
  },
  {
    icon: 'scroll',
    title: 'Estate Representatives',
    text: 'Compassionate, respectful help clearing a home while you handle everything else that comes with settling an estate.',
  },
  {
    icon: 'heart',
    title: 'Homeowners',
    text: 'Downsizing, moving or finally tackling the basement? We haul away what you no longer need.',
  },
];

export default function WhoWeServe() {
  return (
    <section id="who-we-serve" className="section" aria-labelledby="serve-title">
      <div className="container-x">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.4fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading
              id="serve-title"
              align="left"
              eyebrow="Who We Serve"
              title="Getting properties ready for their next chapter"
              intro="Whether a home is about to be listed, renovated, rented or passed on to family, a cleared property is the first step. We understand how much timing and first impressions matter to real estate professionals and property owners alike."
            />
            <Reveal delay={120} className="mt-8 rounded-3xl bg-forest p-7 text-cream">
              <p className="font-display text-xl font-semibold leading-snug">
                Work with properties regularly?
              </p>
              <p className="mt-2 text-cream/85">
                Tell us about your upcoming projects. We’d love to be the cleanout team you call each time.
              </p>
              <a href="#quote" className="btn-gold mt-5 min-h-11 py-2.5 text-sm">
                Introduce Yourself
              </a>
            </Reveal>
          </div>

          <ul className="grid gap-5 sm:grid-cols-2">
            {AUDIENCES.map((a, i) => (
              <Reveal as="li" key={a.title} delay={(i % 2) * 90}>
                <div className="flex h-full gap-4 rounded-3xl bg-white p-6 ring-1 ring-forest/10 transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-28px_rgba(36,59,50,0.6)]">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sage-light text-forest">
                    <Icon name={a.icon} className="h-6 w-6" />
                  </span>
                  <div>
                    <h3 className="font-sans text-lg font-bold">{a.title}</h3>
                    <p className="mt-1.5 leading-relaxed text-charcoal/80">{a.text}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
