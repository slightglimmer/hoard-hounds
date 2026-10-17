import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import App from './App.jsx';
import PrivacyPage from './PrivacyPage.jsx';
import { FAQS } from './sections/FAQ.jsx';
import { SERVICE_AREAS, SERVICES, SITE } from './config/site.js';

const pages = { home: App, privacy: PrivacyPage };

export function render(page) {
  const Page = pages[page];
  return renderToString(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}

// Schema.org data for search engines. Only facts stated on the site belong here:
// no ratings, reviews, founding dates or credentials.
export function structuredData() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      '@id': `${SITE.url}/#business`,
      name: SITE.legalName,
      alternateName: SITE.name,
      slogan: SITE.tagline,
      description:
        'Locally owned property cleanout and junk removal company in Redford, Michigan, serving homeowners, real estate agents, investors, landlords, property managers and estate representatives throughout Metro Detroit.',
      url: SITE.url,
      logo: `${SITE.url}/brand/hoard-hounds-mark.svg`,
      image: `${SITE.url}/og-image.png`,
      telephone: SITE.phoneHref.replace('tel:', ''),
      email: SITE.email,
      address: {
        '@type': 'PostalAddress',
        addressLocality: SITE.city,
        addressRegion: SITE.stateCode,
        addressCountry: 'US',
      },
      areaServed: SERVICE_AREAS.map((city) => ({ '@type': 'City', name: `${city}, ${SITE.stateCode}` })),
      makesOffer: SERVICES.map((s) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: s.title, description: s.description },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ];
}
