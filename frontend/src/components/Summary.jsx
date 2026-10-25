import React from "react";
import { fmt } from "../services/biz";

/* Ruled statement: labels on the reading side, numbers aligned on the other, one highlighted final line.
   rows: { label, value | text, tone: "minus" | "plus" | "muted", sub: true } or { head } */
export default function Summary({ title, rows, total, cur }) {
  const val = (v) => <bdi dir="ltr">{fmt(v)}{cur ? ` ${cur}` : ""}</bdi>;
  return (
    <div className="sum">
      {title && <div className="sum-head">{title}</div>}
      {rows.filter(Boolean).map((r, i) => r.head ? <div key={i} className="sum-head">{r.head}</div> : (
        <div key={i} className={`sum-row ${r.tone || ""} ${r.sub ? "sub" : ""}`}>
          <span>{r.label}</span>
          <span className="num">{r.text != null ? <bdi>{r.text}</bdi> : <>{r.tone === "minus" ? "− " : r.tone === "plus" ? "+ " : ""}{val(r.value)}</>}</span>
        </div>
      ))}
      {total && <div className="sum-total"><span>{total.label}</span><span className="num">{val(total.value)}</span></div>}
    </div>
  );
}
