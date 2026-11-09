/* Agencies: contracts with principals, import shipments with landed cost, targets and rebates. Pure functions: every amount is computed here, in code. */
import { stockLeft, uid } from "./biz";
import { unitK } from "./pos";

export const fxFor = (biz, cur, fx) => (!cur || cur === biz.currency ? 1 : Number(fx) || biz.rates[cur] || 0);   // 0 = no exchange rate known
export const COST_CAT = { freight: "transport", customs: "taxes", insurance: "insurance", clearing: "fees", other: "other" };

/* landed cost: goods + freight, insurance, customs, clearing… shared across the lines by value (or by quantity in the items' own units) */
export function landed(s, biz) {
  const fx = fxFor(biz, s.currency, s.fx);
  const lines = s.lines.map((l) => { const it = biz.inventory.find((i) => i.id === l.invId); return { ...l, qItem: (Number(l.qty) || 0) * (it ? unitK(it, l.unit) : 1), value: (Number(l.qty) || 0) * (Number(l.price) || 0) * fx }; });
  const goods = lines.reduce((a, l) => a + l.value, 0), costs = (s.costs || []).reduce((a, c) => a + (Number(c.amount) || 0) * fxFor(biz, c.currency, c.fx), 0);
  const w = lines.map((l) => (s.basis === "qty" ? l.qItem : l.value)), ws = w.reduce((a, b) => a + b, 0) || 1;
  return { fx, goods, costs, total: goods + costs, lines: lines.map((l, i) => { const share = w[i] / ws, total = l.value + costs * share; return { ...l, share, landed: total, landedUnit: l.qItem > 0 ? total / l.qItem : 0 }; }) };
}
/* receiving a shipment: stock in, weighted-average cost from the LANDED unit cost, batches for lots/expiry, and the freight/customs paid recorded as expenses */
export function applyReceive(state, s, today) {
  const L = landed(s, state), batches = [...state.batches];
  const inventory = state.inventory.map((it) => {
    const mine = L.lines.filter((l) => l.invId === it.id && l.qItem > 0); if (!mine.length) return it;
    let left = Math.max(stockLeft(it), 0), cost = Number(it.cost) || 0, add = 0;
    mine.forEach((l) => {
      cost = left + l.qItem > 0 ? (left * cost + l.qItem * l.landedUnit) / (left + l.qItem) : l.landedUnit; left += l.qItem; add += l.qItem;
      if (l.lot || l.expiry) batches.push({ id: uid(), invId: it.id, lot: l.lot || "", expiry: l.expiry || "", qty: +l.qItem.toFixed(6), remaining: +l.qItem.toFixed(6), shipmentId: s.id, date: today });
    });
    return { ...it, qtyIn: (Number(it.qtyIn) || 0) + add, cost: +cost.toFixed(6) };
  });
  const expenses = (s.costs || []).filter((c) => Number(c.amount) > 0).map((c) => { const r = fxFor(state, c.currency, c.fx); return { id: uid(), date: today, category: COST_CAT[c.type] || "other", amount: Number(c.amount), currency: c.currency || state.currency, rate: r, amountMain: +(Number(c.amount) * r).toFixed(6), payee: c.label || "", method: "cash", branch: "", note: s.no, shipmentId: s.id, media: [] }; });
  return { ...state, inventory, batches, expenses: [...state.expenses, ...expenses] };
}
export const goodsOwed = (s) => { const g = s.lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0), paid = (s.payments || []).reduce((a, p) => a + (Number(p.amount) || 0), 0); return { goods: g, paid, left: Math.max(g - paid, 0) }; };

/* sales of a brand in a period, from confirmed distribution orders (main currency) */
export function brandSales(biz, brand, from, to) {
  const b = brand.trim().toLowerCase();
  return biz.dorders.filter((o) => o.status !== "draft" && o.date >= from && o.date <= to).reduce((sum, o) => {
    const fx = (o.currency || biz.currency) === biz.currency ? 1 : Number(o.fx) || biz.rates[o.currency] || 0;
    return sum + o.lines.reduce((a, l) => { const it = biz.inventory.find((i) => i.id === l.invId); return it && (it.brand || "").trim().toLowerCase() === b ? a + (Number(l.qty) || 0) * (Number(l.price) || 0) * fx : a; }, 0);
  }, 0);
}
export const brandStock = (biz, brand) => biz.inventory.filter((i) => (i.brand || "").trim().toLowerCase() === brand.trim().toLowerCase()).reduce((a, i) => a + Math.max(stockLeft(i), 0) * (Number(i.cost) || 0), 0);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const contractState = (a, today, days = 90) => { if (a.end && a.end < today) return "expired"; if (a.end) { const lim = new Date(today + "T00:00:00"); lim.setDate(lim.getDate() + days); if (a.end <= ymd(lim)) return "soon"; } return "active"; };
export const endingContracts = (biz, today) => biz.agencies.filter((a) => contractState(a, today) === "soon");
