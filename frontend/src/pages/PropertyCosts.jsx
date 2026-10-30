import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { Modal, EmptyState, ConfirmDialog } from "../components/UI";
import { IconBox, IconPlus, IconTrash } from "../components/Icons";
import { F, Grid, ltr, useForm } from "../components/Form";
import Summary from "../components/Summary";
import { useBiz, upsert, remove, uid, fmt, nextNo, todayStr, payroll } from "../services/biz";
import { rentFor } from "../services/realestate";

const KINDS = ["electricity", "water", "gas", "comm", "other"], SKINDS = ["cleaning", "security", "elevator", "garden", "other"];
const split = (total, weights) => {                       // shares rounded to cents; the last one absorbs the rounding difference
  const w = weights.some((x) => x > 0) ? weights : weights.map(() => 1), sum = w.reduce((a, b) => a + b, 0); let given = 0;
  return w.map((x, i) => { const v = i === w.length - 1 ? +(total - given).toFixed(2) : +((total * x) / sum).toFixed(2); given += v; return v; });
};

/* tab = "bills" (electricity, water, communications) or "shared" (cleaning and other shared services) */
export default function PropertyCosts({ tab }) {
  const { t, toast } = useApp();
  const biz = useBiz(), cur = biz.currency, today = todayStr();
  const [modal, setModal] = useState(null), [del, setDel] = useState(null), [period, setPeriod] = useState(today.slice(0, 7));
  const [f, set, setF] = useForm({});
  const close = () => setModal(null);
  const bName = (id) => biz.props.find((b) => b.id === id)?.name || "";
  const eligible = (propId, P, flag) => biz.leases.filter((l) => {
    const u = biz.units.find((x) => x.id === l.unitId);
    return u && u.propId === propId && l.status === "active" && l.start <= P + "-31" && (!l.end || l.end >= P + "-01") && l[flag] !== "0";
  });
  const areaOf = (l) => Number(biz.units.find((u) => u.id === l.unitId)?.area) || 0;
  const bill = (l, P, items, extra) => upsert("invoices", { id: uid(), no: nextNo("invoice"), type: "invoice", customer: l.tenant, issueDate: today, dueDate: `${P}-${String(Math.min(Math.max(Number(l.dueDay) || 1, 1), 28)).padStart(2, "0")}`, currency: cur, discount: 0, tax: 0, notes: l.no, paidAmount: "", status: "unpaid", leaseId: l.id, period: P, ...extra, items: items.map((i) => ({ ...i, qty: 1, unit: "" })) });

  /* ---------- utility bills ---------- */
  const consumption = (b) => (b.cur !== "" && b.prev !== "" && b.cur != null && b.prev != null ? Number(b.cur) - Number(b.prev) : null);
  const saveBill = (e) => { e.preventDefault(); upsert("utils", { id: uid(), createdAt: new Date().toISOString(), ...f, amount: Number(f.amount) || 0, paid: false, billed: 0 }); close(); };
  const payProvider = (b) => { upsert("expenses", { id: uid(), date: today, category: "utilities", amount: b.amount, payee: b.provider, method: "cash", branch: bName(b.propId), note: `${t("pr_ut_" + b.kind)} ${b.period}`, utilId: b.id }); upsert("utils", { ...b, paid: true }); };
  const chargeTenants = (b) => {
    const ls = b.unitId ? biz.leases.filter((l) => l.unitId === b.unitId && l.status === "active" && l.start <= b.period + "-31" && (!l.end || l.end >= b.period + "-01")).slice(0, 1) : eligible(b.propId, b.period, "chargeUtils");
    if (!ls.length) return toast(t("pr_noTenants"), "error");
    const shares = b.unitId ? [b.amount] : split(b.amount, b.basis === "equal" ? ls.map(() => 1) : ls.map(areaOf));
    ls.forEach((l, i) => bill(l, b.period, [{ desc: `${t("pr_ut_" + b.kind)} — ${b.period}`, price: shares[i] }], { utilId: b.id }));
    upsert("utils", { ...b, billed: ls.length }); toast(`${ls.length} ${t("pr_generated")}`, "success");
  };

  /* ---------- shared services ---------- */
  const staffPay = (propId) => biz.employees.filter((e) => e.propId === propId && e.role === "cleaner" && e.status !== "ended").reduce((a, e) => a + payroll(e).net, 0);
  const amountOf = (s) => (s.fromStaff ? staffPay(s.propId) : Number(s.amount) || 0);
  const plan = biz.props.map((b) => {
    const items = biz.shared.filter((s) => s.propId === b.id), ls = eligible(b.id, period, "chargeShared");
    const lines = ls.map(() => []);
    items.forEach((s) => {
      const w = s.basis === "equal" ? ls.map(() => 1) : s.basis === "rent" ? ls.map((l) => rentFor(l, period)) : ls.map(areaOf);
      split(amountOf(s), w).forEach((v, i) => { if (ls[i]) lines[i].push({ desc: `${s.name} — ${period}`, price: v }); });
    });
    const total = items.reduce((a, s) => a + amountOf(s), 0), billed = lines.flat().reduce((a, x) => a + x.price, 0);
    return { b, items, ls, lines, total, billed, todo: ls.filter((l) => !biz.invoices.some((i) => i.leaseId === l.id && i.sharedPeriod === period)) };
  }).filter((p) => p.items.length);
  const generate = () => {
    let n = 0;
    plan.forEach((p) => p.ls.forEach((l, i) => { if (p.todo.includes(l) && p.lines[i].length) { bill(l, period, p.lines[i], { sharedPeriod: period }); n++; } }));
    toast(`${n} ${t("pr_generated")}`, "success");
  };

  if (tab === "bills") return (
    <>
      <button className="btn btn-primary btn-sm" style={{ justifySelf: "start" }} onClick={() => biz.props.length ? (setF({ propId: biz.props[0].id, unitId: "", kind: "electricity", period: today.slice(0, 7), provider: "", amount: "", prev: "", cur: "", rate: "", basis: "area", notes: "" }), setModal("bill")) : toast(t("pr_needBuilding"), "error")}><IconPlus />{t("pr_newBill")}</button>
      {biz.utils.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : biz.utils.map((b) => (
        <div key={b.id} className="glass card" style={{ display: "grid", gap: "0.4rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}><strong>{t("pr_ut_" + b.kind)} · <bdi dir="ltr">{b.period}</bdi></strong><b dir="ltr">{fmt(b.amount)} {cur}</b></div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{bName(b.propId)}{b.unitId ? ` · ${biz.units.find((u) => u.id === b.unitId)?.name}` : ` · ${t("pr_wholeBuilding")}`}{b.provider && ` · ${b.provider}`}{consumption(b) != null && ` · ${consumption(b)} ${t("pr_consumed")}`}</div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
            {b.paid ? <span className="badge badge-green">{t("pr_paidProv")}</span> : <button className="btn btn-ghost btn-sm" onClick={() => payProvider(b)}>{t("pr_payProv")}</button>}
            {b.billed ? <span className="badge badge-blue">{t("pr_billedTo")} {b.billed}</span> : <button className="btn btn-primary btn-sm" onClick={() => chargeTenants(b)}>{t("pr_chargeTenants")}</button>}
            <button className="icon-btn" aria-label={t("delete")} onClick={() => setDel({ fn: () => remove("utils", b.id) })}><IconTrash /></button>
          </div>
        </div>))}
      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{t("pr_billsNote")}</p>
      {modal === "bill" && <Modal title={t("pr_newBill")} onClose={close}><form onSubmit={saveBill}><Grid>
        <F label={t("pr_building")}><select className="select" value={f.propId} onChange={(e) => setF((p) => ({ ...p, propId: e.target.value, unitId: "" }))}>{biz.props.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></F>
        <F label={t("pr_unit")}><select className="select" value={f.unitId} onChange={set("unitId")}><option value="">{t("pr_wholeBuilding")}</option>{biz.units.filter((u) => u.propId === f.propId).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></F>
        <F label={t("map_kind")}><select className="select" value={f.kind} onChange={set("kind")}>{KINDS.map((k) => <option key={k} value={k}>{t("pr_ut_" + k)}</option>)}</select></F>
        <F label={t("pr_period")}><input className="input" type="month" required value={f.period} onChange={set("period")} {...ltr} /></F>
        <F label={t("pr_provider")}><input className="input" value={f.provider} onChange={set("provider")} /></F>
        <F label={`${t("amount")} (${cur}) *`}><input className="input" type="number" min="0" step="any" required value={f.amount} onChange={set("amount")} {...ltr} /></F>
        <F label={t("pr_prev")}><input className="input" type="number" step="any" value={f.prev} onChange={set("prev")} {...ltr} /></F>
        <F label={t("pr_curr")}><input className="input" type="number" step="any" value={f.cur} onChange={set("cur")} {...ltr} /></F>
        <F label={t("pr_rate")}><input className="input" type="number" min="0" step="any" value={f.rate} onChange={set("rate")} {...ltr} /></F>
        {!f.unitId && <F label={t("pr_basis")}><select className="select" value={f.basis} onChange={set("basis")}><option value="area">{t("pr_b_area")}</option><option value="equal">{t("pr_b_equal")}</option></select></F>}</Grid>
        {consumption(f) != null && Number(f.rate) > 0 && <div style={{ fontSize: "var(--text-sm)", margin: "0.4rem 0" }}>{consumption(f)} × {f.rate} = <b dir="ltr">{fmt(consumption(f) * Number(f.rate))}</b> <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF((p) => ({ ...p, amount: +(consumption(f) * Number(f.rate)).toFixed(2) }))}>{t("pr_useCalc")}</button></div>}
        {consumption(f) != null && consumption(f) < 0 && <div style={{ color: "#ff8a9b", fontSize: "var(--text-sm)" }}>⚠ {t("pr_badReading")}</div>}
        <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end", marginTop: "0.6rem" }}><button type="button" className="btn btn-ghost btn-sm" onClick={close}>{t("cancel")}</button><button className="btn btn-primary btn-sm">{t("save")}</button></div></form></Modal>}
      {del && <ConfirmDialog title={t("delete")} message={t("pr_delBill")} onConfirm={del.fn} onClose={() => setDel(null)} />}
    </>);

  return (
    <>
      <button className="btn btn-primary btn-sm" style={{ justifySelf: "start" }} onClick={() => biz.props.length ? (setF({ propId: biz.props[0].id, name: "", kind: "cleaning", amount: "", fromStaff: false, basis: "area" }), setModal("item")) : toast(t("pr_needBuilding"), "error")}><IconPlus />{t("pr_newShared")}</button>
      {biz.shared.map((s) => <div key={s.id} className="glass card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <span><strong>{s.name}</strong> · {bName(s.propId)} · {t("pr_sk_" + s.kind)} · {t("pr_b_" + s.basis)}</span>
        <span><b dir="ltr">{fmt(amountOf(s))} {cur}</b>{s.fromStaff && <span className="badge badge-blue"> {t("pr_fromStaff")}</span>}<button className="icon-btn" aria-label={t("delete")} onClick={() => setDel({ fn: () => remove("shared", s.id) })}><IconTrash /></button></span></div>)}
      {biz.shared.length === 0 && <EmptyState icon={<IconBox />} text={t("b_none")} />}
      {plan.length > 0 && (<div className="glass card" style={{ display: "grid", gap: "0.6rem" }}>
        <h3 style={{ margin: 0 }}>{t("pr_billShared")}</h3>
        <input className="input" type="month" style={{ width: "auto" }} value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} {...ltr} />
        {plan.map((p) => <Summary key={p.b.id} cur={cur} title={p.b.name} rows={[{ label: t("pr_totalCost"), value: p.total, sub: true }, { label: t("pr_billedTenants"), value: p.billed, tone: "minus" }]} total={{ label: t("pr_ownerPays"), value: p.total - p.billed }} />)}
        <button className="btn btn-primary btn-sm" style={{ justifySelf: "start" }} disabled={!plan.some((p) => p.todo.length)} onClick={generate}>{t("pr_generate")}</button>
        <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{t("pr_sharedNote")}</p></div>)}
      {modal === "item" && <Modal title={t("pr_newShared")} onClose={close}><form onSubmit={(e) => { e.preventDefault(); upsert("shared", { id: uid(), ...f, amount: Number(f.amount) || 0 }); close(); }}><Grid>
        <F label={t("pr_building")}><select className="select" value={f.propId} onChange={set("propId")}>{biz.props.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></F>
        <F label={t("map_name") + " *"}><input className="input" required value={f.name} onChange={set("name")} /></F>
        <F label={t("map_kind")}><select className="select" value={f.kind} onChange={set("kind")}>{SKINDS.map((k) => <option key={k} value={k}>{t("pr_sk_" + k)}</option>)}</select></F>
        <F label={t("pr_source")}><select className="select" value={f.fromStaff ? "1" : ""} onChange={(e) => setF((p) => ({ ...p, fromStaff: !!e.target.value }))}><option value="">{t("pr_manual")}</option><option value="1">{t("pr_fromStaff")}</option></select></F>
        {!f.fromStaff && <F label={`${t("pr_monthlyCost")} (${cur})`}><input className="input" type="number" min="0" step="any" value={f.amount} onChange={set("amount")} {...ltr} /></F>}
        <F label={t("pr_basis")}><select className="select" value={f.basis} onChange={set("basis")}><option value="area">{t("pr_b_area")}</option><option value="equal">{t("pr_b_equal")}</option><option value="rent">{t("pr_b_rent")}</option></select></F></Grid>
        {f.fromStaff && <p style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{t("pr_staffHelp")} <b dir="ltr">{fmt(staffPay(f.propId))} {cur}</b></p>}
        <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end" }}><button type="button" className="btn btn-ghost btn-sm" onClick={close}>{t("cancel")}</button><button className="btn btn-primary btn-sm">{t("save")}</button></div></form></Modal>}
      {del && <ConfirmDialog title={t("delete")} message={t("b_confirmDelete")} onConfirm={del.fn} onClose={() => setDel(null)} />}
    </>);
}
