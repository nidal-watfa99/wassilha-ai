/* Local (browser-only) backend.
   Used when the app is built for static hosting such as GitHub Pages
   (VITE_LOCAL_MODE=1). It answers the same /api routes as the FastAPI server,
   but keeps everything in this browser's localStorage. Nothing leaves the
   device, and there is no live chat between different devices in this mode. */

import { callModel, getAiConfig } from "./aiClient";

const DB_KEY = "wassilha_local_db_v1";
const SESSION_KEY = "wassilha_local_session_v1";
const MAX_FILE_BYTES = 1_500_000; // keeps us inside the ~5MB localStorage quota

/* ---------- storage (falls back to memory when localStorage is blocked) ---------- */
const mem = {};
const store = {
  get(k) { try { return localStorage.getItem(k) ?? mem[k] ?? null; } catch { return mem[k] ?? null; } },
  set(k, v) {
    mem[k] = v;
    try { localStorage.setItem(k, v); } catch (e) {
      if (e && (e.name === "QuotaExceededError" || e.code === 22)) throw { code: "storage_full", status: 507 };
    }
  },
};

const EMPTY = () => ({
  users: [], contacts: [], tasks: [], events: [], documents: [], products: [], payments: [],
  convs: [], members: [], messages: [], files: [], aiConvs: [], aiMessages: [],
});

function load() {
  try {
    const raw = store.get(DB_KEY);
    if (raw) return { ...EMPTY(), ...JSON.parse(raw) };
  } catch { /* corrupted -> start clean */ }
  return EMPTY();
}
function save(db) { store.set(DB_KEY, JSON.stringify(db)); }

/* ---------- helpers ---------- */
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
/* The real API returns naive UTC timestamps (no trailing Z); the UI appends the Z itself. */
const nowIso = () => new Date().toISOString().slice(0, -1);
const toNaiveUtc = (v) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw { code: "invalid_datetime", status: 422 };
  return d.toISOString().slice(0, -1);
};
const fail = (status, code) => { throw { code, status, data: { detail: code } }; };
const ok = (data) => data;

async function hashPassword(password, salt) {
  try {
    if (globalThis.crypto?.subtle) {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" }, key, 256);
      return Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch { /* fall through */ }
  // Non-secure context fallback (still never stores the plain password)
  let h = 5381;
  const s = salt + password;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return "weak-" + (h >>> 0).toString(16);
}

const userOut = (u) => ({ id: u.id, email: u.email, name: u.name, locale: u.locale });
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || "");

function currentUser(db) {
  const id = store.get(SESSION_KEY);
  const u = id && db.users.find((x) => x.id === id && !x.placeholder);
  if (!u) fail(401, "not_authenticated");
  return u;
}

/* ---------- messaging helpers ---------- */
const memberIds = (db, convId) => db.members.filter((m) => m.conversation_id === convId).map((m) => m.user_id);

function convOut(db, conv, userId) {
  const members = memberIds(db, conv.id).map((id) => db.users.find((u) => u.id === id)).filter(Boolean);
  const others = members.filter((u) => u.id !== userId);
  const msgs = db.messages.filter((m) => m.conversation_id === conv.id);
  const last = msgs.length ? msgs[msgs.length - 1] : null;
  const me = db.members.find((m) => m.conversation_id === conv.id && m.user_id === userId);
  let unread = 0;
  if (last && last.sender_id !== userId && (!me?.last_read_at || last.created_at > me.last_read_at)) unread = 1;
  return {
    id: conv.id, is_group: conv.is_group, title: conv.title,
    members: members.map((u) => ({ id: u.id, name: u.name, email: u.email })),
    display_name: conv.title || (others.map((u) => u.name).join(", ") || "—"),
    last_message: last ? { body: last.body, kind: last.kind, created_at: last.created_at, sender_id: last.sender_id } : null,
    unread,
    created_at: conv.created_at,
  };
}

function msgOut(db, m) {
  const out = {
    id: m.id, conversation_id: m.conversation_id, sender_id: m.sender_id, body: m.body,
    kind: m.kind, client_key: m.client_key, created_at: m.created_at,
  };
  const f = db.files.find((x) => x.message_id === m.id);
  if (f) out.attachment = { file_id: f.id, name: f.name, size: f.size, mime: f.mime, kind: f.kind };
  return out;
}

/* ---------- generic owner-scoped CRUD ---------- */
const own = (db, coll, user) => db[coll].filter((r) => r.owner_id === user.id);
function findOwned(db, coll, user, id, code) {
  const r = db[coll].find((x) => x.id === id && x.owner_id === user.id);
  if (!r) fail(404, code);
  return r;
}
const pick = (src, keys) => Object.fromEntries(keys.filter((k) => src[k] !== undefined && src[k] !== null).map((k) => [k, src[k]]));
const str = (v, max) => String(v ?? "").slice(0, max);

/* ---------- route table ---------- */
async function route(method, path, body, query) {
  const db = load();
  const seg = path.split("/").filter(Boolean);

  /* public */
  if (path === "/health") return ok({ status: "ok", mode: "local" });
  if (path === "/about" && method === "GET") {
    return ok({
      name: "Wassilha AI", version: "1.0.0", mode: "local",
      description_ar: "منصة تواصل وإنتاجية مدعومة بالذكاء الاصطناعي",
      features: ["auth", "contacts", "messaging", "files", "voice-notes", "ai-assistant", "tasks", "calendar", "documents", "insights", "products", "payments", "settings"],
    });
  }
  if (path === "/ai/status" && method === "GET") return ok({ configured: !!getAiConfig() });
  if (path === "/config/webrtc") return ok({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }], turnConfigured: false });

  /* ---- auth ---- */
  if (seg[0] === "auth") {
    if (path === "/auth/register" && method === "POST") {
      const name = str(body?.name, 100).trim();
      const email = str(body?.email, 200).trim().toLowerCase();
      const password = String(body?.password ?? "");
      if (name.length < 2 || !validEmail(email) || password.length < 8) fail(422, "invalid_input");
      const existing = db.users.find((u) => u.email === email);
      if (existing && !existing.placeholder) fail(409, "email_taken");
      const salt = uid();
      const rec = { id: existing?.id || uid(), email, name, locale: ["ar", "en", "es"].includes(body?.locale) ? body.locale : "ar", salt, pw: await hashPassword(password, salt), created_at: nowIso() };
      if (existing) Object.assign(existing, rec, { placeholder: false });
      else db.users.push(rec);
      save(db);
      store.set(SESSION_KEY, rec.id);
      return ok({ user: userOut(rec) });
    }
    if (path === "/auth/login" && method === "POST") {
      const email = str(body?.email, 200).trim().toLowerCase();
      const u = db.users.find((x) => x.email === email && !x.placeholder);
      if (!u || (await hashPassword(String(body?.password ?? ""), u.salt)) !== u.pw) fail(401, "invalid_credentials");
      store.set(SESSION_KEY, u.id);
      return ok({ user: userOut(u) });
    }
    if (path === "/auth/logout") { store.set(SESSION_KEY, ""); return ok({ ok: true }); }
    const user = currentUser(db);
    if (path === "/auth/me" && method === "GET") return ok(userOut(user));
    if (path === "/auth/me" && method === "PATCH") {
      if (body?.name !== undefined) { const n = str(body.name, 100).trim(); if (n.length < 2) fail(422, "invalid_input"); user.name = n; }
      if (body?.locale !== undefined) { if (!["ar", "en", "es"].includes(body.locale)) fail(422, "unsupported_locale"); user.locale = body.locale; }
      save(db);
      return ok(userOut(user));
    }
    if (path === "/auth/password" && method === "PUT") {
      if ((await hashPassword(String(body?.current_password ?? ""), user.salt)) !== user.pw) fail(400, "wrong_current_password");
      const np = String(body?.new_password ?? "");
      if (np.length < 8) fail(422, "invalid_input");
      user.salt = uid();
      user.pw = await hashPassword(np, user.salt);
      save(db);
      return ok({ ok: true });
    }
    fail(404, "not_found");
  }

  const user = currentUser(db);
  const [res, id, sub] = seg;

  /* ---- contacts ---- */
  if (res === "contacts") {
    const FIELDS = ["name", "email", "phone", "company", "notes"];
    const out = (c) => pick(c, ["id", ...FIELDS, "created_at", "updated_at"]);
    if (!id && method === "GET") {
      const q = (query.get("q") || "").trim().toLowerCase(), qd = q.replace(/\D/g, "");
      const sort = ["name", "created_at", "updated_at"].includes(query.get("sort")) ? query.get("sort") : "name";
      let rows = own(db, "contacts", user).filter((c) => !q || [c.name, c.email, c.phone, c.company].some((x) => (x || "").toLowerCase().includes(q)) || (qd.length >= 3 && String(c.phone || "").replace(/\D/g, "").includes(qd)));
      rows = rows.sort((a, b) => String(a[sort]).localeCompare(String(b[sort]), "ar"));
      return ok({ items: rows.map(out) });
    }
    if (!id && method === "POST") {
      const name = str(body?.name, 100).trim();
      if (!name) fail(422, "invalid_input");
      if (body?.email && !String(body.email).includes("@")) fail(422, "invalid_email");
      const c = { id: uid(), owner_id: user.id, name, email: str(body?.email, 200), phone: str(body?.phone, 50), company: str(body?.company, 120), notes: str(body?.notes, 5000), created_at: nowIso(), updated_at: nowIso() };
      db.contacts.push(c); save(db);
      return ok(out(c));
    }
    const c = findOwned(db, "contacts", user, id, "contact_not_found");
    if (method === "GET") return ok(out(c));
    if (method === "PATCH") {
      if (body?.email && !String(body.email).includes("@")) fail(422, "invalid_email");
      for (const k of FIELDS) if (body?.[k] !== undefined && body[k] !== null) c[k] = str(body[k], k === "notes" ? 5000 : 200);
      c.updated_at = nowIso(); save(db);
      return ok(out(c));
    }
    if (method === "DELETE") { db.contacts = db.contacts.filter((x) => x !== c); save(db); return ok({ ok: true }); }
  }

  /* ---- tasks ---- */
  if (res === "tasks") {
    const out = (t) => ({ id: t.id, title: t.title, notes: t.notes, status: t.status, priority: t.priority, due_date: t.due_date || null, created_at: t.created_at, updated_at: t.updated_at });
    const okStatus = (s) => ["todo", "doing", "done"].includes(s);
    const okPrio = (p) => ["low", "medium", "high"].includes(p);
    if (!id && method === "GET") {
      let rows = own(db, "tasks", user);
      if (query.get("status")) rows = rows.filter((t) => t.status === query.get("status"));
      if (query.get("priority")) rows = rows.filter((t) => t.priority === query.get("priority"));
      return ok({ items: rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).map(out) });
    }
    if (!id && method === "POST") {
      const title = str(body?.title, 200).trim();
      if (!title) fail(422, "invalid_input");
      const t = { id: uid(), owner_id: user.id, title, notes: str(body?.notes, 5000), status: okStatus(body?.status) ? body.status : "todo", priority: okPrio(body?.priority) ? body.priority : "medium", due_date: body?.due_date ? toNaiveUtc(body.due_date) : null, created_at: nowIso(), updated_at: nowIso() };
      db.tasks.push(t); save(db);
      return ok(out(t));
    }
    const t = findOwned(db, "tasks", user, id, "task_not_found");
    if (method === "GET") return ok(out(t));
    if (method === "PATCH") {
      if (body?.title !== undefined && body.title !== null) { const n = str(body.title, 200).trim(); if (!n) fail(422, "invalid_input"); t.title = n; }
      if (body?.notes != null) t.notes = str(body.notes, 5000);
      if (body?.status != null) { if (!okStatus(body.status)) fail(422, "invalid_input"); t.status = body.status; }
      if (body?.priority != null) { if (!okPrio(body.priority)) fail(422, "invalid_input"); t.priority = body.priority; }
      if (body?.clear_due) t.due_date = null; else if (body?.due_date != null) t.due_date = toNaiveUtc(body.due_date);
      t.updated_at = nowIso(); save(db);
      return ok(out(t));
    }
    if (method === "DELETE") { db.tasks = db.tasks.filter((x) => x !== t); save(db); return ok({ ok: true }); }
  }

  /* ---- events ---- */
  if (res === "events") {
    const out = (e) => ({ id: e.id, title: e.title, notes: e.notes, start_at: e.start_at, end_at: e.end_at || null, created_at: e.created_at });
    if (!id && method === "GET") return ok({ items: own(db, "events", user).sort((a, b) => a.start_at.localeCompare(b.start_at)).map(out) });
    if (!id && method === "POST") {
      const title = str(body?.title, 200).trim();
      if (!title || !body?.start_at) fail(422, "invalid_input");
      const start = toNaiveUtc(body.start_at);
      const end = body.end_at ? toNaiveUtc(body.end_at) : null;
      if (end && end < start) fail(422, "end_before_start");
      const e = { id: uid(), owner_id: user.id, title, notes: str(body?.notes, 5000), start_at: start, end_at: end, created_at: nowIso() };
      db.events.push(e); save(db);
      return ok(out(e));
    }
    const e = findOwned(db, "events", user, id, "event_not_found");
    if (method === "PATCH") {
      if (body?.title != null) e.title = str(body.title, 200).trim();
      if (body?.notes != null) e.notes = str(body.notes, 5000);
      if (body?.start_at != null) e.start_at = toNaiveUtc(body.start_at);
      if (body?.end_at != null) e.end_at = toNaiveUtc(body.end_at);
      if (e.end_at && e.end_at < e.start_at) fail(422, "end_before_start");
      save(db);
      return ok(out(e));
    }
    if (method === "DELETE") { db.events = db.events.filter((x) => x !== e); save(db); return ok({ ok: true }); }
  }

  /* ---- documents ---- */
  if (res === "documents") {
    const out = (d, withContent = true) => ({ id: d.id, title: d.title, content: withContent ? d.content : "", created_at: d.created_at, updated_at: d.updated_at });
    if (!id && method === "GET") {
      const q = (query.get("q") || "").toLowerCase();
      const rows = own(db, "documents", user).filter((d) => !q || d.title.toLowerCase().includes(q)).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return ok({ items: rows.map((d) => out(d, false)) });
    }
    if (!id && method === "POST") {
      const title = str(body?.title, 200).trim();
      if (!title) fail(422, "invalid_input");
      const d = { id: uid(), owner_id: user.id, title, content: str(body?.content, 200000), created_at: nowIso(), updated_at: nowIso() };
      db.documents.push(d); save(db);
      return ok(out(d));
    }
    const d = findOwned(db, "documents", user, id, "document_not_found");
    if (method === "GET") return ok(out(d));
    if (method === "PATCH") {
      if (body?.title != null) { const n = str(body.title, 200).trim(); if (!n) fail(422, "invalid_input"); d.title = n; }
      if (body?.content != null) d.content = str(body.content, 200000);
      d.updated_at = nowIso(); save(db);
      return ok(out(d));
    }
    if (method === "DELETE") { db.documents = db.documents.filter((x) => x !== d); save(db); return ok({ ok: true }); }
  }

  /* ---- products & payments ---- */
  if (res === "products") {
    const out = (p) => ({ id: p.id, name: p.name, price: p.price, currency: p.currency, notes: p.notes, created_at: p.created_at });
    if (!id && method === "GET") return ok({ items: own(db, "products", user).map(out) });
    const price = (v) => { const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 10_000_000) fail(422, "invalid_input"); return n; };
    if (!id && method === "POST") {
      const name = str(body?.name, 200).trim();
      if (!name) fail(422, "invalid_input");
      const p = { id: uid(), owner_id: user.id, name, price: price(body?.price ?? 0), currency: str(body?.currency || "USD", 5).toUpperCase(), notes: str(body?.notes, 2000), created_at: nowIso() };
      db.products.push(p); save(db);
      return ok(out(p));
    }
    const p = findOwned(db, "products", user, id, "product_not_found");
    if (method === "PATCH") {
      if (body?.name != null) p.name = str(body.name, 200).trim();
      if (body?.price != null) p.price = price(body.price);
      if (body?.currency != null) p.currency = str(body.currency, 5).toUpperCase();
      if (body?.notes != null) p.notes = str(body.notes, 2000);
      save(db);
      return ok(out(p));
    }
    if (method === "DELETE") { db.products = db.products.filter((x) => x !== p); save(db); return ok({ ok: true }); }
  }
  if (res === "payments") {
    const out = (p) => ({ id: p.id, product_id: p.product_id || null, contact_id: p.contact_id || null, amount: p.amount, currency: p.currency, status: p.status, note: p.note, created_at: p.created_at });
    if (!id && method === "GET") return ok({ items: own(db, "payments", user).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(out) });
    const amount = (v) => { const n = Number(v); if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) fail(422, "invalid_input"); return n; };
    if (!id && method === "POST") {
      if (body?.product_id && !db.products.some((x) => x.id === body.product_id && x.owner_id === user.id)) fail(422, "invalid_product");
      if (body?.contact_id && !db.contacts.some((x) => x.id === body.contact_id && x.owner_id === user.id)) fail(422, "invalid_contact");
      const p = { id: uid(), owner_id: user.id, product_id: body?.product_id || null, contact_id: body?.contact_id || null, amount: amount(body?.amount), currency: str(body?.currency || "USD", 5).toUpperCase(), status: "recorded", note: str(body?.note, 300), created_at: nowIso() };
      db.payments.push(p); save(db);
      return ok(out(p));
    }
    const p = findOwned(db, "payments", user, id, "payment_not_found");
    if (method === "PATCH") {
      if (body?.amount != null) p.amount = amount(body.amount);
      if (body?.currency != null) p.currency = str(body.currency, 5).toUpperCase();
      if (body?.note != null) p.note = str(body.note, 300);
      save(db);
      return ok(out(p));
    }
    if (method === "DELETE") { db.payments = db.payments.filter((x) => x !== p); save(db); return ok({ ok: true }); }
  }

  /* ---- conversations / messages / files ---- */
  if (res === "conversations") {
    const mine = (convId) => {
      const conv = db.convs.find((c) => c.id === convId);
      const member = db.members.find((m) => m.conversation_id === convId && m.user_id === user.id);
      if (!conv || !member) fail(404, "conversation_not_found");
      return { conv, member };
    };
    if (!id && method === "GET") {
      const ids = db.members.filter((m) => m.user_id === user.id).map((m) => m.conversation_id);
      return ok({ items: db.convs.filter((c) => ids.includes(c.id)).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((c) => convOut(db, c, user.id)) });
    }
    if (!id && method === "POST") {
      const emails = (body?.emails || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean);
      if (!emails.length || emails.some((e) => !validEmail(e))) fail(422, "invalid_input");
      if (emails.includes(user.email)) fail(422, "cannot_message_self");
      // Local mode: unknown e-mails become local "placeholder people" (no live delivery to other devices).
      const targets = emails.map((email) => {
        let u = db.users.find((x) => x.email === email);
        if (!u) { u = { id: uid(), email, name: email.split("@")[0], locale: "ar", placeholder: true, created_at: nowIso() }; db.users.push(u); }
        return u;
      });
      const ids = [user.id, ...targets.map((t) => t.id)].sort();
      if (ids.length === 2) {
        for (const c of db.convs.filter((x) => !x.is_group)) {
          const m = memberIds(db, c.id).sort();
          if (m.length === 2 && m[0] === ids[0] && m[1] === ids[1]) return ok(convOut(db, c, user.id));
        }
      }
      const conv = { id: uid(), is_group: ids.length > 2, title: ids.length > 2 ? str(body?.title, 120) : "", created_at: nowIso() };
      db.convs.push(conv);
      for (const memberId of ids) db.members.push({ conversation_id: conv.id, user_id: memberId, last_read_at: null });
      save(db);
      return ok(convOut(db, conv, user.id));
    }
    const { conv, member } = mine(id);
    if (sub === "messages" && method === "GET") {
      const rows = db.messages.filter((m) => m.conversation_id === conv.id).slice(-200);
      return ok({ items: rows.map((m) => msgOut(db, m)) });
    }
    if (sub === "messages" && method === "POST") {
      const key = str(body?.client_key, 64);
      if (key.length < 8) fail(422, "invalid_input");
      const dup = db.messages.find((m) => m.conversation_id === conv.id && m.client_key === key);
      if (dup) return ok(msgOut(db, dup));
      let attachment = null;
      if (body?.file_id) {
        attachment = db.files.find((f) => f.id === body.file_id && f.owner_id === user.id && !f.message_id);
        if (!attachment) fail(422, "invalid_file");
      }
      const text = str(body?.body, 10000).trim();
      if (!text && !attachment) fail(422, "empty_message");
      const m = { id: uid(), conversation_id: conv.id, sender_id: user.id, body: text, kind: attachment ? attachment.kind : "text", client_key: key, created_at: nowIso() };
      db.messages.push(m);
      if (attachment) attachment.message_id = m.id;
      member.last_read_at = nowIso();
      save(db);
      return ok(msgOut(db, m));
    }
    if (sub === "read" && method === "POST") { member.last_read_at = nowIso(); save(db); return ok({ ok: true }); }
  }

  /* files are kept as base64 inside localStorage (small files only) */
  if (res === "files" && id === "upload" && method === "POST") {
    const kind = query.get("kind") === "voice" ? "voice" : "file";
    const file = body instanceof FormData ? body.get("file") : null;
    if (!file || typeof file === "string") fail(422, "missing_file");
    if (!file.size) fail(400, "empty_file");
    if (file.size > MAX_FILE_BYTES) fail(413, "file_too_large");
    const data = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject({ code: "invalid_file", status: 400 });
      r.readAsDataURL(file);
    });
    const f = { id: uid(), owner_id: user.id, name: str(file.name || "file", 200), size: file.size, mime: (file.type || "application/octet-stream").split(";")[0], kind, message_id: null, data };
    db.files.push(f);
    save(db);
    return ok({ file: { id: f.id, name: f.name, size: f.size, mime: f.mime, kind: f.kind, message_id: null } });
  }

  /* ---- AI (direct from the browser with the user's own key) ---- */
  if (res === "ai") {
    if (id === "chat" && method === "POST") {
      const content = str(body?.content, 8000).trim();
      if (!content) fail(422, "invalid_input");
      let conv = body?.conversation_id && db.aiConvs.find((c) => c.id === body.conversation_id && c.owner_id === user.id);
      if (body?.conversation_id && !conv) fail(404, "conversation_not_found");
      if (!conv) { conv = { id: uid(), owner_id: user.id, title: content.slice(0, 80), created_at: nowIso() }; db.aiConvs.push(conv); }
      const cfg = getAiConfig();
      if (!cfg) {
        db.aiMessages.push({ id: uid(), conversation_id: conv.id, role: "user", content, created_at: nowIso() });
        save(db);
        fail(503, "ai_not_configured");
      }
      const history = db.aiMessages.filter((m) => m.conversation_id === conv.id).slice(-20).map((m) => ({ role: m.role, content: m.content }));
      let answer;
      try {
        answer = await callModel(cfg.provider, cfg.apiKey, cfg.model, [...history, { role: "user", content }], 1024);
      } catch (e) {
        fail(502, e?.kind === "invalid_key" ? "ai_invalid_key" : "ai_provider_error");
      }
      db.aiMessages.push({ id: uid(), conversation_id: conv.id, role: "user", content, created_at: nowIso() });
      const reply = { id: uid(), conversation_id: conv.id, role: "assistant", content: answer, created_at: nowIso() };
      db.aiMessages.push(reply);
      save(db);
      return ok({ conversation_id: conv.id, reply: { id: reply.id, role: reply.role, content: reply.content, created_at: reply.created_at } });
    }
    if (id === "conversations" && !sub && method === "GET") {
      return ok({ items: own(db, "aiConvs", user).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((c) => ({ id: c.id, title: c.title || "…", created_at: c.created_at })) });
    }
    if (id === "conversations" && sub) {
      const c = findOwned(db, "aiConvs", user, sub, "conversation_not_found");
      if (method === "GET") return ok({ id: c.id, title: c.title, created_at: c.created_at, messages: db.aiMessages.filter((m) => m.conversation_id === c.id) });
      if (method === "DELETE") { db.aiConvs = db.aiConvs.filter((x) => x !== c); db.aiMessages = db.aiMessages.filter((m) => m.conversation_id !== c.id); save(db); return ok({ ok: true }); }
    }
  }

  /* ---- dashboard & insights (computed from local data only) ---- */
  if (path === "/dashboard" && method === "GET") {
    const convIds = db.members.filter((m) => m.user_id === user.id).map((m) => m.conversation_id);
    const recent = db.convs.filter((c) => convIds.includes(c.id)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5).map((c) => {
      const msgs = db.messages.filter((m) => m.conversation_id === c.id);
      const last = msgs[msgs.length - 1];
      const o = convOut(db, c, user.id);
      return { id: c.id, title: c.title || o.display_name, is_group: c.is_group, last_body: last ? last.body : "", last_at: last ? last.created_at : null };
    });
    const nowStr = nowIso();
    const tasks = own(db, "tasks", user);
    return ok({
      counts: {
        contacts: own(db, "contacts", user).length,
        tasks_open: tasks.filter((t) => t.status !== "done").length,
        tasks_done: tasks.filter((t) => t.status === "done").length,
        documents: own(db, "documents", user).length,
        conversations: convIds.length,
        messages_sent: db.messages.filter((m) => m.sender_id === user.id && convIds.includes(m.conversation_id)).length,
        ai_conversations: own(db, "aiConvs", user).length,
      },
      recent_conversations: recent,
      upcoming_events: own(db, "events", user).filter((e) => e.start_at >= nowStr).sort((a, b) => a.start_at.localeCompare(b.start_at)).slice(0, 5).map((e) => ({ id: e.id, title: e.title, start_at: e.start_at })),
    });
  }
  if (path === "/insights" && method === "GET") {
    const tasks = own(db, "tasks", user);
    const by_status = { todo: 0, doing: 0, done: 0 };
    const by_priority = { low: 0, medium: 0, high: 0 };
    tasks.forEach((t) => { by_status[t.status] = (by_status[t.status] || 0) + 1; by_priority[t.priority] = (by_priority[t.priority] || 0) + 1; });
    const convIds = db.members.filter((m) => m.user_id === user.id).map((m) => m.conversation_id);
    const msgs = db.messages.filter((m) => convIds.includes(m.conversation_id)).slice(-500);
    const per_weekday = [0, 0, 0, 0, 0, 0, 0]; // 0 = Monday (same as the server)
    msgs.forEach((m) => { per_weekday[(new Date(m.created_at + "Z").getUTCDay() + 6) % 7] += 1; });
    const payments = own(db, "payments", user);
    const totals = {};
    payments.forEach((p) => { totals[p.currency] = Math.round(((totals[p.currency] || 0) + p.amount) * 100) / 100; });
    return ok({
      tasks: { by_status, by_priority },
      messages: { recent_count: msgs.length, per_weekday },
      payments_total: totals,
      sample_sizes: { tasks: tasks.length, payments: payments.length },
    });
  }

  fail(404, "not_found");
}

/* Public entry used by api.js */
export async function localRequest(method, fullPath, body) {
  const [path, qs = ""] = fullPath.split("?");
  try {
    return await route(method, path, body, new URLSearchParams(qs));
  } catch (e) {
    if (e && typeof e === "object" && "code" in e) throw e;
    console.error("[local-backend]", e);
    throw { code: "unknown", status: 500 };
  }
}

/* Sync URL for stored attachments (blob URLs are cached; top-level data: URLs are blocked by browsers). */
const blobCache = {};
export function localFileUrl(fileId) {
  if (blobCache[fileId]) return blobCache[fileId];
  const f = load().files.find((x) => x.id === fileId);
  if (!f) return "";
  try {
    const [head, b64] = f.data.split(",");
    const mime = /data:([^;]+)/.exec(head)?.[1] || f.mime;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    blobCache[fileId] = URL.createObjectURL(new Blob([bytes], { type: mime }));
    return blobCache[fileId];
  } catch {
    return "";
  }
}
