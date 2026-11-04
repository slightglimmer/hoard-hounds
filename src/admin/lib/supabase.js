import { createClient } from '@supabase/supabase-js';

// The URL and publishable key are public by design: the database's row-level
// security decides what any request can see. Never put a secret or service_role key here.
const url = import.meta.env.VITE_SUPABASE_URL || '';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

// Refuse to run with a privileged key, in case one is pasted into the wrong setting.
function isPrivilegedKey(k) {
  if (k.startsWith('sb_secret_')) return true;
  const parts = k.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

// 'live'         connected to Supabase
// 'demo'         sample data in memory (local development, or a preview build with VITE_ADMIN_DEMO=true)
// 'unconfigured' a production build with no Supabase settings: shows setup steps, never demo data
// 'unsafe'       a secret key was configured: the app refuses to start
export const MODE =
  key && isPrivilegedKey(key)
    ? 'unsafe'
    : url && key
      ? 'live'
      : import.meta.env.DEV || import.meta.env.VITE_ADMIN_DEMO === 'true'
        ? 'demo'
        : 'unconfigured';

export const supabase =
  MODE === 'live'
    ? createClient(url, key, {
        auth: {
          // PKCE keeps login codes in the query string, out of the #/hash the admin uses for pages.
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;
