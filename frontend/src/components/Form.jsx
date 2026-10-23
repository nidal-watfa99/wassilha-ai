import React, { useState } from "react";

export const F = ({ label, children, wide }) => (
  <div className="field" style={wide ? { gridColumn: "1 / -1" } : undefined}>
    <label>{label}</label>
    {children}
  </div>
);
export const Grid = ({ children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0 0.8rem" }}>{children}</div>
);
export const Sec = ({ children }) => (
  <h4 style={{ margin: "1.1rem 0 0.5rem", color: "var(--cyan)", fontSize: "var(--text-sm)" }}>{children}</h4>
);
export const ltr = { dir: "ltr", style: { textAlign: "start" } };

export function useForm(init) {
  const [v, setV] = useState(init);
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }));
  return [v, set, setV];
}
