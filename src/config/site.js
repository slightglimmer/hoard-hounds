// Business details used across the site. Update these placeholders before launch.
// Search the project for "PLACEHOLDER" to find anything else that needs real info.

export const SITE = {
  name: 'Hoard Hounds',
  legalName: 'Hoard Hounds LLC',
  tagline: 'We Clear the Clutter. You Reclaim the Property.',
  industry: 'Property Clean-Outs & Organizing',
  city: 'Redford',
  state: 'Michigan',
  stateCode: 'MI',
  region: 'Metro Detroit',

  phoneDisplay: '(734) 589-7627',
  phoneHref: 'tel:+17345897627',
  email: 'johnice.edward@gmail.com',
  // Optional, e.g. 'Mon–Sat, 8am–6pm'. Leave empty to hide hours on the site.
  hours: '',

  // If the domain changes, also update index.html, privacy.html, public/robots.txt, public/sitemap.xml and public/CNAME.
  url: 'https://hoardhounds.com',
  year: 2026,
};

export const NAV_LINKS = [
  { href: '#services', label: 'Services' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#who-we-serve', label: 'Who We Serve' },
  { href: '#about', label: 'About' },
  { href: '#service-area', label: 'Service Area' },
  { href: '#faq', label: 'FAQ' },
];

export const SERVICES = [
  {
    id: 'estate',
    icon: 'house',
    title: 'Whole-Property & Estate Clean-Outs',
    description:
      'Patient, respectful help clearing a loved one’s home or an entire property. Tell us what stays, and we sort, remove and load the rest.',
  },
  {
    id: 'hoarding',
    icon: 'heart',
    title: 'Hoarding Clean-Outs',
    description:
      'Discreet, judgment-free help for homes where belongings have built up over time. We work at a respectful pace, set aside what matters and clear the rest.',
  },
  {
    id: 'presale',
    icon: 'sign',
    title: 'Pre-Sale & Real Estate Clean-Outs',
    description:
      'Properties cleared so they’re ready to list, show, sell or close. We plan the work around your timeline and keep you or your agent updated.',
  },
  {
    id: 'vacant',
    icon: 'key',
    title: 'Vacant & Abandoned Property Clean-Outs',
    description:
      'Leftover furniture, belongings and nonhazardous debris cleared from empty or abandoned homes so they’re ready to rent, renovate or sell.',
  },
  {
    id: 'tenant',
    icon: 'building',
    title: 'Tenant Move-Out Clean-Outs',
    description:
      'Turnover help for landlords and property managers after a move-out or eviction, so the unit can get back on the market.',
  },
  {
    id: 'garage',
    icon: 'door',
    title: 'Garage, Basement & Attic Clean-Outs',
    description:
      'Years of stored items and nonhazardous clutter sorted and cleared from large garages, basements, attics and sheds.',
  },
];

// Part of every clean-out (shown under the service cards).
export const INCLUDED = [
  { icon: 'clipboard', title: 'Sorting & organizing', text: 'We separate what stays, what goes and what you’d like to donate.' },
  { icon: 'users', title: 'All the labor', text: 'Our crew does the carrying, bagging and loading.' },
  { icon: 'box', title: 'Dumpster coordination', text: 'We arrange delivery and pickup with a local dumpster rental company.' },
  { icon: 'check', title: 'Disposal handled', text: 'The dumpster company hauls the container away and handles disposal.' },
];

export const NOT_OFFERED = [
  'Single-item pickups',
  'Deep cleaning',
  'Hazardous waste',
  'Mold remediation',
  'Asbestos remediation',
  'Biohazard cleanup',
  'Structural demolition',
];

export const SERVICE_AREAS = [
  'Redford',
  'Detroit',
  'Livonia',
  'Dearborn',
  'Southfield',
  'Farmington',
  'Westland',
];
