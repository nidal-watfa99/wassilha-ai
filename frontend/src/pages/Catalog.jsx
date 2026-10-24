import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Modal, EmptyState, ConfirmDialog } from "../components/UI";
import { IconBox, IconPlus, IconEdit, IconTrash } from "../components/Icons";
import { F, Grid, Sec, ltr, useForm } from "../components/Form";
import { useBiz, upsert, remove, uid, fmt, nextNo, todayStr, stockLeft } from "../services/biz";
import { putMedia, getMedia, delMedia, compressImage } from "../services/media";

const BLANK = {
  name: "", sku: "", category: "", brand: "", unit: "", status: "available", featured: false, description: "", variants: "", tags: "", warranty: "",
  price: "", wholesale: "", cost: "", minOrder: "", offerLabel: "", offerPct: "", offerPrice: "", offerFrom: "", offerTo: "",
  invId: "", supplier: "", links: "", media: [], customers: [],
};
const ST = ["available", "unavailable", "coming", "hidden"];

export const priceNow = (p) => {
  const t0 = todayStr(), on = (Number(p.offerPct) > 0 || Number(p.offerPrice) > 0) && (!p.offerFrom || p.offerFrom <= t0) && (!p.offerTo || p.offerTo >= t0);
  const base = Number(p.price) || 0;
  return { base, offer: on, now: !on ? base : Number(p.offerPrice) > 0 ? Number(p.offerPrice) : base * (1 - Number(p.offerPct) / 100) };
};
const waPhone = (ph) => { let d = String(ph || "").replace(/\D/g, ""); if (d.startsWith("00")) d = d.slice(2); else if (d.startsWith("0")) d = "963" + d.slice(1); return d; };

function Media({ id, type, style }) {
  const [u, setU] = useState(null);
  useEffect(() => {
    let url, off = false;
    getMedia(id).then((b) => { if (b && !off) { url = URL.createObjectURL(b); setU(url); } }).catch(() => {});
    return () => { off = true; if (url) URL.revokeObjectURL(url); };
  }, [id]);
  if (!u) return <div style={{ ...style, background: "rgba(255,255,255,.05)" }} />;
  return type === "video" ? <video src={u} controls playsInline preload="metadata" style={style} /> : <img src={u} alt="" style={style} />;
}

export default function Catalog() {
  const { t, toast } = useApp();
  const biz = useBiz();
  const nav = useNavigate();
  const [q, setQ] = useState(""), [cat, setCat] = useState(""), [tab, setTab] = useState("all");
  const [modal, setModal] = useState(null), [del, setDel] = useState(null), [contacts, setContacts] = useState([]), [pick, setPick] = useState("");
  const [f, set, setF] = useForm(BLANK);
  const trash = useRef([]), fileRef = useRef(null);
  useEffect(() => { api.get("/contacts").then((d) => setContacts(d.items || [])).catch(() => {}); }, []);

  const open = (p) => { trash.current = []; setF(p === "new" ? BLANK : { ...BLANK, ...p }); setModal(p); };
  const save = (e) => {
    e.preventDefault();
    trash.current.forEach(delMedia);
    upsert("catalog", { ...(modal === "new" ? { id: uid(), createdAt: new Date().toISOString() } : modal), ...f });
    setModal(null);
  };
  const addFiles = async (e) => {
    const files = [...(e.target.files || [])]; e.target.value = "";
    for (const file of files) {
      try {
        const isV = file.type.startsWith("video/");
        if (!isV && !file.type.startsWith("image/")) continue;
        if (isV && file.size > 60 * 1024 * 1024) { toast(t("cat_big"), "error"); continue; }
        const id = uid();
        await putMedia(id, isV ? file : await compressImage(file));
        setF((p) => ({ ...p, media: [...p.media, { id, type: isV ? "video" : "image", name: file.name }] }));
      } catch { toast(t("cat_mediaErr"), "error"); }
    }
  };
  const dropMedia = (m) => { trash.current.push(m.id); setF((p) => ({ ...p, media: p.media.filter((x) => x.id !== m.id) })); };
  const importOld = async () => {
    try {
      const d = await api.get("/products"); let n = 0;
      (d.items || []).forEach((o) => { if (!biz.catalog.some((c) => c.oldId === o.id)) { n++; upsert("catalog", { ...BLANK, id: uid(), oldId: o.id, name: o.name, price: o.price, description: o.notes || "" }); } });
      toast(`${n} ✓`, "success");
    } catch { toast(t("cat_mediaErr"), "error"); }
  };

  const msg = (p, c) => { const pr = priceNow(p); return `${t("cat_hello")} ${c?.name || ""}\n${p.name}${p.description ? "\n" + p.description : ""}\n${fmt(pr.now)} ${biz.currency}${pr.offer ? ` (${p.offerLabel || t("cat_offer")}${Number(p.offerPct) > 0 ? " -" + p.offerPct + "%" : ""})` : ""}\n${biz.name || ""}`; };
  const invoiceFor = (p, c) => {
    upsert("invoices", { id: uid(), no: nextNo("invoice"), type: "invoice", customer: c.name, issueDate: todayStr(), dueDate: "", currency: biz.currency, discount: 0, tax: biz.taxRate, notes: "", paidAmount: "", status: "draft", items: [{ desc: p.name, qty: 1, price: priceNow(p).now }] });
    nav("/invoices");
  };

  const cats = [...new Set(biz.catalog.map((p) => p.category).filter(Boolean))];
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return biz.catalog.filter((p) => (!cat || p.category === cat) && (tab === "all" || (tab === "offers" ? priceNow(p).offer : p.status !== "available")) &&
      (!s || [p.name, p.sku, p.brand, p.category, p.tags].some((v) => String(v || "").toLowerCase().includes(s))));
  }, [biz.catalog, q, cat, tab]);
  const inv = (p) => biz.inventory.find((i) => i.id === p.invId);
  const pr = priceNow(f), invItem = inv(f);

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="section-title">
        <h2>{t("catalog")} <span className="badge">{biz.catalog.length}</span></h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-ghost btn-sm" onClick={importOld}>{t("cat_import")}</button>
          <button className="btn btn-primary btn-sm" onClick={() => open("new")}><IconPlus />{t("cat_new")}</button>
        </div>
      </div>
      <input className="input" placeholder={t("b_search")} value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {[["all", "inv_all"], ["offers", "cat_offers"], ["off", "cat_unavail"]].map(([k, l]) => <button key={k} className={`btn btn-sm ${tab === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(k)}>{t(l)}</button>)}
        {cats.length > 0 && <select className="select" style={{ width: "auto" }} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">{t("cat_allCats")}</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>}
      </div>
      {list.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(165px, 1fr))", gap: "0.7rem" }}>
          {list.map((p) => {
            const x = priceNow(p), it = inv(p), left = it ? stockLeft(it) : null, img = p.media.find((m) => m.type === "image");
            return (
              <div key={p.id} className="glass card" style={{ padding: "0.6rem", display: "grid", gap: "0.35rem", cursor: "pointer" }} onClick={() => open(p)}>
                {img ? <Media id={img.id} type="image" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10 }} />
                     : <div style={{ aspectRatio: "1", display: "grid", placeItems: "center", background: "rgba(255,255,255,.04)", borderRadius: 10 }}><IconBox /></div>}
                <strong style={{ fontSize: "var(--text-sm)" }}>{p.featured && "⭐ "}{p.name}</strong>
                <div dir="ltr" style={{ textAlign: "start" }}>
                  {x.offer && <s style={{ color: "var(--text-3)", marginInlineEnd: 6 }}>{fmt(x.base)}</s>}<b>{fmt(x.now)} {biz.currency}</b>
                </div>
                <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                  {x.offer && <span className="badge badge-red">{p.offerLabel || t("cat_offer")}</span>}
                  {p.status !== "available" && <span className="badge badge-violet">{t("cat_st_" + p.status)}</span>}
                  {left !== null && <span className={`badge ${left <= 0 ? "badge-red" : "badge-green"}`}>{left} {it.unit}</span>}
                  {p.customers.length > 0 && <span className="badge badge-blue">👥 {p.customers.length}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal wide title={modal === "new" ? t("cat_new") : f.name} onClose={() => setModal(null)}>
          <form onSubmit={save}>
            <Sec>{t("cat_sec_basic")}</Sec>
            <Grid>
              <F label={t("stk_name") + " *"} wide><input className="input" required value={f.name} onChange={set("name")} /></F>
              <F label={t("stk_sku")}><input className="input" value={f.sku} onChange={set("sku")} {...ltr} /></F>
              <F label={t("cat_category")}><input className="input" list="cats" value={f.category} onChange={set("category")} /><datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></F>
              <F label={t("cat_brand")}><input className="input" value={f.brand} onChange={set("brand")} /></F>
              <F label={t("stk_unit")}><input className="input" value={f.unit} onChange={set("unit")} /></F>
              <F label={t("emp_status")}><select className="select" value={f.status} onChange={set("status")}>{ST.map((k) => <option key={k} value={k}>{t("cat_st_" + k)}</option>)}</select></F>
              <F label={t("cat_featured")}><select className="select" value={f.featured ? "1" : ""} onChange={(e) => setF((p) => ({ ...p, featured: !!e.target.value }))}><option value="">—</option><option value="1">⭐</option></select></F>
              <F label={t("cat_desc")} wide><textarea className="textarea" rows={3} value={f.description} onChange={set("description")} /></F>
              <F label={t("cat_variants")}><input className="input" value={f.variants} onChange={set("variants")} /></F>
              <F label={t("cat_tags")}><input className="input" value={f.tags} onChange={set("tags")} /></F>
              <F label={t("cat_warranty")}><input className="input" value={f.warranty} onChange={set("warranty")} /></F>
              <F label={t("stk_supplier")}><input className="input" value={f.supplier} onChange={set("supplier")} /></F>
            </Grid>
            <Sec>{t("cat_sec_price")}</Sec>
            <Grid>
              {[["price", "stk_price"], ["wholesale", "cat_wholesale"], ["cost", "stk_cost"], ["minOrder", "cat_minOrder"]].map(([k, l]) => <F key={k} label={t(l)}><input className="input" type="number" min="0" step="any" value={f[k]} onChange={set(k)} {...ltr} /></F>)}
            </Grid>
            <Sec>{t("cat_sec_offer")}</Sec>
            <Grid>
              <F label={t("cat_offerLabel")}><input className="input" value={f.offerLabel} onChange={set("offerLabel")} /></F>
              <F label={t("inv_discount")}><input className="input" type="number" min="0" max="100" step="any" value={f.offerPct} onChange={set("offerPct")} {...ltr} /></F>
              <F label={t("cat_offerPrice")}><input className="input" type="number" min="0" step="any" value={f.offerPrice} onChange={set("offerPrice")} {...ltr} /></F>
              <F label={t("cat_from")}><input className="input" type="date" value={f.offerFrom} onChange={set("offerFrom")} {...ltr} /></F>
              <F label={t("cat_to")}><input className="input" type="date" value={f.offerTo} onChange={set("offerTo")} {...ltr} /></F>
            </Grid>
            <div className="glass card" dir="ltr" style={{ fontSize: "var(--text-sm)" }}>
              {t("cat_priceNow")}: <b>{fmt(pr.now)} {biz.currency}</b>{pr.offer ? " ✓ " + t("cat_offer") : ""}
              {Number(f.cost) > 0 && ` · ${t("cat_margin")}: ${fmt(pr.now - Number(f.cost))} (${fmt(((pr.now - Number(f.cost)) / (pr.now || 1)) * 100)}%)`}
            </div>
            <Sec>{t("inventory")}</Sec>
            <F label={t("cat_linkStock")}><select className="select" value={f.invId} onChange={set("invId")}><option value="">—</option>{biz.inventory.map((i) => <option key={i.id} value={i.id}>{i.name} ({stockLeft(i)})</option>)}</select></F>
            {invItem && <div style={{ fontSize: "var(--text-sm)" }}>{t("stk_left")}: <b>{stockLeft(invItem)} {invItem.unit}</b></div>}
            <Sec>{t("cat_sec_media")}</Sec>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "0.5rem" }}>
              {f.media.map((m) => (
                <div key={m.id} style={{ position: "relative" }}>
                  <Media id={m.id} type={m.type} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10 }} />
                  <button type="button" className="icon-btn" style={{ position: "absolute", top: 2, insetInlineEnd: 2, background: "rgba(0,0,0,.6)" }} aria-label={t("delete")} onClick={() => dropMedia(m)}><IconTrash /></button>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" style={{ margin: "0.5rem 0" }} onClick={() => fileRef.current.click()}><IconPlus />{t("cat_addMedia")}</button>
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={addFiles} />
            <F label={t("cat_links")}><textarea className="textarea" rows={2} value={f.links} onChange={set("links")} {...ltr} /></F>
            <Sec>{t("cat_sec_cust")}</Sec>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <select className="select" value={pick} onChange={(e) => setPick(e.target.value)}><option value="">{t("inv_customer")}…</option>{contacts.filter((c) => !f.customers.some((x) => x.id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name} {c.phone}</option>)}</select>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const c = contacts.find((x) => x.id === pick); if (c) { setF((p) => ({ ...p, customers: [...p.customers, { id: c.id, name: c.name, phone: c.phone }] })); setPick(""); } }}><IconPlus /></button>
            </div>
            {f.customers.map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: "0.4rem", flexWrap: "wrap", alignItems: "center", padding: "0.4rem 0", borderTop: "1px solid var(--border)" }}>
                <span>{c.name} <span dir="ltr" style={{ color: "var(--text-3)" }}>{c.phone}</span></span>
                <span style={{ display: "flex", gap: "0.3rem" }}>
                  {c.phone && <a className="btn btn-ghost btn-sm" href={`tel:${c.phone}`}>📞</a>}
                  {c.phone && <a className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer" href={`https://wa.me/${waPhone(c.phone)}?text=${encodeURIComponent(msg(f, c))}`}>WhatsApp</a>}
                  {modal !== "new" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { save({ preventDefault() {} }); invoiceFor(f, c); }}>{t("inv_invoice")}</button>}
                  <button type="button" className="icon-btn" aria-label={t("delete")} onClick={() => setF((p) => ({ ...p, customers: p.customers.filter((x) => x.id !== c.id) }))}><IconTrash /></button>
                </span>
              </div>
            ))}
            <div style={{ display: "flex", gap: "0.7rem", justifyContent: "space-between", marginTop: "0.8rem", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(msg(f)).then(() => toast(t("cat_copied"), "success"))}>{t("cat_copy")}</button>
              <span style={{ display: "flex", gap: "0.5rem" }}>
                {modal !== "new" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDel(modal); setModal(null); }}><IconTrash /></button>}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>{t("cancel")}</button>
                <button className="btn btn-primary btn-sm">{t("save")}</button>
              </span>
            </div>
          </form>
        </Modal>
      )}
      {del && <ConfirmDialog title={t("delete")} message={t("b_confirmDelete")} onConfirm={() => { del.media.forEach((m) => delMedia(m.id)); remove("catalog", del.id); }} onClose={() => setDel(null)} />}
    </div>
  );
}
