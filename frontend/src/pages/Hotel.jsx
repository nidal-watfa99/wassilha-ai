import React, { useState } from "react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Modal, EmptyState, ConfirmDialog } from "../components/UI";
import { IconBox, IconPlus, IconEdit, IconTrash } from "../components/Icons";
import { F, Grid, Sec, ltr, useForm } from "../components/Form";
import Summary from "../components/Summary";
import { useBiz, upsert, remove, update, uid, fmt, nextNo, todayStr } from "../services/biz";
import { folio, clashes, stayOn, kpis, addDays, ACTIVE } from "../services/hotel";

const R_TYPES = ["single", "double", "twin", "triple", "family", "suite", "other"], HK = ["clean", "dirty", "maintenance"], SOURCES = ["walkin", "phone", "online", "agency"];
const pad2 = (n) => String(n).padStart(2, "0");
const Foot = ({ onCancel, t, extra }) => <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end", flexWrap: "wrap", marginTop: "0.7rem" }}>{extra}<button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>{t("cancel")}</button><button className="btn btn-primary btn-sm">{t("save")}</button></div>;

export default function Hotel() {
  const { t, toast } = useApp();
  const biz = useBiz(), cur = biz.currency, today = todayStr();
  const [tab, setTab] = useState("board"), [modal, setModal] = useState(null), [del, setDel] = useState(null), [st, setSt] = useState("");
  const [contacts, setContacts] = useState([]), [ch, setCh] = useState({ desc: "", qty: 1, amount: "" }), [pay, setPay] = useState({ amount: "", method: "cash" });
  React.useEffect(() => { api.get("/contacts").then((d) => setContacts(d.items || [])).catch(() => {}); }, []);
  const [f, set, setF] = useForm({});
  const close = () => setModal(null);
  const room = (id) => biz.rooms.find((r) => r.id === id);
  const open = (kind, x, init) => { setF(x ? { ...x, charges: [...(x.charges || [])], payments: [...(x.payments || [])] } : init); setModal({ kind, x }); };
  const stayFresh = (s) => ({ ...s, tax: s.tax ?? biz.taxRate });

  /* ---------- rooms ---------- */
  const saveRoom = (e) => {
    e.preventDefault();
    if (biz.rooms.some((r) => r.id !== modal.x?.id && r.name.trim() === f.name.trim())) return toast(t("ho_dupRoom"), "error");
    upsert("rooms", { id: modal.x?.id || uid(), ...(modal.x || {}), ...f, rate: Number(f.rate) || 0 }); close();
  };
  const gen = (e) => {
    e.preventDefault(); const have = new Set(biz.rooms.map((r) => r.name)); let n = 0;
    for (let fl = +f.from; fl <= +f.to; fl++) for (let k = 1; k <= +f.per; k++) { const name = `${f.prefix}${fl}${pad2(k)}`; if (!have.has(name)) { upsert("rooms", { id: uid(), name, floor: String(fl), type: f.type, beds: f.beds, capacity: f.capacity, rate: Number(f.rate) || 0, hk: "clean", notes: "" }); n++; } }
    toast(`${n} ${t("pr_created")}`, "success"); close();
  };
  const cycleHk = (r) => upsert("rooms", { ...r, hk: HK[(HK.indexOf(r.hk) + 1) % HK.length] });

  /* ---------- stays ---------- */
  const draft = f.checkIn && f.checkOut && f.roomId ? { ...f, id: modal?.x?.id } : null;
  const conflict = draft && clashes(biz.stays, draft).length > 0, badDates = f.checkIn && f.checkOut && f.checkOut <= f.checkIn;
  const fl = f.checkIn ? folio(f) : null;
  const persist = (s) => { upsert("stays", { id: modal.x?.id || uid(), no: modal.x?.no || nextNo("booking"), createdAt: modal.x?.createdAt || new Date().toISOString(), ...s }); };
  const saveStay = (e, patch = {}) => {
    e?.preventDefault?.();
    if (badDates) return toast(t("ho_badDates"), "error");
    if (conflict && ACTIVE.includes(patch.status || f.status)) return toast(t("ho_conflict"), "error");
    persist({ ...f, ...patch, rate: Number(f.rate) || 0 }); close();
  };
  const checkOut = () => {
    const s = { ...f }, x = folio(s), rm = room(s.roomId);
    const items = [{ desc: `${t("ho_room")} ${rm?.name || ""} — ${x.n} ${t("ho_nights")}`, qty: x.n, price: Number(s.rate) || 0, unit: "" }, ...(s.charges || []).map((c) => ({ desc: c.desc, qty: Number(c.qty) || 1, price: Number(c.amount) || 0, unit: "" }))];
    if (x.disc) items.push({ desc: t("inv_discAmt"), qty: 1, price: -x.disc, unit: "" });
    if (x.tax) items.push({ desc: t("inv_taxAmt"), qty: 1, price: x.tax, unit: "" });
    const paid = Math.min(Math.max(x.paid, 0), x.total), no = nextNo("invoice");
    upsert("invoices", { id: uid(), no, type: "invoice", customer: s.guest, issueDate: today, dueDate: today, currency: cur, discount: 0, tax: 0, notes: s.no || "", paidAmount: paid, status: x.balance <= 0.005 ? "paid" : paid > 0 ? "partial" : "unpaid", items });
    persist({ ...s, status: "checkedout", invoiceNo: no, checkedOutAt: today });
    if (rm) upsert("rooms", { ...rm, hk: "dirty" });
    close(); toast(`${t("ho_invoiced")} ${no}`, "success");
  };
  const quick = (s, status) => { if (status === "checkedin" && room(s.roomId)?.hk === "maintenance") return toast(t("ho_roomMaint"), "error"); upsert("stays", { ...s, status }); };

  /* ---------- numbers ---------- */
  const inHouse = biz.stays.filter((s) => s.status === "checkedin"), arrivals = biz.stays.filter((s) => s.status === "booked" && s.checkIn === today), departures = inHouse.filter((s) => s.checkOut <= today);
  const month = kpis(biz.rooms, biz.stays, today.slice(0, 7)), occNow = biz.rooms.length ? (biz.rooms.filter((r) => stayOn(biz.stays, r.id, today)?.status === "checkedin").length / biz.rooms.length) * 100 : 0;
  const days = [...Array(14)].map((_, i) => addDays(today, i));
  const list = biz.stays.filter((s) => !st || s.status === st).sort((a, b) => b.checkIn.localeCompare(a.checkIn));
  const stBadge = { booked: "badge-blue", checkedin: "badge-green", checkedout: "", cancelled: "badge-red", noshow: "badge-red" };
  const hkBadge = { clean: "badge-green", dirty: "badge-violet", maintenance: "badge-red" };
  const newStay = (roomId = "", checkIn = today) => biz.rooms.length ? open("stay", null, { guest: "", phone: "", idNo: "", nationality: "", roomId, checkIn, checkOut: addDays(checkIn, 1), adults: 1, children: 0, rate: room(roomId)?.rate || "", discount: 0, tax: biz.taxRate, source: "walkin", status: "booked", notes: "", charges: [], payments: [] }) : toast(t("ho_needRooms"), "error");

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="section-title"><h2>{t("hotel")}</h2><button className="btn btn-primary btn-sm" onClick={() => newStay()}><IconPlus />{t("ho_newStay")}</button></div>
      <div className="tabs">{[["board", "ho_board"], ["res", "ho_res"], ["grid", "ho_grid"], ["rooms", "ho_rooms"]].map(([k, l]) => <button key={k} className={`btn btn-sm ${tab === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(k)}>{t(l)}</button>)}</div>

      {tab === "board" && (<>
        <div className="stat-grid">
          <div className="glass stat-card"><div className="stat-label">{t("ho_inHouse")}</div><div className="stat-value">{inHouse.length}</div></div>
          <div className="glass stat-card"><div className="stat-label">{t("ho_occNow")}</div><div className="stat-value">{fmt(occNow)}%</div></div>
          <div className="glass stat-card"><div className="stat-label">{t("ho_arrivals")}</div><div className="stat-value">{arrivals.length}</div></div>
          <div className="glass stat-card"><div className="stat-label">{t("ho_dirty")}</div><div className="stat-value">{biz.rooms.filter((r) => r.hk === "dirty").length}</div></div>
        </div>
        {[[t("ho_arrivals"), arrivals, "checkedin", t("ho_checkIn")], [t("ho_departures"), departures, null, t("ho_folio")]].map(([title, arr, to, label]) => arr.length > 0 && (
          <div key={title} className="glass card" style={{ display: "grid", gap: "0.4rem" }}><strong>{title}</strong>
            {arr.map((s) => <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}><span>{s.guest} · {room(s.roomId)?.name}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => (to ? quick(s, to) : open("stay", s))}>{label}</button></div>)}</div>))}
        <Summary cur={cur} title={`${t("ho_monthKpi")} ${today.slice(0, 7)}`} rows={[{ label: t("ho_roomNights"), text: String(month.nights), tone: "muted" }, { label: t("ho_roomRevenue"), value: month.revenue, sub: true }, { label: t("ho_adr"), value: month.adr }, { label: t("ho_revpar"), value: month.revpar }]} total={{ label: t("ho_occMonth"), value: month.occ }} />
        <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{t("ho_kpiNote")}</p>
      </>)}

      {tab === "res" && (<>
        <select className="select" style={{ width: "auto" }} value={st} onChange={(e) => setSt(e.target.value)}><option value="">{t("map_filter")}</option>{["booked", "checkedin", "checkedout", "cancelled", "noshow"].map((k) => <option key={k} value={k}>{t("ho_st_" + k)}</option>)}</select>
        {list.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : list.map((s) => { const x = folio(s); return (
          <div key={s.id} className="glass card" style={{ display: "grid", gap: "0.4rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}><strong>{s.guest} <bdi dir="ltr" style={{ color: "var(--text-3)" }}>{s.no}</bdi></strong><span className={`badge ${stBadge[s.status]}`}>{t("ho_st_" + s.status)}</span></div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{room(s.roomId)?.name} · <bdi dir="ltr">{s.checkIn} → {s.checkOut}</bdi> · {x.n} {t("ho_nights")} · {Number(s.adults) + Number(s.children || 0)} {t("rs_guests")}</div>
            <div className="mini3">{[[t("inv_total"), x.total], [t("inv_paidAmt"), x.paid], [t("inv_left"), x.balance]].map(([l, v], k) => <div key={k}><small>{l}</small><b dir="ltr" style={k === 2 && v > 0.005 ? { color: "var(--cyan)" } : undefined}>{fmt(v)}</b></div>)}</div>
            <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
              {s.status === "booked" && <button className="btn btn-primary btn-sm" onClick={() => quick(s, "checkedin")}>{t("ho_checkIn")}</button>}
              <button className="btn btn-ghost btn-sm" onClick={() => open("stay", s)}>{s.status === "checkedin" ? t("ho_folio") : t("b_edit")}</button>
              <button className="icon-btn" aria-label={t("delete")} onClick={() => setDel({ coll: "stays", x: s })}><IconTrash /></button></div>
          </div>); })}
      </>)}

      {tab === "grid" && (biz.rooms.length === 0 ? <EmptyState icon={<IconBox />} text={t("ho_needRooms")} /> : (
        <div className="glass card" style={{ overflowX: "auto", padding: "0.5rem" }}>
          <table style={{ borderCollapse: "collapse", fontSize: "var(--text-xs)" }}><thead><tr><th style={{ position: "sticky", insetInlineStart: 0, background: "#0c1220", padding: "4px 8px" }}>{t("ho_room")}</th>{days.map((d) => <th key={d} style={{ padding: "4px 6px", fontWeight: 500 }}><bdi dir="ltr">{d.slice(8)}</bdi></th>)}</tr></thead>
            <tbody>{biz.rooms.map((r) => <tr key={r.id}><td style={{ position: "sticky", insetInlineStart: 0, background: "#0c1220", padding: "4px 8px", fontWeight: 700 }}>{r.name}</td>
              {days.map((d) => { const s = stayOn(biz.stays, r.id, d); return <td key={d} title={s ? s.guest : ""} onClick={() => (s ? open("stay", s) : newStay(r.id, d))} style={{ cursor: "pointer", minWidth: 30, height: 26, border: "1px solid var(--border)", background: s ? (s.status === "checkedin" ? "rgba(74,222,128,.45)" : "rgba(54,139,255,.45)") : "transparent", textAlign: "center" }}>{s ? s.guest.slice(0, 2) : ""}</td>; })}</tr>)}</tbody></table>
          <p style={{ margin: "0.5rem 0 0", fontSize: "var(--text-xs)", color: "var(--text-3)" }}>🟩 {t("ho_st_checkedin")} · 🟦 {t("ho_st_booked")} · {t("ho_gridHelp")}</p></div>))}

      {tab === "rooms" && (<>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-sm" onClick={() => open("room", null, { name: "", floor: "", type: "double", beds: "", capacity: 2, rate: "", hk: "clean", notes: "" })}><IconPlus />{t("ho_newRoom")}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => open("gen", null, { from: 1, to: 5, per: 10, prefix: "", type: "double", beds: "", capacity: 2, rate: "" })}>⚡ {t("pr_gen")}</button></div>
        {biz.rooms.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : biz.rooms.map((r) => { const s = stayOn(biz.stays, r.id, today); return (
          <div key={r.id} className="glass card" style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <div><strong>{r.name}</strong> <span className="badge badge-blue">{t("ho_t_" + r.type)}</span> <span className={`badge ${s?.status === "checkedin" ? "badge-green" : ""}`}>{s?.status === "checkedin" ? t("pr_s_occupied") : s ? t("pr_s_reserved") : t("pr_s_vacant")}</span>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--text-3)" }}>{r.floor && `${t("pr_floor")} ${r.floor} · `}{r.capacity} {t("rs_guests")} · <bdi dir="ltr">{fmt(r.rate)} {cur}</bdi>{s && ` · ${s.guest}`}</div></div>
            <span style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}><button className={`btn btn-sm btn-ghost`} onClick={() => cycleHk(r)}><span className={`badge ${hkBadge[r.hk]}`}>{t("ho_hk_" + r.hk)}</span></button>
              <button className="icon-btn" aria-label={t("b_edit")} onClick={() => open("room", r)}><IconEdit /></button>
              <button className="icon-btn" aria-label={t("delete")} onClick={() => biz.stays.some((x) => x.roomId === r.id) ? toast(t("ho_roomHasStays"), "error") : setDel({ coll: "rooms", x: r })}><IconTrash /></button></span>
          </div>); })}
      </>)}

      {modal?.kind === "room" && <Modal title={t("ho_newRoom")} onClose={close}><form onSubmit={saveRoom}><Grid>
        <F label={t("ho_roomNo") + " *"}><input className="input" required value={f.name} onChange={set("name")} /></F>
        <F label={t("pr_floor")}><input className="input" value={f.floor} onChange={set("floor")} /></F>
        <F label={t("map_kind")}><select className="select" value={f.type} onChange={set("type")}>{R_TYPES.map((k) => <option key={k} value={k}>{t("ho_t_" + k)}</option>)}</select></F>
        <F label={t("ho_beds")}><input className="input" value={f.beds} onChange={set("beds")} /></F>
        <F label={t("rs_guests")}><input className="input" type="number" min="1" value={f.capacity} onChange={set("capacity")} {...ltr} /></F>
        <F label={`${t("ho_rate")} (${cur})`}><input className="input" type="number" min="0" step="any" value={f.rate} onChange={set("rate")} {...ltr} /></F>
        <F label={t("emp_notes")} wide><input className="input" value={f.notes} onChange={set("notes")} /></F></Grid><Foot t={t} onCancel={close} /></form></Modal>}
      {modal?.kind === "gen" && <Modal title={t("pr_gen")} onClose={close}><form onSubmit={gen}><Grid>
        <F label={t("pr_fromFloor")}><input className="input" type="number" min="0" required value={f.from} onChange={set("from")} {...ltr} /></F>
        <F label={t("pr_toFloor")}><input className="input" type="number" min="0" required value={f.to} onChange={set("to")} {...ltr} /></F>
        <F label={t("pr_perFloor")}><input className="input" type="number" min="1" max="99" required value={f.per} onChange={set("per")} {...ltr} /></F>
        <F label={t("pr_prefix")}><input className="input" value={f.prefix} onChange={set("prefix")} {...ltr} /></F>
        <F label={t("map_kind")}><select className="select" value={f.type} onChange={set("type")}>{R_TYPES.map((k) => <option key={k} value={k}>{t("ho_t_" + k)}</option>)}</select></F>
        <F label={`${t("ho_rate")} (${cur})`}><input className="input" type="number" min="0" step="any" value={f.rate} onChange={set("rate")} {...ltr} /></F></Grid>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{t("pr_genHelp")} <bdi dir="ltr">{f.prefix}{f.from}01 … {f.prefix}{f.to}{pad2(f.per)}</bdi></p><Foot t={t} onCancel={close} /></form></Modal>}

      {modal?.kind === "stay" && <Modal wide title={modal.x ? `${f.guest} · ${f.no || ""}` : t("ho_newStay")} onClose={close}><form onSubmit={saveStay}>
        <Grid>
          <F label={t("ho_guest") + " *"}><input className="input" required list="gs" value={f.guest} onChange={set("guest")} /><datalist id="gs">{contacts.map((c) => <option key={c.id} value={c.name} />)}</datalist></F>
          <F label={t("phone")}><input className="input" type="tel" value={f.phone} onChange={set("phone")} {...ltr} /></F>
          <F label={t("ho_idNo")}><input className="input" value={f.idNo} onChange={set("idNo")} {...ltr} /></F>
          <F label={t("emp_nation")}><input className="input" value={f.nationality} onChange={set("nationality")} /></F>
          <F label={t("ho_room") + " *"}><select className="select" required value={f.roomId} onChange={(e) => setF((p) => ({ ...p, roomId: e.target.value, rate: p.rate || room(e.target.value)?.rate || "" }))}><option value="">—</option>{biz.rooms.map((r) => <option key={r.id} value={r.id}>{r.name} · {t("ho_t_" + r.type)} · {fmt(r.rate)}</option>)}</select></F>
          <F label={t("ho_checkIn")}><input className="input" type="date" required value={f.checkIn} onChange={set("checkIn")} {...ltr} /></F>
          <F label={t("ho_checkOut")}><input className="input" type="date" required value={f.checkOut} onChange={set("checkOut")} {...ltr} /></F>
          <F label={t("ho_adults")}><input className="input" type="number" min="1" value={f.adults} onChange={set("adults")} {...ltr} /></F>
          <F label={t("ho_children")}><input className="input" type="number" min="0" value={f.children} onChange={set("children")} {...ltr} /></F>
          <F label={`${t("ho_rate")} (${cur})`}><input className="input" type="number" min="0" step="any" value={f.rate} onChange={set("rate")} {...ltr} /></F>
          <F label={t("inv_discount")}><input className="input" type="number" min="0" max="100" step="any" value={f.discount} onChange={set("discount")} {...ltr} /></F>
          <F label={t("inv_tax")}><input className="input" type="number" min="0" max="100" step="any" value={f.tax ?? biz.taxRate} onChange={set("tax")} {...ltr} /></F>
          <F label={t("ho_source")}><select className="select" value={f.source} onChange={set("source")}>{SOURCES.map((k) => <option key={k} value={k}>{t("ho_src_" + k)}</option>)}</select></F>
        </Grid>
        {conflict && <div style={{ color: "#ff8a9b", fontSize: "var(--text-sm)" }}>⚠ {t("ho_conflict")}</div>}{badDates && <div style={{ color: "#ff8a9b", fontSize: "var(--text-sm)" }}>⚠ {t("ho_badDates")}</div>}
        <Sec>{t("ho_charges")}</Sec>
        {f.charges.map((c) => <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", padding: "0.25rem 0", borderTop: "1px solid var(--border)" }}><span>{c.date} · {c.desc}{c.qty > 1 && ` ×${c.qty}`}</span><span><bdi dir="ltr">{fmt((Number(c.qty) || 1) * Number(c.amount))}</bdi><button type="button" className="icon-btn" aria-label={t("delete")} onClick={() => setF((p) => ({ ...p, charges: p.charges.filter((x) => x.id !== c.id) }))}><IconTrash /></button></span></div>)}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 56px 90px 40px", gap: "0.35rem", margin: "0.4rem 0" }}>
          <input className="input" placeholder={t("inv_desc")} value={ch.desc} onChange={(e) => setCh({ ...ch, desc: e.target.value })} /><input className="input" type="number" min="1" dir="ltr" value={ch.qty} onChange={(e) => setCh({ ...ch, qty: e.target.value })} />
          <input className="input" type="number" step="any" dir="ltr" placeholder={t("amount")} value={ch.amount} onChange={(e) => setCh({ ...ch, amount: e.target.value })} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (ch.desc && Number(ch.amount)) { setF((p) => ({ ...p, charges: [...p.charges, { id: uid(), date: today, desc: ch.desc, qty: Number(ch.qty) || 1, amount: Number(ch.amount) }] })); setCh({ desc: "", qty: 1, amount: "" }); } }}><IconPlus /></button></div>
        <Sec>{t("ho_payments")}</Sec>
        {f.payments.map((p) => <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", padding: "0.25rem 0", borderTop: "1px solid var(--border)" }}><span>{p.date} · {t("exp_m_" + p.method)}</span><span><bdi dir="ltr">{fmt(p.amount)}</bdi><button type="button" className="icon-btn" aria-label={t("delete")} onClick={() => setF((s) => ({ ...s, payments: s.payments.filter((x) => x.id !== p.id) }))}><IconTrash /></button></span></div>)}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 40px", gap: "0.35rem", margin: "0.4rem 0" }}>
          <input className="input" type="number" step="any" dir="ltr" placeholder={t("amount")} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
          <select className="select" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{["cash", "card", "transfer", "wallet"].map((k) => <option key={k} value={k}>{t("exp_m_" + k)}</option>)}</select>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (Number(pay.amount) > 0) { setF((p) => ({ ...p, payments: [...p.payments, { id: uid(), date: today, amount: Number(pay.amount), method: pay.method }] })); setPay({ ...pay, amount: "" }); } }}><IconPlus /></button></div>
        {fl && <Summary cur={cur} rows={[{ label: `${t("ho_room")} (${fl.n} ${t("ho_nights")})`, value: fl.room }, { label: t("ho_charges"), value: fl.extras + fl.inclTax, tone: "plus" }, { label: t("inv_discAmt"), value: fl.disc, tone: "minus" }, { label: t("inv_taxAmt"), value: fl.tax, tone: "plus" }, { label: t("inv_total"), value: fl.total, sub: true }, { label: t("inv_paidAmt"), value: fl.paid, tone: "minus" }]} total={{ label: t("inv_left"), value: fl.balance }} />}
        <F label={t("emp_notes")}><input className="input" value={f.notes} onChange={set("notes")} /></F>
        <Foot t={t} onCancel={close} extra={<>
          {f.status === "booked" && modal.x && <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => saveStay(e, { status: "cancelled" })}>{t("ho_st_cancelled")}</button>}
          {f.status === "booked" && modal.x && <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => saveStay(e, { status: "noshow" })}>{t("ho_st_noshow")}</button>}
          {f.status === "booked" && <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => saveStay(e, { status: "checkedin" })}>{t("ho_checkIn")}</button>}
          {f.status === "checkedin" && <button type="button" className="btn btn-primary btn-sm" onClick={checkOut}>{t("ho_settle")}</button>}</>} />
      </form></Modal>}
      {del && <ConfirmDialog title={t("delete")} message={t("b_confirmDelete")} onConfirm={() => remove(del.coll, del.x.id)} onClose={() => setDel(null)} />}
    </div>
  );
}
