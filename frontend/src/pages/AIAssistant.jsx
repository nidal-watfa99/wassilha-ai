import React, { useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { EmptyState, Spinner, ErrorNote } from "../components/UI";
import { IconSpark, IconPlus, IconTrash } from "../components/Icons";

export default function AIAssistant() {
  const { t, toast, tError } = useApp();
  const [configured, setConfigured] = useState(null);
  const [convId, setConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    api.get("/ai/status").then((d) => setConfigured(d.configured)).catch(() => setConfigured(false));
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  const send = async (e) => {
    e.preventDefault();
    const content = input.trim();
    if (!content || busy) return;
    setInput("");
    setError(null);
    setMessages((ms) => [...ms, { role: "user", content }]);
    setBusy(true);
    try {
      const res = await api.post("/ai/chat", {
        conversation_id: convId, content,
      });
      setConvId(res.conversation_id);
      setMessages((ms) => [...ms, res.reply]);
    } catch (err) {
      setError(err);
      // keep the user's message visible; the error note explains the state
    } finally {
      setBusy(false);
    }
  };

  const newChat = () => { setConvId(null); setMessages([]); setError(null); };

  return (
    <div className="chat-layout" style={{ gridTemplateColumns: "1fr" }}>
      <div className="glass chat-main">
        <div className="chat-head">
          <div className="brand-orb" style={{ width: 36, height: 36 }}><IconSpark style={{ width: 18, height: 18 }} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{t("aiTitle")}</div>
            {configured === false && (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--danger)" }}>{t("aiNotConfigured")}</div>
            )}
          </div>
          <button className="icon-btn" onClick={newChat} aria-label={t("newChat")} title={t("newChat")}>
            <IconPlus />
          </button>
        </div>

        <div className="chat-msgs">
          {messages.length === 0 && !busy && (
            <EmptyState icon={<IconSpark />} text={t("aiPlaceholder")} />
          )}
          {messages.map((m, i) => (
            <div key={i} className={`msg-row ${m.role === "user" ? "mine" : "other"}`}>
              <div className="msg-bubble" style={m.role === "user" ? {} : { borderColor: "rgba(135,92,255,.35)" }}>
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="msg-row other">
              <div className="msg-bubble" style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "var(--text-2)" }}>
                <div className="spinner" style={{ width: 16, height: 16 }} /> {t("thinking")}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form className="chat-composer" onSubmit={send}>
          <textarea className="input" rows={1} value={input} placeholder={t("aiPlaceholder")}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e); } }} />
          <button className="btn btn-primary btn-sm" disabled={busy || !input.trim()}>
            <IconSpark />{t("send")}
          </button>
        </form>
        {error && (
          <div style={{ padding: "0.5rem 1rem", borderTop: "1px solid var(--border)" }}>
            <ErrorNote error={error} />
          </div>
        )}
      </div>
    </div>
  );
}
