import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { Modal } from "../components/UI";
import { IconPlus, IconTrash } from "../components/Icons";
import { F, Grid, Sec, useForm } from "../components/Form";
import Summary from "../components/Summary";
import MediaView from "../components/MediaView";
import { useBiz, setProfile, upsert, uid, nextNo, todayStr, finOf, CONTACT_TYPES, fmt } from "../services/biz";
import { putMedia, getMedia, delMedia, compressImage } from "../services/media";
import { waPhone } from "../services/phone";

const BLANK = { type: "customer", profession: "", nationality: "", address: "", city: "", bizNature: "", taxNo: "", creditLimit: "", notes2: "", media: [] };

export default function ContactProfile({ contact, onClose }) {
  const { t, toast } = useApp();
  const biz = useBiz(), nav = useNavigate();
  const [f, set, setF] = useForm({ ...BLANK, ...(biz.profiles[contact.id] || {}) });
  const [recording, setRecording] = useState(false);
  const rec = useRef(null), trash = useRef([]), fileRef = useRef(null);
  const fin = finOf(biz, contact.name);

  const add = (m) => setF((p) => ({ ...p, media: [...p.media, { ...m, at: new Date().toISOString() }] }));
  const addFiles = async (e) => {
    const files = [...(e.target.files || [])]; e.target.value = "";
    for (const file of files) {
      try {
        const k = file.type.split("/")[0];
        if (!["image", "video", "audio"].includes(k)) continue;
        if (k !== "image" && file.size > 60 * 1024 * 1024) { toast(t("cat_big"), "error"); continue; }
        const id = uid(); await putMedia(id, k === "image" ? await compressImage(file) : file);
        add({ id, type: k, name: file.name });
      } catch { toast(t("cat_mediaErr"), "error"); }
    }
  };
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream), chunks = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((x) => x.stop());
        const id = uid(); await putMedia(id, new Blob(chunks, { type: mr.mimeType || "audio/webm" })); add({ id, type: "audio", name: "voice" });
      };
      mr.start(); rec.current = mr; setRecording(true);
    } catch { toast(t("ct_micDenied"), "error"); }
  };
  const stop = () => { rec.current?.stop(); setRecording(false); };
  const share = async (m) => {
    const blob = await getMedia(m.id); if (!blob) return;
    const ext = (blob.type.split("/")[1] || "bin").split(";")[0];
    const file = new File([blob], `${contact.name}-${m.type}.${ext}`, { type: blob.type });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: contact.name });
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); toast(t("ct_noShare"), "success"); }
    } catch { /* user cancelled */ }
  };
  const drop = (m) => { trash.current.push(m.id); setF((p) => ({ ...p, media: p.media.filter((x) => x.id !== m.id) })); };
  const save = (e) => { e.preventDefault(); trash.current.forEach(delMedia); setProfile(contact.id, f); onClose(); };
  const newInvoice = () => {
    setProfile(contact.id, f);
    upsert("invoices", { id: uid(), no: nextNo("invoice"), type: "invoice", customer: contact.name, issueDate: todayStr(), dueDate: "", currency: biz.currency, discount: 0, tax: biz.taxRate, notes: "", paidAmount: "", status: "draft", items: [{ desc: "", qty: 1, price: "", unit: "" }] });
    nav("/invoices");
  };

  return (
    <Modal wide title={contact.name} onClose={onClose}>
      <form onSubmit={save}>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
          {contact.phone && <a className="btn btn-ghost btn-sm" href={`tel:${contact.phone}`}>📞 {contact.phone}</a>}
          {contact.phone && <a className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer" href={`https://wa.me/${waPhone(contact.phone)}`}>WhatsApp</a>}
          {contact.email && <a className="btn btn-ghost btn-sm" href={`mailto:${contact.email}`}>✉ {contact.email}</a>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={newInvoice}><IconPlus />{t("inv_invoice")}</button>
        </div>
        <Sec>{t("ct_sec_account")}</Sec>
        <Summary cur={biz.currency} rows={[{ label: `${t("inv_invoice")} (${fin.n})`, value: fin.total, sub: true }, { label: t("inv_paidAmt"), value: fin.paid, tone: "minus" }]} total={{ label: t("inv_left"), value: fin.left }} />
        {fin.list.slice(0, 4).map((x) => <div key={x.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", padding: "0.3rem 0", color: "var(--text-2)" }}><bdi dir="ltr">{x.no} · {x.issueDate}</bdi><span>{t("inv_" + x.status)}</span></div>)}
        <Sec>{t("ct_sec_info")}</Sec>
        <Grid>
          <F label={t("ct_type")}><select className="select" value={f.type} onChange={set("type")}>{CONTACT_TYPES.map((k) => <option key={k} value={k}>{t("ct_t_" + k)}</option>)}</select></F>
          <F label={t("ct_profession")}><input className="input" value={f.profession} onChange={set("profession")} /></F>
          <F label={t("emp_nation")}><input className="input" value={f.nationality} onChange={set("nationality")} /></F>
          <F label={t("ct_bizNature")}><input className="input" value={f.bizNature} onChange={set("bizNature")} /></F>
          <F label={t("ct_city")}><input className="input" value={f.city} onChange={set("city")} /></F>
          <F label={t("ct_taxNo")}><input className="input" value={f.taxNo} onChange={set("taxNo")} dir="ltr" /></F>
          <F label={t("b_address")} wide><input className="input" value={f.address} onChange={set("address")} /></F>
          <F label={t("ct_credit") + ` (${biz.currency})`}><input className="input" type="number" min="0" step="any" value={f.creditLimit} onChange={set("creditLimit")} dir="ltr" /></F>
        </Grid>
        {Number(f.creditLimit) > 0 && fin.left > Number(f.creditLimit) && <div style={{ color: "#ff8a9b", fontSize: "var(--text-sm)" }}>⚠ {t("ct_overCredit")}</div>}
        <F label={t("emp_notes")}><textarea className="textarea" rows={2} value={f.notes2} onChange={set("notes2")} /></F>
        <Sec>{t("ct_sec_media")}</Sec>
        <div style={{ display: "grid", gap: "0.6rem" }}>
          {f.media.map((m) => (
            <div key={m.id} className="glass card" style={{ padding: "0.5rem", display: "grid", gap: "0.4rem" }}>
              <MediaView id={m.id} type={m.type} style={{ width: "100%", maxHeight: 240, objectFit: "cover", borderRadius: 10 }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-xs)", color: "var(--text-3)" }}>
                <bdi dir="ltr">{new Date(m.at).toLocaleString()}</bdi>
                <span><button type="button" className="btn btn-ghost btn-sm" onClick={() => share(m)}>↗ {t("ct_share")}</button>
                  <button type="button" className="icon-btn" aria-label={t("delete")} onClick={() => drop(m)}><IconTrash /></button></span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "0.5rem 0" }}>
          <button type="button" className={`btn btn-sm ${recording ? "btn-primary" : "btn-ghost"}`} onClick={recording ? stop : start}>{recording ? "⏹ " + t("ct_stop") : "🎙 " + t("ct_record")}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current.click()}><IconPlus />{t("ct_attach")}</button>
          <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" multiple hidden onChange={addFiles} />
        </div>
        <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end", marginTop: "0.6rem" }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>{t("cancel")}</button>
          <button className="btn btn-primary btn-sm">{t("save")}</button>
        </div>
      </form>
    </Modal>
  );
}
