import React, { useRef, useState } from "react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Modal, EmptyState, ConfirmDialog } from "../components/UI";
import { IconChart, IconPlus, IconEdit, IconTrash } from "../components/Icons";
import { F, Grid, Sec, ltr, useForm } from "../components/Form";
import Summary from "../components/Summary";
import MoneyInput from "../components/MoneyInput";
import MediaAttach from "../components/MediaAttach";
import { EXP_CATS } from "./Expenses";
import { useBiz, upsert, remove, uid, fmt, todayStr, expMain } from "../services/biz";
import { billStatus, payrollRows } from "../services/expensehub";
import { delMedia } from "../services/media";

const QUICK = ["electricity", "water", "comm", "taxes", "rent", "transport", "fuel", "vehicle", "maintenance", "other"];
const METHODS = ["cash", "transfer", "wallet", "card"];
const Foot = ({ onCancel, t }) => <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end", marginTop: "0.7rem" }}><button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>{t("cancel")}</button><button className="btn btn-primary btn-sm">{t("save")}</button></div>;

/* One place for everything the shop pays: electricity, water, communications, taxes, rent, salaries and drivers' wages, with bill photos attached. */
export default function ExpenseHub() {
  const { t, toast } = useApp();
  const biz = useBiz(), cur = biz.currency, today = todayStr();
  const [month, setMonth] = useState(today.slice(0, 7)), [modal, setModal] = useState(null), [del, setDel] = useState(null), [contacts, setContacts] = useState([]);
  const [f, set, setF] = useForm({}), trash = useRef([]);
  React.useEffect(() => { api.get("/contacts").then((d) => setContacts(d.items || [])).catch(() => {}); }, []);
  const close = () => setModal(null);
  const list = biz.expenses.filter((x) => x.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  const prevMonth = (() => { const d = new Date(month + "-01T00:00:00"); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })();
  const sum = (a) => a.reduce((s, x) => s + expMain(x), 0);
  const total = sum(list), prev = sum(biz.expenses.filter((x) => x.date.startsWith(prevMonth)));
  const byCat = EXP_CATS.map((c) => [c, sum(list.filter((x) => x.category === c))]).filter(([, v]) => v > 0);

  const openExp = (category, extra = {}, x) => { trash.current = []; setF(x ? { ...x, media: [...(x.media || [])] } : { date: today, category, amount: "", currency: cur, fx: "", payee: "", method: "cash", note: "", media: [], ...extra }); setModal({ kind: "exp", x }); };
  const saveExp = (e) => {
    e.preventDefault();
    const c = f.currency || cur, rate = c === cur ? 1 : Number(f.fx) || 0;
    if (!rate) return toast(t("fx_missing"), "error");
    upsert("expenses", { id: modal.x?.id || uid(), ...(modal.x || {}), ...f, currency: c, rate, amountMain: +((Number(f.amount) || 0) * rate).toFixed(6) });
    trash.current.forEach(delMedia); close();
  };
  const openTpl = (x) => { setF(x ? { ...x } : { name: "", category: "electricity", amount: "", currency: cur, fx: "", dueDay: 1, payee: "" }); setModal({ kind: "tpl", x }); };
  const saveTpl = (e) => { e.preventDefault(); if ((f.currency || cur) !== cur && !Number(f.fx)) return toast(t("fx_missing"), "error"); upsert("recurring", { id: modal.x?.id || uid(), ...(modal.x || {}), ...f, currency: f.currency || cur }); close(); };
  const payTpl = (tpl) => openExp(tpl.category, { amount: tpl.amount, currency: tpl.currency || cur, fx: tpl.fx || biz.rates[tpl.currency] || "", payee: tpl.payee || "", note: tpl.name, templateId: tpl.id, period: today.slice(0, 7) });
  const paySalary = (r) => {
    if (r.main == null) return toast(t("fx_missing"), "error");
    upsert("expenses", { id: uid(), date: today, category: "salaries", amount: +r.main.toFixed(2), currency: cur, rate: 1, amountMain: +r.main.toFixed(2), payee: r.e.fullName, method: "cash", branch: "", note: `${t("hub_salary")} ${month}`, empId: r.e.id, period: month, media: [] });
  };
  const rows = payrollRows(biz, month), unpaid = rows.filter((r) => !r.paid && r.main != null && r.net > 0);

  return (
    <>
      <input className="input" type="month" style={{ width: "auto" }} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} {...ltr} />
      <div className="stat-grid">
        <div className="glass stat-card"><div className="stat-label">{t("rep_expenses")}</div><div className="stat-value">{fmt(total)} {cur}</div></div>
        <div className="glass stat-card"><div className="stat-label">{t("hub_vsPrev")}</div><div className="stat-value" style={{ color: total > prev ? "#ff8a9b" : "#4ade80" }}>{prev > 0 ? `${total >= prev ? "+" : ""}${fmt(((total - prev) / prev) * 100)}%` : "—"}</div></div>
      </div>
      <Sec>{t("hub_quick")}</Sec>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>{QUICK.map((c) => <button key={c} className="btn btn-ghost btn-sm" onClick={() => openExp(c)}>＋ {t("exp_" + c)}</button>)}</div>

      <Sec>{t("hub_bills")}</Sec>
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{t("hub_billsHelp")}</p>
      <button className="btn btn-ghost btn-sm" style={{ justifySelf: "start" }} onClick={() => openTpl(null)}><IconPlus />{t("hub_newBill")}</button>
      {biz.recurring.map((b) => { const s = billStatus(biz, b, today); return (
        <div key={b.id} className="glass card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span><strong>{b.name}</strong> · {t("exp_" + b.category)} · <bdi dir="ltr">{fmt(b.amount)} {b.currency || cur}</bdi><div style={{ fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{t("hub_due")}: <bdi dir="ltr">{s.due}</bdi></div></span>
          <span style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
            {s.paid ? <span className="badge badge-green">{t("hub_paid")}</span> : <><span className={`badge ${s.overdue ? "badge-red" : s.dueToday ? "badge-violet" : ""}`}>{s.overdue ? t("inv_overdue") : s.dueToday ? t("hub_today") : t("hub_upcoming")}</span><button className="btn btn-primary btn-sm" onClick={() => payTpl(b)}>{t("hub_pay")}</button></>}
            <button className="icon-btn" aria-label={t("b_edit")} onClick={() => openTpl(b)}><IconEdit /></button><button className="icon-btn" aria-label={t("delete")} onClick={() => setDel({ fn: () => remove("recurring", b.id) })}><IconTrash /></button></span></div>); })}

      <Sec>{t("hub_payroll")} · {month}</Sec>
      {rows.length === 0 ? <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-3)" }}>{t("hub_noStaff")}</p> : (<>
        {rows.map((r) => <div key={r.e.id} className="glass card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span><strong>{r.e.fullName}</strong> <span style={{ color: "var(--text-3)", fontSize: "var(--text-sm)" }}>{r.e.role ? t("role_" + r.e.role) : r.e.jobTitle}</span></span>
          <span style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}><b dir="ltr">{fmt(r.net)} {r.e.currency || cur}</b>
            {r.paid ? <span className="badge badge-green">{t("hub_paid")}</span> : r.net > 0 ? <button className="btn btn-ghost btn-sm" disabled={r.main == null} title={r.main == null ? t("fx_missing") : ""} onClick={() => paySalary(r)}>{t("hub_pay")}</button> : null}</span></div>)}
        {unpaid.length > 1 && <button className="btn btn-primary btn-sm" style={{ justifySelf: "start" }} onClick={() => { unpaid.forEach(paySalary); toast(`${unpaid.length} ✓`, "success"); }}>{t("hub_payAll")} ({unpaid.length})</button>}
        <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{t("hub_payrollNote")}</p></>)}

      {byCat.length > 0 && <Summary cur={cur} title={t("rep_expByCat")} rows={byCat.map(([c, v]) => ({ label: t("exp_" + c), value: v }))} total={{ label: t("rep_expenses"), value: total }} />}
      <Sec>{t("hub_list")}</Sec>
      {list.length === 0 ? <EmptyState icon={<IconChart />} text={t("b_none")} /> : list.map((x) => (
        <div key={x.id} className="glass card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span><strong>{t("exp_" + x.category)}</strong> <span style={{ color: "var(--text-3)" }}>· {x.date}{x.payee && ` · ${x.payee}`}{(x.media || []).length > 0 && ` · 📎${x.media.length}`}</span>{x.note && <div style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{x.note}</div>}</span>
          <span style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}><b dir="ltr">{fmt(x.amount)} {x.currency || cur}{(x.currency || cur) !== cur && <small style={{ color: "var(--text-3)" }}> ≈ {fmt(expMain(x))} {cur}</small>}</b>
            <button className="icon-btn" aria-label={t("b_edit")} onClick={() => openExp(x.category, {}, x)}><IconEdit /></button><button className="icon-btn" aria-label={t("delete")} onClick={() => setDel({ fn: () => { (x.media || []).forEach((m) => delMedia(m.id)); remove("expenses", x.id); } })}><IconTrash /></button></span></div>))}

      {modal?.kind === "exp" && <Modal wide title={t("exp_new")} onClose={close}><form onSubmit={saveExp}>
        <Grid>
          <F label={t("exp_date")}><input className="input" type="date" required value={f.date} onChange={set("date")} {...ltr} /></F>
          <F label={t("exp_cat")}><select className="select" value={f.category} onChange={set("category")}>{EXP_CATS.map((c) => <option key={c} value={c}>{t("exp_" + c)}</option>)}</select></F>
          <F label={t("amount") + " *"}><MoneyInput f={f} setF={setF} amount="amount" currency="currency" fx="fx" required /></F>
          <F label={t("exp_payee")}><input className="input" list="hp" value={f.payee} onChange={set("payee")} /><datalist id="hp">{contacts.map((c) => <option key={c.id} value={c.name} />)}</datalist></F>
          <F label={t("exp_method")}><select className="select" value={f.method} onChange={set("method")}>{METHODS.map((c) => <option key={c} value={c}>{t("exp_m_" + c)}</option>)}</select></F>
          <F label={t("emp_notes")} wide><input className="input" value={f.note} onChange={set("note")} /></F>
        </Grid>
        <Sec>{t("hub_attach")}</Sec>
        <MediaAttach media={f.media || []} onChange={(m) => setF((p) => ({ ...p, media: m }))} trash={trash} />
        <Foot t={t} onCancel={close} /></form></Modal>}
      {modal?.kind === "tpl" && <Modal title={t("hub_newBill")} onClose={close}><form onSubmit={saveTpl}><Grid>
        <F label={t("map_name") + " *"}><input className="input" required value={f.name} onChange={set("name")} placeholder={t("hub_namePh")} /></F>
        <F label={t("exp_cat")}><select className="select" value={f.category} onChange={set("category")}>{EXP_CATS.map((c) => <option key={c} value={c}>{t("exp_" + c)}</option>)}</select></F>
        <F label={t("hub_usual")}><MoneyInput f={f} setF={setF} amount="amount" currency="currency" fx="fx" /></F>
        <F label={t("pr_dueDay")}><input className="input" type="number" min="1" max="28" value={f.dueDay} onChange={set("dueDay")} {...ltr} /></F>
        <F label={t("exp_payee")}><input className="input" value={f.payee} onChange={set("payee")} /></F></Grid><Foot t={t} onCancel={close} /></form></Modal>}
      {del && <ConfirmDialog title={t("delete")} message={t("b_confirmDelete")} onConfirm={del.fn} onClose={() => setDel(null)} />}
    </>
  );
}
