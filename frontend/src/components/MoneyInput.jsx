import React from "react";
import CurrencyPicker from "./CurrencyPicker";
import { useApp } from "../context/AppContext";
import { useBiz } from "../services/biz";

/* One price field everywhere: amount + currency from the world list (or typed by hand) + the exchange rate to the main currency when it differs.
   It edits three fields of the parent form: f[amount], f[currency], f[fx]. The rate is the one typed by the user or saved in Business setup. */
export default function MoneyInput({ f, setF, amount, currency, fx, required }) {
  const { t } = useApp();
  const biz = useBiz(), cur = f[currency] || biz.currency, foreign = cur !== biz.currency;
  return (
    <div style={{ display: "grid", gap: "0.4rem" }}>
      <input className="input" type="number" min="0" step="any" dir="ltr" required={required} placeholder={t("amount")} value={f[amount] ?? ""} onChange={(e) => setF((p) => ({ ...p, [amount]: e.target.value }))} />
      <CurrencyPicker value={cur} onChange={(v) => setF((p) => ({ ...p, [currency]: v, [fx]: v === biz.currency ? "" : biz.rates[v] || "" }))} />
      {foreign && <input className="input" type="number" min="0" step="any" dir="ltr" required placeholder={`1 ${cur} = ? ${biz.currency}`} value={f[fx] ?? ""} onChange={(e) => setF((p) => ({ ...p, [fx]: e.target.value }))} />}
    </div>
  );
}
