import React, { useState } from "react";
import { useApp, storage } from "../context/AppContext";
import { ErrorNote } from "../components/UI";
import { LangSwitch } from "../components/Layout";
import { IconSpark } from "../components/Icons";

export default function Login() {
  const { t, tError, login, register, toast } = useApp();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await login(form.email, form.password);
      } else {
        await register({
          name: form.name, email: form.email, password: form.password,
          locale: storage.get("wassilha_locale") || "ar",
        });
      }
    } catch (err) {
      setError(err);
      toast(tError(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell" style={{ alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div className="glass card" style={{ width: "min(94vw, 420px)", padding: "2rem 1.8rem" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem", marginBottom: "1.4rem", textAlign: "center" }}>
          <div className="brand-orb" style={{ width: 52, height: 52 }} aria-hidden="true">و</div>
          <h1 className="silver-blue-text" style={{ margin: 0, fontSize: "1.5rem" }}>{t("appName")}</h1>
          <p style={{ margin: 0, color: "var(--text-2)", fontSize: "var(--text-sm)" }}>{mode === "login" ? t("welcome") : t("getStarted")}</p>
        </div>

        <form onSubmit={submit}>
          {mode === "register" && (
            <div className="field">
              <label htmlFor="name">{t("name")}</label>
              <input id="name" className="input" required minLength={2} maxLength={100}
                     value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                     autoComplete="name" />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">{t("email")}</label>
            <input id="email" className="input" type="email" required
                   value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                   autoComplete="email" dir="ltr" style={{ textAlign: "start" }} />
          </div>
          <div className="field">
            <label htmlFor="password">{t("password")}</label>
            <input id="password" className="input" type="password" required minLength={8}
                   value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                   autoComplete={mode === "login" ? "current-password" : "new-password"} dir="ltr" style={{ textAlign: "start" }} />
          </div>
          <ErrorNote error={error} />
          <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
            {busy ? t("loading") : mode === "login" ? t("login") : t("register")}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: "1.1rem", marginBottom: 0, fontSize: "var(--text-sm)" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}>
            {mode === "login" ? t("noAccount") + " " + t("register") : t("haveAccount") + " " + t("login")}
          </button>
        </p>
        <div style={{ display: "flex", justifyContent: "center", marginTop: "1rem" }}>
          <LangSwitch />
        </div>
      </div>
    </div>
  );
}
