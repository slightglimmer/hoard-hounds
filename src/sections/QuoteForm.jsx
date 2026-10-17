import { useEffect, useId, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Reveal from '../components/Reveal.jsx';
import { SERVICES, SITE } from '../config/site.js';
import { MAX_PHOTOS, MAX_TOTAL_BYTES, compressImage, isDemoMode, submitQuote } from '../lib/submitQuote.js';

const EMPTY = {
  name: '',
  email: '',
  phone: '',
  address: '',
  cleanoutType: '',
  description: '',
  preferredDate: '',
  consent: false,
};

const CLEANOUT_TYPES = [...SERVICES.map((s) => s.title), 'Other / Not sure'];

function validate(v) {
  const errors = {};
  if (v.name.trim().length < 2) errors.name = 'Please enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) errors.email = 'Please enter a valid email address.';
  if (v.phone.replace(/\D/g, '').length < 10) errors.phone = 'Please enter a phone number with area code.';
  if (v.address.trim().length < 5) errors.address = 'Please enter the property address.';
  if (!v.cleanoutType) errors.cleanoutType = 'Please choose the type of cleanout.';
  if (v.description.trim().length < 10) errors.description = 'Please tell us a little about the project.';
  if (!v.consent) errors.consent = 'Please agree to be contacted so we can send your estimate.';
  return errors;
}

const formatBytes = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

function Field({ id, label, error, optional, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
        {optional ? (
          <span className="ml-1.5 font-normal text-charcoal/70">(optional)</span>
        ) : (
          <span className="ml-0.5 text-red-700" aria-hidden="true">*</span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-charcoal/70">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export default function QuoteForm() {
  const uid = useId();
  const formRef = useRef(null);
  const fileInputRef = useRef(null);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [photos, setPhotos] = useState([]); // [{ id, file, url }]
  const [photoMessage, setPhotoMessage] = useState('');
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [demoResult, setDemoResult] = useState(false);
  const [photosDropped, setPhotosDropped] = useState(false);
  const [minDate, setMinDate] = useState(undefined);

  // Set on the client only, so the prerendered HTML matches what React renders first.
  useEffect(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setMinDate(d.toISOString().slice(0, 10));
  }, []);

  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const id = (name) => `${uid}-${name}`;
  const totalBytes = photos.reduce((sum, p) => sum + p.file.size, 0);

  function update(e) {
    const { name, type, value, checked } = e.target;
    setValues((v) => ({ ...v, [name]: type === 'checkbox' ? checked : value }));
    if (errors[name]) setErrors((errs) => ({ ...errs, [name]: undefined }));
  }

  async function addFiles(fileList) {
    const incoming = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    const skippedNonImages = fileList.length - incoming.length;
    const room = MAX_PHOTOS - photos.length;
    const accepted = incoming.slice(0, Math.max(room, 0));
    const messages = [];
    if (skippedNonImages > 0) messages.push('Only image files can be uploaded.');
    if (incoming.length > accepted.length) messages.push(`You can upload up to ${MAX_PHOTOS} photos.`);
    if (!accepted.length) {
      setPhotoMessage(messages.join(' '));
      return;
    }

    setProcessing(true);
    const compressed = await Promise.all(accepted.map(compressImage));
    let running = totalBytes;
    const added = [];
    for (const file of compressed) {
      if (running + file.size > MAX_TOTAL_BYTES) {
        messages.push(`Some photos were too large to include (limit ${formatBytes(MAX_TOTAL_BYTES)} total).`);
        break;
      }
      running += file.size;
      added.push({ id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`, file, url: URL.createObjectURL(file) });
    }
    setPhotos((prev) => [...prev, ...added]);
    setPhotoMessage(messages.join(' '));
    setProcessing(false);
  }

  function removePhoto(photoId) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === photoId);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== photoId);
    });
    setPhotoMessage('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    // Honeypot: real visitors never see or fill this field.
    if (form.elements['bot-field']?.value) return;

    const found = validate(values);
    setErrors(found);
    const firstError = Object.keys(found)[0];
    if (firstError) {
      document.getElementById(id(firstError))?.focus();
      return;
    }

    setStatus('submitting');
    try {
      const result = await submitQuote(
        {
          ...values,
          name: values.name.trim(),
          email: values.email.trim(),
          phone: values.phone.trim(),
          address: values.address.trim(),
          description: values.description.trim(),
        },
        photos,
      );
      setDemoResult(result.demo);
      setPhotosDropped(!!result.photosDropped);
      setStatus('success');
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      setPhotos([]);
      setValues(EMPTY);
      formRef.current?.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      setStatus('error');
    }
  }

  const describedBy = (name, hint) =>
    [errors[name] ? `${id(name)}-error` : null, hint && !errors[name] ? `${id(name)}-hint` : null].filter(Boolean).join(' ') ||
    undefined;

  return (
    <section id="quote" className="section relative overflow-hidden bg-cream-dark/60" aria-labelledby="quote-title">
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 top-20 h-96 w-96 rounded-full bg-sage/30 blur-3xl" />
      <div className="container-x relative grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
        <Reveal className="lg:pt-4">
          <p className="eyebrow text-forest/80">
            <span className="h-px w-6 bg-gold" aria-hidden="true" />
            Request a Free Quote
          </p>
          <h2 id="quote-title" className="mt-3 text-3xl font-bold leading-tight sm:text-4xl lg:text-[2.75rem]">
            Tell us about your property
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-charcoal/80">
            Share a few details and photos, and we’ll follow up with an estimate or to schedule a walkthrough. There’s no
            cost or obligation.
          </p>

          <div className="mt-8 rounded-3xl bg-forest p-7 text-cream">
            <h3 className="font-sans text-base font-bold text-gold">Helpful things to include</h3>
            <ul className="mt-4 space-y-3 text-cream/90">
              {[
                'Which rooms or areas need to be cleared',
                'Large items like furniture, appliances or mattresses',
                'Whether the home is vacant or occupied, and how we can access it',
                'Any deadline, such as a listing or closing date',
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-sage" strokeWidth={2.4} />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 border-t border-white/15 pt-6">
              <p className="text-sm text-cream/75">Prefer to talk it through?</p>
              <a href={SITE.phoneHref} className="mt-1 inline-flex items-center gap-2 text-xl font-bold text-cream hover:text-gold">
                <Icon name="phone" className="h-5 w-5" />
                {SITE.phoneDisplay}
              </a>
            </div>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="rounded-[2rem] bg-white p-6 shadow-[0_30px_70px_-40px_rgba(36,59,50,0.55)] ring-1 ring-forest/10 sm:p-9">
            {status === 'success' ? (
              <div className="py-10 text-center" role="status" aria-live="polite">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sage-light text-forest">
                  <Icon name="check" className="h-8 w-8" strokeWidth={2.4} />
                </span>
                <h3 className="mt-6 text-2xl font-bold">Thanks! Your request is in.</h3>
                <p className="mx-auto mt-3 max-w-md text-charcoal/80">
                  We’ll review your project and reach out using the contact details you provided to talk through next
                  steps and your estimate.
                </p>
                {photosDropped && (
                  <p className="mx-auto mt-5 max-w-md rounded-xl bg-gold/15 px-4 py-3 text-sm text-charcoal/85">
                    Your details came through, but we couldn’t attach your photos. We may ask you to text or email
                    them to {SITE.phoneDisplay} or {SITE.email}.
                  </p>
                )}
                {demoResult && (
                  <p className="mx-auto mt-5 max-w-md rounded-xl bg-gold/15 px-4 py-3 text-sm text-charcoal/85">
                    <strong>Preview mode:</strong> this copy of the site isn’t connected to a form service yet, so
                    nothing was sent. See the README to turn on submissions.
                  </p>
                )}
                <button type="button" className="btn-outline mt-8" onClick={() => setStatus('idle')}>
                  Submit another request
                </button>
              </div>
            ) : (
              <form
                ref={formRef}
                name="quote"
                method="post"
                encType="multipart/form-data"
                noValidate
                onSubmit={handleSubmit}
                aria-describedby={`${uid}-required-note`}
              >
                <p id={`${uid}-required-note`} className="mb-6 text-sm text-charcoal/70">
                  Fields marked <span className="text-red-700">*</span> are required.
                </p>

                {/* Honeypot for spam bots */}
                <p className="hidden" aria-hidden="true">
                  <label>
                    Leave this empty <input name="bot-field" tabIndex={-1} autoComplete="off" />
                  </label>
                </p>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id={id('name')} label="Full Name" error={errors.name}>
                    <input id={id('name')} name="name" type="text" autoComplete="name" className="field" value={values.name}
                      onChange={update} aria-invalid={!!errors.name} aria-describedby={describedBy('name')} required />
                  </Field>
                  <Field id={id('email')} label="Email Address" error={errors.email}>
                    <input id={id('email')} name="email" type="email" autoComplete="email" inputMode="email" className="field"
                      value={values.email} onChange={update} aria-invalid={!!errors.email} aria-describedby={describedBy('email')} required />
                  </Field>
                  <Field id={id('phone')} label="Phone Number" error={errors.phone}>
                    <input id={id('phone')} name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="(313) 555-0100"
                      className="field" value={values.phone} onChange={update} aria-invalid={!!errors.phone}
                      aria-describedby={describedBy('phone')} required />
                  </Field>
                  <Field id={id('cleanoutType')} label="Type of Cleanout" error={errors.cleanoutType}>
                    <select id={id('cleanoutType')} name="cleanoutType" className="field appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2024%2024%22%20fill=%22none%22%20stroke=%22%23243B32%22%20stroke-width=%222%22%3E%3Cpath%20d=%22m6%209%206%206%206-6%22/%3E%3C/svg%3E')] bg-[length:1.25rem] bg-[right_1rem_center] bg-no-repeat pr-11"
                      value={values.cleanoutType} onChange={update} aria-invalid={!!errors.cleanoutType}
                      aria-describedby={describedBy('cleanoutType')} required>
                      <option value="" disabled>Choose one…</option>
                      {CLEANOUT_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="sm:col-span-2">
                    <Field id={id('address')} label="Property Address" error={errors.address}>
                      <input id={id('address')} name="address" type="text" autoComplete="street-address"
                        placeholder="Street, city, ZIP" className="field" value={values.address} onChange={update}
                        aria-invalid={!!errors.address} aria-describedby={describedBy('address')} required />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field id={id('description')} label="Description of Project" error={errors.description}
                      hint="What needs to go, roughly how much, and anything we should know about access or timing.">
                      <textarea id={id('description')} name="description" rows={5} className="field resize-y"
                        value={values.description} onChange={update} aria-invalid={!!errors.description}
                        aria-describedby={describedBy('description', true)} required />
                    </Field>
                  </div>

                  {/* Photos */}
                  <div className="sm:col-span-2">
                    <span className="field-label" id={`${id('photos')}-label`}>
                      Upload Property Photos <span className="ml-1 font-normal text-charcoal/70">(optional)</span>
                    </span>
                    <label
                      htmlFor={id('photos')}
                      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
                      className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
                        dragging ? 'border-forest bg-sage-light/60' : 'border-forest/25 bg-cream/60 hover:border-forest/50 hover:bg-cream'
                      } ${photos.length >= MAX_PHOTOS ? 'pointer-events-none opacity-50' : ''}`}
                    >
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-forest shadow-sm">
                        <Icon name={processing ? 'clock' : 'upload'} className="h-6 w-6" />
                      </span>
                      <span className="mt-3 font-semibold text-forest">
                        {processing ? 'Preparing photos…' : 'Tap to add photos, or drag them here'}
                      </span>
                      <span className="mt-1 text-sm text-charcoal/70">
                        Up to {MAX_PHOTOS} images. Large photos are resized automatically.
                      </span>
                      <input
                        ref={fileInputRef}
                        id={id('photos')}
                        type="file"
                        accept="image/*"
                        multiple
                        className="sr-only"
                        aria-labelledby={`${id('photos')}-label`}
                        aria-describedby={`${id('photos')}-status`}
                        disabled={photos.length >= MAX_PHOTOS || processing}
                        onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
                      />
                    </label>
                    <p id={`${id('photos')}-status`} className="mt-2 text-sm text-charcoal/70" aria-live="polite">
                      {photoMessage || (photos.length ? `${photos.length} of ${MAX_PHOTOS} photos added (${formatBytes(totalBytes)})` : '')}
                    </p>
                    {photos.length > 0 && (
                      <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
                        {photos.map((p, i) => (
                          <li key={p.id} className="group relative aspect-square overflow-hidden rounded-xl ring-1 ring-forest/10">
                            <img src={p.url} alt={`Selected photo ${i + 1}`} className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => removePhoto(p.id)}
                              className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-charcoal/80 text-white transition hover:bg-charcoal"
                              aria-label={`Remove photo ${i + 1}`}
                            >
                              <Icon name="x" className="h-4 w-4" strokeWidth={2.4} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <Field id={id('preferredDate')} label="Preferred Service Date" optional
                    hint="We’ll confirm availability with you.">
                    <input id={id('preferredDate')} name="preferredDate" type="date" min={minDate} className="field"
                      value={values.preferredDate} onChange={update} aria-describedby={describedBy('preferredDate', true)} />
                  </Field>

                  <div className="sm:col-span-2">
                    <div className="flex gap-3">
                      <input id={id('consent')} name="consent" type="checkbox" checked={values.consent} onChange={update}
                        aria-invalid={!!errors.consent} aria-describedby={describedBy('consent')}
                        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-forest/40 accent-forest" required />
                      <label htmlFor={id('consent')} className="cursor-pointer text-[0.95rem] leading-snug text-charcoal/85">
                        I agree to be contacted by Hoard Hounds by phone, text or email about my estimate.
                        <span className="text-red-700" aria-hidden="true"> *</span>
                        <span className="mt-1 block text-sm text-charcoal/70">
                          See our <a href="/privacy.html" className="font-semibold text-forest underline underline-offset-2">Privacy Policy</a>.
                        </span>
                      </label>
                    </div>
                    {errors.consent && (
                      <p id={`${id('consent')}-error`} className="mt-1.5 text-sm font-medium text-red-700">{errors.consent}</p>
                    )}
                  </div>
                </div>

                {status === 'error' && (
                  <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    Sorry, something went wrong sending your request. Please try again, or call us at{' '}
                    <a href={SITE.phoneHref} className="font-bold underline">{SITE.phoneDisplay}</a>.
                  </div>
                )}

                <button type="submit" className="btn-gold mt-7 w-full text-lg disabled:cursor-wait disabled:opacity-70"
                  disabled={status === 'submitting' || processing}>
                  {status === 'submitting' ? 'Sending…' : 'Request My Free Quote'}
                  {status !== 'submitting' && <Icon name="arrow" className="h-5 w-5" strokeWidth={2.2} />}
                </button>
                {isDemoMode && (
                  <p className="mt-3 text-center text-xs text-charcoal/70">
                    Preview mode: submissions are not sent until a form service is connected.
                  </p>
                )}
              </form>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
