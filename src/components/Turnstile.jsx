// Cloudflare Turnstile "verify you're human" check. Only shown when VITE_TURNSTILE_SITE_KEY
// is set (and the server has TURNSTILE_SECRET_KEY), so it stays off until it's configured.
import { useEffect, useRef } from 'react';

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading;

function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve(window.turnstile);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return loading;
}

export default function Turnstile({ siteKey, onToken }) {
  const ref = useRef(null);
  const tokenRef = useRef(onToken);
  tokenRef.current = onToken;

  useEffect(() => {
    let widget;
    let cancelled = false;
    loadScript()
      .then((ts) => {
        if (cancelled || !ref.current) return;
        widget = ts.render(ref.current, {
          sitekey: siteKey,
          callback: (token) => tokenRef.current(token),
          'expired-callback': () => tokenRef.current(''),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (widget !== undefined) window.turnstile?.remove(widget);
    };
  }, [siteKey]);

  return <div ref={ref} />;
}
