// Always use the secure https:// address. GitHub Pages redirects new visits, but an
// old tab or bookmark can still open the insecure http:// copy. Imported first in
// main.jsx so it runs before anything else. (The admin's security policy blocks
// inline scripts, so this can't live in admin/index.html.)
const { protocol, hostname, host, pathname, search, hash } = window.location;
if (protocol === 'http:' && hostname !== 'localhost' && hostname !== '127.0.0.1') {
  window.location.replace(`https://${host}${pathname}${search}${hash}`);
}
