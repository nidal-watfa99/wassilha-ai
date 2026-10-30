import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { EmptyState, Spinner } from "../components/UI";
import { IconChat, IconSquare, IconDoc, IconUsers, IconSpark, IconCalendar } from "../components/Icons";
import { formatDateTime } from "../i18n";

const QUICK = [
  { to: "/messages", key: "messages", Icon: IconChat },
  { to: "/contacts", key: "contacts", Icon: IconUsers },
  { to: "/tasks", key: "tasks", Icon: IconSquare },
  { to: "/ai", key: "ai", Icon: IconSpark },
];

export default function Dashboard() {
  const { t, locale } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/dashboard").then(setData).catch(setError);
  }, []);

  if (error) return <EmptyState text={t("err_unknown")} />;
  if (!data) return <div style={{ display: "grid", placeItems: "center", padding: "3rem" }}><Spinner /></div>;

  const c = data.counts;
  const stats = [
    { label: t("contactsCount"), value: c.contacts, to: "/contacts" },
    { label: t("tasksOpen"), value: c.tasks_open, to: "/tasks" },
    { label: t("messagesSent"), value: c.messages_sent, to: "/messages" },
    { label: t("documentsCount"), value: c.documents, to: "/documents" },
    { label: t("tasksDone"), value: c.tasks_done, to: "/tasks" },
    { label: t("aiChats"), value: c.ai_conversations, to: "/ai" },
  ];

  return (
    <div>
      <div className="stat-grid">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="glass card stat-card card-hover" style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value silver-blue-text">{s.value}</span>
          </Link>
        ))}
      </div>

      <div className="section-title"><h2>{t("quickActions")}</h2></div>
      <div className="stat-grid">
        {QUICK.map(({ to, key, Icon }) => (
          <Link key={to} to={to} className="glass card stat-card card-hover" style={{ textDecoration: "none", color: "inherit", flexDirection: "row", alignItems: "center", gap: "0.8rem" }}>
            <div className="brand-orb" style={{ width: 42, height: 42 }}><Icon /></div>
            <div>
              <div style={{ fontWeight: 600 }}>{t(key)}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="section-title"><h2>{t("recentConversations")}</h2><Link to="/messages">{t("messages")}</Link></div>
      <div className="glass">
        {data.recent_conversations.length === 0 ? (
          <EmptyState icon={<IconChat />} text={t("noConversationsYet")}
                      action={<Link className="btn btn-ghost btn-sm" to="/messages">{t("startOne")}</Link>} />
        ) : (
          data.recent_conversations.map((conv) => (
            <Link key={conv.id} to={`/messages?c=${conv.id}`} className="conv-item" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="avatar">{(conv.title || "؟").slice(0, 1)}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {conv.title || t("messages")}
                </div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {conv.last_body}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      <div className="section-title"><h2>{t("upcomingEvents")}</h2><Link to="/calendar">{t("calendar")}</Link></div>
      <div className="glass card">
        {data.upcoming_events.length === 0 ? (
          <p style={{ margin: 0, color: "var(--text-2)" }}>{t("noUpcoming")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {data.upcoming_events.map((ev) => (
              <div key={ev.id} style={{ display: "flex", gap: "0.7rem", alignItems: "center" }}>
                <IconCalendar style={{ color: "var(--cyan)", flex: "none" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{ev.title}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{formatDateTime(ev.start_at, locale)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
