import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { IconInfo, IconSpark, IconPhone, IconAlert } from "../components/Icons";

export default function About() {
  const { t } = useApp();
  const [info, setInfo] = useState(null);
  const [aiConfigured, setAiConfigured] = useState(null);

  useEffect(() => {
    api.get("/about").then(setInfo).catch(() => {});
    api.get("/ai/status").then((d) => setAiConfigured(d.configured)).catch(() => {});
  }, []);

  const features = [
    { key: "auth", label: t("login") },
    { key: "contacts", label: t("contacts") },
    { key: "messaging", label: t("messages") },
    { key: "files", label: t("attachFile") },
    { key: "voice-notes", label: t("recordVoice") },
    { key: "calls", label: t("calls") },
    { key: "ai-assistant", label: t("ai") },
    { key: "tasks", label: t("tasks") },
    { key: "calendar", label: t("calendar") },
    { key: "documents", label: t("documents") },
    { key: "insights", label: t("insights") },
    { key: "products", label: t("products") },
    { key: "calculator", label: t("calculator") },
  ];

  return (
    <div style={{ maxWidth: "640px" }}>
      <div className="glass card">
        <h2 className="silver-blue-text" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <IconInfo /> {t("appName")}
        </h2>
        <p style={{ color: "var(--text-2)", marginTop: 0 }}>{info?.description_ar || t("tagline")}</p>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--text-3)" }}>
          {t("version")}: {info?.version || "1.0.0"}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          {features.map((f) => <span key={f.key} className="badge">{f.label}</span>)}
        </div>
      </div>

      <div className="glass card" style={{ marginTop: "1rem" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <IconSpark style={{ width: 18, height: 18, color: "var(--violet)" }} />{t("ai")}
        </h3>
        {aiConfigured === false ? (
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{t("aiNotConfigured")}</p>
        ) : aiConfigured ? (
          <p style={{ fontSize: "var(--text-sm)", color: "var(--success)" }}>✓ {t("aiTitle")}</p>
        ) : null}
      </div>

      <div className="glass card" style={{ marginTop: "1rem" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <IconPhone style={{ width: 18, height: 18, color: "var(--cyan)" }} />{t("calls")}
        </h3>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>
          WebRTC (STUN{`/`}TURN) — {t("callUnavailable")}
        </p>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--text-3)" }}>
          TURN: coturn + REST API. <IconAlert style={{ width: 12, height: 12, verticalAlign: "-2px" }} /> docs/DEPLOYMENT.md
        </p>
      </div>

      <p style={{ textAlign: "center", marginTop: "1.5rem" }}>
        <Link to="/settings">{t("settings")}</Link>
      </p>
    </div>
  );
}
