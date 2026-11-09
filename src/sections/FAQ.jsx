import Reveal from '../components/Reveal.jsx';
import SectionHeading from '../components/SectionHeading.jsx';
import { SITE } from '../config/site.js';

// Also published as FAQPage structured data (see src/entry-server.jsx).
export const FAQS = [
  {
    q: 'What kinds of clean-outs do you handle?',
    a: 'Whole-property and estate clean-outs, hoarding clean-outs, pre-sale and real estate clean-outs, vacant and abandoned properties, tenant move-outs, and large garage, basement and attic clean-outs. We focus on larger jobs that call for a crew and a dumpster, so we don’t offer single-item pickups.',
  },
  {
    q: 'How does the dumpster work?',
    a: 'For most jobs, we arrange for a local dumpster rental company to deliver a roll-off dumpster to the property. Our crew sorts the items and loads the dumpster, and the dumpster company picks it up and handles disposal. We don’t own trucks or dumpsters ourselves; we coordinate the rental for you, and the dumpster is part of your quote.',
  },
  {
    q: 'Where will the dumpster go, and do I need a permit?',
    a: 'Usually in a driveway or another spot on the property that you approve. Before scheduling, we confirm a suitable location and that you (or the property owner) give permission for it. If the dumpster has to go on the street, the city may require a permit. Rules differ from city to city, so we’ll check what applies to your property and tell you about any permit requirement or cost before we book.',
  },
  {
    q: 'Can a dumpster damage my driveway?',
    a: 'Dumpsters are heavy, and any surface can be marked or damaged, especially one that’s older, cracked or soft. We’ll talk through placement with you before scheduling, and the dumpster provider may use boards or other protection. You decide whether the location works for you.',
  },
  {
    q: 'How long will the dumpster stay?',
    a: 'Your quote lists the rental days included. We plan the work so the dumpster arrives shortly before the crew and is picked up soon after. If the job needs more days, the dumpster company may charge an extra-day fee; we’ll check with you before that happens.',
  },
  {
    q: 'Is there a weight limit? What if it goes over?',
    a: 'Each dumpster rental comes with a weight allowance set by the dumpster company, and your quote shows the allowance included in your price. If the dumpster company charges for going over that weight, for extra days, or for items it doesn’t accept, we’ll show you their documentation, such as the weight ticket, and get your approval before billing you for those charges.',
  },
  {
    q: 'What can’t go in the dumpster?',
    a: 'Dumpster companies restrict certain items. Common examples are paint, chemicals, tires, batteries, propane tanks, and some appliances and electronics. The exact list depends on the dumpster company, so please mention anything like this in your request and we’ll tell you how it can be handled.',
  },
  {
    q: 'Can I keep or donate some items?',
    a: 'Yes. Tell us what you’d like to keep before the clean-out, and we’ll set those items aside as we sort. We can also set aside items for you to donate. Please remove or clearly mark valuables, important papers, medications and anything irreplaceable before we start, since it’s up to you to identify what should be kept.',
  },
  {
    q: 'What happens during a hoarding clean-out?',
    a: 'We start with a conversation about your goals, your timeline and anything that matters to you. On the day, our crew works area by area, sorting items into keep, donate and discard, and checks with you on anything we’re unsure about. We’re respectful, discreet and never judgmental. We don’t handle biohazards, animal waste, mold or hazardous materials; if any are present, a licensed specialist needs to address them first.',
  },
  {
    q: 'How do estimates and deposits work?',
    a: 'Estimates are free. Send us a description and photos through the form, and we’ll follow up with a written quote. For larger or more complex jobs, we may schedule a walkthrough first. To book, we may ask for a deposit, usually enough to cover the dumpster rental. Your deposit is credited toward your final balance, not added to it.',
  },
  {
    q: 'Do I need to be at the property during the clean-out?',
    a: 'Not always. If the home is vacant or you’re out of town, mention it in your request and we’ll talk through access and permission when we confirm your quote.',
  },
  {
    q: 'Which areas do you serve?',
    a: `We’re based in ${SITE.city} and serve Detroit and the surrounding Metro Detroit communities, including Livonia, Dearborn, Southfield, Farmington and Westland. Not sure if we cover your area? Send us your address and we’ll let you know.`,
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
