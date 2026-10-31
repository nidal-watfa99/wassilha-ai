/* Wholesale distribution logic: batches (first-expiry-first-out), price tiers, payment allocation. Pure functions. */
import { todayStr } from "./biz";
import { addDays } from "./hotel";

/* take `qty` from unexpired batches, earliest expiry first. `rest` is what batches could not cover (unbatched stock) */
export function allocate(batches, invId, qty, today = todayStr()) {
  const live = batches.filter((b) => b.invId === invId && b.remaining > 0 && (!b.expiry || b.expiry >= today)).sort((a, b) => (a.expiry || "9999").localeCompare(b.expiry || "9999"));
  let need = qty; const used = [];
  for (const b of live) { if (need <= 1e-9) break; const take = Math.min(b.remaining, need); used.push({ batchId: b.id, lot: b.lot, expiry: b.expiry, qty: take }); need -= take; }
  return { used, rest: Math.max(need, 0) };
}
export const batchState = (b, days, today = todayStr()) => (!b.expiry ? "ok" : b.expiry < today ? "expired" : b.expiry <= addDays(today, days) ? "soon" : "ok");
export const getExpiring = (biz) => biz.batches.filter((b) => b.remaining > 0 && batchState(b, Number(biz.expiryDays) || 90) !== "ok").sort((a, b) => a.expiry.localeCompare(b.expiry));

/* tier price: retail = price, wholesale = priceW, distributor = priceD; falls back to retail when a tier price is empty */
export const tierPrice = (it, tier) => { const v = tier === "wholesale" ? it.priceW : tier === "distributor" ? it.priceD : it.price; return Number(v) > 0 ? Number(v) : Number(it.price) || 0; };

/* a payment from a customer settles the oldest unpaid invoices first */
export function collectPlan(invoices, amount) {
  let left = amount; const plan = [];
  [...invoices].sort((a, b) => (a.issueDate || "").localeCompare(b.issueDate || "")).forEach((i) => {
    const owed = Math.max(i.total - i.paid, 0); if (left <= 1e-9 || owed <= 1e-9) return;
    const pay = Math.min(owed, left); plan.push({ id: i.id, pay }); left -= pay;
  });
  return { plan, unallocated: Math.max(left, 0) };
}
