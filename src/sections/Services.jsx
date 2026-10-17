import Icon from '../components/Icon.jsx';
import Reveal from '../components/Reveal.jsx';
import SectionHeading from '../components/SectionHeading.jsx';
import { NOT_OFFERED, SERVICES } from '../config/site.js';

export default function Services() {
  return (
    <section id="services" className="section bg-white" aria-labelledby="services-title">
      <div className="container-x">
        <SectionHeading
          id="services-title"
          eyebrow="Our Services"
          title="Cleanouts for every stage of a property’s life"
          intro="From Detroit property cleanouts and Redford junk removal to Metro Detroit estate cleanouts, we clear unwanted furniture, household belongings, trash and nonhazardous debris from residential properties."
        />

        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {SERVICES.map((service, i) => (
            <Reveal as="li" key={service.id} delay={(i % 3) * 90}>
              <article className="group flex h-full flex-col rounded-3xl border border-forest/10 bg-cream/60 p-7 transition duration-300 hover:-translate-y-1 hover:border-sage hover:bg-cream hover:shadow-[0_24px_50px_-30px_rgba(36,59,50,0.6)]">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-forest text-gold transition duration-300 group-hover:rotate-[-6deg] group-hover:scale-105">
                  <Icon name={service.icon} className="h-7 w-7" />
                </span>
                <h3 className="mt-6 text-xl font-bold">{service.title}</h3>
                <p className="mt-3 flex-1 leading-relaxed text-charcoal/80">{service.description}</p>
                <a
                  href="#quote"
                  className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-forest underline-offset-4 hover:underline"
                >
                  Request a quote
                  <span className="sr-only"> for {service.title.toLowerCase()}</span>
                  <Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-1" strokeWidth={2.2} />
                </a>
              </article>
            </Reveal>
          ))}
        </ul>

        <Reveal className="mt-10 flex flex-col gap-4 rounded-3xl border border-dashed border-forest/25 bg-cream/50 p-6 sm:flex-row sm:items-start sm:gap-5 sm:p-7">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sage-light text-forest">
            <Icon name="info" className="h-6 w-6" />
          </span>
          <div>
            <h3 className="font-sans text-base font-bold text-forest">What we don’t handle</h3>
            <p className="mt-1 text-charcoal/80">
              To keep every job safe and done right, Hoard Hounds does not provide:
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {NOT_OFFERED.map((item) => (
                <li key={item} className="rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-charcoal/85 ring-1 ring-forest/10">
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-charcoal/70">
              If your property needs one of these services, a licensed specialist should handle it first. We’re happy to
              help with the general cleanout afterward.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
