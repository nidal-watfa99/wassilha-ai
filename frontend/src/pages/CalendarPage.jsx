import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Modal, EmptyState, Spinner, ConfirmDialog } from "../components/UI";
import { IconCalendar, IconPlus, IconTrash } from "../components/Icons";
import { formatDateTime } from "../i18n";

const EMPTY = { title: "", notes: "", start_at: "", end_at: "" };

export default function CalendarPage() {
  const { t, locale, toast, tError } = useApp();
  const [items, setItems] = useState(null);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(() => {
    api.get("/events").then((d) => setItems(d.items)).catch((e) => toast(tError(e), "error"));
  }, [toast, tError]);
  useEffect(() => { load(); }, [load]);

  const monthLabel = useMemo(() => {
    const d = new Date(cursor.y, cursor.m, 1);
    try {
      return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(d);
    } catch { return d.toDateString(); }
  }, [cursor, locale]);

  // build a 6x7 grid for the visible month
  const grid = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const startPad = (first.getDay() + 6) % 7; // Monday-first
    const days = [];
    const start = new Date(cursor.y, cursor.m, 1 - startPad);
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  }, [cursor]);

  const eventsOn = (day) => {
    if (!items) return [];
    return items.filter((ev) => {
      const d = new Date(ev.start_at.endsWith("Z") ? ev.start_at : ev.start_at + "Z");
      return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/events", {
        title: form.title, notes: form.notes,
        start_at: new Date(form.start_at).toISOString(),
        end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
      });
      setAdding(false);
      load();
    } catch (err) { toast(tError(err), "error"); }
  };

  const remove = async () => {
    try { await api.del(`/events/${deleting.id}`); load(); }
    catch (err) { toast(tError(err), "error"); }
  };

  const shift = (delta) => setCursor((c) => {
    const d = new Date(c.y, c.m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const today = new Date();
  const weekdayHeader = useMemo(() => {
    // Monday-first labels
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
    return [1, 2, 3, 4, 5, 6, 0].map((dow) => {
      const d = new Date(2024, 0, 1 + dow); // 2024-01-01 is a Monday
      try { return fmt.format(d); } catch { return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][dow]; }
    });
  }, [locale]);

  return (
    <div>
      <div style={{ display: "flex", gap: "0.7rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <button className="icon-btn" onClick={() => shift(-1)} aria-label={t("prevMonth")}>‹</button>
        <h2 style={{ margin: 0, minWidth: "180px", textAlign: "center" }}>{monthLabel}</h2>
        <button className="icon-btn" onClick={() => shift(1)} aria-label={t("nextMonth")}>›</button>
        <div style={{ flex: 1 }}></div>
        <button className="btn btn-primary" onClick={() => { setAdding(true); setForm(EMPTY); }}>
          <IconPlus />{t("newEvent")}
        </button>
      </div>

      <div className="glass card" style={{ overflowX: "auto" }}>
        {items === null ? <Spinner /> : (
          <div style={{ minWidth: "640px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", marginBottom: "4px" }}>
              {weekdayHeader.map((w, i) => (
                <div key={i} style={{ textAlign: "center", fontSize: "var(--text-xs)", color: "var(--text-3)", fontWeight: 600 }}>{w}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }}>
              {grid.map((day, i) => {
                const isToday = day.toDateString() === today.toDateString();
                const inMonth = day.getMonth() === cursor.m;
                const evs = eventsOn(day);
                return (
                  <div key={i} style={{
                    minHeight: "72px", borderRadius: "var(--radius-sm)",
                    background: isToday ? "rgba(54,139,255,0.12)" : "rgba(10,16,26,0.5)",
                    border: `1px solid ${isToday ? "rgba(105,213,255,0.4)" : "var(--border)"}`,
                    padding: "0.35rem", opacity: inMonth ? 1 : 0.35,
                  }}>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-2)", marginBottom: "0.2rem" }}>{day.getDate()}</div>
                    {evs.map((ev) => (
                      <button key={ev.id} onClick={() => setDeleting(ev)}
                              style={{
                                display: "block", width: "100%", textAlign: "start",
                                fontSize: "0.68rem", padding: "0.15rem 0.3rem", marginBottom: "2px",
                                borderRadius: "6px", border: "1px solid rgba(105,213,255,.3)",
                                background: "rgba(54,139,255,.15)", color: "var(--cyan)",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                cursor: "pointer",
                              }} title={ev.title}>
                        {ev.title}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {adding && (
        <Modal title={t("newEvent")} onClose={() => setAdding(false)}>
          <form onSubmit={submit}>
            <div className="field">
              <label>{t("taskTitle")} *</label>
              <input className="input" required maxLength={200} value={form.title}
                     onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="field">
              <label>{t("startAt")} *</label>
              <input className="input" type="datetime-local" required value={form.start_at}
                     onChange={(e) => setForm({ ...form, start_at: e.target.value })} />
            </div>
            <div className="field">
              <label>{t("endAt")} ({t("optional")})</label>
              <input className="input" type="datetime-local" value={form.end_at}
                     onChange={(e) => setForm({ ...form, end_at: e.target.value })} />
            </div>
            <div className="field">
              <label>{t("notes")} ({t("optional")})</label>
              <textarea className="textarea" value={form.notes} maxLength={5000}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>{t("cancel")}</button>
              <button className="btn btn-primary btn-sm">{t("save")}</button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal title={deleting.title} onClose={() => setDeleting(null)}>
          <p style={{ marginTop: 0 }}>
            {formatDateTime(deleting.start_at, locale)}
            {deleting.end_at ? ` → ${formatDateTime(deleting.end_at, locale)}` : ""}
          </p>
          {deleting.notes && <p style={{ color: "var(--text-2)" }}>{deleting.notes}</p>}
          <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setDeleting(null)}>{t("close")}</button>
            <button className="btn btn-danger btn-sm" onClick={() => { remove(); setDeleting(null); }}>
              <IconTrash style={{ width: 14, height: 14 }} />{t("delete")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
