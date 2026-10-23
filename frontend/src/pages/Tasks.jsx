import React, { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Modal, EmptyState, Spinner, ConfirmDialog } from "../components/UI";
import { IconSquare, IconPlus, IconEdit, IconTrash } from "../components/Icons";
import { formatDateTime } from "../i18n";

const EMPTY = { title: "", notes: "", status: "todo", priority: "medium", due_date: "" };

// UTC ISO -> value for <input type="datetime-local"> in the user's timezone
const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  if (isNaN(d)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function Tasks() {
  const { t, locale, toast, tError } = useApp();
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(() => {
    const qs = filter ? `?status=${filter}` : "";
    api.get(`/tasks${qs}`).then((d) => setItems(d.items)).catch((e) => toast(tError(e), "error"));
  }, [filter, toast, tError]);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        title: form.title, notes: form.notes, status: form.status, priority: form.priority,
        due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
      };
      if (editing === "new") await api.post("/tasks", payload);
      else await api.patch(`/tasks/${editing.id}`, payload);
      setEditing(null);
      load();
    } catch (err) { toast(tError(err), "error"); }
  };

  const toggleDone = async (task) => {
    try {
      await api.patch(`/tasks/${task.id}`, { status: task.status === "done" ? "todo" : "done" });
      load();
    } catch (err) { toast(tError(err), "error"); }
  };

  const remove = async () => {
    try {
      await api.del(`/tasks/${deleting.id}`);
      load();
    } catch (err) { toast(tError(err), "error"); }
  };

  const now = new Date();
  const badge = (task) => {
    if (task.status === "done") return <span className="badge badge-green">{t("status_done")}</span>;
    if (task.status === "doing") return <span className="badge badge-blue">{t("status_doing")}</span>;
    if (task.due_date && new Date(task.due_date + "Z") < now) return <span className="badge badge-red">{t("overdue")}</span>;
    return <span className="badge">{t("status_todo")}</span>;
  };
  const prioBadge = (p) => (
    <span className={`badge ${p === "high" ? "badge-red" : p === "medium" ? "badge-blue" : ""}`}>
      {t(`priority_${p}`)}
    </span>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: "0.7rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <select className="select" style={{ width: "auto" }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">{t("all")}</option>
          <option value="todo">{t("status_todo")}</option>
          <option value="doing">{t("status_doing")}</option>
          <option value="done">{t("status_done")}</option>
        </select>
        <button className="btn btn-primary" onClick={() => { setEditing("new"); setForm(EMPTY); }}>
          <IconPlus />{t("newTask")}
        </button>
      </div>

      <div className="glass">
        {items === null ? (
          <div style={{ display: "grid", placeItems: "center", padding: "2.5rem" }}><Spinner /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={<IconSquare />} text={t("noTasks")}
                       action={<button className="btn btn-ghost btn-sm" onClick={() => { setEditing("new"); setForm(EMPTY); }}>{t("addFirstTask")}</button>} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>{t("taskTitle")}</th>
                  <th>{t("status")}</th>
                  <th>{t("priority")}</th>
                  <th className="hide-sm">{t("dueDate")}</th>
                  <th style={{ width: 1 }}>{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <input type="checkbox" checked={task.status === "done"} onChange={() => toggleDone(task)}
                             aria-label={t("status_done")} style={{ width: 18, height: 18, accentColor: "var(--blue)" }} />
                    </td>
                    <td style={{ textDecoration: task.status === "done" ? "line-through" : "none", color: task.status === "done" ? "var(--text-3)" : "var(--text)", fontWeight: 600 }}>
                      {task.title}
                    </td>
                    <td>{badge(task)}</td>
                    <td>{prioBadge(task.priority)}</td>
                    <td className="hide-sm" style={{ whiteSpace: "nowrap" }}>
                      {task.due_date ? formatDateTime(task.due_date, locale) : "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.3rem" }}>
                        <button className="icon-btn" style={{ width: 36, height: 36 }} title={t("editContact") || t("save")}
                                onClick={() => { setEditing(task); setForm({ ...EMPTY, ...task, due_date: toLocalInput(task.due_date) }); }}>
                          <IconEdit style={{ width: 16, height: 16 }} />
                        </button>
                        <button className="icon-btn" style={{ width: 36, height: 36 }} title={t("delete")}
                                onClick={() => setDeleting(task)}>
                          <IconTrash style={{ width: 16, height: 16 }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <Modal title={editing === "new" ? t("newTask") : t("taskTitle")} onClose={() => setEditing(null)}>
          <form onSubmit={submit}>
            <div className="field">
              <label>{t("taskTitle")} *</label>
              <input className="input" required maxLength={200} value={form.title}
                     onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="field">
              <label>{t("status")}</label>
              <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="todo">{t("status_todo")}</option>
                <option value="doing">{t("status_doing")}</option>
                <option value="done">{t("status_done")}</option>
              </select>
            </div>
            <div className="field">
              <label>{t("priority")}</label>
              <select className="select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="low">{t("priority_low")}</option>
                <option value="medium">{t("priority_medium")}</option>
                <option value="high">{t("priority_high")}</option>
              </select>
            </div>
            <div className="field">
              <label>{t("dueDate")} ({t("optional")})</label>
              <input className="input" type="datetime-local" value={form.due_date}
                     onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div className="field">
              <label>{t("notes")} ({t("optional")})</label>
              <textarea className="textarea" value={form.notes} maxLength={5000}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>{t("cancel")}</button>
              <button className="btn btn-primary btn-sm">{t("save")}</button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog title={t("confirmDelete")} message={`${t("confirmDelete")} (${deleting.title})`}
                       onConfirm={remove} onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}
