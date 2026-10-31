import React, { useMemo, useState } from "react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Modal, EmptyState, ConfirmDialog } from "../components/UI";
import { IconBox, IconPlus, IconEdit, IconTrash } from "../components/Icons";
import MoneyInput from "../components/MoneyInput";
import PropertyCosts from "./PropertyCosts";
import MapPicker from "../components/MapPicker";
import CurrencyPicker from "../components/CurrencyPicker";
import { F, Grid, ltr, useForm } from "../components/Form";
import { useBiz, upsert, remove, uid, fmt, nextNo, todayStr, toMain, leftOf } from "../services/biz";
import { CYCLES, rentFor, isDue, getExpiring, unitState, covers, mIdx } from "../services/realestate";

const B_TYPES = ["mall", "apartments", "villa", "office", "warehouse", "land", "other"];
const U_TYPES = ["shop", "apartment", "suite", "room", "office", "warehouse", "kiosk", "roof", "parking", "other"];
const HOME = ["apartment", "suite", "room"];
const pad2 = (n) => String(n).padStart(2, "0");
const Bar = ({ v, max }) => <div style={{ height: 8, borderRadius: 4, background: "#368bff", width: `${max ? Math.max((v / max) * 100, v > 0 ? 3 : 0) : 0}%` }} />;
const Foot = ({ onCancel, t }) => <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end", marginTop: "0.7rem" }}><button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>{t("cancel")}</button><button className="btn btn-primary btn-sm">{t("save")}</button></div>;

export default function Properties() {
  const { t, toast } = useApp();
  const biz = useBiz(), cur = biz.currency, today = todayStr();
  const [tab, setTab] = useState("over"), [modal, setModal] = useState(null), [del, setDel] = useState(null), [bf, setBf] = useState(""), [period, setPeriod] = useState(today.slice(0, 7));
  const [contacts, setContacts] = useState([]), [picker, setPicker] = useState(false);
  React.useEffect(() => { api.get("/contacts").then((d) => setContacts(d.items || [])).catch(() => {}); }, []);
  const [f, set, setF] = useForm({});
  const close = () => setModal(null);
  const open = (kind, x, init) => { setF(x ? { ...x } : init); setModal({ kind, x }); };
  const save = (coll, extra) => (e) => { e.preventDefault(); upsert(coll, { id: modal.x?.id || uid(), ...(modal.x || {}), ...f, ...(extra || {}) }); close(); };
  const bName = (id) => biz.props.find((b) => b.id === id)?.name || "";
  const uLabel = (u) => (u ? `${bName(u.propId)} · ${u.floor ? u.floor + " · " : ""}${u.name}` : "—");
  const uOf = (id) => biz.units.find((u) => u.id === id);

  /* ---------- numbers (all computed here) ---------- */
  const states = biz.units.map((u) => [u, unitState(biz, u)]);
  const occ = states.filter(([, s]) => s === "occupied"), vac = states.filter(([, s]) => s === "vacant");
  const area = (a) => a.reduce((s, [u]) => s + (Number(u.area) || 0), 0);
  const cover = biz.leases.filter((l) => covers(l, today));
  let rentRoll = 0, noRate = 0;
  cover.forEach((l) => { const v = toMain(biz, rentFor(l, today.slice(0, 7)), l.currency || cur); if (v == null) noRate++; else rentRoll += v; });
  const arrears = biz.invoices.filter((i) => i.leaseId && (i.status === "unpaid" || i.status === "partial") && i.dueDate && i.dueDate < today && (i.currency || cur) === cur);
  const arrearsBy = Object.entries(arrears.reduce((m, i) => ((m[i.customer] = (m[i.customer] || 0) + leftOf(i)), m), {})).sort((a, b) => b[1] - a[1]);
  const expiring = getExpiring(biz);
  const pending = biz.leases.filter((l) => isDue(l, period) && !biz.invoices.some((i) => i.leaseId === l.id && i.period === period));

  const generate = () => {
    pending.forEach((l) => {
      const step = CYCLES[l.cycle] || 1, u = uOf(l.unitId), due = `${period}-${String(Math.min(Math.max(Number(l.dueDay) || 1, 1), 28)).padStart(2, "0")}`;
      upsert("invoices", { id: uid(), no: nextNo("invoice"), type: "invoice", customer: l.tenant, issueDate: today, dueDate: due, currency: l.currency || cur, discount: 0, tax: 0, notes: l.no, paidAmount: "", status: "unpaid", leaseId: l.id, period, items: [{ desc: `${t("pr_rent")} ${uLabel(u)} — ${period}${step > 1 ? ` (×${step})` : ""}`, qty: 1, price: +(rentFor(l, period) * step).toFixed(2), unit: "" }] });
    });
    toast(`${pending.length} ${t("pr_generated")}`, "success");
  };
  const endLease = (l, status) => upsert("leases", { ...l, status });
  const shownUnits = states.filter(([u]) => !bf || u.propId === bf);
  const clash = modal?.kind === "lease" && f.unitId && f.start && biz.leases.some((l) => l.id !== modal.x?.id && l.unitId === f.unitId && l.status === "active" && l.start <= (f.end || "9999") && (!l.end || l.end >= f.start));
  const badge = { occupied: "badge-green", vacant: "badge-violet", reserved: "badge-blue", maintenance: "badge-red" };

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="section-title"><h2>{t("properties")}</h2></div>
      <div className="tabs">{[["over", "pr_over"], ["units", "pr_units"], ["leases", "pr_leases"], ["bills", "pr_bills"], ["shared", "pr_shared"], ["props", "pr_buildings"]].map(([k, l]) => <button key={k} className={`btn btn-sm ${tab === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(k)}>{t(l)}</button>)}</div>

      {tab === "over" && (<>
        <div className="stat-grid">
          <div className="glass stat-card"><div className="stat-label">{t("pr_occupancy")}</div><div className="stat-value">{biz.units.length ? fmt((occ.length / biz.units.length) * 100) : "0.00"}%</div></div>
          <div className="glass stat-card"><div className="stat-label">{t("pr_rentRoll")}</div><div className="stat-value">{fmt(rentRoll)} {cur}</div></div>
          <div className="glass stat-card"><div className="stat-label">{t("pr_perM2")}</div><div className="stat-value">{area(occ) > 0 ? fmt(rentRoll / area(occ)) : "—"}</div></div>
          <div className="glass stat-card"><div className="stat-label">{t("pr_vacant")}</div><div className="stat-value">{vac.length} <small>({fmt(area(vac))} m²)</small></div></div>
        </div>
        {noRate > 0 && <div style={{ color: "#ff8a9b", fontSize: "var(--text-sm)" }}>⚠ {noRate} {t("pr_noRate")}</div>}
        <div className="glass card" style={{ display: "grid", gap: "0.5rem" }}>
          <h3 style={{ margin: 0 }}>{t("pr_billing")}</h3>
          <input className="input" type="month" style={{ width: "auto" }} value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} {...ltr} />
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{pending.length} {t("pr_pending")}</div>
          <button className="btn btn-primary btn-sm" style={{ justifySelf: "start" }} disabled={!pending.length} onClick={generate}>{t("pr_generate")}</button>
          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{t("pr_billNote")}</p>
        </div>
        {expiring.length > 0 && <div className="glass card" style={{ borderColor: "rgba(255,107,129,.5)" }}><strong>⏳ {t("pr_expiring")} ({expiring.length})</strong>
          {expiring.map((l) => <div key={l.id} style={{ fontSize: "var(--text-sm)", display: "flex", justifyContent: "space-between" }}><span>{l.tenant} · {uLabel(uOf(l.unitId))}</span><bdi dir="ltr">{l.end}</bdi></div>)}</div>}
        {arrearsBy.length > 0 && <div className="glass card"><strong>{t("pr_arrears")}</strong>
          {arrearsBy.map(([n, v]) => <div key={n} style={{ display: "flex", justifyContent: "space-between" }}><span>{n}</span><b dir="ltr" style={{ color: "#ff8a9b" }}>{fmt(v)} {cur}</b></div>)}</div>}
        {biz.props.length > 0 && <div className="glass card"><strong>{t("pr_byBuilding")}</strong>
          {biz.props.map((b) => { const us = states.filter(([u]) => u.propId === b.id), o = us.filter(([, s]) => s === "occupied").length; return <div key={b.id} style={{ marginTop: 6 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}><span>{b.name}</span><bdi dir="ltr">{o}/{us.length}</bdi></div><Bar v={o} max={us.length} /></div>; })}</div>}
      </>)}

      {tab === "props" && (<>
        <button className="btn btn-primary btn-sm" style={{ justifySelf: "start" }} onClick={() => open("prop", null, { name: "", type: "mall", address: "", city: "", floors: "", lat: "", lng: "", notes: "" })}><IconPlus />{t("pr_newBuilding")}</button>
        {biz.props.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : biz.props.map((b) => (
          <div key={b.id} className="glass card" style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <div><strong>{b.name}</strong> <span className="badge badge-blue">{t("pr_b_" + b.type)}</span><div style={{ fontSize: "var(--text-sm)", color: "var(--text-3)" }}>{[b.city, b.address, b.floors && `${b.floors} ${t("pr_floors")}`].filter(Boolean).join(" · ")}</div>
              {b.lat !== "" && b.lat != null && b.lng !== "" && <a className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${b.lat}&mlon=${b.lng}#map=17/${b.lat}/${b.lng}`}>📍 {t("pr_showMap")}</a>}</div>
            <span><button className="icon-btn" aria-label={t("b_edit")} onClick={() => open("prop", b)}><IconEdit /></button>
              <button className="icon-btn" aria-label={t("delete")} onClick={() => biz.units.some((u) => u.propId === b.id) ? toast(t("pr_hasUnits"), "error") : setDel({ coll: "props", x: b })}><IconTrash /></button></span>
          </div>))}
      </>)}

      {tab === "units" && (<>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-sm" onClick={() => biz.props.length ? open("unit", null, { propId: bf || biz.props[0].id, floor: "", name: "", type: "shop", area: "", baseRent: "", baseCur: cur, baseFx: "", furnished: "", rooms: "", maint: false, notes: "" }) : toast(t("pr_needBuilding"), "error")}><IconPlus />{t("pr_newUnit")}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => biz.props.length ? open("gen", null, { propId: bf || biz.props[0].id, from: 1, to: 5, per: 4, prefix: "", type: "apartment", area: "", furnished: "", baseRent: "", baseCur: cur, baseFx: "" }) : toast(t("pr_needBuilding"), "error")}>⚡ {t("pr_gen")}</button>
          <select className="select" style={{ width: "auto" }} value={bf} onChange={(e) => setBf(e.target.value)}><option value="">{t("map_filter")}</option>{biz.props.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </div>
        {shownUnits.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : shownUnits.map(([u, s]) => {
          const l = biz.leases.find((x) => x.unitId === u.id && covers(x, today));
          return (
            <div key={u.id} className="glass card" style={{ display: "grid", gap: "0.4rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}><strong>{uLabel(u)}</strong><span className={`badge ${badge[s]}`}>{t("pr_s_" + s)}</span></div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{t("pr_u_" + u.type)}{HOME.includes(u.type) && u.furnished && ` · ${t("pr_f_" + u.furnished)}`}{HOME.includes(u.type) && u.rooms && ` · ${u.rooms} ${t("pr_rooms")}`} · {u.area || "—"} m²{l && ` · ${l.tenant} · ${fmt(rentFor(l, today.slice(0, 7)))} ${l.currency || cur}`}</div>
              <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                {s === "vacant" && <button className="btn btn-primary btn-sm" onClick={() => open("lease", null, { unitId: u.id, tenant: "", phone: "", start: today, end: "", rent: u.baseRent || "", currency: u.baseCur || cur, cycle: "monthly", dueDay: 1, deposit: "", increase: "", status: "active", notes: "", no: "" })}>{t("pr_newLease")}</button>}
                <button className="icon-btn" aria-label={t("b_edit")} onClick={() => open("unit", u)}><IconEdit /></button>
                <button className="icon-btn" aria-label={t("delete")} onClick={() => biz.leases.some((x) => x.unitId === u.id) ? toast(t("pr_hasLeases"), "error") : setDel({ coll: "units", x: u })}><IconTrash /></button>
              </div>
            </div>);
        })}
      </>)}

      {tab === "leases" && (<>
        {biz.leases.length === 0 ? <EmptyState icon={<IconBox />} text={t("pr_noLeases")} /> : biz.leases.map((l) => {
          const left = l.end ? Math.round((new Date(l.end) - new Date(today)) / 864e5) : null;
          return (
            <div key={l.id} className="glass card" style={{ display: "grid", gap: "0.4rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}><strong>{l.tenant}</strong><span className={`badge ${l.status === "active" ? "badge-green" : "badge-red"}`}>{t("pr_l_" + l.status)}</span></div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{uLabel(uOf(l.unitId))} · <bdi dir="ltr">{l.start} → {l.end || "∞"}</bdi>{left != null && l.status === "active" && left >= 0 && ` · ${left} ${t("pr_daysLeft")}`}</div>
              <div className="mini3">{[[t("pr_rentMonthly"), rentFor(l, today.slice(0, 7))], [t("pr_deposit"), Number(l.deposit) || 0], [t("pr_increase"), Number(l.increase) || 0]].map(([k, v], i) => <div key={i}><small>{k}</small><b dir="ltr">{fmt(v)}{i === 2 ? "%" : ` ${l.currency || cur}`}</b></div>)}</div>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                {l.status === "active" && <button className="btn btn-ghost btn-sm" onClick={() => open("lease", (({ id, ...r }) => ({ ...r, no: "", start: l.end || today, end: "", status: "active" }))(l), null)}>{t("pr_renew")}</button>}
                {l.status === "active" && <button className="btn btn-ghost btn-sm" onClick={() => endLease(l, "ended")}>{t("pr_end")}</button>}
                <button className="icon-btn" aria-label={t("b_edit")} onClick={() => open("lease", l)}><IconEdit /></button>
                <button className="icon-btn" aria-label={t("delete")} onClick={() => setDel({ coll: "leases", x: l })}><IconTrash /></button>
              </div>
            </div>);
        })}
      </>)}

      {modal?.kind === "prop" && <Modal title={t("pr_newBuilding")} onClose={close}><form onSubmit={save("props")}><Grid>
        <F label={t("map_name") + " *"}><input className="input" required value={f.name} onChange={set("name")} /></F>
        <F label={t("map_kind")}><select className="select" value={f.type} onChange={set("type")}>{B_TYPES.map((k) => <option key={k} value={k}>{t("pr_b_" + k)}</option>)}</select></F>
        <F label={t("ct_city")}><input className="input" value={f.city} onChange={set("city")} /></F>
        <F label={t("pr_floors")}><input className="input" type="number" min="0" value={f.floors} onChange={set("floors")} {...ltr} /></F>
        <F label={t("b_address")} wide><input className="input" value={f.address} onChange={set("address")} /></F>
        <F label={t("map_lat")}><input className="input" type="number" step="any" value={f.lat} onChange={set("lat")} {...ltr} /></F>
        <F label={t("map_lng")}><input className="input" type="number" step="any" value={f.lng} onChange={set("lng")} {...ltr} /></F></Grid>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicker(true)}>📍 {t("pr_pickMap")}</button>
        <Foot t={t} onCancel={close} /></form></Modal>}
      {picker && <MapPicker lat={f.lat} lng={f.lng} onPick={(la, lo) => setF((p) => ({ ...p, lat: la, lng: lo }))} onClose={() => setPicker(false)} />}

      {(tab === "bills" || tab === "shared") && <PropertyCosts tab={tab} />}
      {modal?.kind === "gen" && <Modal title={t("pr_gen")} onClose={close}><form onSubmit={(e) => {
        e.preventDefault();
        const have = new Set(biz.units.filter((u) => u.propId === f.propId).map((u) => u.name)); let n = 0;
        for (let fl = Number(f.from); fl <= Number(f.to); fl++) for (let k = 1; k <= Number(f.per); k++) {
          const name = `${f.prefix}${fl}${pad2(k)}`; if (have.has(name)) continue;
          upsert("units", { id: uid(), propId: f.propId, floor: String(fl), name, type: f.type, area: f.area, baseRent: f.baseRent, baseCur: f.baseCur, baseFx: f.baseFx, furnished: f.furnished, rooms: "", maint: false, notes: "" }); n++;
        }
        toast(`${n} ${t("pr_created")}`, "success"); close();
      }}><Grid>
        <F label={t("pr_building")}><select className="select" value={f.propId} onChange={set("propId")}>{biz.props.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></F>
        <F label={t("pr_fromFloor")}><input className="input" type="number" min="0" max="200" required value={f.from} onChange={set("from")} {...ltr} /></F>
        <F label={t("pr_toFloor")}><input className="input" type="number" min="0" max="200" required value={f.to} onChange={set("to")} {...ltr} /></F>
        <F label={t("pr_perFloor")}><input className="input" type="number" min="1" max="99" required value={f.per} onChange={set("per")} {...ltr} /></F>
        <F label={t("pr_prefix")}><input className="input" value={f.prefix} onChange={set("prefix")} {...ltr} /></F>
        <F label={t("map_kind")}><select className="select" value={f.type} onChange={set("type")}>{U_TYPES.map((k) => <option key={k} value={k}>{t("pr_u_" + k)}</option>)}</select></F>
        <F label={t("pr_area")}><input className="input" type="number" min="0" step="any" value={f.area} onChange={set("area")} {...ltr} /></F>
        <F label={t("pr_baseRent")}><MoneyInput f={f} setF={setF} amount="baseRent" currency="baseCur" fx="baseFx" /></F>
        {HOME.includes(f.type) && <F label={t("pr_furnished")}><select className="select" value={f.furnished || ""} onChange={set("furnished")}><option value="">—</option><option value="furnished">{t("pr_f_furnished")}</option><option value="unfurnished">{t("pr_f_unfurnished")}</option></select></F>}</Grid>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{t("pr_genHelp")} <bdi dir="ltr">{f.prefix}{f.from}01 … {f.prefix}{f.to}{pad2(f.per)}</bdi> · {(Math.max(Number(f.to) - Number(f.from) + 1, 0)) * Number(f.per || 0)} {t("pr_units")}</p>
        <Foot t={t} onCancel={close} /></form></Modal>}
      {modal?.kind === "unit" && <Modal title={t("pr_newUnit")} onClose={close}><form onSubmit={(e) => { if (biz.units.some((u) => u.id !== modal.x?.id && u.propId === f.propId && u.name.trim() === f.name.trim())) { e.preventDefault(); return toast(t("pr_dupUnit"), "error"); } save("units")(e); }}><Grid>
        <F label={t("pr_building") + " *"}><select className="select" required value={f.propId} onChange={set("propId")}>{biz.props.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></F>
        <F label={t("pr_floor")}><input className="input" value={f.floor} onChange={set("floor")} /></F>
        <F label={t("pr_unitNo") + " *"}><input className="input" required value={f.name} onChange={set("name")} /></F>
        <F label={t("map_kind")}><select className="select" value={f.type} onChange={set("type")}>{U_TYPES.map((k) => <option key={k} value={k}>{t("pr_u_" + k)}</option>)}</select></F>
        <F label={t("pr_area")}><input className="input" type="number" min="0" step="any" value={f.area} onChange={set("area")} {...ltr} /></F>
        <F label={t("pr_baseRent")}><MoneyInput f={f} setF={setF} amount="baseRent" currency="baseCur" fx="baseFx" /></F>
        <F label={t("pr_s_maintenance")}><select className="select" value={f.maint ? "1" : ""} onChange={(e) => setF((p) => ({ ...p, maint: !!e.target.value }))}><option value="">—</option><option value="1">{t("pr_s_maintenance")}</option></select></F>
        {HOME.includes(f.type) && <F label={t("pr_furnished")}><select className="select" value={f.furnished || ""} onChange={set("furnished")}><option value="">—</option><option value="furnished">{t("pr_f_furnished")}</option><option value="unfurnished">{t("pr_f_unfurnished")}</option></select></F>}
        {HOME.includes(f.type) && <F label={t("pr_rooms")}><input className="input" type="number" min="0" value={f.rooms || ""} onChange={set("rooms")} {...ltr} /></F>}</Grid><Foot t={t} onCancel={close} /></form></Modal>}

      {modal?.kind === "lease" && <Modal wide title={t("pr_newLease")} onClose={close}><form onSubmit={(e) => { if (clash) { e.preventDefault(); return toast(t("pr_clash"), "error"); } if (f.end && f.end < f.start) { e.preventDefault(); return toast(t("pr_badDates"), "error"); } save("leases", { no: f.no || nextNo("lease") })(e); }}><Grid>
        <F label={t("pr_unit") + " *"}><select className="select" required value={f.unitId} onChange={set("unitId")}><option value="">—</option>{biz.units.map((u) => <option key={u.id} value={u.id}>{uLabel(u)}</option>)}</select></F>
        <F label={t("pr_tenant") + " *"}><input className="input" required list="tn" value={f.tenant} onChange={set("tenant")} /><datalist id="tn">{contacts.map((c) => <option key={c.id} value={c.name} />)}</datalist></F>
        <F label={t("phone")}><input className="input" type="tel" value={f.phone} onChange={set("phone")} {...ltr} /></F>
        <F label={t("pr_start")}><input className="input" type="date" required value={f.start} onChange={set("start")} {...ltr} /></F>
        <F label={t("pr_endDate")}><input className="input" type="date" value={f.end} onChange={set("end")} {...ltr} /></F>
        <F label={t("currency")}><CurrencyPicker value={f.currency || cur} onChange={(v) => setF((p) => ({ ...p, currency: v }))} /></F>
        <F label={t("pr_rentMonthly") + " *"}><input className="input" type="number" min="0" step="any" required value={f.rent} onChange={set("rent")} {...ltr} /></F>
        <F label={t("pr_cycle")}><select className="select" value={f.cycle} onChange={set("cycle")}>{Object.keys(CYCLES).map((k) => <option key={k} value={k}>{t("pr_c_" + k)}</option>)}</select></F>
        <F label={t("pr_dueDay")}><input className="input" type="number" min="1" max="28" value={f.dueDay} onChange={set("dueDay")} {...ltr} /></F>
        <F label={t("pr_deposit")}><input className="input" type="number" min="0" step="any" value={f.deposit} onChange={set("deposit")} {...ltr} /></F>
        <F label={t("pr_increase")}><input className="input" type="number" min="0" step="any" value={f.increase} onChange={set("increase")} {...ltr} /></F>
        <F label={t("pr_chargeShared")}><select className="select" value={f.chargeShared ?? "1"} onChange={set("chargeShared")}><option value="1">{t("rs_avail")}</option><option value="0">{t("pr_notCharged")}</option></select></F>
        <F label={t("pr_chargeUtils")}><select className="select" value={f.chargeUtils ?? "1"} onChange={set("chargeUtils")}><option value="1">{t("rs_avail")}</option><option value="0">{t("pr_notCharged")}</option></select></F>
        <F label={t("emp_notes")} wide><input className="input" value={f.notes} onChange={set("notes")} /></F></Grid>
        {clash && <div style={{ color: "#ff8a9b", fontSize: "var(--text-sm)" }}>⚠ {t("pr_clash")}</div>}<Foot t={t} onCancel={close} /></form></Modal>}
      {del && <ConfirmDialog title={t("delete")} message={t("b_confirmDelete")} onConfirm={() => remove(del.coll, del.x.id)} onClose={() => setDel(null)} />}
    </div>
  );
}
