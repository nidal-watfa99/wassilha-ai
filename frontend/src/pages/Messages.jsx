import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, fileUrl } from "../services/api";
import { useApp } from "../context/AppContext";
import { useRealtime } from "../context/RealtimeContext";
import { useCall } from "../context/CallContext";
import { Modal, EmptyState, Spinner } from "../components/UI";
import {
  IconChat, IconPlus, IconSend, IconPaperclip, IconMic, IconStop, IconPhone, IconVideo, IconDown,
} from "../components/Icons";
import { formatTime } from "../i18n";

/* A message that has been sent to the API but not yet accepted,
   or whose send failed (retryable, with a stable client key). */
function OutgoingDraft({ body, attachment, state, onRetry }) {
  const { t } = useApp();
  return (
    <div className={`msg-row mine ${state}`}>
      <div className="msg-bubble">
        {attachment ? <AttachmentBubble attachment={attachment} /> : body}
      </div>
      <div className="msg-meta">
        {state === "failed" ? (
          <button className="btn btn-ghost btn-sm" onClick={onRetry} style={{ minHeight: 28, padding: "0 0.8rem" }}>
            {t("retry")}
          </button>
        ) : t("sending")}
      </div>
    </div>
  );
}

function AttachmentBubble({ attachment, msg }) {
  const { locale } = useApp();
  if (!attachment) return null;
  const name = <span dir="ltr">{attachment.name}</span>;
  if (attachment.kind === "voice") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: "200px" }}>
        <IconMic style={{ flex: "none", width: 16, height: 16, color: "var(--cyan)" }} />
        <a href={fileUrl(attachment.file_id)} target="_blank" rel="noopener" style={{ color: "var(--cyan)" }}>{name}</a>
        <span style={{ color: "var(--text-3)", fontSize: "0.7rem" }}>{Math.round(attachment.size / 1024)} KB</span>
      </div>
    );
  }
  const isImage = (attachment.mime || "").startsWith("image/");
  const isVideo = (attachment.mime || "").startsWith("video/");
  return (
    <div>
      {isImage ? (
        <a href={fileUrl(attachment.file_id)} target="_blank" rel="noopener">
          <img src={fileUrl(attachment.file_id)} alt={attachment.name} loading="lazy"
               style={{ maxWidth: "100%", borderRadius: "8px", display: "block" }} />
        </a>
      ) : isVideo ? (
        <video src={fileUrl(attachment.file_id)} controls style={{ maxWidth: "100%", borderRadius: "8px" }} />
      ) : (
        <a href={fileUrl(attachment.file_id)} target="_blank" rel="noopener" style={{ color: "var(--cyan)" }}>{name}</a>
      )}
      <div style={{ fontSize: "0.7rem", color: "var(--text-3)", marginTop: "0.25rem" }}>
        {Math.round(attachment.size / 1024)} KB
      </div>
    </div>
  );
}

export default function Messages() {
  const { t, user, toast, tError, locale } = useApp();
  const rt = useRealtime();
  const { startCall } = useCall();
  const [params, setParams] = useSearchParams();
  const [convs, setConvs] = useState(null);
  const [activeId, setActiveId] = useState(params.get("c") || null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [drafts, setDrafts] = useState([]); // {key, body, attachment, state}
  const [uploading, setUploading] = useState(null); // {progress}
  const [recording, setRecording] = useState(null); // {seconds}
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const secondsRef = useRef(0);
  const msgsEndRef = useRef(null);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  const active = useMemo(
    () => (convs || []).find((c) => c.id === activeId) || null,
    [convs, activeId],
  );

  const loadConvs = useCallback(() => {
    api.get("/conversations")
      .then((d) => {
        setConvs(d.items);
        if (!activeRef.current && d.items.length) {
          const fromUrl = params.get("c");
          const chosen = d.items.find((c) => c.id === fromUrl) || d.items[0];
          setActiveId(chosen.id);
        }
      })
      .catch((e) => toast(tError(e), "error"));
  }, [toast, tError, params]);

  const loadMessages = useCallback(() => {
    if (!activeId) return;
    api.get(`/conversations/${activeId}/messages`)
      .then((d) => setMessages(d.items))
      .catch((e) => toast(tError(e), "error"));
    api.post(`/conversations/${activeId}/read`, {}).catch(() => {});
  }, [activeId, toast, tError]);

  useEffect(() => { loadConvs(); }, [loadConvs]);
  useEffect(() => { loadMessages(); }, [loadMessages]);

  // live updates
  useEffect(() => {
    const unsub = rt.subscribe("message", (p) => {
      if (p.conversation_id === activeRef.current) {
        setMessages((ms) => (ms.some((m) => m.id === p.message.id) ? ms : [...ms, p.message]));
      }
      loadConvs();
    });
    return unsub;
  }, [rt, loadConvs]);

  useEffect(() => { msgsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, drafts]);

  // stop recording if unmounting
  useEffect(() => () => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    clearInterval(timerRef.current);
  }, []);

  const otherMembers = active
    ? active.members.filter((m) => m.id !== user.id)
    : [];
  const other = otherMembers[0];

  const send = async (body, file_id, key) => {
    const draftKey = key || crypto.randomUUID();
    const draftIndex = drafts.findIndex((d) => d.key === draftKey);
    const updateDraft = (updater) =>
      setDrafts((ds) => ds.map((d, i) => (i === (draftIndex === -1 ? ds.length - 1 : draftIndex) ? updater(d) : d)));

    if (draftIndex === -1) {
      setDrafts((ds) => [...ds, { key: draftKey, body, attachment: null, state: "sending", file_id }]);
    } else {
      updateDraft((d) => ({ ...d, state: "sending" }));
    }

    try {
      const msg = await api.post(`/conversations/${activeId}/messages`, {
        body: body || "", client_key: draftKey, file_id: file_id || null,
      });
      setDrafts((ds) => ds.filter((d) => d.key !== draftKey));
      setMessages((ms) => (ms.some((m) => m.id === msg.id) ? ms : [...ms, msg]));
      loadConvs();
      return msg;
    } catch (err) {
      const code = typeof err.code === "string" ? err.code : "";
      // empty_message for a voice/file send means the upload was lost: drop it
      if (code === "empty_message" || code === "invalid_file") {
        setDrafts((ds) => ds.filter((d) => d.key !== draftKey));
        toast(tError(err), "error");
        return null;
      }
      setDrafts((ds) => ds.map((d) => (d.key === draftKey ? { ...d, state: "failed" } : d)));
      toast(tError(err), "error");
      return null;
    }
  };

  const submitText = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    await send(body, null);
  };

  const retryDraft = async (draft) => {
    await send(draft.body, draft.file_id, draft.key);
  };

  // ---- file attachment ----
  const pickFile = () => fileInputRef.current?.click();

  const onFilePicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setUploading({ progress: 0 });
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.upload("/files/upload?kind=file", fd,
        (p) => setUploading({ progress: p }));
      setUploading(null);
      await send(file.name, res.file.id);
    } catch (err) {
      setUploading(null);
      toast(t("uploadFailed") + " — " + tError(err), "error");
    }
  };

  // ---- voice messages ----
  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast(t("callUnavailable"), "error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm" : (MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "");
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => { if (ev.data.size) chunksRef.current.push(ev.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        clearInterval(timerRef.current);
        setRecording(null);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 1000) sendVoice(blob, secondsRef.current);
      };
      recorder.start(250);
      secondsRef.current = 0;
      setRecording({ seconds: 0 });
      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setRecording((r) => (r ? { ...r, seconds: secondsRef.current } : r));
      }, 1000);
    } catch {
      toast(t("micDenied"), "error");
    }
  };

  const sendVoice = async (blob, seconds) => {
    try {
      setUploading({ progress: 0 });
      const ext = blob.type.includes("mp4") ? "m4a" : "webm";
      const fd = new FormData();
      fd.append("file", new File([blob], `voice.${ext}`, { type: blob.type }));
      const res = await api.upload("/files/upload?kind=voice", fd,
        (p) => setUploading({ progress: p }));
      setUploading(null);
      await send(`🎤 ${seconds}s`, res.file.id);
    } catch (err) {
      setUploading(null);
      toast(t("uploadFailed") + " — " + tError(err), "error");
    }
  };

  const stopRecording = () => mediaRecorderRef.current?.stop();
  const cancelRecording = () => {
    const r = mediaRecorderRef.current;
    if (r) {
      r.onstop = () => {
        r.stream.getTracks().forEach((tr) => tr.stop());
        clearInterval(timerRef.current);
        setRecording(null);
      };
      r.stop();
    }
  };

  // ---- new conversation ----
  const startConversation = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post("/conversations", { emails: [newEmail] });
      setNewConvOpen(false);
      setNewEmail("");
      loadConvs();
      setActiveId(res.id);
    } catch (err) {
      toast(tError(err), "error");
    }
  };

  return (
    <div className="chat-layout">
      {/* conversation list */}
      <div className={`glass conv-list ${activeId && window.innerWidth <= 900 ? "conv-pane-hidden" : ""}`}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.8rem 1rem", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: "var(--text-base)" }}>{t("messages")}</h2>
          <button className="icon-btn" onClick={() => setNewConvOpen(true)} aria-label={t("newConversation")} title={t("newConversation")}>
            <IconPlus />
          </button>
        </div>
        <div className="conv-list-scroll">
          {convs === null ? <div style={{ display: "grid", placeItems: "center", padding: "2rem" }}><Spinner /></div>
            : convs.length === 0 ? (
              <EmptyState icon={<IconChat />} text={t("noConversationsYet")} />
            ) : convs.map((c) => (
              <div key={c.id} className={`conv-item ${c.id === activeId ? "active" : ""}`}
                   onClick={() => { setActiveId(c.id); setParams({ c: c.id }); }}>
                <div className="avatar">{(c.display_name || "?").slice(0, 1).toUpperCase()}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.display_name}</span>
                    {c.unread > 0 && <span className="badge badge-blue">{c.unread}</span>}
                  </div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.last_message ? c.last_message.body : "—"}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* chat */}
      <div className="glass chat-main">
        {!active ? (
          <EmptyState icon={<IconChat />} text={t("selectConversation")} />
        ) : (
          <>
            <div className="chat-head">
              <div className="avatar">{(active.display_name || "?").slice(0, 1).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{active.display_name}</div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-3)" }}>
                  {otherMembers.map((m) => m.email).join(", ")}
                </div>
              </div>
              {other && (
                <>
                  <button className="icon-btn" title={t("audioCall")} aria-label={t("audioCall")}
                          onClick={() => startCall(other.id, other.name, "audio")}>
                    <IconPhone />
                  </button>
                  <button className="icon-btn" title={t("videoCall")} aria-label={t("videoCall")}
                          onClick={() => startCall(other.id, other.name, "video")}>
                    <IconVideo />
                  </button>
                </>
              )}
            </div>

            <div className="chat-msgs">
              {messages.map((m) => (
                <div key={m.id} className={`msg-row ${m.sender_id === user.id ? "mine" : "other"}`}>
                  <div className="msg-bubble">
                    {m.attachment ? <AttachmentBubble attachment={m.attachment} /> : m.body}
                  </div>
                  <div className="msg-meta">
                    {formatTime(m.created_at, locale)}
                    {m.sender_id === user.id ? " ✓" : ""}
                  </div>
                </div>
              ))}
              {drafts.map((d) => (
                <OutgoingDraft key={d.key} body={d.body} attachment={d.attachment} state={d.state}
                               onRetry={() => retryDraft(d)} />
              ))}
              {uploading && (
                <div className="msg-row mine">
                  <div className="msg-bubble" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <div className="spinner" style={{ width: 16, height: 16 }} />
                    {Math.round((uploading.progress || 0) * 100)}%
                  </div>
                </div>
              )}
              <div ref={msgsEndRef} />
            </div>

            {recording ? (
              <div className="recording-bar">
                <span className="rec-dot" />
                <span style={{ flex: 1 }}>{recording.seconds}s</span>
                <button className="btn btn-ghost btn-sm" onClick={cancelRecording}>{t("cancelRecording")}</button>
                <button className="btn btn-primary btn-sm" onClick={stopRecording}>
                  <IconSend />{t("sendRecording")}
                </button>
              </div>
            ) : (
              <form className="chat-composer" onSubmit={submitText}>
                <input ref={fileInputRef} type="file" hidden onChange={onFilePicked}
                       accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.pdf,.txt,.md,.mp3,.ogg,.wav,.m4a" />
                <button type="button" className="icon-btn" onClick={pickFile} aria-label={t("attachFile")} title={t("attachFile")}>
                  <IconPaperclip />
                </button>
                <button type="button" className="icon-btn" onClick={startRecording} aria-label={t("recordVoice")} title={t("recordVoice")}
                        style={recording ? { color: "var(--danger)" } : {}}>
                  <IconMic />
                </button>
                <textarea className="input" rows={1} value={text}
                          placeholder={t("typeMessage")}
                          onChange={(e) => setText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitText(e); }
                          }} />
                <button className="btn btn-primary btn-sm" type="submit" aria-label={t("send")}>
                  <IconSend />
                </button>
              </form>
            )}
          </>
        )}
      </div>

      {newConvOpen && (
        <Modal title={t("newConversation")} onClose={() => setNewConvOpen(false)}>
          <form onSubmit={startConversation}>
            <div className="field">
              <label>{t("recipientEmail")}</label>
              <input className="input" type="email" required dir="ltr" style={{ textAlign: "start" }}
                     value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </div>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--text-3)", marginTop: 0 }}>{t("requireAccount")}</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.7rem" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewConvOpen(false)}>{t("cancel")}</button>
              <button className="btn btn-primary btn-sm">{t("startByEmail")}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
