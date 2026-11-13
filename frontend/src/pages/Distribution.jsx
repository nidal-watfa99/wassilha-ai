import React, { useState } from "react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Modal, EmptyState, ConfirmDialog } from "../components/UI";
import { IconBox, IconPlus, IconEdit, IconTrash } from "../components/Icons";
import { F, Grid, ltr, useForm } from "../components/Form";
import Summary from "../components/Summary";
import CurrencyPicker from "../components/CurrencyPicker";
import UnitPicker from "../components/UnitPicker";
import ItemPicker from "../components/ItemPicker";
import { useBiz, upsert, remove, update, uid, fmt, nextNo, todayStr, totals, finOf, stockLeft, paidOf } from "../services/biz";
import { convert, compatible, unitLabel } from "../services/units";
import { allocate, batchState, getExpiring, tierPrice, collectPlan } from "../services/distribution";
import { waPhone } from "../services/phone";

const FLOW = ["confirmed", "loaded", "delivered"];
const unitK = (it, unit) => (unit && it.unit && unit !== it.unit ? convert(1, unit, it.unit) || 1 : 1);   // item-units in one line-unit
const calc = (o) => { const items = o.lines.map((l) => ({ desc: l.name, qty: Number(l.qty) || 0, price: Number(l.price) || 0 })); return { items, ...totals({ items, discount: o.discount, tax: o.tax }) }; };
const L = ({ label, children }) => <div style={{ display: "grid", gap: 3 }}><small style={{ color: "var(--text-3)" }}>{label}</small>{children}</div>;

export default function Distribution() {
  const { t, locale, toast } = useApp();
  const biz = useBiz(), cur = biz.currency, today = todayStr();
  const [tab, setTab] = useState("orders"), [modal, setModal] = useState(null), [del, setDel] = useState(null), [contacts, setContacts] = useState([]), [col, setCol] = useState({ amount: "", method: "cash" });
  React.useEffect(() => { api.get("/contacts").then((d) => setContacts(d.items || [])).catch(() => {}); }, []);
  const [f, set, setF] = useForm({});
  const close = () => setModal(null);
  const it = (id) => biz.inventory.find((i) => i.id === id);
  const drivers = biz.employees.filter((e) => e.role === "driver" && e.status !== "ended");
  const cust = (name) => contacts.find((c) => c.name === name);
  const tier = (name) => biz.profiles[cust(name)?.id]?.tier || "retail";
  const areaOf = (o) => o.area || biz.areas.find((a) => a.id === o.areaId)?.name || "";
  const open = (kind, x, init) => { setF(x ? { ...x, lines: (x.lines || []).map((l) => ({ ...l })) } : init); setModal({ kind, x }); };
  const blankLine = () => ({ invId: "", name: "", qty: 1, bonus: "", unit: "", price: "" });
  const oc = f.currency || cur, fxOf = (o) => ((o.currency || cur) === cur ? 1 : Number(o.fx) || biz.rates[o.currency] || 0);
  const ensureArea = (name) => { const n = (name || "").trim(); if (n && !biz.areas.some((a) => a.name === n)) upsert("areas", { id: uid(), name: n, driver: "", day: "" }); };

  /* price of an item line = the customer's price level, converted to the order's unit and currency */
  const priced = (l, patch, name, fx) => {
    const m = { ...l, ...patch }, item = it(m.invId);
    if (item && (patch.invId !== undefined || patch.unit !== undefined || patch.reprice)) {
      const u = patch.invId !== undefined ? item.unit : m.unit; m.unit = u; m.name = item.name;
      m.price = fx ? +((tierPrice(item, tier(name)) * unitK(item, u)) / fx).toFixed(4) : "";
    }
    delete m.reprice; return m;
  };
  const fxNow = fxOf(f);
  const setLine = (i, patch) => setF((p) => ({ ...p, lines: p.lines.map((l, k) => (k === i ? priced(l, patch, p.customer, fxOf(p)) : l)) }));
  const repriceAll = (p, next) => ({ ...p, ...next, lines: p.lines.map((l) => (l.invId ? priced(l, { reprice: true }, p.customer, fxOf({ ...p, ...next })) : l)) });
  const newOrder = () => open("order", null, { customer: "", area: "", driver: "", date: today, currency: cur, fx: "", lines: [blankLine()], discount: 0, tax: biz.taxRate, paidNow: "", notes: "", status: "draft" });
  const pickCustomer = (name) => { const c = cust(name), a = biz.profiles[c?.id]?.area; setF((p) => repriceAll(p, { customer: name, area: p.area || a || "" })); };
  const clean = (lines) => lines.filter((l) => String(l.name).trim() && Number(l.qty) > 0);
  const saveDraft = (e) => { e.preventDefault(); const lines = clean(f.lines); if (!lines.length) return toast(t("ds_needItems"), "error"); if (!fxNow) return toast(t("fx_missing"), "error"); ensureArea(f.area); upsert("dorders", { id: modal.x?.id || uid(), no: modal.x?.no || nextNo("dorder"), ...(modal.x || {}), ...f, lines }); close(); };

  /* confirm: stock + credit checks, stock out (earliest expiry first), invoice. Free items are billed but never touch stock. */
  const confirmOrder = (o) => {
    if (!fxOf(o)) return toast(t("fx_missing"), "error");
    const c = calc(o), need = {};
    for (const l of o.lines.filter((x) => x.invId)) { const item = it(l.invId); if (!item) return toast(t("ds_missingItem"), "error"); need[l.invId] = (need[l.invId] || 0) + (Number(l.qty) + (Number(l.bonus) || 0)) * unitK(item, l.unit); }
    for (const [id, q] of Object.entries(need)) if (stockLeft(it(id)) < q - 1e-9) return toast(`${t("ds_noStock")}: ${it(id).name}`, "error");
    const fx = fxOf(o), prof = biz.profiles[cust(o.customer)?.id], lim = (Number(prof?.creditLimit) || 0) * (prof?.creditCur && prof.creditCur !== cur ? Number(prof.creditFx) || biz.rates[prof.creditCur] || 0 : 1);
    const paid = Math.min(Number(o.paidNow) || 0, c.total);
    if (lim > 0 && !o.override && finOf(biz, o.customer).left + (c.total - paid) * fx > lim) { setF((p) => ({ ...p, creditWarn: true })); return toast(t("ds_overCredit"), "error"); }
    const no = nextNo("invoice"), taken = [];
    update((s) => {
      let batches = s.batches;
      const inv = s.inventory.map((i) => {
        if (!need[i.id]) return i;
        const { used } = allocate(batches, i.id, need[i.id]);
        batches = batches.map((b) => { const u = used.find((x) => x.batchId === b.id); return u ? { ...b, remaining: +(b.remaining - u.qty).toFixed(6) } : b; });
        used.forEach((u) => taken.push({ item: i.name, lot: u.lot, expiry: u.expiry, qty: u.qty }));
        return { ...i, qtyOut: (Number(i.qtyOut) || 0) + need[i.id] };
      });
      return { ...s, inventory: inv, batches };
    });
    const items = o.lines.flatMap((l) => [{ desc: l.name, qty: Number(l.qty), price: Number(l.price) || 0, unit: l.unit }, ...(Number(l.bonus) > 0 ? [{ desc: `${l.name} (${t("ds_bonus")})`, qty: Number(l.bonus), price: 0, unit: l.unit }] : [])]);
    upsert("invoices", { id: uid(), no, type: "invoice", customer: o.customer, issueDate: today, dueDate: "", fx, cost: +Object.entries(need).reduce((a, [id, q]) => a + q * (Number(it(id).cost) || 0), 0).toFixed(2), currency: o.currency || cur, discount: o.discount || 0, tax: o.tax || 0, notes: o.no, paidAmount: paid, status: paid >= c.total - 0.005 ? "paid" : paid > 0 ? "partial" : "unpaid", items });
    ensureArea(o.area); upsert("dorders", { ...o, status: "confirmed", invoiceNo: no, batchesUsed: taken, confirmedAt: today }); close();
    toast(`${t("ho_invoiced")} ${no}`, "success");
  };
  const step = (o) => upsert("dorders", { ...o, status: FLOW[FLOW.indexOf(o.status) + 1] });

  /* ---------- accounts, collection, expiry ---------- */
  const collect = () => {
    const amount = Number(col.amount) || 0; if (amount <= 0) return;
    const invs = biz.invoices.filter((i) => i.type === "invoice" && i.customer === modal.x.name && (i.status === "unpaid" || i.status === "partial") && (i.currency || cur) === cur).map((i) => ({ id: i.id, issueDate: i.issueDate, total: totals(i).total, paid: paidOf(i) }));
    const { plan, unallocated } = collectPlan(invs, amount);
    plan.forEach((p) => { const i = biz.invoices.find((x) => x.id === p.id), np = paidOf(i) + p.pay, tot = totals(i).total; upsert("invoices", { ...i, paidAmount: np, status: np >= tot - 0.005 ? "paid" : "partial" }); });
    upsert("receipts", { id: uid(), date: today, customer: modal.x.name, amount: amount - unallocated, method: col.method, invoices: plan.map((p) => p.id) });
    toast(unallocated > 0 ? `${t("ds_extra")}: ${fmt(unallocated)}` : t("ds_collected"), unallocated > 0 ? "error" : "success"); setCol({ amount: "", method: "cash" }); close();
  };
  const writeOff = (b) => { const item = it(b.invId); update((s) => ({ ...s, batches: s.batches.map((x) => (x.id === b.id ? { ...x, remaining: 0 } : x)), inventory: s.inventory.map((i) => (i.id === b.invId ? { ...i, qtyOut: (Number(i.qtyOut) || 0) + b.remaining } : i)) })); upsert("waste", { id: uid(), date: today, invId: b.invId, name: item?.name || "", qty: b.remaining, unit: item?.unit || "", reason: "expired", cost: b.remaining * (Number(item?.cost) || 0) }); };

  const cf = f.lines ? calc(f) : null, rows = biz.dorders.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")), exp = getExpiring(biz);
  const areaNames = [...new Set([...biz.areas.map((a) => a.name), ...biz.dorders.map(areaOf)].filter(Boolean))];

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="section-title"><h2>{t("distribution")}</h2><button className="btn btn-primary btn-sm" onClick={newOrder}><IconPlus />{t("ds_newOrder")}</button></div>
      <div className="tabs">{[["orders", "ds_orders"], ["deliver", "ds_deliver"], ["accounts", "ds_accounts"], ["expiry", "ds_expiry"], ["areas", "ds_areas"]].map(([k, l]) => <button key={k} className={`btn btn-sm ${tab === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(k)}>{t(l)}{k === "expiry" && exp.length > 0 ? ` (${exp.length})` : ""}</button>)}</div>

      {tab === "orders" && (rows.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : rows.map((o) => { const c = calc(o); return (
        <div key={o.id} className="glass card" style={{ display: "grid", gap: "0.4rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}><strong><bdi dir="ltr">{o.no}</bdi> · {o.customer}</strong><span className={`badge ${o.status === "draft" ? "" : o.status === "delivered" ? "badge-green" : "badge-blue"}`}>{t("ds_st_" + o.status)}</span></div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{[areaOf(o), o.date].filter(Boolean).join(" · ")} · {o.lines.map((l) => `${l.qty}${l.bonus > 0 ? `+${l.bonus}` : ""} ${l.name}`).join("، ")}</div>
          <b dir="ltr">{fmt(c.total)} {o.currency || cur}{o.invoiceNo && <small style={{ color: "var(--text-3)" }}> · {o.invoiceNo}</small>}</b>
          <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
            {o.status === "draft" && <button className="btn btn-primary btn-sm" onClick={() => confirmOrder(o)}>{t("ds_confirm")}</button>}
            {o.status === "draft" && <button className="icon-btn" aria-label={t("b_edit")} onClick={() => open("order", o)}><IconEdit /></button>}
            {o.status === "draft" && <button className="icon-btn" aria-label={t("delete")} onClick={() => setDel({ fn: () => remove("dorders", o.id) })}><IconTrash /></button>}
          </div></div>); }))}

      {tab === "deliver" && (() => {
        const live = biz.dorders.filter((o) => o.status === "confirmed" || o.status === "loaded"), names = [...new Set(live.map(areaOf))];
        return names.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : names.map((n) => { const a = biz.areas.find((x) => x.name === n); return (
          <div key={n} className="glass card" style={{ display: "grid", gap: "0.4rem" }}><strong>📍 {n || t("ds_noArea")}{a?.driver && ` · 🛵 ${biz.employees.find((e) => e.id === a.driver)?.fullName || ""}`}</strong>
            {live.filter((o) => areaOf(o) === n).map((o) => <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", fontSize: "var(--text-sm)" }}>
              <span>{o.customer} · <bdi dir="ltr">{o.no}</bdi> · {t("ds_st_" + o.status)}</span>
              <span style={{ display: "flex", gap: "0.3rem" }}>{cust(o.customer)?.phone && <a className="btn btn-ghost btn-sm" href={`tel:${cust(o.customer).phone}`}>📞</a>}
                {cust(o.customer)?.phone && <a className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer" href={`https://wa.me/${waPhone(cust(o.customer).phone)}`}>WhatsApp</a>}
                <button className="btn btn-primary btn-sm" onClick={() => step(o)}>{o.status === "confirmed" ? t("ds_load") : t("ds_deliveredBtn")}</button></span></div>)}</div>); });
      })()}

      {tab === "accounts" && (contacts.length === 0 ? <EmptyState icon={<IconBox />} text={t("ds_needContacts")} /> : contacts.map((c) => { const fi = finOf(biz, c.name), pf = biz.profiles[c.id]; return (
        <div key={c.id} className="glass card" style={{ display: "grid", gap: "0.4rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}><strong>{c.name}</strong><span className="badge badge-blue">{t("ds_t_" + (pf?.tier || "retail"))}</span></div>
          {fi.n > 0 && <div className="mini3">{[[t("inv_total"), fi.total], [t("inv_paidAmt"), fi.paid], [t("inv_left"), fi.left]].map(([l, v], k) => <div key={k}><small>{l}</small><b dir="ltr" style={k === 2 && v > 0 ? { color: "var(--cyan)" } : undefined}>{fmt(v)}</b></div>)}</div>}
          {fi.left > 0.005 && <button className="btn btn-ghost btn-sm" style={{ justifySelf: "start" }} onClick={() => { setCol({ amount: "", method: "cash" }); setModal({ kind: "collect", x: c }); }}>{t("ds_collect")}</button>}</div>); }))}

      {tab === "expiry" && (<>
        {biz.batches.filter((b) => b.remaining > 0).length === 0 ? <EmptyState icon={<IconBox />} text={t("ds_noBatches")} /> : biz.batches.filter((b) => b.remaining > 0).sort((a, b) => (a.expiry || "9").localeCompare(b.expiry || "9")).map((b) => { const s = batchState(b, Number(biz.expiryDays) || 90); return (
          <div key={b.id} className="glass card" style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <span><strong>{it(b.invId)?.name}</strong> · {t("ds_lot")} <bdi dir="ltr">{b.lot || "—"}</bdi> · {+b.remaining.toFixed(4)} {unitLabel(it(b.invId)?.unit, locale)}</span>
            <span><bdi dir="ltr">{b.expiry || "—"}</bdi> <span className={`badge ${s === "expired" ? "badge-red" : s === "soon" ? "badge-violet" : "badge-green"}`}>{t("ds_e_" + s)}</span>
              {s === "expired" && <button className="btn btn-ghost btn-sm" onClick={() => writeOff(b)}>{t("ds_writeOff")}</button>}</span></div>); })}
        <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{t("ds_expNote")}</p></>)}

      {tab === "areas" && (<>
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{t("ds_areasHelp")}</p>
        <button className="btn btn-primary btn-sm" style={{ justifySelf: "start" }} onClick={() => open("area", null, { name: "", driver: "", day: "" })}><IconPlus />{t("ds_newArea")}</button>
        {biz.areas.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : biz.areas.map((a) => <div key={a.id} className="glass card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
          <span><strong>{a.name}</strong>{a.day && ` · ${a.day}`}{a.driver && ` · 🛵 ${biz.employees.find((e) => e.id === a.driver)?.fullName || ""}`}</span>
          <span><button className="icon-btn" aria-label={t("b_edit")} onClick={() => open("area", a)}><IconEdit /></button><button className="icon-btn" aria-label={t("delete")} onClick={() => setDel({ fn: () => remove("areas", a.id) })}><IconTrash /></button></span></div>)}</>)}

      {modal?.kind === "order" && <Modal wide title={modal.x ? modal.x.no : t("ds_newOrder")} onClose={close}><form onSubmit={saveDraft}>
        <Grid>
          <F label={t("ds_customer") + " *"}><input className="input" required list="dc" value={f.customer} onChange={(e) => pickCustomer(e.target.value)} /><datalist id="dc">{contacts.map((c) => <option key={c.id} value={c.name} />)}</datalist></F>
          <F label={t("ds_area")}><input className="input" list="da" placeholder={t("ds_areaPh")} value={f.area} onChange={set("area")} /><datalist id="da">{areaNames.map((n) => <option key={n} value={n} />)}</datalist></F>
          <F label={t("rs_date")}><input className="input" type="date" value={f.date} onChange={set("date")} {...ltr} /></F>
          <F label={t("ds_orderCur")}><CurrencyPicker value={oc} onChange={(v) => setF((p) => repriceAll(p, { currency: v, fx: v === cur ? "" : biz.rates[v] || "" }))} /></F>
          {oc !== cur && <F label={`1 ${oc} = ? ${cur}`}><input className="input" type="number" min="0" step="any" required value={f.fx || ""} onChange={set("fx")} {...ltr} /></F>}
        </Grid>
        {oc !== cur && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF((p) => repriceAll(p, {}))}>↻ {t("ds_reprice")}</button>}
        {f.customer && <p style={{ margin: "0.3rem 0", fontSize: "var(--text-sm)", color: "var(--text-3)" }}>{t("ds_tier")}: <b>{t("ds_t_" + tier(f.customer))}</b></p>}
        <h4 style={{ margin: "0.7rem 0 0.2rem" }}>{t("inv_items")}</h4>
        {f.lines.map((l, i) => { const item = it(l.invId), need = item ? (Number(l.qty) + (Number(l.bonus) || 0)) * unitK(item, l.unit) : 0, short = item && need > stockLeft(item) + 1e-9; return (
          <div key={i} className="glass card" style={{ padding: "0.6rem", display: "grid", gap: "0.5rem", margin: "0.4rem 0" }}>
            <L label={t("ds_item")}><ItemPicker items={biz.inventory} value={l.name} placeholder={t("ds_itemPh")} onText={(txt) => setLine(i, { name: txt, invId: "" })} onPick={(x) => setLine(i, { invId: x.id })} /></L>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <L label={t("inv_qty")}><input className="input" type="number" min="0" step="any" dir="ltr" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} /></L>
              <L label={t("stk_unit")}>{item ? <select className="select" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })}>{compatible(item.unit).map((c) => <option key={c} value={c}>{unitLabel(c, locale)}</option>)}</select> : <UnitPicker value={l.unit} onChange={(v) => setLine(i, { unit: v })} />}</L>
              <L label={`${t("ds_unitPrice")} (${oc})`}><input className="input" type="number" min="0" step="any" dir="ltr" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} /></L>
              <L label={t("ds_bonusLabel")}><input className="input" type="number" min="0" step="any" dir="ltr" placeholder="0" value={l.bonus} onChange={(e) => setLine(i, { bonus: e.target.value })} /></L>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-sm)", gap: "0.5rem", flexWrap: "wrap" }}>
              <span style={{ color: short ? "#ff8a9b" : "var(--text-3)" }}>{item ? `${t("stk_left")}: ${+stockLeft(item).toFixed(3)} ${unitLabel(item.unit, locale)}${short ? " ⚠" : ""}` : l.name ? t("ds_freeItem") : ""}</span>
              <b dir="ltr">{fmt((Number(l.qty) || 0) * (Number(l.price) || 0))} {oc}</b>
              <button type="button" className="icon-btn" aria-label={t("delete")} disabled={f.lines.length < 2} onClick={() => setF((p) => ({ ...p, lines: p.lines.filter((_, k) => k !== i) }))}><IconTrash /></button></div></div>); })}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF((p) => ({ ...p, lines: [...p.lines, blankLine()] }))}><IconPlus />{t("inv_addItem")}</button>
        <Grid>
          <F label={t("inv_discount")}><input className="input" type="number" min="0" max="100" step="any" value={f.discount} onChange={set("discount")} {...ltr} /></F>
          <F label={t("inv_tax")}><input className="input" type="number" min="0" max="100" step="any" value={f.tax} onChange={set("tax")} {...ltr} /></F>
          <F label={`${t("ds_paidNow")} (${oc})`}><input className="input" type="number" min="0" step="any" value={f.paidNow} onChange={set("paidNow")} {...ltr} /></F>
        </Grid>
        <div style={{ margin: "0.5rem 0" }}><Summary cur={oc} rows={[{ label: t("inv_sub"), value: cf.sub, sub: true }, { label: t("inv_discAmt"), value: cf.disc, tone: "minus" }, { label: t("inv_taxAmt"), value: cf.tax, tone: "plus" }, { label: t("inv_paidAmt"), value: Math.min(Number(f.paidNow) || 0, cf.total), tone: "minus" }]} total={{ label: t("inv_left"), value: Math.max(cf.total - (Number(f.paidNow) || 0), 0) }} /></div>
        {f.creditWarn && <div style={{ color: "#ff8a9b", fontSize: "var(--text-sm)", marginBottom: "0.4rem" }}>⚠ {t("ds_overCredit")} <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF((p) => ({ ...p, override: true, creditWarn: false }))}>{t("ds_override")}</button></div>}
        <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={close}>{t("cancel")}</button><button className="btn btn-ghost btn-sm">{t("ds_saveDraft")}</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => { const lines = clean(f.lines); if (!f.customer || !lines.length) return toast(t("ds_needItems"), "error"); confirmOrder({ id: modal.x?.id || uid(), no: modal.x?.no || nextNo("dorder"), ...(modal.x || {}), ...f, lines }); }}>{t("ds_confirm")}</button></div>
      </form></Modal>}
      {modal?.kind === "collect" && <Modal title={`${t("ds_collect")} — ${modal.x.name}`} onClose={close}>
        <p>{t("inv_left")}: <b dir="ltr">{fmt(finOf(biz, modal.x.name).left)} {cur}</b></p>
        <Grid><F label={`${t("amount")} (${cur})`}><input className="input" type="number" min="0" step="any" value={col.amount} onChange={(e) => setCol({ ...col, amount: e.target.value })} {...ltr} /></F>
          <F label={t("rs_method")}><select className="select" value={col.method} onChange={(e) => setCol({ ...col, method: e.target.value })}>{["cash", "card", "transfer", "wallet"].map((k) => <option key={k} value={k}>{t("exp_m_" + k)}</option>)}</select></F></Grid>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{t("ds_collectNote")}</p>
        <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end" }}><button className="btn btn-ghost btn-sm" onClick={close}>{t("cancel")}</button><button className="btn btn-primary btn-sm" onClick={collect}>{t("ds_collect")}</button></div></Modal>}
      {modal?.kind === "area" && <Modal title={t("ds_newArea")} onClose={close}><form onSubmit={(e) => { e.preventDefault(); upsert("areas", { id: modal.x?.id || uid(), ...(modal.x || {}), ...f }); close(); }}><Grid>
        <F label={t("map_name") + " *"}><input className="input" required value={f.name} onChange={set("name")} /></F>
        <F label={t("rs_driver")}><select className="select" value={f.driver} onChange={set("driver")}><option value="">—</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}</select></F>
        <F label={t("ds_day")}><input className="input" value={f.day} onChange={set("day")} /></F></Grid>
        <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end", marginTop: "0.6rem" }}><button type="button" className="btn btn-ghost btn-sm" onClick={close}>{t("cancel")}</button><button className="btn btn-primary btn-sm">{t("save")}</button></div></form></Modal>}
      {del && <ConfirmDialog title={t("delete")} message={t("b_confirmDelete")} onConfirm={del.fn} onClose={() => setDel(null)} />}
    </div>
  );
}
