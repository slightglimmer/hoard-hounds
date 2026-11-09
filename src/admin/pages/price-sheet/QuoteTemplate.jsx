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
                // Added by the inquiries & dumpster update; missing before it's run.
                phase1: 'default_overage_terms' in s,
                default_overage_terms: s.default_overage_terms ?? '',
                default_labor_rate: s.default_labor_rate ? String(Number(s.default_labor_rate)) : '',
                default_contingency_pct: s.default_contingency_pct ? String(Number(s.default_contingency_pct)) : '',
                default_target_margin_pct: s.default_target_margin_pct ? String(Number(s.default_target_margin_pct)) : '',
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
    const optionalNumber = (v, max) => {
      const t = v.trim().replace(/[$%,]/g, '');
      if (!t) return null;
      return /^\d+(\.\d{1,2})?$/.test(t) && Number(t) <= max ? Number(t) : NaN;
    };
    const labor = form.phase1 ? optionalNumber(form.default_labor_rate, 10000) : null;
    const contingency = form.phase1 ? optionalNumber(form.default_contingency_pct, 100) : null;
    const margin = form.phase1 ? optionalNumber(form.default_target_margin_pct, 90) : null;
    if (Number.isNaN(labor)) found.default_labor_rate = 'Enter an hourly amount, or leave it empty.';
    if (Number.isNaN(contingency)) found.default_contingency_pct = 'Use 0 to 100%.';
    if (Number.isNaN(margin)) found.default_target_margin_pct = 'Use 0 to 90%.';
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await api.saveQuoteSettings({
        quote_message: form.quote_message.trim(),
        default_terms: form.default_terms.trim(),
        default_valid_days: days,
        default_deposit: deposit,
        ...(form.phase1
          ? {
              default_overage_terms: form.default_overage_terms.trim(),
              default_labor_rate: labor,
              default_contingency_pct: contingency,
              default_target_margin_pct: margin,
            }
          : {}),
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
            <Field label="Usual deposit" optional error={errors.default_deposit} hint="Only a fallback: the job costing suggests a deposit from each job’s dumpster cost.">
              {(p) => (
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">$</span>
                  <input {...p} inputMode="decimal" placeholder="None" className="input pl-8 tabular" value={form.default_deposit} onChange={set('default_deposit')} />
                </div>
              )}
            </Field>
          </div>
          {form.phase1 && (
            <>
              <Field label="Additional charges wording" optional hint="Goes on new estimates: how extra dumpster charges are handled and approved.">
                {(p) => <textarea {...p} rows={4} className="input resize-y text-sm" value={form.default_overage_terms} onChange={set('default_overage_terms')} />}
              </Field>
              <p className="pt-1 text-sm font-semibold">Job costing starting values <span className="font-normal text-muted">(private)</span></p>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Labor cost per hour" optional error={errors.default_labor_rate}>
                  {(p) => <input {...p} inputMode="decimal" className="input tabular" placeholder="$" value={form.default_labor_rate} onChange={set('default_labor_rate')} />}
                </Field>
                <Field label="Contingency %" optional error={errors.default_contingency_pct}>
                  {(p) => <input {...p} inputMode="decimal" className="input tabular" placeholder="%" value={form.default_contingency_pct} onChange={set('default_contingency_pct')} />}
                </Field>
                <Field label="Target margin %" optional error={errors.default_target_margin_pct}>
                  {(p) => <input {...p} inputMode="decimal" className="input tabular" placeholder="%" value={form.default_target_margin_pct} onChange={set('default_target_margin_pct')} />}
                </Field>
              </div>
            </>
          )}
        </form>
      )}
    </Modal>
  );
}
