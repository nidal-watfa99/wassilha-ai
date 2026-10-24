import React, { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { Modal, EmptyState, ConfirmDialog } from "../components/UI";
import { IconBox, IconPlus, IconEdit, IconTrash } from "../components/Icons";
import { F, Grid, ltr, useForm } from "../components/Form";
import { useBiz, upsert, remove, uid, fmt, stockLeft, getLow } from "../services/biz";

const BLANK = { name: "", sku: "", unit: "", qtyIn: "", qtyOut: "", minQty: "", cost: "", price: "", supplier: "", location: "", notes: "" };

export default function Inventory() {
  const { t, toast } = useApp();
  const biz = useBiz();
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null);
  const [del, setDel] = useState(null);
  const [qty, setQty] = useState({});
  const [f, set, setF] = useForm(BLANK);
  const low = getLow(biz);

  const open = (x) => { setF(x === "new" ? BLANK : { ...BLANK, ...x }); setModal(x); };
  const save = (e) => {
    e.preventDefault();
    upsert("inventory", { ...(modal === "new" ? { id: uid() } : modal), ...f });
    setModal(null);
  };
  const move = (x, dir) => {
    const n = Number(qty[x.id]);
    if (!(n > 0)) return;
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
    return biz.inventory.filter((x) => !s || [x.name, x.sku, x.supplier, x.location].some((v) => String(v || "").toLowerCase().includes(s)));
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
              {t("stk_in")}: {Number(x.qtyIn) || 0} · {t("stk_out")}: {Number(x.qtyOut) || 0} · <b>{t("stk_left")}: {left} {x.unit}</b>
              {x.location && ` · ${x.location}`}
            </div>
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
              <input className="input" style={{ width: 90 }} type="number" min="0" step="any" placeholder={t("stk_qty")} value={qty[x.id] || ""} onChange={(e) => setQty((p) => ({ ...p, [x.id]: e.target.value }))} {...ltr} />
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
            <Grid>
              <F label={t("stk_name") + " *"} wide><input className="input" required value={f.name} onChange={set("name")} /></F>
              <F label={t("stk_sku")}><input className="input" value={f.sku} onChange={set("sku")} {...ltr} /></F>
              <F label={t("stk_unit")}><input className="input" value={f.unit} onChange={set("unit")} /></F>
              <F label={t("stk_in")}><input className="input" type="number" min="0" step="any" value={f.qtyIn} onChange={set("qtyIn")} {...ltr} /></F>
              <F label={t("stk_out")}><input className="input" type="number" min="0" step="any" value={f.qtyOut} onChange={set("qtyOut")} {...ltr} /></F>
              <F label={t("stk_min")}><input className="input" type="number" min="0" step="any" value={f.minQty} onChange={set("minQty")} {...ltr} /></F>
              <F label={t("stk_cost")}><input className="input" type="number" min="0" step="any" value={f.cost} onChange={set("cost")} {...ltr} /></F>
              <F label={t("stk_price")}><input className="input" type="number" min="0" step="any" value={f.price} onChange={set("price")} {...ltr} /></F>
              <F label={t("stk_supplier")}><input className="input" value={f.supplier} onChange={set("supplier")} /></F>
              <F label={t("stk_loc")}><input className="input" value={f.location} onChange={set("location")} /></F>
            </Grid>
            <F label={t("emp_notes")}><textarea className="textarea" rows={2} value={f.notes} onChange={set("notes")} /></F>
            <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>{t("cancel")}</button>
              <button className="btn btn-primary btn-sm">{t("save")}</button>
            </div>
          </form>
        </Modal>
      )}
      {del && <ConfirmDialog title={t("delete")} message={t("b_confirmDelete")} onConfirm={() => remove("inventory", del.id)} onClose={() => setDel(null)} />}
    </div>
  );
}
