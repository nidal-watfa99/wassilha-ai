/* Monthly bills, payroll payments and supplier accounts. Pure functions: dates and amounts are computed here, in code. */
import { toMain, payroll } from "./biz";

const dueDate = (tpl, p) => `${p}-${String(Math.min(Math.max(Number(tpl.dueDay) || 1, 1), 28)).padStart(2, "0")}`;
/* a recurring bill (electricity, internet, rent…) for the month of `today`: paid when an expense carries its id and period */
export function billStatus(biz, tpl, today) {
  const p = today.slice(0, 7), due = dueDate(tpl, p), paid = biz.expenses.some((e) => e.templateId === tpl.id && e.period === p);
  return { paid, due, overdue: !paid && today > due, dueToday: !paid && today === due };
}
export const dueBills = (biz, today) => biz.recurring.filter((t) => { const s = billStatus(biz, t, today); return !s.paid && today >= s.due; });

/* each employee's net pay for a month and whether it has already been paid (employees' pay may be in another currency: `main` is null without a rate) */
export const payrollRows = (biz, period) => biz.employees.filter((e) => e.status !== "ended").map((e) => {
  const net = payroll(e).net;
  return { e, net, main: toMain(biz, net, e.currency), paid: biz.expenses.some((x) => x.empId === e.id && x.period === period) };
});

/* what we bought from a supplier and what is still owed to it (purchase totals are in the main currency through the saved rate) */
export function supplierStats(biz, name) {
  const mine = biz.purchases.filter((p) => (p.supplier || "").trim().toLowerCase() === name.trim().toLowerCase());
  const total = (p) => p.lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0) * (Number(p.rate) || 1);
  const sum = mine.reduce((a, p) => a + total(p), 0), paid = mine.reduce((a, p) => a + (Number(p.paid) || 0), 0);
  return { n: mine.length, total: sum, paid, left: Math.max(sum - paid, 0), last: mine.map((p) => p.date).sort().pop() || "" };
}
