import Icon from '../components/Icon.jsx';
import Reveal from '../components/Reveal.jsx';
import { LogoMark } from '../components/Logo.jsx';

const VALUES = [
  { icon: 'users', title: 'Friendly communication', text: 'Clear answers and updates from the first call to the final walkthrough.' },
  { icon: 'clipboard', title: 'Transparent estimates', text: 'You’ll know what’s being removed and what it costs before work begins.' },
  { icon: 'check', title: 'Dependable service', text: 'We show up when we say we will and leave the space cleared as agreed.' },
];

export default function About() {
  return (
    <section id="about" className="section bg-white" aria-labelledby="about-title">
      <div className="container-x grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <Reveal className="relative order-last lg:order-first">
          <div className="overflow-hidden rounded-[2rem] bg-sage-light shadow-[0_30px_60px_-35px_rgba(36,59,50,0.6)]">
            {/* Placeholder image: replace public/images/about-home.svg with a real photo (see README). */}
            <img
              src="/images/about-home.svg"
              alt="Illustration of a Metro Detroit brick bungalow on a quiet street"
              width="800"
              height="680"
              loading="lazy"
              className="aspect-[20/17] w-full object-cover"
            />
          </div>
          <div className="absolute right-3 -top-5 flex items-center gap-3 rounded-2xl bg-cream p-3 pr-5 shadow-lg ring-1 ring-forest/10 sm:-right-6">
            <LogoMark className="h-12 w-12" />
            <p className="text-sm font-bold leading-tight text-forest">
              Locally owned
              <span className="block font-semibold text-charcoal/70">Redford, Michigan</span>
            </p>
          </div>
        </Reveal>

        <div>
          <Reveal>
            <p className="eyebrow text-forest/80">
              <span className="h-px w-6 bg-gold" aria-hidden="true" />
              About Us
            </p>
            <h2 id="about-title" className="mt-3 text-3xl font-bold leading-tight sm:text-4xl lg:text-[2.75rem]">
              Every property deserves a fresh start
            </h2>
          </Reveal>
          <Reveal delay={100} className="mt-6 space-y-4 text-lg leading-relaxed text-charcoal/85">
            <p>Hoard Hounds LLC is a locally owned property cleanout business based in Redford, Michigan.</p>
            <p>
              We believe that every property deserves a fresh start. Whether you’re preparing a home for sale, clearing
              out an investment property, or managing an estate, our goal is to make the cleanout process
              straightforward and stress-free.
            </p>
            <p>
              We’re proud to serve Metro Detroit with friendly communication, transparent estimates, and dependable
              service.
            </p>
          </Reveal>
          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {VALUES.map((v, i) => (
              <Reveal as="li" key={v.title} delay={150 + i * 80} className="rounded-2xl bg-cream p-5">
                <Icon name={v.icon} className="h-6 w-6 text-forest" strokeWidth={2} />
                <h3 className="mt-3 font-sans text-base font-bold">{v.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-charcoal/75">{v.text}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
