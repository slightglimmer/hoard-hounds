import Icon from '../components/Icon.jsx';
import Reveal from '../components/Reveal.jsx';
import { SITE } from '../config/site.js';

const HIGHLIGHTS = ['Free estimates', 'Photo-based quotes', 'Locally owned in Redford'];

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-28 pb-16 sm:pt-32 lg:pt-36 lg:pb-24" aria-labelledby="hero-title">
      {/* Soft background shapes */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-sage/35 blur-3xl" />
        <div className="absolute -left-32 top-1/2 h-80 w-80 rounded-full bg-gold/15 blur-3xl" />
      </div>

      <div className="container-x grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        <div>
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-forest/15 bg-white/70 px-4 py-1.5 text-sm font-semibold text-forest">
              <Icon name="pin" className="h-4 w-4 text-gold" strokeWidth={2.2} />
              Serving {SITE.region} from {SITE.city}, MI
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1
              id="hero-title"
              className="mt-6 text-[2.6rem] font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-[3.6rem] xl:text-[3.9rem]"
            >
              Cluttered Property? <span className="relative whitespace-nowrap text-forest">
                We’ve Got
                <svg aria-hidden="true" viewBox="0 0 300 14" className="absolute -bottom-2 left-0 h-3 w-full text-gold" preserveAspectRatio="none">
                  <path d="M3 10 C 80 2, 200 2, 297 8" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
                </svg>
              </span>{' '}
              You Covered.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-charcoal/80 sm:text-xl">
              Professional property cleanouts and junk removal throughout Metro Detroit. Helping homeowners, investors,
              and real estate professionals reclaim their spaces.
            </p>
          </Reveal>
          <Reveal delay={240} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="#quote" className="btn-gold px-7 text-lg">
              Get a Free Quote
              <Icon name="arrow" className="h-5 w-5" strokeWidth={2.2} />
            </a>
            <a href="#services" className="btn-outline px-7 text-lg">
              Explore Our Services
            </a>
          </Reveal>
          <Reveal delay={320}>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-forest/85">
              {HIGHLIGHTS.map((item) => (
                <li key={item} className="inline-flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-forest text-cream">
                    <Icon name="check" className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={200} className="relative">
          <div className="relative overflow-hidden rounded-[2rem] border-8 border-white bg-sage-light shadow-[0_30px_60px_-30px_rgba(36,59,50,0.55)]">
            {/* Placeholder image: replace public/images/hero-cleared-room.svg with a real photo (see README). */}
            <img
              src="/images/hero-cleared-room.svg"
              alt="A bright, empty living room with a few packed boxes, ready for a new chapter"
              width="800"
              height="640"
              fetchPriority="high"
              className="aspect-[5/4] h-full w-full object-cover"
            />
          </div>
          <div className="animate-float absolute -bottom-6 left-4 flex max-w-[16rem] items-center gap-3 rounded-2xl bg-white p-4 shadow-xl sm:-left-6">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-forest">
              <Icon name="camera" className="h-6 w-6" />
            </span>
            <p className="text-sm leading-snug text-charcoal/80">
              <strong className="block text-forest">Send a few photos</strong>
              and we’ll get back to you with an estimate.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
