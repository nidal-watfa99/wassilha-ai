import React, { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { Modal, EmptyState, ConfirmDialog } from "../components/UI";
import { IconChart, IconPlus, IconEdit, IconTrash } from "../components/Icons";
import { F, Grid, ltr, useForm } from "../components/Form";
import { useBiz, upsert, remove, uid, fmt, todayStr } from "../services/biz";

export const EXP_CATS = ["rent", "salaries", "purchases", "utilities", "transport", "marketing", "maintenance", "taxes", "other"];
const METHODS = ["cash", "transfer", "wallet", "card"];
const blank = () => ({ date: todayStr(), category: "purchases", amount: "", payee: "", method: "cash", branch: "", note: "" });

export default function Expenses() {
  const { t } = useApp();
  const biz = useBiz();
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [modal, setModal] = useState(null), [del, setDel] = useState(null);
  const [f, set, setF] = useForm(blank());
  const list = useMemo(() => biz.expenses.filter((x) => !month || x.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date)), [biz.expenses, month]);
  const total = list.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const byCat = EXP_CATS.map((c) => [c, list.filter((x) => x.category === c).reduce((a, x) => a + (Number(x.amount) || 0), 0)]).filter(([, v]) => v > 0);
  const open = (x) => { setF(x === "new" ? blank() : { ...blank(), ...x }); setModal(x); };
  const save = (e) => { e.preventDefault(); upsert("expenses", { ...(modal === "new" ? { id: uid() } : modal), ...f }); setModal(null); };
  const nextMonth = (x) => { const d = new Date(x.date); d.setMonth(d.getMonth() + 1); upsert("expenses", { ...x, id: uid(), date: d.toISOString().slice(0, 10) }); };

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="section-title"><h2>{t("expenses")}</h2>
        <button className="btn btn-primary btn-sm" onClick={() => open("new")}><IconPlus />{t("exp_new")}</button></div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <input className="input" style={{ width: "auto" }} type="month" value={month} onChange={(e) => setMonth(e.target.value)} {...ltr} />
        <button className="btn btn-ghost btn-sm" onClick={() => setMonth("")}>{t("inv_all")}</button>
      </div>
      <div className="stat-grid"><div className="glass stat-card"><div className="stat-label">{t("rep_expenses")}</div><div className="stat-value">{fmt(total)} {biz.currency}</div></div></div>
      {byCat.length > 0 && <div className="glass card" style={{ fontSize: "var(--text-sm)" }}>{byCat.map(([c, v]) => <div key={c} style={{ display: "flex", justifyContent: "space-between" }}><span>{t("exp_" + c)}</span><b dir="ltr">{fmt(v)}</b></div>)}</div>}
      {list.length === 0 ? <EmptyState icon={<IconChart />} text={t("b_none")} /> : list.map((x) => (
        <div key={x.id} className="glass card" style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <div><strong>{t("exp_" + x.category)}</strong> <span style={{ color: "var(--text-3)" }}>· {x.date}{x.payee && ` · ${x.payee}`}{x.branch && ` · ${x.branch}`}</span>
            {x.note && <div style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{x.note}</div>}</div>
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <b dir="ltr">{fmt(x.amount)} {biz.currency}</b>
            <button className="icon-btn" title={t("exp_repeat")} aria-label={t("exp_repeat")} onClick={() => nextMonth(x)}>⟳</button>
            <button className="icon-btn" aria-label={t("b_edit")} onClick={() => open(x)}><IconEdit /></button>
            <button className="icon-btn" aria-label={t("delete")} onClick={() => setDel(x)}><IconTrash /></button>
          </span>
        </div>
      ))}
      {modal && (
        <Modal title={t("exp_new")} onClose={() => setModal(null)}>
          <form onSubmit={save}><Grid>
            <F label={t("exp_date")}><input className="input" type="date" required value={f.date} onChange={set("date")} {...ltr} /></F>
            <F label={t("exp_cat")}><select className="select" value={f.category} onChange={set("category")}>{EXP_CATS.map((c) => <option key={c} value={c}>{t("exp_" + c)}</option>)}</select></F>
            <F label={t("amount") + " *"}><input className="input" type="number" min="0" step="any" required value={f.amount} onChange={set("amount")} {...ltr} /></F>
            <F label={t("exp_method")}><select className="select" value={f.method} onChange={set("method")}>{METHODS.map((c) => <option key={c} value={c}>{t("exp_m_" + c)}</option>)}</select></F>
            <F label={t("exp_payee")}><input className="input" value={f.payee} onChange={set("payee")} /></F>
            <F label={t("emp_branch")}><input className="input" value={f.branch} onChange={set("branch")} /></F>
            <F label={t("emp_notes")} wide><input className="input" value={f.note} onChange={set("note")} /></F>
          </Grid>
            <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>{t("cancel")}</button><button className="btn btn-primary btn-sm">{t("save")}</button></div></form>
        </Modal>)}
      {del && <ConfirmDialog title={t("delete")} message={t("b_confirmDelete")} onConfirm={() => remove("expenses", del.id)} onClose={() => setDel(null)} />}
    </div>
  );
}
