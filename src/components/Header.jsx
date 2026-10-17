import { useEffect, useState } from 'react';
import Logo from './Logo.jsx';
import Icon from './Icon.jsx';
import { NAV_LINKS, SITE } from '../config/site.js';

// linkBase is '' on the home page and '/' on other pages, so "#services" becomes "/#services".
export default function Header({ linkBase = '' }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled || open ? 'bg-cream/95 shadow-[0_8px_30px_-18px_rgba(36,59,50,0.5)] backdrop-blur' : 'bg-transparent'
      }`}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-forest focus:px-4 focus:py-2 focus:text-cream"
      >
        Skip to content
      </a>
      <div className="container-x flex h-[4.75rem] items-center justify-between gap-4">
        <a href={linkBase || '#top'} aria-label={`${SITE.legalName} home`} onClick={close}>
          <Logo />
        </a>

        <nav aria-label="Main" className="hidden xl:block">
          <ul className="flex items-center">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={linkBase + link.href}
                  className="whitespace-nowrap rounded-full px-3 py-2 text-[0.95rem] font-semibold text-forest/85 transition hover:bg-forest/5 hover:text-forest"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={SITE.phoneHref}
            className="hidden items-center gap-2 rounded-full px-3 py-2 font-semibold text-forest transition hover:bg-forest/5 md:inline-flex"
          >
            <Icon name="phone" className="h-5 w-5" />
            <span className="whitespace-nowrap">Call</span>
          </a>
          <a href={`${linkBase}#quote`} className="btn-gold hidden min-h-11 whitespace-nowrap px-5 py-2.5 text-base sm:inline-flex" onClick={close}>
            Get a Free Quote
          </a>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-forest transition hover:bg-forest/5 xl:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name={open ? 'x' : 'menu'} className="h-6 w-6" />
          </button>
        </div>
      </div>

      <div
        id="mobile-menu"
        className={`overflow-hidden border-t border-forest/10 transition-[max-height] duration-300 xl:hidden ${
          open ? 'max-h-[28rem]' : 'max-h-0 border-transparent'
        }`}
        hidden={!open}
      >
        <nav aria-label="Mobile" className="container-x py-4">
          <ul className="flex flex-col">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={linkBase + link.href}
                  onClick={close}
                  className="block rounded-xl px-3 py-3 text-lg font-semibold text-forest hover:bg-forest/5"
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li className="mt-2">
              <a href={SITE.phoneHref} className="btn-outline w-full">
                <Icon name="phone" className="h-5 w-5" />
                Call {SITE.phoneDisplay}
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
