import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { F, Grid, ltr } from "../components/Form";
import { useBiz, expMain, totals, paidOf, leftOf, fmt, todayStr, getDue, getLow, stockLeft, payroll } from "../services/biz";
import { EXP_CATS } from "./Expenses";

const ym = (d) => d.toISOString().slice(0, 7);
function csv(name, rows) {
  const body = "\ufeff" + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}
const Bar = ({ v, max, color }) => <div style={{ height: 8, borderRadius: 4, background: color, width: `${max ? Math.max((v / max) * 100, v > 0 ? 3 : 0) : 0}%` }} />;

export default function Reports() {
  const { t } = useApp();
  const biz = useBiz();
  const today = todayStr();
  const [from, setFrom] = useState(today.slice(0, 8) + "01"), [to, setTo] = useState(today);
  const preset = (k) => {
    const n = new Date();
    if (k === "month") { setFrom(today.slice(0, 8) + "01"); setTo(today); }
    if (k === "last") { const a = new Date(n.getFullYear(), n.getMonth() - 1, 2), b = new Date(n.getFullYear(), n.getMonth(), 1); setFrom(a.toISOString().slice(0, 8) + "01"); setTo(b.toISOString().slice(0, 10)); }
    if (k === "year") { setFrom(`${n.getFullYear()}-01-01`); setTo(today); }
    if (k === "all") { setFrom("2000-01-01"); setTo("2100-01-01"); }
  };
  const inR = (d) => d && d >= from && d <= to;
  const live = biz.invoices.filter((x) => x.type === "invoice" && x.status !== "draft" && x.status !== "cancelled" && inR(x.issueDate));
  const docs = live.filter((x) => (x.currency || biz.currency) === biz.currency), other = live.length - docs.length;
  const sum = (arr, fn) => arr.reduce((a, x) => a + fn(x), 0);
  const sales = sum(docs, (x) => totals(x).total), collected = sum(docs, paidOf), owed = sum(docs, leftOf);
  const exps = biz.expenses.filter((x) => inR(x.date)), expTotal = sum(exps, (x) => expMain(x));
  const profit = collected - expTotal;
  const byCust = Object.entries(docs.reduce((m, x) => ((m[x.customer || "—"] = (m[x.customer || "—"] || 0) + totals(x).total), m), {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const byCat = EXP_CATS.map((c) => [c, sum(exps.filter((x) => x.category === c), (x) => expMain(x))]).filter(([, v]) => v > 0);
  const months = [...Array(6)].map((_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5 + i); return ym(d); }).map((m) => ({
    m, s: sum(biz.invoices.filter((x) => x.type === "invoice" && x.status !== "draft" && x.status !== "cancelled" && (x.currency || biz.currency) === biz.currency && (x.issueDate || "").startsWith(m)), (x) => totals(x).total),
    e: sum(biz.expenses.filter((x) => x.date.startsWith(m)), (x) => expMain(x)) }));
  const mx = Math.max(...months.flatMap((x) => [x.s, x.e]), 0);
  const due = getDue(biz), overdue = due.filter((d) => d.overdue);
  const staff = biz.employees.filter((e) => e.status !== "ended");
  const Stat = ({ l, v, c }) => <div className="glass stat-card"><div className="stat-label">{t(l)}</div><div className="stat-value" style={c ? { color: c } : undefined} dir="ltr">{fmt(v)}</div></div>;

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="section-title"><h2>{t("reports")} <span className="badge">{biz.currency}</span></h2></div>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {[["month", "rep_month"], ["last", "rep_last"], ["year", "rep_year"], ["all", "inv_all"]].map(([k, l]) => <button key={k} className="btn btn-ghost btn-sm" onClick={() => preset(k)}>{t(l)}</button>)}
      </div>
      <Grid><F label={t("cat_from")}><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} {...ltr} /></F>
        <F label={t("cat_to")}><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} {...ltr} /></F></Grid>
      <div className="stat-grid">
        <Stat l="rep_sales" v={sales} /><Stat l="rep_collected" v={collected} /><Stat l="rep_owed" v={owed} c="var(--cyan)" />
        <Stat l="rep_expenses" v={expTotal} /><Stat l="rep_profit" v={profit} c={profit < 0 ? "#ff6b81" : "#4ade80"} /><Stat l="rep_accrual" v={sales - expTotal} />
      </div>
      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{t("rep_note")}{other > 0 && ` · ${other} ${t("rep_otherCur")}`}</p>

      <div className="glass card"><h3 style={{ marginTop: 0 }}>{t("rep_trend")}</h3>
        {months.map((x) => (<div key={x.m} style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: "0.5rem", alignItems: "center", marginBottom: 6 }}>
          <span dir="ltr" style={{ fontSize: "var(--text-xs)" }}>{x.m}</span>
          <div style={{ display: "grid", gap: 3 }}><Bar v={x.s} max={mx} color="#368bff" /><Bar v={x.e} max={mx} color="#ff6b81" /></div></div>))}
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-3)" }}>🟦 {t("rep_sales")} · 🟥 {t("rep_expenses")}</div></div>

      {byCust.length > 0 && <div className="glass card"><h3 style={{ marginTop: 0 }}>{t("rep_topCust")}</h3>
        {byCust.map(([n, v]) => <div key={n} style={{ display: "flex", justifyContent: "space-between" }}><span>{n}</span><b dir="ltr">{fmt(v)}</b></div>)}</div>}
      {byCat.length > 0 && <div className="glass card"><h3 style={{ marginTop: 0 }}>{t("rep_expByCat")}</h3>
        {byCat.map(([c, v]) => <div key={c}><div style={{ display: "flex", justifyContent: "space-between" }}><span>{t("exp_" + c)}</span><b dir="ltr">{fmt(v)}</b></div><Bar v={v} max={expTotal} color="#c4a8ff" /></div>)}</div>}

      <div className="glass card" style={{ fontSize: "var(--text-sm)", display: "grid", gap: 4 }}><h3 style={{ margin: 0 }}>{t("rep_snapshot")}</h3>
        <div>{t("rep_overdue")}: <b>{overdue.length}</b> ({fmt(overdue.reduce((a, d) => a + leftOf(d.inv), 0))})</div>
        <div>{t("rep_lowStock")}: <b>{getLow(biz).length}</b> · {t("stk_value")}: <b dir="ltr">{fmt(sum(biz.inventory, (i) => Math.max(stockLeft(i), 0) * (Number(i.cost) || 0)))}</b></div>
        <div>{t("employees")}: <b>{staff.length}</b> · {t("rep_payroll")}: <b dir="ltr">{fmt(sum(staff, (e) => payroll(e).net))}</b></div></div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button className="btn btn-ghost btn-sm" onClick={() => csv("invoices.csv", [["No", "Customer", "Date", "Due", "Status", "Total", "Paid", "Left"], ...docs.map((x) => [x.no, x.customer, x.issueDate, x.dueDate, x.status, totals(x).total.toFixed(2), paidOf(x).toFixed(2), leftOf(x).toFixed(2)])])}>⬇ {t("rep_csvInv")}</button>
        <button className="btn btn-ghost btn-sm" onClick={() => csv("expenses.csv", [["Date", "Category", "Amount", "Payee", "Method", "Branch", "Note"], ...exps.map((x) => [x.date, x.category, x.amount, x.payee, x.method, x.branch, x.note])])}>⬇ {t("rep_csvExp")}</button>
      </div>
    </div>
  );
}
