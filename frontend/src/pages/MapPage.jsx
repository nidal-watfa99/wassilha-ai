import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { ConfirmDialog } from "../components/UI";
import { IconPlus, IconEdit, IconTrash, IconMap } from "../components/Icons";
import { F, Grid, ltr } from "../components/Form";
import { useBiz, upsert, remove, uid } from "../services/biz";

const COLORS = { customer: "#368bff", store: "#4ade80", branch: "#c4a8ff", site: "#fbbf24", other: "#94a3b8" };
const pin = (c, drag) => L.divIcon({
  className: "",
  html: `<div style="width:24px;height:24px;border-radius:50% 50% 50% 0;background:${c};transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.55);${drag ? "outline:3px solid rgba(255,255,255,.35)" : ""}"></div>`,
  iconSize: [24, 24], iconAnchor: [12, 24], popupAnchor: [0, -24],
});
const LAYERS = {
  street: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "© OpenStreetMap contributors", max: 19 },
  sat: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Tiles © Esri — Maxar, Earthstar Geographics", max: 18 },
};
const KINDS = ["customer", "store", "branch", "site", "other"];

export default function MapPage() {
  const { t, toast } = useApp();
  const biz = useBiz();
  const el = useRef(null), map = useRef(null), tile = useRef(null), group = useRef(null), dm = useRef(null);
  const [layer, setLayer] = useState("street");
  const [draft, setDraft] = useState(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [del, setDel] = useState(null);
  const [contacts, setContacts] = useState([]);
  useEffect(() => { api.get("/contacts").then((d) => setContacts(d.items || [])).catch(() => {}); }, []);

  // init map once
  useEffect(() => {
    const m = L.map(el.current, { zoomControl: true }).setView([33.5138, 36.2765], 6);
    group.current = L.layerGroup().addTo(m);
    m.on("click", (e) => setDraft((d) => (d ? { ...d, lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) } : d)));
    map.current = m;
    setTimeout(() => m.invalidateSize(), 200);
    return () => { m.remove(); map.current = null; };
  }, []);

  // base layer
  useEffect(() => {
    if (tile.current) tile.current.remove();
    const L0 = LAYERS[layer];
    tile.current = L.tileLayer(L0.url, { attribution: L0.attr, maxZoom: L0.max }).addTo(map.current);
  }, [layer]);

  // saved markers
  const shown = biz.places.filter((p) => (filter === "all" || p.kind === filter));
  useEffect(() => {
    const g = group.current; g.clearLayers();
    shown.filter((p) => p.id !== draft?.id).forEach((p) => {
      const mk = L.marker([p.lat, p.lng], { icon: pin(COLORS[p.kind] || COLORS.other) }).addTo(g);
      const d = document.createElement("div");
      d.innerHTML = `<b></b><div></div><div></div>`;
      d.children[0].textContent = p.name; d.children[1].textContent = t("map_" + p.kind); d.children[2].textContent = p.phone || "";
      mk.bindPopup(d);
    });
  }, [biz.places, filter, draft?.id, t]); // eslint-disable-line

  // fit to markers on first load
  useEffect(() => {
    if (biz.places.length) map.current.fitBounds(L.latLngBounds(biz.places.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 15 });
  }, []); // eslint-disable-line

  // draggable draft marker
  const hasDraft = !!draft;
  useEffect(() => {
    if (!hasDraft) { dm.current?.remove(); dm.current = null; return; }
    const m = L.marker([draft.lat, draft.lng], { draggable: true, icon: pin(COLORS[draft.kind] || COLORS.other, true), zIndexOffset: 1000 }).addTo(map.current);
    m.on("dragend", () => { const p = m.getLatLng(); setDraft((d) => d && { ...d, lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }); });
    dm.current = m;
    return () => { m.remove(); dm.current = null; };
  }, [hasDraft]); // eslint-disable-line
  useEffect(() => {
    if (dm.current && draft) { dm.current.setLatLng([draft.lat, draft.lng]); dm.current.setIcon(pin(COLORS[draft.kind] || COLORS.other, true)); }
  }, [draft?.lat, draft?.lng, draft?.kind]); // eslint-disable-line

  const startAdd = () => {
    const c = map.current.getCenter();
    setDraft({ id: uid(), isNew: true, kind: "customer", name: "", phone: "", address: "", notes: "", lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6) });
  };
  const fly = (lat, lng, z = 16) => map.current.flyTo([lat, lng], z);
  const locate = () => {
    if (!navigator.geolocation) return toast(t("map_locDenied"), "error");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = +pos.coords.latitude.toFixed(6), lng = +pos.coords.longitude.toFixed(6);
        fly(lat, lng);
        setDraft((d) => (d ? { ...d, lat, lng } : d));
      },
      () => toast(t("map_locDenied"), "error"), { enableHighAccuracy: true, timeout: 15000 });
  };
  const search = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`);
      const j = await r.json();
      if (!j.length) return toast(t("map_notFound"), "error");
      const lat = +(+j[0].lat).toFixed(6), lng = +(+j[0].lon).toFixed(6);
      fly(lat, lng, 15);
      setDraft((d) => (d ? { ...d, lat, lng } : d));
    } catch { toast(t("err_network"), "error"); }
  };
  const save = (e) => {
    e.preventDefault();
    const { isNew, ...p } = draft;
    upsert("places", p);
    setDraft(null);
  };
  const upd = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const num = (k) => (e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) setDraft((d) => ({ ...d, [k]: v })); };

  return (
    <div style={{ display: "grid", gap: "0.9rem" }}>
      <div className="section-title">
        <h2>{t("map_title")}</h2>
        <button className="btn btn-primary btn-sm" onClick={startAdd} disabled={!!draft}><IconPlus />{t("map_add")}</button>
      </div>
      <form onSubmit={search} style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        <input className="input" style={{ flex: "1 1 200px" }} placeholder={t("map_search")} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-ghost btn-sm">{t("map_go")}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={locate}>📍 {t("map_me")}</button>
        <select className="select" style={{ width: "auto" }} value={layer} onChange={(e) => setLayer(e.target.value)} aria-label="layer">
          <option value="street">{t("map_street")}</option><option value="sat">{t("map_sat")}</option>
        </select>
      </form>
      <div ref={el} className="map-box" />

      {draft && (
        <form className="glass card" onSubmit={save}>
          <p style={{ margin: "0 0 0.6rem", color: "var(--cyan)", fontSize: "var(--text-sm)" }}>{t("map_drag")}</p>
          <Grid>
            <F label={t("map_name") + " *"}>
              <input className="input" required list="plc" value={draft.name} onChange={upd("name")} />
              <datalist id="plc">{contacts.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            </F>
            <F label={t("map_kind")}><select className="select" value={draft.kind} onChange={upd("kind")}>
              {KINDS.map((k) => <option key={k} value={k}>{t("map_" + k)}</option>)}</select></F>
            <F label={t("phone")}><input className="input" type="tel" value={draft.phone} onChange={upd("phone")} {...ltr} /></F>
            <F label={t("b_address")}><input className="input" value={draft.address} onChange={upd("address")} /></F>
            <F label={t("map_lat")}><input className="input" type="number" step="any" value={draft.lat} onChange={num("lat")} {...ltr} /></F>
            <F label={t("map_lng")}><input className="input" type="number" step="any" value={draft.lng} onChange={num("lng")} {...ltr} /></F>
          </Grid>
          <F label={t("notes")}><textarea className="textarea" rows={2} value={draft.notes} onChange={upd("notes")} /></F>
          <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}>{t("cancel")}</button>
            <button className="btn btn-primary btn-sm">{t("map_save")}</button>
          </div>
        </form>
      )}

      <div className="section-title">
        <h3 style={{ margin: 0 }}>{t("map_list")} ({shown.length})</h3>
        <select className="select" style={{ width: "auto" }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">{t("map_filter")}</option>{KINDS.map((k) => <option key={k} value={k}>{t("map_" + k)}</option>)}
        </select>
      </div>
      {shown.length === 0 && <div className="empty-state"><IconMap /><p style={{ margin: 0 }}>{t("b_none")}</p></div>}
      {shown.map((p) => (
        <div key={p.id} className="glass card" style={{ display: "flex", justifyContent: "space-between", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-ghost btn-sm" style={{ textAlign: "start" }} onClick={() => fly(p.lat, p.lng)}>
            <span style={{ color: COLORS[p.kind] }}>●</span> <strong>{p.name}</strong> <span style={{ color: "var(--text-3)" }}>{t("map_" + p.kind)}</span>
          </button>
          <span style={{ display: "flex", gap: "0.3rem" }}>
            <a className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`}>{t("map_navigate")}</a>
            <button className="icon-btn" aria-label={t("b_edit")} onClick={() => { setDraft({ ...p }); fly(p.lat, p.lng); }}><IconEdit /></button>
            <button className="icon-btn" aria-label={t("delete")} onClick={() => setDel(p)}><IconTrash /></button>
          </span>
        </div>
      ))}
      {del && <ConfirmDialog title={t("delete")} message={t("b_confirmDelete")} onConfirm={() => remove("places", del.id)} onClose={() => setDel(null)} />}
    </div>
  );
}
