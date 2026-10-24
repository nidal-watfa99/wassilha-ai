/* Business data store (browser-only for now): settings, employees, invoices, places.
   Stage 3 will replace the storage with a cloud database; the API below stays the same. */
import { useSyncExternalStore } from "react";

export const KEY = "wassilha_biz_v1";
export const MODULES = ["contacts", "messages", "ai", "tasks", "calendar", "documents", "insights", "products", "calculator", "employees", "invoices", "map", "inventory", "catalog"];

const PRESETS = {
  shop: ["contacts", "products", "catalog", "inventory", "invoices", "employees", "map", "tasks", "documents", "insights", "calculator", "ai"],
  contractor: ["contacts", "products", "catalog", "inventory", "invoices", "employees", "map", "tasks", "calendar", "documents", "insights", "calculator"],
  company: MODULES,
  tailor: ["contacts", "products", "catalog", "inventory", "invoices", "employees", "tasks", "calendar", "calculator", "insights", "map"],
  social: ["contacts", "employees", "tasks", "calendar", "documents", "insights", "map", "messages", "ai"],
  factory: MODULES,
  freelancer: ["contacts", "invoices", "tasks", "calendar", "documents", "ai", "calculator", "insights"],
  custom: MODULES,
};
export const TYPE_KEYS = Object.keys(PRESETS);

const TERMS = {
  shop: { ar: ["العملاء", "المنتجات"], en: ["Customers", "Products"] },
  contractor: { ar: ["العملاء", "الأعمال والبنود"], en: ["Clients", "Works & items"] },
  company: { ar: ["العملاء والشركاء", "المنتجات والخدمات"], en: ["Clients & partners", "Products & services"] },
  tailor: { ar: ["الزبائن", "الموديلات والخدمات"], en: ["Customers", "Models & services"] },
  social: { ar: ["المستفيدون", "البرامج والخدمات"], en: ["Beneficiaries", "Programs & services"] },
  factory: { ar: ["العملاء والموزعون", "المنتجات"], en: ["Clients & distributors", "Products"] },
  freelancer: { ar: ["العملاء", "الخدمات"], en: ["Clients", "Services"] },
  custom: { ar: ["جهات الاتصال", "المنتجات"], en: ["Contacts", "Products"] },
};

const DEFAULT = {
  configured: false, type: "custom", name: "", currency: "USD", taxRate: 0, reminderDays: 3,
  modules: {}, terms: {}, employees: [], invoices: [], places: [], inventory: [], catalog: [], seq: { invoice: 0, employee: 0, quote: 0 },
};

const mem = {};
function readRaw() { try { return localStorage.getItem(KEY) ?? mem[KEY] ?? null; } catch { return mem[KEY] ?? null; } }
function parse(raw) { try { return raw ? { ...DEFAULT, ...JSON.parse(raw), } : { ...DEFAULT }; } catch { return { ...DEFAULT }; } }

let state = parse(readRaw());
const subs = new Set();
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
function persist() {
  const raw = JSON.stringify(state);
  mem[KEY] = raw;
  try { localStorage.setItem(KEY, raw); } catch { /* storage blocked: memory only */ }
}
export function update(fn) { state = fn(state); persist(); subs.forEach((f) => f()); }
export const getBiz = () => state;
export const useBiz = () => useSyncExternalStore(subscribe, () => state);
export const isOn = (biz, k) => biz.modules[k] !== false;

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

export function upsert(coll, item) {
  update((s) => {
    const list = s[coll];
    const i = list.findIndex((x) => x.id === item.id);
    return { ...s, [coll]: i >= 0 ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list] };
  });
}
export function remove(coll, id) { update((s) => ({ ...s, [coll]: s[coll].filter((x) => x.id !== id) })); }

export function nextNo(kind) {
  let n = 0;
  update((s) => { n = (s.seq[kind] || 0) + 1; return { ...s, seq: { ...s.seq, [kind]: n } }; });
  const pre = { invoice: "INV", quote: "QUO", employee: "EMP" }[kind];
  return `${pre}-${String(n).padStart(4, "0")}`;
}

export function applyPreset(type, locale, { name, currency, taxRate }) {
  const on = PRESETS[type] || MODULES;
  const modules = Object.fromEntries(MODULES.map((m) => [m, on.includes(m)]));
  const tr = (TERMS[type] || TERMS.custom)[locale === "ar" ? "ar" : "en"];
  update((s) => ({
    ...s, configured: true, type, name, currency: currency || "USD", taxRate: Number(taxRate) || 0,
    modules, terms: { contacts: tr[0], products: tr[1] },
  }));
}

/* ---------- payroll ---------- */
export function payroll(e) {
  const adj = e.adj || [];
  const sum = (...k) => adj.filter((a) => k.includes(a.kind)).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const base = Number(e.salary) || 0, bonus = sum("bonus", "overtime"), adv = sum("advance"), pen = sum("penalty");
  const tax = base * ((Number(e.taxRate) || 0) / 100);
  const afterDed = base - adv - pen - tax;
  return { base, bonus, adv, pen, tax, afterDed, net: afterDed + bonus };
}
export function service(e) {
  if (!e.hireDate) return "";
  const a = new Date(e.hireDate), b = e.status === "ended" && e.contractEnd ? new Date(e.contractEnd) : new Date();
  let m = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() - (b.getDate() < a.getDate() ? 1 : 0);
  if (m < 0) m = 0;
  return `${Math.floor(m / 12)}y ${m % 12}m`;
}

/* ---------- inventory ---------- */
export const stockLeft = (i) => (Number(i.qtyIn) || 0) - (Number(i.qtyOut) || 0);
export const getLow = (biz) => biz.inventory.filter((i) => stockLeft(i) <= (Number(i.minQty) || 0));

/* ---------- invoices ---------- */
export const paidOf = (inv) => Math.min(Number(inv.paidAmount) || 0, totals(inv).total);
export const leftOf = (inv) => Math.max(totals(inv).total - paidOf(inv), 0);
export const todayStr = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export function totals(inv) {
  const sub = (inv.items || []).reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);
  const disc = sub * ((Number(inv.discount) || 0) / 100);
  const tax = (sub - disc) * ((Number(inv.tax) || 0) / 100);
  return { sub, disc, tax, total: sub - disc + tax };
}
export const fmt = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* unpaid invoices that are overdue or due within `reminderDays` */
export function getDue(biz) {
  const limit = new Date(); limit.setDate(limit.getDate() + (Number(biz.reminderDays) || 0));
  const lim = new Date(limit.getTime() - limit.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const today = todayStr();
  return biz.invoices
    .filter((i) => i.type === "invoice" && (i.status === "unpaid" || i.status === "partial") && i.dueDate && i.dueDate <= lim)
    .map((i) => ({ inv: i, overdue: i.dueDate < today }))
    .sort((a, b) => a.inv.dueDate.localeCompare(b.inv.dueDate));
}

/* ---------- backup ---------- */
const OTHER_KEYS = ["wassilha_local_db_v1", "wassilha_local_session_v1"];
export function exportBackup() {
  const data = { app: "wassilha", version: 1, at: new Date().toISOString(), biz: state, other: {} };
  OTHER_KEYS.forEach((k) => { try { const v = localStorage.getItem(k); if (v) data.other[k] = v; } catch { /* ignore */ } });
  return JSON.stringify(data);
}
export function importBackup(text) {
  const data = JSON.parse(text);
  if (data.app !== "wassilha" || !data.biz) throw new Error("bad");
  state = { ...DEFAULT, ...data.biz }; persist();
  Object.entries(data.other || {}).forEach(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } });
  subs.forEach((f) => f());
}
