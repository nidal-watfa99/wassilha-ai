import React, { useMemo, useState } from "react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Modal, EmptyState, ConfirmDialog } from "../components/UI";
import { IconBox, IconPlus, IconTrash } from "../components/Icons";
import CurrencyPicker from "../components/CurrencyPicker";
import { F, Grid, ltr, useForm } from "../components/Form";
import Summary from "../components/Summary";
import { useBiz, upsert, remove, update, uid, fmt, nextNo, todayStr, stockLeft } from "../services/biz";
import { convert, compatible, unitLabel } from "../services/units";

const REASONS = ["expired", "spoiled", "damaged", "prep", "other"];
const pTotal = (p) => p.lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0) * (Number(p.rate) || 1);   // always in the main currency

export default function Purchases() {
  const { t, locale, toast } = useApp();
  const biz = useBiz(), cur = biz.currency, today = todayStr();
  const [tab, setTab] = useState("buy"), [modal, setModal] = useState(null), [del, setDel] = useState(null), [payFor, setPayFor] = useState(null), [amt, setAmt] = useState("");
  const [contacts, setContacts] = useState([]);
  React.useEffect(() => { api.get("/contacts").then((d) => setContacts(d.items || [])).catch(() => {}); }, []);
  const [f, set, setF] = useForm({});
  const inv = (id) => biz.inventory.find((i) => i.id === id);
  const setLine = (i, p) => setF((s) => ({ ...s, lines: s.lines.map((l, k) => (k === i ? { ...l, ...p } : l)) }));

  const addExpense = (p, amount, date) => upsert("expenses", { id: uid(), date, category: "purchases", amount, payee: p.supplier, method: "cash", branch: "", note: p.no, purchaseId: p.id });
  const savePurchase = (e) => {
    e.preventDefault();
    const lines = f.lines.filter((l) => inv(l.invId) && Number(l.qty) > 0);
    if (!lines.length) return;
    const foreign = (f.currency || cur) !== cur, rate = foreign ? Number(f.rate) || 0 : 1;
    if (!rate) return toast(t("fx_missing"), "error");
    const p = { id: uid(), no: nextNo("purchase"), date: f.date, supplier: f.supplier, notes: f.notes, lines, currency: f.currency || cur, rate, paid: Math.min(Number(f.paid) || 0, pTotal({ lines, rate })) };
    update((s) => ({ ...s, inventory: s.inventory.map((it) => {
      const mine = lines.filter((l) => l.invId === it.id); if (!mine.length) return it;
      let left = Math.max(stockLeft(it), 0), cost = Number(it.cost) || 0, add = 0;
      mine.forEach((l) => {                                    // weighted-average cost, everything in the item's own unit
        const k = l.unit && it.unit && l.unit !== it.unit ? convert(1, l.unit, it.unit) : 1, q = (Number(l.qty) || 0) * (k || 1), unitPrice = ((Number(l.price) || 0) * rate) / (k || 1);
        cost = left + q > 0 ? (left * cost + q * unitPrice) / (left + q) : unitPrice; left += q; add += q;
      });
      return { ...it, qtyIn: (Number(it.qtyIn) || 0) + add, cost: +cost.toFixed(6) };
    }) }));
    upsert("purchases", p);
    if (p.paid > 0) addExpense(p, p.paid, p.date);
    setModal(null);
  };
  const addPayment = () => {
    const a = Math.min(Number(amt) || 0, pTotal(payFor) - payFor.paid); if (a <= 0) return;
    upsert("purchases", { ...payFor, paid: payFor.paid + a }); addExpense(payFor, a, today); setPayFor(null); setAmt("");
  };
  const delPurchase = (p) => {
    update((s) => ({ ...s, expenses: s.expenses.filter((x) => x.purchaseId !== p.id), inventory: s.inventory.map((it) => {
      const back = p.lines.filter((l) => l.invId === it.id).reduce((a, l) => a + (Number(l.qty) || 0) * (l.unit && it.unit && l.unit !== it.unit ? convert(1, l.unit, it.unit) || 1 : 1), 0);
      return back ? { ...it, qtyIn: (Number(it.qtyIn) || 0) - back } : it; }) }));
    remove("purchases", p.id);
  };
  const saveWaste = (e) => {
    e.preventDefault();
    const it = inv(f.invId); if (!it) return;
    const q = f.unit && it.unit && f.unit !== it.unit ? convert(f.qty, f.unit, it.unit) : Number(f.qty);
    if (!(q > 0)) return toast(t("unit_incompat"), "error");
    update((s) => ({ ...s, inventory: s.inventory.map((x) => (x.id === it.id ? { ...x, qtyOut: (Number(x.qtyOut) || 0) + q } : x)) }));
    upsert("waste", { id: uid(), date: f.date, invId: it.id, name: it.name, qty: q, unit: it.unit, reason: f.reason, cost: q * (Number(it.cost) || 0) });
    setModal(null);
  };
  const delWaste = (w) => { update((s) => ({ ...s, inventory: s.inventory.map((x) => (x.id === w.invId ? { ...x, qtyOut: (Number(x.qtyOut) || 0) - w.qty } : x)) })); remove("waste", w.id); };

  const suppliers = useMemo(() => Object.entries(biz.purchases.reduce((m, p) => { const k = p.supplier || "—"; m[k] = m[k] || { total: 0, paid: 0 }; m[k].total += pTotal(p); m[k].paid += p.paid; return m; }, {})), [biz.purchases]);
  const owedAll = biz.purchases.reduce((a, p) => a + pTotal(p) - p.paid, 0), wasteAll = biz.waste.reduce((a, w) => a + w.cost, 0);
  const ft = f.lines ? pTotal(f) : 0;

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="section-title"><h2>{t("purchases")}</h2></div>
      <div className="tabs">{[["buy", "pu_buy"], ["waste", "pu_waste"], ["sup", "pu_sup"]].map(([k, l]) => <button key={k} className={`btn btn-sm ${tab === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(k)}>{t(l)}</button>)}</div>
      <div className="stat-grid">
        <div className="glass stat-card"><div className="stat-label">{t("pu_owed")}</div><div className="stat-value">{fmt(owedAll)} {cur}</div></div>
        <div className="glass stat-card"><div className="stat-label">{t("pu_wasteLoss")}</div><div className="stat-value">{fmt(wasteAll)} {cur}</div></div>
      </div>

      {tab === "buy" && (<>
        <button className="btn btn-primary btn-sm" style={{ justifySelf: "start" }} onClick={() => { setF({ date: today, supplier: "", notes: "", paid: "", currency: cur, rate: "", lines: [{ invId: "", qty: "", unit: "", price: "" }] }); setModal("buy"); }}><IconPlus />{t("pu_new")}</button>
        {biz.purchases.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : biz.purchases.map((p) => (
          <div key={p.id} className="glass card" style={{ display: "grid", gap: "0.4rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><strong><bdi dir="ltr">{p.no}</bdi> · {p.supplier || "—"}</strong><bdi dir="ltr">{p.date}</bdi></div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{p.lines.map((l) => `${l.qty} ${unitLabel(l.unit, locale)} ${inv(l.invId)?.name || ""}`).join("، ")}</div>
            <div className="mini3">{[[t("inv_total"), pTotal(p)], [t("inv_paidAmt"), p.paid], [t("inv_left"), pTotal(p) - p.paid]].map(([l, v], k) => <div key={k}><small>{l}</small><b dir="ltr" style={k === 2 && v > 0 ? { color: "var(--cyan)" } : undefined}>{fmt(v)}</b></div>)}</div>
            <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
              {pTotal(p) - p.paid > 0 && <button className="btn btn-ghost btn-sm" onClick={() => { setAmt(""); setPayFor(p); }}>{t("pu_pay")}</button>}
              <button className="icon-btn" aria-label={t("delete")} onClick={() => setDel({ fn: () => delPurchase(p) })}><IconTrash /></button></div>
          </div>))}
      </>)}

      {tab === "waste" && (<>
        <button className="btn btn-primary btn-sm" style={{ justifySelf: "start" }} onClick={() => { setF({ date: today, invId: "", qty: "", unit: "", reason: "spoiled" }); setModal("waste"); }}><IconPlus />{t("pu_wasteNew")}</button>
        {biz.waste.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : biz.waste.map((w) => (
          <div key={w.id} className="glass card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span><strong>{w.name}</strong> · {+w.qty.toFixed(4)} {unitLabel(w.unit, locale)} · {t("pu_r_" + w.reason)} <bdi dir="ltr" style={{ color: "var(--text-3)" }}>{w.date}</bdi></span>
            <span><b dir="ltr" style={{ color: "#ff8a9b" }}>− {fmt(w.cost)} {cur}</b><button className="icon-btn" aria-label={t("delete")} onClick={() => setDel({ fn: () => delWaste(w) })}><IconTrash /></button></span>
          </div>))}
      </>)}

      {tab === "sup" && (suppliers.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : suppliers.map(([n, s]) => (
        <div key={n} className="glass card" style={{ display: "grid", gap: "0.4rem" }}><strong>{n}</strong>
          <div className="mini3">{[[t("inv_total"), s.total], [t("inv_paidAmt"), s.paid], [t("inv_left"), s.total - s.paid]].map(([l, v], k) => <div key={k}><small>{l}</small><b dir="ltr" style={k === 2 && v > 0 ? { color: "var(--cyan)" } : undefined}>{fmt(v)}</b></div>)}</div></div>)))}

      {modal === "buy" && <Modal wide title={t("pu_new")} onClose={() => setModal(null)}><form onSubmit={savePurchase}>
        <Grid><F label={t("rs_date")}><input className="input" type="date" required value={f.date} onChange={set("date")} {...ltr} /></F>
          <F label={t("currency")}><CurrencyPicker value={f.currency || cur} onChange={(v) => setF((s) => ({ ...s, currency: v, rate: v === cur ? "" : biz.rates[v] || "" }))} /></F>
          {(f.currency || cur) !== cur && <F label={`1 ${f.currency} = ? ${cur}`}><input className="input" type="number" min="0" step="any" required value={f.rate || ""} onChange={set("rate")} {...ltr} /></F>}
          <F label={t("pu_supplier")}><input className="input" list="sup" value={f.supplier} onChange={set("supplier")} /><datalist id="sup">{contacts.map((c) => <option key={c.id} value={c.name} />)}</datalist></F></Grid>
        <h4 style={{ margin: "0.8rem 0 0.4rem" }}>{t("inv_items")}</h4>
        {f.lines.map((l, i) => { const it = inv(l.invId); return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 70px 84px 84px 34px", gap: "0.35rem", marginBottom: "0.35rem" }}>
            <select className="select" value={l.invId} onChange={(e) => { const n = inv(e.target.value); setLine(i, { invId: e.target.value, unit: n?.unit || "", price: n?.cost || "" }); }}><option value="">—</option>{biz.inventory.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <input className="input" type="number" min="0" step="any" dir="ltr" placeholder={t("inv_qty")} value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
            <select className="select" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })}>{(it ? compatible(it.unit) : []).map((c) => <option key={c} value={c}>{unitLabel(c, locale)}</option>)}<option value="">—</option></select>
            <input className="input" type="number" min="0" step="any" dir="ltr" placeholder={t("inv_price")} value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} />
            <button type="button" className="icon-btn" aria-label={t("delete")} disabled={f.lines.length < 2} onClick={() => setF((s) => ({ ...s, lines: s.lines.filter((_, k) => k !== i) }))}><IconTrash /></button></div>); })}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF((s) => ({ ...s, lines: [...s.lines, { invId: "", qty: "", unit: "", price: "" }] }))}><IconPlus />{t("inv_addItem")}</button>
        <Grid><F label={t("pu_paidNow")}><input className="input" type="number" min="0" step="any" value={f.paid} onChange={set("paid")} {...ltr} /></F></Grid>
        <Summary cur={cur} rows={[{ label: t("inv_total"), value: ft }, { label: t("inv_paidAmt"), value: Math.min(Number(f.paid) || 0, ft), tone: "minus" }]} total={{ label: t("inv_left"), value: Math.max(ft - (Number(f.paid) || 0), 0) }} />
        <p style={{ fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{t("pu_note")}</p>
        <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end" }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>{t("cancel")}</button><button className="btn btn-primary btn-sm">{t("save")}</button></div></form></Modal>}

      {modal === "waste" && <Modal title={t("pu_wasteNew")} onClose={() => setModal(null)}><form onSubmit={saveWaste}><Grid>
        <F label={t("stk_name") + " *"}><select className="select" required value={f.invId} onChange={(e) => setF((s) => ({ ...s, invId: e.target.value, unit: inv(e.target.value)?.unit || "" }))}><option value="">—</option>{biz.inventory.map((x) => <option key={x.id} value={x.id}>{x.name} ({stockLeft(x)})</option>)}</select></F>
        <F label={t("stk_qty")}><input className="input" type="number" min="0" step="any" required value={f.qty} onChange={set("qty")} {...ltr} /></F>
        <F label={t("stk_unit")}><select className="select" value={f.unit} onChange={set("unit")}>{(inv(f.invId) ? compatible(inv(f.invId).unit) : []).map((c) => <option key={c} value={c}>{unitLabel(c, locale)}</option>)}</select></F>
        <F label={t("pu_reason")}><select className="select" value={f.reason} onChange={set("reason")}>{REASONS.map((k) => <option key={k} value={k}>{t("pu_r_" + k)}</option>)}</select></F>
        <F label={t("rs_date")}><input className="input" type="date" value={f.date} onChange={set("date")} {...ltr} /></F></Grid>
        <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end" }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>{t("cancel")}</button><button className="btn btn-primary btn-sm">{t("save")}</button></div></form></Modal>}

      {payFor && <Modal title={`${t("pu_pay")} — ${payFor.no}`} onClose={() => setPayFor(null)}>
        <p>{t("inv_left")}: <b dir="ltr">{fmt(pTotal(payFor) - payFor.paid)} {cur}</b></p>
        <F label={t("amount")}><input className="input" type="number" min="0" step="any" value={amt} onChange={(e) => setAmt(e.target.value)} {...ltr} /></F>
        <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end" }}><button className="btn btn-ghost btn-sm" onClick={() => setPayFor(null)}>{t("cancel")}</button><button className="btn btn-primary btn-sm" onClick={addPayment}>{t("pu_pay")}</button></div></Modal>}
      {del && <ConfirmDialog title={t("delete")} message={t("b_confirmDelete")} onConfirm={del.fn} onClose={() => setDel(null)} />}
    </div>
  );
}
