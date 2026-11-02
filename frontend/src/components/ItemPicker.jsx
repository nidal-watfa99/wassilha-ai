import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { stockLeft } from "../services/biz";
import { searchItems } from "../services/distribution";
import BarcodeScan, { canScan } from "./BarcodeScan";

/* Free-typing item field with suggestions: works for a handful of items or hundreds of thousands (only the best 8 are drawn).
   Pick a suggestion to link the stock item; keep typing to use a free item. Enter on an exact barcode picks it (scanner friendly). */
export default function ItemPicker({ items, value, onText, onPick, placeholder }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false), [scan, setScan] = useState(false);
  const hits = open ? searchItems(items, value) : [];
  const byCode = (c) => items.find((i) => c && (String(i.barcode || "") === String(c).trim() || String(i.sku || "") === String(c).trim()));
  const choose = (i) => { onPick(i); setOpen(false); };
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: "0.35rem" }}>
        <input className="input" style={{ flex: 1, minWidth: 0 }} value={value} placeholder={placeholder} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 180)}
          onChange={(e) => { onText(e.target.value); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const m = byCode(value) || (hits.length === 1 ? hits[0] : null); if (m) choose(m); } }} />
        {canScan() && <button type="button" className="btn btn-ghost btn-sm" aria-label={t("bc_title")} onClick={() => setScan(true)}>📷</button>}
      </div>
      {open && hits.length > 0 && (
        <div className="glass" style={{ position: "absolute", insetInline: 0, top: "calc(100% + 4px)", zIndex: 60, maxHeight: 260, overflowY: "auto", background: "#0c1220", border: "1px solid var(--border-strong)", borderRadius: 12, boxShadow: "0 14px 34px rgba(0,0,0,.55)" }}>
          {hits.map((i) => (
            <button type="button" key={i.id} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(i)} style={{ display: "flex", width: "100%", justifyContent: "space-between", gap: "0.6rem", padding: "0.55rem 0.7rem", background: "transparent", border: 0, borderBottom: "1px solid var(--border)", color: "inherit", font: "inherit", textAlign: "start", cursor: "pointer" }}>
              <span>{i.name}{(i.barcode || i.sku) && <small style={{ color: "var(--text-3)" }}> · <bdi dir="ltr">{i.barcode || i.sku}</bdi></small>}</span>
              <small style={{ color: "var(--text-3)", whiteSpace: "nowrap" }}>{+stockLeft(i).toFixed(2)}</small>
            </button>
          ))}
        </div>
      )}
      {scan && <BarcodeScan onClose={() => setScan(false)} onCode={(c) => { const m = byCode(c); if (m) choose(m); else onText(c); }} />}
    </div>
  );
}
