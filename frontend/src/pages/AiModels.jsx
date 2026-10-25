import React, { useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { IconSpark } from "../components/Icons";
import { PROVIDERS, listModels, callModel, pickModel, setAiConfig, removeAiConfig, getAiConfig, maskKey } from "../services/aiClient";

const STORE = "wassilha_ai_keys_v1";
const mem = {};
const load = () => { try { const r = localStorage.getItem(STORE) ?? mem[STORE]; return r ? JSON.parse(r) : { p: {} }; } catch { return { p: {} }; } };
const persist = (s) => { const r = JSON.stringify(s); mem[STORE] = r; try { localStorage.setItem(STORE, r); } catch { /* memory only */ } };
const META = {
  gemini: { free: true, color: "#4f8cff" }, groq: { free: true, color: "#f97316" }, cerebras: { free: true, color: "#22d3ee" },
  openrouter: { free: true, color: "#a78bfa" }, xai: { free: false, color: "#e5e7eb" },
};

export default function AiModels() {
  const { t, toast } = useApp();
  const [st, setSt] = useState(() => {
    const s = load(), c = getAiConfig();                       // adopt a key saved from Settings
    if (c && !s.p[c.provider]) s.p[c.provider] = { apiKey: c.apiKey, model: c.model };
    if (c && !s.def) s.def = c.provider;
    return s;
  });
  const [draft, setDraft] = useState({}), [shown, setShown] = useState(null), [busy, setBusy] = useState(null), [models, setModels] = useState({});
  const timer = useRef(null);
  const commit = (n) => { persist(n); setSt(n); };
  const patch = (id, v) => commit({ ...st, p: { ...st.p, [id]: { ...st.p[id], ...v } } });
  const sync = (n, id) => { const c = n.p[id]; if (n.def === id && c?.apiKey && c?.model) setAiConfig({ provider: id, apiKey: c.apiKey, model: c.model }); };

  const saveKey = (id) => {
    const k = (draft[id] || "").trim(); if (!k) return;
    const n = { ...st, p: { ...st.p, [id]: { apiKey: k, model: st.p[id]?.model || PROVIDERS[id].model, lastTest: null } }, def: st.def || id };
    commit(n); setDraft((d) => ({ ...d, [id]: "" })); sync(n, id); toast(t("ai_saved"), "success");
  };
  const removeKey = (id) => {
    const { [id]: _, ...rest } = st.p; const n = { ...st, p: rest, def: st.def === id ? Object.keys(rest)[0] : st.def };
    commit(n); if (st.def === id) { removeAiConfig(); if (n.def) sync(n, n.def); } toast(t("ai_removed"), "success");
  };
  const clean = (m, k) => String(m || "").split(k).join("••••").slice(0, 200);
  const test = async (id) => {
    const c = st.p[id]; if (!c?.apiKey) return;
    setBusy(id);
    try {
      const list = await listModels(id, c.apiKey);
      const model = pickModel(id, c.model, list);
      await callModel(id, c.apiKey, model, [{ role: "user", content: "ping" }], 128);
      setModels((m) => ({ ...m, [id]: list }));
      const n = { ...st, p: { ...st.p, [id]: { ...c, model, lastTest: { at: new Date().toISOString(), ok: true } } } };
      commit(n); sync(n, id);
    } catch (e) {
      patch(id, { lastTest: { at: new Date().toISOString(), ok: false, kind: e.kind || "service", msg: clean(e.message, c.apiKey) } });
    } finally { setBusy(null); }
  };
  const reveal = (id) => { setShown(id); clearTimeout(timer.current); timer.current = setTimeout(() => setShown(null), 8000); };
  const makeDefault = (id) => { const n = { ...st, def: id }; commit(n); sync(n, id); };

  return (
    <div style={{ display: "grid", gap: "1rem", maxWidth: 820 }}>
      <div className="section-title"><h2><IconSpark /> {t("aimodels")}</h2></div>
      <p style={{ margin: 0, color: "var(--text-2)" }}>{t("ai_sub")}</p>
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-3)" }}>{t("ai_caps")} {t("ai_secNote")}</p>
      {Object.entries(PROVIDERS).map(([id, P]) => {
        const c = st.p[id], lt = c?.lastTest;
        const status = !c?.apiKey ? "none" : !lt ? "untested" : lt.ok ? "ok" : "fail";
        const badge = { none: "", untested: "badge-violet", ok: "badge-green", fail: "badge-red" }[status];
        const list = models[id];
        return (
          <div key={id} className="glass card" style={{ display: "grid", gap: "0.7rem", borderInlineStart: `4px solid ${META[id].color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <strong style={{ fontSize: "1.05rem" }}>{P.name}</strong>
              <span style={{ display: "flex", gap: "0.3rem" }}>
                {st.def === id && c?.apiKey && <span className="badge badge-blue">★ {t("ai_default")}</span>}
                <span className={`badge ${badge}`}>{t("ai_s_" + status)}</span>
              </span>
            </div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-3)" }}>{META[id].free ? t("ai_free") : t("ai_paid")}</div>
            {c?.apiKey ? (
              <>
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
                  <code dir="ltr" style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{shown === id ? c.apiKey : maskKey(c.apiKey)}</code>
                  <button className="btn btn-ghost btn-sm" onClick={() => reveal(id)}>👁 {t("ai_show")}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(c.apiKey).then(() => toast(t("ai_copied"), "success"))}>{t("ai_copy")}</button>
                </div>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                  <label style={{ fontSize: "var(--text-sm)" }}>{t("ai_model")}</label>
                  {list ? (
                    <select className="select" style={{ width: "auto", maxWidth: "100%" }} value={c.model} onChange={(e) => { patch(id, { model: e.target.value }); sync({ ...st, p: { ...st.p, [id]: { ...c, model: e.target.value } } }, id); }}>
                      {list.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}</select>
                  ) : <code dir="ltr">{c.model || "—"}</code>}
                  {list && <span style={{ fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{list.length} {t("ai_models")}</span>}
                </div>
                {status === "untested" && <div style={{ fontSize: "var(--text-sm)", color: "var(--cyan)" }}>{t("ai_untestedNote")}</div>}
                {lt && (
                  <div style={{ fontSize: "var(--text-sm)" }}>
                    {t("ai_lastTest")}: <bdi dir="ltr">{new Date(lt.at).toLocaleString()}</bdi>
                    {!lt.ok && <div style={{ color: "#ff8a9b" }}>{t("ai_err_" + lt.kind)} <bdi dir="ltr" style={{ color: "var(--text-3)" }}>{lt.msg}</bdi></div>}
                  </div>
                )}
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  <button className="btn btn-primary btn-sm" disabled={busy === id} onClick={() => test(id)}>{busy === id ? t("ai_testing") : t("ai_test")}</button>
                  {st.def !== id && <button className="btn btn-ghost btn-sm" onClick={() => makeDefault(id)}>{t("ai_setDefault")}</button>}
                  <button className="btn btn-ghost btn-sm" onClick={() => removeKey(id)}>{t("ai_remove")}</button>
                </div>
              </>
            ) : null}
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              <input className="input" style={{ flex: "1 1 200px" }} type="password" autoComplete="off" dir="ltr" placeholder={t("ai_key")} value={draft[id] || ""} onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))} />
              <button className="btn btn-ghost btn-sm" disabled={!(draft[id] || "").trim()} onClick={() => saveKey(id)}>{c?.apiKey ? t("ai_replace") : t("ai_save")}</button>
              <a className="btn btn-ghost btn-sm" href={P.portal} target="_blank" rel="noreferrer">{t("ai_getKey")}</a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
