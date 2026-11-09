import Icon from '../components/Icon.jsx';
import Reveal from '../components/Reveal.jsx';
import SectionHeading from '../components/SectionHeading.jsx';

const STEPS = [
  {
    icon: 'camera',
    title: 'Request a Free Estimate',
    text: 'Tell us about the property and share a few photos.',
  },
  {
    icon: 'clipboard',
    title: 'Get Your Quote',
    text: 'We review the details, visit if needed, and send a written quote that spells out what’s included.',
  },
  {
    icon: 'clock',
    title: 'We Schedule It All',
    text: 'Once dumpster placement is confirmed with you, we book the dumpster delivery and your clean-out crew.',
  },
  {
    icon: 'users',
    title: 'We Sort, Remove & Load',
    text: 'Our crew sorts what stays from what goes, sets aside items to keep or donate, and loads the dumpster.',
  },
  {
    icon: 'sparkle',
    title: 'Pickup & Disposal',
    text: 'The dumpster company picks up the container and handles disposal. You get your space back.',
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="section relative overflow-hidden bg-forest" aria-labelledby="how-title">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, #F7F3EB 1px, transparent 0)',
        backgroundSize: '28px 28px',
      }} />
      <div className="container-x relative">
        <SectionHeading
          id="how-title"
          light
          eyebrow="How It Works"
          title="From first photo to a cleared property"
          intro="No guesswork and no surprises. You’ll know the scope, the price and what’s included before any work begins."
        />

        <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-5 lg:gap-5">
          {STEPS.map((step, i) => (
            <Reveal as="li" key={step.title} delay={i * 120} className="relative">
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute left-[calc(50%+2.75rem)] top-12 hidden h-0.5 w-[calc(100%-5.5rem+1.25rem)] border-t-2 border-dashed border-sage/40 lg:block"
                />
              )}
              <div className="flex h-full flex-col items-center rounded-3xl bg-white/[0.06] p-6 text-center ring-1 ring-white/10 lg:px-4">
                <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-cream text-forest">
                  <Icon name={step.icon} className="h-8 w-8" />
                  <span className="absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full bg-gold font-display text-sm font-extrabold text-charcoal">
                    {i + 1}
                  </span>
                </span>
                <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-sage">Step {i + 1}</p>
                <h3 className="mt-2 text-xl font-bold text-cream">{step.title}</h3>
                <p className="mt-3 leading-relaxed text-cream/85">{step.text}</p>
              </div>
            </Reveal>
          ))}
        </ol>

        <Reveal className="mx-auto mt-10 max-w-3xl rounded-2xl bg-white/[0.06] px-5 py-4 text-center text-cream/85 ring-1 ring-white/10">
          <p>
            <strong className="text-cream">Before anything is scheduled,</strong> we confirm with you where the dumpster can go
            and that the spot is suitable, including whether a city permit may be needed for street placement.
          </p>
        </Reveal>

        <Reveal className="mt-10 text-center">
          <a href="#quote" className="btn-gold px-8 text-lg">
            Start With Step 1
            <Icon name="arrow" className="h-5 w-5" strokeWidth={2.2} />
          </a>
        </Reveal>
      </div>
    </section>
  );
}
