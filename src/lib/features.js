// On/off switches for features that need outside setup. All are OFF unless the build
// sets them to "true" (GitHub -> Settings -> Secrets and variables -> Actions -> Variables).
//
//   VITE_ONLINE_PAYMENTS  Stripe payment links and "pay a deposit / pay in full" on quote links.
//                         Also needs ONLINE_PAYMENTS_ENABLED=true in Supabase secrets: the server
//                         refuses to create any payment without it.
//   VITE_QUOTE_LINKS      Customer quote links (needs the public-quote server function).
export const ONLINE_PAYMENTS = import.meta.env.VITE_ONLINE_PAYMENTS === 'true';
export const QUOTE_LINKS = import.meta.env.VITE_QUOTE_LINKS === 'true';
