// Sends quote requests to whichever form backend is configured.
// See README.md -> "Receiving quote requests" for setup.

export const FORM_NAME = 'quote';
export const MAX_PHOTOS = 6;
// Netlify Forms rejects requests larger than about 8 MB, so stay under that in total.
export const MAX_TOTAL_BYTES = 7.5 * 1024 * 1024;

const PROVIDER = import.meta.env.VITE_FORM_PROVIDER || 'demo';
const ENDPOINT = import.meta.env.VITE_FORM_ENDPOINT || '';

export const isDemoMode = PROVIDER === 'demo' || (PROVIDER === 'endpoint' && !ENDPOINT);

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

export async function submitQuote(values, photos) {
  const body = buildFormData(values, photos);

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 900));
    return { demo: true };
  }

  const url = PROVIDER === 'netlify' ? '/' : ENDPOINT;
  const send = (data) => fetch(url, { method: 'POST', body: data, headers: { Accept: 'application/json' } });

  let response = await send(body);
  // Some form plans (e.g. Formspree's free tier) reject file uploads. Rather than lose the
  // request, resend it without photos and let the visitor know.
  if (!response.ok && photos.length) {
    response = await send(buildFormData(values, []));
    if (response.ok) return { demo: false, photosDropped: true };
  }
  if (!response.ok) {
    throw new Error(`Form submission failed (${response.status})`);
  }
  return { demo: false, photosDropped: false };
}
