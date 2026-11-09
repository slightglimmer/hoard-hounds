# Hoard Hounds LLC — Attorney Review Packet

> **For a Michigan business attorney. Prepared by the owner's software assistant, not a lawyer.**
> Nothing here is legal advice or final legal wording. The outlines below describe what the
> business wants each document to *do*, so the attorney can draft or correct the actual language.
> No legal document has been published or shown to customers.

**Attached drafts (starting points only):**
- `privacy-policy-DRAFT.md` (Draft 3)
- `customer-service-agreement-DRAFT.md` (Draft 2)

---

## 1. About the business

| | |
|---|---|
| Entity | Hoard Hounds LLC, based in Redford, Michigan. Serves Metro Detroit (Wayne and Oakland counties). |
| Services | Whole-property and estate clean-outs; hoarding-related clean-outs; pre-sale and real estate clean-outs; vacant and abandoned property; tenant move-outs; large garage, basement and attic clean-outs; sorting and organizing that goes with a clean-out. |
| Not offered | Single-item pickups, deep cleaning, hazardous waste, mold, asbestos or biohazard remediation, demolition. |
| How disposal works | Hoard Hounds arranges a roll-off dumpster from a **third-party rental company**. Hoard Hounds' crew sorts and loads it, and the rental company hauls it away and disposes of the contents. Hoard Hounds does not own trucks or dumpsters. |
| Customers | Homeowners, families and estate representatives, real estate agents, investors, landlords, property managers. |
| Crew | Employees and/or approved workers. **[Owner to tell the attorney: W-2, 1099, or both.]** |
| Insurance | **[Owner to tell the attorney what coverage exists, if any.]** The website and drafts make **no** insurance, license or guarantee claims. |
| Pricing | Written quote per job, including labor, dumpster rental and disposal up to a stated allowance. |
| Deposits | Usually about the dumpster rental cost, credited toward the total. |
| Extra dumpster charges | Overweight, extra days, prohibited items: passed through at the provider's **actual cost, no added fee**, only with the customer's approval, with the provider's documentation. Never charged automatically. |
| Online payments | Built (Stripe, test mode) but **switched off** until approved. |
| Customer data | Website quote requests (name, contact, address, job details). The business wants to add customer-uploaded photos, stored privately in a secured dashboard (Supabase). Currently requests go to Formspree and the owner's email. |

---

## 2. Documents requested

### A. Customer Service Agreement
Should cover: scope of work, pricing, deposits and final balance, cancellations and rescheduling, dumpster placement and permits, driveway and surface damage, overage fees (at cost, approval required), items that can't be accepted, access, safety stop-work rights, limits of responsibility, dispute resolution.

**Questions for the attorney**
1. How should responsibility for driveway and surface damage be divided between the customer, Hoard Hounds and the dumpster company?
2. What limitation-of-liability language is enforceable in Michigan for a small service business, given our actual insurance?
3. Deposit refund rules: what's fair and enforceable if the dumpster has already been ordered?
4. Should the agreement name the dumpster company, or refer to "a third-party provider"?
5. Any consumer-protection or home-solicitation rules that apply, such as cancellation rights for contracts signed at the customer's home?

### B. Item-Removal Authorization (form or checklist)
The goal: before work starts, a signed, specific record of what may be removed and what must stay.

**Proposed structure (for the attorney to turn into proper wording)**
1. Property address, job number, date, customer name and their role (owner / personal representative / landlord / agent / other).
2. **Areas included** (checkboxes per room or area) and **areas excluded / do not enter**.
3. **Keep: do not remove** list (free text, plus photos), for example "dining set, everything in the hall closet, all papers in the desk."
4. **Donate** list, and who arranges the donation.
5. **Dispose** list, or "everything else in the included areas."
6. A standard "**if found, set aside and ask**" list: cash, jewelry, firearms or ammunition, medications, documents (IDs, deeds, titles, wills, bank and tax papers), photographs and albums, keys, electronics with personal data, items that look valuable or sentimental.
7. Customer statement that they've removed or clearly marked what they want to keep, and that items not listed may be discarded.
8. Signature, printed name, date. Optional witness.

**Questions**
1. Does this belong inside the service agreement, or as a separate signed document per job? (The owner would like a separate one.)
2. What should happen to items found that weren't on any list, such as cash or a firearm?
3. How long should signed authorizations be kept?

### C. Documenting customer approval before work begins
**Proposed process**
1. Walkthrough (in person or by video), with **"before" photos of each area**.
2. Customer reviews the quote and signs the service agreement and the item-removal authorization.
3. Photos of "keep" items and any tagged areas, attached to the signed authorization.
4. Crew lead confirms on site before loading the first item.
5. "After" photos when finished, with the customer's sign-off.

**Questions**
1. Is this enough documentation if there's a later dispute ("you threw away my…")?
2. Should the customer initial each photo or list, or is one signature over the attached photos enough?

### D. Change orders
**Proposed process:** if work changes (more items, new areas, hazards found, extra dumpster), the crew **stops** that part of the work, explains the change and the new price, and gets the customer's **written approval** (text, email or signed form) before continuing. The change order lists what's added, the price change, and any new keep or dispose instructions.

**Questions**
1. Is a text-message or email approval enough, or should change orders be signed?
2. What if the customer can't be reached and the job must continue?

### E. Ownership and authority to dispose
The business often deals with people who are not the sole owner of the belongings.

**Questions**
1. **Estates:** what proof should we require before clearing a deceased person's home (for example letters of authority from a Michigan probate court, or a small-estate affidavit)? What if family members disagree?
2. **Tenant move-outs, evictions and abandoned property:** what must a landlord do under Michigan law before tenant belongings can be removed and disposed of? What should the landlord confirm to us in writing?
3. **Hoarding clean-outs** where the occupant isn't the owner, or where a guardian, conservator or power of attorney is involved.
4. **Bank-owned, investor or property-manager jobs:** what authority documents should we ask for?
5. Should the customer **indemnify** Hoard Hounds if they didn't actually have authority?

### F. Privacy, photo consent and record retention
- Proposed retention: quote requests that don't become jobs, and their photos, are deleted after **12 months**. Completed job records and photos are kept for **7 years**.
- Photos are used for quoting and job documentation. **Marketing use (website, social media) only with separate, explicit written consent**, which can be withdrawn. Default: no marketing use.

**Questions**
1. Do the retention periods meet Michigan and federal requirements (tax, employment, contracts)?
2. What should photo-consent language say? Should it cover images of personal belongings, documents or people that appear in photos?
3. Does the privacy policy need anything specific for Michigan, or for out-of-state customers (for example family members of an estate who live elsewhere)?
4. Text-message consent (TCPA): is the current form checkbox ("I agree to be contacted by phone, text or email about my estimate") sufficient?

### G. Electronic signatures (planned, not built)
The owner would like customers to review and sign documents on the website, with signed copies stored in the private dashboard.

**Questions**
1. Is an electronic signature through our own website valid for these documents under Michigan's Uniform Electronic Transactions Act and the federal E-SIGN Act? What must we capture (consent to sign electronically, name, date and time, IP address, the exact document version)?
2. Should we use a dedicated e-signature service instead?

---

## 3. Other questions worth raising
- Business licenses or registrations needed in Redford and the cities we serve.
- Whether Michigan sales or use tax applies to any part of the service. (Our current understanding is that most services aren't taxed. Please confirm for dumpster pass-through charges.)
- Worker classification (employees vs contractors) and the documents needed (W-9, agreements).
- Safety: the stop-work policy for needles, biohazards, structural hazards.
- Recommended insurance types and limits before taking jobs (general liability, workers' compensation, commercial auto).
- Website terms of use, and whether the privacy policy needs updating when online payments are switched on.
