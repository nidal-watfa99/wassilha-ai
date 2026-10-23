/* Browser-side AI client (local mode).
   The user's own API key is stored in this browser only and requests go
   straight to the provider. Supported: Gemini, Groq, Cerebras, OpenRouter. */

const CFG_KEY = "wassilha_ai_cfg_v1";
const mem = {};

export const PROVIDERS = {
  gemini: { name: "Google Gemini", portal: "https://aistudio.google.com/app/apikey", model: "gemini-2.5-flash" },
  groq: { name: "GroqCloud", portal: "https://console.groq.com/keys", model: "llama-3.3-70b-versatile" },
  cerebras: { name: "Cerebras", portal: "https://inference.cerebras.ai/", model: "llama-3.3-70b" },
  openrouter: { name: "OpenRouter", portal: "https://openrouter.ai/keys", model: "meta-llama/llama-3.3-70b-instruct:free" },
};

const OPENAI_COMPAT = {
  groq: "https://api.groq.com/openai/v1",
  cerebras: "https://api.cerebras.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
};
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

const PREFERRED = {
  gemini: [/gemini-2\.5-flash$/, /gemini-2\.5-flash-lite/, /gemini-.*flash/, /gemini/],
  groq: [/llama-3\.3-70b/, /llama-3\.1-8b/, /llama/, /./],
  cerebras: [/llama-3\.3-70b/, /llama3\.1-8b/, /llama/, /./],
  openrouter: [/llama-3\.3-70b-instruct:free/, /:free$/],
};

export function getAiConfig() {
  try {
    const raw = localStorage.getItem(CFG_KEY) ?? mem[CFG_KEY];
    const c = raw ? JSON.parse(raw) : null;
    return c && c.provider && c.apiKey && c.model ? c : null;
  } catch { return null; }
}
export function setAiConfig(cfg) {
  const raw = JSON.stringify(cfg);
  mem[CFG_KEY] = raw;
  try { localStorage.setItem(CFG_KEY, raw); } catch { /* memory only */ }
}
export function removeAiConfig() {
  delete mem[CFG_KEY];
  try { localStorage.removeItem(CFG_KEY); } catch { /* ignore */ }
}
export const maskKey = (k) => (k.length > 8 ? `${k.slice(0, 4)}••••${k.slice(-4)}` : "••••••••");

async function request(url, init, timeoutMs = 25000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { ...init, signal: ctl.signal });
  } catch (e) {
    clearTimeout(timer);
    throw Object.assign(new Error(e?.name === "AbortError" ? "Request timed out" : "Network error: provider unreachable"), { kind: "network", status: 0 });
  }
  clearTimeout(timer);
  let data = null;
  try { data = await res.json(); } catch { /* not json */ }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
    const kind = res.status === 429 ? "quota" : (res.status === 401 || res.status === 403 || /api key/i.test(msg)) ? "invalid_key" : "service";
    throw Object.assign(new Error(msg), { kind, status: res.status });
  }
  return data;
}

export async function listModels(provider, apiKey) {
  if (provider === "gemini") {
    const d = await request(`${GEMINI_BASE}/models?pageSize=100`, { headers: { "x-goog-api-key": apiKey } });
    return (d?.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => ({ id: String(m.name).replace(/^models\//, ""), name: m.displayName || m.name }))
      .filter((m) => /^gemini/.test(m.id) && !/embedding|tts|image|live|audio|robotics|computer-use/i.test(m.id));
  }
  const d = await request(`${OPENAI_COMPAT[provider]}/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });
  let list = (d?.data || []).map((m) => ({ id: m.id, name: m.name || m.id }));
  if (provider === "groq") list = list.filter((m) => !/whisper|guard|tts|playai/i.test(m.id));
  if (provider === "openrouter") list = list.filter((m) => /:free$/.test(m.id)).slice(0, 30);
  return list;
}

export function pickModel(provider, wanted, available) {
  if (available.some((m) => m.id === wanted)) return wanted;
  for (const re of PREFERRED[provider] || []) {
    const hit = available.find((m) => re.test(m.id));
    if (hit) return hit.id;
  }
  return available[0]?.id || wanted;
}

export async function callModel(provider, apiKey, model, messages, maxTokens = 600) {
  if (provider === "gemini") {
    const system = messages.find((m) => m.role === "system")?.content;
    const contents = messages.filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const d = await request(`${GEMINI_BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.5 },
      }),
    });
    const text = (d?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
    if (!text) throw Object.assign(new Error("Empty response"), { kind: "service", status: 200 });
    return text;
  }
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
  if (provider === "openrouter") headers["X-Title"] = "Wassilha AI";
  const d = await request(`${OPENAI_COMPAT[provider]}/chat/completions`, {
    method: "POST", headers,
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.5 }),
  });
  const text = String(d?.choices?.[0]?.message?.content || "").trim();
  if (!text) throw Object.assign(new Error("Empty response"), { kind: "service", status: 200 });
  return text;
}

/* Validates the key, finds a model that really exists, and does one tiny generation. */
export async function testProvider(provider, apiKey, wantedModel) {
  const started = performance.now();
  let models = [];
  try {
    try { models = await listModels(provider, apiKey); } catch (e) {
      if (e.kind === "invalid_key" || e.kind === "network") throw e;
    }
    const model = models.length ? pickModel(provider, wantedModel, models) : wantedModel;
    const sample = await callModel(provider, apiKey, model, [{ role: "user", content: "Reply with exactly: OK" }], 20);
    return { success: true, model, sample, latencyMs: Math.round(performance.now() - started) };
  } catch (e) {
    return { success: false, error: e.message || "Connection error", kind: e.kind || "service" };
  }
}
