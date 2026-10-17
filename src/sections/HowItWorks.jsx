import Icon from '../components/Icon.jsx';
import Reveal from '../components/Reveal.jsx';
import SectionHeading from '../components/SectionHeading.jsx';

const STEPS = [
  {
    icon: 'camera',
    title: 'Request a Quote',
    text: 'Tell us about your property and upload photos.',
  },
  {
    icon: 'clipboard',
    title: 'Get an Estimate',
    text: 'We’ll review your project and arrange a walkthrough when necessary.',
  },
  {
    icon: 'sparkle',
    title: 'Reclaim Your Space',
    text: 'Once your cleanout is scheduled, we’ll remove the agreed-upon items and leave the space cleared.',
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
          title="Three simple steps to a cleared property"
          intro="No guesswork and no surprises. You’ll know what we’re removing before we arrive."
        />

        <ol className="mt-14 grid gap-6 md:grid-cols-3 md:gap-8">
          {STEPS.map((step, i) => (
            <Reveal as="li" key={step.title} delay={i * 120} className="relative">
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute left-[calc(50%+3.5rem)] top-10 hidden h-0.5 w-[calc(100%-7rem+2rem)] border-t-2 border-dashed border-sage/40 md:block"
                />
              )}
              <div className="flex h-full flex-col items-center rounded-3xl bg-white/[0.06] p-8 text-center ring-1 ring-white/10">
                <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-cream text-forest">
                  <Icon name={step.icon} className="h-9 w-9" />
                  <span className="absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full bg-gold font-display text-sm font-extrabold text-charcoal">
                    {i + 1}
                  </span>
                </span>
                <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-sage">Step {i + 1}</p>
                <h3 className="mt-2 text-2xl font-bold text-cream">{step.title}</h3>
                <p className="mt-3 leading-relaxed text-cream/85">{step.text}</p>
              </div>
            </Reveal>
          ))}
        </ol>

        <Reveal className="mt-12 text-center">
          <a href="#quote" className="btn-gold px-8 text-lg">
            Start With Step 1
            <Icon name="arrow" className="h-5 w-5" strokeWidth={2.2} />
          </a>
        </Reveal>
      </div>
    </section>
  );
}
