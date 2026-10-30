/* App layout: sidebar (desktop) + mobile tabs, header, and the call overlay. */
import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useRealtime } from "../context/RealtimeContext";
import { useCall } from "../context/CallContext";
import {
  IconHome, IconUsers, IconChat, IconPhone, IconVideo, IconSpark, IconSquare,
  IconCalendar, IconDoc, IconChart, IconBox, IconCalc, IconGear, IconMenu,
  IconLogout, IconSearch, IconMic, IconStop, IconMap, IconBell, IconId, IconInvoice,
} from "./Icons";
import { useBiz, isOn, getDue, getLow } from "../services/biz";
import { getExpiring } from "../services/realestate";
import { SetupWizard } from "../pages/Business";
import { LOCALES } from "../i18n";
import { LOCAL_MODE } from "../services/api";

const NAV = [
  { to: "/", key: "dashboard", Icon: IconHome, end: true },
  { to: "/contacts", key: "contacts", Icon: IconUsers },
  { to: "/messages", key: "messages", Icon: IconChat },
  { to: "/ai", key: "ai", Icon: IconSpark },
  { to: "/tasks", key: "tasks", Icon: IconSquare },
  { to: "/calendar", key: "calendar", Icon: IconCalendar },
  { to: "/documents", key: "documents", Icon: IconDoc },
  { to: "/insights", key: "insights", Icon: IconChart },
  { to: "/products", key: "products", Icon: IconBox },
  { to: "/calculator", key: "calculator", Icon: IconCalc },
  { to: "/ai-models", key: "aimodels", Icon: IconSpark },
  { to: "/restaurant", key: "restaurant", Icon: IconBox },
  { to: "/purchases", key: "purchases", Icon: IconBox },
  { to: "/hotel", key: "hotel", Icon: IconBox },
  { to: "/properties", key: "properties", Icon: IconBox },
  { to: "/expenses", key: "expenses", Icon: IconChart },
  { to: "/reports", key: "reports", Icon: IconChart },
  { to: "/catalog", key: "catalog", Icon: IconBox },
  { to: "/inventory", key: "inventory", Icon: IconBox },
  { to: "/employees", key: "employees", Icon: IconId },
  { to: "/invoices", key: "invoices", Icon: IconInvoice },
  { to: "/map", key: "map", Icon: IconMap },
  { to: "/business", key: "business", Icon: IconGear },
  { to: "/settings", key: "settings", Icon: IconGear },
];

const MOBILE_NAV = [
  { to: "/", key: "dashboard", Icon: IconHome, end: true },
  { to: "/messages", key: "messages", Icon: IconChat },
  { to: "/contacts", key: "contacts", Icon: IconUsers },
  { to: "/tasks", key: "tasks", Icon: IconSquare },
  { to: "/ai", key: "ai", Icon: IconSpark },
  { to: "/settings", key: "settings", Icon: IconGear },
];

export function Layout() {
  const { t, user, logout } = useApp();
  const rt = useRealtime();
  const { call } = useCall();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const biz = useBiz();
  const [wz, setWz] = useState(true);
  const due = getDue(biz);
  const low = getLow(biz);
  const lapsing = getExpiring(biz);
  const alerts = due.length + low.length + lapsing.length;

  // browser notification for due invoices (once per day, while the app is open)
  useEffect(() => {
    const check = () => {
      if (!alerts || !("Notification" in window) || Notification.permission !== "granted") return;
      const day = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem("wassilha_notified") === day) return;
      localStorage.setItem("wassilha_notified", day);
      new Notification(t("inv_notifTitle"), { body: `${due.length} ${t("inv_notifBody")} · ${low.length} ${t("inv_lowBody")}` });
    };
    check();
    const id = setInterval(check, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, [alerts, t]);

  // close the mobile sidebar on navigation
  useEffect(() => setSidebarOpen(false), [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <img className="brand-logo" src={`${import.meta.env.BASE_URL}logo.svg`} alt="" aria-hidden="true" />
          <div>
            <div className="brand-name silver-blue-text">{t("appName")}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-3)" }}>{t("tagline")}</div>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label={t("appName")}>
          {NAV.filter((n) => isOn(biz, n.key)).map(({ to, key, Icon, end }) => (
            <NavLink key={to} to={to} end={end}
                     className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <Icon />
              <span>{biz.terms[key] || t(key)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.25rem 0.5rem" }}>
            <div className="avatar" style={{ width: 36, height: 36, fontSize: "0.8rem" }}>
              {(user?.name || "?").slice(0, 1).toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.name}
              </div>
              <div style={{ fontSize: "0.68rem", color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.email}
              </div>
            </div>
            <button className="icon-btn" style={{ width: 38, height: 38 }} onClick={handleLogout}
                    aria-label={t("logout")} title={t("logout")}>
              <IconLogout />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="main-header">
          <button className="icon-btn menu-toggle" onClick={() => setSidebarOpen((v) => !v)} aria-label="menu">
            <IconMenu />
          </button>
          <div className="header-brand">
            <img className="brand-logo" src={`${import.meta.env.BASE_URL}logo.svg`} alt="" aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
              <div className="brand-name silver-blue-text">{t("appName")}</div>
              <h1 className="header-page">{t(location.state?.pageTitle || currentTitle(location.pathname, t))}</h1>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {alerts > 0 && (
              <button className="icon-btn" style={{ position: "relative" }} onClick={() => navigate(due.length ? "/invoices" : low.length ? "/inventory" : "/properties")} aria-label={t("inv_dueTitle")} title={t("inv_dueTitle")}>
                <IconBell />
                <span className="badge badge-red" style={{ position: "absolute", top: -4, insetInlineEnd: -4, padding: "0 5px", fontSize: "0.65rem" }}>{alerts}</span>
              </button>
            )}
            <LangSwitch />
          </div>
        </header>
        <main className="page">
          {LOCAL_MODE && (
            <div className="glass" role="note"
                 style={{ padding: "0.55rem 0.9rem", marginBottom: "0.9rem", fontSize: "var(--text-xs)", color: "var(--text-2)" }}>
              {t("localModeBanner")}
            </div>
          )}
          <Outlet />
        </main>
        <nav className="mobile-tabs" aria-label="primary">
          {MOBILE_NAV.map(({ to, key, Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "active" : "")}>
              <Icon />
              <span>{t(key)}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {!biz.configured && wz && <SetupWizard onClose={() => setWz(false)} />}
      {call.status !== "idle" && <CallOverlay />}
    </div>
  );
}

function currentTitle(pathname, t) {
  const found = NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)));
  return found ? found.key : "dashboard";
}

const LANG_NAMES = { ar: "العربية", en: "English", es: "Español" };
export function LangSwitch() {
  const { locale, setLocale } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const out = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", out); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", out); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="lang-menu" ref={ref}>
      <button type="button" className="lang-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span aria-hidden="true">🌐</span><span>{LANG_NAMES[locale] || locale}</span><span aria-hidden="true" style={{ fontSize: "0.7em" }}>▾</span>
      </button>
      {open && (
        <ul className="lang-pop" role="listbox">
          {Object.keys(LOCALES).map((c) => (
            <li key={c}><button type="button" role="option" aria-selected={locale === c} onClick={() => { setLocale(c); setOpen(false); }}>
              <span>{LANG_NAMES[c] || c}</span>{locale === c && <span aria-hidden="true">✓</span>}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* Full-screen call UI: local + remote video, status, and device controls. */
function CallOverlay() {
  const { t } = useApp();
  const { call, remoteStream, micOn, camOn, endCall, acceptCall, declineCall, toggleMic, toggleCam, localStreamRef } = useCall();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // attach the local stream preview
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.play().catch(() => {});
    }
  }, [call.status, localStreamRef]);

  // attach the remote stream when it arrives
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [remoteStream]);

  const statusText = {
    ringing: `${t("incomingCall")} — ${call.peerName || ""}`,
    calling: `${t("calling")} ${call.peerName || ""}…`,
    connecting: t("calling"),
    connected: t("connected"),
    ended: call.text || t("ended"),
  }[call.status] || "";

  return (
    <div className="call-overlay">
      <video ref={remoteVideoRef} className="call-video" autoPlay playsInline />
      <video ref={localVideoRef} className="call-video" style={{ width: "min(40vw, 240px)", position: "absolute", insetInlineEnd: "1rem", top: "1rem", border: "1px solid var(--border-strong)" }} autoPlay muted playsInline />
      <div className="call-status">{statusText}</div>
      <div className="call-controls">
        {call.status === "ringing" ? (
          <>
            <button className="btn btn-primary" onClick={acceptCall}><IconPhone />{t("accept")}</button>
            <button className="btn btn-danger" onClick={declineCall}><IconX />{t("decline")}</button>
          </>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={toggleMic}>
              {micOn ? <IconMic /> : <IconMic style={{ opacity: 0.4 }} />}
              {micOn ? t("mute") : t("unmute")}
            </button>
            <button className="btn btn-ghost" onClick={toggleCam}>
              <IconVideo style={{ opacity: camOn ? 1 : 0.4 }} />
              {camOn ? t("cameraOff") : t("cameraOn")}
            </button>
            <button className="btn btn-danger" onClick={endCall}>
              <IconPhone style={{ transform: "rotate(135deg)" }} />
              {t("endCall")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
