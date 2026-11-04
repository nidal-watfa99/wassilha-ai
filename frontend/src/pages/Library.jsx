import React, { useState } from "react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { EmptyState } from "../components/UI";
import { IconBox, IconPlus, IconTrash } from "../components/Icons";
import { F, Grid, ltr } from "../components/Form";
import Summary from "../components/Summary";
import CurrencyPicker from "../components/CurrencyPicker";
import ItemPicker from "../components/ItemPicker";
import { Services, Generator, Reorder } from "./LibraryTools";
import { useBiz, upsert, update, uid, fmt, nextNo, todayStr, totals, stockLeft } from "../services/biz";
import { lineNeeds, saleCost, takeStock } from "../services/pos";
import { tierPrice } from "../services/distribution";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const L = ({ label, children }) => <div style={{ display: "grid", gap: 3 }}><small style={{ color: "var(--text-3)" }}>{label}</small>{children}</div>;

function printReceipt(inv, biz, t) {
  const tt = totals(inv), w = window.open("", "_blank"); if (!w) return false;
  const f = (n) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${esc(inv.no)}</title><style>body{width:280px;margin:6px auto;font-family:Arial,Tahoma,sans-serif;font-size:13px}h3{text-align:center;margin:4px 0}table{width:100%;border-collapse:collapse}td{padding:2px 0}.r{text-align:end}hr{border:0;border-top:1px dashed #000}.b{font-weight:700;font-size:15px}</style></head><body><h3>${esc(biz.name || "")}</h3><div style="text-align:center">${esc(inv.no)} · ${esc(inv.issueDate)}</div><hr><table>${inv.items.map((i) => `<tr><td>${esc(i.desc)}<br><small>${esc(i.qty)} × ${f(i.price)}</small></td><td class="r">${f(i.qty * i.price)}</td></tr>`).join("")}</table><hr><table><tr><td>${esc(t("inv_discAmt"))}</td><td class="r">${f(tt.disc)}</td></tr><tr><td>${esc(t("inv_taxAmt"))}</td><td class="r">${f(tt.tax)}</td></tr><tr class="b"><td>${esc(t("inv_total"))}</td><td class="r">${f(tt.total)} ${esc(inv.currency)}</td></tr><tr><td>${esc(t("inv_paidAmt"))}</td><td class="r">${f(inv.paidAmount || 0)}</td></tr></table><hr><div style="text-align:center">${esc(t("lb_thanks"))}</div><script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
  w.document.close(); return true;
}

function Pos() {
  const { t, toast } = useApp();
  const biz = useBiz(), cur = biz.currency;
  const [lines, setLines] = useState([]), [search, setSearch] = useState(""), [customer, setCustomer] = useState(""), [method, setMethod] = useState("cash"), [received, setReceived] = useState("");
  const [discount, setDiscount] = useState(0), [tax, setTax] = useState(biz.taxRate), [credit, setCredit] = useState(false), [currency, setCurrency] = useState(cur), [fx, setFx] = useState(""), [done, setDone] = useState(null), [contacts, setContacts] = useState([]);
  React.useEffect(() => { api.get("/contacts").then((d) => setContacts(d.items || [])).catch(() => {}); }, []);
  const fxN = currency === cur ? 1 : Number(fx) || biz.rates[currency] || 0;
  const setLn = (i, p) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const addItem = (it) => setLines((ls) => { const i = ls.findIndex((l) => l.kind === "item" && l.invId === it.id); return i >= 0 ? ls.map((l, k) => (k === i ? { ...l, qty: Number(l.qty) + 1 } : l)) : [...ls, { kind: "item", invId: it.id, name: it.name, qty: 1, unit: it.unit, price: fxN ? +(tierPrice(it, "retail") / fxN).toFixed(4) : "" }]; });
  const addSvc = (s) => setLines((ls) => [...ls, { kind: "service", svcId: s.id, name: s.name, qty: 1, unit: s.unitLabel || "", price: s.mode === "amount" ? "" : fxN ? +(Number(s.price) / fxN).toFixed(4) : "" }]);
  const reprice = () => setLines((ls) => ls.map((l) => { if (l.kind === "item") { const it = biz.inventory.find((i) => i.id === l.invId); return it && fxN ? { ...l, price: +(tierPrice(it, "retail") / fxN).toFixed(4) } : l; } const s = l.kind === "service" && biz.services.find((x) => x.id === l.svcId); return s && s.mode !== "amount" && fxN ? { ...l, price: +(Number(s.price) / fxN).toFixed(4) } : l; }));
  const tt = totals({ items: lines.map((l) => ({ qty: Number(l.qty) || 0, price: Number(l.price) || 0 })), discount, tax });
  const rec = Number(received) || 0, change = !credit && rec > tt.total ? rec - tt.total : 0;

  const complete = () => {
    if (!lines.length) return;
    if (!fxN) return toast(t("fx_missing"), "error");
    if (lines.some((l) => !String(l.name).trim() || l.price === "" || !(Number(l.qty) > 0))) return toast(t("lb_fillLines"), "error");
    if (credit && !customer.trim()) return toast(t("lb_needCustomer"), "error");
    if (!credit && rec > 0 && rec < tt.total - 0.005) return toast(t("lb_underpaid"), "error");
    const need = lineNeeds(lines, biz);
    for (const [id, q] of Object.entries(need)) { const it = biz.inventory.find((i) => i.id === id); if (it && stockLeft(it) < q - 1e-9) return toast(`${t("ds_noStock")}: ${it.name}`, "error"); }
    const paid = credit ? Math.min(rec, tt.total) : tt.total, no = nextNo("invoice");
    const inv = { id: uid(), no, type: "invoice", customer: customer.trim() || t("rs_walkin"), issueDate: todayStr(), dueDate: "", currency, fx: fxN, discount: Number(discount) || 0, tax: Number(tax) || 0, notes: "POS", paidAmount: paid, status: paid >= tt.total - 0.005 ? "paid" : paid > 0 ? "partial" : "unpaid", pos: true, method, cost: +saleCost(lines, biz, fxN).toFixed(2), items: lines.map((l) => ({ desc: l.name, qty: Number(l.qty), price: Number(l.price), unit: l.unit || "", kind: l.kind })) };
    update((s) => takeStock(s, need)); upsert("invoices", inv);
    setDone({ inv, change }); setLines([]); setReceived(""); setSearch(""); setCredit(false); setDiscount(0);
  };

  return (
    <>
      {done && (
        <div className="glass card" style={{ display: "grid", gap: "0.5rem", borderColor: "rgba(74,222,128,.5)" }}>
          <strong>✅ {t("lb_saleDone")} <bdi dir="ltr">{done.inv.no}</bdi></strong>
          <Summary cur={done.inv.currency} rows={[{ label: t("inv_total"), value: totals(done.inv).total, sub: true }, { label: t("inv_paidAmt"), value: done.inv.paidAmount, tone: "minus" }]} total={{ label: done.change > 0 ? t("lb_change") : t("inv_left"), value: done.change > 0 ? done.change : Math.max(totals(done.inv).total - done.inv.paidAmount, 0) }} />
          <div style={{ display: "flex", gap: "0.4rem" }}><button className="btn btn-ghost btn-sm" onClick={() => { if (!printReceipt(done.inv, biz, t)) toast(t("inv_printHint"), "error"); }}>🖨 {t("lb_receipt")}</button><button className="btn btn-ghost btn-sm" onClick={() => setDone(null)}>{t("ds_ok")}</button></div></div>)}
      <L label={t("ds_item")}><ItemPicker items={biz.inventory} value={search} placeholder={t("lb_scanPh")} onText={setSearch} onPick={(it) => { addItem(it); setSearch(""); }} /></L>
      {biz.services.length > 0 && <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>{biz.services.slice(0, 16).map((s) => <button key={s.id} type="button" className="btn btn-ghost btn-sm" onClick={() => addSvc(s)}>＋ {s.name}</button>)}</div>}
      {lines.length === 0 ? <EmptyState icon={<IconBox />} text={t("lb_emptyCart")} /> : lines.map((l, i) => (
        <div key={i} className="glass card" style={{ padding: "0.6rem", display: "grid", gap: "0.45rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center" }}>
            {l.kind === "free" ? <input className="input" placeholder={t("stk_name")} value={l.name} onChange={(e) => setLn(i, { name: e.target.value })} /> : <strong>{l.name} {l.kind === "service" && <span className="badge badge-violet">{t("lb_service")}</span>}</strong>}
            <button type="button" className="icon-btn" aria-label={t("delete")} onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}><IconTrash /></button></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <L label={l.unit ? `${t("inv_qty")} (${l.unit})` : t("inv_qty")}><input className="input" type="number" min="0" step="any" dir="ltr" value={l.qty} onChange={(e) => setLn(i, { qty: e.target.value })} /></L>
            <L label={`${biz.services.find((s) => s.id === l.svcId)?.mode === "amount" ? t("amount") : t("ds_unitPrice")} (${currency})`}><input className="input" type="number" min="0" step="any" dir="ltr" value={l.price} onChange={(e) => setLn(i, { price: e.target.value })} /></L></div>
          <b dir="ltr" style={{ textAlign: "end" }}>{fmt((Number(l.qty) || 0) * (Number(l.price) || 0))} {currency}</b></div>))}
      <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: "start" }} onClick={() => setLines((ls) => [...ls, { kind: "free", name: "", qty: 1, unit: "", price: "" }])}><IconPlus />{t("lb_freeLine")}</button>
      <Grid>
        <F label={t("ds_customer")}><input className="input" list="pc" value={customer} onChange={(e) => setCustomer(e.target.value)} /><datalist id="pc">{contacts.map((c) => <option key={c.id} value={c.name} />)}</datalist></F>
        <F label={t("ds_orderCur")}><CurrencyPicker value={currency} onChange={(v) => { setCurrency(v); setFx(v === cur ? "" : biz.rates[v] || ""); }} /></F>
        {currency !== cur && <F label={`1 ${currency} = ? ${cur}`}><input className="input" type="number" min="0" step="any" value={fx} onChange={(e) => setFx(e.target.value)} {...ltr} /></F>}
        <F label={t("inv_discount")}><input className="input" type="number" min="0" max="100" step="any" value={discount} onChange={(e) => setDiscount(e.target.value)} {...ltr} /></F>
        <F label={t("inv_tax")}><input className="input" type="number" min="0" max="100" step="any" value={tax} onChange={(e) => setTax(e.target.value)} {...ltr} /></F>
        <F label={t("rs_method")}><select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>{["cash", "card", "transfer", "wallet"].map((k) => <option key={k} value={k}>{t("exp_m_" + k)}</option>)}</select></F>
        <F label={`${t("lb_received")} (${currency})`}><input className="input" type="number" min="0" step="any" value={received} onChange={(e) => setReceived(e.target.value)} {...ltr} /></F>
      </Grid>
      {currency !== cur && <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: "start" }} onClick={reprice}>↻ {t("ds_reprice")}</button>}
      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "var(--text-sm)" }}><input type="checkbox" checked={credit} onChange={(e) => setCredit(e.target.checked)} /> {t("lb_credit")}</label>
      <Summary cur={currency} rows={[{ label: t("inv_sub"), value: tt.sub, sub: true }, { label: t("inv_discAmt"), value: tt.disc, tone: "minus" }, { label: t("inv_taxAmt"), value: tt.tax, tone: "plus" }, ...(change > 0 ? [{ label: t("lb_change"), value: change, tone: "muted" }] : [])]} total={{ label: t("inv_total"), value: tt.total }} />
      <button className="btn btn-primary" style={{ justifySelf: "stretch" }} disabled={!lines.length} onClick={complete}>{t("lb_complete")}</button>
    </>
  );
}

function Daily() {
  const { t } = useApp();
  const biz = useBiz(), cur = biz.currency;
  const [day, setDay] = useState(todayStr());
  const sales = biz.invoices.filter((i) => i.pos && i.issueDate === day), fxOf = (i) => Number(i.fx) || 1;
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const total = sum(sales, (i) => totals(i).total * fxOf(i)), taxAmt = sum(sales, (i) => totals(i).tax * fxOf(i)), net = total - taxAmt, cost = sum(sales, (i) => Number(i.cost) || 0);
  const byM = ["cash", "card", "transfer", "wallet"].map((m) => [m, sum(sales.filter((i) => i.method === m), (i) => (Number(i.paidAmount) || 0) * fxOf(i))]).filter(([, v]) => v > 0);
  const kindRev = (k) => sum(sales, (i) => sum(i.items.filter((x) => x.kind === k), (x) => x.qty * x.price) * fxOf(i));
  const owed = sum(sales, (i) => Math.max(totals(i).total - (Number(i.paidAmount) || 0), 0) * fxOf(i));
  const top = Object.entries(sales.flatMap((i) => i.items).reduce((m, x) => ((m[x.desc] = (m[x.desc] || 0) + Number(x.qty)), m), {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return (
    <>
      <input className="input" type="date" style={{ width: "auto" }} value={day} onChange={(e) => setDay(e.target.value || todayStr())} {...ltr} />
      {sales.length === 0 ? <EmptyState icon={<IconBox />} text={t("b_none")} /> : (<>
        <Summary cur={cur} title={`${t("lb_salesCount")}: ${sales.length}`} rows={[
          { head: t("lb_byMethod") }, ...byM.map(([m, v]) => ({ label: t("exp_m_" + m), value: v })),
          { label: t("lb_items"), value: kindRev("item") }, { label: t("lb_services2"), value: kindRev("service") },
          { label: t("st_sales") + " (" + t("lb_withTax") + ")", value: total, sub: true },
          { label: t("st_tax"), value: taxAmt, tone: "muted" }, { label: t("lb_costOfSales"), value: cost, tone: "minus" }, { label: t("lb_onCredit"), value: owed, tone: "muted" },
        ]} total={{ label: t("st_gross"), value: net - cost }} />
        {top.length > 0 && <div className="glass card"><strong>{t("rs_top")}</strong>{top.map(([n, q]) => <div key={n} style={{ display: "flex", justifyContent: "space-between" }}><span>{n}</span><b>{q}</b></div>)}</div>}
        <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{t("lb_dailyNote")}</p></>)}
    </>
  );
}

export default function Library() {
  const { t } = useApp();
  const [tab, setTab] = useState("pos");
  return (
    <div style={{ display: "grid", gap: "0.9rem" }}>
      <div className="section-title"><h2>{t("library")}</h2></div>
      <div className="tabs">{[["pos", "lb_pos"], ["services", "lb_services"], ["gen", "lb_gen"], ["reorder", "lb_reorder"], ["daily", "lb_daily"]].map(([k, l]) => <button key={k} className={`btn btn-sm ${tab === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(k)}>{t(l)}</button>)}</div>
      {tab === "pos" && <Pos />}{tab === "services" && <Services />}{tab === "gen" && <Generator />}{tab === "reorder" && <Reorder />}{tab === "daily" && <Daily />}
    </div>
  );
}
