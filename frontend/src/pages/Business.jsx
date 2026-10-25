import React, { useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import CurrencyPicker from "../components/CurrencyPicker";
import { F, Grid, ltr } from "../components/Form";
import { useBiz, update, applyPreset, exportBackup, importBackup, MODULES, TYPE_KEYS } from "../services/biz";

/* First-run wizard: the user decides what the business is; presets only suggest sections. */
export function SetupWizard({ onClose }) {
  const { t, locale } = useApp();
  const [type, setType] = useState("shop");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [taxRate, setTaxRate] = useState(0);
  const start = (e) => { e.preventDefault(); applyPreset(type, locale, { name, currency, taxRate }); };
  const skip = () => applyPreset("custom", locale, { name, currency, taxRate });
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="modal" style={{ width: "min(96vw, 560px)" }} onSubmit={start}>
        <div className="modal-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>{t("wzTitle")}</h3>
          {onClose && <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>✕ {t("wzBack")}</button>}
        </div>
        <div className="modal-body">
          <p style={{ marginTop: 0, color: "var(--text-2)" }}>{t("wzSub")}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.5rem", marginBottom: "0.8rem" }}>
            {TYPE_KEYS.map((k) => (
              <button type="button" key={k} className={`btn btn-sm ${type === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setType(k)}>{t("type_" + k)}</button>
            ))}
          </div>
          <Grid>
            <F label={t("wzName")} wide><input className="input" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></F>
            <F label={t("wzCurrency")}><CurrencyPicker value={currency} onChange={setCurrency} /></F>
            <F label={t("wzTax")}><input className="input" type="number" min="0" max="100" step="any" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} {...ltr} /></F>
          </Grid>
          <div style={{ display: "flex", gap: "0.7rem", justifyContent: "space-between", flexWrap: "wrap", marginTop: "0.6rem" }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={skip}>{t("wzSkip")}</button>
            <button className="btn btn-primary btn-sm">{t("wzStart")}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

const LABEL = { contacts: "contacts", messages: "messages", ai: "ai", tasks: "tasks", calendar: "calendar", documents: "documents", insights: "insights", products: "products", calculator: "calculator", employees: "employees", invoices: "invoices", map: "map", inventory: "inventory", catalog: "catalog", expenses: "expenses", reports: "reports", aimodels: "aimodels" };

export default function Business() {
  const { t, locale, toast } = useApp();
  const biz = useBiz();
  const fileRef = useRef(null);
  const set = (k, v) => update((s) => ({ ...s, [k]: v }));
  const setTerm = (k, v) => update((s) => ({ ...s, terms: { ...s.terms, [k]: v } }));
  const toggle = (m) => update((s) => ({ ...s, modules: { ...s.modules, [m]: s.modules[m] === false } }));

  const doExport = () => {
    const url = URL.createObjectURL(new Blob([exportBackup()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `wassilha-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const doImport = async (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    try { importBackup(await file.text()); toast(t("bzImportOk"), "success"); setTimeout(() => window.location.reload(), 600); }
    catch { toast(t("bzImportBad"), "error"); }
  };
  const notifOn = async () => {
    if (!("Notification" in window)) return toast(t("bzNotifNo"), "error");
    const r = await Notification.requestPermission();
    toast(t(r === "granted" ? "bzNotifEnabled" : "bzNotifDenied"), r === "granted" ? "success" : "error");
  };

  return (
    <div style={{ display: "grid", gap: "1rem", maxWidth: 760 }}>
      <div className="glass card">
        <h3 style={{ marginTop: 0 }}>{t("bzInfo")}</h3>
        <Grid>
          <F label={t("wzName")} wide><input className="input" value={biz.name} onChange={(e) => set("name", e.target.value)} /></F>
          <F label={t("wzCurrency")}><CurrencyPicker value={biz.currency} onChange={(v) => set("currency", v)} /></F>
          <F label={t("wzTax")}><input className="input" type="number" min="0" max="100" step="any" value={biz.taxRate} onChange={(e) => set("taxRate", e.target.value)} {...ltr} /></F>
          <F label={t("bzRemind")}><input className="input" type="number" min="0" max="60" value={biz.reminderDays} onChange={(e) => set("reminderDays", e.target.value)} {...ltr} /></F>
          <F label={t("bzType")}>
            <select className="select" value={biz.type} onChange={(e) => applyPreset(e.target.value, locale, biz)}>
              {TYPE_KEYS.map((k) => <option key={k} value={k}>{t("type_" + k)}</option>)}
            </select>
          </F>
        </Grid>
      </div>

      <div className="glass card">
        <h3 style={{ marginTop: 0 }}>{t("bzTerms")}</h3>
        <Grid>
          <F label={t("bzTermContacts")}><input className="input" value={biz.terms.contacts || ""} onChange={(e) => setTerm("contacts", e.target.value)} /></F>
          <F label={t("bzTermProducts")}><input className="input" value={biz.terms.products || ""} onChange={(e) => setTerm("products", e.target.value)} /></F>
        </Grid>
      </div>

      <div className="glass card">
        <h3 style={{ marginTop: 0 }}>{t("bzModules")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.5rem" }}>
          {MODULES.map((m) => {
            const on = biz.modules[m] !== false;
            return <button key={m} type="button" className={`btn btn-sm ${on ? "btn-primary" : "btn-ghost"}`} aria-pressed={on} onClick={() => toggle(m)}>{on ? "✓ " : ""}{biz.terms[m] || t(LABEL[m])}</button>;
          })}
        </div>
      </div>

      <div className="glass card">
        <h3 style={{ marginTop: 0 }}>{t("bzNotif")}</h3>
        <button className="btn btn-ghost btn-sm" onClick={notifOn}>🔔 {t("bzNotifOn")}</button>
      </div>

      <div className="glass card">
        <h3 style={{ marginTop: 0 }}>{t("bzBackup")}</h3>
        <p style={{ color: "var(--text-2)", fontSize: "var(--text-sm)" }}>{t("bzBackupHelp")}</p>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-sm" onClick={doExport}>{t("bzExport")}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current.click()}>{t("bzImport")}</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={doImport} />
        </div>
      </div>
    </div>
  );
}
