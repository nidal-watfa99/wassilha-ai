import React, { useState } from "react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Modal, EmptyState, ConfirmDialog } from "../components/UI";
import { IconBox, IconPlus, IconEdit, IconTrash } from "../components/Icons";
import { F, Grid, ltr, useForm } from "../components/Form";
import Summary from "../components/Summary";
import { useBiz, upsert, remove, update, uid, fmt, nextNo, todayStr, totals, finOf, stockLeft, paidOf, leftOf } from "../services/biz";
import { convert, compatible, unitLabel } from "../services/units";
import { allocate, batchState, getExpiring, tierPrice, collectPlan } from "../services/distribution";
import { waPhone } from "../services/phone";

const FLOW = ["confirmed", "loaded", "delivered"];
const unitK = (it, unit) => (unit && it.unit && unit !== it.unit ? convert(1, unit, it.unit) || 1 : 1);   // how many item-units one line-unit is
const calc = (o) => {
  const items = o.lines.flatMap((l) => [{ desc: l.name, qty: Number(l.qty) || 0, price: Number(l.price) || 0 }]);
  return { items, ...totals({ items, discount: o.discount, tax: o.tax }) };
};

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
  const areaName = (id) => biz.areas.find((a) => a.id === id)?.name || "";
  const open = (kind, x, init) => { setF(x ? { ...x, lines: (x.lines || []).map((l) => ({ ...l })) } : init); setModal({ kind, x }); };
  const blankLine = () => ({ invId: "", name: "", qty: 1, bonus: "", unit: "", price: "" });
  const autoLine = (l, patch, name) => {
    const m = { ...l, ...patch }, item = it(m.invId);
    if (item && (patch.invId !== undefined || patch.unit !== undefined)) { const u = patch.invId !== undefined ? item.unit : m.unit; m.unit = u; m.name = item.name; m.price = +(tierPrice(item, tier(name)) * unitK(item, u)).toFixed(4); }
    return m;
  };
  const setLine = (i, patch) => setF((p) => ({ ...p, lines: p.lines.map((l, k) => (k === i ? autoLine(l, patch, p.customer) : l)) }));
  const newOrder = () => biz.inventory.length ? open("order", null, { customer: "", areaId: "", driver: "", date: today, lines: [blankLine()], discount: 0, tax: biz.taxRate, paidNow: "", notes: "", status: "draft" }) : toast(t("ds_needItems"), "error");
  const pickCustomer = (name) => { const c = cust(name), a = biz.profiles[c?.id]?.areaId; setF((p) => ({ ...p, customer: name, areaId: a || p.areaId, lines: p.lines.map((l) => (l.invId ? autoLine(l, { unit: l.unit }, name) : l)) })); };
  const saveDraft = (e) => { e.preventDefault(); const lines = f.lines.filter((l) => l.invId && Number(l.qty) > 0); if (!lines.length) return toast(t("ds_needItems"), "error"); upsert("dorders", { id: modal.x?.id || uid(), no: modal.x?.no || nextNo("dorder"), ...(modal.x || {}), ...f, lines }); close(); };

  /* confirm: check stock and credit, take stock FEFO, issue the invoice */
  const confirmOrder = (o) => {
    const c = calc(o), need = {};
    for (const l of o.lines) { const item = it(l.invId); if (!item) return toast(t("ds_missingItem"), "error"); need[l.invId] = (need[l.invId] || 0) + (Number(l.qty) + (Number(l.bonus) || 0)) * unitK(item, l.unit); }
    for (const [id, q] of Object.entries(need)) if (stockLeft(it(id)) < q - 1e-9) return toast(`${t("ds_noStock")}: ${it(id).name}`, "error");
    const prof = biz.profiles[cust(o.customer)?.id], lim = (Number(prof?.creditLimit) || 0) * (prof?.creditCur && prof.creditCur !== cur ? Number(prof.creditFx) || biz.rates[prof.creditCur] || 0 : 1);
    const paid = Math.min(Number(o.paidNow) || 0, c.total);
    if (lim > 0 && !o.override && finOf(biz, o.customer).left + (c.total - paid) > lim) { setF((p) => ({ ...p, creditWarn: true })); return toast(t("ds_overCredit"), "error"); }
    const no = nextNo("invoice"), taken = [];
    update((s) => {
      let batches = s.batches; const inv = s.inventory.map((i) => {
        if (!need[i.id]) return i;
        const { used } = allocate(batches, i.id, need[i.id]);
        batches = batches.map((b) => { const u = used.find((x) => x.batchId === b.id); return u ? { ...b, remaining: +(b.remaining - u.qty).toFixed(6) } : b; });
        used.forEach((u) => taken.push({ item: i.name, lot: u.lot, expiry: u.expiry, qty: u.qty }));
        return { ...i, qtyOut: (Number(i.qtyOut) || 0) + need[i.id] };
      });
      return { ...s, inventory: inv, batches };
    });
    const items = o.lines.flatMap((l) => [{ desc: l.name, qty: Number(l.qty), price: Number(l.price) || 0, unit: l.unit }, ...(Number(l.bonus) > 0 ? [{ desc: `${l.name} (${t("ds_bonus")})`, qty: Number(l.bonus), price: 0, unit: l.unit }] : [])]);
    upsert("invoices", { id: uid(), no, type: "invoice", customer: o.customer, issueDate: today, dueDate: "", currency: cur, discount: o.discount || 0, tax: o.tax || 0, notes: o.no, paidAmount: paid, status: paid >= c.total - 0.005 ? "paid" : paid > 0 ? "partial" : "unpaid", items });
    upsert("dorders", { ...o, status: "confirmed", invoiceNo: no, batchesUsed: taken, confirmedAt: today }); close();
    toast(`${t("ho_invoiced")} ${no}`, "success");
  };
  const step = (o) => upsert("dorders", { ...o, status: FLOW[FLOW.indexOf(o.status) + 1] });

  /* ---------- accounts & collection ---------- */
  const collect = () => {
    const amount = Number(col.amount) || 0; if (amount <= 0) return;
    const invs = biz.invoices.filter((i) => i.type === "invoice" && i.customer === modal.x.name && (i.status === "unpaid" || i.status === "partial") && (i.currency || cur) === cur).map((i) => ({ id: i.id, issueDate: i.issueDate, total: totals(i).total, paid: paidOf(i) }));
    const { plan, unallocated } = collectPlan(invs, amount);
    plan.forEach((p) => { const i = biz.invoices.find((x) => x.id === p.id), np = paidOf(i) + p.pay, tot = totals(i).total; upsert("invoices", { ...i, paidAmount: np, status: np >= tot - 0.005 ? "paid" : "partial" }); });
    upsert("receipts", { id: uid(), date: today, customer: modal.x.name, amount: amount - unallocated, method: col.method, invoices: plan.map((p) => p.id) });
    toast(unallocated > 0 ? `${t("ds_extra")}: ${fmt(unallocated)}` : t("ds_collected"), unallocated > 0 ? "error" : "success"); setCol({ amount: "", method: "cash" }); close();
  };
  const writeOff = (b) => { const item = it(b.invId); update((s) => ({ ...s, batches: s.batches.map((x) => (x.id === b.id ? { ...x, remaining: 0 } : x)), inventory: s.inventory.map((i) => (i.id === b.invId ? { ...i, qtyOut: (Number(i.qtyOut) || 0) + b.remaining } : i)) })); upsert("waste", { id: uid(), date: today, invId: b.invId, name: item?.name || "", qty: b.remaining, unit: item?.unit || "", reason: "expired", cost: b.remaining * (Number(item?.cost) || 0) }); };

  const cf = f.lines ? calc(f) : null, rows = biz.dorders.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const exp = getExpiring(biz);

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="section-title"><h2>{t("distribution")}</h2><button className="btn btn-primary btn-sm" onClick={newOrder}><IconPlus />{t("ds_newOrder")}</button></div>
      <div className="tabs">{[["orders", "ds_orders"], ["deliver", "ds_deliver"], ["accounts", "ds_accounts"], ["expiry", "ds_expiry"], ["areas", "ds_areas"]].map(([k, l]) => <button key={k} className={`btn btn-sm ${tab === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(k)}>{t(l)}{k === "expiry" && exp.length > 0 ? ` (${exp.length})` : ""}</button>)}</div>

      {tab === "orders" && (rows.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : rows.map((o) => { const c = calc(o); return (
        <div key={o.id} className="glass card" style={{ display: "grid", gap: "0.4rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}><strong><bdi dir="ltr">{o.no}</bdi> · {o.customer}</strong><span className={`badge ${o.status === "draft" ? "" : o.status === "delivered" ? "badge-green" : "badge-blue"}`}>{t("ds_st_" + o.status)}</span></div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{[areaName(o.areaId), o.date].filter(Boolean).join(" · ")} · {o.lines.map((l) => `${l.qty}${l.bonus > 0 ? `+${l.bonus}` : ""} ${l.name}`).join("، ")}</div>
          <b dir="ltr">{fmt(c.total)} {cur}{o.invoiceNo && <small style={{ color: "var(--text-3)" }}> · {o.invoiceNo}</small>}</b>
          <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
            {o.status === "draft" && <button className="btn btn-primary btn-sm" onClick={() => confirmOrder(o)}>{t("ds_confirm")}</button>}
            {o.status === "draft" && <button className="icon-btn" aria-label={t("b_edit")} onClick={() => open("order", o)}><IconEdit /></button>}
            {o.status === "draft" && <button className="icon-btn" aria-label={t("delete")} onClick={() => setDel({ fn: () => remove("dorders", o.id) })}><IconTrash /></button>}
          </div></div>); }))}

      {tab === "deliver" && (() => {
        const live = biz.dorders.filter((o) => o.status === "confirmed" || o.status === "loaded");
        const groups = [...biz.areas, { id: "", name: t("ds_noArea") }].map((a) => [a, live.filter((o) => (o.areaId || "") === a.id)]).filter(([, l]) => l.length);
        return groups.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : groups.map(([a, l]) => (
          <div key={a.id} className="glass card" style={{ display: "grid", gap: "0.4rem" }}><strong>📍 {a.name}{a.driver && ` · 🛵 ${biz.employees.find((e) => e.id === a.driver)?.fullName || ""}`}</strong>
            {l.map((o) => <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", fontSize: "var(--text-sm)" }}>
              <span>{o.customer} · <bdi dir="ltr">{o.no}</bdi> · {t("ds_st_" + o.status)}</span>
              <span style={{ display: "flex", gap: "0.3rem" }}>{cust(o.customer)?.phone && <a className="btn btn-ghost btn-sm" href={`tel:${cust(o.customer).phone}`}>📞</a>}
                {cust(o.customer)?.phone && <a className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer" href={`https://wa.me/${waPhone(cust(o.customer).phone)}`}>WhatsApp</a>}
                <button className="btn btn-primary btn-sm" onClick={() => step(o)}>{o.status === "confirmed" ? t("ds_load") : t("ds_deliveredBtn")}</button></span></div>)}</div>));
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
        <button className="btn btn-primary btn-sm" style={{ justifySelf: "start" }} onClick={() => open("area", null, { name: "", driver: "", day: "" })}><IconPlus />{t("ds_newArea")}</button>
        {biz.areas.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : biz.areas.map((a) => <div key={a.id} className="glass card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
          <span><strong>{a.name}</strong>{a.day && ` · ${a.day}`}{a.driver && ` · 🛵 ${biz.employees.find((e) => e.id === a.driver)?.fullName || ""}`}</span>
          <span><button className="icon-btn" aria-label={t("b_edit")} onClick={() => open("area", a)}><IconEdit /></button><button className="icon-btn" aria-label={t("delete")} onClick={() => setDel({ fn: () => remove("areas", a.id) })}><IconTrash /></button></span></div>)}</>)}

      {modal?.kind === "order" && <Modal wide title={modal.x ? modal.x.no : t("ds_newOrder")} onClose={close}><form onSubmit={saveDraft}>
        <Grid>
          <F label={t("ds_customer") + " *"}><input className="input" required list="dc" value={f.customer} onChange={(e) => pickCustomer(e.target.value)} /><datalist id="dc">{contacts.map((c) => <option key={c.id} value={c.name} />)}</datalist></F>
          <F label={t("ds_area")}><select className="select" value={f.areaId} onChange={set("areaId")}><option value="">—</option>{biz.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></F>
          <F label={t("rs_date")}><input className="input" type="date" value={f.date} onChange={set("date")} {...ltr} /></F>
        </Grid>
        {f.customer && <p style={{ margin: "0 0 0.4rem", fontSize: "var(--text-sm)", color: "var(--text-3)" }}>{t("ds_tier")}: <b>{t("ds_t_" + tier(f.customer))}</b></p>}
        {f.lines.map((l, i) => { const item = it(l.invId); return (
          <div key={i} className="glass card" style={{ padding: "0.5rem", display: "grid", gap: "0.35rem", margin: "0.4rem 0" }}>
            <select className="select" value={l.invId} onChange={(e) => setLine(i, { invId: e.target.value })}><option value="">—</option>{biz.inventory.map((x) => <option key={x.id} value={x.id}>{x.name} ({+stockLeft(x).toFixed(3)})</option>)}</select>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.35rem" }}>
              <input className="input" type="number" min="0" step="any" dir="ltr" placeholder={t("inv_qty")} value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
              <input className="input" type="number" min="0" step="any" dir="ltr" placeholder={t("ds_bonus")} value={l.bonus} onChange={(e) => setLine(i, { bonus: e.target.value })} />
              <select className="select" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })}>{(item ? compatible(item.unit) : []).map((c) => <option key={c} value={c}>{unitLabel(c, locale)}</option>)}</select>
              <input className="input" type="number" min="0" step="any" dir="ltr" placeholder={t("inv_price")} value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} /></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}><bdi dir="ltr">{fmt((Number(l.qty) || 0) * (Number(l.price) || 0))} {cur}</bdi><button type="button" className="icon-btn" aria-label={t("delete")} disabled={f.lines.length < 2} onClick={() => setF((p) => ({ ...p, lines: p.lines.filter((_, k) => k !== i) }))}><IconTrash /></button></div></div>); })}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF((p) => ({ ...p, lines: [...p.lines, blankLine()] }))}><IconPlus />{t("inv_addItem")}</button>
        <Grid>
          <F label={t("inv_discount")}><input className="input" type="number" min="0" max="100" step="any" value={f.discount} onChange={set("discount")} {...ltr} /></F>
          <F label={t("inv_tax")}><input className="input" type="number" min="0" max="100" step="any" value={f.tax} onChange={set("tax")} {...ltr} /></F>
          <F label={`${t("ds_paidNow")} (${cur})`}><input className="input" type="number" min="0" step="any" value={f.paidNow} onChange={set("paidNow")} {...ltr} /></F>
        </Grid>
        <div style={{ margin: "0.5rem 0" }}><Summary cur={cur} rows={[{ label: t("inv_sub"), value: cf.sub, sub: true }, { label: t("inv_discAmt"), value: cf.disc, tone: "minus" }, { label: t("inv_taxAmt"), value: cf.tax, tone: "plus" }, { label: t("inv_paidAmt"), value: Math.min(Number(f.paidNow) || 0, cf.total), tone: "minus" }]} total={{ label: t("inv_left"), value: Math.max(cf.total - (Number(f.paidNow) || 0), 0) }} /></div>
        {f.creditWarn && <div style={{ color: "#ff8a9b", fontSize: "var(--text-sm)", marginBottom: "0.4rem" }}>⚠ {t("ds_overCredit")} <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF((p) => ({ ...p, override: true, creditWarn: false }))}>{t("ds_override")}</button></div>}
        <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={close}>{t("cancel")}</button><button className="btn btn-ghost btn-sm">{t("ds_saveDraft")}</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => { const lines = f.lines.filter((l) => l.invId && Number(l.qty) > 0); if (!f.customer || !lines.length) return toast(t("ds_needItems"), "error"); confirmOrder({ id: modal.x?.id || uid(), no: modal.x?.no || nextNo("dorder"), ...(modal.x || {}), ...f, lines }); }}>{t("ds_confirm")}</button></div>
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
