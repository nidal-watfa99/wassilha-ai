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
  const sub = o.lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0), service = sub * ((Number(o.service) || 0) / 100);
  const delivery = o.type === "deliv" ? Number(o.deliveryFee) || 0 : 0, deposit = Number(o.deposit) || 0;
  const items = [...o.lines.map((l) => ({ desc: l.name, qty: l.qty, price: l.price })), ...(service > 0 ? [{ desc: "Service", qty: 1, price: service }] : []), ...(delivery > 0 ? [{ desc: "Delivery", qty: 1, price: delivery }] : [])];
  const tt = totals({ items, discount: o.discount, tax: o.tax });
  return { ...tt, sub, service, delivery, items, deposit, due: Math.max(tt.total - deposit, 0) };   // sub = dishes only, so the statement rows add up
};

/* Free-text order ("2 شاورما، بيبسي x3، 1 فلافل") -> [{ item | null, name, qty }]. Matches menu names loosely; unknown names stay custom lines. */
const norm = (x) => String(x || "").replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).toLowerCase().replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();
export function parseOrderText(text, menu) {
  const out = [];
  String(text || "").split(/[\n,،؛;+]+/).map(norm).filter(Boolean).forEach((seg) => {
    let qty = 1, name = seg, m;
    if ((m = seg.match(/^(\d+(?:[.,]\d+)?)\s*[x×*]?\s*(.+)$/))) { qty = parseFloat(m[1].replace(",", ".")); name = m[2]; }
    else if ((m = seg.match(/^(.+?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)$/))) { name = m[1]; qty = parseFloat(m[2].replace(",", ".")); }
    else if ((m = seg.match(/^(.+?)\s+(\d+)$/))) { name = m[1]; qty = +m[2]; }
    let best = null, score = 0;
    menu.forEach((it) => { const n = norm(it.name); if (n && (n.includes(name) || name.includes(n))) { const sc = Math.min(n.length, name.length); if (sc > score) { score = sc; best = it; } } });
    out.push({ item: score >= 2 ? best : null, name, qty: qty > 0 ? qty : 1 });
  });
  return out;
}
