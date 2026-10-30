import React from "react";
import { useApp } from "../context/AppContext";
import { IconPlus, IconTrash } from "./Icons";
import { useBiz, fmt } from "../services/biz";
import { compatible, unitLabel } from "../services/units";
import { recipeCost } from "../services/costing";

/* value: { recipe: [{invId, qty, unit}], extraCost } — onChange(patch) */
export default function RecipeEditor({ value, onChange, cur }) {
  const { t, locale } = useApp();
  const biz = useBiz();
  const recipe = value.recipe || [], rc = recipeCost(recipe, biz.inventory);
  const setRow = (i, p) => onChange({ recipe: recipe.map((r, k) => (k === i ? { ...r, ...p } : r)) });
  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      {recipe.map((r, i) => {
        const it = biz.inventory.find((x) => x.id === r.invId), line = rc.lines[i];
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 90px 34px", gap: "0.4rem", alignItems: "center" }}>
            <select className="select" value={r.invId} onChange={(e) => { const n = biz.inventory.find((x) => x.id === e.target.value); setRow(i, { invId: e.target.value, unit: n?.unit || "" }); }}>
              <option value="">—</option>{biz.inventory.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <input className="input" type="number" min="0" step="any" dir="ltr" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} />
            <select className="select" value={r.unit || it?.unit || ""} onChange={(e) => setRow(i, { unit: e.target.value })}>
              {(it ? compatible(it.unit) : []).map((c) => <option key={c} value={c}>{unitLabel(c, locale)}</option>)}{!it?.unit && <option value="">—</option>}</select>
            <button type="button" className="icon-btn" aria-label={t("delete")} onClick={() => onChange({ recipe: recipe.filter((_, k) => k !== i) })}><IconTrash /></button>
            {line && <small style={{ gridColumn: "1 / -1", color: "var(--text-3)" }} dir="ltr">{fmt(line.cost)} {cur}</small>}
          </div>
        );
      })}
      <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: "start" }} onClick={() => onChange({ recipe: [...recipe, { invId: "", qty: "", unit: "" }] })}><IconPlus />{t("rc_add")}</button>
      {rc.missing > 0 && <div style={{ color: "#ff8a9b", fontSize: "var(--text-sm)" }}>⚠ {t("rc_missing")}</div>}
      <label style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{t("rc_extra")}</label>
      <input className="input" type="number" min="0" step="any" dir="ltr" value={value.extraCost ?? ""} onChange={(e) => onChange({ extraCost: e.target.value })} />
      <div className="sum-total" style={{ borderRadius: 12 }}><span>{t("rc_cost")}</span><span className="num"><bdi dir="ltr">{fmt(rc.cost + (Number(value.extraCost) || 0))} {cur}</bdi></span></div>
    </div>
  );
}
