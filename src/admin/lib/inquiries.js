// Labels for website requests (inquiries). Values match the database.

export const INQUIRY_STATUSES = [
  { value: 'new', label: 'New', className: 'bg-rose-deep text-white' },
  { value: 'reviewing', label: 'Reviewing', className: 'bg-gold/20 text-gold-deep' },
  { value: 'quoted', label: 'Quoted', className: 'bg-blush text-rose-ink' },
  { value: 'won', label: 'Won', className: 'bg-sage/25 text-sage-deep' },
  { value: 'lost', label: 'Lost', className: 'bg-line text-muted' },
];
export const inquiryStatus = (v) => INQUIRY_STATUSES.find((s) => s.value === v) ?? INQUIRY_STATUSES[0];

export const DETAIL_LABELS = {
  property_type: ['Property', { house: 'House', condo: 'Condo or apartment', multi_unit: 'Duplex or multi-unit', mobile_home: 'Mobile home', commercial: 'Commercial', other: 'Other' }],
  occupancy: ['Living there?', { occupied: 'Occupied', vacant: 'Vacant' }],
  rooms: ['Rooms or areas', { '1-2': '1–2', '3-4': '3–4', '5-7': '5–7', '8+': '8 or more' }],
  volume: ['How full', { light: 'Light', moderate: 'Moderate', heavy: 'Heavy', not_sure: 'Not sure' }],
  access: ['Stairs', { ground: 'Mostly ground level', stairs: 'Stairs', elevator: 'Elevator', not_sure: 'Not sure' }],
  driveway: ['Dumpster spot', { yes: 'Driveway available', street_only: 'Street only (permit may be needed)', shared_or_limited: 'Shared or limited', not_sure: 'Not sure' }],
};

// [{ label, value }] for the optional details the customer filled in.
export function inquiryDetails(inquiry) {
  return Object.entries(DETAIL_LABELS)
    .filter(([key]) => inquiry[key])
    .map(([key, [label, values]]) => ({ key, label, value: values[inquiry[key]] ?? inquiry[key] }));
}

// "2 hours ago", "Yesterday", "Nov 3"
export function receivedLabel(iso, now = new Date()) {
  const then = new Date(iso);
  const mins = Math.round((now - then) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(then.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
