import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { EmptyState, Spinner, ConfirmDialog } from "../components/UI";
import { IconDoc, IconPlus, IconTrash, IconEdit } from "../components/Icons";
import { formatDateTime } from "../i18n";

export default function Documents() {
  const { t, locale, toast, tError } = useApp();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState(null);
  const [openId, setOpenId] = useState(params.get("d") || null);
  const [doc, setDoc] = useState(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const leaveToRef = useRef(null);

  const loadList = useCallback(() => {
    api.get("/documents").then((d) => setItems(d.items)).catch((e) => toast(tError(e), "error"));
  }, [toast, tError]);
  useEffect(() => { loadList(); }, [loadList]);

  // load the open document
  useEffect(() => {
    if (!openId) { setDoc(null); return; }
    api.get(`/documents/${openId}`)
      .then((d) => { setDoc(d); setTitle(d.title); setContent(d.content); setDirty(false); })
      .catch((e) => { toast(tError(e), "error"); setOpenId(null); });
  }, [openId, toast, tError]);

  // protect unsaved changes: browser close / reload
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const guard = (fn) => {
    if (dirty) { leaveToRef.current = fn; setConfirmLeave(true); }
    else fn();
  };

  const newDoc = () => guard(async () => {
    try {
      const d = await api.post("/documents", { title: t("newDocument"), content: "" });
      loadList();
      setOpenId(d.id);
      setParams({ d: d.id });
    } catch (e) { toast(tError(e), "error"); }
  });

  const save = async () => {
    if (!doc || saving) return;
    setSaving(true);
    try {
      const d = await api.patch(`/documents/${doc.id}`, { title, content });
      setDoc(d);
      setDirty(false);
      loadList();
      toast(t("saved"), "success");
    } catch (e) {
      toast(t("saveFailed") + " — " + tError(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.del(`/documents/${deleting.id}`);
      if (openId === deleting.id) { setOpenId(null); setParams({}); }
      loadList();
    } catch (e) { toast(tError(e), "error"); }
  };

  const openDoc = (id) => guard(() => { setOpenId(id); setParams({ d: id }); });

  return (
    <div style={{ display: "grid", gridTemplateColumns: doc ? "280px 1fr" : "1fr", gap: "1rem" }}>
      {!doc && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2 style={{ margin: 0 }}>{t("documents")}</h2>
            <button className="btn btn-primary btn-sm" onClick={newDoc}><IconPlus />{t("newDocument")}</button>
          </div>
          <div className="glass">
            {items === null ? (
              <div style={{ display: "grid", placeItems: "center", padding: "2.5rem" }}><Spinner /></div>
            ) : items.length === 0 ? (
              <EmptyState icon={<IconDoc />} text={t("noDocuments")}
                           action={<button className="btn btn-ghost btn-sm" onClick={newDoc}>{t("newDocument")}</button>} />
            ) : items.map((d) => (
              <div key={d.id} className="conv-item" style={{ cursor: "default" }}>
                <div className="avatar"><IconDoc style={{ width: 18, height: 18 }} /></div>
                <div style={{ flex: 1, minWidth: 0 }} onClick={() => openDoc(d.id)} role="button" tabIndex={0}
                     onKeyDown={(e) => e.key === "Enter" && openDoc(d.id)}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-3)" }}>
                    {t("lastEdited")}: {formatDateTime(d.updated_at, locale)}
                  </div>
                </div>
                <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={() => setDeleting(d)} title={t("delete")}>
                  <IconTrash style={{ width: 16, height: 16 }} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {doc && (
        <div className="glass card" style={{ display: "flex", flexDirection: "column", gap: "0.8rem", alignSelf: "start", width: "100%" }}>
          <div style={{ display: "flex", gap: "0.7rem", alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => guard(() => { setOpenId(null); setParams({}); })}>
              ‹ {t("documents")}
            </button>
            <input className="input" style={{ flex: 1, minWidth: "160px" }} value={title} maxLength={200}
                   onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
                   aria-label={t("docTitle")} />
            {dirty && <span className="badge badge-violet">{t("unsavedChanges")}</span>}
            <button className="btn btn-primary btn-sm" onClick={save} disabled={!dirty || saving}>
              {saving ? t("loading") : t("save")}
            </button>
          </div>
          <textarea className="textarea" style={{ minHeight: "55vh", fontFamily: "ui-monospace, monospace", direction: "ltr", textAlign: "start" }}
                    value={content} onChange={(e) => { setContent(e.target.value); setDirty(true); }}
                    aria-label={t("docContent")} spellCheck={false} />
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-3)", display: "flex", justifyContent: "space-between" }}>
            <span>{t("lastEdited")}: {formatDateTime(doc.updated_at, locale)}</span>
            <span>{content.length} chars</span>
          </div>
        </div>
      )}

      {deleting && (
        <ConfirmDialog title={t("confirmDelete")} message={`${t("confirmDelete")} (${deleting.title})`}
                       onConfirm={remove} onClose={() => setDeleting(null)} />
      )}

      {confirmLeave && (
        <ConfirmDialog title={t("unsavedChanges")} message={t("unsavedWarning")} danger={false}
                       confirmLabel={t("yes")}
                       onConfirm={() => { setConfirmLeave(false); leaveToRef.current?.(); }}
                       onClose={() => setConfirmLeave(false)} />
      )}
    </div>
  );
}
