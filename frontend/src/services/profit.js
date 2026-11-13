/* Net profit statement for a period. Pure function: every number is computed here, in code, from invoices, stock costs and expenses.
   Goods bought are NOT counted as expenses (their cost reaches the profit when they are sold, through the invoice's cost), and neither are
   import costs already added to the stock cost (freight, customs: expenses carrying a shipmentId). */
import { totals, expMain, stockLeft } from "./biz";

export function profitStatement(biz, from, to) {
  const inP = (d) => d && d >= from && d <= to;
  const fxOf = (i) => ((i.currency || biz.currency) === biz.currency ? 1 : Number(i.fx) || biz.rates[i.currency] || 0);
  let revenue = 0, tax = 0, cogs = 0, noCost = 0, noRate = 0, count = 0;
  biz.invoices.filter((i) => i.type === "invoice" && i.status !== "draft" && i.status !== "cancelled" && inP(i.issueDate)).forEach((i) => {
    const fx = fxOf(i); if (!fx) { noRate++; return; }
    const t = totals(i); revenue += (t.total - t.tax) * fx; tax += t.tax * fx; count++;
    if (i.cost != null && i.cost !== "") cogs += Number(i.cost); else noCost++;
  });
  const waste = biz.waste.filter((w) => inP(w.date)).reduce((a, w) => a + (Number(w.cost) || 0), 0);
  const ex = biz.expenses.filter((e) => inP(e.date) && e.category !== "purchases" && !e.shipmentId);
  const byCat = {}; ex.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + expMain(e); });
  const opex = Object.values(byCat).reduce((a, b) => a + b, 0);
  const gross = revenue - cogs, net = gross - waste - opex;
  const staff = biz.employees.filter((e) => e.status !== "ended").length;
  return { revenue, tax, cogs, gross, waste, opex, byCat: Object.entries(byCat).sort((a, b) => b[1] - a[1]), net, margin: revenue > 0 ? (net / revenue) * 100 : 0, gm: revenue > 0 ? (gross / revenue) * 100 : 0, count, noCost, noRate, noSalaries: staff > 0 && !byCat.salaries };
}
