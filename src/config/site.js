// Business details used across the site. Update these placeholders before launch.
// Search the project for "PLACEHOLDER" to find anything else that needs real info.

export const SITE = {
  name: 'Hoard Hounds',
  legalName: 'Hoard Hounds LLC',
  tagline: 'We Clear the Clutter. You Reclaim the Property.',
  industry: 'Property Cleanouts & Junk Removal',
  city: 'Redford',
  state: 'Michigan',
  stateCode: 'MI',
  region: 'Metro Detroit',

  phoneDisplay: '(734) 589-7627',
  phoneHref: 'tel:+17345897627',
  email: 'johnice.edward@gmail.com',
  // Optional, e.g. 'Mon–Sat, 8am–6pm'. Leave empty to hide hours on the site.
  hours: '',

  // PLACEHOLDER domain. Also update index.html, privacy.html, public/robots.txt and public/sitemap.xml.
  url: 'https://www.hoardhounds.com',
  year: 2026,
};

export const NAV_LINKS = [
  { href: '#services', label: 'Services' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#who-we-serve', label: 'Who We Serve' },
  { href: '#about', label: 'About' },
  { href: '#service-area', label: 'Service Area' },
];

export const SERVICES = [
  {
    id: 'vacant',
    icon: 'house',
    title: 'Vacant Property Cleanouts',
    description:
      'Leftover furniture, belongings and trash removed from empty homes so they are ready to list, show, rent or renovate.',
  },
  {
    id: 'estate',
    icon: 'box',
    title: 'Estate Cleanouts',
    description:
      'Patient, respectful help clearing a loved one’s home. Tell us what stays, and we remove the rest.',
  },
  {
    id: 'rental',
    icon: 'key',
    title: 'Rental Property Cleanouts',
    description:
      'Turnover help for landlords and property managers after a move-out or eviction, so the unit can get back on the market.',
  },
  {
    id: 'junk',
    icon: 'sofa',
    title: 'Furniture & Junk Removal',
    description:
      'Couches, mattresses, appliances, boxes and general household junk hauled away, from a single item to a full room.',
  },
  {
    id: 'investor',
    icon: 'tools',
    title: 'Investor Property Cleanouts',
    description:
      'Distressed and newly purchased properties cleared out ahead of rehab, so your crew can start on a clean slate.',
  },
  {
    id: 'garage',
    icon: 'door',
    title: 'Garage & Basement Cleanouts',
    description:
      'Years of stored items, old furniture and nonhazardous debris cleared from garages, basements, attics and sheds.',
  },
];

export const NOT_OFFERED = [
  'Structural demolition',
  'Hazardous waste',
  'Asbestos remediation',
  'Mold remediation',
  'Biohazard cleanup',
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
