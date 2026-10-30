/* Generic costing for ANY business: a product/dish/service = ingredients from inventory (+ extra cost). Money is computed here, in code. */
import { convert } from "./units";
import { totals } from "./biz";

const qtyIn = (r, it) => (r.unit && it.unit && r.unit !== it.unit ? convert(r.qty, r.unit, it.unit) : Number(r.qty) || 0);
/* the recipe of a product; old single-link items (invId + invQty) count as a one-line recipe */
export const usageOf = (p) => (p.recipe?.length ? p.recipe : p.invId && Number(p.invQty) > 0 ? [{ invId: p.invId, qty: Number(p.invQty), unit: "" }] : []);

export function recipeCost(recipe, inventory) {
  let cost = 0, missing = 0;
  const lines = (recipe || []).map((r) => {
    const it = inventory.find((i) => i.id === r.invId), q = it ? qtyIn(r, it) : null;
    if (!it || q == null) { missing++; return { ...r, name: it?.name || "?", cost: 0 }; }
    const c = q * (Number(it.cost) || 0); cost += c; return { ...r, name: it.name, cost: c };
  });
  return { cost, lines, missing };
}
export const productCost = (p, biz) => {
  const u = usageOf(p);
  return u.length ? recipeCost(u, biz.inventory).cost + (Number(p.extraCost) || 0) : (Number(p.cost) || 0) + (Number(p.extraCost) || 0);
};
export const marginOf = (price, cost) => ({ amount: (Number(price) || 0) - cost, pct: Number(price) > 0 ? (((Number(price) || 0) - cost) / Number(price)) * 100 : 0 });
/* {inventoryId: quantity in the inventory item's own unit} consumed by selling `servings` of product p */
export function usageMap(p, servings, inventory) {
  const m = {};
  usageOf(p).forEach((r) => { const it = inventory.find((i) => i.id === r.invId); const q = it ? qtyIn(r, it) : null; if (q != null) m[r.invId] = (m[r.invId] || 0) + q * servings; });
  return m;
}

/* one restaurant order -> every amount (service and delivery are extra lines; discount and tax follow invoice rules) */
export const orderCalc = (o) => {
  const sub = o.lines.reduce((a, l) => a + l.qty * l.price, 0), service = sub * ((Number(o.service) || 0) / 100);
  const delivery = o.type === "deliv" ? Number(o.deliveryFee) || 0 : 0, deposit = Number(o.deposit) || 0;
  const items = [...o.lines.map((l) => ({ desc: l.name, qty: l.qty, price: l.price })), ...(service > 0 ? [{ desc: "Service", qty: 1, price: service }] : []), ...(delivery > 0 ? [{ desc: "Delivery", qty: 1, price: delivery }] : [])];
  const tt = totals({ items, discount: o.discount, tax: o.tax });
  return { ...tt, sub, service, delivery, items, deposit, due: Math.max(tt.total - deposit, 0) };   // sub = dishes only, so the statement rows add up
};
