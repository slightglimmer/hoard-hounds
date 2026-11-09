# Planned features (not built, awaiting legal review)

These are recorded so the design is ready, but **nothing here is built or switched on** until the
owner has consulted a Michigan business attorney (see `docs/legal/ATTORNEY_REVIEW_PACKET.md`).

## 1. Signed documents and e-signatures
- Documents per job: service agreement, item-removal authorization, and change orders.
- Customers review and sign on a private link, like the existing quote link.
- What gets stored for each signature (to be confirmed by the attorney):
  - the exact document version and its fingerprint (hash)
  - the signer's typed name and their role (owner, personal representative, landlord…)
  - the date and time
  - consent to sign electronically
  - the IP address (hashed or stored in full, as the attorney advises)
- Signed copies saved as PDFs in a **private** storage bucket, viewable only by the admin. They're never editable after signing; changes need a new change order.
- The final legal wording comes only from the attorney. Templates would be stored as versions, so it's always clear what each customer signed.

## 2. Photo purposes (job documentation vs marketing)
The rule: **no photo is ever used for marketing unless the customer explicitly allows it**, and the
system will be able to prove it.

| Field | Values | Default |
|---|---|---|
| purpose | `quote_request` (sent by the customer), `walkthrough`, `before`, `after`, `keep_item`, `change_order`, `damage` | set when uploaded |
| marketing_consent | `none`, `granted`, `withdrawn` | **`none`** |
| consent record | links to the signed consent (who, when, which photos or which job, any limits such as "no faces or addresses") | — |

- Current state (already true today): photos customers send are private and only viewable by the admin. There's no public photo gallery, and nothing in the website or dashboard publishes customer photos.
- Planned: any future "use on website or social media" feature would only show photos where `marketing_consent = granted`, and withdrawing consent would hide them.

## 3. Record retention (once approved)
- A monthly reminder in the dashboard: "N quote requests are older than 12 months and never became jobs. Delete them and their photos?" Deletion is manual, with a confirmation.
- Completed jobs: kept for 7 years, then flagged for review rather than deleted automatically.
