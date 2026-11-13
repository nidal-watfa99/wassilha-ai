import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Modal, EmptyState } from "../components/UI";
import { IconBox, IconPlus } from "../components/Icons";
import { F, Grid, useForm } from "../components/Form";
import ContactProfile from "./ContactProfile";
import { useBiz, setProfile, fmt } from "../services/biz";
import { supplierStats } from "../services/expensehub";
import { principalOwed } from "../services/agencies";
import { waPhone } from "../services/phone";

const SUP_TYPES = ["supplier", "wholesaler", "importer", "exporter", "partner"];

/* Main suppliers and distributors: contact data, map location, messages and attachments live in the contact profile. */
export default function LibrarySuppliers() {
  const { t, toast } = useApp();
  const biz = useBiz(), cur = biz.currency;
  const [contacts, setContacts] = useState([]), [all, setAll] = useState(false), [profile, setProfileOf] = useState(null), [adding, setAdding] = useState(false);
  const [f, set] = useForm({ name: "", phone: "", email: "", type: "supplier", city: "", address: "" });
  const load = () => api.get("/contacts").then((d) => setContacts(d.items || [])).catch(() => {});
  React.useEffect(() => { load(); }, []);
  const isSup = (c) => SUP_TYPES.includes(biz.profiles[c.id]?.type) || biz.agencies.some((a) => (a.principal || "").trim().toLowerCase() === c.name.trim().toLowerCase()) || supplierStats(biz, c.name).n > 0 || biz.inventory.some((i) => [i.supplier, i.manufacturer].some((x) => (x || "").trim().toLowerCase() === c.name.trim().toLowerCase()));
  const list = contacts.filter((c) => all || isSup(c));
  const create = async (e) => {
    e.preventDefault();
    try {
      const c = await api.post("/contacts", { name: f.name, phone: f.phone, email: f.email });
      setProfile(c.id, { type: f.type, city: f.city, address: f.address, name: c.name || f.name, phone: f.phone, media: [] });
      await load(); setAdding(false); setProfileOf(c);
    } catch { toast(t("cat_mediaErr"), "error"); }
  };
  return (
    <>
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{t("lb_supHelp")}</p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><IconPlus />{t("lb_newSup")}</button>
        <button className={`btn btn-sm ${all ? "btn-primary" : "btn-ghost"}`} onClick={() => setAll((v) => !v)}>{all ? t("lb_onlySup") : t("lb_allContacts")}</button></div>
      {list.length === 0 ? <EmptyState icon={<IconBox />} text={t("lb_noSup")} /> : list.map((c) => { const pf = biz.profiles[c.id], st = supplierStats(biz, c.name), po = principalOwed(biz, c.name), hasLoc = pf && pf.lat !== "" && pf.lat != null && pf.lng !== "" && pf.lng != null; return (
        <div key={c.id} className="glass card" style={{ display: "grid", gap: "0.45rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}><strong>{c.name}</strong><span className="badge badge-violet">{t("ct_t_" + (pf?.type || "supplier"))}</span></div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{[pf?.city, pf?.address].filter(Boolean).join(" · ") || t("lb_noAddress")}{(pf?.media || []).length > 0 && ` · 📎 ${pf.media.length}`}</div>
          {st.n > 0 && <div className="mini3">{[[t("inv_total"), st.total], [t("inv_paidAmt"), st.paid], [t("inv_left"), st.left]].map(([l, v], k) => <div key={k}><small>{l}</small><b dir="ltr" style={k === 2 && v > 0 ? { color: "var(--cyan)" } : undefined}>{fmt(v)}</b></div>)}</div>}
          {po.left > 0 && <div style={{ fontSize: "var(--text-sm)" }}>{t("ag_payable")}: <b dir="ltr" style={{ color: "var(--cyan)" }}>{fmt(po.left)} {cur}</b></div>}
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            {c.phone && <a className="btn btn-ghost btn-sm" href={`tel:${c.phone}`}>📞</a>}
            {c.phone && <a className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer" href={`https://wa.me/${waPhone(c.phone)}`}>WhatsApp</a>}
            {c.email && <a className="btn btn-ghost btn-sm" href={`mailto:${c.email}`}>✉</a>}
            {hasLoc ? <a className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${pf.lat}&mlon=${pf.lng}#map=16/${pf.lat}/${pf.lng}`}>📍 {t("pr_showMap")}</a> : <button className="btn btn-ghost btn-sm" onClick={() => setProfileOf(c)}>📍 {t("lb_setLoc")}</button>}
            <Link className="btn btn-ghost btn-sm" to="/map">🗺</Link>
            <button className="btn btn-primary btn-sm" onClick={() => setProfileOf(c)}>{t("ct_profile")}</button></div>
        </div>); })}
      {profile && <ContactProfile contact={profile} onClose={() => setProfileOf(null)} />}
      {adding && <Modal title={t("lb_newSup")} onClose={() => setAdding(false)}><form onSubmit={create}><Grid>
        <F label={t("map_name") + " *"}><input className="input" required value={f.name} onChange={set("name")} /></F>
        <F label={t("ct_type")}><select className="select" value={f.type} onChange={set("type")}>{SUP_TYPES.map((k) => <option key={k} value={k}>{t("ct_t_" + k)}</option>)}</select></F>
        <F label={t("phone")}><input className="input" type="tel" dir="ltr" value={f.phone} onChange={set("phone")} /></F>
        <F label={t("emp_email")}><input className="input" type="email" dir="ltr" value={f.email} onChange={set("email")} /></F>
        <F label={t("ct_city")}><input className="input" value={f.city} onChange={set("city")} /></F>
        <F label={t("b_address")}><input className="input" value={f.address} onChange={set("address")} /></F></Grid>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{t("lb_supNext")}</p>
        <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end" }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>{t("cancel")}</button><button className="btn btn-primary btn-sm">{t("save")}</button></div></form></Modal>}
    </>
  );
}
