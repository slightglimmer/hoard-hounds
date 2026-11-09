// Sends quote requests to whichever backend is configured.
// See README.md -> "Receiving quote requests" for setup.
//
//   supabase  saves the request and photos in your own dashboard (Inquiries) through the
//             submit-inquiry server function. If that server can't be reached, the request
//             goes to the Formspree backup instead (when VITE_FORM_ENDPOINT is set), so it
//             is never lost. On success, a short text-only alert is also sent through
//             Formspree (when set) so you get an email about it.
//   endpoint  POST to VITE_FORM_ENDPOINT (Formspree, Basin, Getform, or your own API)
//   netlify   Netlify Forms
//   demo      nothing is sent; the form shows a "preview mode" notice (default)

export const FORM_NAME = 'quote';
export const MAX_PHOTOS = 6;
// Netlify Forms rejects requests larger than about 8 MB, so stay under that in total.
export const MAX_TOTAL_BYTES = 7.5 * 1024 * 1024;

const PROVIDER = import.meta.env.VITE_FORM_PROVIDER || 'demo';
const ENDPOINT = import.meta.env.VITE_FORM_ENDPOINT || '';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
export const TURNSTILE_SITE_KEY = PROVIDER === 'supabase' ? import.meta.env.VITE_TURNSTILE_SITE_KEY || '' : '';

export const isDemoMode =
  PROVIDER === 'demo' || (PROVIDER === 'endpoint' && !ENDPOINT) || (PROVIDER === 'supabase' && !SUPABASE_URL);

// A problem the customer can fix (bad field, too many requests). Never retried elsewhere.
export class SubmitError extends Error {
  constructor(message, fieldErrors = {}) {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

function loadImage(file) {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file, { imageOrientation: 'from-image' });
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

// Shrinks large phone photos (often 4–8 MB each) to roughly 300–600 KB JPEGs before upload.
// If the browser can't decode the file, the original is sent unchanged.
export async function compressImage(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    img.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

function buildFormData(values, photos) {
  const data = new FormData();
  data.append('form-name', FORM_NAME);
  data.append('_subject', `New quote request: ${values.cleanoutType} – ${values.address}`);
  for (const [key, value] of Object.entries(values)) {
    data.append(key, typeof value === 'boolean' ? (value ? 'yes' : 'no') : value);
  }
  // One field per photo (photo1, photo2, ...) works with every provider, including Netlify.
  photos.forEach((photo, i) => data.append(`photo${i + 1}`, photo.file, photo.file.name));
  return data;
}

async function sendToEndpoint(values, photos) {
  const url = PROVIDER === 'netlify' ? '/' : ENDPOINT;
  const send = (data) => fetch(url, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
  let response = await send(buildFormData(values, photos));
  // Some form plans (e.g. Formspree's free tier) reject file uploads. Rather than lose the
  // request, resend it without photos and let the visitor know.
  if (!response.ok && photos.length) {
    response = await send(buildFormData(values, []));
    if (response.ok) return { demo: false, photosDropped: true };
  }
  if (!response.ok) throw new Error(`Form submission failed (${response.status})`);
  return { demo: false, photosDropped: false };
}

async function sendToSupabase(values, photos, turnstileToken) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.append(key, typeof value === 'boolean' ? (value ? 'yes' : '') : value);
  }
  if (turnstileToken) data.append('cf-turnstile-response', turnstileToken);
  photos.forEach((photo, i) => data.append(`photo${i + 1}`, photo.file, photo.file.name));

  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/submit-inquiry`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY },
      body: data,
    });
  } catch {
    response = null; // offline, blocked, or the server function isn't deployed
  }
  const body = response ? await response.json().catch(() => ({})) : {};
  if (response?.ok && body.ok) {
    // Best-effort email alert through the existing form service. Never affects success.
    if (ENDPOINT) {
      const alert = new FormData();
      alert.append('_subject', `New request #${body.number}: ${values.cleanoutType} – ${values.address}`);
      alert.append('message', `Request #${body.number} from ${values.name} (${values.phone}, ${values.email}) was saved in your dashboard with ${body.photos_saved} photo(s). Open https://hoardhounds.com/admin/#/inquiries to review it.`);
      alert.append('email', values.email);
      fetch(ENDPOINT, { method: 'POST', body: alert, headers: { Accept: 'application/json' } }).catch(() => {});
    }
    return { demo: false, saved: true, number: body.number, photosSaved: body.photos_saved, photosFailed: body.photos_failed, emailSent: body.email_sent === true };
  }
  // Problems the customer can fix (bad field, spam check, too many requests).
  if (response && [400, 413, 429].includes(response.status)) {
    throw new SubmitError(body.error || 'Please check the form and try again.', body.errors || {});
  }
  // Our server is down or not set up: use the backup so the request isn't lost.
  if (ENDPOINT) {
    const result = await sendToEndpoint(values, photos);
    return { ...result, viaBackup: true };
  }
  throw new Error(body.error || 'We couldn’t save your request.');
}

export async function submitQuote(values, photos, { turnstileToken } = {}) {
  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 900));
    return { demo: true };
  }
  if (PROVIDER === 'supabase') return sendToSupabase(values, photos, turnstileToken);
  return sendToEndpoint(values, photos);
}
