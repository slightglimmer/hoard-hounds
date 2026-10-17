import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import MobileActionBar from './components/MobileActionBar.jsx';
import { SITE } from './config/site.js';

// PLACEHOLDER policy written in plain language. Have it reviewed before launch,
// and update it if you add analytics, ads, or a different form provider.
const SECTIONS = [
  {
    title: 'Information we collect',
    body: [
      'When you request a quote, we collect the details you choose to give us: your name, email address, phone number, property address, the type of cleanout, a description of the project, a preferred service date, and any photos you upload.',
      'Like most websites, our hosting provider may automatically record basic technical information such as your IP address, browser type and the pages you visit, for security and to keep the site running.',
    ],
  },
  {
    title: 'How we use it',
    body: [
      'We use your information to review your project, prepare an estimate, schedule a walkthrough or cleanout, and contact you by phone, text or email about your request.',
      'We do not sell or rent your personal information, and we do not use it for unrelated marketing without your permission.',
    ],
  },
  {
    title: 'Photos you upload',
    body: [
      'Property photos are used only to understand the scope of the job and prepare your estimate. They are stored by our form service provider in a password-protected account and are not published or shared publicly.',
    ],
  },
  {
    title: 'Service providers',
    body: [
      'We use trusted third-party services to host this website and receive form submissions. These providers process information on our behalf and are not permitted to use it for their own purposes.',
    ],
  },
  {
    title: 'How long we keep it',
    body: [
      'We keep quote requests and photos only as long as needed to provide our services and keep reasonable business records. You can ask us to delete your information at any time.',
    ],
  },
  {
    title: 'Your choices',
    body: [
      `You can ask to see, correct or delete the information you have sent us, or ask us to stop contacting you, by emailing ${SITE.email} or calling ${SITE.phoneDisplay}.`,
    ],
  },
  {
    title: 'Children',
    body: ['This website is intended for adults and is not directed to children under 13.'],
  },
  {
    title: 'Changes to this policy',
    body: ['We may update this policy from time to time. The date at the top of this page shows when it last changed.'],
  },
];

export default function PrivacyPage() {
  return (
    <>
      <Header linkBase="/" />
      <main id="main" className="pt-32 pb-24">
        <article className="container-x max-w-3xl">
          <p className="eyebrow text-forest/80">
            <span className="h-px w-6 bg-gold" aria-hidden="true" />
            {SITE.legalName}
          </p>
          <h1 className="mt-3 text-4xl font-extrabold sm:text-5xl">Privacy Policy</h1>
          <p className="mt-4 text-charcoal/70">Last updated: October 2026</p>
          <p className="mt-8 text-lg leading-relaxed text-charcoal/85">
            {SITE.legalName} (“Hoard Hounds,” “we,” “us”) respects your privacy. This policy explains what information we
            collect through this website, how we use it, and the choices you have.
          </p>
          <div className="mt-10 space-y-10">
            {SECTIONS.map((s) => (
              <section key={s.title}>
                <h2 className="text-2xl font-bold">{s.title}</h2>
                {s.body.map((p) => (
                  <p key={p.slice(0, 24)} className="mt-3 leading-relaxed text-charcoal/85">{p}</p>
                ))}
              </section>
            ))}
            <section>
              <h2 className="text-2xl font-bold">Contact us</h2>
              <p className="mt-3 leading-relaxed text-charcoal/85">
                {SITE.legalName}
                <br />
                {SITE.city}, {SITE.state}
                <br />
                <a href={`mailto:${SITE.email}`} className="font-semibold text-forest underline underline-offset-2">{SITE.email}</a>
                <br />
                <a href={SITE.phoneHref} className="font-semibold text-forest underline underline-offset-2">{SITE.phoneDisplay}</a>
              </p>
            </section>
          </div>
          <a href="/" className="btn-forest mt-12">Back to home</a>
        </article>
      </main>
      <Footer linkBase="/" />
      <MobileActionBar linkBase="/" />
    </>
  );
}
