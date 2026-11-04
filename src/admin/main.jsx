import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AdminApp from './AdminApp.jsx';
import { MODE } from './lib/supabase.js';
import './admin.css';

// Don't let another site load the live admin inside a frame (clickjacking).
// GitHub Pages can't send the usual X-Frame-Options header, so check here.
if (MODE === 'live' && window.top !== window.self) {
  document.body.textContent = 'For your security, the Hoard Hounds admin can’t be opened inside another page.';
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <AdminApp />
    </StrictMode>,
  );
}
