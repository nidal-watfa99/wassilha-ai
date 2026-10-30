import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import Summary from "../components/Summary";
import { useBiz, todayStr, fmt, payroll } from "../services/biz";
import { orderCalc, productCost } from "../services/costing";
import { ltr } from "../components/Form";

export default function RestaurantStatement() {
  const { t } = useApp();
  const biz = useBiz(), cur = biz.currency;
  const [mode, setMode] = useState("day"), [d, setD] = useState(todayStr());
  const y = d.slice(0, 4), ym = d.slice(0, 7), dim = new Date(+y, +d.slice(5, 7), 0).getDate();
  const staff = biz.employees.filter((e) => e.status !== "ended"), monthlyPay = staff.reduce((a, e) => a + payroll(e).net, 0);
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const opexIn = (pre) => sum(biz.expenses.filter((x) => x.date.startsWith(pre) && x.category !== "purchases" && x.category !== "salaries"), (x) => Number(x.amount) || 0);

  const period = (inP, payFactor, opex) => {
    const orders = biz.orders.filter((o) => o.status === "paid" && inP((o.paidAt || "").slice(0, 10)));
    let rev = 0, tax = 0, cogs = 0, unknown = 0; const byType = { dine: 0, take: 0, deliv: 0 };
    orders.forEach((o) => {
      const c = orderCalc(o); rev += c.total - c.tax; tax += c.tax; byType[o.type] = (byType[o.type] || 0) + (c.total - c.tax);
      o.lines.forEach((l) => { const m = biz.menuItems.find((x) => x.id === l.menuId), cost = m ? productCost(m, biz) : 0; if (!cost) unknown++; cogs += l.qty * cost; });
    });
    const waste = sum(biz.waste.filter((w) => inP(w.date)), (w) => w.cost), payrollShare = monthlyPay * payFactor, gross = rev - cogs, net = gross - payrollShare - opex - waste;
    return { n: orders.length, rev, tax, cogs, unknown, byType, waste, payrollShare, opex, gross, net, margin: rev > 0 ? (net / rev) * 100 : 0, gm: rev > 0 ? (gross / rev) * 100 : 0 };
  };
  const inDay = (x) => x === d, inMonth = (x) => x.startsWith(ym), inYear = (x) => x.startsWith(y);
  const P = mode === "day" ? period(inDay, 1 / dim, opexIn(ym) / dim) : mode === "month" ? period(inMonth, 1, opexIn(ym)) : period(inYear, 12, opexIn(y));
  const months = mode === "year" ? [...Array(12)].map((_, i) => { const pre = `${y}-${String(i + 1).padStart(2, "0")}`; return [pre, period((x) => x.startsWith(pre), 1, opexIn(pre))]; }) : [];

  return (
    <div style={{ display: "grid", gap: "0.9rem" }}>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
        {[["day", "st_day"], ["month", "st_month"], ["year", "st_year"]].map(([k, l]) => <button key={k} className={`btn btn-sm ${mode === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode(k)}>{t(l)}</button>)}
        {mode === "day" && <input className="input" style={{ width: "auto" }} type="date" value={d} onChange={(e) => setD(e.target.value || todayStr())} {...ltr} />}
        {mode === "month" && <input className="input" style={{ width: "auto" }} type="month" value={ym} onChange={(e) => e.target.value && setD(e.target.value + "-01")} {...ltr} />}
        {mode === "year" && <input className="input" style={{ width: 100 }} type="number" min="2000" max="2100" value={y} onChange={(e) => e.target.value.length === 4 && setD(e.target.value + "-01-01")} {...ltr} />}
      </div>
      <Summary cur={cur} title={`${t("st_orders")}: ${P.n}`} rows={[
        { head: t("st_byType") },
        { label: t("rs_dine"), value: P.byType.dine }, { label: t("rs_take"), value: P.byType.take }, { label: t("rs_deliv"), value: P.byType.deliv },
        { label: t("st_sales"), value: P.rev, sub: true },
        { label: t("st_costs"), value: P.cogs, tone: "minus" },
        { label: `${t("st_gross")} · ${fmt(P.gm)}%`, value: P.gross, sub: true },
        { label: t("st_payroll"), value: P.payrollShare, tone: "minus" },
        { label: t("st_opex"), value: P.opex, tone: "minus" },
        { label: t("st_waste"), value: P.waste, tone: "minus" },
        { label: t("st_margin"), text: `${fmt(P.margin)}%`, tone: "muted" },
        { label: t("st_tax"), value: P.tax, tone: "muted" },
      ]} total={{ label: t("st_net"), value: P.net }} />
      {P.unknown > 0 && <div style={{ color: "#ff8a9b", fontSize: "var(--text-sm)" }}>⚠ {P.unknown} {t("st_unknown")}</div>}
      {months.length > 0 && <div className="glass card"><h3 style={{ marginTop: 0 }}>{t("st_byMonth")}</h3>
        {months.map(([m, p]) => <div key={m} style={{ display: "grid", gridTemplateColumns: "64px 1fr 1fr", gap: "0.5rem", fontSize: "var(--text-sm)", padding: "0.25rem 0", borderTop: "1px solid var(--border)" }}>
          <bdi dir="ltr">{m}</bdi><span dir="ltr">{fmt(p.rev)}</span><b dir="ltr" style={{ color: p.net < 0 ? "#ff8a9b" : "#4ade80" }}>{fmt(p.net)}</b></div>)}</div>}
      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{t("st_note")}</p>
    </div>
  );
}
