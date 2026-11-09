// submit-inquiry: tested with simulated Supabase (database + storage), Turnstile and Resend.
const fn = await import(new URL('../../supabase/functions/submit-inquiry/index.ts', import.meta.url).href);
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const env = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key' };
const ID = '9b2f0c1e-1111-4222-8333-444455556666';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const HEIC = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode('ftypheic'), 0, 0]);
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]);

function mock({ recentByIp = 0, recentByEmail = 0, insertFails = false, uploadFailsAt = [], photoRowsFail = false, turnstile = true, resend = true } = {}) {
  const calls = [];
  let uploads = 0;
  const f = async (url, init = {}) => {
    const u = new URL(url); const method = init.method || 'GET';
    calls.push({ url, method, body: init.body, headers: init.headers || {} });
    const J = (s, d) => new Response(d === undefined ? '' : JSON.stringify(d), { status: s });
    if (u.host === 'challenges.cloudflare.com') return J(200, { success: turnstile });
    if (u.host === 'api.resend.com') return resend ? J(200, { id: 'em_1' }) : J(500, { message: 'down' });
    if (u.pathname === '/rest/v1/inquiries' && method === 'GET') {
      if (u.searchParams.get('client_hash')) return J(200, Array(recentByIp).fill({ id: 'x' }));
      return J(200, Array(recentByEmail).fill({ id: 'x' }));
    }
    if (u.pathname === '/rest/v1/inquiries' && method === 'POST') return insertFails ? J(500, { message: 'db down' }) : J(201, [{ id: ID, number: 101 }]);
    if (u.pathname === '/rest/v1/inquiries' && method === 'PATCH') return J(204);
    if (u.pathname === '/rest/v1/inquiry_photos') return photoRowsFail ? J(500, { message: 'nope' }) : J(201);
    if (u.pathname.startsWith('/storage/v1/object/inquiry-photos/')) {
      uploads += 1;
      return uploadFailsAt.includes(uploads) ? J(500, { message: 'storage down' }) : J(200, { Key: 'x' });
    }
    if (u.pathname === '/storage/v1/object/inquiry-photos' && method === 'DELETE') return J(200, []);
    return J(404, { message: 'unmocked ' + url });
  };
  f.calls = calls;
  return f;
}

function form(overrides = {}, photos = []) {
  const fd = new FormData();
  const base = {
    name: 'Casey Customer', email: 'Casey@Example.com', phone: '(313) 555-0100', address: '12 Oak St, Redford, MI 48239',
    cleanoutType: 'Hoarding Clean-Outs', description: 'Two-story house, every room is full.', consent: 'yes',
    occupancy: 'vacant', volume: 'heavy', driveway: 'yes', preferredDate: '2026-12-01', dateIsDeadline: 'yes',
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) if (v !== undefined) fd.append(k, v);
  photos.forEach((bytes, i) => fd.append(`photo${i + 1}`, new File([bytes], `p${i + 1}.jpg`, { type: 'image/jpeg' })));
  return fd;
}
const req = (fd, headers = {}) => new Request('https://p.supabase.co/functions/v1/submit-inquiry', {
  method: 'POST', headers: { Origin: 'https://hoardhounds.com', 'x-forwarded-for': '203.0.113.9, 10.0.0.1', ...headers }, body: fd,
});
const body = (f, path, method) => JSON.parse(f.calls.find((c) => c.url.includes(path) && c.method === method).body);

// ---- Happy path
let f = mock(); let r = await fn.handle(req(form({}, [JPEG, PNG])), env, f); let d = await r.json();
ok(r.status === 200 && d.ok && d.number === 101 && d.photos_saved === 2 && d.photos_failed === 0, 'saves inquiry and two photos');
ok(d.email_sent === false, 'no email claimed when no email service is set up');
const saved = body(f, '/rest/v1/inquiries', 'POST');
ok(saved.full_name === 'Casey Customer' && saved.email === 'casey@example.com' && saved.occupancy === 'vacant' && saved.volume === 'heavy' && saved.date_is_deadline === true && saved.consent === true, 'fields mapped and cleaned (email lowercased)');
ok(saved.client_hash && saved.client_hash.length === 64 && !JSON.stringify(saved).includes('203.0.113.9'), 'network address stored only as a keyed hash');
const uploadCalls = f.calls.filter((c) => c.url.includes('/storage/v1/object/inquiry-photos/'));
ok(uploadCalls.every((c) => new RegExp(`/inquiry-photos/${ID}/[0-9a-f-]{36}\\.(jpg|png)$`).test(c.url)), 'photos stored under random names in the private bucket');
ok(uploadCalls[0].headers['Content-Type'] === 'image/jpeg' && uploadCalls[1].headers['Content-Type'] === 'image/png' && uploadCalls.every((c) => c.headers['x-upsert'] === 'false'), 'type taken from file contents; never overwrites');
ok(f.calls.filter((c) => c.url.startsWith(env.SUPABASE_URL)).every((c) => c.headers.Authorization === 'Bearer service-key'), 'server key used only server-side');
ok(body(f, '/rest/v1/inquiries?id=eq.', 'PATCH').photo_count === 2, 'photo count recorded');
ok(r.headers.get('Access-Control-Allow-Origin') === 'https://hoardhounds.com', 'CORS for the website');

f = mock(); r = await fn.handle(req(form({}, [HEIC])), env, f); d = await r.json();
ok(d.photos_saved === 1 && f.calls.some((c) => /\.heic$/.test(c.url)), 'iPhone HEIC photos accepted');

// ---- Validation
f = mock(); r = await fn.handle(req(form({ email: 'nope', phone: '123', consent: undefined, description: 'short' })), env, f); d = await r.json();
ok(r.status === 400 && d.errors.email && d.errors.phone && d.errors.consent && d.errors.description, 'bad fields rejected with messages');
ok(!f.calls.some((c) => c.method === 'POST'), 'nothing saved when fields are invalid');
r = await fn.handle(req(form({ occupancy: 'haunted' })), env, mock()); d = await r.json();
ok(r.status === 400 && d.errors.occupancy, 'unknown option values rejected');
r = await fn.handle(req(form({ description: 'x'.repeat(5001) })), env, mock());
ok(r.status === 400, 'over-long description rejected');
f = mock(); r = await fn.handle(req(form({}, [JPEG, EXE])), env, f); d = await r.json();
ok(r.status === 400 && /Photo 2 isn’t a supported image/.test(d.error) && !f.calls.some((c) => c.method === 'POST'), 'non-image file rejected before anything is saved');
const big = new Uint8Array(8 * 1024 * 1024 + 10); big.set(JPEG);
r = await fn.handle(req(form({}, [big])), env, mock()); d = await r.json();
ok(r.status === 400 && /too large/.test(d.error), 'oversized photo rejected');
r = await fn.handle(req(form({}, Array(7).fill(JPEG))), env, mock()); d = await r.json();
ok(r.status === 400 && /no more than 6/.test(d.error), 'more than 6 photos rejected');
r = await fn.handle(req(form({ 'bot-field': 'http://spam' })), env, f = mock());
ok(r.status === 400 && !f.calls.length, 'spam trap blocks bots without touching the database');
r = await fn.handle(req(form(), { 'Content-Length': String(50 * 1024 * 1024) }), env, mock());
ok(r.status === 413, 'huge requests refused');

// ---- Rate limits
r = await fn.handle(req(form()), env, f = mock({ recentByIp: 5 })); d = await r.json();
ok(r.status === 429 && /call or text/.test(d.error) && !f.calls.some((c) => c.method === 'POST'), 'too many requests from one address in an hour');
r = await fn.handle(req(form()), env, mock({ recentByEmail: 5 }));
ok(r.status === 429, 'too many requests from one email in a day');

// ---- Turnstile (only when configured)
r = await fn.handle(req(form()), { ...env, TURNSTILE_SECRET_KEY: 'ts' }, f = mock());
ok(r.status === 400 && !f.calls.some((c) => c.url.includes('/rest/v1/inquiries') && c.method === 'POST'), 'Turnstile required when configured (missing token)');
r = await fn.handle(req(form({ 'cf-turnstile-response': 'tok' })), { ...env, TURNSTILE_SECRET_KEY: 'ts' }, mock({ turnstile: false }));
ok(r.status === 400, 'failed Turnstile check rejected');
r = await fn.handle(req(form({ 'cf-turnstile-response': 'tok' })), { ...env, TURNSTILE_SECRET_KEY: 'ts' }, mock());
ok(r.status === 200, 'passing Turnstile check accepted');

// ---- Failures are reported honestly
r = await fn.handle(req(form({}, [JPEG])), env, f = mock({ insertFails: true })); d = await r.json();
ok(r.status === 500 && d.saved === false && !f.calls.some((c) => c.url.includes('/storage/')), 'database failure: not saved, no photos uploaded, error returned');
r = await fn.handle(req(form({}, [JPEG, JPEG, JPEG])), env, mock({ uploadFailsAt: [2] })); d = await r.json();
ok(r.status === 200 && d.photos_saved === 2 && d.photos_failed === 1, 'one photo fails: request saved, failure counted');
r = await fn.handle(req(form({}, [JPEG, JPEG])), env, f = mock({ photoRowsFail: true })); d = await r.json();
ok(d.photos_saved === 0 && d.photos_failed === 2 && f.calls.some((c) => c.method === 'DELETE'), 'photo records fail: uploaded files cleaned up and reported');

// ---- Optional email
const mailEnv = { ...env, RESEND_API_KEY: 're_x', INQUIRY_FROM_EMAIL: 'Hoard Hounds <hello@hoardhounds.com>', OWNER_NOTIFY_EMAIL: 'owner@hoardhounds.com' };
f = mock(); r = await fn.handle(req(form({}, [JPEG])), mailEnv, f); d = await r.json();
const mails = f.calls.filter((c) => c.url.includes('api.resend.com')).map((c) => JSON.parse(c.body));
ok(d.email_sent === true && mails.length === 2 && mails[0].to[0] === 'owner@hoardhounds.com' && mails[0].reply_to === 'casey@example.com' && mails[1].to[0] === 'casey@example.com', 'owner alert and customer confirmation sent when configured');
r = await fn.handle(req(form()), mailEnv, mock({ resend: false })); d = await r.json();
ok(r.status === 200 && d.email_sent === false, 'email outage: request still saved, no email claimed');

// ---- Setup
r = await fn.handle(req(form()), {}, mock());
ok(r.status === 503, 'missing server setup handled');
r = await fn.handle(new Request('https://x', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }), env, mock());
ok(r.headers.get('Access-Control-Allow-Origin') === 'http://localhost:5173', 'CORS preflight');
ok(fn.sniffImage(new TextEncoder().encode('<svg onload=alert(1)>')) === null, 'SVG/HTML disguised as images rejected');
