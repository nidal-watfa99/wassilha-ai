import React, { useState } from "react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Modal, EmptyState, ConfirmDialog } from "../components/UI";
import { IconBox, IconPlus, IconEdit, IconTrash } from "../components/Icons";
import { F, Grid, Sec, ltr, useForm } from "../components/Form";
import MoneyInput from "../components/MoneyInput";
import UnitPicker from "../components/UnitPicker";
import ItemPicker from "../components/ItemPicker";
import { useBiz, upsert, remove, uid, fmt, nextSeq } from "../services/biz";
import { compatible, unitLabel } from "../services/units";
import { ean13, ean13Check, ean13Svg, generateVariants, reorderPlan } from "../services/pos";
import { waPhone } from "../services/phone";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const conv = (biz, amt, c, fx) => { if (!c || c === biz.currency) return Number(amt) || 0; const r = Number(fx) || biz.rates[c] || 0; return r ? +((Number(amt) || 0) * r).toFixed(6) : null; };   // stored in the main currency

export function printLabels(items, biz, t) {
  const w = window.open("", "_blank"); if (!w) return false;
  const cells = items.map((i) => { const ok = /^\d{13}$/.test(i.barcode || "") && ean13Check(i.barcode.slice(0, 12)) === +i.barcode[12];
    return `<div class="l"><div class="n">${esc(i.name)}</div>${ok ? ean13Svg(i.barcode, 150, 44) : `<div class="c">${esc(i.barcode || i.sku || "")}</div>`}<div class="p">${Number(i.price) > 0 ? esc(Number(i.price).toLocaleString("en-US", { minimumFractionDigits: 2 })) + " " + esc(biz.currency) : ""}</div></div>`; }).join("");
  w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${esc(t("lb_labels"))}</title><style>body{margin:8px;font-family:Arial,Tahoma,sans-serif}.g{display:flex;flex-wrap:wrap;gap:6px}.l{width:170px;border:1px dashed #999;padding:5px;text-align:center;break-inside:avoid}.n{font-size:12px;font-weight:700;height:30px;overflow:hidden}.c{font-family:monospace;margin:14px 0}.p{font-size:13px;font-weight:700}svg{max-width:100%}</style></head><body><div class="g">${cells}</div><script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
  w.document.close(); return true;
}

export function Services() {
  const { t, locale, toast } = useApp();
  const biz = useBiz(), cur = biz.currency;
  const [modal, setModal] = useState(null), [del, setDel] = useState(null), [f, set, setF] = useForm({});
  const blank = { name: "", category: "", mode: "fixed", price: "", priceCur: cur, priceFx: "", cost: "", costCur: cur, costFx: "", commission: "", unitLabel: "", uses: [], notes: "" };
  const open = (x) => { setF(x ? { ...blank, ...x, priceCur: cur, costCur: cur, uses: (x.uses || []).map((u) => ({ ...u })) } : blank); setModal(x || "new"); };
  const save = (e) => {
    e.preventDefault();
    const price = conv(biz, f.price, f.priceCur, f.priceFx), cost = conv(biz, f.cost, f.costCur, f.costFx);
    if (price == null || cost == null) return toast(t("fx_missing"), "error");
    upsert("services", { id: modal === "new" ? uid() : modal.id, ...f, price, cost, priceCur: "", priceFx: "", costCur: "", costFx: "", uses: f.uses.filter((u) => u.invId && Number(u.qty) > 0) }); setModal(null);
  };
  const starter = () => {
    const base = [["lb_s_copyBw", "copy", "fixed", "lb_u_page"], ["lb_s_copyColor", "copy", "fixed", "lb_u_page"], ["lb_s_print", "print", "fixed", "lb_u_page"], ["lb_s_scan", "scan", "fixed", "lb_u_page"], ["lb_s_bind", "bind", "fixed", "lb_u_piece"], ["lb_s_laminate", "bind", "fixed", "lb_u_piece"], ["lb_s_topup", "telecom", "amount", ""], ["lb_s_bill", "telecom", "amount", ""]];
    base.forEach(([n, c, m, u]) => { if (!biz.services.some((s) => s.name === t(n))) upsert("services", { id: uid(), name: t(n), category: t("lb_c_" + c), mode: m, price: 0, cost: 0, commission: "", unitLabel: u ? t(u) : "", uses: [], notes: "" }); });
    toast(t("lb_starterDone"), "success");
  };
  return (
    <>
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{t("lb_svcHelp")}</p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}><button className="btn btn-primary btn-sm" onClick={() => open(null)}><IconPlus />{t("lb_newSvc")}</button><button className="btn btn-ghost btn-sm" onClick={starter}>{t("lb_starter")}</button></div>
      {biz.services.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : biz.services.map((s) => (
        <div key={s.id} className="glass card" style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <div><strong>{s.name}</strong> {s.category && <span className="badge badge-blue">{s.category}</span>}
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-3)" }}>{s.mode === "amount" ? `${t("lb_variable")} · ${t("lb_commission")} ${Number(s.commission) || 0}%` : <><bdi dir="ltr">{fmt(s.price)} {cur}</bdi>{s.unitLabel && ` / ${s.unitLabel}`}</>}{(s.uses || []).length > 0 && ` · ${t("lb_uses")}: ${s.uses.map((u) => biz.inventory.find((i) => i.id === u.invId)?.name).filter(Boolean).join("، ")}`}</div></div>
          <span><button className="icon-btn" aria-label={t("b_edit")} onClick={() => open(s)}><IconEdit /></button><button className="icon-btn" aria-label={t("delete")} onClick={() => setDel(s)}><IconTrash /></button></span></div>))}
      {modal && <Modal wide title={t("lb_newSvc")} onClose={() => setModal(null)}><form onSubmit={save}>
        <Grid>
          <F label={t("map_name") + " *"}><input className="input" required value={f.name} onChange={set("name")} /></F>
          <F label={t("rs_cat")}><input className="input" list="svc" value={f.category} onChange={set("category")} /><datalist id="svc">{[...new Set(biz.services.map((s) => s.category).filter(Boolean))].map((c) => <option key={c} value={c} />)}</datalist></F>
          <F label={t("lb_mode")}><select className="select" value={f.mode} onChange={set("mode")}><option value="fixed">{t("lb_fixed")}</option><option value="amount">{t("lb_variable")}</option></select></F>
          <F label={t("lb_unitLabel")}><input className="input" list="svu" value={f.unitLabel} onChange={set("unitLabel")} /><datalist id="svu">{[t("lb_u_page"), t("lb_u_piece"), t("lb_u_hour")].map((u) => <option key={u} value={u} />)}</datalist></F>
          {f.mode === "fixed" ? <F label={t("stk_price")}><MoneyInput f={f} setF={setF} amount="price" currency="priceCur" fx="priceFx" /></F> : <F label={t("lb_commission")}><input className="input" type="number" min="0" max="100" step="any" value={f.commission} onChange={set("commission")} {...ltr} /></F>}
          {f.mode === "fixed" && <F label={t("lb_unitCost")}><MoneyInput f={f} setF={setF} amount="cost" currency="costCur" fx="costFx" /></F>}
        </Grid>
        {f.mode === "amount" && <p style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{t("lb_amountHelp")}</p>}
        <Sec>{t("lb_uses")}</Sec>
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{t("lb_usesHelp")}</p>
        {f.uses.map((u, i) => { const it = biz.inventory.find((x) => x.id === u.invId); return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px 40px", gap: "0.35rem", margin: "0.35rem 0" }}>
            <ItemPicker items={biz.inventory} value={it ? it.name : u.text || ""} placeholder={t("ds_itemPh")} onText={(txt) => setF((p) => ({ ...p, uses: p.uses.map((x, k) => (k === i ? { ...x, invId: "", text: txt } : x)) }))} onPick={(x) => setF((p) => ({ ...p, uses: p.uses.map((y, k) => (k === i ? { ...y, invId: x.id, unit: x.unit, text: "" } : y)) }))} />
            <input className="input" type="number" min="0" step="any" dir="ltr" value={u.qty} onChange={(e) => setF((p) => ({ ...p, uses: p.uses.map((y, k) => (k === i ? { ...y, qty: e.target.value } : y)) }))} />
            <select className="select" value={u.unit || it?.unit || ""} onChange={(e) => setF((p) => ({ ...p, uses: p.uses.map((y, k) => (k === i ? { ...y, unit: e.target.value } : y)) }))}>{(it ? compatible(it.unit) : []).map((c) => <option key={c} value={c}>{unitLabel(c, locale)}</option>)}</select>
            <button type="button" className="icon-btn" aria-label={t("delete")} onClick={() => setF((p) => ({ ...p, uses: p.uses.filter((_, k) => k !== i) }))}><IconTrash /></button></div>); })}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF((p) => ({ ...p, uses: [...p.uses, { invId: "", qty: 1, unit: "", text: "" }] }))}><IconPlus />{t("lb_addUse")}</button>
        <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end", marginTop: "0.7rem" }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>{t("cancel")}</button><button className="btn btn-primary btn-sm">{t("save")}</button></div></form></Modal>}
      {del && <ConfirmDialog title={t("delete")} message={t("b_confirmDelete")} onConfirm={() => remove("services", del.id)} onClose={() => setDel(null)} />}
    </>
  );
}

export function Generator() {
  const { t, toast } = useApp();
  const biz = useBiz();
  const [f, set, setF] = useForm({ base: "", category: "", brand: "", manufacturer: "", unit: "pcs", kind: "stationery", skuPrefix: "", autoBc: true, minQty: "", cost: "", costCur: biz.currency, costFx: "", price: "", priceCur: biz.currency, priceFx: "", attrs: [{ name: "", values: "" }] });
  const [last, setLast] = useState([]);
  const variants = f.base.trim() ? generateVariants(f.base, f.attrs) : [];
  const exists = (n) => biz.inventory.some((i) => i.name.trim().toLowerCase() === n.toLowerCase());
  const fresh = variants.filter((v) => !exists(v.name));
  const generate = (e) => {
    e.preventDefault();
    if (!fresh.length) return toast(t("lb_nothingNew"), "error");
    if (fresh.length > 500) return toast(t("lb_tooMany"), "error");
    const cost = conv(biz, f.cost, f.costCur, f.costFx), price = conv(biz, f.price, f.priceCur, f.priceFx);
    if (cost == null || price == null) return toast(t("fx_missing"), "error");
    const base = biz.inventory.filter((i) => f.skuPrefix && (i.sku || "").startsWith(f.skuPrefix)).length, made = [];
    fresh.forEach((v, k) => {
      const seq = nextSeq("ean"), item = { id: uid(), name: v.name, sku: f.skuPrefix ? `${f.skuPrefix}${String(base + k + 1).padStart(4, "0")}` : "", barcode: f.autoBc ? ean13(seq) : "", category: f.category, brand: f.brand, manufacturer: f.manufacturer, origin: "", unit: f.unit, perCarton: "", qtyIn: 0, qtyOut: 0, minQty: f.minQty, maxQty: "", reorderQty: "", shelfDays: "", location: "", storage: "", cost, price, priceW: "", priceD: "", taxRate: "", supplier: "", description: "", notes: "",
        custom: [...v.attrs, ...(f.kind === "book" ? ["lb_author", "lb_publisher", "lb_edition", "lb_language"].map((k2) => ({ label: t(k2), value: "" })) : [])], media: [] };
      upsert("inventory", item); made.push(item);
    });
    setLast(made); toast(`${made.length} ${t("lb_generated")}`, "success");
  };
  const upAttr = (i, p) => setF((s) => ({ ...s, attrs: s.attrs.map((a, k) => (k === i ? { ...a, ...p } : a)) }));
  return (
    <form onSubmit={generate} style={{ display: "grid", gap: "0.7rem" }}>
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{t("lb_genHelp")}</p>
      <Grid>
        <F label={t("lb_baseName") + " *"}><input className="input" required value={f.base} onChange={set("base")} placeholder={t("lb_basePh")} /></F>
        <F label={t("lb_kind")}><select className="select" value={f.kind} onChange={set("kind")}><option value="stationery">{t("lb_k_stationery")}</option><option value="book">{t("lb_k_book")}</option><option value="other">{t("pr_u_other")}</option></select></F>
        <F label={t("rs_cat")}><input className="input" list="gcat" value={f.category} onChange={set("category")} /><datalist id="gcat">{[...new Set(biz.inventory.map((x) => x.category).filter(Boolean))].map((c) => <option key={c} value={c} />)}</datalist></F>
        <F label={t("cat_brand")}><input className="input" value={f.brand} onChange={set("brand")} /></F>
        <F label={t("it_manufacturer")}><input className="input" value={f.manufacturer} onChange={set("manufacturer")} /></F>
        <F label={t("stk_unit")}><UnitPicker value={f.unit} onChange={(v) => setF((p) => ({ ...p, unit: v }))} /></F>
        <F label={t("lb_skuPrefix")}><input className="input" value={f.skuPrefix} onChange={set("skuPrefix")} {...ltr} /></F>
        <F label={t("stk_min")}><input className="input" type="number" min="0" step="any" value={f.minQty} onChange={set("minQty")} {...ltr} /></F>
        <F label={t("stk_cost")}><MoneyInput f={f} setF={setF} amount="cost" currency="costCur" fx="costFx" /></F>
        <F label={t("stk_price")}><MoneyInput f={f} setF={setF} amount="price" currency="priceCur" fx="priceFx" /></F>
      </Grid>
      <Sec>{t("lb_attrs")}</Sec>
      {f.attrs.map((a, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 40px", gap: "0.35rem" }}>
          <input className="input" placeholder={t("lb_attrName")} value={a.name} onChange={(e) => upAttr(i, { name: e.target.value })} />
          <input className="input" placeholder={t("lb_attrValues")} value={a.values} onChange={(e) => upAttr(i, { values: e.target.value })} />
          <button type="button" className="icon-btn" aria-label={t("delete")} disabled={f.attrs.length < 2} onClick={() => setF((s) => ({ ...s, attrs: s.attrs.filter((_, k) => k !== i) }))}><IconTrash /></button></div>))}
      <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: "start" }} onClick={() => setF((s) => ({ ...s, attrs: [...s.attrs, { name: "", values: "" }] }))}><IconPlus />{t("lb_addAttr")}</button>
      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "var(--text-sm)" }}><input type="checkbox" checked={f.autoBc} onChange={(e) => setF((s) => ({ ...s, autoBc: e.target.checked }))} /> {t("lb_autoBc")}</label>
      <div className="glass card" style={{ fontSize: "var(--text-sm)" }}>
        <strong>{t("lb_preview")}: {fresh.length} {t("stk_items")}{variants.length > fresh.length && ` (${variants.length - fresh.length} ${t("lb_exist")})`}</strong>
        <div style={{ color: "var(--text-2)", marginTop: 4 }}>{variants.slice(0, 40).map((v) => <div key={v.name} style={{ opacity: exists(v.name) ? 0.4 : 1 }}>{v.name}</div>)}{variants.length > 40 && <div>…</div>}</div></div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button className="btn btn-primary btn-sm" disabled={!fresh.length}>{t("lb_generate")}</button>
        {last.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (!printLabels(last, biz, t)) toast(t("inv_printHint"), "error"); }}>🏷 {t("lb_printLast")} ({last.length})</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const all = biz.inventory.filter((i) => i.barcode); if (!all.length) return toast(t("b_none"), "error"); printLabels(all, biz, t); }}>🏷 {t("lb_printAll")}</button></div>
      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{t("lb_eanNote")}</p>
    </form>
  );
}

export function Reorder() {
  const { t, locale, toast } = useApp();
  const biz = useBiz(), plan = reorderPlan(biz), [contacts, setContacts] = useState([]);
  React.useEffect(() => { api.get("/contacts").then((d) => setContacts(d.items || [])).catch(() => {}); }, []);
  const entries = Object.entries(plan);
  const msg = (sup, rows) => `${t("lb_orderMsg")} — ${biz.name || ""}\n${rows.map((r) => `• ${r.item.name} × ${+r.qty.toFixed(2)} ${unitLabel(r.item.unit, locale)}`).join("\n")}`;
  return entries.length === 0 ? <EmptyState icon={<IconBox />} text={t("lb_noReorder")} /> : (
    <>
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{t("lb_reorderHelp")}</p>
      {entries.map(([sup, rows]) => { const c = contacts.find((x) => x.name === sup); return (
        <div key={sup} className="glass card" style={{ display: "grid", gap: "0.4rem" }}>
          <strong>🚚 {sup || t("lb_noSupplier")}</strong>
          {rows.map((r) => <div key={r.item.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", gap: "0.5rem" }}><span>{r.item.name} <small style={{ color: "var(--text-3)" }}>({t("stk_left")}: {+r.left.toFixed(2)})</small></span><b dir="ltr">{+r.qty.toFixed(2)} {unitLabel(r.item.unit, locale)}{r.last && <small style={{ color: "var(--text-3)" }}> · {fmt(r.last.price)} {r.last.cur}</small>}</b></div>)}
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(msg(sup, rows)).then(() => toast(t("cat_copied"), "success"))}>{t("cat_copy")}</button>
            {c?.phone && <a className="btn btn-primary btn-sm" target="_blank" rel="noreferrer" href={`https://wa.me/${waPhone(c.phone)}?text=${encodeURIComponent(msg(sup, rows))}`}>WhatsApp</a>}</div></div>); })}
    </>
  );
}
