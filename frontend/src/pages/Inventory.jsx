import React, { useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { Modal, EmptyState, ConfirmDialog } from "../components/UI";
import { IconBox, IconPlus, IconEdit, IconTrash } from "../components/Icons";
import { F, Grid, Sec, ltr, useForm } from "../components/Form";
import MediaAttach from "../components/MediaAttach";
import BarcodeScan, { canScan } from "../components/BarcodeScan";
import { api } from "../services/api";
import { delMedia } from "../services/media";
import MoneyInput from "../components/MoneyInput";
import UnitPicker from "../components/UnitPicker";
import { unitLabel, compatible, convert } from "../services/units";
import { useBiz, upsert, remove, uid, fmt, stockLeft, getLow } from "../services/biz";

const BLANK = { name: "", sku: "", unit: "", qtyIn: "", qtyOut: "", minQty: "", cost: "", price: "", supplier: "", location: "", costCur: "", costFx: "", priceCur: "", priceFx: "", priceW: "", priceWCur: "", priceWFx: "", priceD: "", priceDCur: "", priceDFx: "", barcode: "", category: "", brand: "", manufacturer: "", origin: "", perCarton: "", maxQty: "", reorderQty: "", shelfDays: "", storage: "", taxRate: "", description: "", custom: [], media: [], notes: "" };

export default function Inventory() {
  const { t, toast, locale } = useApp();
  const [qu, setQu] = useState({});
  const trash = useRef([]);
  const [contacts, setContacts] = useState([]), [scanBc, setScanBc] = useState(false);
  React.useEffect(() => { api.get("/contacts").then((d) => setContacts(d.items || [])).catch(() => {}); }, []);
  const biz = useBiz();
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null);
  const [del, setDel] = useState(null);
  const [qty, setQty] = useState({});
  const [f, set, setF] = useForm(BLANK);
  const low = getLow(biz);

  const open = (x) => { trash.current = []; setF(x === "new" ? BLANK : { ...BLANK, ...x, custom: [...(x.custom || [])], media: [...(x.media || [])] }); setModal(x); };
  const conv = (amt, c, fx) => { if (!c || c === biz.currency) return amt; const r = Number(fx) || 0; return r ? +((Number(amt) || 0) * r).toFixed(6) : null; };   // stored in the main currency
  const save = (e) => {
    e.preventDefault();
    const cost = conv(f.cost, f.costCur, f.costFx), price = conv(f.price, f.priceCur, f.priceFx), priceW = conv(f.priceW, f.priceWCur, f.priceWFx), priceD = conv(f.priceD, f.priceDCur, f.priceDFx);
    if ([cost, price, priceW, priceD].includes(null)) return toast(t("fx_missing"), "error");
    upsert("inventory", { ...(modal === "new" ? { id: uid() } : modal), ...f, cost, price, priceW, priceD, costCur: "", costFx: "", priceCur: "", priceFx: "", priceWCur: "", priceWFx: "", priceDCur: "", priceDFx: "" });
    trash.current.forEach(delMedia);
    setModal(null);
  };
  const move = (x, dir) => {
    let n = Number(qty[x.id]);
    if (!(n > 0)) return;
    const from = qu[x.id] || x.unit;
    if (x.unit && from !== x.unit) { n = convert(n, from, x.unit); if (n == null) return toast(t("unit_incompat"), "error"); }
    upsert("inventory", { ...x, [dir === "in" ? "qtyIn" : "qtyOut"]: (Number(dir === "in" ? x.qtyIn : x.qtyOut) || 0) + n });
    setQty((p) => ({ ...p, [x.id]: "" }));
  };
  const alertNow = () => {
    if (!low.length) return toast(t("stk_alertNone"), "success");
    toast(`${low.length} ${t("inv_lowBody")}: ${low.slice(0, 3).map((i) => i.name).join("، ")}`, "error");
    if ("Notification" in window && Notification.permission === "granted") new Notification(t("stk_alert"), { body: low.map((i) => i.name).join(", ") });
  };

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return biz.inventory.filter((x) => !s || [x.name, x.sku, x.barcode, x.category, x.brand, x.manufacturer, x.supplier, x.location].some((v) => String(v || "").toLowerCase().includes(s)));
  }, [biz.inventory, q]);
  const value = biz.inventory.reduce((a, i) => a + Math.max(stockLeft(i), 0) * (Number(i.cost) || 0), 0);

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="section-title">
        <h2>{t("inventory")} <span className="badge">{biz.inventory.length} {t("stk_items")}</span></h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-ghost btn-sm" onClick={alertNow}>🔔 {t("stk_alert")}{low.length > 0 && ` (${low.length})`}</button>
          <button className="btn btn-primary btn-sm" onClick={() => open("new")}><IconPlus />{t("stk_new")}</button>
        </div>
      </div>
      <div className="stat-grid">
        <div className="glass stat-card"><div className="stat-label">{t("stk_value")}</div><div className="stat-value">{fmt(value)} {biz.currency}</div></div>
        <div className="glass stat-card"><div className="stat-label">{t("stk_low")}</div><div className="stat-value">{low.length}</div></div>
      </div>
      {low.length > 0 && (
        <div className="glass card" style={{ borderColor: "rgba(255,107,129,.5)" }}>
          <strong>⚠ {low.length} {t("inv_lowBody")}</strong>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{low.map((i) => `${i.name} (${stockLeft(i)})`).join(" · ")}</div>
        </div>
      )}
      <input className="input" placeholder={t("b_search")} value={q} onChange={(e) => setQ(e.target.value)} />
      {list.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : list.map((x) => {
        const left = stockLeft(x), isLow = left <= (Number(x.minQty) || 0);
        return (
          <div key={x.id} className="glass card" style={{ display: "grid", gap: "0.4rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
              <strong>{x.name} <span style={{ color: "var(--text-3)" }} dir="ltr">{x.sku}</span></strong>
              <span className={`badge ${left <= 0 ? "badge-red" : isLow ? "badge-violet" : "badge-green"}`}>{t(left <= 0 ? "stk_zero" : isLow ? "stk_low" : "stk_ok")}</span>
            </div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }} dir="auto">
              {t("stk_in")}: {Number(x.qtyIn) || 0} · {t("stk_out")}: {Number(x.qtyOut) || 0} · <b>{t("stk_left")}: {+left.toFixed(6)} {unitLabel(x.unit, locale)}</b>
              {x.location && ` · ${x.location}`}
            </div>
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
              <input className="input" style={{ width: 90 }} type="number" min="0" step="any" placeholder={t("stk_qty")} value={qty[x.id] || ""} onChange={(e) => setQty((p) => ({ ...p, [x.id]: e.target.value }))} {...ltr} />
              {compatible(x.unit).length > 1 && <select className="select" style={{ width: "auto" }} aria-label={t("stk_unit")} value={qu[x.id] || x.unit} onChange={(e) => setQu((p) => ({ ...p, [x.id]: e.target.value }))}>{compatible(x.unit).map((c) => <option key={c} value={c}>{unitLabel(c, locale)}</option>)}</select>}
              <button className="btn btn-ghost btn-sm" onClick={() => move(x, "in")}>{t("stk_addIn")}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => move(x, "out")}>{t("stk_addOut")}</button>
              <button className="icon-btn" aria-label={t("b_edit")} onClick={() => open(x)}><IconEdit /></button>
              <button className="icon-btn" aria-label={t("delete")} onClick={() => setDel(x)}><IconTrash /></button>
            </div>
          </div>
        );
      })}
      {modal && (
        <Modal wide title={modal === "new" ? t("stk_new") : f.name} onClose={() => setModal(null)}>
          <form onSubmit={save}>
            <Sec>{t("it_sec_basic")}</Sec>
            <Grid>
              <F label={t("stk_name") + " *"} wide><input className="input" required value={f.name} onChange={set("name")} /></F>
              <F label={t("it_barcode")}><div style={{ display: "flex", gap: "0.35rem" }}><input className="input" style={{ flex: 1, minWidth: 0 }} value={f.barcode} onChange={set("barcode")} {...ltr} />{canScan() && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setScanBc(true)}>📷</button>}</div></F>
              <F label={t("stk_sku")}><input className="input" value={f.sku} onChange={set("sku")} {...ltr} /></F>
              <F label={t("rs_cat")}><input className="input" list="icat" value={f.category} onChange={set("category")} /><datalist id="icat">{[...new Set(biz.inventory.map((x) => x.category).filter(Boolean))].map((c) => <option key={c} value={c} />)}</datalist></F>
              <F label={t("cat_brand")}><input className="input" list="ibr" value={f.brand} onChange={set("brand")} /><datalist id="ibr">{[...new Set(biz.inventory.map((x) => x.brand).filter(Boolean))].map((c) => <option key={c} value={c} />)}</datalist></F>
              <F label={t("it_manufacturer")}><input className="input" list="imf" value={f.manufacturer} onChange={set("manufacturer")} /><datalist id="imf">{contacts.map((c) => <option key={c.id} value={c.name} />)}</datalist></F>
              <F label={t("it_origin")}><input className="input" value={f.origin} onChange={set("origin")} /></F>
              <F label={t("stk_unit")}><UnitPicker value={f.unit} onChange={(v) => setF((p) => ({ ...p, unit: v }))} /></F>
              <F label={t("it_perCarton")}><input className="input" type="number" min="0" step="any" value={f.perCarton} onChange={set("perCarton")} {...ltr} /></F>
            </Grid>
            <Sec>{t("it_sec_stock")}</Sec>
            <Grid>
              <F label={t("stk_in")}><input className="input" type="number" min="0" step="any" value={f.qtyIn} onChange={set("qtyIn")} {...ltr} /></F>
              <F label={t("stk_out")}><input className="input" type="number" min="0" step="any" value={f.qtyOut} onChange={set("qtyOut")} {...ltr} /></F>
              <F label={t("stk_min")}><input className="input" type="number" min="0" step="any" value={f.minQty} onChange={set("minQty")} {...ltr} /></F>
              <F label={t("it_maxQty")}><input className="input" type="number" min="0" step="any" value={f.maxQty} onChange={set("maxQty")} {...ltr} /></F>
              <F label={t("it_reorder")}><input className="input" type="number" min="0" step="any" value={f.reorderQty} onChange={set("reorderQty")} {...ltr} /></F>
              <F label={t("it_shelfDays")}><input className="input" type="number" min="0" value={f.shelfDays} onChange={set("shelfDays")} {...ltr} /></F>
              <F label={t("stk_loc")}><input className="input" value={f.location} onChange={set("location")} /></F>
              <F label={t("it_storage")}><input className="input" value={f.storage} onChange={set("storage")} /></F>
            </Grid>
            <Sec>{t("it_sec_price")}</Sec>
            <Grid>
              <F label={t("stk_cost")}><MoneyInput f={f} setF={setF} amount="cost" currency="costCur" fx="costFx" /></F>
              <F label={t("stk_price")}><MoneyInput f={f} setF={setF} amount="price" currency="priceCur" fx="priceFx" /></F>
              <F label={t("ds_priceW")}><MoneyInput f={f} setF={setF} amount="priceW" currency="priceWCur" fx="priceWFx" /></F>
              <F label={t("ds_priceD")}><MoneyInput f={f} setF={setF} amount="priceD" currency="priceDCur" fx="priceDFx" /></F>
              <F label={t("inv_tax")}><input className="input" type="number" min="0" max="100" step="any" value={f.taxRate} onChange={set("taxRate")} {...ltr} /></F>
            </Grid>
            <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{t("it_priceNote")}</p>
            <Sec>{t("it_sec_details")}</Sec>
            <Grid>
              <F label={t("stk_supplier")}><input className="input" list="isup" value={f.supplier} onChange={set("supplier")} /><datalist id="isup">{contacts.map((c) => <option key={c.id} value={c.name} />)}</datalist></F>
              <F label={t("cat_desc")} wide><textarea className="textarea" rows={2} value={f.description} onChange={set("description")} /></F>
            </Grid>
            <Sec>{t("it_sec_custom")}</Sec>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{t("it_customHelp")}</p>
            {(f.custom || []).map((c, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 40px", gap: "0.35rem", margin: "0.3rem 0" }}>
                <input className="input" placeholder={t("it_fieldName")} value={c.label} onChange={(e) => setF((p) => ({ ...p, custom: p.custom.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) }))} />
                <input className="input" placeholder={t("it_fieldValue")} value={c.value} onChange={(e) => setF((p) => ({ ...p, custom: p.custom.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)) }))} />
                <button type="button" className="icon-btn" aria-label={t("delete")} onClick={() => setF((p) => ({ ...p, custom: p.custom.filter((_, k) => k !== i) }))}><IconTrash /></button></div>))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF((p) => ({ ...p, custom: [...(p.custom || []), { label: "", value: "" }] }))}><IconPlus />{t("it_addField")}</button>
            <Sec>{t("it_sec_media")}</Sec>
            <MediaAttach media={f.media || []} onChange={(m) => setF((p) => ({ ...p, media: m }))} trash={trash} />
            <F label={t("emp_notes")}><textarea className="textarea" rows={2} value={f.notes} onChange={set("notes")} /></F>
            <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>{t("cancel")}</button>
              <button className="btn btn-primary btn-sm">{t("save")}</button>
            </div>
            {scanBc && <BarcodeScan onClose={() => setScanBc(false)} onCode={(c) => setF((p) => ({ ...p, barcode: c }))} />}
          </form>
        </Modal>
      )}
      {del && <ConfirmDialog title={t("delete")} message={t("b_confirmDelete")} onConfirm={() => { (del.media || []).forEach((m) => delMedia(m.id)); remove("inventory", del.id); }} onClose={() => setDel(null)} />}
    </div>
  );
}
