// "Quote template": the wording and defaults every new estimate and quote link starts with.

import { useEffect, useState } from 'react';
import { Field, Modal, Spinner, useToast } from '../../components/ui.jsx';
import { api } from '../../lib/api/index.js';
import { parseAmount } from '../../lib/money.js';

export default function QuoteTemplate({ open, onClose }) {
  const notify = useToast();
  const [form, setForm] = useState(null); // null loading, false not set up
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(null);
    setErrors({});
    api.getQuoteSettings()
      .then((s) =>
        setForm(
          s
            ? {
                quote_message: s.quote_message ?? '',
                default_terms: s.default_terms ?? '',
                default_valid_days: String(s.default_valid_days ?? 30),
                default_deposit: s.default_deposit ? String(Number(s.default_deposit)) : '',
              }
            : false,
        ),
      )
      .catch((err) => {
        notify(err.message, 'error');
        onClose();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    const found = {};
    const days = Number(form.default_valid_days);
    if (!Number.isInteger(days) || days < 1 || days > 365) found.default_valid_days = 'Enter a number of days from 1 to 365.';
    const deposit = form.default_deposit.trim() ? parseAmount(form.default_deposit) : null;
    if (form.default_deposit.trim() && !deposit) found.default_deposit = 'Enter an amount, or leave it empty.';
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await api.saveQuoteSettings({
        quote_message: form.quote_message.trim(),
        default_terms: form.default_terms.trim(),
        default_valid_days: days,
        default_deposit: deposit,
      });
      notify('Quote template saved');
      onClose();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Quote template"
      onClose={onClose}
      footer={
        form ? (
          <>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" form="quote-template-form" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save template'}</button>
          </>
        ) : (
          <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
        )
      }
    >
      {form === null ? (
        <div className="flex h-32 items-center justify-center"><Spinner /></div>
      ) : form === false ? (
        <p className="rounded-2xl bg-blush/50 px-4 py-3 text-sm text-muted">
          The quote template comes with quote links, which aren’t switched on yet. See “Quote links” in docs/ADMIN_SETUP.md.
        </p>
      ) : (
        <form id="quote-template-form" onSubmit={save} noValidate className="space-y-4">
          <p className="text-sm text-muted">New estimates start with these. You can still change anything on each estimate.</p>
          <Field label="Welcome message" optional hint="Shown at the top of the quote page your customer opens.">
            {(p) => <textarea {...p} rows={3} className="input resize-y" value={form.quote_message} onChange={set('quote_message')} />}
          </Field>
          <Field label="Fine print" optional hint="Goes at the bottom of every new estimate.">
            {(p) => <textarea {...p} rows={4} className="input resize-y text-sm" value={form.default_terms} onChange={set('default_terms')} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Quotes are good for" error={errors.default_valid_days} hint="Days, from the estimate date.">
              {(p) => <input {...p} inputMode="numeric" className="input tabular" value={form.default_valid_days} onChange={set('default_valid_days')} />}
            </Field>
            <Field label="Usual deposit" optional error={errors.default_deposit} hint="Leave empty for no deposit.">
              {(p) => (
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">$</span>
                  <input {...p} inputMode="decimal" placeholder="None" className="input pl-8 tabular" value={form.default_deposit} onChange={set('default_deposit')} />
                </div>
              )}
            </Field>
          </div>
        </form>
      )}
    </Modal>
  );
}
