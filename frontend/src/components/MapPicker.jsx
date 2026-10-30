import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useApp } from "../context/AppContext";
import { Modal } from "./UI";

const LAYERS = {
  street: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png", "© OpenStreetMap contributors", 19],
  sat: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", "Tiles © Esri", 18],
};
const pin = L.divIcon({ className: "", iconSize: [26, 26], iconAnchor: [13, 26],
  html: '<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:#f97316;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.55)"></div>' });

/* Pick a location: drag the pin, tap the map, search an address, or use the device position. */
export default function MapPicker({ lat, lng, onPick, onClose }) {
  const { t, toast } = useApp();
  const el = useRef(null), map = useRef(null), marker = useRef(null), tile = useRef(null);
  const has = Number.isFinite(+lat) && lat !== "" && Number.isFinite(+lng) && lng !== "";
  const [pos, setPos] = useState(has ? { lat: +lat, lng: +lng } : { lat: 33.5138, lng: 36.2765 });
  const [layer, setLayer] = useState("street"), [q, setQ] = useState("");
  const r6 = (n) => +n.toFixed(6);

  useEffect(() => {
    const m = L.map(el.current).setView([pos.lat, pos.lng], has ? 16 : 6);
    const mk = L.marker([pos.lat, pos.lng], { draggable: true, icon: pin }).addTo(m);
    mk.on("dragend", () => { const p = mk.getLatLng(); setPos({ lat: r6(p.lat), lng: r6(p.lng) }); });
    m.on("click", (e) => { mk.setLatLng(e.latlng); setPos({ lat: r6(e.latlng.lat), lng: r6(e.latlng.lng) }); });
    map.current = m; marker.current = mk;
    setTimeout(() => m.invalidateSize(), 250);
    return () => { m.remove(); };
  }, []); // eslint-disable-line
  useEffect(() => {
    tile.current?.remove();
    const [u, a, z] = LAYERS[layer];
    tile.current = L.tileLayer(u, { attribution: a, maxZoom: z }).addTo(map.current);
  }, [layer]);

  const go = (la, lo, z = 17) => { marker.current.setLatLng([la, lo]); map.current.flyTo([la, lo], z); setPos({ lat: r6(la), lng: r6(lo) }); };
  const search = async (e) => {
    e.preventDefault(); if (!q.trim()) return;
    try {
      const j = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`)).json();
      j.length ? go(+j[0].lat, +j[0].lon, 16) : toast(t("map_notFound"), "error");
    } catch { toast(t("err_network"), "error"); }
  };
  const locate = () => navigator.geolocation
    ? navigator.geolocation.getCurrentPosition((p) => go(p.coords.latitude, p.coords.longitude), () => toast(t("map_locDenied"), "error"), { enableHighAccuracy: true, timeout: 15000 })
    : toast(t("map_locDenied"), "error");

  return (
    <Modal wide title={t("pr_pickMap")} onClose={onClose}>
      <form onSubmit={search} style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <input className="input" style={{ flex: "1 1 180px" }} placeholder={t("map_search")} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-ghost btn-sm">{t("map_go")}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={locate}>📍 {t("map_me")}</button>
        <select className="select" style={{ width: "auto" }} value={layer} onChange={(e) => setLayer(e.target.value)}><option value="street">{t("map_street")}</option><option value="sat">{t("map_sat")}</option></select>
      </form>
      <div ref={el} className="map-box" style={{ height: "46dvh" }} />
      <p style={{ margin: "0.5rem 0", fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{t("map_drag")} · <bdi dir="ltr">{pos.lat}, {pos.lng}</bdi></p>
      <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>{t("cancel")}</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => { onPick(pos.lat, pos.lng); onClose(); }}>{t("pr_useLoc")}</button>
      </div>
    </Modal>
  );
}
