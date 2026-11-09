// The page customers open from a quote link: hoardhounds.com/quote/#<link code>.
// The link code stays after the # so it's never sent to any server except ours
// (by the page itself), and never shows up in other sites' logs.
//
// Everything (the quote and the amounts to pay) comes from the public-quote server
// function, which only returns the one quote that matches the code.

import { useCallback, useEffect, useState } from 'react';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import { SITE } from '../config/site.js';
import { allowanceLines, computeTotals, lineCents, minimumApplies, quantityLabel } from '../admin/lib/estimate.js';
import { formatDate } from '../admin/lib/dates.js';
import { formatCents, toCents } from '../admin/lib/money.js';
import { DEMO_TOKEN, demoAccept, demoQuote, resetDemo } from './demoQuote.js';
import { ONLINE_PAYMENTS } from '../lib/features.js';

const API_URL = import.meta.env.VITE_SUPABASE_URL ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-quote` : '';
const API_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

const michiganToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit' }).format(new Date());
const michiganDate = (timestamp) =>
  new Date(timestamp).toLocaleDateString('en-US', { timeZone: 'America/Detroit', month: 'short', day: 'numeric', year: 'numeric' });

async function call(body) {
  if (body.token === DEMO_TOKEN) return body.action === 'get' ? { quote: demoQuote() } : demoAccept(body.option);
  if (!API_URL) throw new Error(`Online quotes aren’t available right now. Please call or text us at ${SITE.phoneDisplay}.`);
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: API_KEY },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('We couldn’t connect. Check your internet connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Something went wrong. Please call or text us at ${SITE.phoneDisplay}.`);
  return data;
}

function readLink() {
  const token = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  const paid = new URLSearchParams(window.location.search).get('paid') === '1';
  return { token, paid };
}

function Shell({ children }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-forest/10 bg-cream/90">
        <div className="container-x flex items-center justify-between gap-4 py-3">
          <a href="/" aria-label={`${SITE.name} home`}>
            <Logo />
          </a>
          <a href={SITE.phoneHref} className="inline-flex min-h-11 items-center gap-2 font-bold text-forest" aria-label={`Call ${SITE.phoneDisplay}`}>
            <Icon name="phone" className="h-5 w-5" />
            <span className="hidden sm:inline">{SITE.phoneDisplay}</span>
          </a>
        </div>
      </header>
      <main id="main" className="container-x max-w-3xl flex-1 py-8 sm:py-12">{children}</main>
      <footer className="bg-forest-dark py-8 text-center text-sm text-cream/80">
        <p>
          <strong className="text-cream">{SITE.legalName}</strong> · {SITE.city}, {SITE.stateCode}
        </p>
        <p className="mt-2">
          Questions? Call or text <a className="font-semibold text-cream underline underline-offset-4" href={SITE.phoneHref}>{SITE.phoneDisplay}</a>
        </p>
      </footer>
    </div>
  );
}

function Notice({ tone = 'info', title, children }) {
  const tones = {
    info: 'bg-white ring-forest/10',
    good: 'bg-sage-light ring-sage',
    warn: 'bg-gold/15 ring-gold/40',
  };
  return (
    <div role={tone === 'warn' ? 'alert' : 'status'} className={`rounded-3xl p-5 ring-1 sm:p-6 ${tones[tone]}`}>
      {title && <p className="font-display text-xl font-bold text-forest">{title}</p>}
      <div className={`${title ? 'mt-2' : ''} leading-relaxed text-charcoal/85`}>{children}</div>
    </div>
  );
}

function Row({ label, value, strong, className = '' }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${strong ? 'text-lg font-extrabold text-forest' : 'text-charcoal/85'} ${className}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function QuoteDetails({ quote }) {
  const { subtotal, discount, total } = computeTotals(quote.line_items, quote.discount_type, quote.discount_value);
  return (
    <section aria-labelledby="quote-title" className="rounded-3xl bg-white p-5 shadow-[0_20px_50px_-30px_rgba(36,59,50,0.45)] ring-1 ring-forest/10 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-forest/70">
            <span className="h-px w-6 bg-gold" aria-hidden="true" />
            Quote #{quote.number}
          </p>
          <h1 id="quote-title" className="mt-2 text-3xl font-extrabold sm:text-4xl">
            {quote.customer_name}
          </h1>
          {quote.property_address && <p className="mt-1 text-charcoal/75">{quote.property_address}</p>}
        </div>
        <dl className="text-sm text-charcoal/75 sm:text-right">
          <div>
            <dt className="inline">Date: </dt>
            <dd className="inline">{formatDate(quote.estimate_date)}</dd>
          </div>
          {quote.valid_until && (
            <div>
              <dt className="inline">Good until: </dt>
              <dd className="inline">{formatDate(quote.valid_until)}</dd>
            </div>
          )}
        </dl>
      </div>

      <h2 className="sr-only">What’s included</h2>
      <ul className="mt-6 divide-y divide-forest/10 border-y border-forest/10">
        {quote.line_items.map((item, i) => {
          const showDetail = !(item.unit === 'flat' && Number(item.quantity) === 1);
          return (
            <li key={i} className="flex items-start justify-between gap-4 py-4">
              <div className="min-w-0">
                <p className="font-semibold text-forest">{item.name}</p>
                {item.description && <p className="mt-0.5 text-sm text-charcoal/75">{item.description}</p>}
                {showDetail && (
                  <p className="mt-0.5 text-sm text-charcoal/65">
                    {quantityLabel(item.unit, item.quantity)} × {formatCents(toCents(item.unit_price))}
                  </p>
                )}
                {minimumApplies(item) && <p className="mt-0.5 text-sm text-charcoal/65">Minimum charge</p>}
              </div>
              <p className="shrink-0 font-semibold tabular-nums">{formatCents(lineCents(item))}</p>
            </li>
          );
        })}
      </ul>

      <dl className="mt-4 space-y-1.5">
        {discount > 0 && (
          <>
            <Row label="Subtotal" value={formatCents(subtotal)} />
            <Row
              label={`Discount${quote.discount_type === 'percent' ? ` (${Number(quote.discount_value)}%)` : ''}`}
              value={`−${formatCents(discount)}`}
            />
          </>
        )}
        <Row label="Total" value={formatCents(total)} strong className="pt-1" />
        {toCents(quote.deposit_amount) > 0 && toCents(quote.received) === 0 && (
          <>
            <Row label="Deposit to book" value={formatCents(toCents(quote.deposit_amount))} />
            <Row label="Balance after deposit" value={formatCents(Math.max(0, total - toCents(quote.deposit_amount)))} />
            <p className="text-right text-xs text-charcoal/60">Your deposit is credited toward the total, not added to it.</p>
          </>
        )}
        {toCents(quote.received) > 0 && (
          <>
            <Row label="Paid so far" value={formatCents(toCents(quote.received))} />
            <Row label="Balance" value={formatCents(Math.max(0, total - toCents(quote.received)))} strong />
          </>
        )}
      </dl>

      {quote.scope_of_work && (
        <div className="mt-6">
          <h2 className="font-sans text-sm font-bold uppercase tracking-[0.14em] text-forest/80">Scope of work</h2>
          <p className="mt-1 whitespace-pre-line text-charcoal/85">{quote.scope_of_work}</p>
        </div>
      )}
      {allowanceLines(quote).length > 0 && (
        <div className="mt-6 rounded-2xl bg-sage-light/60 p-4">
          <h2 className="font-sans text-sm font-bold uppercase tracking-[0.14em] text-forest/80">Dumpster allowance included</h2>
          <ul className="mt-2 space-y-1.5 text-charcoal/85">
            {allowanceLines(quote).map((l) => (
              <li key={l} className="flex gap-2">
                <Icon name="check" className="mt-1 h-4 w-4 shrink-0 text-forest" />
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {quote.overage_terms && (
        <div className="mt-4">
          <h2 className="font-sans text-sm font-bold uppercase tracking-[0.14em] text-forest/80">Additional charges</h2>
          <p className="mt-1 whitespace-pre-line text-sm text-charcoal/80">{quote.overage_terms}</p>
        </div>
      )}
      {quote.notes && (
        <div className="mt-6 rounded-2xl bg-cream p-4">
          <h2 className="font-sans text-sm font-bold uppercase tracking-[0.14em] text-forest/80">Notes</h2>
          <p className="mt-1 whitespace-pre-line text-charcoal/85">{quote.notes}</p>
        </div>
      )}
      {quote.terms && <p className="mt-6 whitespace-pre-line text-sm text-charcoal/65">{quote.terms}</p>}
    </section>
  );
}

function Choice({ title, detail, onClick, busy, primary, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full flex-col items-start gap-1 rounded-3xl p-5 text-left ring-1 transition duration-200 disabled:cursor-wait disabled:opacity-60 ${
        primary ? 'bg-forest text-cream ring-forest hover:bg-forest-dark' : 'bg-white text-forest ring-forest/15 hover:ring-forest/40'
      }`}
    >
      <span className="font-display text-xl font-bold">{busy ? 'One moment…' : title}</span>
      <span className={`text-sm ${primary ? 'text-cream/85' : 'text-charcoal/75'}`}>{detail}</span>
    </button>
  );
}

function Actions({ quote, token, onAccepted }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const total = toCents(quote.total);
  const received = toCents(quote.received);
  const remaining = Math.max(0, total - received);
  const deposit = Math.min(toCents(quote.deposit_amount), remaining);
  const accepted = quote.status === 'accepted' || Boolean(quote.accepted_at);
  const expired = !accepted && quote.valid_until && quote.valid_until < michiganToday();

  async function choose(option) {
    setBusy(option);
    setError('');
    try {
      const result = await call({ action: 'accept', token, option });
      if (result.checkout_url) {
        window.location.assign(result.checkout_url);
        return; // leaving for Stripe's secure checkout
      }
      onAccepted(option, result);
    } catch (err) {
      setError(err.message);
    }
    setBusy('');
  }

  if (quote.status === 'declined') {
    return (
      <Notice tone="warn" title="This quote is closed">
        If you’d still like help, call or text us at <a className="font-semibold underline" href={SITE.phoneHref}>{SITE.phoneDisplay}</a> and we’ll put together a new one.
      </Notice>
    );
  }
  if (expired) {
    return (
      <Notice tone="warn" title="This quote has expired">
        Prices can change, so quotes are good for a limited time. Call or text us at{' '}
        <a className="font-semibold underline" href={SITE.phoneHref}>{SITE.phoneDisplay}</a> and we’ll send you an updated one.
      </Notice>
    );
  }
  if (accepted && remaining === 0) {
    return (
      <Notice tone="good" title="Paid in full. Thank you!">
        We’ve received your payment. We’ll be in touch about your clean-out date.
      </Notice>
    );
  }

  // Online payments are off: customers can accept the quote; payment is arranged with us directly.
  if (!ONLINE_PAYMENTS) {
    if (accepted) {
      return (
        <Notice tone="good" title="You’ve accepted this quote">
          Thank you! We’ll be in touch to confirm your clean-out date and how to pay
          {toCents(quote.deposit_amount) > 0 ? ' your deposit' : ''}. Questions? Call or text{' '}
          <a className="font-semibold underline" href={SITE.phoneHref}>{SITE.phoneDisplay}</a>.
        </Notice>
      );
    }
    return (
      <section aria-labelledby="next-step" className="space-y-4">
        <div>
          <h2 id="next-step" className="text-2xl font-extrabold sm:text-3xl">Ready to book?</h2>
          <p className="mt-2 text-charcoal/80">
            Accept below and we’ll reach out to confirm your clean-out date
            {toCents(quote.deposit_amount) > 0 ? ' and arrange your deposit' : ''}.
          </p>
        </div>
        {error && (
          <p role="alert" className="rounded-2xl bg-gold/15 px-4 py-3 font-medium text-charcoal ring-1 ring-gold/40">{error}</p>
        )}
        <Choice
          primary
          title="Accept this quote"
          detail="Nothing is charged online. We’ll contact you about scheduling and payment."
          busy={busy === 'later'}
          disabled={Boolean(busy)}
          onClick={() => choose('later')}
        />
        <p className="flex items-start gap-2 text-sm text-charcoal/70">
          <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
          <span>By accepting, you agree to the price, the dumpster allowance and the terms above.</span>
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="next-step" className="space-y-4">
      <div>
        <h2 id="next-step" className="text-2xl font-extrabold sm:text-3xl">
          {accepted ? 'Pay your balance' : 'Ready to book?'}
        </h2>
        <p className="mt-2 text-charcoal/80">
          {accepted
            ? `You accepted this quote${quote.accepted_at ? ` on ${michiganDate(quote.accepted_at)}` : ''}. You can pay what’s left here whenever you’re ready.`
            : 'Choose how you’d like to accept. We’ll reach out to confirm your clean-out date.'}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-2xl bg-gold/15 px-4 py-3 font-medium text-charcoal ring-1 ring-gold/40">
          {error}
        </p>
      )}

      <div className="grid gap-3">
        {!accepted && deposit >= 50 && received === 0 && (
          <Choice
            primary
            title={`Accept & pay ${formatCents(deposit)} deposit`}
            detail={`Books your cleanout. The remaining ${formatCents(remaining - deposit)} is due later.`}
            busy={busy === 'deposit'}
            disabled={Boolean(busy)}
            onClick={() => choose('deposit')}
          />
        )}
        {remaining >= 50 && (
          <Choice
            primary={accepted || !(deposit >= 50 && received === 0)}
            title={accepted || received > 0 ? `Pay remaining ${formatCents(remaining)}` : `Accept & pay in full ${formatCents(remaining)}`}
            detail="Pay by card, or over time with Klarna."
            busy={busy === 'full'}
            disabled={Boolean(busy)}
            onClick={() => choose('full')}
          />
        )}
        {!accepted && (
          <Choice
            title="Accept now, pay later"
            detail="Lock in this quote. Pay when we’ve confirmed your date or after the job."
            busy={busy === 'later'}
            disabled={Boolean(busy)}
            onClick={() => choose('later')}
          />
        )}
      </div>

      <p className="flex items-start gap-2 text-sm text-charcoal/70">
        <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
        <span>
          Payments are processed securely by Stripe. Pay by card, or split it into smaller payments with Klarna (subject to
          approval). {!accepted && 'By accepting, you agree to the price, the dumpster allowance and the terms above.'}
        </span>
      </p>
    </section>
  );
}

export default function QuotePage() {
  const [{ token, paid }, setLink] = useState({ token: '', paid: false });
  const [state, setState] = useState({ loading: true });
  const [done, setDone] = useState(null);

  const load = useCallback(async (t) => {
    if (!t) {
      setState({ error: `This quote link looks incomplete. Please use the full link we sent you, or call or text us at ${SITE.phoneDisplay}.` });
      return;
    }
    try {
      const { quote } = await call({ action: 'get', token: t });
      setState({ quote });
    } catch (err) {
      setState({ error: err.message });
    }
  }, []);

  useEffect(() => {
    const link = readLink();
    setLink(link);
    load(link.token);
    const onHash = () => {
      const next = readLink();
      setLink(next);
      setDone(null);
      setState({ loading: true });
      load(next.token);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [load]);

  // Stripe sends people back before its confirmation reaches us, so check again shortly.
  useEffect(() => {
    if (!paid || !token) return undefined;
    const timer = setTimeout(() => load(token), 4000);
    return () => clearTimeout(timer);
  }, [paid, token, load]);

  function accepted(option, result) {
    setDone(option === 'later' ? 'later' : result?.nothing_due ? 'nothing_due' : 'paid');
    load(token);
  }

  return (
    <Shell>
      {state.loading && (
        <p role="status" className="py-20 text-center text-lg text-charcoal/70">
          Loading your quote…
        </p>
      )}
      {state.error && (
        <Notice tone="warn" title="We couldn’t open this quote">
          {state.error}
        </Notice>
      )}
      {state.quote && (
        <div className="space-y-6">
          {paid && (
            <Notice tone="good" title="Thank you! Your payment went through.">
              Stripe will email you a receipt. We’ll be in touch to confirm your cleanout date.
            </Notice>
          )}
          {done === 'later' && (
            <Notice tone="good" title="You’re all set. Your quote is accepted!">
              We’ll reach out soon to confirm your clean-out date.{ONLINE_PAYMENTS ? ' You can come back to this link any time to pay.' : ''}
            </Notice>
          )}
          {done === 'nothing_due' && (
            <Notice tone="good" title="Nothing left to pay">Your quote is accepted and already paid. Thank you!</Notice>
          )}
          {state.quote.quote_message && !paid && !done && state.quote.status !== 'accepted' && (
            <p className="text-lg leading-relaxed text-charcoal/85">{state.quote.quote_message}</p>
          )}
          <QuoteDetails quote={state.quote} />
          {!done && <Actions quote={state.quote} token={token} onAccepted={accepted} />}
          {token === DEMO_TOKEN && (
            <p className="rounded-2xl bg-white px-4 py-3 text-sm text-charcoal/70 ring-1 ring-forest/10">
              This is a sample quote to show how the page works. Nothing is charged.{' '}
              <a
                href="/quote/#demo"
                className="font-semibold text-forest underline underline-offset-4"
                onClick={(e) => {
                  e.preventDefault();
                  resetDemo();
                  window.location.assign(`/quote/?sample=${Date.now()}#demo`);
                }}
              >
                Start the sample over
              </a>
            </p>
          )}
        </div>
      )}
    </Shell>
  );
}
