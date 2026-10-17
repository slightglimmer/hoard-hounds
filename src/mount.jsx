import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import './index.css';

// Production pages are prerendered (scripts/prerender.js), so hydrate them; in dev, render from scratch.
export default function mount(Page) {
  const container = document.getElementById('root');
  const app = (
    <StrictMode>
      <Page />
    </StrictMode>
  );
  if (container.hasChildNodes()) hydrateRoot(container, app);
  else createRoot(container).render(app);
}
