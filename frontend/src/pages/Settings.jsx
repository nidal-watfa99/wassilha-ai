import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, LOCAL_MODE } from "../services/api";
import {
  PROVIDERS, getAiConfig, setAiConfig, removeAiConfig, maskKey, testProvider,
} from "../services/aiClient";
import { useApp } from "../context/AppContext";
import { ErrorNote } from "../components/UI";
import { LOCALES } from "../i18n";
import { IconLogout } from "../components/Icons";

function AiKeyCard({ t, toast }) {
  const saved = getAiConfig();
  const [cfg, setCfg] = useState(saved);
  const [provider, setProvider] = useState(saved?.provider || "gemini");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const testAndSave = async (e) => {
    e.preventDefault();
    const apiKey = key.trim();
    if (!apiKey) { setMsg({ ok: false, text: t("aiKeyEnter") }); return; }
    setBusy(true);
    setMsg(null);
    const res = await testProvider(provider, apiKey, PROVIDERS[provider].model);
    setBusy(false);
    if (res.success) {
      const next = { provider, apiKey, model: res.model };
      setAiConfig(next);
      setCfg(next);
      setKey("");
      setMsg({ ok: true, text: `${t("aiKeySaved")} (${res.model}, ${res.latencyMs}ms)` });
      toast(t("aiKeySaved"), "success");
    } else {
      setMsg({ ok: false, text: res.error });
    }
  };

  const remove = () => {
    removeAiConfig();
    setCfg(null);
    setMsg({ ok: true, text: t("aiKeyRemoved") });
  };

  return (
    <div className="glass card">
      <h3>{t("aiKeyTitle")}</h3>
      <p style={{ fontSize: "var(--text-xs)", color: "var(--text-3)", marginTop: 0 }}>{t("aiKeyHelp")}</p>
      {cfg && (
        <div className="badge badge-green" style={{ marginBottom: "0.7rem" }}>
          {t("aiKeyConnected")}: {PROVIDERS[cfg.provider]?.name} · {cfg.model} · <span dir="ltr">{maskKey(cfg.apiKey)}</span>
        </div>
      )}
      <form onSubmit={testAndSave}>
        <div className="field">
          <label>{t("aiProvider")}</label>
          <select className="select" value={provider} onChange={(e) => setProvider(e.target.value)}>
            {Object.entries(PROVIDERS).map(([id, p]) => <option key={id} value={id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>{t("aiKeyLabel")}</label>
          <input className="input" type="password" dir="ltr" style={{ textAlign: "start" }} autoComplete="off"
                 value={key} onChange={(e) => setKey(e.target.value)} />
          <a href={PROVIDERS[provider].portal} target="_blank" rel="noopener noreferrer"
             style={{ fontSize: "var(--text-xs)", color: "var(--cyan)" }}>{t("aiKeyGet")} ↗</a>
        </div>
        {msg && (
          <div role="status" style={{ fontSize: "var(--text-xs)", margin: "0.4rem 0", color: msg.ok ? "var(--success, #3ddc97)" : "var(--danger)" }}>
            {msg.text}
          </div>
        )}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? "…" : t("aiKeyTest")}</button>
          {cfg && <button type="button" className="btn btn-danger btn-sm" onClick={remove}>{t("aiKeyRemove")}</button>}
        </div>
      </form>
    </div>
  );
}

export default function Settings() {
  const { t, user, setUser, locale, setLocale, toast, tError, logout } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || "");
  const [profileError, setProfileError] = useState(null);
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [pwError, setPwError] = useState(null);

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileError(null);
    try {
      const updated = await api.patch("/auth/me", { name, locale });
      setUser(updated);
      toast(t("profileSaved"), "success");
    } catch (err) { setProfileError(err); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwError(null);
    try {
      await api.put("/auth/password", pw);
      setPw({ current_password: "", new_password: "" });
      toast(t("passwordChanged"), "success");
    } catch (err) { setPwError(err); }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div style={{ display: "grid", gap: "1.2rem", maxWidth: "560px" }}>
      <div className="glass card">
        <h3>{t("profile")}</h3>
        <form onSubmit={saveProfile}>
          <div className="field">
            <label>{t("name")}</label>
            <input className="input" required minLength={2} maxLength={100} value={name}
                   onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>{t("email")}</label>
            <input className="input" value={user?.email || ""} disabled dir="ltr" style={{ textAlign: "start", opacity: 0.6 }} />
          </div>
          <div className="field">
            <label>{t("language")}</label>
            <select className="select" value={locale} onChange={(e) => setLocale(e.target.value)}>
              {Object.entries(LOCALES).map(([code, { label }]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
          <ErrorNote error={profileError} />
          <button className="btn btn-primary btn-sm">{t("save")}</button>
        </form>
      </div>

      <div className="glass card">
        <h3>{t("changePassword")}</h3>
        <form onSubmit={changePassword}>
          <div className="field">
            <label>{t("currentPassword")}</label>
            <input className="input" type="password" required dir="ltr" style={{ textAlign: "start" }}
                   value={pw.current_password} autoComplete="current-password"
                   onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
          </div>
          <div className="field">
            <label>{t("newPassword")}</label>
            <input className="input" type="password" required minLength={8} dir="ltr" style={{ textAlign: "start" }}
                   value={pw.new_password} autoComplete="new-password"
                   onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
          </div>
          <ErrorNote error={pwError} />
          <button className="btn btn-primary btn-sm">{t("save")}</button>
        </form>
      </div>

      {LOCAL_MODE && <AiKeyCard t={t} toast={toast} />}

      <div className="glass card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 600 }}>{user?.name}</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{t("sessionActive")}</div>
        </div>
        <button className="btn btn-danger" onClick={handleLogout}>
          <IconLogout />{t("logout")}
        </button>
      </div>
    </div>
  );
}
