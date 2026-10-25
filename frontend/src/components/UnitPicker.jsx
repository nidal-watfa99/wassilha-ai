import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { GROUPS, GROUP_NAMES, UNITS, unitLabel } from "../services/units";

export default function UnitPicker({ value, onChange }) {
  const { t, locale } = useApp();
  const known = !!UNITS[value];
  const [manual, setManual] = useState(!!value && !known);
  const sel = manual ? "__other" : known ? value : "";
  const i = locale === "ar" ? 0 : 1;
  return (
    <div style={{ display: "grid", gap: "0.4rem" }}>
      <select className="select" value={sel} onChange={(e) => { if (e.target.value === "__other") { setManual(true); onChange(known ? "" : value); } else { setManual(false); onChange(e.target.value); } }}>
        <option value="">—</option>
        {Object.entries(GROUPS).map(([g, codes]) => (
          <optgroup key={g} label={GROUP_NAMES[g][i]}>{codes.map((c) => <option key={c} value={c}>{unitLabel(c, locale)}</option>)}</optgroup>
        ))}
        <option value="__other">✍ {t("cur_other")}</option>
      </select>
      {manual && <input className="input" required maxLength={20} value={value} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}
