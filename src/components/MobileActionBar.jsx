import Icon from './Icon.jsx';
import { SITE } from '../config/site.js';

// Always-visible call and quote buttons on phones.
export default function MobileActionBar({ linkBase = '' }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-forest/10 bg-cream/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
      <div className="grid grid-cols-2 gap-3">
        <a href={SITE.phoneHref} className="btn-forest min-h-12 px-3 text-base">
          <Icon name="phone" className="h-5 w-5" />
          Call Now
        </a>
        <a href={`${linkBase}#quote`} className="btn-gold min-h-12 px-3 text-base">
          Free Quote
        </a>
      </div>
    </div>
  );
}
