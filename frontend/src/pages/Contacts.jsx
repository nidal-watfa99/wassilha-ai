import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Modal, EmptyState, Spinner, ConfirmDialog, ErrorNote } from "../components/UI";
import { IconUsers, IconSearch, IconPlus, IconEdit, IconTrash, IconChat } from "../components/Icons";
import { formatDateTime } from "../i18n";
import ContactProfile from "./ContactProfile";
import { useBiz, finOf, fmt, CONTACT_TYPES } from "../services/biz";

const EMPTY_FORM = { name: "", email: "", phone: "", company: "", notes: "" };

export default function Contacts() {
  const { t, locale, toast, tError } = useApp();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState(null);
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [busy, setBusy] = useState(false);
  const biz = useBiz();
  const [profile, setProfileOf] = useState(null), [typeF, setTypeF] = useState(""), [listening, setListening] = useState(false);
  const voice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return toast(t("ct_noVoice"), "error");
    const r = new SR(); r.lang = locale === "ar" ? "ar-SA" : locale === "es" ? "es-ES" : "en-US"; r.interimResults = false;
    r.onresult = (e) => setQInput(e.results[0][0].transcript); r.onend = () => setListening(false); r.onerror = () => { setListening(false); toast(t("ct_noVoice"), "error"); };
    setListening(true); r.start();
  };
  const seq = useRef(0);
  const fx = useRef({}); fx.current = { toast, tError };
  const [sort, setSort] = useState("name");
  const [editing, setEditing] = useState(null); // null | "new" | contact
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null); // opened contact detail
  const [detailConvs, setDetailConvs] = useState(null);

  const load = useCallback(() => {
    const n = ++seq.current;            // ignore answers to outdated searches
    setBusy(true); setError(null);
    api.get(`/contacts?q=${encodeURIComponent(q)}&sort=${sort}`)
      .then((d) => { if (n === seq.current) setItems(d.items); })
      .catch((e) => { if (n === seq.current) { setError(e); setItems((p) => p ?? []); fx.current.toast(fx.current.tError(e), "error"); } })
      .finally(() => { if (n === seq.current) setBusy(false); });
  }, [q, sort]);

  // short delay while typing: one request per pause, not one per letter
  useEffect(() => { const id = setTimeout(() => setQ(qInput.trim()), 300); return () => clearTimeout(id); }, [qInput]);

  useEffect(() => { load(); }, [load]);

  // deep link: /contacts?detail=<id>
  useEffect(() => {
    const id = params.get("detail");
    if (id && items) {
      const found = items.find((c) => c.id === id);
      if (found) openDetail(found);
    }
  }, [items, params]);

  const openDetail = async (contact) => {
    setDetail(contact);
    setDetailConvs(null);
    // communication history: conversations whose members include this email
    try {
      const [convs, msgs] = await Promise.all([
        api.get("/conversations"),
      ]);
      const related = convs.items.filter((c) =>
        c.members.some((m) => m.email === contact.email));
      setDetailConvs(related);
    } catch { setDetailConvs([]); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      if (editing === "new") {
        await api.post("/contacts", form);
      } else {
        await api.patch(`/contacts/${editing.id}`, form);
      }
      setEditing(null);
      load();
      toast(t("saved"), "success");
    } catch (err) {
      setError(err);
      toast(tError(err), "error");
    }
  };

  const remove = async (contact) => {
    try {
      await api.del(`/contacts/${contact.id}`);
      load();
      toast(t("saved"), "success");
    } catch (err) { toast(tError(err), "error"); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "0.7rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <form onSubmit={(e) => { e.preventDefault(); setQ(qInput.trim()); }} style={{ position: "relative", flex: 1, minWidth: "200px", display: "flex", gap: "0.4rem" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <IconSearch style={{ position: "absolute", insetInlineStart: "0.8rem", top: "0.9rem", width: 18, height: 18, color: "var(--text-3)" }} />
          <input className="input" style={{ paddingInlineStart: "2.4rem" }}
                 placeholder={t("searchContacts")} value={qInput} type="search" inputMode="search"
                 onChange={(e) => setQInput(e.target.value)} aria-label={t("searchContacts")} />
        </div>
        <button className="btn btn-ghost btn-sm" type="submit" aria-label={t("b_search")}>{busy ? "…" : "🔍"}</button>
        <button className={`btn btn-sm ${listening ? "btn-primary" : "btn-ghost"}`} type="button" onClick={voice} aria-label={t("ct_voice")}>🎙</button>
      </form>
        <select className="select" style={{ width: "auto" }} value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t("sort") || "sort"}>
          <option value="name">{t("name")}</option>
          <option value="created_at">{t("created")}</option>
          <option value="updated_at">{t("lastEdited")}</option>
        </select>
        <button className="btn btn-primary" onClick={() => { setEditing("new"); setForm(EMPTY_FORM); }}>
          <IconPlus />{t("newContact")}
        </button>
      </div>

      <select className="select" style={{ width: "auto", marginBottom: "0.7rem" }} value={typeF} onChange={(e) => setTypeF(e.target.value)}>
        <option value="">{t("map_filter")}</option>{CONTACT_TYPES.map((k) => <option key={k} value={k}>{t("ct_t_" + k)}</option>)}
      </select>
      {error && (
        <div className="glass card" style={{ borderColor: "rgba(255,107,129,.5)", marginBottom: "0.8rem", display: "flex", justifyContent: "space-between", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
          <span>{tError(error)}</span><button className="btn btn-ghost btn-sm" onClick={load}>{t("b_retry")}</button>
        </div>
      )}
      <div className="glass">
        {items === null ? (
          <div style={{ display: "grid", placeItems: "center", padding: "2.5rem" }}><Spinner /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={<IconUsers />} text={q ? t("searchContacts") : t("noContacts")}
                      action={q ? undefined : (
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditing("new"); setForm(EMPTY_FORM); }}>
                          {t("addFirstContact")}
                        </button>)} />
        ) : (
          <div style={{ display: "grid", gap: "0.7rem", padding: "0.7rem" }}>
            {items.filter((c) => !typeF || (biz.profiles[c.id]?.type || "customer") === typeF).map((c) => {
              const pf = biz.profiles[c.id], fin = finOf(biz, c.name);
              return (
                <div key={c.id} className="glass card" style={{ display: "grid", gap: "0.55rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "flex-start" }}>
                    <div>
                      <button style={{ all: "unset", cursor: "pointer", fontWeight: 700, fontSize: "1.05rem", color: "var(--cyan)" }} onClick={() => setProfileOf(c)}>{c.name}</button>
                      <div style={{ color: "var(--text-3)", fontSize: "var(--text-sm)" }}>{[c.company, pf?.profession].filter(Boolean).join(" · ")}</div>
                    </div>
                    <span className="badge badge-blue">{t("ct_t_" + (pf?.type || "customer"))}</span>
                  </div>
                  <div style={{ display: "flex", gap: "0.3rem 0.9rem", flexWrap: "wrap", fontSize: "var(--text-sm)", color: "var(--text-2)" }}>
                    {c.phone && <a href={`tel:${c.phone}`} dir="ltr" style={{ color: "inherit" }}>📞 {c.phone}</a>}
                    {c.email && <bdi dir="ltr">✉ {c.email}</bdi>}
                    {pf?.city && <span>📍 {pf.city}</span>}
                  </div>
                  {fin.n > 0 && <div className="mini3">{[[t("inv_total"), fin.total], [t("inv_paidAmt"), fin.paid], [t("inv_left"), fin.left]].map(([l, v], k) => <div key={k}><small>{l}</small><b dir="ltr" style={k === 2 && v > 0 ? { color: "var(--cyan)" } : undefined}>{fmt(v)}</b></div>)}</div>}
                  <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setProfileOf(c)}>{t("ct_profile")}</button>
                    <button className="icon-btn" title={t("messages")} aria-label={t("messages")} onClick={() => openDetail(c)}><IconChat style={{ width: 16, height: 16 }} /></button>
                    <button className="icon-btn" title={t("editContact")} onClick={() => { setEditing(c); setForm({ name: c.name, email: c.email, phone: c.phone, company: c.company, notes: c.notes }); }}><IconEdit style={{ width: 16, height: 16 }} /></button>
                    <button className="icon-btn" title={t("delete")} onClick={() => setDeleting(c)}><IconTrash style={{ width: 16, height: 16 }} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {profile && <ContactProfile contact={profile} onClose={() => setProfileOf(null)} />}

      {editing && (
        <Modal title={editing === "new" ? t("newContact") : t("editContact")} onClose={() => setEditing(null)}>
          <form onSubmit={submit}>
            <div className="field">
              <label>{t("name")} *</label>
              <input className="input" required maxLength={100} value={form.name}
                     onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>{t("email")} ({t("optional")})</label>
              <input className="input" type="email" value={form.email} dir="ltr" style={{ textAlign: "start" }}
                     onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
              <label>{t("phone")} ({t("optional")})</label>
              <input className="input" value={form.phone} dir="ltr" style={{ textAlign: "start" }}
                     onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="field">
              <label>{t("company")} ({t("optional")})</label>
              <input className="input" value={form.company} maxLength={120}
                     onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div className="field">
              <label>{t("notes")} ({t("optional")})</label>
              <textarea className="textarea" value={form.notes} maxLength={5000}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <ErrorNote error={error} />
            <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>{t("cancel")}</button>
              <button className="btn btn-primary btn-sm">{t("save")}</button>
            </div>
          </form>
        </Modal>
      )}

      {detail && (
        <Modal title={detail.name} onClose={() => { setDetail(null); setParams({}); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
            {detail.email && <div><span style={{ color: "var(--text-3)" }}>{t("email")}: </span><span dir="ltr">{detail.email}</span></div>}
            {detail.phone && <div><span style={{ color: "var(--text-3)" }}>{t("phone")}: </span><span dir="ltr">{detail.phone}</span></div>}
            {detail.company && <div><span style={{ color: "var(--text-3)" }}>{t("company")}: </span>{detail.company}</div>}
            {detail.notes && <div><span style={{ color: "var(--text-3)" }}>{t("notes")}: </span>{detail.notes}</div>}
            <div style={{ color: "var(--text-3)", fontSize: "var(--text-xs)" }}>
              {t("created")} {formatDateTime(detail.created_at, locale)}
            </div>
          </div>
          <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><IconChat style={{ width: 18, height: 18 }} />{t("history")}</h3>
          {detailConvs === null ? <Spinner /> : detailConvs.length === 0 ? (
            <p style={{ color: "var(--text-2)" }}>{t("noHistory")}</p>
          ) : (
            detailConvs.map((c) => (
              <a key={c.id} className="conv-item" style={{ textDecoration: "none", color: "inherit" }}
                 href={`#/messages?c=${c.id}`}>
                <div className="avatar">{(c.display_name || "?").slice(0, 1)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{c.display_name}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.last_message?.body}
                  </div>
                </div>
              </a>
            ))
          )}
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog title={t("confirmDelete")} message={`${t("confirmDelete")} (${deleting.name})`}
                       onConfirm={() => remove(deleting)} onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}
