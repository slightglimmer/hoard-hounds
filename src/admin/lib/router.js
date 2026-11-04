import { useEffect, useState } from 'react';

// Pages live in the hash (/admin/#/expenses) so they work on GitHub Pages,
// which can't send every /admin/... path to the same file.
// Only "#/something" is a page; other hashes (like the skip link's #main) are ignored.
const read = () => {
  const hash = window.location.hash.replace(/^#/, '');
  return hash.startsWith('/') ? hash : null;
};

export function useHashRoute() {
  const [route, setRoute] = useState(() => read() || '/overview');
  useEffect(() => {
    const onChange = () => {
      const next = read();
      if (!next) return;
      setRoute(next);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
