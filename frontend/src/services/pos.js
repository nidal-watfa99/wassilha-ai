/* Counter sales, services, generated items and barcodes. Pure functions: every amount is computed here, in code. */
import { convert } from "./units";
import { stockLeft, getLow } from "./biz";
import { allocate } from "./distribution";

export const unitK = (it, unit) => (unit && it.unit && unit !== it.unit ? convert(1, unit, it.unit) || 1 : 1);   // item-units in one line-unit

/* stock a sale consumes: items directly, services through the paper/ink they use. {inventoryId: qty in the item's own unit} */
export function lineNeeds(lines, biz) {
  const m = {}, add = (id, q) => { if (id && q > 0) m[id] = (m[id] || 0) + q; };
  lines.forEach((l) => {
    const qty = Number(l.qty) || 0;
    if (l.kind === "item") { const it = biz.inventory.find((i) => i.id === l.invId); if (it) add(it.id, qty * unitK(it, l.unit)); }
    if (l.kind === "service") (biz.services.find((s) => s.id === l.svcId)?.uses || []).forEach((u) => { const it = biz.inventory.find((i) => i.id === u.invId); if (it) add(it.id, qty * (Number(u.qty) || 0) * unitK(it, u.unit)); });
  });
  return m;
}
/* what the sale costs the shop, in the main currency. Pass-through services (top-up, bill payment) cost the amount minus the shop's commission. */
export function saleCost(lines, biz, fx = 1) {
  let cost = 0;
  lines.forEach((l) => {
    const qty = Number(l.qty) || 0;
    if (l.kind === "item") { const it = biz.inventory.find((i) => i.id === l.invId); if (it) cost += qty * unitK(it, l.unit) * (Number(it.cost) || 0); }
    if (l.kind === "service") {
      const s = biz.services.find((x) => x.id === l.svcId); if (!s) return;
      if (s.mode === "amount") cost += (Number(l.price) || 0) * qty * fx * (1 - (Number(s.commission) || 0) / 100);
      else cost += qty * (Number(s.cost) || 0);
      (s.uses || []).forEach((u) => { const it = biz.inventory.find((i) => i.id === u.invId); if (it) cost += qty * (Number(u.qty) || 0) * unitK(it, u.unit) * (Number(it.cost) || 0); });
    }
  });
  return cost;
}
/* take stock out of the shelves (earliest-expiry batches first) */
export function takeStock(s, need) {
  let batches = s.batches;
  const inventory = s.inventory.map((i) => {
    if (!need[i.id]) return i;
    const { used } = allocate(batches, i.id, need[i.id]);
    batches = batches.map((b) => { const u = used.find((x) => x.batchId === b.id); return u ? { ...b, remaining: +(b.remaining - u.qty).toFixed(6) } : b; });
    return { ...i, qtyOut: (Number(i.qtyOut) || 0) + need[i.id] };
  });
  return { ...s, inventory, batches };
}

/* ---------- EAN-13 (in-store codes start with 20; they are not registered GS1 codes) ---------- */
export const ean13Check = (d12) => (10 - (d12.split("").reduce((a, c, i) => a + +c * (i % 2 ? 3 : 1), 0) % 10)) % 10;
export const ean13 = (seq, prefix = "20") => { const d = prefix + String(seq).padStart(12 - prefix.length, "0"); return d + ean13Check(d); };
const Lc = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const Gc = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const Rc = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PAR = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
export const ean13Bits = (c) => "101" + PAR[+c[0]].split("").map((k, i) => (k === "L" ? Lc : Gc)[+c[i + 1]]).join("") + "01010" + c.slice(7).split("").map((d) => Rc[+d]).join("") + "101";
export function ean13Svg(c, w = 190, h = 60) {
  const bits = ean13Bits(c), m = w / 95; let r = "", i = 0;
  while (i < 95) { if (bits[i] === "1") { let j = i; while (j < 95 && bits[j] === "1") j++; r += `<rect x="${(i * m).toFixed(2)}" y="0" width="${((j - i) * m).toFixed(2)}" height="${h}"/>`; i = j; } else i++; }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h + 14}" width="${w}" height="${h + 14}"><g fill="#000">${r}</g><text x="${w / 2}" y="${h + 12}" font-size="11" text-anchor="middle" font-family="monospace">${c}</text></svg>`;
}

/* ---------- generated items: every combination of the attribute values ---------- */
export function generateVariants(base, attrs) {
  const live = attrs.map((a) => ({ name: a.name.trim(), values: String(a.values).split(/[,،\n]+/).map((v) => v.trim()).filter(Boolean) })).filter((a) => a.name && a.values.length);
  let combos = [[]];
  live.forEach((a) => { combos = combos.flatMap((c) => a.values.map((v) => [...c, { label: a.name, value: v }])); });
  return combos.map((c) => ({ name: [base.trim(), ...c.map((x) => x.value)].join(" "), attrs: c }));
}

/* items to buy again, grouped by the supplier of the last purchase */
export function reorderPlan(biz) {
  const lastBy = {};
  biz.purchases.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((p) => p.lines.forEach((l) => { lastBy[l.invId] = { supplier: p.supplier || "", price: l.price, cur: p.currency, date: p.date }; }));
  const groups = {};
  getLow(biz).forEach((i) => {
    const left = stockLeft(i), min = Number(i.minQty) || 0, max = Number(i.maxQty) || 0, re = Number(i.reorderQty) || 0;
    const qty = re > 0 ? re : max > 0 ? Math.max(max - left, 0) : Math.max(min * 2 - left, 1);
    const sup = lastBy[i.id]?.supplier || i.supplier || "";
    (groups[sup] = groups[sup] || []).push({ item: i, left, qty, last: lastBy[i.id] || null });
  });
  return groups;
}
