import { useEffect, useId, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Reveal from '../components/Reveal.jsx';
import { SERVICES, SITE } from '../config/site.js';
import { MAX_PHOTOS, MAX_TOTAL_BYTES, SubmitError, TURNSTILE_SITE_KEY, compressImage, isDemoMode, submitQuote } from '../lib/submitQuote.js';
import Turnstile from '../components/Turnstile.jsx';

const EMPTY = {
  name: '',
  email: '',
  phone: '',
  address: '',
  cleanoutType: '',
  description: '',
  preferredDate: '',
  dateIsDeadline: false,
  propertyType: '',
  occupancy: '',
  rooms: '',
  volume: '',
  access: '',
  driveway: '',
  restrictions: '',
  keepItems: '',
  hazards: '',
  consent: false,
};

const CLEANOUT_TYPES = [...SERVICES.map((s) => s.title), 'Sorting & Organizing', 'Other / Not sure'];

// Optional details. Values match the database (supabase/migrations/..._inquiries_dumpsters.sql).
const DETAIL_CHOICES = [
  { name: 'propertyType', label: 'Property type', options: [['house', 'House'], ['condo', 'Condo or apartment'], ['multi_unit', 'Duplex or multi-unit'], ['mobile_home', 'Mobile home'], ['commercial', 'Commercial'], ['other', 'Other']] },
  { name: 'occupancy', label: 'Is anyone living there?', options: [['occupied', 'Yes, it’s occupied'], ['vacant', 'No, it’s vacant']] },
  { name: 'rooms', label: 'Rooms or areas to clear', options: [['1-2', '1–2'], ['3-4', '3–4'], ['5-7', '5–7'], ['8+', '8 or more']] },
  { name: 'volume', label: 'How full is it?', options: [['light', 'Light: some items in a few rooms'], ['moderate', 'Moderate: most rooms have a lot of items'], ['heavy', 'Heavy: rooms are full or hard to walk through'], ['not_sure', 'Not sure']] },
  { name: 'access', label: 'Stairs or elevator?', options: [['ground', 'Mostly ground level'], ['stairs', 'Stairs'], ['elevator', 'Elevator'], ['not_sure', 'Not sure']] },
  { name: 'driveway', label: 'Driveway for a dumpster?', options: [['yes', 'Yes, there’s a driveway'], ['street_only', 'No, street parking only'], ['shared_or_limited', 'Shared or limited space'], ['not_sure', 'Not sure']] },
];

const SELECT_ARROW =
  "appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2024%2024%22%20fill=%22none%22%20stroke=%22%23243B32%22%20stroke-width=%222%22%3E%3Cpath%20d=%22m6%209%206%206%206-6%22/%3E%3C/svg%3E')] bg-[length:1.25rem] bg-[right_1rem_center] bg-no-repeat pr-11";

function validate(v) {
  const errors = {};
  if (v.name.trim().length < 2) errors.name = 'Please enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) errors.email = 'Please enter a valid email address.';
  if (v.phone.replace(/\D/g, '').length < 10) errors.phone = 'Please enter a phone number with area code.';
  if (v.address.trim().length < 5) errors.address = 'Please enter the property address.';
  if (!v.cleanoutType) errors.cleanoutType = 'Please choose the type of clean-out.';
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
  const [result, setResult] = useState(null);
  const [serverError, setServerError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileKey, setTurnstileKey] = useState(0);
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
    if (TURNSTILE_SITE_KEY && !turnstileToken) found.turnstile = 'Please complete the “verify you’re human” check.';
    setErrors(found);
    const firstError = Object.keys(found)[0];
    if (firstError) {
      document.getElementById(id(firstError))?.focus();
      return;
    }

    setStatus('submitting');
    setServerError('');
    try {
      const sent = await submitQuote(
        {
          ...values,
          name: values.name.trim(),
          email: values.email.trim(),
          phone: values.phone.trim(),
          address: values.address.trim(),
          description: values.description.trim(),
          restrictions: values.restrictions.trim(),
          keepItems: values.keepItems.trim(),
          hazards: values.hazards.trim(),
        },
        photos,
        { turnstileToken },
      );
      setResult(sent);
      setStatus('success');
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      setPhotos([]);
      setValues(EMPTY);
      formRef.current?.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      if (err instanceof SubmitError) {
        setErrors(err.fieldErrors);
        setServerError(err.message);
        const first = Object.keys(err.fieldErrors)[0];
        if (first) document.getElementById(id(first))?.focus();
      }
      setStatus('error');
      // A Turnstile token works once; get a fresh one for the next try.
      setTurnstileToken('');
      setTurnstileKey((k) => k + 1);
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
            Share a few details and photos, and we’ll follow up with a written quote or to schedule a walkthrough. There’s
            no cost or obligation, and nothing is scheduled until you approve.
          </p>

          <div className="mt-8 rounded-3xl bg-forest p-7 text-cream">
            <h3 className="font-sans text-base font-bold text-gold">Helpful things to include</h3>
            <ul className="mt-4 space-y-3 text-cream/90">
              {[
                'Which rooms or areas need to be cleared',
                'Large items like furniture, appliances or mattresses',
                'Anything you want to keep, donate or have set aside',
                'Whether the home is vacant or occupied, and how we can access it',
                'Where a dumpster could go, such as a driveway',
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
                <h3 className="mt-6 text-2xl font-bold">
                  Thanks! Your request{result?.number ? ` #${result.number}` : ''} is in.
                </h3>
                <p className="mx-auto mt-3 max-w-md text-charcoal/80">
                  We’ll review your project and reach out using the contact details you provided to talk through next
                  steps and your estimate.
                </p>
                {result?.emailSent && (
                  <p className="mx-auto mt-3 max-w-md text-sm text-charcoal/75">We’ve also emailed you a confirmation.</p>
                )}
                {result?.photosFailed > 0 && (
                  <p className="mx-auto mt-5 max-w-md rounded-xl bg-gold/15 px-4 py-3 text-sm text-charcoal/85">
                    Your details came through, but {result.photosFailed === 1 ? '1 photo' : `${result.photosFailed} photos`} couldn’t
                    be uploaded. Please text {result.photosFailed === 1 ? 'it' : 'them'} to {SITE.phoneDisplay} or email {SITE.email}.
                  </p>
                )}
                {result?.photosDropped && (
                  <p className="mx-auto mt-5 max-w-md rounded-xl bg-gold/15 px-4 py-3 text-sm text-charcoal/85">
                    Your details came through, but we couldn’t attach your photos. We may ask you to text or email
                    them to {SITE.phoneDisplay} or {SITE.email}.
                  </p>
                )}
                {result?.demo && (
                  <p className="mx-auto mt-5 max-w-md rounded-xl bg-gold/15 px-4 py-3 text-sm text-charcoal/85">
                    <strong>Preview mode:</strong> this copy of the site isn’t connected to a form service yet, so
                    nothing was sent. See the README to turn on submissions.
                  </p>
                )}
                <button type="button" className="btn-outline mt-8" onClick={() => { setResult(null); setStatus('idle'); }}>
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
                  <Field id={id('cleanoutType')} label="Type of Clean-Out" error={errors.cleanoutType}>
                    <select id={id('cleanoutType')} name="cleanoutType" className={`field ${SELECT_ARROW}`}
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
                    {errors.photos && <p className="mt-1.5 text-sm font-medium text-red-700">{errors.photos}</p>}
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

                  {/* Optional details: folded away so the form stays short. */}
                  <details className="group sm:col-span-2 rounded-2xl border border-forest/15 bg-cream/40 open:bg-white">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 [&::-webkit-details-marker]:hidden">
                      <span>
                        <span className="block font-bold text-forest">Property details <span className="font-normal text-charcoal/70">(optional)</span></span>
                        <span className="mt-0.5 block text-sm text-charcoal/70">Helps us size the dumpster and the crew, and quote faster.</span>
                      </span>
                      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sage-light text-xl leading-none text-forest transition group-open:rotate-45">+</span>
                    </summary>
                    <div className="grid gap-5 border-t border-forest/10 px-5 pt-5 pb-6 sm:grid-cols-2">
                      {DETAIL_CHOICES.map((c) => (
                        <Field key={c.name} id={id(c.name)} label={c.label} optional error={errors[c.name]}>
                          <select id={id(c.name)} name={c.name} className={`field ${SELECT_ARROW}`} value={values[c.name]} onChange={update}
                            aria-invalid={!!errors[c.name]} aria-describedby={describedBy(c.name)}>
                            <option value="">Choose…</option>
                            {c.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </Field>
                      ))}
                      <div className="sm:col-span-2">
                        <Field id={id('restrictions')} label="HOA, landlord or parking rules" optional error={errors.restrictions}
                          hint="Anything that limits where a dumpster can go or when we can work.">
                          <input id={id('restrictions')} name="restrictions" type="text" maxLength={1000} className="field"
                            value={values.restrictions} onChange={update} aria-describedby={describedBy('restrictions', true)} />
                        </Field>
                      </div>
                      <div className="sm:col-span-2">
                        <Field id={id('keepItems')} label="Items to keep or donate" optional error={errors.keepItems}
                          hint="Tell us what should be set aside, like photos, papers or furniture going to family.">
                          <textarea id={id('keepItems')} name="keepItems" rows={3} maxLength={2000} className="field resize-y"
                            value={values.keepItems} onChange={update} aria-describedby={describedBy('keepItems', true)} />
                        </Field>
                      </div>
                      <div className="sm:col-span-2">
                        <Field id={id('hazards')} label="Anything hazardous?" optional error={errors.hazards}
                          hint="For example paint, chemicals, propane tanks, needles, mold or animal waste. We don’t handle hazardous materials, but knowing helps us plan.">
                          <input id={id('hazards')} name="hazards" type="text" maxLength={1000} className="field"
                            value={values.hazards} onChange={update} aria-describedby={describedBy('hazards', true)} />
                        </Field>
                      </div>
                    </div>
                  </details>

                  <div>
                    <Field id={id('preferredDate')} label="Preferred Date or Deadline" optional error={errors.preferredDate}
                      hint="We’ll confirm availability with you.">
                      <input id={id('preferredDate')} name="preferredDate" type="date" min={minDate} className="field"
                        value={values.preferredDate} onChange={update} aria-describedby={describedBy('preferredDate', true)} />
                    </Field>
                    {values.preferredDate && (
                      <label className="mt-2 flex cursor-pointer items-center gap-2.5 text-sm text-charcoal/85">
                        <input type="checkbox" name="dateIsDeadline" checked={values.dateIsDeadline} onChange={update}
                          className="h-4 w-4 accent-forest" />
                        This is a firm deadline (like a closing or move-out date)
                      </label>
                    )}
                  </div>

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

                {TURNSTILE_SITE_KEY && (
                  <div className="mt-6">
                    <Turnstile key={turnstileKey} siteKey={TURNSTILE_SITE_KEY} onToken={(t) => { setTurnstileToken(t); setErrors((x) => ({ ...x, turnstile: undefined })); }} />
                    {errors.turnstile && <p className="mt-1.5 text-sm font-medium text-red-700">{errors.turnstile}</p>}
                  </div>
                )}

                {status === 'error' && (
                  <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {serverError || 'Sorry, something went wrong and your request was not sent. Please try again, or call us at'}{' '}
                    {!serverError && <a href={SITE.phoneHref} className="font-bold underline">{SITE.phoneDisplay}</a>}
                    {!serverError && '.'}
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
