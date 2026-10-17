import Reveal from './Reveal.jsx';

export default function SectionHeading({ eyebrow, title, intro, align = 'center', light = false, id }) {
  const centered = align === 'center';
  return (
    <Reveal className={`max-w-2xl ${centered ? 'mx-auto text-center' : ''}`}>
      {eyebrow && (
        <p className={`eyebrow ${light ? 'text-sage' : 'text-forest/80'} ${centered ? 'justify-center' : ''}`}>
          <span className="h-px w-6 bg-gold" aria-hidden="true" />
          {eyebrow}
        </p>
      )}
      <h2
        id={id}
        className={`mt-3 text-3xl font-bold leading-tight sm:text-4xl lg:text-[2.75rem] ${light ? 'text-cream' : ''}`}
      >
        {title}
      </h2>
      {intro && (
        <p className={`mt-4 text-lg leading-relaxed ${light ? 'text-cream/85' : 'text-charcoal/80'}`}>{intro}</p>
      )}
    </Reveal>
  );
}
