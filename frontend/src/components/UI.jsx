/* Shared UI primitives: Modal, EmptyState, Spinner, Toasts, ConfirmDialog. */
import React from "react";
import { useApp } from "../context/AppContext";
import { IconX, IconAlert } from "./Icons";

export function Modal({ title, onClose, children, wide }) {
  const { t } = useApp();
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}
         onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={wide ? { width: "min(96vw, 780px)" } : undefined}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label={t("close")}>
            <IconX />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, text, action }) {
  return (
    <div className="empty-state">
      {icon}
      <p style={{ margin: 0 }}>{text}</p>
      {action}
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="loading" />;
}

export function Toasts() {
  const { toasts } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="toast-zone">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>
      ))}
    </div>
  );
}

export function ConfirmDialog({ title, message, onConfirm, onClose, confirmLabel, danger = true }) {
  const { t } = useApp();
  return (
    <Modal title={title} onClose={onClose}>
      <p style={{ marginTop: 0 }}>{message}</p>
      <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end" }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>{t("cancel")}</button>
        <button className={`btn ${danger ? "btn-danger" : "btn-primary"} btn-sm`}
                onClick={() => { onConfirm(); onClose(); }}>
          {confirmLabel || t("delete")}
        </button>
      </div>
    </Modal>
  );
}

export function ErrorNote({ error }) {
  const { tError } = useApp();
  if (!error) return null;
  return <p className="field-error">{tError(error)}</p>;
}

export function EmptyIcon() {
  return <IconAlert />;
}
