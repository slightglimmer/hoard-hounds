import Icon from './Icon.jsx';
import Logo from './Logo.jsx';
import { NAV_LINKS, SERVICES, SITE } from '../config/site.js';

export default function Footer({ linkBase = '' }) {
  return (
    <footer className="bg-forest-dark pb-28 pt-16 text-cream/85 md:pb-10">
      <div className="container-x">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <Logo variant="light" />
            <p className="mt-5 max-w-xs leading-relaxed">
              <strong className="text-cream">{SITE.legalName}</strong>
              <br />
              {SITE.industry}
              <br />
              {SITE.city}, {SITE.state}
            </p>
            <p className="mt-4 font-display text-lg italic text-sage">“{SITE.tagline}”</p>
          </div>

          <nav aria-label="Footer">
            <h2 className="font-sans text-sm font-bold uppercase tracking-[0.18em] text-gold">Explore</h2>
            <ul className="mt-4 space-y-2.5">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <a href={linkBase + l.href} className="hover:text-cream hover:underline underline-offset-4">{l.label}</a>
                </li>
              ))}
              <li>
                <a href={`${linkBase}#quote`} className="hover:text-cream hover:underline underline-offset-4">Free Quote</a>
              </li>
            </ul>
          </nav>

          <div>
            <h2 className="font-sans text-sm font-bold uppercase tracking-[0.18em] text-gold">Services</h2>
            <ul className="mt-4 space-y-2.5">
              {SERVICES.map((s) => (
                <li key={s.id}>
                  <a href={`${linkBase}#services`} className="hover:text-cream hover:underline underline-offset-4">{s.title}</a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-sans text-sm font-bold uppercase tracking-[0.18em] text-gold">Contact</h2>
            <ul className="mt-4 space-y-3">
              <li>
                <a href={SITE.phoneHref} className="inline-flex items-center gap-2.5 hover:text-cream">
                  <Icon name="phone" className="h-5 w-5 text-sage" />
                  {SITE.phoneDisplay}
                </a>
              </li>
              <li>
                <a href={`mailto:${SITE.email}`} className="inline-flex items-center gap-2.5 break-all hover:text-cream">
                  <Icon name="mail" className="h-5 w-5 shrink-0 text-sage" />
                  {SITE.email}
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <Icon name="pin" className="mt-0.5 h-5 w-5 shrink-0 text-sage" />
                {SITE.city}, {SITE.stateCode} · Serving {SITE.region}
              </li>
              {SITE.hours && (
                <li className="flex items-center gap-2.5">
                  <Icon name="clock" className="h-5 w-5 shrink-0 text-sage" />
                  {SITE.hours}
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 text-sm text-cream/70 sm:flex-row sm:items-center sm:justify-between">
          <p>© {SITE.year} {SITE.legalName}. All rights reserved.</p>
          <a href="/privacy.html" className="hover:text-cream hover:underline underline-offset-4">Privacy Policy</a>
        </div>
      </div>
    </footer>
  );
}
