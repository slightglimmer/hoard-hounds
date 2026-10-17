import Icon from '../components/Icon.jsx';
import Reveal from '../components/Reveal.jsx';
import SectionHeading from '../components/SectionHeading.jsx';
import { SERVICE_AREAS } from '../config/site.js';

// Approximate relative positions for a simple, stylized area map (not to scale).
const MAP_POINTS = {
  Redford: { x: 250, y: 160, home: true },
  Detroit: { x: 400, y: 215 },
  Livonia: { x: 105, y: 170 },
  Dearborn: { x: 300, y: 265 },
  Southfield: { x: 310, y: 85 },
  Farmington: { x: 155, y: 75 },
  Westland: { x: 135, y: 260 },
};

function AreaMap() {
  return (
    <svg viewBox="0 0 520 340" className="h-auto w-full" role="img" aria-labelledby="area-map-title">
      <title id="area-map-title">Stylized map of Hoard Hounds’ service area around Redford, Michigan</title>
      <rect width="520" height="340" rx="28" fill="#2c4a3e" />
      {/* Soft grid of "streets" */}
      <g stroke="#A7B8A2" strokeOpacity="0.12" strokeWidth="2">
        {[60, 120, 180, 240, 300].map((y) => <line key={`h${y}`} x1="0" x2="520" y1={y} y2={y} />)}
        {[80, 160, 240, 320, 400, 480].map((x) => <line key={`v${x}`} y1="0" y2="340" x1={x} x2={x} />)}
      </g>
      {/* Detroit River hint */}
      <path d="M520 190 C 480 230, 470 280, 430 340" fill="none" stroke="#A7B8A2" strokeOpacity="0.35" strokeWidth="14" strokeLinecap="round" />
      {/* Coverage glow */}
      <circle cx="260" cy="170" r="190" fill="#D9A441" fillOpacity="0.06" />
      <circle cx="260" cy="170" r="120" fill="#D9A441" fillOpacity="0.08" stroke="#D9A441" strokeOpacity="0.35" strokeDasharray="6 8" />
      {Object.entries(MAP_POINTS).map(([name, p]) => (
        <g key={name}>
          {p.home ? (
            <>
              <circle cx={p.x} cy={p.y} r="22" fill="#D9A441" fillOpacity="0.25" />
              <circle cx={p.x} cy={p.y} r="11" fill="#D9A441" stroke="#F7F3EB" strokeWidth="3" />
            </>
          ) : (
            <circle cx={p.x} cy={p.y} r="7" fill="#F7F3EB" />
          )}
          <text
            x={p.x}
            y={p.home ? p.y - 30 : p.y + 26}
            textAnchor="middle"
            fill="#F7F3EB"
            fontFamily="Plus Jakarta Sans, system-ui, sans-serif"
            fontSize={p.home ? 17 : 14}
            fontWeight={p.home ? 800 : 600}
          >
            {name}
            {p.home ? ' (home base)' : ''}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function ServiceArea() {
  return (
    <section id="service-area" className="section bg-white" aria-labelledby="area-title">
      <div className="container-x grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHeading
            id="area-title"
            align="left"
            eyebrow="Service Area"
            title="Proudly Serving Metro Detroit"
            intro="Based in Redford, we provide property cleanouts and junk removal across Wayne and Oakland County communities, including:"
          />
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SERVICE_AREAS.map((city, i) => (
              <Reveal as="li" key={city} delay={i * 50}>
                <span className="flex items-center gap-2 rounded-2xl bg-cream px-4 py-3 font-semibold text-forest">
                  <Icon name="pin" className="h-5 w-5 shrink-0 text-gold" strokeWidth={2.2} />
                  {city}
                </span>
              </Reveal>
            ))}
            <Reveal as="li" delay={SERVICE_AREAS.length * 50} className="col-span-2 sm:col-span-3">
              <span className="flex items-center gap-2 rounded-2xl border border-dashed border-forest/25 px-4 py-3 font-semibold text-forest">
                <Icon name="pin" className="h-5 w-5 shrink-0 text-sage" strokeWidth={2.2} />
                And surrounding communities
              </span>
            </Reveal>
          </ul>
          <Reveal className="mt-6">
            <p className="text-charcoal/75">
              Not sure if we cover your area?{' '}
              <a href="#quote" className="font-bold text-forest underline underline-offset-4">Send us your address</a> and
              we’ll let you know.
            </p>
          </Reveal>
        </div>
        <Reveal delay={120} className="overflow-hidden rounded-[2rem] shadow-[0_30px_60px_-35px_rgba(36,59,50,0.7)]">
          <AreaMap />
        </Reveal>
      </div>
    </section>
  );
}
