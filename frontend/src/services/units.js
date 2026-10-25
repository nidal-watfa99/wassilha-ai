/* Units of measure. Conversion only inside one group with a numeric factor; packaging units (box, carton…) never convert. */
const G = {
  mass: { t: [1000, "طن", "tonne"], kg: [1, "كغ", "kg"], g: [0.001, "غرام", "g"], mg: [1e-6, "ملغ", "mg"] },
  volume: { m3: [1000, "متر مكعب", "m³"], l: [1, "لتر", "L"], ml: [0.001, "ملليلتر", "mL"] },
  length: { km: [1000, "كم", "km"], m: [1, "متر", "m"], cm: [0.01, "سم", "cm"], mm: [0.001, "مم", "mm"] },
  area: { m2: [1, "متر مربع", "m²"] },
  count: { pcs: [1, "قطعة", "pcs"], dozen: [12, "دزينة", "dozen"] },
  pack: { box: [null, "صندوق", "box"], carton: [null, "كرتون", "carton"], pack: [null, "عبوة", "pack"], bag: [null, "كيس", "bag"], roll: [null, "رول", "roll"] },
};
export const GROUP_NAMES = { mass: ["الوزن", "Weight"], volume: ["الحجم", "Volume"], length: ["الطول", "Length"], area: ["المساحة", "Area"], count: ["العدّ", "Count"], pack: ["التعبئة", "Packaging"] };
export const UNITS = Object.fromEntries(Object.entries(G).flatMap(([g, u]) => Object.entries(u).map(([c, [f, ar, en]]) => [c, { group: g, f, ar, en }])));
export const GROUPS = Object.fromEntries(Object.entries(G).map(([g, u]) => [g, Object.keys(u)]));
export const unitLabel = (c, locale) => (UNITS[c] ? UNITS[c][locale === "ar" ? "ar" : "en"] : c || "");
export function convert(v, a, b) {
  if (a === b) return Number(v);
  const A = UNITS[a], B = UNITS[b];
  if (!A || !B || A.group !== B.group || A.f == null || B.f == null) return null;
  return +((Number(v) * A.f) / B.f).toPrecision(12);
}
export const compatible = (c) => (UNITS[c] && UNITS[c].f != null ? GROUPS[UNITS[c].group] : c ? [c] : []);
