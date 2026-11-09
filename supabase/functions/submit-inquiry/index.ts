// Supabase Edge Function: submit-inquiry
// Receives quote requests (and up to 6 photos) from the website's form and saves
// them for the admin dashboard. Visitors never get database access: this function
// checks everything, then saves with the server key.
//
// Order of work, so nothing is lost or falsely confirmed:
//   1. check the request (spam trap, optional Turnstile, fields, photos, rate limits)
//   2. save the inquiry; if that fails, report failure (the website then tries its
//      backup, or asks the customer to call)
//   3. upload each photo to the PRIVATE "inquiry-photos" bucket under a random name;
//      photos that fail are counted and reported back honestly
//   4. optionally email the owner and the customer (only if an email service is set up)
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets). All optional:
//   TURNSTILE_SECRET_KEY  Cloudflare Turnstile spam check (free). When set, every
//                         request must include a valid Turnstile token.
//   RESEND_API_KEY        Resend email service (free tier). Needs both of:
//   INQUIRY_FROM_EMAIL    e.g. "Hoard Hounds <hello@hoardhounds.com>" (domain verified in Resend)
//   OWNER_NOTIFY_EMAIL    where new-request alerts go
// Supabase provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY automatically.
// Turn "Verify JWT" OFF for this function: website visitors don't have accounts.
//
// Written without outside libraries so it can be pasted into the dashboard editor.

const ALLOWED_ORIGINS = ['https://hoardhounds.com', 'http://localhost:5173'];
const BUCKET = 'inquiry-photos';
const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_REQUEST_BYTES = 40 * 1024 * 1024;
const PER_ADDRESS_PER_HOUR = 5;
const PER_EMAIL_PER_DAY = 5;
const PHONE = '(734) 589-7627';

const CHOICES = {
  propertyType: ['house', 'condo', 'multi_unit', 'mobile_home', 'commercial', 'other'],
  occupancy: ['occupied', 'vacant'],
  rooms: ['1-2', '3-4', '5-7', '8+'],
  volume: ['light', 'moderate', 'heavy', 'not_sure'],
  access: ['ground', 'stairs', 'elevator', 'not_sure'],
  driveway: ['yes', 'street_only', 'shared_or_limited', 'not_sure'],
};

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function reply(origin, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const text = (form, key) => {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim() : '';
};

// Looks at the file's first bytes rather than trusting its name or stated type.
export function sniffImage(bytes) {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: 'image/png', ext: 'png' };
  const ascii = (from, to) => String.fromCharCode(...b.slice(from, to));
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  if (b.length >= 12 && ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis'].includes(brand)) return { type: 'image/heic', ext: 'heic' };
    if (['mif1', 'msf1', 'heif'].includes(brand)) return { type: 'image/heif', ext: 'heif' };
  }
  return null;
}

// Checks the form. Returns { values, errors }.
export function validateFields(form) {
  const errors = {};
  const v = {
    full_name: text(form, 'name'),
    email: text(form, 'email').toLowerCase(),
    phone: text(form, 'phone'),
    property_address: text(form, 'address'),
    cleanout_type: text(form, 'cleanoutType'),
    description: text(form, 'description'),
    restrictions: text(form, 'restrictions') || null,
    keep_items: text(form, 'keepItems') || null,
    hazards: text(form, 'hazards') || null,
    preferred_date: text(form, 'preferredDate') || null,
    date_is_deadline: text(form, 'dateIsDeadline') === 'yes',
    consent: text(form, 'consent') === 'yes',
  };
  if (v.full_name.length < 2 || v.full_name.length > 120) errors.name = 'Please enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email) || v.email.length > 254) errors.email = 'Please enter a valid email address.';
  if (v.phone.replace(/\D/g, '').length < 10 || v.phone.length > 40) errors.phone = 'Please enter a phone number with area code.';
  if (v.property_address.length < 5 || v.property_address.length > 300) errors.address = 'Please enter the property address.';
  if (!v.cleanout_type || v.cleanout_type.length > 100) errors.cleanoutType = 'Please choose the type of clean-out.';
  if (v.description.length < 10) errors.description = 'Please tell us a little about the project.';
  if (v.description.length > 5000) errors.description = 'Please shorten the description to 5,000 characters or fewer.';
  if (!v.consent) errors.consent = 'Please agree to be contacted so we can send your estimate.';
  for (const [field, max] of [['restrictions', 1000], ['keep_items', 2000], ['hazards', 1000]]) {
    if (v[field] && v[field].length > max) errors[field] = `Please keep this under ${max} characters.`;
  }
  if (v.preferred_date && !/^\d{4}-\d{2}-\d{2}$/.test(v.preferred_date)) errors.preferredDate = 'Please choose a valid date.';
  for (const [field, column] of [['propertyType', 'property_type'], ['occupancy', 'occupancy'], ['rooms', 'rooms'], ['volume', 'volume'], ['access', 'access'], ['driveway', 'driveway']]) {
    const value = text(form, field);
    if (!value) v[column] = null;
    else if (CHOICES[field].includes(value)) v[column] = value;
    else errors[field] = 'Please choose one of the options.';
  }
  return { values: v, errors };
}

async function hmacHex(key, message) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function db(env, fetchImpl) {
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  return {
    async rest(path, init = {}) {
      const res = await fetchImpl(`${env.SUPABASE_URL}/rest/v1${path}`, {
        ...init,
        headers: { ...headers, 'Content-Type': 'application/json', ...(init.headers || {}) },
      });
      const body = await res.text();
      const data = body ? JSON.parse(body) : null;
      if (!res.ok) throw new Error(data?.message || `Database error ${res.status}`);
      return data;
    },
    async upload(path, bytes, contentType) {
      const res = await fetchImpl(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': contentType, 'x-upsert': 'false', 'Cache-Control': 'max-age=3600' },
        body: bytes,
      });
      if (!res.ok) throw new Error(`Upload failed ${res.status}`);
    },
    async removeObjects(paths) {
      if (!paths.length) return;
      await fetchImpl(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
        method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: paths }),
      }).catch(() => {});
    },
  };
}

async function sendEmail(env, fetchImpl, { to, subject, body, replyTo }) {
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.INQUIRY_FROM_EMAIL, to: [to], subject, text: body, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  return res.ok;
}

export async function handle(req, env, fetchImpl = fetch) {
  const origin = req.headers.get('Origin') || '';
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return reply(origin, 405, { error: 'Use POST.' });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return reply(origin, 503, { error: `Online requests aren’t available right now. Please call or text us at ${PHONE}.` });
  }
  if (Number(req.headers.get('Content-Length') || 0) > MAX_REQUEST_BYTES) {
    return reply(origin, 413, { error: 'Your photos are too large to send together. Please remove a few and try again.' });
  }

  let form;
  try {
    form = await req.formData();
  } catch {
    return reply(origin, 400, { error: 'We couldn’t read your request. Please try again.' });
  }

  // Spam trap: a field real visitors never see.
  if (text(form, 'bot-field')) return reply(origin, 400, { error: 'Your request was blocked. Please call or text us instead.' });

  if (env.TURNSTILE_SECRET_KEY) {
    const token = text(form, 'cf-turnstile-response');
    const check = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }).toString(),
    }).then((r) => r.json()).catch(() => ({ success: false }));
    if (!token || !check.success) {
      return reply(origin, 400, { error: 'Please complete the “verify you’re human” check and try again.', errors: { turnstile: 'Please complete the check.' } });
    }
  }

  const { values, errors } = validateFields(form);
  if (Object.keys(errors).length) return reply(origin, 400, { error: 'Please fix the highlighted fields.', errors });

  // Photos: up to 6, real image files only, each under the size limit.
  const files = [];
  for (let i = 1; i <= 12; i += 1) {
    const f = form.get(`photo${i}`);
    if (f && typeof f === 'object' && 'arrayBuffer' in f && f.size > 0) files.push({ file: f, index: i });
  }
  if (files.length > MAX_PHOTOS) return reply(origin, 400, { error: `Please send no more than ${MAX_PHOTOS} photos.`, errors: { photos: 'Too many photos.' } });
  const photos = [];
  for (const { file, index } of files) {
    if (file.size > MAX_PHOTO_BYTES) {
      return reply(origin, 400, { error: `Photo ${index} is too large (over 8 MB). Please choose a smaller photo.`, errors: { photos: 'A photo is too large.' } });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniffImage(bytes);
    if (!kind) {
      return reply(origin, 400, { error: `Photo ${index} isn’t a supported image. Please use JPG, PNG, WEBP or HEIC photos.`, errors: { photos: 'Unsupported file.' } });
    }
    photos.push({ bytes, ...kind });
  }

  const api = db(env, fetchImpl);
  try {
    // Rate limits: per network address (hashed, never stored raw) and per email.
    const ip = (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const clientHash = ip ? await hmacHex(env.SUPABASE_SERVICE_ROLE_KEY, `inquiry:${ip}`) : null;
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const dayAgo = new Date(Date.now() - 86400_000).toISOString();
    if (clientHash) {
      const recent = await api.rest(`/inquiries?select=id&client_hash=eq.${clientHash}&created_at=gte.${encodeURIComponent(hourAgo)}&limit=${PER_ADDRESS_PER_HOUR}`);
      if (recent.length >= PER_ADDRESS_PER_HOUR) {
        return reply(origin, 429, { error: `We’ve received several requests from you in the last hour. Please call or text us at ${PHONE} instead.` });
      }
    }
    const sameEmail = await api.rest(`/inquiries?select=id&email=eq.${encodeURIComponent(values.email)}&created_at=gte.${encodeURIComponent(dayAgo)}&limit=${PER_EMAIL_PER_DAY}`);
    if (sameEmail.length >= PER_EMAIL_PER_DAY) {
      return reply(origin, 429, { error: `We’ve already received several requests from this email today. Please call or text us at ${PHONE}.` });
    }

    // 2. Save the inquiry first.
    let saved;
    try {
      [saved] = await api.rest('/inquiries?select=id,number', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ ...values, client_hash: clientHash, source: 'website' }),
      });
    } catch {
      return reply(origin, 500, { error: `We couldn’t save your request. Please try again, or call or text us at ${PHONE}.`, saved: false });
    }

    // 3. Photos, each under a random name in the private bucket.
    const stored = [];
    let failed = 0;
    for (const p of photos) {
      const path = `${saved.id}/${crypto.randomUUID()}.${p.ext}`;
      try {
        await api.upload(path, p.bytes, p.type);
        stored.push({ inquiry_id: saved.id, storage_path: path, content_type: p.type, size_bytes: p.bytes.length });
      } catch {
        failed += 1;
      }
    }
    if (stored.length) {
      try {
        await api.rest('/inquiry_photos', { method: 'POST', body: JSON.stringify(stored) });
      } catch {
        await api.removeObjects(stored.map((s) => s.storage_path));
        failed += stored.length;
        stored.length = 0;
      }
    }
    if (photos.length) {
      await api.rest(`/inquiries?id=eq.${saved.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ photo_count: stored.length, photos_failed: failed }),
      }).catch(() => {});
    }

    // 4. Optional emails. Never claimed unless the email service accepted them.
    let emailSent = false;
    if (env.RESEND_API_KEY && env.INQUIRY_FROM_EMAIL) {
      if (env.OWNER_NOTIFY_EMAIL) {
        await sendEmail(env, fetchImpl, {
          to: env.OWNER_NOTIFY_EMAIL,
          replyTo: values.email,
          subject: `New request #${saved.number}: ${values.cleanout_type}, ${values.property_address}`,
          body: `New quote request #${saved.number} from ${values.full_name} (${values.phone}, ${values.email}).\n\n${values.description}\n\nPhotos: ${stored.length}${failed ? ` (${failed} failed to upload)` : ''}\n\nOpen it in your dashboard: https://hoardhounds.com/admin/#/inquiries`,
        }).catch(() => false);
      }
      emailSent = await sendEmail(env, fetchImpl, {
        to: values.email,
        subject: 'We received your Hoard Hounds request',
        body: `Hi ${values.full_name.split(' ')[0]},\n\nThanks for reaching out to Hoard Hounds. We received your request (#${saved.number}) for ${values.property_address} and will review the details${stored.length ? ' and photos' : ''}. We’ll contact you to talk through next steps and your estimate.\n\nQuestions in the meantime? Call or text ${PHONE}.\n\nHoard Hounds LLC`,
      }).catch(() => false);
    }

    return reply(origin, 200, {
      ok: true,
      number: saved.number,
      photos_saved: stored.length,
      photos_failed: failed,
      email_sent: emailSent,
    });
  } catch {
    return reply(origin, 500, { error: `We couldn’t save your request. Please try again, or call or text us at ${PHONE}.`, saved: false });
  }
}

if (typeof Deno !== 'undefined') {
  Deno.serve((req) => handle(req, Deno.env.toObject()));
}
