import React, { useEffect, useState } from "react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { EmptyState, Spinner } from "../components/UI";
import { IconChart } from "../components/Icons";
import { weekdayLabels } from "../i18n";

/* Simple accessible bar chart (no external chart library). */
function BarChart({ data, labels, color = "var(--blue)" }) {
  const max = Math.max(1, ...data);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", height: "160px", padding: "0.5rem 0" }} role="img">
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.35rem", height: "100%", justifyContent: "flex-end" }}>
          <div style={{
            width: "100%", maxWidth: "42px", borderRadius: "6px 6px 0 0",
            background: `linear-gradient(180deg, ${color}, rgba(54,139,255,.25))`,
            height: `${Math.max(3, (v / max) * 100)}%`,
            minHeight: v > 0 ? "6px" : "2px",
            transition: "height .4s var(--ease)",
          }} title={`${labels[i]}: ${v}`} />
          <span style={{ fontSize: "0.68rem", color: "var(--text-3)" }}>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

export default function Insights() {
  const { t, locale, toast, tError } = useApp();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/insights").then(setData).catch((e) => toast(tError(e), "error"));
  }, [toast, tError]);

  if (!data) return <div style={{ display: "grid", placeItems: "center", padding: "3rem" }}><Spinner /></div>;

  const hasAny = data.sample_sizes.tasks > 0 || data.messages.recent_count > 0 || data.sample_sizes.payments > 0;
  if (!hasAny) return <EmptyState icon={<IconChart />} text={t("noDataYet")} />;

  const dayLabels = weekdayLabels(locale);

  return (
    <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
      <div className="glass card">
        <h3>{t("tasksByStatus")}</h3>
        <BarChart
          data={[data.tasks.by_status.todo, data.tasks.by_status.doing, data.tasks.by_status.done]}
          labels={[t("status_todo"), t("status_doing"), t("status_done")]}
          color="var(--cyan)" />
      </div>
      <div className="glass card">
        <h3>{t("tasksByPriority")}</h3>
        <BarChart
          data={[data.tasks.by_priority.low, data.tasks.by_priority.medium, data.tasks.by_priority.high]}
          labels={[t("priority_low"), t("priority_medium"), t("priority_high")]}
          color="var(--violet)" />
      </div>
      <div className="glass card">
        <h3>{t("messagesByWeekday")}</h3>
        <BarChart data={data.messages.per_weekday} labels={dayLabels} />
      </div>
      {Object.entries(data.payments_total).length > 0 && (
        <div className="glass card">
          <h3>{t("paymentsTotal")}</h3>
          {Object.entries(data.payments_total).map(([cur, amt]) => (
            <div key={cur} style={{ display: "flex", justifyContent: "space-between", padding: "0.3rem 0" }}>
              <span style={{ color: "var(--text-2)" }}>{cur}</span>
              <span className="silver-blue-text" style={{ fontWeight: 700, fontFamily: "var(--font-display)" }}>{amt.toLocaleString(locale)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
