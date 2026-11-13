import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import Summary from "../components/Summary";
import { ltr } from "../components/Form";
import { useBiz, todayStr, fmt } from "../services/biz";
import { profitStatement } from "../services/profit";

/* What is left at the end: sales − cost of the goods sold − every running expense (rent, utilities, communications, taxes, salaries, drivers, transport…). */
export default function ProfitStatement() {
  const { t } = useApp();
  const biz = useBiz(), cur = biz.currency, today = todayStr();
  const [mode, setMode] = useState("month"), [month, setMonth] = useState(today.slice(0, 7)), [year, setYear] = useState(today.slice(0, 4)), [from, setFrom] = useState(today.slice(0, 8) + "01"), [to, setTo] = useState(today);
  const [a, b] = mode === "month" ? [`${month}-01`, `${month}-31`] : mode === "year" ? [`${year}-01-01`, `${year}-12-31`] : [from, to];
  const P = profitStatement(biz, a, b);
  return (
    <>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
        {[["month", "st_month"], ["year", "st_year"], ["range", "pf_range"]].map(([k, l]) => <button key={k} className={`btn btn-sm ${mode === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode(k)}>{t(l)}</button>)}
        {mode === "month" && <input className="input" type="month" style={{ width: "auto" }} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} {...ltr} />}
        {mode === "year" && <input className="input" type="number" min="2000" max="2100" style={{ width: 100 }} value={year} onChange={(e) => e.target.value.length === 4 && setYear(e.target.value)} {...ltr} />}
        {mode === "range" && <><input className="input" type="date" style={{ width: "auto" }} value={from} onChange={(e) => setFrom(e.target.value)} {...ltr} /><input className="input" type="date" style={{ width: "auto" }} value={to} onChange={(e) => setTo(e.target.value)} {...ltr} /></>}
      </div>
      <Summary cur={cur} title={`${t("pf_invoices")}: ${P.count}`} rows={[
        { head: t("pf_income") },
        { label: t("st_sales"), value: P.revenue, sub: true },
        { head: t("pf_costs") },
        { label: t("pf_cogs"), value: P.cogs, tone: "minus" },
        { label: `${t("st_gross")} · ${fmt(P.gm)}%`, value: P.gross, sub: true },
        { head: t("pf_expenses") },
        ...P.byCat.map(([c, v]) => ({ label: t("exp_" + c), value: v, tone: "minus" })),
        ...(P.waste > 0 ? [{ label: t("st_waste"), value: P.waste, tone: "minus" }] : []),
        { label: t("st_margin"), text: `${fmt(P.margin)}%`, tone: "muted" },
        { label: t("st_tax"), value: P.tax, tone: "muted" },
      ]} total={{ label: t("st_net"), value: P.net }} />
      {P.noRate > 0 && <div style={{ color: "#ff8a9b", fontSize: "var(--text-sm)" }}>⚠ {P.noRate} {t("pf_noRate")}</div>}
      {P.noCost > 0 && <div style={{ color: "var(--cyan)", fontSize: "var(--text-sm)" }}>ℹ {P.noCost} {t("pf_noCost")}</div>}
      {P.noSalaries && <div style={{ color: "var(--cyan)", fontSize: "var(--text-sm)" }}>ℹ {t("pf_noSalaries")}</div>}
      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{t("pf_note")}</p>
    </>
  );
}
