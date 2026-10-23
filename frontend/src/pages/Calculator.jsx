import React, { useState } from "react";
import { useApp } from "../context/AppContext";

/* Calculator with a safe expression parser (no eval).
   Supports + - × ÷ % and parentheses via a shunting-yard evaluator. */
function evaluate(expr) {
  const tokens = expr.match(/\d+\.?\d*|[+\-*/%()]/g);
  if (!tokens) throw new Error("empty");
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr() {
    let v = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const rhs = parseTerm();
      v = op === "+" ? v + rhs : v - rhs;
    }
    return v;
  }
  function parseTerm() {
    let v = parseFactor();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = next();
      const rhs = parseFactor();
      if ((op === "/" || op === "%") && rhs === 0) throw new Error("div0");
      v = op === "*" ? v * rhs : op === "/" ? v / rhs : v % rhs;
    }
    return v;
  }
  function parseFactor() {
    if (peek() === "-") { next(); return -parseFactor(); }
    if (peek() === "+") { next(); return parseFactor(); }
    if (peek() === "(") {
      next();
      const v = parseExpr();
      if (next() !== ")") throw new Error("paren");
      return v;
    }
    const tok = next();
    const n = parseFloat(tok);
    if (isNaN(n)) throw new Error("num");
    return n;
  }

  const result = parseExpr();
  if (pos !== tokens.length) throw new Error("trailing");
  return result;
}

const KEYS = [
  ["7", "8", "9", "/"],
  ["4", "5", "6", "*"],
  ["1", "2", "3", "-"],
  ["0", ".", "(", "+"],
];

export default function Calculator() {
  const { t } = useApp();
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState(false);

  const compute = (e) => {
    e.preventDefault();
    try {
      const v = evaluate(expr);
      setResult(String(Math.round(v * 1e10) / 1e10));
      setError(false);
    } catch {
      setResult(t("calcError"));
      setError(true);
    }
  };

  const press = (k) => {
    setExpr((x) => x + k);
    setResult("");
    setError(false);
  };

  return (
    <div style={{ maxWidth: "360px", margin: "0 auto" }}>
      <form onSubmit={compute} className="glass card">
        <input
          className="input" dir="ltr" style={{ textAlign: "end", fontFamily: "var(--font-display)", fontSize: "1.3rem", marginBottom: "0.5rem" }}
          value={expr} onChange={(e) => { setExpr(e.target.value); setResult(""); setError(false); }}
          placeholder="0" aria-label="expression" inputMode="text" />
        <div dir="ltr" style={{
          textAlign: "end", fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 700,
          minHeight: "2.2rem", color: error ? "var(--danger)" : "var(--cyan)",
          background: "rgba(10,16,26,.6)", borderRadius: "var(--radius-sm)", padding: "0.3rem 0.8rem", marginBottom: "0.8rem",
        }}>
          {result || "\u00A0"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.45rem" }} dir="ltr">
          {KEYS.flat().map((k) => (
            <button key={k} type="button" className="btn btn-ghost" style={{ padding: 0 }} onClick={() => press(k)}>{k}</button>
          ))}
          <button type="button" className="btn btn-ghost" style={{ padding: 0 }} onClick={() => press(")")}>)</button>
          <button type="button" className="btn btn-ghost" style={{ padding: 0 }} onClick={() => press("%")}>%</button>
          <button type="button" className="btn btn-danger" style={{ padding: 0 }}
                  onClick={() => { setExpr(""); setResult(""); setError(false); }}>C</button>
          <button type="button" className="btn btn-ghost" style={{ padding: 0 }}
                  onClick={() => setExpr((x) => x.slice(0, -1))}>⌫</button>
          <button className="btn btn-primary" style={{ gridColumn: "span 4" }} type="submit">=</button>
        </div>
      </form>
    </div>
  );
}
