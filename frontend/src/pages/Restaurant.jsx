import React, { useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { Modal, EmptyState, ConfirmDialog } from "../components/UI";
import { IconPlus, IconEdit, IconTrash, IconBox } from "../components/Icons";
import { F, Grid, ltr, useForm } from "../components/Form";
import Summary from "../components/Summary";
import MediaView from "../components/MediaView";
import { useBiz, upsert, remove, update, uid, fmt, nextNo, todayStr, totals, stockLeft } from "../services/biz";
import { putMedia, delMedia, compressImage } from "../services/media";
import { waPhone } from "../services/phone";
import RecipeEditor from "../components/RecipeEditor";
import { productCost, marginOf, usageMap, orderCalc } from "../services/costing";
import RestaurantStatement from "./RestaurantStatement";
const calc = orderCalc;
const FLOWD = ["open", "preparing", "ready", "onway", "delivered"];
const flowOf = (o) => (o.type === "deliv" ? FLOWD : FLOW);

const FLOW = ["open", "preparing", "ready", "served"];
const Bar = ({ children }) => <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>{children}</div>;
const Foot = ({ onCancel, t, extra }) => <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end", marginTop: "0.7rem" }}>{extra}<button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>{t("cancel")}</button><button className="btn btn-primary btn-sm">{t("save")}</button></div>;

export default function Restaurant() {
  const { t, toast } = useApp();
  const biz = useBiz();
  const [tab, setTab] = useState("orders");
  const [modal, setModal] = useState(null), [del, setDel] = useState(null), [pay, setPay] = useState(null), [method, setMethod] = useState("cash"), [rf, setRf] = useState("today");
  const [f, set, setF] = useForm({});
  const fileRef = useRef(null), trash = useRef([]);
  const today = todayStr(), cur = biz.currency;
  const drivers = biz.employees.filter((e) => e.role === "driver" && e.status !== "ended");
  const [zn, setZn] = useState(""), [zf, setZf] = useState("");
  const close = () => setModal(null);
  const open = (kind, x, init) => { trash.current = []; setF(x ? { ...x, lines: x.lines?.map((l) => ({ ...l })) } : init); setModal({ kind, x }); };
  const save = (coll, extra = {}) => (e) => { e.preventDefault(); upsert(coll, { id: modal.x?.id || uid(), ...(modal.x || {}), ...f, ...extra }); trash.current.forEach(delMedia); close(); };

  /* ---------- orders ---------- */
  const newOrder = (table = "") => open("order", null, { type: "dine", table, customer: "", phone: "", address: "", lines: [], discount: 0, service: 0, deliveryFee: "", driverCost: "", phone: "", zone: "", driver: "", deposit: 0, resId: "", tax: biz.taxRate, status: "open" });
  const addLine = (m) => setF((p) => { const i = p.lines.findIndex((l) => l.menuId === m.id); return { ...p, lines: i >= 0 ? p.lines.map((l, k) => (k === i ? { ...l, qty: l.qty + 1 } : l)) : [...p.lines, { menuId: m.id, name: m.name, price: Number(m.price) || 0, qty: 1 }] }; });
  const qty = (i, d) => setF((p) => ({ ...p, lines: p.lines.map((l, k) => (k === i ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0) }));
  const saveOrder = (e) => { e.preventDefault(); if (!f.lines.length) return; upsert("orders", { ...(modal.x || { id: uid(), no: nextNo("order"), createdAt: new Date().toISOString(), date: today }), ...f }); close(); };
  const step = (o) => { const fl = flowOf(o); upsert("orders", { ...o, status: fl[fl.indexOf(o.status) + 1] }); };
  const seat = (r) => {
    const o = { id: uid(), no: nextNo("order"), createdAt: new Date().toISOString(), date: today, type: "dine", table: r.table || "", customer: r.name, phone: r.phone || "", address: "", lines: [], discount: 0, service: 0, deliveryFee: "", driverCost: "", zone: "", driver: "", deposit: Number(r.deposit) || 0, resId: r.id, tax: biz.taxRate, status: "open" };
    upsert("orders", o); upsert("reservations", { ...r, status: "seated" }); setTab("orders"); open("order", o);
  };
  const empName = (id) => biz.employees.find((e) => e.id === id)?.fullName || "";
  const payNow = () => {
    const o = pay, c = calc(o);
    const inv = { id: uid(), no: nextNo("invoice"), type: "invoice", customer: o.customer || t("rs_walkin"), issueDate: today, dueDate: "", currency: cur, discount: o.discount || 0, tax: o.tax || 0, notes: `${o.no} · ${t("rs_" + o.type)} · ${method}`, paidAmount: c.total, status: "paid", items: c.items.map((i) => ({ ...i, desc: i.desc === "Service" ? t("rs_service") : i.desc === "Delivery" ? t("rs_delivFee") : i.desc, unit: "" })) };
    upsert("invoices", inv);
    update((s) => {
      const used = {}; o.lines.forEach((l) => { const m = s.menuItems.find((x) => x.id === l.menuId); if (m) Object.entries(usageMap(m, l.qty, s.inventory)).forEach(([k, v]) => { used[k] = (used[k] || 0) + v; }); });
      return { ...s, inventory: s.inventory.map((it) => (used[it.id] ? { ...it, qtyOut: (Number(it.qtyOut) || 0) + used[it.id] } : it)) };
    });
    if (o.type === "deliv" && Number(o.driverCost) > 0) upsert("expenses", { id: uid(), date: today, category: "transport", amount: Number(o.driverCost), payee: "", method: "cash", branch: "", note: o.no });
    upsert("orders", { ...o, status: "paid", method, paidAt: new Date().toISOString(), invoiceNo: inv.no });
    setPay(null); toast(t("rs_paidDone"), "success");
  };
  const todays = biz.orders.filter((o) => o.status === "paid" && (o.paidAt || "").slice(0, 10) === today);
  const topItems = Object.entries(todays.flatMap((o) => o.lines).reduce((m, l) => ((m[l.name] = (m[l.name] || 0) + l.qty), m), {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const openOrders = biz.orders.filter((o) => o.status !== "paid" && o.status !== "cancelled");
  const busy = (tb) => openOrders.some((o) => o.type === "dine" && o.table === tb.id);

  /* ---------- menu photo ---------- */
  const addPhoto = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    try { const id = uid(); await putMedia(id, await compressImage(file, 900)); if (f.photo) trash.current.push(f.photo); setF((p) => ({ ...p, photo: id })); } catch { toast(t("cat_mediaErr"), "error"); }
  };

  /* ---------- reservations ---------- */
  const hm = (x) => { const [h, m] = (x || "0:0").split(":"); return (+h) * 60 + (+m); };
  const clash = f.table && biz.reservations.some((r) => r.id !== modal?.x?.id && r.table === f.table && r.date === f.date && !["cancelled", "noshow", "completed"].includes(r.status) && Math.abs(hm(r.time) - hm(f.time)) < 120);
  const resList = useMemo(() => biz.reservations.filter((r) => (rf === "today" ? r.date === today : r.date >= today)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)), [biz.reservations, rf, today]);
  const tName = (id) => biz.tables.find((x) => x.id === id)?.name || "";
  const waMsg = (r) => encodeURIComponent(`${t("rs_confirmMsg")} — ${r.name}\n${r.date} ${r.time} · ${r.guests} ${t("rs_guests")}${r.table ? ` · ${t("rs_table")} ${tName(r.table)}` : ""}\n${biz.name || ""}`);
  const cats = [...new Set(biz.menuItems.map((m) => m.category).filter(Boolean))];
  const calcF = f.lines ? calc(f) : null;

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="section-title"><h2>{t("restaurant")}</h2></div>
      <div className="tabs">{[["orders", "rs_orders"], ["delivery", "rs_deliv"], ["tables", "rs_tables"], ["res", "rs_res"], ["menu", "rs_menu"], ["stmt", "rs_stmt"]].map(([k, l]) => <button key={k} className={`btn btn-sm ${tab === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(k)}>{t(l)}</button>)}</div>

      {tab === "orders" && (<>
        <div className="stat-grid">
          <div className="glass stat-card"><div className="stat-label">{t("rs_todaySales")}</div><div className="stat-value">{fmt(todays.reduce((a, o) => a + calc(o).total, 0))} {cur}</div></div>
          <div className="glass stat-card"><div className="stat-label">{t("rs_openOrders")}</div><div className="stat-value">{openOrders.length}</div></div>
        </div>
        <button className="btn btn-primary btn-sm" style={{ justifySelf: "start" }} onClick={() => newOrder()}><IconPlus />{t("rs_newOrder")}</button>
        {openOrders.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : openOrders.map((o) => (
          <div key={o.id} className="glass card" style={{ display: "grid", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
              <strong><bdi dir="ltr">{o.no}</bdi> · {t("rs_" + o.type)}{o.type === "dine" && o.table && ` · ${tName(o.table)}`}</strong>
              <span className="badge badge-violet">{t("rs_status_" + o.status)}</span>
            </div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{o.lines.map((l) => `${l.qty}× ${l.name}`).join("، ")}</div>
            {(o.phone || o.address || o.driver) && (
              <div style={{ display: "flex", gap: "0.4rem 0.8rem", flexWrap: "wrap", fontSize: "var(--text-sm)", alignItems: "center" }}>
                {o.phone && <a href={`tel:${o.phone}`} dir="ltr" style={{ color: "inherit" }}>📞 {o.phone}</a>}
                {o.phone && <a target="_blank" rel="noreferrer" href={`https://wa.me/${waPhone(o.phone)}`} style={{ color: "inherit" }}>WhatsApp</a>}
                {o.address && <a target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(o.address)}`} style={{ color: "inherit" }}>📍 {o.address}</a>}
                {o.driver && <span>🛵 {empName(o.driver)}</span>}
              </div>)}
            <b dir="ltr">{fmt(calc(o).due)} {cur}{calc(o).deposit > 0 && <small style={{ color: "var(--text-3)" }}> ({t("rs_deposit")} {fmt(calc(o).deposit)})</small>}</b>
            <Bar>
              {flowOf(o).indexOf(o.status) < flowOf(o).length - 1 && <button className="btn btn-ghost btn-sm" onClick={() => step(o)}>{o.type === "deliv" && ["ready", "onway"].includes(o.status) ? t("rs_nextd_" + o.status) : t("rs_next_" + o.status)}</button>}
              <button className="btn btn-primary btn-sm" onClick={() => { setMethod("cash"); setPay(o); }}>{t("rs_pay")}</button>
              <button className="icon-btn" aria-label={t("b_edit")} onClick={() => open("order", o)}><IconEdit /></button>
              <button className="icon-btn" aria-label={t("delete")} onClick={() => setDel({ coll: "orders", x: o })}><IconTrash /></button>
            </Bar>
          </div>))}
        {topItems.length > 0 && <div className="glass card"><h3 style={{ marginTop: 0 }}>{t("rs_top")}</h3>{topItems.map(([n, q]) => <div key={n} style={{ display: "flex", justifyContent: "space-between" }}><span>{n}</span><b>{q}</b></div>)}</div>}
      </>)}

      {tab === "tables" && (<>
        <button className="btn btn-primary btn-sm" style={{ justifySelf: "start" }} onClick={() => open("table", null, { name: "", seats: 4, area: "indoor", notes: "" })}><IconPlus />{t("rs_newTable")}</button>
        {biz.tables.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "0.6rem" }}>
          {biz.tables.map((tb) => (
            <div key={tb.id} className="glass card" style={{ display: "grid", gap: "0.4rem", borderColor: busy(tb) ? "rgba(255,107,129,.5)" : undefined }}>
              <strong>{tb.name}</strong>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--text-3)" }}>{tb.seats} {t("rs_seats")} · {t("rs_" + (tb.area === "vip" ? "vip" : tb.area))}</div>
              <span className={`badge ${busy(tb) ? "badge-red" : "badge-green"}`}>{t(busy(tb) ? "rs_busy" : "rs_free")}</span>
              <Bar><button className="btn btn-ghost btn-sm" onClick={() => newOrder(tb.id)}><IconPlus /></button>
                <button className="icon-btn" aria-label={t("b_edit")} onClick={() => open("table", tb)}><IconEdit /></button>
                <button className="icon-btn" aria-label={t("delete")} onClick={() => setDel({ coll: "tables", x: tb })}><IconTrash /></button></Bar>
            </div>))}
        </div>}
      </>)}

      {tab === "res" && (<>
        <Bar><button className="btn btn-primary btn-sm" onClick={() => open("res", null, { name: "", phone: "", date: today, time: "20:00", guests: 2, table: "", occasion: "", deposit: "", status: "pending" })}><IconPlus />{t("rs_newRes")}</button>
          {[["today", "rs_today"], ["up", "rs_upcoming"]].map(([k, l]) => <button key={k} className={`btn btn-sm ${rf === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setRf(k)}>{t(l)}</button>)}</Bar>
        {resList.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : resList.map((r) => (
          <div key={r.id} className="glass card" style={{ display: "grid", gap: "0.4rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}><strong>{r.name}</strong><span className="badge badge-blue">{t("rs_r_" + r.status)}</span></div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}><bdi dir="ltr">{r.date} {r.time}</bdi> · {r.guests} {t("rs_guests")}{r.table && ` · ${tName(r.table)}`}{Number(r.deposit) > 0 && ` · ${t("rs_deposit")} ${fmt(r.deposit)} ${cur}`}{r.occasion && ` · ${r.occasion}`}</div>
            <Bar>
              {["pending", "confirmed"].includes(r.status) && <button className="btn btn-primary btn-sm" onClick={() => seat(r)}>{t("rs_seat")}</button>}
              <select className="select" style={{ width: "auto" }} value={r.status} onChange={(e) => upsert("reservations", { ...r, status: e.target.value })}>{["pending", "confirmed", "seated", "completed", "cancelled", "noshow"].map((k) => <option key={k} value={k}>{t("rs_r_" + k)}</option>)}</select>
              {r.phone && <a className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer" href={`https://wa.me/${waPhone(r.phone)}?text=${waMsg(r)}`}>{t("rs_confirmWa")}</a>}
              <button className="icon-btn" aria-label={t("b_edit")} onClick={() => open("res", r)}><IconEdit /></button>
              <button className="icon-btn" aria-label={t("delete")} onClick={() => setDel({ coll: "reservations", x: r })}><IconTrash /></button></Bar>
          </div>))}
      </>)}

      {tab === "menu" && (<>
        <button className="btn btn-primary btn-sm" style={{ justifySelf: "start" }} onClick={() => open("item", null, { name: "", category: "", price: "", cost: "", prep: "", options: "", description: "", available: true, recipe: [], extraCost: "", photo: "" })}><IconPlus />{t("rs_newItem")}</button>
        {biz.menuItems.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : (cats.length ? [...cats, ""] : [""]).map((c) => {
          const list = biz.menuItems.filter((m) => (m.category || "") === c); if (!list.length) return null;
          return <div key={c} style={{ display: "grid", gap: "0.5rem" }}>{c && <h3 style={{ margin: "0.4rem 0 0" }}>{c}</h3>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "0.6rem" }}>
              {list.map((m) => (
                <div key={m.id} className="glass card" style={{ padding: "0.6rem", display: "grid", gap: "0.3rem", cursor: "pointer", opacity: m.available ? 1 : 0.55 }} onClick={() => open("item", m)}>
                  {m.photo ? <MediaView id={m.photo} type="image" style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: 10 }} /> : <div style={{ aspectRatio: "4/3", display: "grid", placeItems: "center", background: "rgba(255,255,255,.04)", borderRadius: 10 }}><IconBox /></div>}
                  <strong style={{ fontSize: "var(--text-sm)" }}>{m.name}</strong><b dir="ltr" style={{ textAlign: "start" }}>{fmt(m.price)} {cur}</b>
                  <small style={{ color: "var(--text-3)" }}>{t("cat_margin")}: {fmt(marginOf(m.price, productCost(m, biz)).pct)}%</small>
                  {!m.available && <span className="badge badge-red">{t("rs_unavail")}</span>}
                </div>))}
            </div></div>; })}
      </>)}

      {tab === "delivery" && (<>
        <div className="glass card" style={{ display: "grid", gap: "0.5rem" }}>
          <h3 style={{ margin: 0 }}>{t("rs_zones")}</h3>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            <input className="input" style={{ flex: "1 1 140px" }} placeholder={t("rs_zone")} value={zn} onChange={(e) => setZn(e.target.value)} />
            <input className="input" style={{ width: 110 }} type="number" min="0" step="any" dir="ltr" placeholder={t("rs_delivFee")} value={zf} onChange={(e) => setZf(e.target.value)} />
            <button className="btn btn-ghost btn-sm" onClick={() => { if (zn.trim()) { upsert("zones", { id: uid(), name: zn.trim(), fee: Number(zf) || 0 }); setZn(""); setZf(""); } }}><IconPlus /></button>
          </div>
          {biz.zones.map((z) => <div key={z.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: "0.3rem" }}><span>{z.name}</span><span><b dir="ltr">{fmt(z.fee)} {cur}</b><button className="icon-btn" aria-label={t("delete")} onClick={() => remove("zones", z.id)}><IconTrash /></button></span></div>)}
        </div>
        <h3 style={{ margin: "0.3rem 0 0" }}>{t("rs_drivers")}</h3>
        {drivers.length === 0 && <p style={{ color: "var(--text-3)", fontSize: "var(--text-sm)" }}>{t("rs_noDrivers")}</p>}
        {[...drivers, { id: "", fullName: t("rs_unassigned") }].map((d) => {
          const mine = openOrders.filter((o) => o.type === "deliv" && (o.driver || "") === d.id);
          if (!mine.length && !d.id) return null;
          return <div key={d.id} className="glass card" style={{ display: "grid", gap: "0.35rem" }}><strong>🛵 {d.fullName} <span className="badge badge-blue">{mine.length}</span></strong>
            {mine.map((o) => <div key={o.id} style={{ fontSize: "var(--text-sm)", display: "flex", justifyContent: "space-between", gap: "0.5rem" }}><span><bdi dir="ltr">{o.no}</bdi> · {o.address || "—"}</span><span className="badge badge-violet">{t("rs_status_" + o.status)}</span></div>)}</div>;
        })}
      </>)}
      {tab === "stmt" && <RestaurantStatement />}

      {modal?.kind === "order" && (
        <Modal wide title={modal.x ? modal.x.no : t("rs_newOrder")} onClose={close}>
          <form onSubmit={saveOrder}>
            <Grid>
              <F label={t("emp_type")}><select className="select" value={f.type} onChange={set("type")}>{["dine", "take", "deliv"].map((k) => <option key={k} value={k}>{t("rs_" + k)}</option>)}</select></F>
              {f.type === "dine" && <F label={t("rs_table")}><select className="select" value={f.table} onChange={set("table")}><option value="">{t("rs_noTable")}</option>{biz.tables.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></F>}
              <F label={t("rs_cust")}><input className="input" value={f.customer} onChange={set("customer")} /></F>
              {f.type !== "dine" && <F label={t("phone")}><input className="input" type="tel" value={f.phone} onChange={set("phone")} {...ltr} /></F>}
              {f.type === "deliv" && <F label={t("rs_addr")}><input className="input" value={f.address} onChange={set("address")} /></F>}
              {f.type === "deliv" && <F label={t("rs_zone")}><select className="select" value={f.zone} onChange={(e) => { const z = biz.zones.find((x) => x.id === e.target.value); setF((p) => ({ ...p, zone: e.target.value, deliveryFee: z ? z.fee : p.deliveryFee })); }}><option value="">—</option>{biz.zones.map((z) => <option key={z.id} value={z.id}>{z.name} · {fmt(z.fee)}</option>)}</select></F>}
              {f.type === "deliv" && <F label={t("rs_driver")}><select className="select" value={f.driver} onChange={set("driver")}><option value="">—</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}</select></F>}
              {f.type === "deliv" && <F label={t("rs_delivFee")}><input className="input" type="number" min="0" step="any" value={f.deliveryFee} onChange={set("deliveryFee")} {...ltr} /></F>}
              {f.type === "deliv" && <F label={t("rs_driverCost")}><input className="input" type="number" min="0" step="any" value={f.driverCost} onChange={set("driverCost")} {...ltr} /></F>}
            </Grid>
            <p style={{ margin: "0.4rem 0", fontSize: "var(--text-sm)", color: "var(--text-3)" }}>{t("rs_addItem")}</p>
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>{biz.menuItems.filter((m) => m.available).map((m) => <button type="button" key={m.id} className="btn btn-ghost btn-sm" onClick={() => addLine(m)}>{m.name} · {fmt(m.price)}</button>)}</div>
            {f.lines.map((l, i) => <div key={l.menuId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.35rem 0", borderTop: "1px solid var(--border)" }}>
              <span>{l.name}</span><span style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}><button type="button" className="icon-btn" onClick={() => qty(i, -1)}>−</button><b>{l.qty}</b><button type="button" className="icon-btn" onClick={() => qty(i, 1)}>+</button><bdi dir="ltr">{fmt(l.qty * l.price)}</bdi></span></div>)}
            <Grid><F label={t("rs_serviceP")}><input className="input" type="number" min="0" step="any" value={f.service} onChange={set("service")} {...ltr} /></F>
              <F label={t("rs_discount")}><input className="input" type="number" min="0" max="100" step="any" value={f.discount} onChange={set("discount")} {...ltr} /></F>
              <F label={t("inv_tax")}><input className="input" type="number" min="0" max="100" step="any" value={f.tax} onChange={set("tax")} {...ltr} /></F></Grid>
            <Summary cur={cur} rows={[{ label: t("inv_sub"), value: calcF.sub, sub: true }, { label: t("rs_service"), value: calcF.service, tone: "plus" }, ...(calcF.delivery ? [{ label: t("rs_delivFee"), value: calcF.delivery, tone: "plus" }] : []), { label: t("inv_discAmt"), value: calcF.disc, tone: "minus" }, { label: t("inv_taxAmt"), value: calcF.tax, tone: "plus" }, ...(calcF.deposit ? [{ label: t("rs_deposit"), value: calcF.deposit, tone: "minus" }] : [])]} total={{ label: calcF.deposit ? t("rs_due") : t("inv_total"), value: calcF.deposit ? calcF.due : calcF.total }} />
            <Foot t={t} onCancel={close} />
          </form>
        </Modal>)}

      {modal?.kind === "table" && <Modal title={t("rs_newTable")} onClose={close}><form onSubmit={save("tables")}><Grid>
        <F label={t("map_name") + " *"}><input className="input" required value={f.name} onChange={set("name")} /></F>
        <F label={t("rs_seats")}><input className="input" type="number" min="1" value={f.seats} onChange={set("seats")} {...ltr} /></F>
        <F label={t("rs_area")}><select className="select" value={f.area} onChange={set("area")}>{["indoor", "terrace", "vip"].map((k) => <option key={k} value={k}>{t("rs_" + k)}</option>)}</select></F></Grid><Foot t={t} onCancel={close} /></form></Modal>}

      {modal?.kind === "res" && <Modal title={t("rs_newRes")} onClose={close}><form onSubmit={save("reservations")}><Grid>
        <F label={t("map_name") + " *"}><input className="input" required list="rc" value={f.name} onChange={set("name")} /></F>
        <F label={t("phone")}><input className="input" type="tel" value={f.phone} onChange={set("phone")} {...ltr} /></F>
        <F label={t("rs_date")}><input className="input" type="date" required value={f.date} onChange={set("date")} {...ltr} /></F>
        <F label={t("rs_time")}><input className="input" type="time" required value={f.time} onChange={set("time")} {...ltr} /></F>
        <F label={t("rs_guests")}><input className="input" type="number" min="1" value={f.guests} onChange={set("guests")} {...ltr} /></F>
        <F label={t("rs_table")}><select className="select" value={f.table} onChange={set("table")}><option value="">{t("rs_noTable")}</option>{biz.tables.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.seats})</option>)}</select></F>
        <F label={t("rs_deposit")}><input className="input" type="number" min="0" step="any" value={f.deposit} onChange={set("deposit")} {...ltr} /></F>
        <F label={t("rs_occasion")} wide><input className="input" value={f.occasion} onChange={set("occasion")} /></F></Grid>
        {clash && <div style={{ color: "#ff8a9b", fontSize: "var(--text-sm)" }}>⚠ {t("rs_conflict")}</div>}<Foot t={t} onCancel={close} /></form></Modal>}

      {modal?.kind === "item" && <Modal wide title={modal.x ? f.name : t("rs_newItem")} onClose={close}><form onSubmit={save("menuItems", { price: Number(f.price) || 0 })}>
        {f.photo && <MediaView id={f.photo} type="image" style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 12, marginBottom: "0.5rem" }} />}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current.click()}><IconPlus />{t("cat_addMedia")}</button><input ref={fileRef} type="file" accept="image/*" hidden onChange={addPhoto} />
        <Grid>
          <F label={t("stk_name") + " *"} wide><input className="input" required value={f.name} onChange={set("name")} /></F>
          <F label={t("rs_cat")}><input className="input" list="mc" value={f.category} onChange={set("category")} /><datalist id="mc">{cats.map((c) => <option key={c} value={c} />)}</datalist></F>
          <F label={t("stk_price") + ` (${cur})`}><input className="input" type="number" min="0" step="any" required value={f.price} onChange={set("price")} {...ltr} /></F>
          <F label={t("stk_cost")}><input className="input" type="number" min="0" step="any" value={f.cost} onChange={set("cost")} {...ltr} /></F>
          <F label={t("rs_prep")}><input className="input" type="number" min="0" value={f.prep} onChange={set("prep")} {...ltr} /></F>
          <F label={t("rs_avail")}><select className="select" value={f.available ? "1" : ""} onChange={(e) => setF((p) => ({ ...p, available: !!e.target.value }))}><option value="1">{t("rs_avail")}</option><option value="">{t("rs_unavail")}</option></select></F>
          <F label={t("cat_desc")} wide><input className="input" value={f.description} onChange={set("description")} /></F>
          <F label={t("rs_options")} wide><input className="input" value={f.options} onChange={set("options")} /></F>
        </Grid>
        <h4 style={{ margin: "0.9rem 0 0.4rem" }}>{t("rc_title")}</h4>
        <RecipeEditor value={f} cur={cur} onChange={(p) => setF((x) => ({ ...x, ...p }))} />
        <div style={{ margin: "0.7rem 0" }}><Summary cur={cur} rows={[{ label: t("stk_price"), value: Number(f.price) || 0, sub: true }, { label: t("rc_cost"), value: productCost(f, biz), tone: "minus" }, { label: "%", text: `${fmt(marginOf(f.price, productCost(f, biz)).pct)}%`, tone: "muted" }]} total={{ label: t("cat_margin"), value: marginOf(f.price, productCost(f, biz)).amount }} /></div>
        <Foot t={t} onCancel={close} /></form></Modal>}

      {pay && <Modal title={`${t("rs_pay")} — ${pay.no}`} onClose={() => setPay(null)}>
        <Summary cur={cur} rows={[{ label: t("inv_sub"), value: calc(pay).sub, sub: true }, { label: t("rs_service"), value: calc(pay).service, tone: "plus" }, ...(calc(pay).delivery ? [{ label: t("rs_delivFee"), value: calc(pay).delivery, tone: "plus" }] : []), { label: t("inv_discAmt"), value: calc(pay).disc, tone: "minus" }, { label: t("inv_taxAmt"), value: calc(pay).tax, tone: "plus" }, ...(calc(pay).deposit ? [{ label: t("rs_deposit"), value: calc(pay).deposit, tone: "minus" }] : [])]} total={{ label: calc(pay).deposit ? t("rs_due") : t("inv_total"), value: calc(pay).deposit ? calc(pay).due : calc(pay).total }} />
        <F label={t("rs_method")}><select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>{["cash", "card", "transfer", "wallet"].map((k) => <option key={k} value={k}>{t("exp_m_" + (k === "card" ? "card" : k))}</option>)}</select></F>
        <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end" }}><button className="btn btn-ghost btn-sm" onClick={() => setPay(null)}>{t("cancel")}</button><button className="btn btn-primary btn-sm" onClick={payNow}>{t("rs_pay")}</button></div></Modal>}
      {del && <ConfirmDialog title={t("delete")} message={t("b_confirmDelete")} onConfirm={() => { if (del.x.photo) delMedia(del.x.photo); remove(del.coll, del.x.id); }} onClose={() => setDel(null)} />}
      <datalist id="rc">{[]}</datalist>
    </div>
  );
}
