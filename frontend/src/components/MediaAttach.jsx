import React, { useRef } from "react";
import { useApp } from "../context/AppContext";
import { IconPlus, IconTrash } from "./Icons";
import MediaView from "./MediaView";
import { uid } from "../services/biz";
import { putMedia, getMedia, compressImage } from "../services/media";

/* Photos, videos, audio and files (PDF, sheets…) kept in the browser's large storage. `trash` collects removed ids; the parent deletes them on save. */
export default function MediaAttach({ media, onChange, trash }) {
  const { t, toast } = useApp();
  const fileRef = useRef(null);
  const add = async (e) => {
    const files = [...(e.target.files || [])]; e.target.value = "";
    const out = [];
    for (const file of files) {
      try {
        const k = file.type.split("/")[0], kind = ["image", "video", "audio"].includes(k) ? k : "file";
        if (file.size > (kind === "file" ? 20 : 60) * 1024 * 1024) { toast(t("cat_big"), "error"); continue; }
        const id = uid(); await putMedia(id, kind === "image" ? await compressImage(file) : file);
        out.push({ id, type: kind, name: file.name, at: new Date().toISOString() });
      } catch { toast(t("cat_mediaErr"), "error"); }
    }
    if (out.length) onChange([...media, ...out]);
  };
  const share = async (m) => {
    const blob = await getMedia(m.id); if (!blob) return;
    const file = new File([blob], m.name || "file", { type: blob.type });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); }
    } catch { /* cancelled */ }
  };
  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      {media.map((m) => (
        <div key={m.id} className="glass card" style={{ padding: "0.5rem", display: "grid", gap: "0.35rem" }}>
          {m.type === "file" ? <div style={{ fontSize: "var(--text-sm)" }}>📄 <bdi dir="ltr">{m.name}</bdi></div> : <MediaView id={m.id} type={m.type} style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 10 }} />}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.3rem" }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => share(m)}>↗ {t(m.type === "file" ? "mt_download" : "ct_share")}</button>
            <button type="button" className="icon-btn" aria-label={t("delete")} onClick={() => { trash.current.push(m.id); onChange(media.filter((x) => x.id !== m.id)); }}><IconTrash /></button></div>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: "start" }} onClick={() => fileRef.current.click()}><IconPlus />{t("ct_attach")}</button>
      <input ref={fileRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" multiple hidden onChange={add} />
    </div>
  );
}
