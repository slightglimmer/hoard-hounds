import { createPortal } from 'react-dom';
import { LogoMark } from '../../../components/Logo.jsx';
import { SITE } from '../../../config/site.js';
import { formatDate } from '../../lib/dates.js';
import { formatCents } from '../../lib/money.js';
import { allowanceLines, computeTotals, lineCents, minimumApplies, quantityLabel } from '../../lib/estimate.js';

// The customer-facing estimate, in the Hoard Hounds brand colors. It's hidden on
// screen and is the only thing that prints (see .print-doc in admin.css).
export default function EstimateDocument({ estimate }) {
  const { subtotal, discount, total } = computeTotals(estimate.line_items, estimate.discount_type, estimate.discount_value);
  const deposit = Math.round(Number(estimate.deposit_amount || 0) * 100);

  return createPortal(
    <article className="print-doc hidden font-sans text-[#292929]">
      <header className="flex items-start justify-between gap-6 border-b-4 border-[#243b32] pb-5">
        <div className="flex items-center gap-3">
          <LogoMark className="h-16 w-16" />
          <div>
            <p className="font-display text-2xl font-bold tracking-wide text-[#243b32]">HOARD HOUNDS</p>
            <p className="text-xs font-semibold tracking-[0.2em] text-[#243b32]/70 uppercase">Property Cleanouts &amp; Junk Removal</p>
            <p className="mt-1 text-sm">
              {SITE.city}, {SITE.state} · {SITE.phoneDisplay} · {SITE.email}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl font-bold text-[#243b32]">Estimate</p>
          {estimate.number && <p className="text-sm font-semibold">#{estimate.number}</p>}
          <p className="mt-1 text-sm">Date: {formatDate(estimate.estimate_date)}</p>
          {estimate.valid_until && <p className="text-sm">Valid until: {formatDate(estimate.valid_until)}</p>}
        </div>
      </header>

      <section className="mt-6">
        <p className="text-xs font-bold tracking-[0.18em] text-[#243b32]/70 uppercase">Prepared for</p>
        <p className="mt-1 text-lg font-semibold">{estimate.customer_name}</p>
        {estimate.property_address && <p>{estimate.property_address}</p>}
        {(estimate.customer_phone || estimate.customer_email) && (
          <p className="text-sm">{[estimate.customer_phone, estimate.customer_email].filter(Boolean).join(' · ')}</p>
        )}
      </section>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[#243b32] text-left text-white">
            <th className="px-3 py-2 font-semibold">Service</th>
            <th className="px-3 py-2 text-right font-semibold">Qty</th>
            <th className="px-3 py-2 text-right font-semibold">Price</th>
            <th className="px-3 py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {estimate.line_items.map((it, i) => {
            const amount = lineCents(it);
            const minimumApplied = minimumApplies(it);
            return (
              <tr key={i} className="border-b border-[#243b32]/15 align-top">
                <td className="px-3 py-2.5">
                  <span className="font-semibold">{it.name}</span>
                  {it.description && <span className="block text-xs text-[#292929]/70">{it.description}</span>}
                  {minimumApplied && <span className="block text-xs text-[#292929]/70">Minimum charge applies</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{quantityLabel(it.unit, it.quantity)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatCents(Math.round(Number(it.unit_price) * 100))}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatCents(amount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 ml-auto w-72 space-y-1 text-sm tabular-nums">
        {discount > 0 && (
          <>
            <p className="flex justify-between"><span>Subtotal</span><span>{formatCents(subtotal)}</span></p>
            <p className="flex justify-between">
              <span>Discount{estimate.discount_type === 'percent' ? ` (${Number(estimate.discount_value)}%)` : ''}</span>
              <span>−{formatCents(discount)}</span>
            </p>
          </>
        )}
        <p className="flex justify-between border-t-2 border-[#243b32] pt-2 text-lg font-bold text-[#243b32]">
          <span>Estimated total</span>
          <span>{formatCents(total)}</span>
        </p>
        {deposit > 0 && (
          <>
            <p className="flex justify-between font-semibold"><span>Deposit to book</span><span>{formatCents(deposit)}</span></p>
            <p className="flex justify-between"><span>Balance after deposit</span><span>{formatCents(Math.max(0, total - deposit))}</span></p>
            <p className="text-right text-xs text-[#292929]/70">The deposit is credited toward the total.</p>
          </>
        )}
      </div>

      {estimate.scope_of_work && (
        <section className="mt-6">
          <p className="text-xs font-bold tracking-[0.18em] text-[#243b32]/70 uppercase">Scope of work</p>
          <p className="mt-1 whitespace-pre-line">{estimate.scope_of_work}</p>
        </section>
      )}
      {allowanceLines(estimate).length > 0 && (
        <section className="mt-6">
          <p className="text-xs font-bold tracking-[0.18em] text-[#243b32]/70 uppercase">Dumpster allowance</p>
          <ul className="mt-1 list-disc pl-5">
            {allowanceLines(estimate).map((l) => <li key={l}>{l}</li>)}
          </ul>
        </section>
      )}
      {estimate.overage_terms && <p className="mt-3 text-sm whitespace-pre-line">{estimate.overage_terms}</p>}

      {estimate.notes && (
        <section className="mt-6">
          <p className="text-xs font-bold tracking-[0.18em] text-[#243b32]/70 uppercase">Notes</p>
          <p className="mt-1 whitespace-pre-line">{estimate.notes}</p>
        </section>
      )}
      {estimate.terms && <p className="mt-6 text-xs whitespace-pre-line text-[#292929]/75">{estimate.terms}</p>}

      <footer className="mt-10 border-t border-[#243b32]/20 pt-3 text-center text-xs text-[#292929]/70">
        {SITE.legalName} · {SITE.tagline} · {SITE.url.replace(/^https?:\/\//, '')}
      </footer>
    </article>,
    document.body,
  );
}
