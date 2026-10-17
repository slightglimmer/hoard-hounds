import Reveal from '../components/Reveal.jsx';
import SectionHeading from '../components/SectionHeading.jsx';
import { SITE } from '../config/site.js';

// Also published as FAQPage structured data (see src/entry-server.jsx).
export const FAQS = [
  {
    q: 'What kinds of items do you remove?',
    a: 'Unwanted furniture, household belongings, appliances, mattresses, boxes, trash and other nonhazardous debris from homes, garages, basements, attics and sheds.',
  },
  {
    q: 'Is there anything you can’t take?',
    a: 'Yes. We don’t handle structural demolition, hazardous waste removal, asbestos remediation, mold remediation or biohazard cleanup. If you’re unsure about a specific item, just ask in your quote request.',
  },
  {
    q: 'How do estimates work?',
    a: 'Estimates are free. Send us a description and photos through the quote form, and we’ll follow up with an estimate. For larger or more complex jobs, we may schedule a walkthrough first.',
  },
  {
    q: 'Do I need to be at the property during the cleanout?',
    a: 'Not always. If the home is vacant or you’re out of town, mention it in your request and we’ll talk through access arrangements when we confirm your estimate.',
  },
  {
    q: 'Which areas do you serve?',
    a: `We’re based in ${SITE.city} and offer Redford junk removal, Detroit property cleanouts and Metro Detroit estate cleanouts, including Livonia, Dearborn, Southfield, Farmington, Westland and surrounding communities.`,
  },
];

export default function FAQ() {
  return (
    <section id="faq" className="section" aria-labelledby="faq-title">
      <div className="container-x max-w-3xl">
        <SectionHeading id="faq-title" eyebrow="Questions" title="Frequently asked questions" />
        <div className="mt-12 space-y-3">
          {FAQS.map((item, i) => (
            <Reveal key={item.q} delay={i * 60}>
              <details className="group rounded-2xl bg-white ring-1 ring-forest/10 open:shadow-[0_20px_40px_-30px_rgba(36,59,50,0.6)]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-6 py-5 text-left text-lg font-bold text-forest [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sage-light text-xl leading-none transition group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="px-6 pb-6 leading-relaxed text-charcoal/80">{item.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
