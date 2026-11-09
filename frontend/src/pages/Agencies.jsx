import React, { useRef, useState } from "react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Modal, EmptyState, ConfirmDialog } from "../components/UI";
import { IconBox, IconPlus, IconEdit, IconTrash } from "../components/Icons";
import { F, Grid, Sec, ltr, useForm } from "../components/Form";
import Summary from "../components/Summary";
import CurrencyPicker from "../components/CurrencyPicker";
import MoneyInput from "../components/MoneyInput";
import MediaAttach from "../components/MediaAttach";
import ItemPicker from "../components/ItemPicker";
import ContactProfile from "./ContactProfile";
import { useBiz, upsert, remove, update, uid, fmt, nextNo, todayStr } from "../services/biz";
import { compatible, unitLabel } from "../services/units";
import { landed, applyReceive, goodsOwed, brandSales, brandStock, contractState, fxFor } from "../services/agencies";
import { delMedia } from "../services/media";

const COSTS = ["freight", "customs", "insurance", "clearing", "other"], STATUS = ["ordered", "shipped", "customs", "received"];
const Foot = ({ onCancel, t, extra }) => <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end", flexWrap: "wrap", marginTop: "0.7rem" }}>{extra}<button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>{t("cancel")}</button><button className="btn btn-primary btn-sm">{t("save")}</button></div>;
const conv = (biz, amt, c, fx) => { if (!c || c === biz.currency) return Number(amt) || 0; const r = Number(fx) || biz.rates[c] || 0; return r ? +((Number(amt) || 0) * r).toFixed(6) : null; };
const Bar = ({ v, max, color = "#368bff" }) => <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,.08)" }}><div style={{ height: 8, borderRadius: 4, background: color, width: `${max ? Math.min((v / max) * 100, 100) : 0}%` }} /></div>;

export default function Agencies() {
  const { t, locale, toast } = useApp();
  const biz = useBiz(), cur = biz.currency, today = todayStr(), year = today.slice(0, 4);
  const [tab, setTab] = useState("over"), [modal, setModal] = useState(null), [del, setDel] = useState(null), [contacts, setContacts] = useState([]), [profile, setProfileOf] = useState(null);
  const [pay, setPay] = useState({ amount: "", method: "transfer", rate: "" });
  const [f, set, setF] = useForm({}), trash = useRef([]);
  React.useEffect(() => { api.get("/contacts").then((d) => setContacts(d.items || [])).catch(() => {}); }, []);
  const close = () => setModal(null);
  const ag = (id) => biz.agencies.find((a) => a.id === id);

  /* ---------- agreements ---------- */
  const openAg = (x) => { trash.current = []; setF(x ? { ...x, media: [...(x.media || [])], targetCur: cur, targetFx: "" } : { brand: "", principal: "", country: "", start: today, end: "", territory: "", exclusive: "1", currency: "USD", terms: "", discount: "", target: "", targetCur: cur, targetFx: "", rebate: "", notes: "", media: [] }); setModal({ kind: "ag", x }); };
  const saveAg = (e) => {
    e.preventDefault();
    if (f.end && f.end < f.start) return toast(t("pr_badDates"), "error");
    const target = conv(biz, f.target, f.targetCur, f.targetFx); if (target == null) return toast(t("fx_missing"), "error");
    upsert("agencies", { id: modal.x?.id || uid(), ...(modal.x || {}), ...f, target, targetCur: "", targetFx: "" }); trash.current.forEach(delMedia); close();
  };

  /* ---------- shipments ---------- */
  const blankLine = () => ({ invId: "", name: "", qty: 1, unit: "", price: "", lot: "", expiry: "" });
  const openShip = (x) => { setPay({ amount: "", method: "transfer", rate: "" }); setF(x ? { ...x, lines: x.lines.map((l) => ({ ...l })), costs: (x.costs || []).map((c) => ({ ...c })), payments: [...(x.payments || [])] } : { agencyId: biz.agencies[0]?.id || "", ref: "", status: "ordered", orderDate: today, eta: "", currency: ag(biz.agencies[0]?.id)?.currency || "USD", fx: biz.rates[ag(biz.agencies[0]?.id)?.currency] || "", basis: "value", lines: [blankLine()], costs: [], payments: [] }); setModal({ kind: "ship", x }); };
  const setLn = (i, p) => setF((s) => ({ ...s, lines: s.lines.map((l, k) => (k === i ? { ...l, ...p } : l)) }));
  const setCost = (i, fn) => setF((s) => ({ ...s, costs: s.costs.map((c, k) => (k === i ? fn(c) : c)) }));
  const shipRecord = () => ({ id: modal.x?.id || uid(), no: modal.x?.no || nextNo("shipment"), ...(modal.x || {}), ...f, lines: f.lines.filter((l) => String(l.name).trim() && Number(l.qty) > 0), costs: f.costs.filter((c) => Number(c.amount) > 0) });
  const saveShip = (e, extra = {}) => {
    e?.preventDefault?.();
    if (!f.lines.some((l) => String(l.name).trim() && Number(l.qty) > 0)) return toast(t("ds_needItems"), "error");
    const rec = { ...shipRecord(), ...extra }, old = modal.x?.payments || [], oldIds = new Set(old.map((p) => p.id)), newIds = new Set(rec.payments.map((p) => p.id));
    const added = rec.payments.filter((p) => !oldIds.has(p.id)), gone = old.filter((p) => !newIds.has(p.id)).map((p) => p.id);
    update((s) => ({ ...s, expenses: [...s.expenses.filter((x) => !gone.includes(x.paymentId)), ...added.map((p) => ({ id: uid(), date: p.date, category: "purchases", amount: p.amount, currency: rec.currency, rate: p.rate, amountMain: +(p.amount * p.rate).toFixed(6), payee: ag(rec.agencyId)?.principal || ag(rec.agencyId)?.brand || "", method: p.method, branch: "", note: rec.no, shipmentId: rec.id, paymentId: p.id, media: [] }))] }));
    upsert("shipments", rec); close();
  };
  const addPayment = () => {
    const a = Number(pay.amount) || 0, rate = f.currency === cur ? 1 : Number(pay.rate) || fxFor(biz, f.currency, f.fx);
    if (a <= 0) return; if (!rate) return toast(t("fx_missing"), "error");
    setF((s) => ({ ...s, payments: [...s.payments, { id: uid(), date: today, amount: a, method: pay.method, rate }] })); setPay({ ...pay, amount: "" });
  };
  const receive = () => {
    const rec = { ...shipRecord(), status: "received", received: true, receivedDate: today };
    if (rec.lines.some((l) => !l.invId)) return toast(t("ag_needStock"), "error");
    const L = landed(rec, biz);
    if (!L.fx || rec.costs.some((c) => !fxFor(biz, c.currency, c.fx))) return toast(t("fx_missing"), "error");
    update((s) => applyReceive(s, rec, today)); saveShip(null, { status: "received", received: true, receivedDate: today });
    toast(t("ag_received"), "success");
  };
  const LD = modal?.kind === "ship" ? landed({ ...f, lines: (f.lines || []).filter((l) => l.invId && Number(l.qty) > 0), costs: f.costs || [] }, biz) : null;
  const D = goodsOwed(modal?.kind === "ship" ? { lines: f.lines || [], payments: f.payments || [] } : { lines: [], payments: [] });
  const principalContact = (a) => contacts.find((c) => c.name.trim().toLowerCase() === (a.principal || "").trim().toLowerCase());

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="section-title"><h2>{t("agencies")}</h2>
        <button className="btn btn-primary btn-sm" onClick={() => (tab === "ship" ? (biz.agencies.length ? openShip(null) : toast(t("ag_needAgency"), "error")) : openAg(null))}><IconPlus />{tab === "ship" ? t("ag_newShip") : t("ag_newAgency")}</button></div>
      <div className="tabs">{[["over", "ag_over"], ["agr", "ag_agreements"], ["ship", "ag_shipments"]].map(([k, l]) => <button key={k} className={`btn btn-sm ${tab === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(k)}>{t(l)}</button>)}</div>

      {(tab === "over" || tab === "agr") && (biz.agencies.length === 0 ? <EmptyState icon={<IconBox />} text={t("ag_none")} /> : biz.agencies.map((a) => {
        const st = contractState(a, today), sales = brandSales(biz, a.brand, `${year}-01-01`, `${year}-12-31`), target = Number(a.target) || 0, hit = target > 0 && sales >= target;
        const ships = biz.shipments.filter((s) => s.agencyId === a.id), owed = ships.reduce((s, x) => s + goodsOwed(x).left * fxFor(biz, x.currency, x.fx), 0), pc = principalContact(a);
        return (
          <div key={a.id} className="glass card" style={{ display: "grid", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "flex-start" }}>
              <div><strong style={{ fontSize: "1.05rem" }}>{a.brand}</strong><div style={{ fontSize: "var(--text-sm)", color: "var(--text-3)" }}>{[a.principal, a.country].filter(Boolean).join(" · ")}</div></div>
              <span className={`badge ${st === "active" ? "badge-green" : st === "soon" ? "badge-violet" : "badge-red"}`}>{t("ag_st_" + st)}</span></div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}><bdi dir="ltr">{a.start} → {a.end || "∞"}</bdi>{a.territory && ` · 📍 ${a.territory}`}{a.exclusive === "1" && ` · ${t("ag_exclusive")}`}{Number(a.terms) > 0 && ` · ${a.terms} ${t("ag_days")}`}{Number(a.discount) > 0 && ` · ${a.discount}% ${t("ag_discount")}`}</div>
            {tab === "over" && (<>
              {target > 0 && <div><div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}><span>{t("ag_target")} {year}</span><bdi dir="ltr">{fmt(sales)} / {fmt(target)} {cur}</bdi></div><Bar v={sales} max={target} color={hit ? "#4ade80" : "#368bff"} />
                {Number(a.rebate) > 0 && <div style={{ fontSize: "var(--text-xs)", color: hit ? "#4ade80" : "var(--text-3)", marginTop: 4 }}>{hit ? `${t("ag_rebateDue")}: ${fmt((sales * a.rebate) / 100)} ${cur}` : `${t("ag_rebateAt")} ${a.rebate}%`}</div>}</div>}
              <div className="mini3">{[[t("ag_stockValue"), brandStock(biz, a.brand)], [t("ag_sales"), sales], [t("ag_payable"), owed]].map(([l, v], i) => <div key={i}><small>{l}</small><b dir="ltr" style={i === 2 && v > 0 ? { color: "var(--cyan)" } : undefined}>{fmt(v)}</b></div>)}</div></>)}
            <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
              {pc && <button className="btn btn-ghost btn-sm" onClick={() => setProfileOf(pc)}>{t("ag_principalProfile")}</button>}
              <button className="icon-btn" aria-label={t("b_edit")} onClick={() => openAg(a)}><IconEdit /></button>
              <button className="icon-btn" aria-label={t("delete")} onClick={() => biz.shipments.some((s) => s.agencyId === a.id) ? toast(t("ag_hasShips"), "error") : setDel({ fn: () => { (a.media || []).forEach((m) => delMedia(m.id)); remove("agencies", a.id); } })}><IconTrash /></button></div>
          </div>); }))}
      {tab === "over" && biz.agencies.length > 0 && <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{t("ag_overNote")}</p>}

      {tab === "ship" && (biz.shipments.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : biz.shipments.slice().sort((a, b) => (b.orderDate || "").localeCompare(a.orderDate || "")).map((s) => { const L = landed(s, biz), o = goodsOwed(s); return (
        <div key={s.id} className="glass card" style={{ display: "grid", gap: "0.4rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}><strong><bdi dir="ltr">{s.no}</bdi> · {ag(s.agencyId)?.brand}</strong><span className={`badge ${s.received ? "badge-green" : "badge-blue"}`}>{t("ag_s_" + s.status)}</span></div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{[s.ref, s.orderDate && `${t("ag_ordered")} ${s.orderDate}`, s.eta && `ETA ${s.eta}`].filter(Boolean).join(" · ")} · {s.lines.length} {t("stk_items")}</div>
          <div className="mini3">{[[`${t("ag_goods")} (${s.currency})`, o.goods], [t("inv_paidAmt"), o.paid], [t("inv_left"), o.left]].map(([l, v], i) => <div key={i}><small>{l}</small><b dir="ltr" style={i === 2 && v > 0 ? { color: "var(--cyan)" } : undefined}>{fmt(v)}</b></div>)}</div>
          <div style={{ fontSize: "var(--text-sm)" }}>{t("ag_landedTotal")}: <b dir="ltr">{L.fx ? fmt(L.total) : "—"} {cur}</b></div>
          <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}><button className="btn btn-ghost btn-sm" onClick={() => openShip(s)}>{s.received ? t("ag_view") : t("b_edit")}</button>
            {!s.received && <button className="icon-btn" aria-label={t("delete")} onClick={() => setDel({ fn: () => remove("shipments", s.id) })}><IconTrash /></button>}</div></div>); }))}

      {modal?.kind === "ag" && <Modal wide title={modal.x ? f.brand : t("ag_newAgency")} onClose={close}><form onSubmit={saveAg}>
        <Grid>
          <F label={t("ag_brand") + " *"}><input className="input" required list="abr" value={f.brand} onChange={set("brand")} /><datalist id="abr">{[...new Set(biz.inventory.map((i) => i.brand).filter(Boolean))].map((b) => <option key={b} value={b} />)}</datalist></F>
          <F label={t("ag_principal")}><input className="input" list="apr" value={f.principal} onChange={set("principal")} /><datalist id="apr">{contacts.map((c) => <option key={c.id} value={c.name} />)}</datalist></F>
          <F label={t("ag_country")}><input className="input" value={f.country} onChange={set("country")} /></F>
          <F label={t("ag_territory")}><input className="input" value={f.territory} onChange={set("territory")} placeholder={t("ag_territoryPh")} /></F>
          <F label={t("pr_start")}><input className="input" type="date" required value={f.start} onChange={set("start")} {...ltr} /></F>
          <F label={t("pr_endDate")}><input className="input" type="date" value={f.end} onChange={set("end")} {...ltr} /></F>
          <F label={t("ag_exclusiveQ")}><select className="select" value={f.exclusive} onChange={set("exclusive")}><option value="1">{t("ag_exclusive")}</option><option value="0">{t("ag_nonExclusive")}</option></select></F>
          <F label={t("ag_dealCur")}><CurrencyPicker value={f.currency} onChange={(v) => setF((p) => ({ ...p, currency: v }))} /></F>
          <F label={t("ag_terms")}><input className="input" type="number" min="0" value={f.terms} onChange={set("terms")} {...ltr} /></F>
          <F label={t("ag_discount") + " %"}><input className="input" type="number" min="0" max="100" step="any" value={f.discount} onChange={set("discount")} {...ltr} /></F>
          <F label={`${t("ag_target")} (${t("ag_perYear")})`}><MoneyInput f={f} setF={setF} amount="target" currency="targetCur" fx="targetFx" /></F>
          <F label={t("ag_rebate") + " %"}><input className="input" type="number" min="0" max="100" step="any" value={f.rebate} onChange={set("rebate")} {...ltr} /></F>
          <F label={t("emp_notes")} wide><input className="input" value={f.notes} onChange={set("notes")} /></F>
        </Grid>
        <Sec>{t("ag_docs")}</Sec><MediaAttach media={f.media || []} onChange={(m) => setF((p) => ({ ...p, media: m }))} trash={trash} />
        <Foot t={t} onCancel={close} /></form></Modal>}

      {modal?.kind === "ship" && <Modal wide title={modal.x ? `${modal.x.no}` : t("ag_newShip")} onClose={close}><form onSubmit={saveShip}>
        <Grid>
          <F label={t("ag_agency") + " *"}><select className="select" required value={f.agencyId} onChange={(e) => setF((p) => ({ ...p, agencyId: e.target.value, currency: ag(e.target.value)?.currency || p.currency, fx: biz.rates[ag(e.target.value)?.currency] || p.fx }))}>{biz.agencies.map((a) => <option key={a.id} value={a.id}>{a.brand}</option>)}</select></F>
          <F label={t("ag_ref")}><input className="input" value={f.ref} onChange={set("ref")} {...ltr} /></F>
          <F label={t("emp_status")}><select className="select" value={f.status} onChange={set("status")} disabled={f.received}>{STATUS.filter((x) => x !== "received" || f.received).map((k) => <option key={k} value={k}>{t("ag_s_" + k)}</option>)}</select></F>
          <F label={t("ag_ordered")}><input className="input" type="date" value={f.orderDate} onChange={set("orderDate")} {...ltr} /></F>
          <F label="ETA"><input className="input" type="date" value={f.eta} onChange={set("eta")} {...ltr} /></F>
          <F label={t("ag_shipCur")}><CurrencyPicker value={f.currency} onChange={(v) => setF((p) => ({ ...p, currency: v, fx: v === cur ? "" : biz.rates[v] || "" }))} /></F>
          {f.currency !== cur && <F label={`1 ${f.currency} = ? ${cur}`}><input className="input" type="number" min="0" step="any" required value={f.fx || ""} onChange={set("fx")} {...ltr} /></F>}
          <F label={t("ag_basis")}><select className="select" value={f.basis} onChange={set("basis")}><option value="value">{t("ag_byValue")}</option><option value="qty">{t("ag_byQty")}</option></select></F>
        </Grid>
        <Sec>{t("inv_items")}</Sec>
        {f.lines.map((l, i) => { const it = biz.inventory.find((x) => x.id === l.invId); return (
          <div key={i} className="glass card" style={{ padding: "0.6rem", display: "grid", gap: "0.45rem", margin: "0.4rem 0" }}>
            <ItemPicker items={biz.inventory} value={l.name} placeholder={t("ds_itemPh")} onText={(txt) => setLn(i, { name: txt, invId: "" })} onPick={(x) => setLn(i, { invId: x.id, name: x.name, unit: x.unit })} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.45rem" }}>
              <div style={{ display: "grid", gap: 3 }}><small style={{ color: "var(--text-3)" }}>{t("inv_qty")}</small><input className="input" type="number" min="0" step="any" dir="ltr" value={l.qty} onChange={(e) => setLn(i, { qty: e.target.value })} /></div>
              <div style={{ display: "grid", gap: 3 }}><small style={{ color: "var(--text-3)" }}>{t("stk_unit")}</small><select className="select" value={l.unit} onChange={(e) => setLn(i, { unit: e.target.value })}>{(it ? compatible(it.unit) : []).map((c) => <option key={c} value={c}>{unitLabel(c, locale)}</option>)}</select></div>
              <div style={{ display: "grid", gap: 3 }}><small style={{ color: "var(--text-3)" }}>{`${t("ds_unitPrice")} (${f.currency})`}</small><input className="input" type="number" min="0" step="any" dir="ltr" value={l.price} onChange={(e) => setLn(i, { price: e.target.value })} /></div>
              <div style={{ display: "grid", gap: 3 }}><small style={{ color: "var(--text-3)" }}>{t("ds_lot")}</small><input className="input" value={l.lot} onChange={(e) => setLn(i, { lot: e.target.value })} /></div>
              <div style={{ display: "grid", gap: 3 }}><small style={{ color: "var(--text-3)" }}>{t("ds_expiryDate")}</small><input className="input" type="date" value={l.expiry} onChange={(e) => setLn(i, { expiry: e.target.value })} {...ltr} /></div></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}><span style={{ color: l.invId ? "var(--text-3)" : "#ff8a9b" }}>{l.invId ? "" : l.name ? t("ag_notLinked") : ""}</span><span><b dir="ltr">{fmt((Number(l.qty) || 0) * (Number(l.price) || 0))} {f.currency}</b><button type="button" className="icon-btn" aria-label={t("delete")} disabled={f.lines.length < 2} onClick={() => setF((p) => ({ ...p, lines: p.lines.filter((_, k) => k !== i) }))}><IconTrash /></button></span></div></div>); })}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF((p) => ({ ...p, lines: [...p.lines, blankLine()] }))}><IconPlus />{t("inv_addItem")}</button>
        <Sec>{t("ag_costs")}</Sec><p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{t("ag_costsHelp")}</p>
        {f.costs.map((c, i) => (
          <div key={i} className="glass card" style={{ padding: "0.5rem", display: "grid", gap: "0.4rem", margin: "0.35rem 0" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 40px", gap: "0.35rem" }}>
              <select className="select" value={c.type} onChange={(e) => setCost(i, (x) => ({ ...x, type: e.target.value }))}>{COSTS.map((k) => <option key={k} value={k}>{t("ag_c_" + k)}</option>)}</select>
              <input className="input" placeholder={t("map_name")} value={c.label} onChange={(e) => setCost(i, (x) => ({ ...x, label: e.target.value }))} />
              <button type="button" className="icon-btn" aria-label={t("delete")} onClick={() => setF((p) => ({ ...p, costs: p.costs.filter((_, k) => k !== i) }))}><IconTrash /></button></div>
            <MoneyInput f={c} setF={(fn) => setCost(i, fn)} amount="amount" currency="currency" fx="fx" /></div>))}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF((p) => ({ ...p, costs: [...p.costs, { type: "freight", label: "", amount: "", currency: cur, fx: "" }] }))}><IconPlus />{t("ag_addCost")}</button>
        <Sec>{t("ag_landed")}</Sec>
        {LD && LD.fx > 0 ? (<>
          <Summary cur={cur} rows={[{ label: t("ag_goods"), value: LD.goods, sub: true }, { label: t("ag_costs"), value: LD.costs, tone: "plus" }]} total={{ label: t("ag_landedTotal"), value: LD.total }} />
          {LD.lines.map((l, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", padding: "0.3rem 0", borderTop: "1px solid var(--border)" }}><span>{l.name}</span><b dir="ltr">{fmt(l.landedUnit)} {cur} / {unitLabel(biz.inventory.find((x) => x.id === l.invId)?.unit, locale)}</b></div>)}</>) : <div style={{ color: "#ff8a9b", fontSize: "var(--text-sm)" }}>⚠ {t("fx_missing")}</div>}
        <Sec>{t("ag_payments")}</Sec>
        {f.payments.map((p) => <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", padding: "0.25rem 0", borderTop: "1px solid var(--border)" }}><span>{p.date} · {t("exp_m_" + p.method)}</span><span><bdi dir="ltr">{fmt(p.amount)} {f.currency}</bdi><button type="button" className="icon-btn" aria-label={t("delete")} onClick={() => setF((s) => ({ ...s, payments: s.payments.filter((x) => x.id !== p.id) }))}><IconTrash /></button></span></div>)}
        <div style={{ display: "grid", gridTemplateColumns: f.currency !== cur ? "1fr 1fr 1fr 40px" : "1fr 1fr 40px", gap: "0.35rem", margin: "0.4rem 0" }}>
          <input className="input" type="number" step="any" min="0" dir="ltr" placeholder={`${t("amount")} (${f.currency})`} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
          <select className="select" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{["transfer", "cash", "card", "wallet"].map((k) => <option key={k} value={k}>{t("exp_m_" + k)}</option>)}</select>
          {f.currency !== cur && <input className="input" type="number" step="any" min="0" dir="ltr" placeholder={`1 ${f.currency} = ? ${cur}`} value={pay.rate || (fxFor(biz, f.currency, f.fx) || "")} onChange={(e) => setPay({ ...pay, rate: e.target.value })} />}
          <button type="button" className="btn btn-ghost btn-sm" onClick={addPayment}><IconPlus /></button></div>
        <Summary cur={f.currency} rows={[{ label: t("ag_goods"), value: D.goods, sub: true }, { label: t("inv_paidAmt"), value: D.paid, tone: "minus" }]} total={{ label: t("inv_left"), value: D.left }} />
        <p style={{ margin: "0.4rem 0 0", fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{t("ag_shipNote")}</p>
        <Foot t={t} onCancel={close} extra={!f.received && modal.x ? <button type="button" className="btn btn-primary btn-sm" onClick={receive}>{t("ag_receive")}</button> : null} />
      </form></Modal>}
      {profile && <ContactProfile contact={profile} onClose={() => setProfileOf(null)} />}
      {del && <ConfirmDialog title={t("delete")} message={t("b_confirmDelete")} onConfirm={del.fn} onClose={() => setDel(null)} />}
    </div>
  );
}
