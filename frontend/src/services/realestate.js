/* Rent logic for buildings, malls and rented units. Pure functions: every amount and date is computed here, in code. */
import { todayStr } from "./biz";

export const CYCLES = { monthly: 1, quarterly: 3, yearly: 12 };
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const mIdx = (s) => +s.slice(0, 4) * 12 + (+s.slice(5, 7) - 1);
export const covers = (l, day) => l.status === "active" && l.start <= day && (!l.end || l.end >= day);

/* monthly rent in force for a period (YYYY-MM): the yearly increase compounds every 12 months from the start date */
export function rentFor(l, period) {
  const years = Math.floor(Math.max(mIdx(period) - mIdx(l.start), 0) / 12);
  return (Number(l.rent) || 0) * Math.pow(1 + (Number(l.increase) || 0) / 100, years);
}
/* is a bill due for this period? (monthly = every month, quarterly = every 3rd month from the start month, yearly = every 12th) */
export function isDue(l, period) {
  if (l.status !== "active") return false;
  const d = mIdx(period) - mIdx(l.start);
  if (d < 0 || (l.end && mIdx(period) > mIdx(l.end))) return false;
  return d % (CYCLES[l.cycle] || 1) === 0;
}
export function getExpiring(biz, days = Number(biz.leaseDays) || 60) {
  const t = todayStr(), lim = new Date(); lim.setDate(lim.getDate() + days);
  return biz.leases.filter((l) => l.status === "active" && l.end && l.end >= t && l.end <= ymd(lim)).sort((a, b) => a.end.localeCompare(b.end));
}
export function unitState(biz, u) {
  if (u.maint) return "maintenance";
  const t = todayStr();
  if (biz.leases.some((l) => l.unitId === u.id && covers(l, t))) return "occupied";
  if (biz.leases.some((l) => l.unitId === u.id && l.status === "active" && l.start > t)) return "reserved";
  return "vacant";
}
