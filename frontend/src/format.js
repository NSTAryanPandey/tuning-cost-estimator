// Indian number formatting: 152500 -> "₹1,52,500"
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export const rupees = (n) => inr.format(Math.round(n));
export const range = (r) => (r.min === r.max ? rupees(r.min) : `${rupees(r.min)} – ${rupees(r.max)}`);
export const mid = (r) => (r.min + r.max) / 2;
const n = (x) => (Math.abs(x) < 50 && !Number.isInteger(x) ? x.toFixed(1) : `${Math.round(x)}`);   // 8.6 hp, 160 hp
export const num = (r) => (r.min === r.max ? n(r.min) : `${n(r.min)}–${n(r.max)}`);
export const years = (v) => `${v.year_from}–${v.year_to ?? 'present'}`;
