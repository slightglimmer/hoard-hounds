// "Quote link": a private web page for this estimate that you text or email.
// The customer opens it, sees the quote, and accepts it: paying a deposit, paying
// in full (card or Klarna through Stripe), or accepting now and paying later.
// Accepting creates the job (and customer) for you automatically.

import { useState } from 'react';
import AdminIcon from '../../components/AdminIcon.jsx';
import { useToast } from '../../components/ui.jsx';
import { api } from '../../lib/api/index.js';
import { formatMoney } from '../../lib/money.js';
import { MODE } from '../../lib/supabase.js';

// 32 random bytes, written with URL-safe letters: impossible to guess.
export function newShareToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const quoteUrl = (token) => `${window.location.origin}/quote/#${token}`;

const CHOSE = {
  deposit: 'chose to pay the deposit',
  full: 'chose to pay in full',
  later: 'chose to pay later',
  admin: '',
};

function quoteMessage(estimate, url) {
  const first = estimate.customer_name?.trim().split(' ')[0];
  return `Hi${first ? ` ${first}` : ''}, here’s your quote from Hoard Hounds for ${formatMoney(estimate.total)}: ${url}\n\nYou can accept it online and pay a deposit, pay in full, or pay over time with Klarna (subject to approval). Any questions, just reply. Thank you!`;
}

export default function QuoteLink({ estimate, dirty, onChange }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  // The quote-links database update hasn't been run yet (the column doesn't exist).
  if (!('share_token' in estimate)) {
    return (
      <p className="rounded-2xl bg-blush/50 px-4 py-3 text-xs text-muted">
        Quote links (customers accept and pay online) aren’t switched on yet. See “Quote links” in docs/ADMIN_SETUP.md.
      </p>
    );
  }

  const token = estimate.share_token;
  const url = token ? quoteUrl(token) : '';
  const text = token ? quoteMessage(estimate, url) : '';
  const phone = (estimate.customer_phone || '').replace(/[^\d+]/g, '');

  async function run(change, done) {
    setBusy(true);
    try {
      const row = await api.saveEstimate({ id: estimate.id, ...change });
      onChange(row);
      if (done) notify(done);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function create() {
    if (dirty) {
      notify('Save your changes first, then make the link.', 'error');
      return;
    }
    run({ share_token: newShareToken(), ...(estimate.status === 'draft' ? { status: 'sent' } : {}) }, 'Quote link ready to send');
  }

  function turnOff() {
    if (!confirmOff) {
      setConfirmOff(true);
      return;
    }
    setConfirmOff(false);
    run({ share_token: null }, 'Link turned off. The old link no longer works.');
  }

  async function refresh() {
    setBusy(true);
    try {
      onChange(await api.getEstimate(estimate.id));
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function simulate(option) {
    setBusy(true);
    await api.simulateQuoteAcceptance(estimate.id, option);
    onChange(await api.getEstimate(estimate.id));
    notify(option === 'later' ? 'Demo: customer accepted, paying later' : 'Demo: customer accepted and paid');
    setBusy(false);
  }

  async function copy(value, what) {
    try {
      await navigator.clipboard.writeText(value);
      notify(`${what} copied`);
    } catch {
      window.prompt('Copy this:', value);
    }
  }

  return (
    <section aria-labelledby="quote-link-title" className="rounded-3xl border border-dashed border-petal p-4">
      <h3 id="quote-link-title" className="flex items-center gap-2 text-sm font-semibold">
        <AdminIcon name="sparkle" className="h-4 w-4 text-rose-deep" />
        Quote link
      </h3>

      {estimate.accepted_at && (
        <p className="mt-2 rounded-2xl bg-sage/20 px-3 py-2 text-sm text-sage-deep">
          <strong>Accepted</strong> on{' '}
          {new Date(estimate.accepted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          {CHOSE[estimate.accepted_via] ? ` (${CHOSE[estimate.accepted_via]})` : ''}. The job was created for you.
        </p>
      )}

      {!token ? (
        <>
          <p className="mt-1 text-sm text-muted">
            Send a private link. Your customer sees this quote and can accept it, pay a deposit, pay in full, or pay over time with Klarna.
          </p>
          <button type="button" className="btn-primary mt-3 w-full" onClick={create} disabled={busy || estimate.total <= 0}>
            {busy ? 'Making link…' : 'Create quote link'}
          </button>
          {Number(estimate.total) <= 0 && <p className="mt-2 text-xs text-muted">Add a price first.</p>}
        </>
      ) : (
        <>
          <p className="mt-2 rounded-2xl bg-blush/60 px-3 py-2 text-xs break-all">{url}</p>
          <button type="button" className="btn-soft mt-3 min-h-10 w-full" onClick={() => copy(text, 'Message')}>Copy message to send</button>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <button type="button" className="btn-ghost min-h-9 px-2" onClick={() => copy(url, 'Link')}>Copy link</button>
            {/* In demo mode there's no server behind the link, so preview the sample quote page. */}
            <a className="btn-ghost min-h-9 px-2" href={MODE === 'demo' ? quoteUrl('demo') : url} target="_blank" rel="noreferrer">Preview</a>
            <a className="btn-ghost min-h-9 px-2" href={`sms:${phone}?&body=${encodeURIComponent(text)}`}>Text it</a>
            <a
              className="btn-ghost min-h-9 px-2"
              href={`mailto:${estimate.customer_email || ''}?subject=${encodeURIComponent(`Your Hoard Hounds quote #${estimate.number}`)}&body=${encodeURIComponent(text)}`}
            >
              Email it
            </a>
          </div>
          {!estimate.accepted_at && (
            <button type="button" className="btn-ghost mt-2 min-h-9 w-full text-sm" onClick={refresh} disabled={busy}>Check if they accepted</button>
          )}
          {MODE === 'demo' && !estimate.accepted_at && (
            <div className="mt-2 grid gap-2 text-sm">
              <button type="button" className="btn-ghost min-h-9 px-2" disabled={busy} onClick={() => simulate('deposit')}>Demo: paid deposit</button>
              <button type="button" className="btn-ghost min-h-9 px-2" disabled={busy} onClick={() => simulate('later')}>Demo: pay later</button>
            </div>
          )}
          <button type="button" className={`mt-2 w-full text-sm ${confirmOff ? 'btn-danger' : 'btn-ghost text-danger'} min-h-9`} onClick={turnOff} disabled={busy}>
            {confirmOff ? 'Yes, turn off this link' : 'Turn off link'}
          </button>
          <p className="mt-2 text-xs text-muted">
            Changes you save here show up on their link right away. Stripe charges a fee on each online payment.
          </p>
        </>
      )}
    </section>
  );
}
